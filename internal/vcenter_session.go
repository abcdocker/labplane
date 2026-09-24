package internal

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/vim25/methods"
)

// vCenter SOAP 客户端（进程内单例缓存；会话失效时 Reset 后重试）
type vCenterClient struct {
	mu     sync.Mutex
	cfg    Config
	client *govmomi.Client
}

func newVCenterClient(cfg Config) *vCenterClient {
	return &vCenterClient{cfg: cfg}
}

func (c Config) vCenterConfigured() bool {
	return strings.TrimSpace(c.VCenterURL) != "" &&
		strings.TrimSpace(c.VCenterUser) != "" &&
		c.VCenterPassword != ""
}

// VCenterRuntimeCredentialsPresent 已填写 URL 与用户（密码可能尚未写入会话，用于前端区分「未填」与「未连上」）。
func VCenterRuntimeCredentialsPresent(c Config) bool {
	return strings.TrimSpace(c.VCenterURL) != "" && strings.TrimSpace(c.VCenterUser) != ""
}

// vCenterVMSshConfigured 是否已配置页面 SSH 终端（用户 + 私钥或密码）。
func (c Config) vCenterVMSshConfigured() bool {
	if strings.TrimSpace(c.VCenterVMSshUser) == "" {
		return false
	}
	hasAuth := strings.TrimSpace(c.VCenterVMSshPrivateKeyPath) != "" || c.VCenterVMSshPassword != ""
	hasHostTrust := c.VCenterVMSshInsecureHostKey || strings.TrimSpace(c.VCenterVMSshHostKeyFingerprint) != ""
	return hasAuth && hasHostTrust
}

func (v *vCenterClient) Reset() {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.client == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	_ = v.client.Logout(ctx)
	cancel()
	v.client = nil
}

func (v *vCenterClient) getClient(ctx context.Context) (*govmomi.Client, error) {
	if !v.cfg.vCenterConfigured() {
		return nil, fmt.Errorf("未配置 vCenter（需 VCENTER_URL / VCENTER_USER / VCENTER_PASSWORD）")
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.client != nil {
		return v.client, nil
	}
	u, err := vcenterSDKURL(v.cfg)
	if err != nil {
		return nil, err
	}
	c, err := govmomi.NewClient(ctx, u, v.cfg.VCenterInsecure)
	if err != nil {
		return nil, err
	}
	v.client = c
	return v.client, nil
}

func vcenterSDKURL(cfg Config) (*url.URL, error) {
	raw := strings.TrimSpace(cfg.VCenterURL)
	if raw == "" {
		return nil, fmt.Errorf("VCENTER_URL 为空")
	}
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	if u.Path == "" || u.Path == "/" {
		u.Path = "/sdk"
	}
	u.User = url.UserPassword(strings.TrimSpace(cfg.VCenterUser), cfg.VCenterPassword)
	return u, nil
}

// vcenterSessionExpired 判断 SOAP 错误是否为会话过期（缓存的 client 需 Logout/丢弃后重登）。
func vcenterSessionExpired(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "NotAuthenticated") ||
		strings.Contains(s, "not authenticated") ||
		(strings.Contains(s, "SessionManager") && strings.Contains(s, "authenticated"))
}

// WithClientRetry 在 NotAuthenticated 等会话失效时 Reset 并重登后重试 fn 一次。
func (v *vCenterClient) WithClientRetry(ctx context.Context, fn func(*govmomi.Client) error) error {
	c, err := v.getClient(ctx)
	if err != nil {
		return err
	}
	err = fn(c)
	if err != nil && vcenterSessionExpired(err) {
		v.Reset()
		c2, err2 := v.getClient(ctx)
		if err2 != nil {
			return fmt.Errorf("%w（会话已过期，重新登录失败: %v）", err, err2)
		}
		return fn(c2)
	}
	return err
}

// PingSession 轻量 SOAP 往返，用于后台保活；失败时打日志（WithClientRetry 会尝试重连）。
func (v *vCenterClient) PingSession(ctx context.Context) {
	if !v.cfg.vCenterConfigured() {
		return
	}
	err := v.WithClientRetry(ctx, func(c *govmomi.Client) error {
		_, e := methods.GetCurrentTime(ctx, c.Client)
		return e
	})
	if err != nil {
		log.Printf("vCenter 会话保活失败: %v", err)
	}
}

// StartVCenterSessionKeepalive 周期性 Ping vCenter，降低长时间空闲后首请求 NotAuthenticated 的概率。
// 环境变量 VCENTER_KEEPALIVE_INTERVAL_SEC：间隔秒数，默认 240；设为 0 可关闭。
func StartVCenterSessionKeepalive(getApp func() *ServerApp) {
	sec := 240
	if s := strings.TrimSpace(os.Getenv("VCENTER_KEEPALIVE_INTERVAL_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil {
			sec = n
		}
	}
	if sec <= 0 {
		return
	}
	interval := time.Duration(sec) * time.Second
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			app := getApp()
			if app == nil {
				continue
			}
			vc := app.VCenter()
			if vc == nil || !vc.cfg.vCenterConfigured() {
				continue
			}
			pctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
			vc.PingSession(pctx)
			cancel()
		}
	}()
}
