package internal

import (
	"fmt"
	"net/http"
	"sort"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

// K8sPodNetworkTopWindows 与前端「统计范围」选项一致（Prometheus range 子句）。
var K8sPodNetworkTopWindows = []string{"1m", "10m", "1d", "3d", "7d"}

const k8sPodNetSelector = `namespace!="",pod!=""`
const k8sPodNetTopN = 10

// podTCPConnectionQueries 即时 gauge，与流量时间窗口无关；按序尝试直至有数据。
var podTCPConnectionQueries = []string{
	`sum by (namespace, pod) (container_network_tcp_open_sockets{` + k8sPodNetSelector + `})`,
	`sum by (namespace, pod) (container_network_tcp_socket_states{` + k8sPodNetSelector + `})`,
}

func promqlPodNetIncrease(metric, window string) string {
	return fmt.Sprintf(
		`sum by (namespace, pod) (increase(%s{%s}[%s]))`,
		metric, k8sPodNetSelector, window,
	)
}

func metricMapFromGinH(h gin.H) map[string]string {
	raw, ok := h["metric"]
	if !ok || raw == nil {
		return nil
	}
	switch m := raw.(type) {
	case map[string]string:
		return m
	case map[string]interface{}:
		out := make(map[string]string, len(m))
		for k, v := range m {
			if s, ok := v.(string); ok {
				out[k] = s
			}
		}
		return out
	default:
		return nil
	}
}

func floatFromGinH(h gin.H) float64 {
	v, _ := h["value"].(float64)
	return v
}

func podNetKey(ns, pod string) string {
	return ns + "\x00" + pod
}

// mergePodNetworkRxTx 将 receive / transmit 两个 instant 向量合并为按 total 排序的 Top 行。
func mergePodNetworkRxTx(rx []gin.H, tx []gin.H, limit int) []gin.H {
	rxM := make(map[string]float64)
	txM := make(map[string]float64)
	meta := make(map[string]map[string]string)

	for _, row := range rx {
		m := metricMapFromGinH(row)
		if m == nil {
			continue
		}
		ns, pod := strings.TrimSpace(m["namespace"]), strings.TrimSpace(m["pod"])
		if ns == "" || pod == "" {
			continue
		}
		k := podNetKey(ns, pod)
		rxM[k] = floatFromGinH(row)
		meta[k] = m
	}
	for _, row := range tx {
		m := metricMapFromGinH(row)
		if m == nil {
			continue
		}
		ns, pod := strings.TrimSpace(m["namespace"]), strings.TrimSpace(m["pod"])
		if ns == "" || pod == "" {
			continue
		}
		k := podNetKey(ns, pod)
		txM[k] = floatFromGinH(row)
		if _, ok := meta[k]; !ok {
			meta[k] = m
		}
	}

	keys := make([]string, 0, len(meta))
	for k := range meta {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		ti := rxM[keys[i]] + txM[keys[i]]
		tj := rxM[keys[j]] + txM[keys[j]]
		return ti > tj
	})
	if limit > 0 && len(keys) > limit {
		keys = keys[:limit]
	}

	out := make([]gin.H, 0, len(keys))
	for _, k := range keys {
		m := meta[k]
		ns := strings.TrimSpace(m["namespace"])
		pod := strings.TrimSpace(m["pod"])
		rb := rxM[k]
		tb := txM[k]
		out = append(out, gin.H{
			"namespace":     ns,
			"pod":           pod,
			"receiveBytes":  rb,
			"transmitBytes": tb,
			"totalBytes":    rb + tb,
		})
	}
	return out
}

func promVectorToPodKeyFloat(rows []gin.H) map[string]float64 {
	out := make(map[string]float64, len(rows))
	for _, row := range rows {
		m := metricMapFromGinH(row)
		if m == nil {
			continue
		}
		ns, pod := strings.TrimSpace(m["namespace"]), strings.TrimSpace(m["pod"])
		if ns == "" || pod == "" {
			continue
		}
		out[podNetKey(ns, pod)] = floatFromGinH(row)
	}
	return out
}

// fetchPodTCPConnectionsMap 返回 namespace\x00pod → 当前 TCP 连接相关计数（优先 open_sockets）。
func fetchPodTCPConnectionsMap(cfg Config) (m map[string]float64, usedQuery string) {
	for _, q := range podTCPConnectionQueries {
		q = strings.TrimSpace(q)
		if q == "" {
			continue
		}
		raw, st, err := prometheusFetchInstant(cfg, "k8s", q)
		if err != nil || st >= http.StatusBadRequest {
			continue
		}
		rows := promInstantVectorFromJSON(raw)
		if len(rows) == 0 {
			continue
		}
		return promVectorToPodKeyFloat(rows), q
	}
	return nil, ""
}

