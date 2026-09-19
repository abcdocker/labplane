package internal

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const docsCosSettingsKVKey = "kubebt_docs_cos_settings_v1"

// docsCosStored 持久化在 PlatformKV 中的 COS 配置（JSON）。
type docsCosStored struct {
	SecretID   string `json:"secretId"`
	SecretKey  string `json:"secretKey"`
	Bucket     string `json:"bucket"`
	Region     string `json:"region"`
	Prefix     string `json:"prefix"`
	PublicBase string `json:"publicBase"`
	UpdatedAt  string `json:"updatedAt,omitempty"`
}

// docsEffectiveCos 实际上传/删除/拼 URL 使用的 COS 参数；未启用 COS 时 UseCOS=false。
type docsEffectiveCos struct {
	UseCOS     bool
	Source     string // "kv" | "env"
	SecretID   string
	SecretKey  string
	Bucket     string
	Region     string
	Prefix     string
	PublicBase string
}

func (e docsEffectiveCos) bucketHost() string {
	return strings.TrimSpace(e.Bucket) + ".cos." + strings.TrimSpace(e.Region) + ".myqcloud.com"
}

func loadDocsCosFromKV(app *ServerApp) (docsCosStored, bool) {
	kv := app.PlatformKV()
	if kv == nil {
		return docsCosStored{}, false
	}
	raw, ok := kv.Get(docsCosSettingsKVKey)
	if !ok || strings.TrimSpace(raw) == "" {
		return docsCosStored{}, false
	}
	var s docsCosStored
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		return docsCosStored{}, false
	}
	return s, true
}

func docsCosStoredComplete(s docsCosStored) bool {
	return strings.TrimSpace(s.SecretID) != "" &&
		strings.TrimSpace(s.SecretKey) != "" &&
		strings.TrimSpace(s.Bucket) != "" &&
		strings.TrimSpace(s.Region) != ""
}

// effectiveDocsCos KV 中配置完整则优先使用；否则回退环境变量。
func effectiveDocsCos(app *ServerApp) docsEffectiveCos {
	cfg := app.Cfg()
	if s, ok := loadDocsCosFromKV(app); ok && docsCosStoredComplete(s) {
		return docsEffectiveCos{
			UseCOS:     true,
			Source:     "kv",
			SecretID:   strings.TrimSpace(s.SecretID),
			SecretKey:  strings.TrimSpace(s.SecretKey),
			Bucket:     strings.TrimSpace(s.Bucket),
			Region:     strings.TrimSpace(s.Region),
			Prefix:     strings.Trim(strings.TrimSpace(s.Prefix), "/"),
			PublicBase: strings.TrimRight(strings.TrimSpace(s.PublicBase), "/"),
		}
	}
	if cfg.CosObjectStorageConfigured() {
		return docsEffectiveCos{
			UseCOS:     true,
			Source:     "env",
			SecretID:   strings.TrimSpace(cfg.CosSecretID),
			SecretKey:  strings.TrimSpace(cfg.CosSecretKey),
			Bucket:     strings.TrimSpace(cfg.CosBucket),
			Region:     strings.TrimSpace(cfg.CosRegion),
			Prefix:     strings.Trim(strings.TrimSpace(cfg.CosPrefix), "/"),
			PublicBase: strings.TrimRight(strings.TrimSpace(cfg.CosPublicBase), "/"),
		}
	}
	return docsEffectiveCos{UseCOS: false}
}

func docsCosPublicURLFor(e docsEffectiveCos, objectKey string) string {
	key := strings.Trim(objectKey, "/")
	base := e.PublicBase
	if base == "" {
		base = "https://" + e.bucketHost()
	}
	if key == "" {
		return base
	}
	parts := strings.Split(key, "/")
	for i := range parts {
		parts[i] = url.PathEscape(parts[i])
	}
	return base + "/" + strings.Join(parts, "/")
}

func maskDocsSecretID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return ""
	}
	r := []rune(id)
	if len(r) <= 8 {
		return "****"
	}
	return string(r[:4]) + "…" + string(r[len(r)-4:])
}

func saveDocsCosToKV(app *ServerApp, s docsCosStored) error {
	kv := app.PlatformKV()
	if kv == nil {
		return fmt.Errorf("platform_kv 不可用")
	}
	s.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	b, err := json.Marshal(s)
	if err != nil {
		return err
	}
	if err := kv.Set(docsCosSettingsKVKey, string(b)); err != nil {
		return err
	}
	mirrorPlatformKVIfDualWrite(app)
	return nil
}

func clearDocsCosKV(app *ServerApp) error {
	kv := app.PlatformKV()
	if kv == nil {
		return fmt.Errorf("platform_kv 不可用")
	}
	if err := kv.Set(docsCosSettingsKVKey, ""); err != nil {
		return err
	}
	mirrorPlatformKVIfDualWrite(app)
	return nil
}
