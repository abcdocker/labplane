package internal

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/object"
	"github.com/vmware/govmomi/vim25/soap"
	"github.com/vmware/govmomi/vim25/types"
)

var consoleUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 8192,
	CheckOrigin: func(r *http.Request) bool {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin == "" {
			return true
		}
		u, err := url.Parse(origin)
		return err == nil && strings.EqualFold(u.Host, r.Host)
	},
}

func webMKSTicketURL(ticket *types.VirtualMachineTicket) (string, error) {
	if ticket == nil {
		return "", fmt.Errorf("WebMKS 票据为空")
	}
	if raw := strings.TrimSpace(ticket.Url); raw != "" {
		u, err := url.Parse(raw)
		if err != nil || (u.Scheme != "wss" && u.Scheme != "ws") || u.Host == "" {
			return "", fmt.Errorf("vCenter 返回的 WebMKS URL 无效")
		}
		return u.String(), nil
	}
	host := strings.TrimSpace(ticket.Host)
	if host == "" || strings.TrimSpace(ticket.Ticket) == "" {
		return "", fmt.Errorf("vCenter 返回的 WebMKS 票据缺少主机或 ticket")
	}
	port := ticket.Port
	if port == 0 {
		port = 443
	}
	address := net.JoinHostPort(strings.Trim(host, "[]"), strconv.Itoa(int(port)))
	return fmt.Sprintf("wss://%s/ticket/%s", address, url.PathEscape(ticket.Ticket)), nil
}

func webMKSTicketURLForDial(ticket *types.VirtualMachineTicket, consoleHost string) (string, error) {
	raw, err := webMKSTicketURL(ticket)
	if err != nil {
		return "", err
	}
	override := strings.TrimSpace(consoleHost)
	if override == "" {
		return raw, nil
	}

	parseValue := override
	if !strings.Contains(parseValue, "://") {
		parseValue = "//" + parseValue
	}
	target, err := url.Parse(parseValue)
	if err != nil || target.Hostname() == "" || target.User != nil ||
		(target.Path != "" && target.Path != "/") || target.RawQuery != "" || target.Fragment != "" {
		return "", fmt.Errorf("ESXi 控制台地址无效，请填写 IP、主机名或 host:port")
	}

	out, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("vCenter 返回的 WebMKS URL 无效")
	}
	host := target.Hostname()
	port := target.Port()
	if port == "" {
		port = out.Port()
	}
	if port != "" {
		out.Host = net.JoinHostPort(host, port)
	} else if strings.Contains(host, ":") {
		out.Host = "[" + strings.Trim(host, "[]") + "]"
	} else {
		out.Host = host
	}
	return out.String(), nil
}

func webMKSConsoleDialTarget(ticket *types.VirtualMachineTicket, consoleHost, legacyProxyURL string) (string, string, error) {
	// legacyProxyURL 故意不参与 URL 选择：/ui/webmks 属于 vSphere Client，
	// 需要浏览器 SSO 会话。保留参数仅用于兼容已持久化的旧配置并防止它再次接管链路。
	_ = legacyProxyURL
	target, err := webMKSTicketURLForDial(ticket, consoleHost)
	if err != nil {
		return "", "", err
	}
	// ESXi Host Client 的实现同样不使用票据 Url 里的主机名，而是把当前
	// ESXi 地址与 /ticket/{ticket} 组合。这里直接改写 WebSocket URL，
	// 使 HTTP Host、TLS 目标和 TCP 地址保持一致，避免陈旧 DNS 名触发网关路由错误。
	return target, "", nil
}

func webMKSUpstreamHeaders(wssURL string) http.Header {
	headers := make(http.Header)
	u, err := url.Parse(wssURL)
	if err == nil && u.Host != "" {
		scheme := "https"
		if u.Scheme == "ws" {
			scheme = "http"
		}
		// 浏览器版 WMKS 会自动携带页面 Origin；服务端代理需要显式补上。
		headers.Set("Origin", scheme+"://"+u.Host)
	}
	headers.Set("User-Agent", "Mozilla/5.0 kube-bt-sync WebMKS proxy")
	return headers
}