func enrichPodRowsTCPConnections(pods []gin.H, conn map[string]float64) {
	for i := range pods {
		r := pods[i]
		if r == nil {
			continue
		}
		ns, _ := r["namespace"].(string)
		pod, _ := r["pod"].(string)
		k := podNetKey(strings.TrimSpace(ns), strings.TrimSpace(pod))
		if conn == nil {
			r["tcpConnections"] = nil
			continue
		}
		if v, ok := conn[k]; ok {
			r["tcpConnections"] = v
		} else {
			r["tcpConnections"] = nil
		}
	}
}

func fetchPodNetworkWindow(cfg Config, window string) (pods []gin.H, qRx string, qTx string, err error) {
	qRx = promqlPodNetIncrease("container_network_receive_bytes_total", window)
	qTx = promqlPodNetIncrease("container_network_transmit_bytes_total", window)
	rawRx, stRx, errRx := prometheusFetchInstant(cfg, "k8s", qRx)
	if errRx != nil {
		return nil, qRx, qTx, errRx
	}
	if stRx >= http.StatusBadRequest {
		return nil, qRx, qTx, fmt.Errorf("prometheus receive query http %d", stRx)
	}
	rawTx, stTx, errTx := prometheusFetchInstant(cfg, "k8s", qTx)
	if errTx != nil {
		return nil, qRx, qTx, errTx
	}
	if stTx >= http.StatusBadRequest {
		return nil, qRx, qTx, fmt.Errorf("prometheus transmit query http %d", stTx)
	}
	rxRows := promInstantVectorFromJSON(rawRx)
	txRows := promInstantVectorFromJSON(rawTx)
	return mergePodNetworkRxTx(rxRows, txRows, k8sPodNetTopN), qRx, qTx, nil
}

// BuildK8sPodNetworkTop 并行拉取各时间窗口的 Pod 累计收发字节（increase），用于集群监控页展示。
func BuildK8sPodNetworkTop(cfg Config) gin.H {
	if GetPrometheusURLForScope(cfg, "k8s") == "" {
		return gin.H{"error": "未配置 Kubernetes Prometheus / vmselect"}
	}
	type winRes struct {
		win  string
		pods []gin.H
		qRx  string
		qTx  string
		err  string
	}
	results := make([]winRes, len(K8sPodNetworkTopWindows))
	var wg sync.WaitGroup
	for i, w := range K8sPodNetworkTopWindows {
		wg.Add(1)
		go func(idx int, window string) {
			defer wg.Done()
			pods, qRx, qTx, err := fetchPodNetworkWindow(cfg, window)
			if err != nil {
				results[idx] = winRes{win: window, err: err.Error(), qRx: qRx, qTx: qTx}
				return
			}
			results[idx] = winRes{win: window, pods: pods, qRx: qRx, qTx: qTx}
		}(i, w)
	}
	wg.Wait()

	connMap, connQ := fetchPodTCPConnectionsMap(cfg)

	windows := gin.H{}
	queries := gin.H{}
	for _, r := range results {
		pods := r.pods
		if r.err == "" && len(pods) > 0 && connMap != nil {
			enrichPodRowsTCPConnections(pods, connMap)
		}
		wh := gin.H{"pods": pods}
		if r.err != "" {
			wh["error"] = r.err
		}
		windows[r.win] = wh
		queries[r.win] = gin.H{"receive": r.qRx, "transmit": r.qTx}
	}
	hint := "流量：kubelet/cAdvisor 的 container_network_receive_bytes_total、container_network_transmit_bytes_total；" +
		"在各时间窗口上使用 increase 估算累计字节（下载=入站 receive，上传=出站 transmit）。与常见 kube-prometheus 抓取一致。"
	if connQ != "" {
		hint += " 连接数：当前 instant 的 TCP 套接字（container_network_tcp_open_sockets 或 tcp_socket_states 之和），与流量窗口无关。"
	} else {
		hint += " 未探测到 container_network_tcp_* 套接字类指标时，仅展示流量列（许多集群仅有 bytes/packets/errors 等 counter，属正常情况）。"
	}
	out := gin.H{
		"windows": windows,
		"queries": queries,
		"topN":    k8sPodNetTopN,
		"hint":    hint,
		"trafficMetrics": []string{
			"container_network_receive_bytes_total",
			"container_network_transmit_bytes_total",
		},
	}
	if connQ != "" {
		out["tcpConnectionsQuery"] = connQ
		out["tcpConnectionsAvailable"] = true
	} else {
		out["tcpConnectionsAvailable"] = false
	}
	return out
}

func handleGetK8sPodNetworkTop(c *gin.Context, app *ServerApp) {
	if !GuardK8s(c, app.K8s()) {
		return
	}
	cfg := app.Cfg()
	if GetPrometheusURLForScope(cfg, "k8s") == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未配置 Kubernetes Prometheus / vmselect"})
		return
	}
	c.JSON(http.StatusOK, BuildK8sPodNetworkTop(cfg))
}
