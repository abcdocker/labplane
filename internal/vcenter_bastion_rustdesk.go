package internal

// 堡垒机 RustDesk 集成（自建 RustDesk Pro，如 wh.frps.cn:21114）：
// 1) 管理员在设置中配置服务器地址 + API 管理员账号（凭据加密存 PlatformKV）；
// 2) 平台定期/按需调用 Pro API /api/login + /api/peers 自动发现已注册主机；
// 3) 侧栏双入口：rustdesk:// 深链唤起客户端 + Pro Web 控制台（/_admin/）在线连接。

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const platformKVKeyRustDeskServer = "labplane_rustdesk_server_v1"

// RustDeskServerConfig 自建 RustDesk Pro 服务器与 API 管理员账号。
type RustDeskServerConfig struct {
	BaseURL  string `json:"baseUrl"`            // 如 http://wh.frps.cn:21114（无尾斜杠）
	Username string `json:"username"`           // Pro Web 控制台管理员账号
	PasswordEnc string `json:"passwordEnc"`    // AES 加密后的密码
	WebAdminPath string `json:"webAdminPath"` // 默认 /_admin/
}

func loadRustDeskServer(kv PlatformKV) RustDeskServerConfig {
	var c RustDeskServerConfig
	if kv == nil {
		return c
	}
	raw, ok := kv.Get(platformKVKeyRustDeskServer)
	if !ok || strings.TrimSpace(raw) == "" {
		return c
	}
	_ = json.Unmarshal([]byte(raw), &c)
	c.BaseURL = strings.TrimRight(strings.TrimSpace(c.BaseURL), "/")
	if strings.TrimSpace(c.WebAdminPath) == "" {
		c.WebAdminPath = "/_admin/"
	}
	return c
}

func saveRustDeskServer(kv PlatformKV, c RustDeskServerConfig) error {
	raw, err := json.Marshal(&c)
	if err != nil {
		return err
	}
	return kv.Set(platformKVKeyRustDeskServer, string(raw))
}

// rustDeskAPIToken 用管理员账号换取 Pro API token（POST /api/login）。
func rustDeskAPIToken(cfg RustDeskServerConfig, encKey []byte) (string, error) {
	password := cfg.PasswordEnc
	if dec, err := decryptSecret(encKey, cfg.PasswordEnc); err == nil && dec != "" {
		password = dec
	}
	body, _ := json.Marshal(map[string]string{"username": cfg.Username, "password": password})
	req, err := http.NewRequest(http.MethodPost, cfg.BaseURL+"/api/login", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var lr struct {
		AccessToken string `json:"access_token"`
		Msg         string `json:"msg"`
		Error       string `json:"error"`
		Code        int    `json:"code"`
	}
	if err := json.Unmarshal(data, &lr); err != nil {
		return "", fmt.Errorf("登录响应解析失败: %s", strings.TrimSpace(string(data))[:min(len(data), 120)])
	}
	if lr.AccessToken != "" {
		return lr.AccessToken, nil
	}
	if lr.Error != "" {
		return "", fmt.Errorf("登录失败: %s", lr.Error)
	}
	return "", fmt.Errorf("登录失败: code=%d %s", lr.Code, lr.Msg)
}

type rustDeskPeer struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Online   bool   `json:"online"`
	User     string `json:"user"`
	Hostname string `json:"hostname"`
	IP       string `json:"ip"`
}

// rustDeskListPeers 拉取全部已注册设备（GET /api/peers?page=1&pageSize=N）。
func rustDeskListPeers(cfg RustDeskServerConfig, token string) ([]rustDeskPeer, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	var all []rustDeskPeer
	for page := 1; page <= 50; page++ {
		u := cfg.BaseURL + "/api/peers?page=" + strconvItoa(page) + "&pageSize=100"
		req, err := http.NewRequest(http.MethodGet, u, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("peers HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(data))[:min(len(data), 120)])
		}
		var rows []rustDeskPeer
		raw := data
		// Pro 各版本形状：{result:[...]} 或 {data:[...]} 或直接数组——统一按数组提取
		var probe interface{}
		if err := json.Unmarshal(raw, &probe); err == nil {
			rows = rustDeskExtractPeers(probe)
		}
		if len(rows) == 0 {
			break
		}
		all = append(all, rows...)
		if len(rows) < 100 {
			break
		}
	}
	return all, nil
}

func rustDeskExtractPeers(node interface{}) []rustDeskPeer {
	var out []rustDeskPeer
	raw, err := json.Marshal(node)
	if err != nil {
		return nil
	}
	// 数组直接解析
	var arr []rustDeskPeer
	if err := json.Unmarshal(raw, &arr); err == nil {
		for _, p := range arr {
			if strings.TrimSpace(p.ID) != "" {
				out = append(out, p)
			}
		}
		return out
	}
	// 对象包裹（result/data/peers/info 等键）
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return out
	}
	for _, k := range []string{"result", "data", "peers", "info"} {
		if v, ok := m[k]; ok {
			return append(out, rustDeskExtractPeers(v)...)
		}
	}
	return out
}

