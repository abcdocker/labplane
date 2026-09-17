package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// k8sKubeSphereScalarDef 与前端 clusterK8sPrometheusMetrics.ts 中 allScalarDefs() 的 PromQL 回退顺序一致。
type k8sKubeSphereScalarDef struct {
	ID      string
	Queries []string
}

func k8sKubeSphereScalarDefs() []k8sKubeSphereScalarDef {
	return []k8sKubeSphereScalarDef{
		{"alloc_cpu_cores", []string{`sum(kube_node_status_allocatable{resource="cpu"})`}},
		{"alloc_mem_bytes", []string{`sum(kube_node_status_allocatable{resource="memory"})`}},
		{"req_cpu_cores", []string{`sum(kube_pod_container_resource_requests{resource="cpu"})`}},
		{"req_mem_bytes", []string{`sum(kube_pod_container_resource_requests{resource="memory"})`}},
		{"lim_cpu_cores", []string{`sum(kube_pod_container_resource_limits{resource="cpu"})`}},
		{"lim_mem_bytes", []string{`sum(kube_pod_container_resource_limits{resource="memory"})`}},
		{"cpu_usage_cores", []string{
			`sum(rate(container_cpu_usage_seconds_total{namespace!="",pod!="",container!="",container!="POD"}[5m]))`,
			`sum(rate(container_cpu_usage_seconds_total{container!="",container!="POD",image!=""}[5m]))`,
			`sum(rate(container_cpu_usage_seconds_total{container!=""}[5m]))`,
		}},
		{"mem_wss_bytes", []string{
			`sum(container_memory_working_set_bytes{namespace!="",pod!="",container!="",container!="POD"})`,
			`sum(container_memory_working_set_bytes{container!="",container!="POD",image!=""})`,
			`sum(container_memory_working_set_bytes{container!="",container!="POD"})`,
			`sum(container_memory_working_set_bytes{container!=""})`,
		}},
		{"pods_running", []string{`sum(kube_pod_status_phase{phase="Running"})`}},
		{"pods_allocatable", []string{`sum(kube_node_status_allocatable{resource="pods"})`}},
		{"pods_capacity", []string{`sum(kube_node_status_capacity{resource="pods"})`}},
		{"apiserver_qps", []string{
			`sum(rate(apiserver_request_total[5m]))`,
			`sum(rate(apiserver_request_total{job=~"apiserver|kube-apiserver"}[5m]))`,
			`sum(rate(apiserver_request_total{job=~".*apiserver.*"}[5m]))`,
		}},
		{"apiserver_latency_p99", []string{
			`histogram_quantile(0.99, sum(rate(apiserver_request_duration_seconds_bucket[5m])) by (le))`,
			`histogram_quantile(0.99, sum(rate(apiserver_request_slo_duration_seconds_bucket[5m])) by (le))`,
		}},
		{"scheduler_attempt_rate", []string{`sum(rate(scheduler_schedule_attempts_total[5m]))`}},
		{"scheduler_scheduled_rate", []string{
			`sum(rate(scheduler_schedule_attempts_total{result="scheduled"}[5m]))`,
			`sum(rate(scheduler_pod_scheduling_duration_seconds_count[5m]))`,
		}},
		{"scheduler_latency_p99", []string{
			`histogram_quantile(0.99, sum(rate(scheduler_scheduling_attempt_duration_seconds_bucket[5m])) by (le))`,
			`histogram_quantile(0.99, sum(rate(scheduler_scheduling_duration_seconds_bucket[5m])) by (le))`,
		}},
		{"nodes_ready", []string{`sum(kube_node_status_condition{condition="Ready",status="true"})`}},
		{"nodes_total", []string{`count(kube_node_info)`}},
		{"disk_total_bytes", []string{
			`sum(max by (instance) (node_filesystem_size_bytes{mountpoint="/",fstype!="tmpfs"}))`,
			`sum(max by (instance) (node_filesystem_size_bytes{fstype=~"ext4|xfs",mountpoint="/"}))`,
			`sum(max by (instance) (node_filesystem_size_bytes{mountpoint="/rootfs",fstype!="tmpfs"}))`,
			`sum(max by (instance) (node_filesystem_size_bytes{fstype=~"ext4|xfs|btrfs",mountpoint="/host"}))`,
		}},
		{"disk_avail_bytes", []string{
			`sum(max by (instance) (node_filesystem_avail_bytes{mountpoint="/",fstype!="tmpfs"}))`,
			`sum(max by (instance) (node_filesystem_avail_bytes{fstype=~"ext4|xfs",mountpoint="/"}))`,
			`sum(max by (instance) (node_filesystem_avail_bytes{mountpoint="/rootfs",fstype!="tmpfs"}))`,
			`sum(max by (instance) (node_filesystem_avail_bytes{fstype=~"ext4|xfs|btrfs",mountpoint="/host"}))`,
		}},
	}
}