// webMKSProxyURL 根据用户配置的模板拼接出自定义 WebMKS 拨号 URL。
// template 中 {moid} 替换为 moref（如 vm-2037），{ticket} 替换为 vCenter 签的 WebMKS ticket 字符串。
// 用于绕过 Pod → ESXi 路径上的透明 NGINX/Envoy（让 vCenter 自己代理 console 流量）。
func webMKSProxyURL(template, moref string, ticket *types.VirtualMachineTicket) (string, error) {
	template = strings.TrimSpace(template)
	if template == "" {
		return "", fmt.Errorf("WebMKS 代理 URL 模板为空")
	}
	if ticket == nil {
		return "", fmt.Errorf("WebMKS 票据为空，无法拼接代理 URL")
	}
	u, err := url.Parse(template)
	if err != nil {
		return "", fmt.Errorf("WebMKS 代理 URL 模板解析失败: %w", err)
	}
	if u.Scheme != "wss" && u.Scheme != "ws" {
		return "", fmt.Errorf("WebMKS 代理 URL 必须以 wss:// 或 ws:// 开头")
	}
	if u.Host == "" {
		return "", fmt.Errorf("WebMKS 代理 URL 缺少主机名")
	}
	out := template
	out = strings.ReplaceAll(out, "{moid}", url.PathEscape(strings.TrimSpace(moref)))
	out = strings.ReplaceAll(out, "{ticket}", url.QueryEscape(strings.TrimSpace(ticket.Ticket)))
	if _, err := url.Parse(out); err != nil {
		return "", fmt.Errorf("WebMKS 代理 URL 替换占位符后解析失败: %w", err)
	}
	return out, nil
}

// acquireVCenterRESTSession 通过 vCenter REST API /api/session 登录拿到 session id，
// 用于把 vmware_soap_session cookie 塞进 WebMKS 代理（/ui/webmks/）的 WebSocket 升级请求，
// 绕过 vCenter 对未登录请求返回 401 + HTML 登录页的问题。仅当使用 WebMKS 代理 URL 模板时调用。
//
// vSphere 7+ 的 /api/session 仅接受 HTTP Basic Auth（6.x 时代的 JSON body 在很多部署里被禁用，
// 会返回 error_type=UNAUTHENTICATED / id=authentication.required）。先尝试 Basic Auth，
// 失败时回退到 JSON body，最大限度兼容旧版本。
func acquireVCenterRESTSession(ctx context.Context, cfg Config) (string, error) {
	base := strings.TrimRight(strings.TrimSpace(cfg.VCenterURL), "/")
	if base == "" {
		return "", fmt.Errorf("vCenter URL 未配置")
	}
	if strings.TrimSpace(cfg.VCenterUser) == "" || cfg.VCenterPassword == "" {
		return "", fmt.Errorf("vCenter 用户名或密码未配置")
	}
	endpoint := base + "/api/session"

	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: cfg.VCenterInsecure, //nolint:gosec // 用户显式配置
			MinVersion:         tls.VersionTLS12,
		},
	}
	client := &http.Client{Timeout: 15 * time.Second, Transport: transport}
	defer transport.CloseIdleConnections()

	// 1) 优先 HTTP Basic Auth（vSphere 7+/8+ 的标准方式）
	id, err := postVCenterSession(ctx, client, endpoint, func(req *http.Request) {
		req.SetBasicAuth(cfg.VCenterUser, cfg.VCenterPassword)
		req.Header.Set("Accept", "application/json")
	})
	if err == nil {
		return id, nil
	}
	basicAuthErr := err

	// 2) 回退 JSON body（兼容 vSphere 6.x 或未启用 Basic Auth 的环境）
	payload, mErr := json.Marshal(map[string]string{
		"username": cfg.VCenterUser,
		"password": cfg.VCenterPassword,
	})
	if mErr != nil {
		return "", fmt.Errorf("编码 vCenter 登录请求失败: %w", mErr)
	}
	id, err = postVCenterSession(ctx, client, endpoint, func(req *http.Request) {
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		req.Body = io.NopCloser(bytes.NewReader(payload))
		req.ContentLength = int64(len(payload))
	})
	if err == nil {
		return id, nil
	}
	// 两种都失败时把 Basic Auth 失败原因也带出来，方便定位是凭据错还是认证方式不支持
	return "", fmt.Errorf("vCenter 登录失败（Basic Auth: %v; JSON body: %v）", basicAuthErr, err)
}