func strconvItoa(n int) string {
	return fmt.Sprintf("%d", n)
}

var (
	rustdeskPeersMu     sync.Mutex
	rustdeskPeersCached []rustDeskPeer
	rustdeskPeersAt     time.Time
)

// handleGetBastionRustDeskHosts GET /api/vcenter/bastion/rustdesk
// 静态清单（策略 rustdeskHosts 手工配置）+ 自动发现（Pro API peers）合并返回。
func handleGetBastionRustDeskHosts(c *gin.Context, app *ServerApp) {
	pol := loadVCenterBastionPolicy(app.PlatformKV())
	hosts := pol.RustDeskHosts
	if hosts == nil {
		hosts = []BastionRustDeskHost{}
	}
	c.JSON(http.StatusOK, gin.H{"hosts": hosts})
}

// handleRustDeskServerGet GET /api/vcenter/bastion/rustdesk/server（AdminOnly，密码不回显）
func handleRustDeskServerGet(c *gin.Context, app *ServerApp) {
	cfg := loadRustDeskServer(app.PlatformKV())
	c.JSON(http.StatusOK, gin.H{
		"baseUrl":   cfg.BaseURL,
		"username":  cfg.Username,
		"configured": cfg.BaseURL != "" && cfg.Username != "" && cfg.PasswordEnc != "",
		"webAdminPath": cfg.WebAdminPath,
	})
}

// handleRustDeskServerPut PUT /api/vcenter/bastion/rustdesk/server（AdminOnly）
// body: {baseUrl, username, password?}（password 空表示保留原值）
func handleRustDeskServerPut(c *gin.Context, app *ServerApp) {
	var body struct {
		BaseURL  string `json:"baseUrl"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
		return
	}
	base := strings.TrimRight(strings.TrimSpace(body.BaseURL), "/")
	if base == "" || (!strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://")) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "baseUrl 须以 http:// 或 https:// 开头"})
		return
	}
	if u, err := url.Parse(base); err != nil || u.Hostname() == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "baseUrl 无效"})
		return
	}
	if strings.TrimSpace(body.Username) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username 不能为空"})
		return
	}
	key, kerr := sshEncryptionKey(app.Cfg())
	if kerr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "LABPLANE_ENCRYPTION_KEY: " + kerr.Error()})
		return
	}
	cfg := loadRustDeskServer(app.PlatformKV())
	cfg.BaseURL = base
	cfg.Username = strings.TrimSpace(body.Username)
	if strings.TrimSpace(body.Password) != "" {
		enc, eerr := encryptSecret(key, body.Password)
		if eerr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": eerr.Error()})
			return
		}
		cfg.PasswordEnc = enc
	}
	if cfg.PasswordEnc == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password 不能为空（首次配置）"})
		return
	}
	if err := saveRustDeskServer(app.PlatformKV(), cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// 保存后立刻验证并刷新主机缓存
	token, terr := rustDeskAPIToken(cfg, key)
	if terr != nil {
		c.JSON(http.StatusOK, gin.H{"ok": true, "probeError": terr.Error()})
		return
	}
	if peers, perr := rustDeskListPeers(cfg, token); perr == nil {
		rustdeskPeersMu.Lock()
		rustdeskPeersCached = peers
		rustdeskPeersAt = time.Now()
		rustdeskPeersMu.Unlock()
		c.JSON(http.StatusOK, gin.H{"ok": true, "peers": len(peers)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// handleRustDeskPeers GET /api/vcenter/bastion/rustdesk/peers
// 自动发现主机清单（全部堡垒机用户可见；带 5 分钟缓存，避免每次拉 Pro API）。
func handleRustDeskPeers(c *gin.Context, app *ServerApp) {
	rustdeskPeersMu.Lock()
	if rustdeskPeersCached != nil && time.Since(rustdeskPeersAt) < 5*time.Minute {
		peers := rustdeskPeersCached
		rustdeskPeersMu.Unlock()
		c.JSON(http.StatusOK, gin.H{"peers": peers, "cached": true})
		return
	}
	rustdeskPeersMu.Unlock()

	cfg := loadRustDeskServer(app.PlatformKV())
	if cfg.BaseURL == "" || cfg.PasswordEnc == "" {
		c.JSON(http.StatusOK, gin.H{"peers": []rustDeskPeer{}, "notConfigured": true})
		return
	}
	key, kerr := sshEncryptionKey(app.Cfg())
	if kerr != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": kerr.Error()})
		return
	}
	token, terr := rustDeskAPIToken(cfg, key)
	if terr != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "RustDesk 登录失败: " + terr.Error()})
		return
	}
	peers, perr := rustDeskListPeers(cfg, token)
	if perr != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "拉取主机列表失败: " + perr.Error()})
		return
	}
	rustdeskPeersMu.Lock()
	rustdeskPeersCached = peers
	rustdeskPeersAt = time.Now()
	rustdeskPeersMu.Unlock()
	c.JSON(http.StatusOK, gin.H{"peers": peers})
}