type k8sCoreUpDef struct {
	Key   string
	Query string
}

func k8sKubeSphereCoreUpDefs() []k8sCoreUpDef {
	return []k8sCoreUpDef{
		{"apiserver", `max(up{job=~"kube-apiserver|apiserver"})`},
		{"etcd", `max(up{job=~"etcd|kube-etcd"})`},
		{"kubelet", `count(up{job="kubelet"})`},
		{"controller", `max(up{job=~"kube-controller-manager|controller-manager"})`},
	}
}

func k8sKubeSphereSnapshotTopkQueries() (namespaceCPU, namespaceMem, podCPU, podMem string) {
	commonSel := `namespace!="",pod!="",container!="",container!="POD"`
	return `topk(8, sum by (namespace) (rate(container_cpu_usage_seconds_total{` + commonSel + `}[5m])))`,
		`topk(8, sum by (namespace) (container_memory_working_set_bytes{` + commonSel + `}))`,
		`topk(8, sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{` + commonSel + `}[5m])))`,
		`topk(8, sum by (namespace, pod) (container_memory_working_set_bytes{` + commonSel + `}))`
}

func promInstantVectorFromJSON(raw []byte) []gin.H {
	var wrap struct {
		Status string `json:"status"`
		Data   struct {
			Result []struct {
				Metric map[string]string `json:"metric"`
				Value  []json.RawMessage `json:"value"`
			} `json:"result"`
		} `json:"data"`
	}
	if json.Unmarshal(raw, &wrap) != nil || wrap.Status != "success" {
		return nil
	}
	out := make([]gin.H, 0, len(wrap.Data.Result))
	for _, r := range wrap.Data.Result {
		if len(r.Value) < 2 {
			continue
		}
		f, ok := promRangeSampleToFloat(r.Value[1])
		if !ok {
			continue
		}
		m := r.Metric
		if m == nil {
			m = map[string]string{}
		}
		out = append(out, gin.H{"metric": m, "value": f})
	}
	return out
}

func scalarFirstHitK8s(cfg Config, queries []string) *float64 {
	for _, q := range queries {
		q = strings.TrimSpace(q)
		if q == "" {
			continue
		}
		v := PrometheusPromQLInstantScalar(cfg, "k8s", q)
		if v != nil && !math.IsNaN(*v) && !math.IsInf(*v, 0) {
			return v
		}
	}
	return nil
}

func k8sKubeSphereSnapshotRedisKey(prefix string) string {
	p := strings.TrimSpace(prefix)
	if p == "" {
		p = "kubebt"
	}
	return p + ":k8s:prom:clusterSnapshot:v1"
}

