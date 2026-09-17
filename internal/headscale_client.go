package internal

// Headscale 控制面 REST 客户端（gRPC-gateway，适配 v0.26–v0.28 实测路径）：
//   GET  /api/v1/health
//   GET  /api/v1/user
//   GET  /api/v1/node
//   POST /api/v1/node/{id}/expire | DELETE /api/v1/node/{id}
//   POST /api/v1/node/{id}/tags          {"tags":[...]}
//   POST /api/v1/node/{id}/approved_routes {"routes":[...]}   （v0.26+ 路由审批在节点上）
//   GET  /api/v1/preauthkey?user=...  / POST /api/v1/preauthkey / POST /api/v1/preauthkey/expire
// 认证：Authorization: Bearer <api key>。

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type headscaleClient struct {
	base   *url.URL
	apiKey string
	hc     *http.Client
}

// meshAllowLoopbackForTest 仅同包单测使用：httptest 服务器监听环回地址，需放行。
var meshAllowLoopbackForTest bool

// validateMeshOutboundURL 出站 URL 校验：仅 http/https、host 非空；
// 拒绝 localhost/环回/未指定地址与 169.254 链路本地（元数据）段。私网网段允许——
// 本平台定位为内网运维工具，需直连内网 headscale/Grafana 等控制面（与既有模块一致）。
func validateMeshOutboundURL(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, fmt.Errorf("地址无效：仅支持 http/https")
	}
	if u.Host == "" {
		return nil, fmt.Errorf("地址无效：缺少 host")
	}
	host := strings.ToLower(u.Hostname())
	loopbackish := host == "localhost" || host == "0.0.0.0" || strings.HasSuffix(host, ".localhost")
	if ip := net.ParseIP(host); ip != nil {
		loopbackish = loopbackish || ip.IsLoopback() || ip.IsUnspecified() ||
			ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast()
	}
	if loopbackish && !meshAllowLoopbackForTest {
		return nil, fmt.Errorf("地址无效：不允许指向回环/链路本地（元数据）地址")
	}
	return u, nil
}

func newHeadscaleClient(baseURL, apiKey string, timeout time.Duration) (*headscaleClient, error) {
	u, err := validateMeshOutboundURL(baseURL)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(apiKey) == "" {
		return nil, fmt.Errorf("未配置 API Key")
	}
	if timeout <= 0 {
		timeout = 12 * time.Second
	}
	return &headscaleClient{base: u, apiKey: strings.TrimSpace(apiKey), hc: &http.Client{Timeout: timeout}}, nil
}

func (h *headscaleClient) do(ctx context.Context, method, path string, query url.Values, body any, out any) error {
	u := *h.base
	u.Path = strings.TrimSuffix(u.Path, "/") + path
	if query != nil {
		u.RawQuery = query.Encode()
	}
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, u.String(), rd)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+h.apiKey)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := h.hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if resp.StatusCode >= 400 {
		msg := strings.TrimSpace(string(raw))
		var he struct {
			Message string `json:"message"`
		}
		if json.Unmarshal(raw, &he) == nil && strings.TrimSpace(he.Message) != "" {
			msg = he.Message
		}
		if len(msg) > 300 {
			msg = msg[:300]
		}
		return fmt.Errorf("headscale HTTP %d: %s", resp.StatusCode, msg)
	}
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("解析 headscale 响应失败: %w", err)
		}
	}
	return nil
}

// ── 类型（v0.28 实测字段）──

type HSUser struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
	Provider    string `json:"provider"`
	ProviderID  string `json:"providerId"`
	CreatedAt   string `json:"createdAt"`
}

type HSNode struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	GivenName       string   `json:"givenName"`
	IPAddresses     []string `json:"ipAddresses"`
	User            HSUser   `json:"user"`
	Online          bool     `json:"online"`
	LastSeen        string   `json:"lastSeen"`
	Expiry          string   `json:"expiry"`
	CreatedAt       string   `json:"createdAt"`
	RegisterMethod  string   `json:"registerMethod"`
	ApprovedRoutes  []string `json:"approvedRoutes"`
	AvailableRoutes []string `json:"availableRoutes"`
	SubnetRoutes    []string `json:"subnetRoutes"`
	Tags            []string `json:"tags"`
	ForcedTags      []string `json:"forcedTags"`
	InvalidTags     []string `json:"invalidTags"`
}

type HSPreAuthKey struct {
	User       HSUser   `json:"user"`
	ID         string   `json:"id"`
	Key        string   `json:"key"` // 列表接口 headscale 返回打码值
	Reusable   bool     `json:"reusable"`
	Ephemeral  bool     `json:"ephemeral"`
	Used       bool     `json:"used"`
	AclTags    []string `json:"aclTags"`
	Expiration string   `json:"expiration"`
	CreatedAt  string   `json:"createdAt"`
}

// ── API 封装 ──

func (h *headscaleClient) Health(ctx context.Context) error {
	return h.do(ctx, http.MethodGet, "/api/v1/health", nil, nil, nil)
}

func (h *headscaleClient) ListUsers(ctx context.Context) ([]HSUser, error) {
	var out struct {
		Users []HSUser `json:"users"`
	}
	err := h.do(ctx, http.MethodGet, "/api/v1/user", nil, nil, &out)
	return out.Users, err
}

func (h *headscaleClient) ListNodes(ctx context.Context) ([]HSNode, error) {
	var out struct {
		Nodes []HSNode `json:"nodes"`
	}
	err := h.do(ctx, http.MethodGet, "/api/v1/node", nil, nil, &out)
	return out.Nodes, err
}