func postVCenterSession(ctx context.Context, client *http.Client, endpoint string, decorate func(*http.Request)) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("构造 vCenter 登录请求失败: %w", err)
	}
	if decorate != nil {
		decorate(req)
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("vCenter 登录请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取 vCenter 登录响应失败: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(body))
		if len(msg) > 240 {
			msg = msg[:240] + "...(truncated)"
		}
		// 移除换行/制表，避免单行日志被切碎
		msg = strings.Map(func(r rune) rune {
			if r == '\n' || r == '\r' || r == '\t' || r == 0 {
				return ' '
			}
			return r
		}, msg)
		return "", fmt.Errorf("vCenter 登录返回 %d: %s", resp.StatusCode, msg)
	}

	// 优先从 Set-Cookie 里抓 vmware_soap_session（vSphere 7+ 部分部署会带），回退到 body。
	if cookieHeader := resp.Header.Values("Set-Cookie"); len(cookieHeader) > 0 {
		for _, raw := range cookieHeader {
			for _, part := range strings.Split(raw, ";") {
				part = strings.TrimSpace(part)
				if strings.HasPrefix(part, "vmware_soap_session=") {
					value := strings.TrimPrefix(part, "vmware_soap_session=")
					if id := strings.TrimSpace(value); id != "" {
						return id, nil
					}
				}
			}
		}
	}

	// vSphere 7+ 的 /api/session 响应体是裸 JSON 字符串（例如 "abc123"），
	// 而不是 JSON 对象 {id: ...}。先尝试字符串解析，再回退到对象解析（vSphere 6.x 兼容）。
	trimmed := strings.TrimSpace(string(body))
	if strings.HasPrefix(trimmed, "\"") && strings.HasSuffix(trimmed, "\"") {
		var plainID string
		if err := json.Unmarshal(body, &plainID); err == nil {
			if id := strings.TrimSpace(plainID); id != "" {
				return id, nil
			}
		}
	}

	var session struct {
		ID    string `json:"id"`
		Value string `json:"value"`
	}
	if err := json.Unmarshal(body, &session); err != nil {
		return "", fmt.Errorf("解析 vCenter 登录响应失败: %w", err)
	}
	sessionID := strings.TrimSpace(session.ID)
	if sessionID == "" {
		sessionID = strings.TrimSpace(session.Value)
	}
	if sessionID == "" {
		return "", fmt.Errorf("vCenter 登录响应缺少 session id")
	}
	return sessionID, nil
}

func webMKSTicketThumbprints(ticket *types.VirtualMachineTicket) []string {
	out := make([]string, 0, len(ticket.CertThumbprintList)+1)
	for _, item := range ticket.CertThumbprintList {
		if value := strings.TrimSpace(item.Thumbprint); value != "" {
			out = append(out, value)
		}
	}
	if value := strings.TrimSpace(ticket.SslThumbprint); value != "" {
		out = append(out, value)
	}
	return out
}

func webMKSCertificateMatches(cert *x509.Certificate, expected []string) bool {
	sha1Value := soap.ThumbprintSHA1(cert)
	sha256Value := soap.ThumbprintSHA256(cert)
	for _, value := range expected {
		if strings.EqualFold(strings.TrimSpace(value), sha1Value) ||
			strings.EqualFold(strings.TrimSpace(value), sha256Value) {
			return true
		}
	}
	return false
}

