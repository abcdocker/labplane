package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// 用量/磁盘等有数据、仅 kube_* 无：Prometheus 已通但未 scrape ksm（与前端 HINT_KSM_CHART_EMPTY 对齐）
const k8sChartHintKsmOnlyEmpty = "无数据：若用量/磁盘等图表有数据而仅此类无，说明已连上 Prometheus，但该实例未把 kube-state-metrics 写入 TSDB。打开 Prometheus → Status → Targets，查含 kube-state-metrics 的 job 是否 UP 及错误（NetworkPolicy、端口、ServiceMonitor 未匹配当前 Prometheus）。"

// k8sKubeSphereChartDef 与前端 clusterK8sPrometheusMetrics.ts 中 K8S_CHART_DEFS 顺序与 PromQL 回退一致。
type k8sKubeSphereChartDef struct {
	ID          string
	Section     string
	Title       string
	Subtitle    string
	Queries     []string
	ValueFormat string
	Accent      string
	Hint        string
}

func k8sKubeSphereChartDefs() []k8sKubeSphereChartDef {
	// 顺序：工作负载真实用量 → 调度配额 → 控制面 → 调度器 → 磁盘（与前端 K8S_CHART_DEFS 一致）
	return []k8sKubeSphereChartDef{
		{"chart_cpu_usage", "usage", "集群 CPU 实际用量", "容器聚合核数（非固定值，随负载变化）", []string{`sum(rate(container_cpu_usage_seconds_total{namespace!="",pod!="",container!="",container!="POD"}[5m]))`, `sum(rate(container_cpu_usage_seconds_total{container!="",container!="POD",image!=""}[5m]))`, `sum(rate(container_cpu_usage_seconds_total{container!=""}[5m]))`}, "cores", "#ea580c", "无数据：检查 kubelet/cAdvisor 抓取。"},
		{"chart_mem_wss", "usage", "集群内存 working set", "", []string{`sum(container_memory_working_set_bytes{namespace!="",pod!="",container!="",container!="POD"})`, `sum(container_memory_working_set_bytes{container!="",container!="POD",image!=""})`, `sum(container_memory_working_set_bytes{container!="",container!="POD"})`}, "bytes_gib", "#db2777", "无数据：同上。"},
		{"chart_pods_running_series", "usage", "Running Pod 数量", "", []string{`sum(kube_pod_status_phase{phase="Running"})`}, "int", "#16a34a", k8sChartHintKsmOnlyEmpty},
		{"chart_pods_capacity_series", "usage", "集群 Pod 容量上限", "各节点 pods capacity 之和", []string{`sum(kube_node_status_capacity{resource="pods"})`}, "int", "#475569", k8sChartHintKsmOnlyEmpty},
		{"chart_alloc_cpu_series", "quota", "CPU 可分配（集群）", "kube_node_status_allocatable 快照随时间", []string{`sum(kube_node_status_allocatable{resource="cpu"})`}, "cores", "#2563eb", "无数据：查询中无 kube_node_*（kube-prometheus 卡片「指标探测」）。若用量等有数仅此无，查 Targets 中 kube-state-metrics 是否 UP。"},
		{"chart_req_cpu_series", "quota", "CPU 请求合计", "全集群 Pod requests 随时间", []string{`sum(kube_pod_container_resource_requests{resource="cpu"})`}, "cores", "#0284c7", k8sChartHintKsmOnlyEmpty},
		{"chart_lim_cpu_series", "quota", "CPU limits 合计", "全集群 Pod limits", []string{`sum(kube_pod_container_resource_limits{resource="cpu"})`}, "cores", "#6d28d9", k8sChartHintKsmOnlyEmpty},
		{"chart_alloc_mem_series", "quota", "内存可分配（集群）", "", []string{`sum(kube_node_status_allocatable{resource="memory"})`}, "bytes_gib", "#7c2d12", k8sChartHintKsmOnlyEmpty},
		{"chart_req_mem_series", "quota", "内存请求合计", "", []string{`sum(kube_pod_container_resource_requests{resource="memory"})`}, "bytes_gib", "#be185d", k8sChartHintKsmOnlyEmpty},
		{"chart_lim_mem_series", "quota", "内存 limits 合计", "", []string{`sum(kube_pod_container_resource_limits{resource="memory"})`}, "bytes_gib", "#9333ea", k8sChartHintKsmOnlyEmpty},
		{"chart_apiserver_qps", "controlplane", "API Server 请求速率", "rate 窗口 5m，图上每点为当时刻速率", []string{`sum(rate(apiserver_request_total[5m]))`, `sum(rate(apiserver_request_total{job=~".*apiserver.*"}[5m]))`, `sum(rate(apiserver_request_total{job=~"kube-apiserver|apiserver"}[5m]))`}, "per_sec", "#4f46e5", "无数据：启用 apiserver ServiceMonitor；平台在集群外时请用可访问的 Prometheus 地址并确认 Targets 中 apiserver 为 UP。"},
		{"chart_apiserver_latency", "controlplane", "API Server 请求延迟 P99", "histogram_quantile 0.99", []string{`histogram_quantile(0.99, sum(rate(apiserver_request_duration_seconds_bucket[5m])) by (le))`, `histogram_quantile(0.99, sum(rate(apiserver_request_slo_duration_seconds_bucket[5m])) by (le))`}, "seconds", "#7c3aed", "无数据：同即时指标说明。"},
		{"chart_scheduler_rate", "scheduler", "调度器调度速率", "scheduler_schedule_attempts_total", []string{`sum(rate(scheduler_schedule_attempts_total[5m]))`}, "per_sec", "#0d9488", "无数据：helm kube-prometheus-stack 设置 kubeScheduler.enabled=true。"},
		{"chart_scheduler_latency", "scheduler", "调度器调度耗时 P99", "", []string{`histogram_quantile(0.99, sum(rate(scheduler_scheduling_attempt_duration_seconds_bucket[5m])) by (le))`}, "seconds", "#059669", "无数据：抓取 kube-scheduler metrics。"},
		{"chart_scheduler_scheduled_rate", "scheduler", "调度成功速率", "scheduled 或 pod_scheduling_duration 计数", []string{`sum(rate(scheduler_schedule_attempts_total{result="scheduled"}[5m]))`, `sum(rate(scheduler_pod_scheduling_duration_seconds_count[5m]))`}, "per_sec", "#0f766e", "无数据：抓取 kube-scheduler；部分集群仅有 attempts 总量。"},
		{"chart_disk_total_series", "storage", "磁盘总量（根分区估算）", "node_filesystem_size_bytes @ /", []string{`sum(max by (instance) (node_filesystem_size_bytes{mountpoint="/",fstype!="tmpfs"}))`, `sum(max by (instance) (node_filesystem_size_bytes{fstype=~"ext4|xfs",mountpoint="/"}))`, `sum(max by (instance) (node_filesystem_size_bytes{mountpoint="/rootfs",fstype!="tmpfs"}))`, `sum(max by (instance) (node_filesystem_size_bytes{fstype=~"ext4|xfs|btrfs",mountpoint="/host"}))`}, "bytes_gib", "#b45309", "无数据：node-exporter；容器内挂载常为 /rootfs 或 /host，已加回退 PromQL。"},
		{"chart_disk_avail_series", "storage", "磁盘可用（根分区估算）", "", []string{`sum(max by (instance) (node_filesystem_avail_bytes{mountpoint="/",fstype!="tmpfs"}))`, `sum(max by (instance) (node_filesystem_avail_bytes{fstype=~"ext4|xfs",mountpoint="/"}))`, `sum(max by (instance) (node_filesystem_avail_bytes{mountpoint="/rootfs",fstype!="tmpfs"}))`, `sum(max by (instance) (node_filesystem_avail_bytes{fstype=~"ext4|xfs|btrfs",mountpoint="/host"}))`}, "bytes_gib", "#ca8a04", "无数据：同上。"},
	}
}

