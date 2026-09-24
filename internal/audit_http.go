package internal

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

func requestIDForAudit(c *gin.Context) string {
	id := strings.TrimSpace(c.GetHeader("X-Request-ID"))
	if len(id) > 0 && len(id) <= 128 {
		valid := true
		for _, r := range id {
			if !(r == '-' || r == '_' || r == '.' || r >= '0' && r <= '9' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z') {
				valid = false
				break
			}
		}
		if valid {
			return id
		}
	}
	var raw [12]byte
	if _, err := rand.Read(raw[:]); err == nil {
		return hex.EncodeToString(raw[:])
	}
	return hex.EncodeToString([]byte(time.Now().UTC().Format("150405.000000")))
}

// trustedNetsCache 与 Gin SetTrustedProxies 使用同一套 CIDR 字符串，供审计时判断「是否来自可信代理」。
type trustedNetsCache struct {
	mu   sync.Mutex
	raw  string
	nets []*net.IPNet
}

var auditTrustedNets trustedNetsCache

func parseTrustedProxyStrings(s string) ([]string, []*net.IPNet) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, nil
	}
	parts := strings.Split(s, ",")
	outStr := make([]string, 0, len(parts))
	nets := make([]*net.IPNet, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		cidr := p
		if !strings.Contains(cidr, "/") {
			ip := net.ParseIP(cidr)
			if ip == nil {
				continue
			}
			if ip.To4() != nil {
				cidr += "/32"
			} else {
				cidr += "/128"
			}
		}
		_, n, err := net.ParseCIDR(cidr)
		if err != nil {
			continue
		}
		outStr = append(outStr, cidr)
		nets = append(nets, n)
	}
	return outStr, nets
}

func trustedNetsForConfig(cfg Config) []*net.IPNet {
	s := strings.TrimSpace(cfg.DashboardTrustedProxies)
	auditTrustedNets.mu.Lock()
	defer auditTrustedNets.mu.Unlock()
	if s == auditTrustedNets.raw {
		return auditTrustedNets.nets
	}
	_, nets := parseTrustedProxyStrings(s)
	auditTrustedNets.raw = s
	auditTrustedNets.nets = nets
	return nets
}

func remoteTCPAddrIP(r *http.Request) net.IP {
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err != nil {
		host = r.RemoteAddr
	}
	return net.ParseIP(host)
}