func webMKSTLSConfig(ticket *types.VirtualMachineTicket, insecure bool) *tls.Config {
	host := strings.TrimSpace(ticket.Host)
	expected := webMKSTicketThumbprints(ticket)
	if insecure {
		return &tls.Config{InsecureSkipVerify: true, MinVersion: tls.VersionTLS12} //nolint:gosec // 用户显式配置
	}
	if len(expected) == 0 {
		return &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}
	}
	return &tls.Config{
		InsecureSkipVerify: true, //nolint:gosec // 下方使用 vCenter 票据携带的证书指纹校验
		MinVersion:         tls.VersionTLS12,
		VerifyConnection: func(state tls.ConnectionState) error {
			if len(state.PeerCertificates) == 0 {
				return fmt.Errorf("ESXi WebMKS 未返回服务器证书")
			}
			if !webMKSCertificateMatches(state.PeerCertificates[0], expected) {
				return fmt.Errorf("ESXi WebMKS 证书指纹与 vCenter 票据不匹配")
			}
			return nil
		},
	}
}

func sanitizeWebMKSError(err error, ticket *types.VirtualMachineTicket) string {
	if err == nil {
		return ""
	}
	message := err.Error()
	if ticket != nil {
		for _, secret := range []string{ticket.Ticket, ticket.CfgFile, ticket.Url} {
			if value := strings.TrimSpace(secret); value != "" {
				message = strings.ReplaceAll(message, value, "[已脱敏]")
			}
		}
	}
	message = strings.Map(func(r rune) rune {
		if r == '\n' || r == '\r' || r == '\t' || r == 0 {
			return ' '
		}
		return r
	}, message)
	return strings.TrimSpace(message)
}

func truncateWebSocketCloseReason(message string) string {
	const maxBytes = 123 // WebSocket close control frame payload is limited to 125 bytes, including the 2-byte code.
	if len(message) <= maxBytes {
		return message
	}
	message = message[:maxBytes]
	for !utf8.ValidString(message) {
		message = message[:len(message)-1]
	}
	return message
}

// describeUpstreamResponse 把 gorilla/websocket 在 handshake 失败时缓存的
// *http.Response（最多 1024 字节 body）格式化成一行可读日志。用于 ESXi WebMKS
// 端点返回非 101 响应（如 200 HTML 重定向、401/403/503）时定位根因。
// 先剥掉 <script>/<style>/<head> 和所有标签，只保留可见文本，避免 vCenter
// 错误页里的 CSS head 把日志配额占满、看不到真正的错误原因。
func describeUpstreamResponse(resp *http.Response, ticket *types.VirtualMachineTicket) string {
	if resp == nil {
		return ""
	}
	var b strings.Builder
	fmt.Fprintf(&b, "status=%d", resp.StatusCode)
	if resp.Body == nil {
		return b.String()
	}
	body, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	raw := strings.TrimSpace(string(body))
	if raw == "" {
		return b.String()
	}
	bodyStr := sanitizeWebMKSError(fmt.Errorf("%s", raw), ticket)
	bodyStr = strings.TrimSpace(bodyStr)
	bodyStr = stripHTMLForLog(bodyStr)
	bodyStr = strings.TrimSpace(bodyStr)
	if bodyStr != "" {
		const maxBody = 800
		if len(bodyStr) > maxBody {
			bodyStr = bodyStr[:maxBody] + "...(truncated)"
		}
		fmt.Fprintf(&b, " body=%q", bodyStr)
	}
	return b.String()
}

var (
	htmlScriptRe = regexp.MustCompile(`(?is)<script\b[^>]*>.*?(?:</script>|$)`)
	htmlStyleRe  = regexp.MustCompile(`(?is)<style\b[^>]*>.*?(?:</style>|$)`)
	htmlTagRe    = regexp.MustCompile(`<[^>]+>`)
	htmlWSRe     = regexp.MustCompile(`\s+`)
)

