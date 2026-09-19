package internal

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestNewSetupEnvironmentDefaultsRedactsSecrets(t *testing.T) {
	cfg := Config{
		PlatformPublicURL: "http://server.example:18081",
		MySQLHost:         "mysql",
		MySQLPort:         3306,
		MySQLDatabase:     "kube_bt_sync",
		MySQLUser:         "kube_bt_sync",
		MySQLPassword:     "mysql-secret",
		RedisAddr:         "redis:6379",
		RedisPassword:     "redis-secret",
		EncryptionKey:     "0123456789abcdef0123456789abcdef",
		DashboardUser:     "admin",
	}

	got := newSetupEnvironmentDefaults(cfg)
	if !got.ConnectionsConfigured || !got.MySQLPasswordConfigured || !got.RedisPasswordConfigured || !got.EncryptionKeyConfigured {
		t.Fatalf("expected configured environment defaults, got %#v", got)
	}
	if got.MySQLHost != "mysql" || got.RedisAddr != "redis:6379" || got.PlatformPublicURL != cfg.PlatformPublicURL {
		t.Fatalf("unexpected public defaults: %#v", got)
	}
	raw, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{cfg.MySQLPassword, cfg.RedisPassword, cfg.EncryptionKey} {
		if strings.Contains(string(raw), secret) {
			t.Fatalf("setup defaults leaked secret %q", secret)
		}
	}
}

func TestApplySetupEnvironmentDefaults(t *testing.T) {
	env := Config{
		MySQLHost:      "mysql",
		MySQLPort:      3306,
		MySQLDatabase:  "kube_bt_sync",
		MySQLUser:      "kube_bt_sync",
		MySQLPassword:  "mysql-secret",
		RedisAddr:      "redis:6379",
		RedisPassword:  "redis-secret",
		RedisDB:        2,
		RedisKeyPrefix: "kbts:",
		EncryptionKey:  "0123456789abcdef0123456789abcdef",
	}
	body := setupSubmitBody{
		UseEnvironmentConnections:   true,
		UseEnvironmentEncryptionKey: true,
	}

	if err := applySetupEnvironmentDefaults(&body, env); err != nil {
		t.Fatal(err)
	}
	rs := body.RuntimeSettings
	if rs.MySQLHost != env.MySQLHost || rs.MySQLPassword != env.MySQLPassword {
		t.Fatalf("MySQL environment config was not copied: %#v", rs)
	}
	if rs.RedisAddr != env.RedisAddr || rs.RedisPassword != env.RedisPassword || rs.RedisDB != env.RedisDB {
		t.Fatalf("Redis environment config was not copied: %#v", rs)
	}
	if rs.EncryptionKey != env.EncryptionKey {
		t.Fatalf("encryption key was not copied")
	}
}

func TestApplySetupEnvironmentDefaultsRequiresCompleteConnections(t *testing.T) {
	body := setupSubmitBody{UseEnvironmentConnections: true}
	if err := applySetupEnvironmentDefaults(&body, Config{}); err == nil {
		t.Fatal("expected incomplete environment connection error")
	}
}
