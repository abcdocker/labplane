package internal

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	kvKeySecurityLoginAlert = "kubebt_security_login_alert"
	kvKeyLoginThrottle      = "kubebt_login_throttle_v1"
	loginThrottleFileName   = "login-throttle.json"
)

type loginThrottleSnapshot struct {
	Entries map[string]loginIPStateJSON `json:"entries"`
}

type loginIPStateJSON struct {
	FailCount         int       `json:"failCount"`
	LastFail          time.Time `json:"lastFail"`
	AdminAlertFired   bool      `json:"adminAlertFired"`
	AdminPasswordFail int       `json:"adminPasswordFail,omitempty"`
	BanUntil          time.Time `json:"banUntil,omitempty"`
}

func mirrorPlatformKVSecurity(app *ServerApp) {
	if app == nil {
		return
	}
	kv := app.PlatformKV()
	rdb := app.Redis()
	cfg := app.Cfg()
	if kv == nil || rdb == nil || !cfg.RuntimeDualWriteRedis {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()
	if err := MirrorPlatformKVToRedis(ctx, rdb, cfg, kv.Snapshot()); err != nil {
		log.Printf("login security: 镜像 platform_kv 到 Redis: %v", err)
	}
}

// InitLoginSecurityState 进程启动时从 MySQL platform_kv / 本地文件恢复登录限流与管理员告警状态。
func InitLoginSecurityState(app *ServerApp) {
	if app == nil {
		return
	}
	if snap, err := loadLoginThrottleSnapshot(app); err != nil {
		log.Printf("login security: 恢复登录限流状态: %v", err)
	} else if snap != nil && len(snap.Entries) > 0 {
		loginTrackMu.Lock()
		for ip, j := range snap.Entries {
			loginByIP[ip] = &loginIPState{
				FailCount:         j.FailCount,
				LastFail:          j.LastFail,
				AdminAlertFired:   j.AdminAlertFired,
				AdminPasswordFail: j.AdminPasswordFail,
				BanUntil:          j.BanUntil,
			}
		}
		loginTrackMu.Unlock()
		log.Printf("login security: 已恢复 %d 个 IP 的登录失败计数", len(snap.Entries))
	}
}

func loadLoginThrottleSnapshot(app *ServerApp) (*loginThrottleSnapshot, error) {
	if app == nil {
		return nil, nil
	}
	if kv := app.PlatformKV(); kv != nil {
		if raw, ok := kv.Get(kvKeyLoginThrottle); ok && strings.TrimSpace(raw) != "" {
			var s loginThrottleSnapshot
			if err := json.Unmarshal([]byte(raw), &s); err == nil && s.Entries != nil {
				return &s, nil
			}
		}
	}
	path := filepath.Join(app.DataDir(), loginThrottleFileName)
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var s loginThrottleSnapshot
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// persistLoginThrottleAfterMutation 在内存 map 更新后调用。
func persistLoginThrottleAfterMutation(app *ServerApp) {
	if app == nil {
		return
	}
	loginTrackMu.Lock()
	entries := make(map[string]loginIPStateJSON, len(loginByIP))
	for ip, st := range loginByIP {
		if st == nil {
			continue
		}
		entries[ip] = loginIPStateJSON{
			FailCount:         st.FailCount,
			LastFail:          st.LastFail,
			AdminAlertFired:   st.AdminAlertFired,
			AdminPasswordFail: st.AdminPasswordFail,
			BanUntil:          st.BanUntil,
		}
	}
	loginTrackMu.Unlock()

	snap := loginThrottleSnapshot{Entries: entries}
	raw, err := json.Marshal(snap)
	if err != nil {
		log.Printf("login security: 序列化限流状态: %v", err)
		return
	}
	path := filepath.Join(app.DataDir(), loginThrottleFileName)
	if err := os.WriteFile(path, raw, 0600); err != nil {
		log.Printf("login security: 写 %s: %v", loginThrottleFileName, err)
	}
	if kv := app.PlatformKV(); kv != nil {
		if err := kv.Set(kvKeyLoginThrottle, string(raw)); err != nil {
			log.Printf("login security: 写入 platform_kv[%s]: %v", kvKeyLoginThrottle, err)
		} else {
			mirrorPlatformKVSecurity(app)
		}
	}
}

// LoadSecurityLoginAlertUnified 供铃铛与读状态使用：优先 platform_kv，其次本地文件。
func LoadSecurityLoginAlertUnified(app *ServerApp) (SecurityLoginAlertState, error) {
	if app == nil {
		return SecurityLoginAlertState{}, nil
	}
	if kv := app.PlatformKV(); kv != nil {
		if raw, ok := kv.Get(kvKeySecurityLoginAlert); ok && strings.TrimSpace(raw) != "" {
			var st SecurityLoginAlertState
			if err := json.Unmarshal([]byte(raw), &st); err == nil {
				return st, nil
			}
		}
	}
	return loadSecurityLoginAlert(app.DataDir())
}

// SaveSecurityLoginAlertUnified 写入本地文件、platform_kv，并在开启双写时镜像 Redis。
func SaveSecurityLoginAlertUnified(app *ServerApp, st SecurityLoginAlertState) error {
	if app == nil {
		return nil
	}
	if err := saveSecurityLoginAlertToPath(app.DataDir(), st); err != nil {
		return err
	}
	b, err := json.Marshal(st)
	if err != nil {
		return err
	}
	if kv := app.PlatformKV(); kv != nil {
		if err := kv.Set(kvKeySecurityLoginAlert, string(b)); err != nil {
			log.Printf("login security: 写入 platform_kv[%s]: %v", kvKeySecurityLoginAlert, err)
		} else {
			mirrorPlatformKVSecurity(app)
		}
	}
	return nil
}

func saveSecurityLoginAlertToPath(dataDir string, st SecurityLoginAlertState) error {
	path := filepath.Join(dataDir, securityLoginAlertFile)
	b, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0600)
}