// stripHTMLForLog 去掉 <script>/<style> 块与全部 HTML 标签，用于从 vCenter 的
// HTML 错误页里抠出真正的可见错误文本。style/script 的终止标签可选（?:`</style>|$`），
// 因为 gorilla/websocket 默认只缓存握手失败响应的前 1024 字节，遇到几百 KB 的 CSS
// 时 `</style>` 经常被截断；不放开可选就会让整个 style 块里的 CSS 全部漏出来。
// 仅供日志展示，不可用来构造响应给浏览器（不会做实体解码、不会处理 <noscript> 之类）。
func stripHTMLForLog(s string) string {
	if s == "" {
		return s
	}
	s = htmlScriptRe.ReplaceAllString(s, " ")
	s = htmlStyleRe.ReplaceAllString(s, " ")
	s = htmlTagRe.ReplaceAllString(s, " ")
	s = htmlWSRe.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

// probeVCenterWebMKSEndpoint 在 WebSocket 拨号之前，用普通 HTTP GET 探测
// 同一个 /ui/webmks/ URL。gorilla/websocket 握手失败时只缓存响应前 1024 字节，
// vCenter 错误页的 CSS 头经常就把这 1024 字节占满，让我们看不到真正的拒绝原因
// （权限、token、CSRF、IP 白名单等）。GET 没有这个限制，可以拿到完整 HTML 正文。
// 仅做诊断；无论探测结果如何，最终都会走 WebSocket 拨号。
func probeVCenterWebMKSEndpoint(ctx context.Context, cfg Config, wssURL, sessionID string, ticket *types.VirtualMachineTicket) (int, string, error) {
	u, err := url.Parse(wssURL)
	if err != nil {
		return 0, "", err
	}
	scheme := "https"
	if u.Scheme == "ws" {
		scheme = "http"
	}
	httpURL := scheme + "://" + u.Host + u.RequestURI()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, httpURL, nil)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Cookie", "vmware_soap_session="+sessionID+"; vmware-api-session-id="+sessionID)
	req.Header.Set("vmware-api-session-id", sessionID)
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; vSphere-Client-WebMKS)")
	req.Header.Set("Origin", scheme+"://"+u.Host)
	req.Header.Set("Referer", scheme+"://"+u.Host+"/")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Pragma", "no-cache")
	// 探测也带上 Basic Auth 头部，便于日志对比「仅 cookie」与「cookie+Basic Auth」
	// 哪个能过 vCenter H5 反代的认证层。
	if username := strings.TrimSpace(cfg.VCenterUser); username != "" {
		if password := cfg.VCenterPassword; password != "" {
			token := base64.StdEncoding.EncodeToString([]byte(username + ":" + password))
			req.Header.Set("Authorization", "Basic "+token)
		}
	}

	transport := &http.Transport{
		TLSClientConfig: webMKSTLSConfig(ticket, cfg.VCenterInsecure),
	}
	client := &http.Client{
		Timeout:   8 * time.Second,
		Transport: transport,
	}
	defer transport.CloseIdleConnections()

	resp, err := client.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8*1024))
	bodyStr := sanitizeWebMKSError(fmt.Errorf("%s", strings.TrimSpace(string(body))), ticket)
	bodyStr = stripHTMLForLog(bodyStr)
	bodyStr = strings.TrimSpace(bodyStr)
	return resp.StatusCode, bodyStr, nil
}

// probeVCenterSessionCookie 用 REST 会话 cookie 去 GET /api/session，
// 用来区分「cookie 没被 vCenter 接受」与「cookie 有效但 /ui/webmks/ 反代拒绝」。
// 200 + 返回当前 session 信息 = cookie 完全可用。
// 401 = cookie 没到 vCenter（FRP 透传失败 / 域不匹配 / session 被立刻吊销）。
func probeVCenterSessionCookie(ctx context.Context, cfg Config, sessionID string) (int, string, error) {
	base, err := vcenterAPIBaseURL(cfg)
	if err != nil {
		return 0, "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/api/session", nil)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Cookie", "vmware_soap_session="+sessionID+"; vmware-api-session-id="+sessionID)
	req.Header.Set("vmware-api-session-id", sessionID)
	req.Header.Set("Accept", "application/json")
	// 探测 /api/session 不需要模拟浏览器，所以不塞 UA/Origin/Referer，避免引入噪音
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: cfg.VCenterInsecure, MinVersion: tls.VersionTLS12}, //nolint:gosec // 用户显式配置
	}
	client := &http.Client{Timeout: 8 * time.Second, Transport: transport}
	defer transport.CloseIdleConnections()

	resp, err := client.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4*1024))
	bodyStr := strings.TrimSpace(string(body))
	return resp.StatusCode, bodyStr, nil
}