func stepForK8sRangeMinutes(minutes int) string {
	if minutes <= 60 {
		return "30s"
	}
	if minutes <= 360 {
		return "1m"
	}
	if minutes <= 1440 {
		return "5m"
	}
	return "15m"
}

// matrix 中每条样本一般为 [timestamp, value]，但部分实现可能带额外字段；用 [][]RawMessage
// 避免任一行长度≠2 时整段 values 反序列化失败（原 [][2]json.RawMessage 会直接导致 Unmarshal 报错）。
type promRangeMatrixResp struct {
	Status string `json:"status"`
	Data   struct {
		Result []struct {
			Values [][]json.RawMessage `json:"values"`
		} `json:"result"`
	} `json:"data"`
}

func promRangeHasPoints(raw []byte) bool {
	var m promRangeMatrixResp
	if json.Unmarshal(raw, &m) != nil || m.Status != "success" {
		return false
	}
	for _, r := range m.Data.Result {
		for _, pair := range r.Values {
			if len(pair) >= 2 {
				return true
			}
		}
	}
	return false
}

func promRangeSampleToFloat(raw json.RawMessage) (float64, bool) {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		f, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
		return f, err == nil && !math.IsNaN(f) && !math.IsInf(f, 0)
	}
	var f float64
	if json.Unmarshal(raw, &f) == nil {
		return f, !math.IsNaN(f) && !math.IsInf(f, 0)
	}
	return 0, false
}

