package internal

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

var (
	prometheusMu                   sync.RWMutex
	prometheusURLOverride        string // 全局兜底（兼容旧版「进程内覆盖」）
	prometheusURLOverrideK8s     string
	prometheusURLOverrideVCenter string
	prometheusURLOverrideCloud   string
)

func prometheusFallbackGlobalUnlocked(cfg Config) string {
	if s := strings.TrimSpace(prometheusURLOverride); s != "" {
		return s
	}
	return strings.TrimSpace(cfg.PrometheusURL)
}

// GetEffectivePrometheusURL 进程内全局覆盖优先，否则用 runtime/env 的 prometheusUrl（兜底）。
func GetEffectivePrometheusURL(cfg Config) string {
	prometheusMu.RLock()
	defer prometheusMu.RUnlock()
	return prometheusFallbackGlobalUnlocked(cfg)
}

// GetPrometheusURLForScope 按数据源解析：k8s / vcenter / cloud；cloud 未配置时继承 vcenter 再兜底全局。
func GetPrometheusURLForScope(cfg Config, scope string) string {
	prometheusMu.RLock()
	defer prometheusMu.RUnlock()
	sc := strings.ToLower(strings.TrimSpace(scope))
	if sc == "" {
		sc = "k8s"
	}
	switch sc {
	case "k8s", "kubernetes":
		if s := strings.TrimSpace(prometheusURLOverrideK8s); s != "" {
			return s
		}
		if s := strings.TrimSpace(cfg.VMSelectURLK8s); s != "" {
			return s
		}
		if s := strings.TrimSpace(cfg.PrometheusURLK8s); s != "" {
			return s
		}
	case "vcenter", "vm":
		if s := strings.TrimSpace(prometheusURLOverrideVCenter); s != "" {
			return s
		}
		if s := strings.TrimSpace(cfg.VMSelectURLVCenter); s != "" {
			return s
		}
		if s := strings.TrimSpace(cfg.PrometheusURLVCenter); s != "" {
			return s
		}
	case "cloud", "public":
		if s := strings.TrimSpace(prometheusURLOverrideCloud); s != "" {
			return s
		}
		if s := strings.TrimSpace(cfg.VMSelectURLCloud); s != "" {
			return s
		}
		if s := strings.TrimSpace(cfg.PrometheusURLCloud); s != "" {
			return s
		}
		if s := strings.TrimSpace(prometheusURLOverrideVCenter); s != "" {
			return s
		}
		if s := strings.TrimSpace(cfg.VMSelectURLVCenter); s != "" {
			return s
		}
		if s := strings.TrimSpace(cfg.PrometheusURLVCenter); s != "" {
			return s
		}
	}
	return prometheusFallbackGlobalUnlocked(cfg)
}

// SetPrometheusURLOverride 空字符串表示清除全局进程内覆盖。
func SetPrometheusURLOverride(u string) {
	prometheusMu.Lock()
	defer prometheusMu.Unlock()
	prometheusURLOverride = strings.TrimSpace(u)
}

// SetPrometheusURLOverrideForScope 按数据源设置进程内覆盖；scope 为 global 时同 SetPrometheusURLOverride。
func SetPrometheusURLOverrideForScope(scope, u string) {
	prometheusMu.Lock()
	defer prometheusMu.Unlock()
	u = strings.TrimSpace(u)
	switch strings.ToLower(strings.TrimSpace(scope)) {
	case "k8s", "kubernetes":
		prometheusURLOverrideK8s = u
	case "vcenter", "vm":
		prometheusURLOverrideVCenter = u
	case "cloud", "public":
		prometheusURLOverrideCloud = u
	default:
		prometheusURLOverride = u
	}
}

func maskPrometheusURL(raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "(invalid)"
	}
	return u.Scheme + "://" + u.Host + "/…"
}

func validatePrometheusBaseURL(raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("仅支持 http/https")
	}
	if u.Host == "" {
		return fmt.Errorf("缺少主机名")
	}
	return nil
}

func prometheusHTTPClient(cfg Config) *http.Client {
	t := cfg.PrometheusTimeout
	if t <= 0 {
		t = 30 * time.Second
	}
	tr := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: cfg.PrometheusSkipTLS,
			MinVersion:         tls.VersionTLS12,
		},
	}
	return &http.Client{Timeout: t, Transport: tr}
}