// BuildK8sKubeSphereSnapshot 聚合即时标量、核心 up、legacy 与 topk vector，一次 Prometheus 往返序列在服务端完成。
func BuildK8sKubeSphereSnapshot(cfg Config) (gin.H, string, error) {
	if GetPrometheusURLForScope(cfg, "k8s") == "" {
		return nil, "", fmt.Errorf("未配置 Kubernetes Prometheus / vmselect")
	}
	scalars := gin.H{}
	for _, d := range k8sKubeSphereScalarDefs() {
		v := scalarFirstHitK8s(cfg, d.Queries)
		if v == nil {
			scalars[d.ID] = nil
		} else {
			scalars[d.ID] = *v
		}
	}
	coreUp := gin.H{}
	for _, d := range k8sKubeSphereCoreUpDefs() {
		v := PrometheusPromQLInstantScalar(cfg, "k8s", d.Query)
		if v == nil {
			coreUp[d.Key] = nil
		} else {
			coreUp[d.Key] = *v
		}
	}
	legacy := gin.H{}
	for key, q := range map[string]string{
		"upSeries":   "count(up)",
		"tsdbSeries": "prometheus_tsdb_head_series",
	} {
		v := PrometheusPromQLInstantScalar(cfg, "k8s", q)
		if v == nil {
			legacy[key] = nil
		} else {
			legacy[key] = *v
		}
	}
	qNamespaceCPU, qNamespaceMem, qPodCPU, qPodMem := k8sKubeSphereSnapshotTopkQueries()
	topk := gin.H{
		"namespaceCpu": []gin.H{},
		"namespaceMem": []gin.H{},
		"podCpu":       []gin.H{},
		"podMem":       []gin.H{},
	}
	if raw, st, err := prometheusFetchInstant(cfg, "k8s", qNamespaceCPU); err == nil && st < http.StatusBadRequest {
		if rows := promInstantVectorFromJSON(raw); len(rows) > 0 {
			topk["namespaceCpu"] = rows
		}
	}
	if raw, st, err := prometheusFetchInstant(cfg, "k8s", qNamespaceMem); err == nil && st < http.StatusBadRequest {
		if rows := promInstantVectorFromJSON(raw); len(rows) > 0 {
			topk["namespaceMem"] = rows
		}
	}
	if raw, st, err := prometheusFetchInstant(cfg, "k8s", qPodCPU); err == nil && st < http.StatusBadRequest {
		if rows := promInstantVectorFromJSON(raw); len(rows) > 0 {
			topk["podCpu"] = rows
		}
	}
	if raw, st, err := prometheusFetchInstant(cfg, "k8s", qPodMem); err == nil && st < http.StatusBadRequest {
		if rows := promInstantVectorFromJSON(raw); len(rows) > 0 {
			topk["podMem"] = rows
		}
	}
	payload := gin.H{
		"scalars":  scalars,
		"coreUp":   coreUp,
		"legacy":   legacy,
		"topk":     topk,
		"cachedAt": time.Now().UTC().Format(time.RFC3339Nano),
		"warming":  false,
	}
	return payload, payload["cachedAt"].(string), nil
}

func refreshK8sKubeSphereSnapshotToRedis(ctx context.Context, app *ServerApp) {
	cfg := app.Cfg()
	if GetPrometheusURLForScope(cfg, "k8s") == "" {
		return
	}
	rdb := app.Redis()
	if rdb == nil {
		return
	}
	payload, _, err := BuildK8sKubeSphereSnapshot(cfg)
	if err != nil {
		log.Printf("k8s cluster prom snapshot refresh: %v", err)
		return
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return
	}
	key := k8sKubeSphereSnapshotRedisKey(cfg.RedisKeyPrefix)
	_ = rdb.Set(ctx, key, b, 3*time.Minute)
}

func handleGetK8sKubeSphereSnapshot(c *gin.Context, app *ServerApp) {
	if !GuardK8s(c, app.K8s()) {
		return
	}
	cfg := app.Cfg()
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	key := k8sKubeSphereSnapshotRedisKey(cfg.RedisKeyPrefix)
	forceRefresh := strings.TrimSpace(c.Query("refresh")) == "1" || strings.TrimSpace(c.Query("nocache")) == "1"

	if rdb := app.Redis(); rdb != nil {
		if forceRefresh {
			_ = rdb.Del(ctx, key)
		} else if raw, err := rdb.Get(ctx, key); err == nil && strings.TrimSpace(raw) != "" {
			c.Data(http.StatusOK, "application/json; charset=utf-8", []byte(raw))
			return
		}
		go refreshK8sKubeSphereSnapshotToRedis(context.Background(), app)
		payload, _, err := BuildK8sKubeSphereSnapshot(cfg)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		b, _ := json.Marshal(payload)
		c.Data(http.StatusOK, "application/json; charset=utf-8", b)
		return
	}
	payload, _, err := BuildK8sKubeSphereSnapshot(cfg)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, payload)
}
