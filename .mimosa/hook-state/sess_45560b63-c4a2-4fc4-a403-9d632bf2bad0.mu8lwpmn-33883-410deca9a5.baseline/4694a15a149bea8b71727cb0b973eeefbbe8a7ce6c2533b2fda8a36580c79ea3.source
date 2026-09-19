package internal

import (
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"
)

var clusterAdvisoryRatingGauge int64 // 0 ok 1 warn 2 critical

func setClusterAdvisoryRatingGauge(rating string) {
	switch strings.ToLower(strings.TrimSpace(rating)) {
	case "critical":
		atomic.StoreInt64(&clusterAdvisoryRatingGauge, 2)
	case "warn", "warning":
		atomic.StoreInt64(&clusterAdvisoryRatingGauge, 1)
	default:
		atomic.StoreInt64(&clusterAdvisoryRatingGauge, 0)
	}
}

// handlePrometheusMetrics 暴露 Prometheus 文本指标（无需额外依赖）；供 Prometheus server scrape。
func handlePrometheusMetrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	var b strings.Builder
	fmt.Fprintf(&b, "# HELP kubebt_build_info kube-bt-sync build\n")
	fmt.Fprintf(&b, "# TYPE kubebt_build_info gauge\n")
	fmt.Fprintf(&b, "kubebt_build_info{version=%q} 1\n", strings.TrimSpace(BuildVersion))
	fmt.Fprintf(&b, "# HELP kubebt_api_response_cache_hit_total GET JSON Redis 缓存命中次数\n")
	fmt.Fprintf(&b, "# TYPE kubebt_api_response_cache_hit_total counter\n")
	fmt.Fprintf(&b, "kubebt_api_response_cache_hit_total %d\n", apiResponseCacheHits())
	fmt.Fprintf(&b, "# HELP kubebt_api_response_cache_miss_total GET JSON Redis 缓存未命中次数\n")
	fmt.Fprintf(&b, "# TYPE kubebt_api_response_cache_miss_total counter\n")
	fmt.Fprintf(&b, "kubebt_api_response_cache_miss_total %d\n", apiResponseCacheMisses())
	fmt.Fprintf(&b, "# HELP kubebt_cluster_control_plane_advisory_rating 控制平面周期建议严重度 0=ok 1=warn 2=critical\n")
	fmt.Fprintf(&b, "# TYPE kubebt_cluster_control_plane_advisory_rating gauge\n")
	fmt.Fprintf(&b, "kubebt_cluster_control_plane_advisory_rating %d\n", atomic.LoadInt64(&clusterAdvisoryRatingGauge))
	_, _ = w.Write([]byte(b.String()))
}
