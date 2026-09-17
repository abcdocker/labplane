package internal

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	lastLoginIPFileName    = "login-last-ip.json"
	remoteLoginAlertFile   = "remote-login-alert.json"
	adminIpBanAlertFile    = "admin-ip-ban-alert.json"
	kvKeyLastLoginIP       = "kubebt_login_last_ip_v1"
	kvKeyRemoteLoginAlert  = "kubebt_remote_login_alert"
	kvKeyAdminIpBanAlert   = "kubebt_admin_ip_ban_alert"
)

// LastLoginIPMap 用户名 → 上次成功登录 IP（用于异地登录提示）。
type LastLoginIPMap struct {
	Entries map[string]string `json:"entries"`
}

// RemoteLoginAlertState 铃铛：与上次成功登录 IP 不一致时提示。
type RemoteLoginAlertState struct {
	Unread     bool      `json:"unread"`
	Message    string    `json:"message,omitempty"`
	LastAt     time.Time `json:"lastAt,omitempty"`
	User       string    `json:"user,omitempty"`
	PreviousIP string    `json:"previousIp,omitempty"`
	CurrentIP  string    `json:"currentIp,omitempty"`
}

// AdminIpBanAlertState 铃铛：admin 密码连续错误导致 IP 临时封禁。
type AdminIpBanAlertState struct {
	Unread    bool      `json:"unread"`
	Message   string    `json:"message,omitempty"`
	LastAt    time.Time `json:"lastAt,omitempty"`
	SourceIP  string    `json:"sourceIp,omitempty"`
	BanUntil  time.Time `json:"banUntil,omitempty"`
}

var lastLoginMu sync.Mutex

func loadLastLoginMap(app *ServerApp) (map[string]string, error) {
	if app != nil {
		if kv := app.PlatformKV(); kv != nil {
			if raw, ok := kv.Get(kvKeyLastLoginIP); ok && strings.TrimSpace(raw) != "" {
				var m LastLoginIPMap
				if err := json.Unmarshal([]byte(raw), &m); err == nil && m.Entries != nil {
					return m.Entries, nil
				}
			}
		}
	}
	dataDir := ""
	if app != nil {
		dataDir = app.DataDir()
	}
	path := filepath.Join(dataDir, lastLoginIPFileName)
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]string{}, nil
		}
		return nil, err
	}
	var m LastLoginIPMap
	if err := json.Unmarshal(b, &m); err != nil {
		return map[string]string{}, nil
	}
	if m.Entries == nil {
		return map[string]string{}, nil
	}
	return m.Entries, nil
}

func saveLastLoginMap(app *ServerApp, m map[string]string) {
	if app == nil {
		return
	}
	raw, err := json.Marshal(LastLoginIPMap{Entries: m})
	if err != nil {
		return
	}
	path := filepath.Join(app.DataDir(), lastLoginIPFileName)
	if err := os.WriteFile(path, raw, 0600); err != nil {
		log.Printf("login last ip: write: %v", err)
	}
	if kv := app.PlatformKV(); kv != nil {
		if err := kv.Set(kvKeyLastLoginIP, string(raw)); err != nil {
			log.Printf("login last ip: kv: %v", err)
		}
	}
}

// OnPasswordLoginSuccess 在本地密码 / MySQL 密码登录成功后调用：更新上次 IP，必要时写入异地登录铃铛。
func OnPasswordLoginSuccess(app *ServerApp, username, ip string) {
	u := strings.TrimSpace(username)
	ip = strings.TrimSpace(ip)
	if app == nil || u == "" || ip == "" {
		return
	}
	lastLoginMu.Lock()
	defer lastLoginMu.Unlock()
	m, err := loadLastLoginMap(app)
	if err != nil {
		m = map[string]string{}
	}
	prev := strings.TrimSpace(m[u])
	m[u] = ip
	saveLastLoginMap(app, m)

	if prev != "" && prev != ip {
		st := RemoteLoginAlertState{
			Unread:     true,
			User:       u,
			PreviousIP: prev,
			CurrentIP:  ip,
			LastAt:     time.Now().UTC(),
			Message:    "用户 " + u + " 本次登录 IP（" + ip + "）与上次成功登录（" + prev + "）不一致，请确认是否为本人操作。",
		}
		_ = saveRemoteLoginAlertUnified(app, st)
	}
}

func loadRemoteLoginAlertUnified(app *ServerApp) (RemoteLoginAlertState, error) {
	if app == nil {
		return RemoteLoginAlertState{}, nil
	}
	if kv := app.PlatformKV(); kv != nil {
		if raw, ok := kv.Get(kvKeyRemoteLoginAlert); ok && strings.TrimSpace(raw) != "" {
			var st RemoteLoginAlertState
			if err := json.Unmarshal([]byte(raw), &st); err == nil {
				return st, nil
			}
		}
	}
	path := filepath.Join(app.DataDir(), remoteLoginAlertFile)
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return RemoteLoginAlertState{}, nil
		}
		return RemoteLoginAlertState{}, err
	}
	var st RemoteLoginAlertState
	if err := json.Unmarshal(b, &st); err != nil {
		return RemoteLoginAlertState{}, err
	}
	return st, nil
}

func saveRemoteLoginAlertUnified(app *ServerApp, st RemoteLoginAlertState) error {
	if app == nil {
		return nil
	}
	b, err := json.Marshal(st)
	if err != nil {
		return err
	}
	path := filepath.Join(app.DataDir(), remoteLoginAlertFile)
	if err := os.WriteFile(path, b, 0600); err != nil {
		return err
	}
	if kv := app.PlatformKV(); kv != nil {
		_ = kv.Set(kvKeyRemoteLoginAlert, string(b))
		mirrorPlatformKVSecurity(app)
	}
	return nil
}

func loadAdminIpBanAlertUnified(app *ServerApp) (AdminIpBanAlertState, error) {
	if app == nil {
		return AdminIpBanAlertState{}, nil
	}
	if kv := app.PlatformKV(); kv != nil {
		if raw, ok := kv.Get(kvKeyAdminIpBanAlert); ok && strings.TrimSpace(raw) != "" {
			var st AdminIpBanAlertState
			if err := json.Unmarshal([]byte(raw), &st); err == nil {
				return st, nil
			}
		}
	}
	path := filepath.Join(app.DataDir(), adminIpBanAlertFile)
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return AdminIpBanAlertState{}, nil
		}
		return AdminIpBanAlertState{}, err
	}
	var st AdminIpBanAlertState
	if err := json.Unmarshal(b, &st); err != nil {
		return AdminIpBanAlertState{}, err
	}
	return st, nil
}

func saveAdminIpBanAlertUnified(app *ServerApp, st AdminIpBanAlertState) error {
	if app == nil {
		return nil
	}
	b, err := json.Marshal(st)
	if err != nil {
		return err
	}
	path := filepath.Join(app.DataDir(), adminIpBanAlertFile)
	if err := os.WriteFile(path, b, 0600); err != nil {
		return err
	}
	if kv := app.PlatformKV(); kv != nil {
		_ = kv.Set(kvKeyAdminIpBanAlert, string(b))
		mirrorPlatformKVSecurity(app)
	}
	return nil
}
