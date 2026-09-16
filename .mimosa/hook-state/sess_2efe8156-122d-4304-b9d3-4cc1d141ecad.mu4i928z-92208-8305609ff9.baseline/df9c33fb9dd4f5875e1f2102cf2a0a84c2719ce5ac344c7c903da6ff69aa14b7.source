package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const hostEgressStateFile = "host-egress.json"

// HostEgressState 持久化在 dataDir，供进程重启后仍能提示「未读」变更。
type HostEgressState struct {
	CurrentIP     string     `json:"currentIp"`
	PreviousIP    string     `json:"previousIp,omitempty"`
	LastCheckedAt *time.Time `json:"lastCheckedAt,omitempty"`
	LastChangeAt  *time.Time `json:"lastChangeAt,omitempty"`
	UnreadChange  bool       `json:"unreadChange"`
}

var hostEgressMu sync.Mutex

func hostEgressDisabled() bool {
	v := strings.TrimSpace(os.Getenv("KUBEBT_EGRESS_CHECK_DISABLED"))
	return v == "1" || strings.EqualFold(v, "true")
}

func hostEgressCheckInterval() time.Duration {
	sec := 300
	if s := strings.TrimSpace(os.Getenv("KUBEBT_EGRESS_CHECK_INTERVAL_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 60 {
			sec = n
		}
	}
	return time.Duration(sec) * time.Second
}

func hostEgressIPURL() string {
	u := strings.TrimSpace(os.Getenv("KUBEBT_EGRESS_IP_URL"))
	if u != "" {
		return u
	}
	// 默认使用 ip.sb IPv4 纯文本接口（国内/多运营商环境较易成功；仍可用 KUBEBT_EGRESS_IP_URL 覆盖）
	return "https://api-ipv4.ip.sb/ip"
}

func loadHostEgressState(dataDir string) (HostEgressState, error) {
	path := filepath.Join(dataDir, hostEgressStateFile)
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return HostEgressState{}, nil
		}
		return HostEgressState{}, err
	}
	var st HostEgressState
	if err := json.Unmarshal(b, &st); err != nil {
		return HostEgressState{}, err
	}
	return st, nil
}

func saveHostEgressState(dataDir string, st HostEgressState) error {
	path := filepath.Join(dataDir, hostEgressStateFile)
	b, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0600)
}

// fetchPublicIPv4 通过公网 HTTP 服务探测本机出口 IP（宿主机/容器 NAT 后对外地址）。
func fetchPublicIPv4(ctx context.Context) (string, error) {
	url := hostEgressIPURL()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "kube-bt-sync/host-egress")
	req.Header.Set("Accept", "text/plain, application/json;q=0.9, */*;q=0.8")
	client := &http.Client{Timeout: 12 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return "", err
	}
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d", res.StatusCode)
	}
	s := strings.TrimSpace(string(body))
	if strings.HasPrefix(strings.TrimSpace(s), "{") {
		var j struct {
			IP string `json:"ip"`
		}
		if json.Unmarshal(body, &j) == nil && strings.TrimSpace(j.IP) != "" {
			return strings.TrimSpace(j.IP), nil
		}
	}
	return strings.TrimSpace(s), nil
}

// RunHostEgressCheckOnce 拉取出口 IP 并更新状态文件；IP 变化时置 unreadChange。
// 网络请求在持锁外完成，避免阻塞其它 API 对状态的读取。
func RunHostEgressCheckOnce(app *ServerApp) {
	if hostEgressDisabled() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	ip, err := fetchPublicIPv4(ctx)
	now := time.Now().UTC()
	if err != nil {
		log.Printf("host egress: 探测出口 IP 失败: %v", err)
		return
	}

	hostEgressMu.Lock()
	defer hostEgressMu.Unlock()

	st, err := loadHostEgressState(app.DataDir())
	if err != nil {
		log.Printf("host egress: 读状态失败: %v", err)
		return
	}

	st.LastCheckedAt = &now
	prev := strings.TrimSpace(st.CurrentIP)
	if prev != "" && prev != ip {
		st.PreviousIP = prev
		t := now
		st.LastChangeAt = &t
		st.UnreadChange = true
		log.Printf("host egress: 出口 IP 变更 %s -> %s", prev, ip)
	}
	st.CurrentIP = ip

	if err := saveHostEgressState(app.DataDir(), st); err != nil {
		log.Printf("host egress: 写状态失败: %v", err)
	}
}

// StartHostEgressWatcher 后台定期探测宿主机出口 IP。
func StartHostEgressWatcher(app *ServerApp) {
	if hostEgressDisabled() {
		log.Println("host egress: 已禁用（KUBEBT_EGRESS_CHECK_DISABLED）")
		return
	}
	d := hostEgressCheckInterval()
	go func() {
		time.Sleep(15 * time.Second)
		RunHostEgressCheckOnce(app)
		ticker := time.NewTicker(d)
		defer ticker.Stop()
		for range ticker.C {
			RunHostEgressCheckOnce(app)
		}
	}()
	log.Printf("host egress: 已启动，间隔 %v，探测 URL 可用 KUBEBT_EGRESS_IP_URL 覆盖", d)
}

func handleHostEgressNotification(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		hostEgressMu.Lock()
		defer hostEgressMu.Unlock()
		st, err := loadHostEgressState(app.DataDir())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		sec, _ := LoadSecurityLoginAlertUnified(app)
		remote, _ := loadRemoteLoginAlertUnified(app)
		adminBan, _ := loadAdminIpBanAlertUnified(app)
		c.JSON(http.StatusOK, gin.H{
			"checkEnabled":  !hostEgressDisabled(),
			"currentIp":     st.CurrentIP,
			"previousIp":    st.PreviousIP,
			"lastChangeAt":  st.LastChangeAt,
			"lastCheckedAt": st.LastCheckedAt,
			"unreadChange":  st.UnreadChange,
			"securityLoginUnread": sec.Unread,
			"securityLoginMessage": sec.Message,
			"securityLoginLastAt":  sec.LastAt,
			"remoteLoginUnread":     remote.Unread,
			"remoteLoginMessage":    remote.Message,
			"remoteLoginLastAt":     remote.LastAt,
			"remoteLoginUser":       remote.User,
			"remoteLoginPreviousIp": remote.PreviousIP,
			"remoteLoginCurrentIp":  remote.CurrentIP,
			"adminIpBanUnread":      adminBan.Unread,
			"adminIpBanMessage":     adminBan.Message,
			"adminIpBanLastAt":      adminBan.LastAt,
			"adminIpBanSourceIp":    adminBan.SourceIP,
			"adminIpBanUntil":       adminBan.BanUntil,
		})
	}
}

func handleRemoteLoginAlertRead(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		st, err := loadRemoteLoginAlertUnified(app)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		st.Unread = false
		if err := saveRemoteLoginAlertUnified(app, st); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func handleAdminIpBanAlertRead(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		st, err := loadAdminIpBanAlertUnified(app)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		st.Unread = false
		if err := saveAdminIpBanAlertUnified(app, st); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func handleHostEgressNotificationRead(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		hostEgressMu.Lock()
		defer hostEgressMu.Unlock()
		st, err := loadHostEgressState(app.DataDir())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		st.UnreadChange = false
		if err := saveHostEgressState(app.DataDir(), st); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}