// PrometheusPromQLInstantProbe 即时查询：成功返回标量指针；失败返回 nil 与简短原因（供 AI 巡检等排障）。
func PrometheusPromQLInstantProbe(cfg Config, scope, promQL string) (*float64, string) {
	sc := strings.ToLower(strings.TrimSpace(scope))
	if sc == "" {
		sc = "k8s"
	}
	base := GetPrometheusURLForScope(cfg, sc)
	if base == "" {
		switch sc {
		case "k8s", "kubernetes":
			return nil, "未配置地址（请填运行时 prometheusUrlK8s 或兜底 prometheusUrl；与平台同集群时可填 http://<svc>.<ns>.svc:9090）"
		case "vcenter", "vm":
			return nil, "未配置地址（请填 prometheusUrlVcenter 或兜底 prometheusUrl）"
		default:
			return nil, "未配置该数据源的 Prometheus 根地址"
		}
	}
	q := strings.TrimSpace(promQL)
	if q == "" {
		return nil, "PromQL 为空"
	}
	u, err := url.Parse(strings.TrimRight(base, "/"))
	if err != nil {
		return nil, "URL 解析失败: " + err.Error()
	}
	u.Path = strings.TrimSuffix(u.Path, "/") + "/api/v1/query"
	qv := url.Values{}
	qv.Set("query", q)
	u.RawQuery = qv.Encode()
	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err.Error()
	}
	if tok := strings.TrimSpace(cfg.PrometheusBearerToken); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := prometheusHTTPClient(cfg).Do(req)
	if err != nil {
		return nil, "请求失败: " + err.Error()
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "读取响应失败: " + err.Error()
	}
	f, msg := promExtractFirstInstantFloat(body, resp.StatusCode)
	if f != nil {
		return f, ""
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Sprintf("HTTP %d（请确认根地址含协议/端口、TLS 与 prometheusSkipTls；同集群请用集群 DNS）", resp.StatusCode)
	}
	return nil, msg
}

// PrometheusPromQLInstantScalar runs an instant query and returns the first scalar sample, or nil if absent/invalid.
func PrometheusPromQLInstantScalar(cfg Config, scope, promQL string) *float64 {
	v, _ := PrometheusPromQLInstantProbe(cfg, scope, promQL)
	return v
}

// promFloatFromJSONSample 解析 Prometheus /api/v1/query 中 value 的第二项（字符串或 JSON 数字）。
func promFloatFromJSONSample(v interface{}) (float64, bool) {
	switch x := v.(type) {
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		return f, err == nil && !math.IsNaN(f) && !math.IsInf(f, 0)
	case float64:
		return x, !math.IsNaN(x) && !math.IsInf(x, 0)
	case json.Number:
		f, err := x.Float64()
		return f, err == nil && !math.IsNaN(f) && !math.IsInf(f, 0)
	default:
		return 0, false
	}
}

// promExtractFirstInstantFloat 解析 instant query 响应（vector 单点、scalar 类型或 value 为 JSON 数字）。
func promExtractFirstInstantFloat(body []byte, httpStatus int) (*float64, string) {
	if httpStatus >= http.StatusBadRequest {
		return nil, fmt.Sprintf("HTTP %d", httpStatus)
	}
	var wrap struct {
		Status string          `json:"status"`
		Data   json.RawMessage `json:"data"`
	}
	if json.Unmarshal(body, &wrap) != nil {
		return nil, "JSON 解析失败"
	}
	if wrap.Status != "success" {
		return nil, "Prometheus status=" + wrap.Status
	}
	var dataObj struct {
		ResultType string          `json:"resultType"`
		Result     json.RawMessage `json:"result"`
	}
	if json.Unmarshal(wrap.Data, &dataObj) != nil {
		return nil, "data 解析失败"
	}
	if dataObj.ResultType == "scalar" || dataObj.ResultType == "string" {
		var arr []interface{}
		if json.Unmarshal(dataObj.Result, &arr) == nil && len(arr) >= 2 {
			if f, ok := promFloatFromJSONSample(arr[1]); ok {
				out := f
				return &out, ""
			}
		}
	}
	var vec []struct {
		Value []interface{} `json:"value"`
	}
	if json.Unmarshal(dataObj.Result, &vec) == nil && len(vec) > 0 && len(vec[0].Value) >= 2 {
		if f, ok := promFloatFromJSONSample(vec[0].Value[1]); ok {
			out := f
			return &out, ""
		}
	}
	var bare []interface{}
	if json.Unmarshal(dataObj.Result, &bare) == nil && len(bare) == 2 {
		if f, ok := promFloatFromJSONSample(bare[1]); ok {
			out := f
			return &out, ""
		}
	}
	return nil, "查询无数据点（Instant 无样本；或 vmSelectUrlK8s 与 Prometheus 不是同一套数据）。若 UI 有曲线而此处无，可加 ?refresh=1 拉齐 Redis 缓存。"
}

