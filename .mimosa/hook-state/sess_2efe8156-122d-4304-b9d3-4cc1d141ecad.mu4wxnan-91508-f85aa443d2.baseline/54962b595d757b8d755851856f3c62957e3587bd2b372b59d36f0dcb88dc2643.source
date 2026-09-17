package internal

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// BaotaTargetEntry 合并后的宝塔实例（进程内 Config）；来自 runtime baotaTargets 或单实例回退。
type BaotaTargetEntry struct {
	ID             string
	DisplayName    string
	URL            string
	APIKey         string
	SkipTLSVerify  *bool // nil 表示沿用全局 cfg.BaotaSkipTLSVerify
	DefaultForSync bool
}

var baotaTargetIDRe = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)

// RuntimeBaotaTarget 持久化到 runtime-config.json 的宝塔实例行。
type RuntimeBaotaTarget struct {
	ID            string `json:"id"`
	Name          string `json:"name,omitempty"`
	URL           string `json:"url"`
	ApiKey        string `json:"apiKey"`
	SkipTlsVerify *bool  `json:"skipTlsVerify,omitempty"`
	Default       bool   `json:"default,omitempty"`
}

// EffectiveBaotaTargets 返回可用于同步/API 的实例列表（含 URL 与 API Key）。
// 未配置 baotaTargets 时，回退为单组 BaotaURL + BaotaAPIKey（虚拟 id=default）。
func EffectiveBaotaTargets(cfg Config) []BaotaTargetEntry {
	if len(cfg.BaotaTargets) > 0 {
		out := make([]BaotaTargetEntry, 0, len(cfg.BaotaTargets))
		for _, t := range cfg.BaotaTargets {
			if strings.TrimSpace(t.URL) == "" || strings.TrimSpace(t.APIKey) == "" {
				continue
			}
			out = append(out, t)
		}
		if len(out) > 0 {
			return out
		}
	}
	u := strings.TrimSpace(cfg.BaotaURL)
	k := strings.TrimSpace(cfg.BaotaAPIKey)
	if u != "" && k != "" {
		return []BaotaTargetEntry{{
			ID:             "default",
			DisplayName:    "默认",
			URL:            u,
			APIKey:         k,
			SkipTLSVerify:  nil,
			DefaultForSync: true,
		}}
	}
	return nil
}

// DefaultBaotaTargetID 返回同步/证书等未指定实例时的默认 id。
func DefaultBaotaTargetID(cfg Config) string {
	list := EffectiveBaotaTargets(cfg)
	if len(list) == 0 {
		return "default"
	}
	for _, t := range list {
		if t.DefaultForSync {
			return t.ID
		}
	}
	return list[0].ID
}

// BaotaTargetIDFromIngress 读取 Ingress 指定的宝塔实例；空表示使用默认实例。
// 注解：kube-bt-sync.io/baota-target。
func BaotaTargetIDFromIngress(annotations map[string]string) string {
	if annotations == nil {
		return ""
	}
	v := strings.TrimSpace(baotaAnnotationValue(annotations, "kube-bt-sync.io/baota-target"))
	return v
}

// ConfigForBaotaTargetID 返回仅宝塔连接字段被替换的 Config 副本，供 CallBaotaAPI / 探活等使用。
func ConfigForBaotaTargetID(cfg Config, targetID string) Config {
	out := cfg
	out.BaotaTargets = nil
	id := strings.TrimSpace(targetID)
	if id == "" {
		id = DefaultBaotaTargetID(cfg)
	}
	for _, t := range EffectiveBaotaTargets(cfg) {
		if t.ID == id {
			out.BaotaURL = strings.TrimSpace(t.URL)
			out.BaotaAPIKey = strings.TrimSpace(t.APIKey)
			if t.SkipTLSVerify != nil {
				out.BaotaSkipTLSVerify = *t.SkipTLSVerify
			}
			return out
		}
	}
	// 未知 id：回退默认，避免静默连错面板
	def := DefaultBaotaTargetID(cfg)
	if def != id {
		for _, t := range EffectiveBaotaTargets(cfg) {
			if t.ID == def {
				out.BaotaURL = strings.TrimSpace(t.URL)
				out.BaotaAPIKey = strings.TrimSpace(t.APIKey)
				if t.SkipTLSVerify != nil {
					out.BaotaSkipTLSVerify = *t.SkipTLSVerify
				}
				return out
			}
		}
	}
	return out
}

func normalizeRuntimeBaotaTargetID(raw string) (string, error) {
	id := strings.TrimSpace(strings.ToLower(raw))
	if id == "" {
		return "", errors.New("宝塔实例 id 不能为空")
	}
	if !baotaTargetIDRe.MatchString(id) {
		return "", errors.New("宝塔实例 id 须为小写字母、数字、连字符，长度 1–63，且不以连字符结尾")
	}
	return id, nil
}

