package internal

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

const (
	runtimeTotpKVKey = "kubebt_runtime_totp_v1"
)

type runtimeTotpPayload struct {
	SecretEnc string `json:"secretEnc"`
	Enabled   bool   `json:"enabled"`
}

// dashboardUserTotpMeta MySQL 用户 TOTP 状态。
func dashboardUserTotpMeta(db *sql.DB, username string) (enabled bool, secretEnc string, err error) {
	u := strings.TrimSpace(username)
	if u == "" || db == nil {
		return false, "", nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
	defer cancel()
	e := db.QueryRowContext(ctx,
		`SELECT totp_enabled, COALESCE(totp_secret_enc,'') FROM kubebt_dashboard_users WHERE username=? LIMIT 1`,
		u,
	).Scan(&enabled, &secretEnc)
	if errors.Is(e, sql.ErrNoRows) {
		return false, "", nil
	}
	return enabled, secretEnc, e
}

func dashboardUserSaveTotpSecret(ctx context.Context, db *sql.DB, username, secretEnc string, enabled bool) error {
	u := strings.TrimSpace(username)
	if u == "" || db == nil {
		return errors.New("invalid user")
	}
	en := 0
	if enabled {
		en = 1
	}
	_, err := db.ExecContext(ctx,
		`UPDATE kubebt_dashboard_users SET totp_secret_enc=?, totp_enabled=? WHERE username=?`,
		secretEnc, en, u,
	)
	return err
}

func loadRuntimeTotp(app *ServerApp) (*runtimeTotpPayload, error) {
	if app == nil {
		return nil, errors.New("app nil")
	}
	kv := app.PlatformKV()
	if kv == nil {
		return &runtimeTotpPayload{}, nil
	}
	raw, ok := kv.Get(runtimeTotpKVKey)
	if !ok || strings.TrimSpace(raw) == "" {
		return &runtimeTotpPayload{}, nil
	}
	var p runtimeTotpPayload
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func saveRuntimeTotp(app *ServerApp, p *runtimeTotpPayload) error {
	if app == nil || p == nil {
		return errors.New("invalid")
	}
	kv := app.PlatformKV()
	if kv == nil {
		return errors.New("platform kv 未初始化")
	}
	b, err := json.Marshal(p)
	if err != nil {
		return err
	}
	return kv.Set(runtimeTotpKVKey, string(b))
}

func runtimeTotpEnabled(app *ServerApp) (bool, string, error) {
	p, err := loadRuntimeTotp(app)
	if err != nil || p == nil {
		return false, "", err
	}
	return p.Enabled && strings.TrimSpace(p.SecretEnc) != "", p.SecretEnc, nil
}