func parsePrometheusInstantQueryFirstScalar(body []byte, httpStatus int) (*float64, string) {
	return promExtractFirstInstantFloat(body, httpStatus)
}

// K8sPrometheusQuerySourceNote 说明监控页 PromQL 实际走哪条运行时配置（vmselect 优先）。
func K8sPrometheusQuerySourceNote(cfg Config) string {
	if strings.TrimSpace(cfg.VMSelectURLK8s) != "" {
		return "vmSelectUrlK8s（优先于 prometheusUrlK8s；此处若无 kube_*，监控页也会空）"
	}
	return "prometheusUrlK8s（及兜底 prometheusUrl、进程内覆盖）"
}

// PrometheusKubeNodeInfoCountProbe 短超时查询 count(kube_node_info)：区分「集群内 Prometheus Pod 已 Running」与「平台当前配置的查询地址里是否真有 kube-state-metrics 指标」。
func PrometheusKubeNodeInfoCountProbe(cfg Config) (count *float64, detail string, querySourceNote string, effectiveURLMasked string) {
	querySourceNote = K8sPrometheusQuerySourceNote(cfg)
	base := strings.TrimSpace(GetPrometheusURLForScope(cfg, "k8s"))
	if base == "" {
		return nil, "未配置 K8s Prometheus/VM 查询地址", querySourceNote, ""
	}
	effectiveURLMasked = maskPrometheusURL(base)

	const d = 5 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), d)
	defer cancel()

	u, err := url.Parse(strings.TrimRight(base, "/"))
	if err != nil {
		return nil, "URL 解析失败: " + err.Error(), querySourceNote, effectiveURLMasked
	}
	u.Path = strings.TrimSuffix(u.Path, "/") + "/api/v1/query"
	uv := url.Values{}
	cli := &http.Client{
		Timeout:   d,
		Transport: prometheusHTTPClient(cfg).Transport,
	}
	probeQueries := []string{
		"count(kube_node_info)",
		"count(kube_pod_info)",
		"count(kube_namespace_labels)",
	}
	var val *float64
	var lastErr string
	for _, pq := range probeQueries {
		uv.Set("query", pq)
		u.RawQuery = uv.Encode()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		if err != nil {
			lastErr = err.Error()
			continue
		}
		if tok := strings.TrimSpace(cfg.PrometheusBearerToken); tok != "" {
			req.Header.Set("Authorization", "Bearer "+tok)
		}
		resp2, err := cli.Do(req)
		if err != nil {
			lastErr = "请求失败: " + err.Error() + "（集群外进程无法解析 *.svc 时常见；请改为 Ingress/NodePort 可达地址）"
			continue
		}
		b, rerr := io.ReadAll(resp2.Body)
		resp2.Body.Close()
		if rerr != nil {
			lastErr = "读取响应: " + rerr.Error()
			continue
		}
		v, perr := parsePrometheusInstantQueryFirstScalar(b, resp2.StatusCode)
		if v != nil && *v > 0 {
			val = v
			lastErr = ""
			break
		}
		if resp2.StatusCode >= http.StatusBadRequest {
			lastErr = perr + " · " + truncateErrMessage(string(b), 160)
			continue
		}
		if perr != "" {
			lastErr = perr
		} else if v != nil && *v == 0 {
			lastErr = "查询成功但计数为 0（" + pq + "）"
		}
	}
	if val != nil {
		return val, "", querySourceNote, effectiveURLMasked
	}
	if lastErr != "" {
		return nil, lastErr, querySourceNote, effectiveURLMasked
	}
	return nil, "kube-state-metrics 探测无正计数（已尝试 kube_node_info / kube_pod_info / kube_namespace_labels）", querySourceNote, effectiveURLMasked
}