// vcenterAPIBaseURL 把 VCenterURL 规整成 https://host:port[/sdk] 这种 REST API 根，
// 用于探测 /api/session。如果用户配置的是 https://vcenter.example.com/sdk，这里会得到
// https://vcenter.example.com/sdk；如果只是 https://vcenter.example.com，得到的就是它本身。
func vcenterAPIBaseURL(cfg Config) (string, error) {
	raw := strings.TrimSpace(cfg.VCenterURL)
	if raw == "" {
		return "", fmt.Errorf("vCenter URL 未配置")
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("vCenter URL 解析失败: %w", err)
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return "", fmt.Errorf("vCenter URL 协议必须是 http 或 https")
	}
	return u.Scheme + "://" + u.Host + u.Path, nil
}

// sanitizeURLForLog 在日志中遮蔽 wssURL 里的 ticket 凭据，便于排查 dial 目标。
func sanitizeURLForLog(raw string, ticket *types.VirtualMachineTicket) string {
	if ticket == nil || raw == "" {
		return raw
	}
	out := raw
	for _, secret := range []string{ticket.Ticket, ticket.CfgFile} {
		if value := strings.TrimSpace(secret); value != "" {
			out = strings.ReplaceAll(out, value, "[已脱敏]")
		}
	}
	return out
}

func closeWebMKSBrowser(conn *websocket.Conn, message string) {
	reason := truncateWebSocketCloseReason(strings.TrimSpace(message))
	_ = conn.WriteControl(
		websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseInternalServerErr, reason),
		time.Now().Add(2*time.Second),
	)
}

// sessionHostForLog 提取 vCenter 配置 URL 的主机部分，便于排查 session 跨域问题。
// 例如 "https://cmdb.example.com/sdk" → "cmdb.example.com"。
func sessionHostForLog(cfg Config) string {
	raw := strings.TrimSpace(cfg.VCenterURL)
	if raw == "" {
		return ""
	}
	if !strings.Contains(raw, "://") {
		raw = "//" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return raw
	}
	return u.Hostname()
}

// sessionIDPrefix 取 session id 前 8 个字符打印，避免完整泄露。
func sessionIDPrefix(id string) string {
	id = strings.TrimSpace(id)
	if len(id) <= 8 {
		return id
	}
	return id[:8] + "..."
}