func mergeRuntimeBaotaTargetsIntoConfig(rs *RuntimeSettings, out *Config) {
	if rs == nil || len(rs.BaotaTargets) == 0 {
		out.BaotaTargets = nil
		return
	}
	seen := map[string]struct{}{}
	var built []BaotaTargetEntry
	for _, row := range rs.BaotaTargets {
		id, err := normalizeRuntimeBaotaTargetID(row.ID)
		if err != nil {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		u := strings.TrimSpace(row.URL)
		k := strings.TrimSpace(row.ApiKey)
		if u == "" || k == "" {
			continue
		}
		built = append(built, BaotaTargetEntry{
			ID:             id,
			DisplayName:    strings.TrimSpace(row.Name),
			URL:            u,
			APIKey:         k,
			SkipTLSVerify:  row.SkipTlsVerify,
			DefaultForSync: row.Default,
		})
	}
	if len(built) == 0 {
		out.BaotaTargets = nil
		return
	}
	// 确保有且仅有一个 DefaultForSync（多行时）
	defN := 0
	for i := range built {
		if built[i].DefaultForSync {
			defN++
		}
	}
	if defN != 1 {
		for i := range built {
			built[i].DefaultForSync = i == 0
		}
	}
	out.BaotaTargets = built
	// 主字段指向默认实例，兼容单实例代码路径
	for _, t := range built {
		if t.DefaultForSync {
			out.BaotaURL = strings.TrimSpace(t.URL)
			out.BaotaAPIKey = strings.TrimSpace(t.APIKey)
			if t.SkipTLSVerify != nil {
				out.BaotaSkipTLSVerify = *t.SkipTLSVerify
			} else if rs.BaotaSkipTLSVerify != nil {
				out.BaotaSkipTLSVerify = *rs.BaotaSkipTLSVerify
			} else if strings.TrimSpace(t.URL) != "" {
				out.BaotaSkipTLSVerify = loadBaotaSkipTLSVerify(t.URL)
			}
			return
		}
	}
}

// mergeAndValidateRuntimeBaotaTargetsOnPut 校验并合并 PUT 中的多宝塔列表（含从 cur 恢复掩码后的 apiKey）。
func mergeAndValidateRuntimeBaotaTargetsOnPut(body, cur *RuntimeSettings) error {
	if body == nil {
		return nil
	}
	if len(body.BaotaTargets) == 0 {
		return nil
	}
	byIDCur := map[string]RuntimeBaotaTarget{}
	if cur != nil {
		for _, t := range cur.BaotaTargets {
			id, err := normalizeRuntimeBaotaTargetID(t.ID)
			if err != nil {
				continue
			}
			byIDCur[id] = t
		}
	}
	seen := map[string]struct{}{}
	norm := make([]RuntimeBaotaTarget, 0, len(body.BaotaTargets))
	for i, row := range body.BaotaTargets {
		id, err := normalizeRuntimeBaotaTargetID(row.ID)
		if err != nil {
			return fmt.Errorf("baotaTargets[%d].id: %w", i, err)
		}
		if _, ok := seen[id]; ok {
			return fmt.Errorf("baotaTargets 中存在重复 id: %s", id)
		}
		seen[id] = struct{}{}
		u := strings.TrimSpace(row.URL)
		if u == "" {
			return fmt.Errorf("baotaTargets[%d]（id=%s）缺少 url", i, id)
		}
		if _, err := url.Parse(u); err != nil {
			return fmt.Errorf("baotaTargets[%d]（id=%s）url 无效: %w", i, id, err)
		}
		lu := strings.ToLower(u)
		if !strings.HasPrefix(lu, "http://") && !strings.HasPrefix(lu, "https://") {
			return fmt.Errorf("baotaTargets[%d]（id=%s）url 须为 http:// 或 https:// 开头", i, id)
		}
		key := strings.TrimSpace(row.ApiKey)
		if key == "" || key == "***" {
			if prev, ok := byIDCur[id]; ok && strings.TrimSpace(prev.ApiKey) != "" {
				key = strings.TrimSpace(prev.ApiKey)
			} else if cur != nil && strings.TrimSpace(cur.BaotaAPIKey) != "" && len(body.BaotaTargets) == 1 {
				// 单条迁移：允许沿用顶层 baotaApiKey
				key = strings.TrimSpace(cur.BaotaAPIKey)
			}
		}
		if key == "" || key == "***" {
			return fmt.Errorf("baotaTargets[%d]（id=%s）缺少 apiKey（新实例请填写完整密钥）", i, id)
		}
		norm = append(norm, RuntimeBaotaTarget{
			ID:            id,
			Name:          strings.TrimSpace(row.Name),
			URL:           u,
			ApiKey:        key,
			SkipTlsVerify: row.SkipTlsVerify,
			Default:       row.Default,
		})
	}
	defN := 0
	for i := range norm {
		if norm[i].Default {
			defN++
		}
	}
	if defN == 0 {
		norm[0].Default = true
	} else if defN > 1 {
		first := true
		for i := range norm {
			if norm[i].Default {
				if !first {
					norm[i].Default = false
				}
				first = false
			}
		}
	}
	body.BaotaTargets = norm
	// 同步顶层字段，便于未升级的外部脚本仍读 baotaUrl
	for _, t := range norm {
		if t.Default {
			body.BaotaURL = strings.TrimSpace(t.URL)
			body.BaotaAPIKey = strings.TrimSpace(t.ApiKey)
			break
		}
	}
	return nil
}

func runtimeBaotaTargetsAuditChanged(a, b []RuntimeBaotaTarget) bool {
	if len(a) != len(b) {
		return true
	}
	for i := range a {
		if i >= len(b) {
			return true
		}
		if strings.TrimSpace(a[i].ID) != strings.TrimSpace(b[i].ID) {
			return true
		}
		if strings.TrimSpace(a[i].URL) != strings.TrimSpace(b[i].URL) {
			return true
		}
		if strings.TrimSpace(a[i].Name) != strings.TrimSpace(b[i].Name) {
			return true
		}
		if a[i].Default != b[i].Default {
			return true
		}
		if !boolPtrEqual(a[i].SkipTlsVerify, b[i].SkipTlsVerify) {
			return true
		}
		if a[i].ApiKey != b[i].ApiKey {
			return true
		}
	}
	return false
}
