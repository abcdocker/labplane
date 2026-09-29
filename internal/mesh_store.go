package internal

// 异地组网（Headscale 控制面）实例配置：管理端在 UI 录入多个 headscale 实例，
// API Key 用 LABPLANE_ENCRYPTION_KEY 加密存 PlatformKV，接口回显只给 "apiKeySet"。

import (
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
)

const kvKeyMeshSettings = "labplane_mesh_settings_v1"
const kvKeyMeshCollectorStatusPrefix = "labplane_mesh_collector_status_v1_"

type meshCollectorStatus struct {
	Host           string `json:"host,omitempty"`
	Port           int    `json:"port,omitempty"`
	User           string `json:"user,omitempty"`
	LastSnapshotAt string `json:"lastSnapshotAt,omitempty"`
	LastError      string `json:"lastError,omitempty"`
}

func meshCollectorEndpointMatches(c MeshTrafficCollector, host string, port int, user string) bool {
	collectorPort := c.Port
	if collectorPort <= 0 {
		collectorPort = 22
	}
	if port <= 0 {
		port = 22
	}
	return strings.EqualFold(strings.TrimSpace(c.Host), strings.TrimSpace(host)) && collectorPort == port && c.User == user
}

func saveMeshCollectorStatus(kv PlatformKV, instanceID, collectorID string, status meshCollectorStatus) error {
	if kv == nil {
		return nil
	}
	raw, err := json.Marshal(status)
	if err != nil {
		return err
	}
	return kv.Set(kvKeyMeshCollectorStatusPrefix+meshTrafficCacheKey(instanceID, collectorID), string(raw))
}

func loadMeshCollectorStatus(kv PlatformKV, instanceID, collectorID string) (meshCollectorStatus, bool) {
	if kv == nil {
		return meshCollectorStatus{}, false
	}
	raw, ok := kv.Get(kvKeyMeshCollectorStatusPrefix + meshTrafficCacheKey(instanceID, collectorID))
	if !ok {
		return meshCollectorStatus{}, false
	}
	var status meshCollectorStatus
	if json.Unmarshal([]byte(raw), &status) != nil {
		return meshCollectorStatus{}, false
	}
	return status, true
}

// MeshTrafficCollector 流量采集器：通过 SSH 到子网路由节点执行
// `tailscale status --json`，取每个 peer 的 RxBytes/TxBytes 计数。
type MeshTrafficCollector struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Host    string `json:"host"`
	Port    int    `json:"port"` // 0 视为 22
	User    string `json:"user"`
	PassEnc string `json:"passEnc,omitempty"` // SSH 密码密文；留空表示沿用已存密码
	// Command 远端采集命令；空为 `tailscale status --json`。容器化部署（如群晖）可写
	// `/usr/local/bin/docker exec tailscale-router tailscale status --json`。
	Command string `json:"command,omitempty"`
	// HostKeyFp SSH host key SHA256 指纹（首次探测后由管理员确认；更换节点需重新确认）
	HostKeyFp string `json:"hostKeyFp,omitempty"`
	// 运行时状态（采集后回写）
	LastSnapshotAt string `json:"lastSnapshotAt,omitempty"`
	LastError      string `json:"lastError,omitempty"`
}

// MeshInstance 一个 headscale 控制面实例。
type MeshInstance struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Region       string `json:"region,omitempty"`    // 例：公网控制面 / 威海 ops / 北京 ukx-nas
	APIURL       string `json:"apiUrl"`              // headscale API 根地址；可配置绕过 WAF 的直连地址
	ClientURL    string `json:"clientUrl,omitempty"` // 设备使用的公网控制面地址；空则沿用 APIURL
	APIKeyEnc    string `json:"apiKeyEnc"`
	MetricsURL   string `json:"metricsUrl,omitempty"` // Prometheus /metrics；空则按 APIURL 推导
	HeadplaneURL string `json:"headplaneUrl,omitempty"`
	Enabled      bool   `json:"enabled"`
	Notes        string `json:"notes,omitempty"`
	// TrafficCollectors 流量采集器列表（可选）
	TrafficCollectors []MeshTrafficCollector `json:"trafficCollectors,omitempty"`
	CreatedAt         string                 `json:"createdAt"`
	UpdatedAt         string                 `json:"updatedAt"`
}