func ipInNets(ip net.IP, nets []*net.IPNet) bool {
	if ip == nil || len(nets) == 0 {
		return false
	}
	for _, n := range nets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// parseSingleIPHeader 返回首个合法单 IP（CDN / 反代常用，不含逗号链）。
func parseSingleIPHeader(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	// 部分实现会写 "client, proxy"
	if i := strings.IndexByte(v, ','); i >= 0 {
		v = strings.TrimSpace(v[:i])
	}
	ip := net.ParseIP(v)
	if ip == nil {
		return ""
	}
	return ip.String()
}

// AuditClientIP 用于审计：在配置 DASHBOARD_TRUSTED_PROXIES 时信任 X-Forwarded-For（由 Gin 解析）；
// 当直连来源属于可信网段时，优先采用 CDN / 反代注入的头（避免仅依赖 XFF 链）。
func AuditClientIP(c *gin.Context, cfg Config) string {
	nets := trustedNetsForConfig(cfg)
	remote := remoteTCPAddrIP(c.Request)
	trusted := ipInNets(remote, nets)

	if trusted {
		// Cloudflare → 源站；仅在来自 CF 等可信跳时采用（需把对应出口网段写入 DASHBOARD_TRUSTED_PROXIES）
		if s := parseSingleIPHeader(c.GetHeader("CF-Connecting-IP")); s != "" {
			return s
		}
		// Akamai / Azure CDN 等
		if s := parseSingleIPHeader(c.GetHeader("True-Client-IP")); s != "" {
			return s
		}
	}
	// Gin 在 SetTrustedProxies 与 ForwardedByClientIP 下解析 X-Forwarded-For、X-Real-IP
	return c.ClientIP()
}

// configureGinTrustedProxies：gin.Default() 默认信任 0.0.0.0/0，易被伪造 XFF；此处默认改为不信任，仅当配置 env 后启用。
func isPrometheusQueryAuditPath(path string) bool {
	p := strings.TrimSpace(path)
	return strings.HasPrefix(p, "/api/prometheus/query") // /query 与 /query_range
}

func configureGinTrustedProxies(r *gin.Engine, cfg Config) {
	list, _ := parseTrustedProxyStrings(cfg.DashboardTrustedProxies)
	if len(list) == 0 {
		if err := r.SetTrustedProxies(nil); err != nil {
			log.Printf("audit: SetTrustedProxies(nil): %v", err)
		}
		return
	}
	if err := r.SetTrustedProxies(list); err != nil {
		log.Printf("audit: DASHBOARD_TRUSTED_PROXIES 无效，将不信任代理: %v", err)
		_ = r.SetTrustedProxies(nil)
	}
}

// shouldPersistAPIAudit 仅将「写操作」写入 audit.jsonl，避免把大量 GET 查询刷满文件。
// 登录/登出/登录失败仍由 auth 等处理器单独 AppendAuditRecord。
func shouldPersistAPIAudit(c *gin.Context) bool {
	path := c.Request.URL.Path
	if !strings.HasPrefix(path, "/api/") {
		return false
	}
	// PromQL 查询为高频自动化请求，不写入审计文件、不出现在通知铃铛
	if isPrometheusQueryAuditPath(path) {
		return false
	}
	switch path {
	case "/api/health", "/api/setup/status", "/api/auth/status",
		"/api/auth/login", "/api/auth/logout":
		return false
	default:
	}
	switch strings.ToUpper(c.Request.Method) {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

func auditAccessLogMiddleware(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		requestID := requestIDForAudit(c)
		c.Set("requestID", requestID)
		c.Header("X-Request-ID", requestID)
		start := time.Now()
		c.Next()
		path := c.Request.URL.Path
		ip := AuditClientIP(c, cfg)
		ms := time.Since(start).Milliseconds()
		user := "-"
		if value, ok := c.Get("dashboardUser"); ok {
			if current, ok := value.(string); ok && strings.TrimSpace(current) != "" {
				user = current
			}
		} else if cfg.DashboardAuthEnabled() {
			if u, ok := sessionUserFromCookie(c, cfg, app); ok && strings.TrimSpace(u) != "" {
				user = u
			}
		}
		route := c.FullPath()
		if route == "" {
			route = path
		}
		if strings.HasPrefix(path, "/api/") || path == "/" || strings.HasPrefix(path, "/account") || strings.HasPrefix(path, "/cluster") || strings.HasPrefix(path, "/login") || strings.HasPrefix(path, "/setup") {
			RecordSiteAccess(route, ip)
		}
		auditSecurityProbeIfNeeded(c, app)
		if cfg.DashboardAccessLog {
			log.Printf("access request_id=%s ip=%s user=%s method=%s route=%s status=%d duration_ms=%d",
				requestID, ip, user, c.Request.Method, route, c.Writer.Status(), ms)
		}
		if shouldPersistAPIAudit(c) {
			detail := ""
			if v, ok := c.Get(ginAuditDetailKey); ok {
				if s, ok := v.(string); ok {
					detail = strings.TrimSpace(s)
				}
			}
			rec := AuditRecord{
				Action:     "api",
				IP:         ip,
				User:       user,
				Method:     c.Request.Method,
				Path:       route,
				Status:     c.Writer.Status(),
				DurationMs: ms,
				Detail:     detail,
			}
			EnqueueAuditRecord(app, rec)
		}
	}
}

func auditSecurityProbeIfNeeded(c *gin.Context, app *ServerApp) {
	if app == nil {
		return
	}
	cfg := app.Cfg()
	ip := AuditClientIP(c, cfg)
	raw := c.Request.URL.Path
	if q := c.Request.URL.RawQuery; q != "" {
		raw = raw + "?" + q
	}
	lower := strings.ToLower(raw)
	patterns := []string{
		"union select", "or 1=1", "' or ", "1;drop", "sleep(", "benchmark(",
		"information_schema", "/etc/passwd", "..%2f", "..%5c", "cmd.exe", "wget%20", "curl%20",
		"select%20", "insert%20", "drop%20table", "exec(", "script>",
	}
	for _, p := range patterns {
		if strings.Contains(lower, p) {
			EnqueueAuditRecord(app, AuditRecord{
				Action: "security_probe",
				IP:     ip,
				Method: c.Request.Method,
				Path:   c.Request.URL.Path,
				Status: c.Writer.Status(),
				Detail: "疑似扫描或注入探测: " + p,
			})
			return
		}
	}
}