func promFirstSeriesNumericPointsFromJSON(raw []byte) []map[string]float64 {
	var m promRangeMatrixResp
	if json.Unmarshal(raw, &m) != nil || m.Status != "success" || len(m.Data.Result) == 0 {
		return nil
	}
	for _, ser := range m.Data.Result {
		out := make([]map[string]float64, 0, len(ser.Values))
		for _, pair := range ser.Values {
			if len(pair) < 2 {
				continue
			}
			ts, ok1 := promRangeSampleToFloat(pair[0])
			v, ok2 := promRangeSampleToFloat(pair[1])
			if !ok1 || !ok2 || math.IsNaN(ts) || math.IsNaN(v) || math.IsInf(ts, 0) || math.IsInf(v, 0) {
				continue
			}
			out = append(out, map[string]float64{"x": ts * 1000, "v": v})
		}
		if len(out) > 0 {
			return out
		}
	}
	return nil
}

func k8sKubeSphereChartsRedisKey(prefix string, days int) string {
	p := strings.TrimSpace(prefix)
	if p == "" {
		p = "kubebt"
	}
	return fmt.Sprintf("%s:k8s:prom:clusterCharts:v1:days=%d", p, days)
}

// BuildK8sKubeSphereChartRows 拉取 Prometheus query_range 并组装为前端 Recharts 用点列。
func BuildK8sKubeSphereChartRows(cfg Config, days int) ([]gin.H, string, error) {
	if days < 1 {
		days = 7
	}
	if days > 7 {
		days = 7
	}
	if GetPrometheusURLForScope(cfg, "k8s") == "" {
		return nil, "", fmt.Errorf("未配置 Kubernetes Prometheus / vmselect")
	}
	end := time.Now().Unix()
	minutes := days * 24 * 60
	start := end - int64(minutes*60)
	step := stepForK8sRangeMinutes(minutes)
	startStr := strconv.FormatInt(start, 10)
	endStr := strconv.FormatInt(end, 10)

	defs := k8sKubeSphereChartDefs()
	rows := make([]gin.H, 0, len(defs))
	for _, d := range defs {
		var hitQuery string
		var hitRaw []byte
		for _, q := range d.Queries {
			raw, status, err := prometheusFetchRange(cfg, "k8s", q, startStr, endStr, step)
			if err != nil || status >= http.StatusBadRequest || !promRangeHasPoints(raw) {
				continue
			}
			hitQuery = q
			hitRaw = raw
			break
		}
		chart := promFirstSeriesNumericPointsFromJSON(hitRaw)
		if chart == nil {
			chart = []map[string]float64{}
		}
		rows = append(rows, gin.H{
			"id":          d.ID,
			"section":     d.Section,
			"title":       d.Title,
			"subtitle":    d.Subtitle,
			"chart":       chart,
			"usedQuery":   hitQuery,
			"valueFormat": d.ValueFormat,
			"accent":      d.Accent,
			"missingHint": d.Hint,
		})
	}
	return rows, time.Now().UTC().Format(time.RFC3339Nano), nil
}

