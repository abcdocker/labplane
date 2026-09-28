package internal

// 预授权密钥的平台侧元数据。headscale v0.28 不支持：完整 key 仅创建时返回一次
// （服务端只存哈希）、无"使用时间"字段、无备注字段——三者均由平台补充。
// FullEnc 为创建时保存的完整密钥（AES 加密），仅本平台创建的 key 可预览。

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

const kvKeyMeshKeyMeta = "labplane_mesh_keymeta_v1"
const kvKeyMeshDefaultKey = "labplane_mesh_defaultkey_v1"

// MeshKeyDevice 通过一键加入脚本回传的设备记录（headscale API 无 key↔节点关联）。
type MeshKeyDevice struct {
	Hostname string `json:"hostname"`
	JoinedAt string `json:"joinedAt"`
}

type meshKeyMeta struct {
	Note    string          `json:"note,omitempty"`
	FullEnc string          `json:"fullEnc,omitempty"` // 创建时保存的完整密钥（加密）
	UsedAt  string          `json:"usedAt,omitempty"`  // 平台检测到 used 翻转的时间（近似）
	User    string          `json:"user,omitempty"`    // 绑定的 headscale 用户
	Devices []MeshKeyDevice `json:"devices,omitempty"` // 脚本回传的使用设备
}

// meshDefaultKey 实例的「默认加入密钥」：可复用、长期有效，一次申请反复使用，
// 避免 OIDC/手动方式每次都产生新密钥。
type meshDefaultKey struct {
	KeyID     string `json:"keyId"`
	FullEnc   string `json:"fullEnc"`
	User      string `json:"user"`                // 绑定的 headscale 用户（Authentik 登录映射）
	CreatedBy string `json:"createdBy,omitempty"` // 平台侧操作人
	Days      int    `json:"days"`
	CreatedAt string `json:"createdAt"`
}

func loadMeshDefaultKeys(kv PlatformKV) map[string]meshDefaultKey {
	out := map[string]meshDefaultKey{}
	if kv == nil {
		return out
	}
	raw, ok := kv.Get(kvKeyMeshDefaultKey)
	if !ok || strings.TrimSpace(raw) == "" {
		return out
	}
	var m struct {
		Items map[string]meshDefaultKey `json:"items"`
	}
	if json.Unmarshal([]byte(raw), &m) == nil && m.Items != nil {
		return m.Items
	}
	return out
}

func saveMeshDefaultKey(kv PlatformKV, instID string, dk meshDefaultKey) {
	if kv == nil {
		return
	}
	items := loadMeshDefaultKeys(kv)
	items[instID] = dk
	if js, err := json.Marshal(struct {
		Items map[string]meshDefaultKey `json:"items"`
	}{Items: items}); err == nil {
		_ = kv.Set(kvKeyMeshDefaultKey, string(js))
	}
}

func meshDefaultKeyOf(kv PlatformKV, instID string) (meshDefaultKey, bool) {
	dk, ok := loadMeshDefaultKeys(kv)[instID]
	return dk, ok && dk.KeyID != ""
}

func loadMeshKeyMeta(kv PlatformKV) map[string]meshKeyMeta {
	out := map[string]meshKeyMeta{}
	if kv == nil {
		return out
	}
	raw, ok := kv.Get(kvKeyMeshKeyMeta)
	if !ok || strings.TrimSpace(raw) == "" {
		return out
	}
	var m struct {
		Items map[string]meshKeyMeta `json:"items"`
	}
	if json.Unmarshal([]byte(raw), &m) == nil && m.Items != nil {
		return m.Items
	}
	return out
}

func saveMeshKeyMeta(kv PlatformKV, items map[string]meshKeyMeta) {
	_ = saveMeshKeyMetaErr(kv, items)
}

func saveMeshKeyMetaErr(kv PlatformKV, items map[string]meshKeyMeta) error {
	if kv == nil {
		return nil
	}
	js, err := json.Marshal(struct {
		Items map[string]meshKeyMeta `json:"items"`
	}{Items: items})
	if err != nil {
		return err
	}
	return kv.Set(kvKeyMeshKeyMeta, string(js))
}

func meshKeyMetaID(instanceID, keyID string) string {
	return strconv.Itoa(len(instanceID)) + ":" + instanceID + keyID
}

// 在从单实例扩容前，将无归属字段的旧记录归入唯一的原实例。
func migrateLegacyMeshKeyMeta(kv PlatformKV, instanceID string) error {
	items := loadMeshKeyMeta(kv)
	changed := false
	for id, m := range items {
		if strings.Contains(id, ":") {
			continue
		}
		scoped := meshKeyMetaID(instanceID, id)
		if _, exists := items[scoped]; !exists {
			items[scoped] = m
		}
		delete(items, id)
		changed = true
	}
	if changed {
		return saveMeshKeyMetaErr(kv, items)
	}
	return nil
}

