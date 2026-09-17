package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// Telegraf vSphere 输入常见指标（KB/s）；按 vmname 聚合多块盘 / 多网卡。
// 参考：inputs.vsphere 文档中的 vsphere_vm_virtualDisk_* / vsphere_vm_net_*。

var vsphereIODiskReadQueries = []string{
	`sum by (vmname)(vsphere_vm_virtualDisk_read_average)`,
	`sum by (vm_name)(vsphere_vm_virtualDisk_read_average)`,
}

var vsphereIODiskWriteQueries = []string{
	`sum by (vmname)(vsphere_vm_virtualDisk_write_average)`,
	`sum by (vm_name)(vsphere_vm_virtualDisk_write_average)`,
}

var vsphereIONetRxQueries = []string{
	`sum by (vmname)(vsphere_vm_net_bytesRx_average)`,
	`sum by (vm_name)(vsphere_vm_net_bytesRx_average)`,
}

var vsphereIONetTxQueries = []string{
	`sum by (vmname)(vsphere_vm_net_bytesTx_average)`,
	`sum by (vm_name)(vsphere_vm_net_bytesTx_average)`,
}

func prometheusInstantVector(ctx context.Context, cfg Config, baseURL, query string) (map[string]float64, error) {
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
		vm := firstVMNameLabel(r.Metric)
		if vm == "" {
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
		out[vm] = f
	}
	return out, nil
}

func firstVMNameLabel(m map[string]string) string {
	for _, k := range []string{"vmname", "vm_name", "name"} {
		if v := strings.TrimSpace(m[k]); v != "" {
			return v
		}
	}
	return ""
}

func errPrometheusHTTP(code int) error { return errPromHTTP{code: code} }

type errPromHTTP struct{ code int }

func (e errPromHTTP) Error() string { return "prometheus http" }

var errPrometheusStatus = errPromStatus{}

type errPromStatus struct{}

func (e errPromStatus) Error() string { return "prometheus status" }

func firstNonEmptyVector(ctx context.Context, cfg Config, base string, queries []string) (map[string]float64, string, error) {
	var lastErr error
	for _, q := range queries {
		m, err := prometheusInstantVector(ctx, cfg, base, q)
		if err != nil {
			lastErr = err
			continue
		}
		if len(m) > 0 {
			return m, q, nil
		}
	}
	if lastErr != nil {
		return nil, "", lastErr
	}
	return map[string]float64{}, "", nil
}