func handlePrometheusStatus(c *gin.Context, cfg Config) {
	prometheusMu.RLock()
	ov := prometheusURLOverride
	ovK := prometheusURLOverrideK8s
	ovV := prometheusURLOverrideVCenter
	ovC := prometheusURLOverrideCloud
	prometheusMu.RUnlock()
	u := GetEffectivePrometheusURL(cfg)
	uk := GetPrometheusURLForScope(cfg, "k8s")
	uv := GetPrometheusURLForScope(cfg, "vcenter")
	uc := GetPrometheusURLForScope(cfg, "cloud")
	c.JSON(http.StatusOK, gin.H{
		"configured":     u != "",
		"urlHint":        maskPrometheusURL(u),
		"sourceEnv":      strings.TrimSpace(cfg.PrometheusURL) != "",
		"sourceOverride": strings.TrimSpace(ov) != "",
		"scopes": gin.H{
			"k8s": gin.H{
				"configured":     uk != "",
				"urlHint":        maskPrometheusURL(uk),
				"sourceOverride": strings.TrimSpace(ovK) != "",
			},
			"vcenter": gin.H{
				"configured":     uv != "",
				"urlHint":        maskPrometheusURL(uv),
				"sourceOverride": strings.TrimSpace(ovV) != "",
			},
			"cloud": gin.H{
				"configured":     uc != "",
				"urlHint":        maskPrometheusURL(uc),
				"sourceOverride": strings.TrimSpace(ovC) != "",
			},
		},
	})
}

type prometheusSourceBody struct {
	BaseURL string `json:"baseUrl"`
	Scope   string `json:"scope"` // k8s | vcenter | cloud | global（默认 global，兼容旧客户端）
}

func handlePrometheusSource(c *gin.Context, cfg Config) {
	var body prometheusSourceBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
		return
	}
	raw := strings.TrimSpace(body.BaseURL)
	sc := strings.ToLower(strings.TrimSpace(body.Scope))
	if sc == "" {
		sc = "global"
	}
	if raw == "" {
		SetPrometheusURLOverrideForScope(sc, "")
		SetAuditDetail(c, "已清除进程内 Prometheus 覆盖（scope="+sc+"）")
		c.JSON(http.StatusOK, gin.H{"message": "已清除该数据源的进程内 Prometheus 覆盖"})
		return
	}
	if err := validatePrometheusBaseURL(raw); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetPrometheusURLOverrideForScope(sc, raw)
	SetAuditDetail(c, "已设置进程内 Prometheus（scope="+sc+"）→ "+maskPrometheusURL(raw))
	c.JSON(http.StatusOK, gin.H{"message": "已保存 Prometheus 地址（仅当前进程有效；持久化请写入 runtime-config 对应字段）"})
}

func prometheusFetchInstant(cfg Config, scope, q string) (body []byte, status int, err error) {
	base := GetPrometheusURLForScope(cfg, scope)
	if base == "" {
		return nil, 0, fmt.Errorf("no prometheus")
	}
	u, err := url.Parse(strings.TrimRight(base, "/"))
	if err != nil {
		return nil, 0, err
	}
	u.Path = strings.TrimSuffix(u.Path, "/") + "/api/v1/query"
	uv := url.Values{}
	uv.Set("query", q)
	u.RawQuery = uv.Encode()
	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, 0, err
	}
	if tok := strings.TrimSpace(cfg.PrometheusBearerToken); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := prometheusHTTPClient(cfg).Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err = io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return body, resp.StatusCode, nil
}

func prometheusFetchRange(cfg Config, scope, q, start, end, step string) (body []byte, status int, err error) {
	base := GetPrometheusURLForScope(cfg, scope)
	if base == "" {
		return nil, 0, fmt.Errorf("no prometheus")
	}
	u, err := url.Parse(strings.TrimRight(base, "/"))
	if err != nil {
		return nil, 0, err
	}
	u.Path = strings.TrimSuffix(u.Path, "/") + "/api/v1/query_range"
	uv := url.Values{}
	uv.Set("query", q)
	uv.Set("start", start)
	uv.Set("end", end)
	uv.Set("step", step)
	u.RawQuery = uv.Encode()
	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, 0, err
	}
	if tok := strings.TrimSpace(cfg.PrometheusBearerToken); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := prometheusHTTPClient(cfg).Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err = io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return body, resp.StatusCode, nil
}