// 旧版只按 key ID 保存；只有单实例部署才能安全地读取这类记录。
func meshKeyMetaFor(kv PlatformKV, instanceID, keyID string) (meshKeyMeta, bool) {
	items := loadMeshKeyMeta(kv)
	if m, ok := items[meshKeyMetaID(instanceID, keyID)]; ok {
		return m, true
	}
	instances := loadMeshSettings(kv).Instances
	if len(instances) == 1 && instances[0].ID == instanceID {
		if m, ok := items[keyID]; ok {
			return m, true
		}
	}
	if dk, ok := meshDefaultKeyOf(kv, instanceID); ok && dk.KeyID == keyID && dk.FullEnc != "" {
		return meshKeyMeta{FullEnc: dk.FullEnc, User: dk.User}, true
	}
	return meshKeyMeta{}, false
}

func meshInstanceByID(kv PlatformKV, instanceID string) (MeshInstance, bool) {
	for _, inst := range loadMeshSettings(kv).Instances {
		if inst.ID == instanceID {
			return inst, true
		}
	}
	return MeshInstance{}, false
}

func meshJoinReportCandidates(kv PlatformKV, instanceID string) map[string]meshKeyMeta {
	out := map[string]meshKeyMeta{}
	items := loadMeshKeyMeta(kv)
	prefix := meshKeyMetaID(instanceID, "")
	for id, m := range items {
		if strings.HasPrefix(id, prefix) && m.FullEnc != "" {
			out[strings.TrimPrefix(id, prefix)] = m
		}
	}
	if dk, ok := meshDefaultKeyOf(kv, instanceID); ok && dk.FullEnc != "" {
		if _, exists := out[dk.KeyID]; !exists {
			out[dk.KeyID] = meshKeyMeta{FullEnc: dk.FullEnc, User: dk.User}
		}
	}
	instances := loadMeshSettings(kv).Instances
	if len(instances) == 1 && instances[0].ID == instanceID {
		for id, m := range items {
			if !strings.Contains(id, ":") && m.FullEnc != "" {
				if _, exists := out[id]; !exists {
					out[id] = m
				}
			}
		}
	}
	return out
}

func meshPreAuthKeyValidForReport(keys []HSPreAuthKey, id string, now time.Time) bool {
	for _, key := range keys {
		if key.ID != id {
			continue
		}
		if key.Expiration == "" {
			return true
		}
		exp, err := time.Parse(time.RFC3339, key.Expiration)
		return err == nil && now.Before(exp)
	}
	return false
}

// enrichKeyMeta 附加平台元数据（备注/使用时间/可预览标记/设备）并记录 used 翻转。
func enrichKeyMeta(kv PlatformKV, instanceID string, keys []HSPreAuthKey) {
	for i := range keys {
		if m, ok := meshKeyMetaFor(kv, instanceID, keys[i].ID); ok {
			keys[i].Note = m.Note
			keys[i].UsedAt = m.UsedAt
			keys[i].HasFull = m.FullEnc != ""
			keys[i].Devices = m.Devices
		}
	}
	reconcileKeyMeta(kv, instanceID, keys)
}

// reconcileKeyMeta 把密钥列表中的 used 翻转记录为使用时间。
// 该时间为平台检测时间（近似），粒度取决于轮询间隔。
func reconcileKeyMeta(kv PlatformKV, instanceID string, keys []HSPreAuthKey) {
	items := loadMeshKeyMeta(kv)
	changed := false
	now := time.Now().Format(time.RFC3339)
	for _, k := range keys {
		if !k.Used {
			continue
		}
		id := meshKeyMetaID(instanceID, k.ID)
		m, _ := meshKeyMetaFor(kv, instanceID, k.ID)
		if m.UsedAt == "" {
			m.UsedAt = now
			items[id] = m
			changed = true
		}
	}
	if changed {
		saveMeshKeyMeta(kv, items)
	}
}

// addMeshKeyDevice 记录脚本回传的设备（按主机名去重，保留最近 20 条）。
func addMeshKeyDevice(kv PlatformKV, instanceID, keyID, hostname string) bool {
	items := loadMeshKeyMeta(kv)
	id := meshKeyMetaID(instanceID, keyID)
	m, _ := meshKeyMetaFor(kv, instanceID, keyID)
	for _, d := range m.Devices {
		if d.Hostname == hostname {
			return false
		}
	}
	m.Devices = append(m.Devices, MeshKeyDevice{Hostname: hostname, JoinedAt: time.Now().Format(time.RFC3339)})
	if len(m.Devices) > 20 {
		m.Devices = m.Devices[len(m.Devices)-20:]
	}
	items[id] = m
	saveMeshKeyMeta(kv, items)
	return true
}

// pruneMeshKeyMeta 删除已被移除的密钥的元数据。
func pruneMeshKeyMeta(kv PlatformKV, instanceID string, deletedIDs []string) {
	if kv == nil || len(deletedIDs) == 0 {
		return
	}
	items := loadMeshKeyMeta(kv)
	changed := false
	for _, id := range deletedIDs {
		key := meshKeyMetaID(instanceID, id)
		if _, ok := items[key]; ok {
			delete(items, key)
			changed = true
		}
		instances := loadMeshSettings(kv).Instances
		if len(instances) == 1 && instances[0].ID == instanceID {
			if _, ok := items[id]; ok {
				delete(items, id)
				changed = true
			}
		}
	}
	if changed {
		saveMeshKeyMeta(kv, items)
	}
}
