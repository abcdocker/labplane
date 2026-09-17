package internal

import (
	"context"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// promLabelValue 将字符串安全放入 PromQL 标签匹配。
func promLabelValue(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return `"` + s + `"`
}

func prometheusInstantVectorNamespacePod(ctx context.Context, cfg Config, baseURL, query string) (map[string]float64, error) {
	u, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil {
		return nil, err
	}
	u.Path = strings.TrimSuffix(u.Path, "/") + "/api/v1/query"
	qv := url.Values{}
	qv.Set("query", query)
	u.RawQuery = qv.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	if tok := strings.TrimSpace(cfg.PrometheusBearerToken); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := prometheusHTTPClient(cfg).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, errPrometheusHTTP(resp.StatusCode)
	}
	var wrap struct {
		Status string `json:"status"`
		Data   struct {
			Result []struct {
				Metric map[string]string `json:"metric"`
				Value  []interface{}     `json:"value"`
			} `json:"result"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &wrap); err != nil {
		return nil, err
	}
	if wrap.Status != "success" {
		return nil, errPrometheusStatus
	}
	out := make(map[string]float64)
	for _, r := range wrap.Data.Result {
		ns := strings.TrimSpace(r.Metric["namespace"])
		pod := strings.TrimSpace(r.Metric["pod"])
		if ns == "" || pod == "" {
			continue
		}
		key := ns + "/" + pod
		if len(r.Value) < 2 {
			continue
		}
		s, ok := r.Value[1].(string)
		if !ok {
			continue
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil || math.IsNaN(f) || math.IsInf(f, 0) {
			continue
		}
		out[key] = f
	}
	return out, nil
}

// prometheusInstantVectorMetricLabel 执行 instant 查询，按指定标签聚合为 map（标签值为 key）。
func prometheusInstantVectorMetricLabel(ctx context.Context, cfg Config, baseURL, query, labelKey string) (map[string]float64, error) {
	u, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil {
		return nil, err
	}
	u.Path = strings.TrimSuffix(u.Path, "/") + "/api/v1/query"
	qv := url.Values{}
	qv.Set("query", query)
	u.RawQuery = qv.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	if tok := strings.TrimSpace(cfg.PrometheusBearerToken); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := prometheusHTTPClient(cfg).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, errPrometheusHTTP(resp.StatusCode)
	}
	var wrap struct {
		Status string `json:"status"`
		Data   struct {
			Result []struct {
				Metric map[string]string `json:"metric"`
				Value  []interface{}     `json:"value"`
			} `json:"result"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &wrap); err != nil {
		return nil, err
	}
	if wrap.Status != "success" {
		return nil, errPrometheusStatus
	}
	out := make(map[string]float64)
	for _, r := range wrap.Data.Result {
		k := strings.TrimSpace(r.Metric[labelKey])
		if k == "" {
			continue
		}
		if len(r.Value) < 2 {
			continue
		}
		s, ok := r.Value[1].(string)
		if !ok {
			continue
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil || math.IsNaN(f) || math.IsInf(f, 0) {
			continue
		}
		out[k] = f
	}
	return out, nil
}

// handleK8sPodsMetrics 聚合 Pod 的 CPU（核）与内存（字节），来自 cAdvisor container_* 指标。
// 数据源为 runtime 中 prometheusUrlK8s（或兜底 prometheusUrl）；VictoriaMetrics vmselect 与 Prometheus 均提供 /api/v1/query，可直接填 vmselect 地址。
func handleK8sPodsMetrics(c *gin.Context, cfg Config) {
	base := GetPrometheusURLForScope(cfg, "k8s")
	if strings.TrimSpace(base) == "" {
		c.JSON(http.StatusOK, gin.H{
			"available": false,
			"hint":      "未配置 Kubernetes 监控数据源：请在运行时设置 prometheusUrlK8s（或兜底 prometheusUrl）。VictoriaMetrics 的 vmselect 与 Prometheus 查询 API 兼容，可填其 HTTP 根地址。",
		})
		return
	}

	ns := strings.TrimSpace(c.Query("namespace"))
	podName := strings.TrimSpace(c.Query("pod"))
	var nsMatch string
	if ns != "" {
		nsMatch = "namespace=" + promLabelValue(ns)
	} else {
		nsMatch = `namespace!=""`
	}
	var podMatch string
	if podName != "" {
		podMatch = ",pod=" + promLabelValue(podName)
	} else {
		podMatch = `,pod!=""`
	}
	// 与集群 Prometheus 标量、resource-efficiency、Top 排行同一套 cAdvisor 标签过滤
	commonSel := nsMatch + podMatch + `,container!="",container!="POD"`
	cpuQ := `sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{` + commonSel + `}[5m]))`
	memQ := `sum by (namespace, pod) (container_memory_working_set_bytes{` + commonSel + `})`
	// Pod 级网络（无 container 过滤；部分集群仅 eth0 有流量）
	netSel := nsMatch + podMatch
	netRxQ := `sum by (namespace, pod) (rate(container_network_receive_bytes_total{` + netSel + `}[5m]))`
	netTxQ := `sum by (namespace, pod) (rate(container_network_transmit_bytes_total{` + netSel + `}[5m]))`

	ctx, cancel := context.WithTimeout(c.Request.Context(), 25*time.Second)
	defer cancel()

	cpu, errCPU := prometheusInstantVectorNamespacePod(ctx, cfg, base, cpuQ)
	mem, errMem := prometheusInstantVectorNamespacePod(ctx, cfg, base, memQ)
	netRx, errNetRx := prometheusInstantVectorNamespacePod(ctx, cfg, base, netRxQ)
	netTx, errNetTx := prometheusInstantVectorNamespacePod(ctx, cfg, base, netTxQ)

	var cpuByContainer map[string]float64
	var memByContainer map[string]float64
	var errCPUCont, errMemCont error
	if podName != "" {
		cpuContQ := `sum by (container) (rate(container_cpu_usage_seconds_total{` + commonSel + `}[5m]))`
		memContQ := `sum by (container) (container_memory_working_set_bytes{` + commonSel + `})`
		cpuByContainer, errCPUCont = prometheusInstantVectorMetricLabel(ctx, cfg, base, cpuContQ, "container")
		memByContainer, errMemCont = prometheusInstantVectorMetricLabel(ctx, cfg, base, memContQ, "container")
	}

	hint := ""
	if errCPU != nil {
		hint = "CPU 查询: " + errCPU.Error()
	}
	if errMem != nil {
		if hint != "" {
			hint += "; "
		}
		hint += "内存查询: " + errMem.Error()
	}
	if errNetRx != nil {
		if hint != "" {
			hint += "; "
		}
		hint += "网络入站查询: " + errNetRx.Error()
	}
	if errNetTx != nil {
		if hint != "" {
			hint += "; "
		}
		hint += "网络出站查询: " + errNetTx.Error()
	}
	if errCPUCont != nil {
		if hint != "" {
			hint += "; "
		}
		hint += "按容器 CPU: " + errCPUCont.Error()
	}
	if errMemCont != nil {
		if hint != "" {
			hint += "; "
		}
		hint += "按容器内存: " + errMemCont.Error()
	}

	// 与原先一致：仅当 CPU、内存两类查询均失败时视为不可用；网络失败只影响 net* 字段与 hint
	available := errCPU == nil || errMem == nil
	if !available {
		c.JSON(http.StatusOK, gin.H{
			"available":     false,
			"hint":          hint,
			"cpuCoresByPod": gin.H{},
			"memBytesByPod": gin.H{},
			"netRxBpsByPod": gin.H{},
			"netTxBpsByPod": gin.H{},
		})
		return
	}

	cpuH := gin.H{}
	for k, v := range cpu {
		cpuH[k] = v
	}
	memH := gin.H{}
	for k, v := range mem {
		memH[k] = v
	}
	netRxH := gin.H{}
	for k, v := range netRx {
		netRxH[k] = v
	}
	netTxH := gin.H{}
	for k, v := range netTx {
		netTxH[k] = v
	}

	cpuContH := gin.H{}
	memContH := gin.H{}
	if podName != "" && cpuByContainer != nil {
		for k, v := range cpuByContainer {
			if strings.TrimSpace(k) == "" || k == "POD" {
				continue
			}
			cpuContH[k] = v
		}
	}
	if podName != "" && memByContainer != nil {
		for k, v := range memByContainer {
			if strings.TrimSpace(k) == "" || k == "POD" {
				continue
			}
			memContH[k] = v
		}
	}

	hintOut := ""
	if errCPU != nil || errMem != nil || errNetRx != nil || errNetTx != nil || errCPUCont != nil || errMemCont != nil {
		hintOut = hint
	}

	out := gin.H{
		"available":     true,
		"hint":          hintOut,
		"backend":       "prometheus-compatible",
		"cpuCoresByPod": cpuH,
		"memBytesByPod": memH,
		"netRxBpsByPod": netRxH,
		"netTxBpsByPod": netTxH,
	}
	if podName != "" {
		out["cpuCoresByContainer"] = cpuContH
		out["memBytesByContainer"] = memContH
	}
	c.JSON(http.StatusOK, out)
}