// prometheusInstantVectorByLabelKey 对 instant query 结果按指定 label 聚合为 map（取该 series 的 value）。
func prometheusInstantVectorByLabelKey(ctx context.Context, cfg Config, baseURL, query, labelKey string) (map[string]float64, error) {
	labelKey = strings.TrimSpace(labelKey)
	if labelKey == "" {
		return nil, fmt.Errorf("labelKey 为空")
	}
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

func firstNonEmptyVectorByLabelKey(ctx context.Context, cfg Config, base string, queries []string, labelKey string) (map[string]float64, string, error) {
	var lastErr error
	for _, q := range queries {
		m, err := prometheusInstantVectorByLabelKey(ctx, cfg, base, q, labelKey)
		if err != nil {
			lastErr = err
			continue
		}
		if len(m) > 0 {
			return m, q, nil
		}
	}
	if lastErr != nil {
		return nil, "", lastErr
	}
	return map[string]float64{}, "", nil
}

// PrometheusMetricSample Prometheus /api/v1/query instant 单条向量样本。
type PrometheusMetricSample struct {
	Metric map[string]string `json:"metric"`
	Value  float64           `json:"value"`
}

func prometheusInstantQuerySamples(ctx context.Context, cfg Config, baseURL, query string) ([]PrometheusMetricSample, error) {
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
	var out []PrometheusMetricSample
	for _, r := range wrap.Data.Result {
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
		out = append(out, PrometheusMetricSample{Metric: r.Metric, Value: f})
	}
	return out, nil
}

func firstNonEmptySamples(ctx context.Context, cfg Config, base string, queries []string) ([]PrometheusMetricSample, string, error) {
	var lastErr error
	for _, q := range queries {
		s, err := prometheusInstantQuerySamples(ctx, cfg, base, q)
		if err != nil {
			lastErr = err
			continue
		}
		if len(s) > 0 {
			return s, q, nil
		}
	}
	if lastErr != nil {
		return nil, "", lastErr
	}
	return []PrometheusMetricSample{}, "", nil
}

func handleVCenterVMsPrometheusIO(c *gin.Context, cfg Config) {
	base := GetPrometheusURLForScope(cfg, "vcenter")
	if base == "" {
		c.JSON(http.StatusOK, gin.H{
			"prometheusConfigured": false,
			"ratesByName":          gin.H{},
			"needVcenterFallback":  true,
			"note":                 "未配置 vCenter 数据源 Prometheus（prometheusUrlVcenter 或兜底 prometheusUrl）",
		})
		return
	}
	ctx := c.Request.Context()

	dr, qDr, errDr := firstNonEmptyVector(ctx, cfg, base, vsphereIODiskReadQueries)
	dw, qDw, errDw := firstNonEmptyVector(ctx, cfg, base, vsphereIODiskWriteQueries)
	nrx, qNrx, errNrx := firstNonEmptyVector(ctx, cfg, base, vsphereIONetRxQueries)
	ntx, qNtx, errNtx := firstNonEmptyVector(ctx, cfg, base, vsphereIONetTxQueries)

	dr = safeFloatMap(dr)
	dw = safeFloatMap(dw)
	nrx = safeFloatMap(nrx)
	ntx = safeFloatMap(ntx)

	if errDr != nil && errDw != nil && errNrx != nil && errNtx != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error": "Prometheus 查询失败（请确认已抓取 Telegraf vSphere 指标且可访问）",
		})
		return
	}

	allNames := map[string]struct{}{}
	for k := range dr {
		allNames[k] = struct{}{}
	}
	for k := range dw {
		allNames[k] = struct{}{}
	}
	for k := range nrx {
		allNames[k] = struct{}{}
	}
	for k := range ntx {
		allNames[k] = struct{}{}
	}

	ratesByName := make(map[string]gin.H, len(allNames))
	u := "kiloBytesPerSecond"
	for n := range allNames {
		row := gin.H{
			"diskReadUnit": u, "diskWriteUnit": u, "netRxUnit": u, "netTxUnit": u,
		}
		if v, ok := dr[n]; ok {
			row["diskRead"] = v
		} else {
			row["diskRead"] = 0.0
		}
		if v, ok := dw[n]; ok {
			row["diskWrite"] = v
		} else {
			row["diskWrite"] = 0.0
		}
		if v, ok := nrx[n]; ok {
			row["netRx"] = v
		} else {
			row["netRx"] = 0.0
		}
		if v, ok := ntx[n]; ok {
			row["netTx"] = v
		} else {
			row["netTx"] = 0.0
		}
		ratesByName[n] = row
	}

	needFallback := len(allNames) == 0
	note := "磁盘/网络 IO 来自 Prometheus（Telegraf vSphere，按 vmname 与列表「名称」匹配；单位为 KB/s，与 vCenter 列表展示一致）。"
	if needFallback {
		note += " 当前未查到任何 vsphere_vm_* 序列，将回退 vCenter 性能 API（若前端启用）。"
	}

	c.JSON(http.StatusOK, gin.H{
		"prometheusConfigured":  true,
		"ratesByName":           ratesByName,
		"needVcenterFallback":   needFallback,
		"note":                  note,
		"queriesUsed":           gin.H{"diskRead": qDr, "diskWrite": qDw, "netRx": qNrx, "netTx": qNtx},
	})
}

func safeFloatMap(m map[string]float64) map[string]float64 {
	if m == nil {
		return map[string]float64{}
	}
	return m
}