type meshSettingsBundle struct {
	Instances []MeshInstance `json:"instances"`
}

func loadMeshSettings(kv PlatformKV) *meshSettingsBundle {
	b := &meshSettingsBundle{Instances: []MeshInstance{}}
	if kv == nil {
		return b
	}
	raw, ok := kv.Get(kvKeyMeshSettings)
	if !ok || strings.TrimSpace(raw) == "" {
		return b
	}
	_ = json.Unmarshal([]byte(raw), b)
	if b.Instances == nil {
		b.Instances = []MeshInstance{}
	}
	return b
}

func saveMeshSettings(kv PlatformKV, b *meshSettingsBundle) error {
	if kv == nil || b == nil {
		return nil
	}
	js, err := json.Marshal(b)
	if err != nil {
		return err
	}
	return kv.Set(kvKeyMeshSettings, string(js))
}

// meshInstancePublic 输出给前端的实例（密文不出站，只回 apiKeySet/passSet）。
func meshInstancePublic(in MeshInstance, kv PlatformKV) map[string]any {
	collectors := make([]map[string]any, 0, len(in.TrafficCollectors))
	for _, c := range in.TrafficCollectors {
		status, hasStatus := loadMeshCollectorStatus(kv, in.ID, c.ID)
		if !hasStatus || !meshCollectorEndpointMatches(c, status.Host, status.Port, status.User) {
			status = meshCollectorStatus{LastSnapshotAt: c.LastSnapshotAt, LastError: c.LastError}
		}
		collectors = append(collectors, map[string]any{
			"id":             c.ID,
			"name":           c.Name,
			"host":           c.Host,
			"port":           c.Port,
			"user":           c.User,
			"passSet":        strings.TrimSpace(c.PassEnc) != "",
			"command":        c.Command,
			"hostKeyFp":      c.HostKeyFp,
			"lastSnapshotAt": status.LastSnapshotAt,
			"lastError":      status.LastError,
		})
	}
	return map[string]any{
		"id":                in.ID,
		"name":              in.Name,
		"region":            in.Region,
		"apiUrl":            in.APIURL,
		"clientUrl":         in.ClientURL,
		"apiKeySet":         strings.TrimSpace(in.APIKeyEnc) != "",
		"metricsUrl":        in.MetricsURL,
		"headplaneUrl":      in.HeadplaneURL,
		"enabled":           in.Enabled,
		"notes":             in.Notes,
		"trafficCollectors": collectors,
		"createdAt":         in.CreatedAt,
		"updatedAt":         in.UpdatedAt,
	}
}

// meshInstancePutInput UI 保存入参；apiKey/密码留空表示保留旧值，"-" 表示清除。
type meshInstancePutInput struct {
	ID                string                         `json:"id"`
	Name              string                         `json:"name"`
	Region            string                         `json:"region"`
	APIURL            string                         `json:"apiUrl"`
	ClientURL         string                         `json:"clientUrl"`
	APIKey            string                         `json:"apiKey"`
	MetricsURL        string                         `json:"metricsUrl"`
	HeadplaneURL      string                         `json:"headplaneUrl"`
	Enabled           *bool                          `json:"enabled"`
	Notes             string                         `json:"notes"`
	TrafficCollectors []meshTrafficCollectorPutInput `json:"trafficCollectors"`
}

type meshTrafficCollectorPutInput struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Host      string `json:"host"`
	Port      int    `json:"port"`
	User      string `json:"user"`
	Password  string `json:"password"`  // 留空保留；"-" 清除
	Command   string `json:"command"`   // 可选；空=默认 tailscale status --json
	HostKeyFp string `json:"hostKeyFp"` // 已确认的 SSH 主机指纹
}