func handlePrometheusQuery(c *gin.Context, app *ServerApp) {
	cfg := app.Cfg()
	ctx := c.Request.Context()
	var scope, q string
	if c.Request.Method == http.MethodPost {
		var body struct {
			Scope string `json:"scope"`
			Q     string `json:"q"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 需包含 scope 与 q（PromQL）"})
			return
		}
		scope = strings.ToLower(strings.TrimSpace(body.Scope))
		q = strings.TrimSpace(body.Q)
	} else {
		scope = strings.ToLower(strings.TrimSpace(c.Query("scope")))
		q = strings.TrimSpace(c.Query("q"))
	}
	if scope == "" {
		scope = "k8s"
	}
	if q == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少查询参数 q（PromQL）；推荐使用 POST /api/prometheus/query，body 含 scope 与 q，避免在 URL/访问日志中暴露 PromQL"})
		return
	}
	if GetPrometheusURLForScope(cfg, scope) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未配置该数据源的 Prometheus：请在运行时配置 prometheusUrlK8s / prometheusUrlVcenter 或兜底 prometheusUrl，或环境变量 PROMETHEUS_URL_*"})
		return
	}
	cacheKey := prometheusCacheKeyInstant(scope, q)
	if b, ok := prometheusCacheGet(ctx, app.Redis(), cacheKey); ok {
		var parsed interface{}
		if json.Unmarshal(b, &parsed) == nil {
			c.JSON(http.StatusOK, parsed)
			return
		}
	}
	body, status, err := prometheusFetchInstant(cfg, scope, q)
	if err != nil {
		if err.Error() == "no prometheus" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "未配置该数据源的 Prometheus"})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "请求 Prometheus 失败: " + err.Error()})
		return
	}
	if status >= http.StatusBadRequest {
		c.JSON(status, gin.H{"error": "Prometheus HTTP " + fmt.Sprint(status), "body": string(body)})
		return
	}
	prometheusCachePut(ctx, app.Redis(), cacheKey, body)
	var parsed interface{}
	if err := json.Unmarshal(body, &parsed); err != nil {
		c.Data(http.StatusOK, "application/json; charset=utf-8", body)
		return
	}
	c.JSON(http.StatusOK, parsed)
}

func handlePrometheusQueryRange(c *gin.Context, app *ServerApp) {
	cfg := app.Cfg()
	ctx := c.Request.Context()
	var scope, q, start, end, step string
	if c.Request.Method == http.MethodPost {
		var body struct {
			Scope string `json:"scope"`
			Q     string `json:"q"`
			Start string `json:"start"`
			End   string `json:"end"`
			Step  string `json:"step"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 需包含 scope、q、start、end、step"})
			return
		}
		scope = strings.ToLower(strings.TrimSpace(body.Scope))
		q = strings.TrimSpace(body.Q)
		start = strings.TrimSpace(body.Start)
		end = strings.TrimSpace(body.End)
		step = strings.TrimSpace(body.Step)
	} else {
		scope = strings.ToLower(strings.TrimSpace(c.Query("scope")))
		q = strings.TrimSpace(c.Query("q"))
		start = strings.TrimSpace(c.Query("start"))
		end = strings.TrimSpace(c.Query("end"))
		step = strings.TrimSpace(c.Query("step"))
	}
	if scope == "" {
		scope = "k8s"
	}
	if q == "" || start == "" || end == "" || step == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要 q、start、end、step；推荐使用 POST /api/prometheus/query_range，body 传参"})
		return
	}
	if GetPrometheusURLForScope(cfg, scope) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未配置 Prometheus"})
		return
	}
	cacheKey := prometheusCacheKeyRange(scope, q, start, end, step)
	if b, ok := prometheusCacheGet(ctx, app.Redis(), cacheKey); ok {
		var parsed interface{}
		if json.Unmarshal(b, &parsed) == nil {
			c.JSON(http.StatusOK, parsed)
			return
		}
	}
	body, status, err := prometheusFetchRange(cfg, scope, q, start, end, step)
	if err != nil {
		if err.Error() == "no prometheus" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "未配置 Prometheus"})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "请求 Prometheus 失败: " + err.Error()})
		return
	}
	if status >= http.StatusBadRequest {
		c.JSON(status, gin.H{"error": "Prometheus HTTP " + fmt.Sprint(status), "body": string(body)})
		return
	}
	prometheusCachePut(ctx, app.Redis(), cacheKey, body)
	var parsed interface{}
	if err := json.Unmarshal(body, &parsed); err != nil {
		c.Data(http.StatusOK, "application/json; charset=utf-8", body)
		return
	}
	c.JSON(http.StatusOK, parsed)
}