func (h *headscaleClient) ExpireNode(ctx context.Context, nodeID string) error {
	return h.do(ctx, http.MethodPost, "/api/v1/node/"+url.PathEscape(nodeID)+"/expire", nil, map[string]any{}, nil)
}

func (h *headscaleClient) DeleteNode(ctx context.Context, nodeID string) error {
	return h.do(ctx, http.MethodDelete, "/api/v1/node/"+url.PathEscape(nodeID), nil, nil, nil)
}

func (h *headscaleClient) SetTags(ctx context.Context, nodeID string, tags []string) error {
	return h.do(ctx, http.MethodPost, "/api/v1/node/"+url.PathEscape(nodeID)+"/tags", nil, map[string]any{"tags": tags}, nil)
}

// SetApprovedRoutes 覆盖式审批节点子网路由（v0.28 实测路径为 approve_routes）。
func (h *headscaleClient) SetApprovedRoutes(ctx context.Context, nodeID string, routes []string) error {
	return h.do(ctx, http.MethodPost, "/api/v1/node/"+url.PathEscape(nodeID)+"/approve_routes", nil, map[string]any{"routes": routes}, nil)
}

func (h *headscaleClient) ListPreAuthKeys(ctx context.Context, user string) ([]HSPreAuthKey, error) {
	q := url.Values{"user": []string{user}}
	var out struct {
		PreAuthKeys []HSPreAuthKey `json:"preAuthKeys"`
	}
	err := h.do(ctx, http.MethodGet, "/api/v1/preauthkey", q, nil, &out)
	return out.PreAuthKeys, err
}

// CreatePreAuthKey 创建预授权密钥；v0.28 的 user 字段要求用户数字 ID。
// 响应为 {"preAuthKey": {...}} 包装结构，需解包后才能拿到完整 key。
func (h *headscaleClient) CreatePreAuthKey(ctx context.Context, userID int64, reusable, ephemeral bool, expiration *time.Time, aclTags []string) (HSPreAuthKey, error) {
	body := map[string]any{"user": userID, "reusable": reusable, "ephemeral": ephemeral, "aclTags": aclTags}
	if expiration != nil {
		body["expiration"] = expiration.UTC().Format(time.RFC3339)
	}
	var wrapper struct {
		PreAuthKey HSPreAuthKey `json:"preAuthKey"`
	}
	err := h.do(ctx, http.MethodPost, "/api/v1/preauthkey", nil, body, &wrapper)
	return wrapper.PreAuthKey, err
}

// ExpirePreAuthKey 使预授权密钥过期；userID 为数字 ID，key 为完整密钥值。
func (h *headscaleClient) ExpirePreAuthKey(ctx context.Context, userID int64, key string) error {
	return h.do(ctx, http.MethodPost, "/api/v1/preauthkey/expire", nil, map[string]any{"user": userID, "key": key}, nil)
}

// ── Prometheus /metrics 抓取与精简解析 ──

type HSMetricSample struct {
	Name   string            `json:"name"`
	Value  float64           `json:"value"`
	Labels map[string]string `json:"labels,omitempty"`
}

// FetchMetrics 拉取 /metrics 并返回（name+labels → value）样本列表与总数。
// metricsURL 为空时按 APIURL 主机推导 http://<host>:9090/metrics。
func FetchMetrics(ctx context.Context, metricsURL, apiKey string, timeout time.Duration) ([]HSMetricSample, error) {
	target := strings.TrimSpace(metricsURL)
	if target == "" {
		return nil, fmt.Errorf("未配置 metrics 地址")
	}
	u, err := validateMeshOutboundURL(target)
	if err != nil {
		return nil, err
	}
	hc := &http.Client{Timeout: timeout}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(apiKey) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	}
	resp, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("metrics HTTP %d", resp.StatusCode)
	}
	return parsePromText(bufio.NewScanner(io.LimitReader(resp.Body, 4<<20))), nil
}

func parsePromText(sc *bufio.Scanner) []HSMetricSample {
	out := []HSMetricSample{}
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		name, rest := line, ""
		if i := strings.IndexAny(line, " \t"); i >= 0 {
			name, rest = line[:i], strings.TrimSpace(line[i+1:])
		}
		valStr := rest
		labels := map[string]string{}
		if strings.HasSuffix(name, "}") {
			// name{label="v",...} value
			if j := strings.Index(name, "{"); j > 0 {
				lbls := name[j+1 : len(name)-1]
				name = name[:j]
				for _, kv := range splitPromLabels(lbls) {
					if e := strings.Index(kv, "="); e > 0 {
						k := strings.TrimSpace(kv[:e])
						v := strings.Trim(strings.TrimSpace(kv[e+1:]), "\"")
						labels[k] = v
					}
				}
			}
			if f := strings.Fields(rest); len(f) > 0 {
				valStr = f[0]
			}
		}
		v, err := strconv.ParseFloat(valStr, 64)
		if err != nil {
			continue
		}
		out = append(out, HSMetricSample{Name: name, Value: v, Labels: labels})
	}
	return out
}

func splitPromLabels(s string) []string {
	var parts []string
	depth, inStr, last := 0, false, 0
	for i, r := range s {
		switch {
		case r == '"':
			inStr = !inStr
		case inStr:
		case r == '{':
			depth++
		case r == '}':
			depth--
		case r == ',' && depth == 0:
			parts = append(parts, s[last:i])
			last = i + 1
		}
	}
	parts = append(parts, s[last:])
	return parts
}