// upsertMeshInstance 把入参合并进 bundle，返回 (实例, 是否新实例)。
func upsertMeshInstance(b *meshSettingsBundle, in meshInstancePutInput, enc func(string) (string, error), key []byte) (MeshInstance, bool, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	created := false
	inst := MeshInstance{}
	idx := -1
	for i := range b.Instances {
		if b.Instances[i].ID == in.ID {
			idx = i
			inst = b.Instances[i]
			break
		}
	}
	if idx < 0 {
		created = true
		inst = MeshInstance{ID: in.ID, CreatedAt: now}
		if strings.TrimSpace(inst.ID) == "" {
			inst.ID = fmt.Sprintf("mesh-%d", time.Now().UnixNano())
		}
	}
	inst.UpdatedAt = now
	inst.Name = strings.TrimSpace(in.Name)
	inst.Region = strings.TrimSpace(in.Region)
	inst.APIURL = strings.TrimSpace(in.APIURL)
	inst.ClientURL = strings.TrimSpace(in.ClientURL)
	if inst.ClientURL != "" {
		u, err := url.Parse(inst.ClientURL)
		if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			return inst, created, fmt.Errorf("客户端控制面地址必须是 HTTPS URL")
		}
	}
	inst.MetricsURL = strings.TrimSpace(in.MetricsURL)
	inst.HeadplaneURL = strings.TrimSpace(in.HeadplaneURL)
	inst.Notes = strings.TrimSpace(in.Notes)
	if in.Enabled != nil {
		inst.Enabled = *in.Enabled
	} else if created {
		inst.Enabled = true
	}
	// API Key：非空加密新值；"-" 清除；空保留旧密文
	if strings.TrimSpace(in.APIKey) == "-" {
		inst.APIKeyEnc = ""
	} else if strings.TrimSpace(in.APIKey) != "" {
		encVal, err := enc(strings.TrimSpace(in.APIKey))
		if err != nil {
			return inst, created, err
		}
		inst.APIKeyEnc = encVal
	}
	// 流量采集器：按提交列表全量替换
	collectors := make([]MeshTrafficCollector, 0, len(in.TrafficCollectors))
	oldByID := map[string]MeshTrafficCollector{}
	for _, c := range inst.TrafficCollectors {
		oldByID[c.ID] = c
	}
	for _, cin := range in.TrafficCollectors {
		c := MeshTrafficCollector{
			ID: cin.ID, Name: strings.TrimSpace(cin.Name),
			Host: strings.TrimSpace(cin.Host), Port: cin.Port, User: strings.TrimSpace(cin.User),
			Command: strings.TrimSpace(cin.Command), HostKeyFp: strings.TrimSpace(cin.HostKeyFp),
		}
		if strings.TrimSpace(c.ID) == "" {
			c.ID = fmt.Sprintf("tc-%d", time.Now().UnixNano())
		}
		if old, ok := oldByID[c.ID]; ok {
			sameEndpoint := meshCollectorEndpointMatches(old, c.Host, c.Port, c.User)
			if sameEndpoint {
				c.LastSnapshotAt = old.LastSnapshotAt
				c.LastError = old.LastError
				c.PassEnc = old.PassEnc
			}
			if strings.TrimSpace(cin.HostKeyFp) == "-" {
				c.HostKeyFp = ""
			} else if sameEndpoint && old.HostKeyFp != "" {
				c.HostKeyFp = old.HostKeyFp
			}
		}
		if strings.TrimSpace(cin.Password) == "-" {
			c.PassEnc = ""
		} else if strings.TrimSpace(cin.Password) != "" {
			encVal, err := enc(strings.TrimSpace(cin.Password))
			if err != nil {
				return inst, created, err
			}
			c.PassEnc = encVal
		}
		collectors = append(collectors, c)
	}
	inst.TrafficCollectors = collectors
	if idx >= 0 {
		b.Instances[idx] = inst
	} else {
		b.Instances = append(b.Instances, inst)
	}
	sort.Slice(b.Instances, func(i, j int) bool { return b.Instances[i].CreatedAt < b.Instances[j].CreatedAt })
	return inst, created, nil
}

// meshEncryptionKey 模块加密 key（与告警通道/AI 配置同一把 LABPLANE_ENCRYPTION_KEY）。
func meshEncryptionKey(cfg Config) ([]byte, error) {
	return opsEncryptionKey(cfg)
}