func refreshK8sKubeSphereChartsToRedis(ctx context.Context, app *ServerApp, days int) {
	cfg := app.Cfg()
	if GetPrometheusURLForScope(cfg, "k8s") == "" {
		return
	}
	rdb := app.Redis()
	if rdb == nil {
		return
	}
	rows, at, err := BuildK8sKubeSphereChartRows(cfg, days)
	if err != nil {
		log.Printf("k8s cluster prom charts refresh days=%d: %v", days, err)
		return
	}
	payload := gin.H{"rows": rows, "cachedAt": at, "days": days, "warming": false}
	b, err := json.Marshal(payload)
	if err != nil {
		return
	}
	key := k8sKubeSphereChartsRedisKey(cfg.RedisKeyPrefix, days)
	_ = rdb.Set(ctx, key, b, 3*time.Minute)
}

// StartK8sKubeSphereChartsCacheWatcher 后台定时刷新 1～7 天趋势入 Redis，供 GET /api/k8s/prometheus/cluster-charts 直出。
func StartK8sKubeSphereChartsCacheWatcher(app *ServerApp) {
	if app == nil {
		return
	}
	tick := time.NewTicker(75 * time.Second)
	go func() {
		ctx := context.Background()
		for {
			<-tick.C
			if GetPrometheusURLForScope(app.Cfg(), "k8s") == "" || app.Redis() == nil {
				continue
			}
			for d := 1; d <= 7; d++ {
				refreshK8sKubeSphereChartsToRedis(ctx, app, d)
			}
			refreshK8sKubeSphereSnapshotToRedis(ctx, app)
		}
	}()
	// 启动后短延迟先跑一轮
	go func() {
		time.Sleep(4 * time.Second)
		if app.Redis() == nil || GetPrometheusURLForScope(app.Cfg(), "k8s") == "" {
			return
		}
		ctx := context.Background()
		for d := 1; d <= 7; d++ {
			refreshK8sKubeSphereChartsToRedis(ctx, app, d)
		}
		refreshK8sKubeSphereSnapshotToRedis(ctx, app)
	}()
}

func handleGetK8sKubeSphereCharts(c *gin.Context, app *ServerApp) {
	if !GuardK8s(c, app.K8s()) {
		return
	}
	cfg := app.Cfg()
	days, _ := strconv.Atoi(strings.TrimSpace(c.Query("days")))
	if days < 1 || days > 7 {
		days = 7
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	key := k8sKubeSphereChartsRedisKey(cfg.RedisKeyPrefix, days)
	forceRefresh := strings.TrimSpace(c.Query("refresh")) == "1" || strings.TrimSpace(c.Query("nocache")) == "1"

	if rdb := app.Redis(); rdb != nil {
		if forceRefresh {
			_ = rdb.Del(ctx, key)
		} else if raw, err := rdb.Get(ctx, key); err == nil && strings.TrimSpace(raw) != "" {
			c.Data(http.StatusOK, "application/json; charset=utf-8", []byte(raw))
			return
		}
		go refreshK8sKubeSphereChartsToRedis(context.Background(), app, days)
		rows, at, err := BuildK8sKubeSphereChartRows(cfg, days)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		payload, _ := json.Marshal(gin.H{"rows": rows, "cachedAt": at, "days": days, "warming": false})
		c.Data(http.StatusOK, "application/json; charset=utf-8", payload)
		return
	}

	rows, at, err := BuildK8sKubeSphereChartRows(cfg, days)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"rows": rows, "cachedAt": at, "days": days, "warming": false})
}