func handleVCenterConsoleWS(c *gin.Context, vc *vCenterClient, app *ServerApp) {
	if !vc.cfg.vCenterConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vCenter 未配置"})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	if vcenterBastionAbortIfForbidden(c, app, moref) {
		return
	}

	log.Printf("vcenter console: 收到内部 WebMKS 连接请求 moref=%s", moref)
	conn, err := consoleUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("vcenter console: 浏览器 WebSocket 升级失败 moref=%s error=%v", moref, err)
		return
	}
	defer conn.Close()
	log.Printf("vcenter console: 浏览器 WebSocket 已升级 moref=%s", moref)

	doneKA := make(chan struct{})
	defer close(doneKA)
	startWebSocketBastionKeepalive(conn, doneKA)

	ctx := c.Request.Context()
	var ticket *types.VirtualMachineTicket
	err = vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
		vm := object.NewVirtualMachine(client.Client, types.ManagedObjectReference{Type: "VirtualMachine", Value: moref})
		state, e := vm.PowerState(ctx)
		if e != nil {
			return e
		}
		if state != types.VirtualMachinePowerStatePoweredOn {
			return fmt.Errorf("虚拟机需处于开机状态才能打开 WebMKS 控制台")
		}
		t, e := vm.AcquireTicket(ctx, string(types.VirtualMachineTicketTypeWebmks))
		if e != nil {
			return fmt.Errorf("获取 WebMKS 票据失败: %w", e)
		}
		ticket = t
		return nil
	})
	if err != nil {
		message := sanitizeWebMKSError(err, ticket)
		log.Printf("vcenter console: WebMKS 票据申请失败 moref=%s error=%s", moref, message)
		closeWebMKSBrowser(conn, message)
		return
	}
	log.Printf("vcenter console: WebMKS ticket 已签发 moref=%s esxi_host=%s port=%d has_url=%t",
		moref, ticket.Host, ticket.Port, strings.TrimSpace(ticket.Url) != "")

	// WebMKS ticket 已包含真正的 ESXi WebSocket 端点。浏览器只连接本站，
	// 平台后端再直连 ESXi；vCenter /ui/webmks 属于 vSphere Client UI，
	// 依赖 SSO Cookie，不能作为服务端控制台代理。
	proxyTemplate := strings.TrimSpace(vc.cfg.VCenterConsoleProxyURL)
	if proxyTemplate != "" {
		log.Printf("vcenter console: 已忽略废弃的 WebMKS 代理 URL 模板 moref=%s", moref)
	}
	wssURL, dialAddress, err := webMKSConsoleDialTarget(ticket, vc.cfg.VCenterConsoleHost, proxyTemplate)
	if err != nil {
		message := sanitizeWebMKSError(err, ticket)
		log.Printf("vcenter console: WebMKS 票据无效 moref=%s error=%s", moref, message)
		closeWebMKSBrowser(conn, message)
		return
	}
	dialTarget, _ := url.Parse(wssURL)
	ticketURLHost := dialTarget.Hostname()
	dialHost := ticketURLHost
	if dialAddress != "" {
		if host, _, splitErr := net.SplitHostPort(dialAddress); splitErr == nil {
			dialHost = host
		}
	}
	if override := strings.TrimSpace(vc.cfg.VCenterConsoleHost); override != "" {
		log.Printf("vcenter console: 使用 ESXi TCP 拨号地址覆盖 moref=%s ticket_host=%s ticket_url_host=%s dial_host=%s",
			moref, ticket.Host, ticketURLHost, dialHost)
	}

	netDialer := &net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}
	dialer := websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
		TLSClientConfig:  webMKSTLSConfig(ticket, vc.cfg.VCenterInsecure),
		// VMware WMKS SDK 固定以 ["binary"] 建立连接；缺少该子协议时
		// ESXi 不会进入 MKS/RFB 数据通道。
		Subprotocols: []string{"binary"},
		NetDialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			if dialAddress != "" {
				address = dialAddress
			}
			return netDialer.DialContext(ctx, network, address)
		},
	}
	remote, wsResp, err := dialer.Dial(wssURL, webMKSUpstreamHeaders(wssURL))
	if err != nil {
		upstream := describeUpstreamResponse(wsResp, ticket)
		message := sanitizeWebMKSError(err, ticket)
		log.Printf("vcenter console: 连接 ESXi WebMKS 失败 moref=%s esxi_host=%s dial_host=%s wss_url=%s error=%s upstream=%s",
			moref, ticket.Host, dialHost, sanitizeURLForLog(wssURL, ticket), message, upstream)
		closeReason := "连接 ESXi WebMKS 失败：" + message
		if upstream != "" {
			closeReason += "（" + upstream + "）"
		}
		closeWebMKSBrowser(conn, closeReason)
		return
	}
	defer remote.Close()
	log.Printf("vcenter console: ESXi WebMKS 已连接 moref=%s esxi_host=%s dial_host=%s", moref, ticket.Host, dialHost)

	errCh := make(chan error, 2)
	copyFrames := func(dst, src *websocket.Conn) {
		for {
			mt, data, err := src.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
			if err := dst.WriteMessage(mt, data); err != nil {
				errCh <- err
				return
			}
		}
	}
	go copyFrames(remote, conn)
	go copyFrames(conn, remote)

	// 任一方向退出时立即关闭两端，解除另一方向阻塞，避免控制台断线后 goroutine 永久等待。
	relayErr := <-errCh
	log.Printf("vcenter console: WebMKS 会话结束 moref=%s error=%s", moref, sanitizeWebMKSError(relayErr, ticket))
	_ = conn.Close()
	_ = remote.Close()
}
