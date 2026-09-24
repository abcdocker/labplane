package internal

// Authentik（SSO）实例配置：平台直连 Authentik 管理 API（/api/v3，Bearer Token），
// 实现用户/应用/提供程序的常用管理。Token 用 LABPLANE_ENCRYPTION_KEY 加密存 PlatformKV。

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const kvKeyAuthentikSettings = "labplane_authentik_settings_v1"

// AuthentikInstance 一个 Authentik 控制台实例。
type AuthentikInstance struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	BaseURL   string `json:"baseUrl"` // 例 https://sso.example.com（API 根为其 /api/v3）
	TokenEnc  string `json:"tokenEnc"`
	Enabled   bool   `json:"enabled"`
	Notes     string `json:"notes,omitempty"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type authentikSettingsBundle struct {
	Instances []AuthentikInstance `json:"instances"`
}

func loadAuthentikSettings(kv PlatformKV) *authentikSettingsBundle {
	b := &authentikSettingsBundle{Instances: []AuthentikInstance{}}
	if kv == nil {
		return b
	}
	raw, ok := kv.Get(kvKeyAuthentikSettings)
	if !ok || strings.TrimSpace(raw) == "" {
		return b
	}
	_ = json.Unmarshal([]byte(raw), b)
	if b.Instances == nil {
		b.Instances = []AuthentikInstance{}
	}
	return b
}

func saveAuthentikSettings(kv PlatformKV, b *authentikSettingsBundle) error {
	if kv == nil || b == nil {
		return nil
	}
	js, err := json.Marshal(b)
	if err != nil {
		return err
	}
	return kv.Set(kvKeyAuthentikSettings, string(js))
}

// authentikInstancePublic 输出给前端（Token 不出站，只回 tokenSet）。
func authentikInstancePublic(in AuthentikInstance) map[string]any {
	return map[string]any{
		"id":        in.ID,
		"name":      in.Name,
		"baseUrl":   in.BaseURL,
		"tokenSet":  strings.TrimSpace(in.TokenEnc) != "",
		"enabled":   in.Enabled,
		"notes":     in.Notes,
		"createdAt": in.CreatedAt,
		"updatedAt": in.UpdatedAt,
	}
}

// authentikInstancePutInput UI 保存入参；token 留空保留旧值，"-" 表示清除。
type authentikInstancePutInput struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	BaseURL string `json:"baseUrl"`
	Token   string `json:"token"`
	Enabled *bool  `json:"enabled"`
	Notes   string `json:"notes"`
}

func upsertAuthentikInstance(b *authentikSettingsBundle, in authentikInstancePutInput, key []byte) (AuthentikInstance, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	inst := AuthentikInstance{}
	idx := -1
	for i := range b.Instances {
		if b.Instances[i].ID == in.ID {
			idx = i
			inst = b.Instances[i]
			break
		}
	}
	if idx < 0 {
		inst = AuthentikInstance{ID: in.ID, CreatedAt: now}
		if strings.TrimSpace(inst.ID) == "" {
			inst.ID = fmt.Sprintf("ak-%d", time.Now().UnixNano())
		}
	}
	inst.UpdatedAt = now
	inst.Name = strings.TrimSpace(in.Name)
	inst.BaseURL = strings.TrimSpace(in.BaseURL)
	inst.Notes = strings.TrimSpace(in.Notes)
	if in.Enabled != nil {
		inst.Enabled = *in.Enabled
	} else if idx < 0 {
		inst.Enabled = true
	}
	if strings.TrimSpace(in.Token) == "-" {
		inst.TokenEnc = ""
	} else if strings.TrimSpace(in.Token) != "" {
		enc, err := encryptSecret(key, strings.TrimSpace(in.Token))
		if err != nil {
			return inst, err
		}
		inst.TokenEnc = enc
	}
	if idx >= 0 {
		b.Instances[idx] = inst
	} else {
		b.Instances = append(b.Instances, inst)
	}
	return inst, nil
}
