package internal

import (
	"context"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// PodWorkloadResourcesTotals 与 handleK8sPodGet 一致：仅累加工作容器 resources（不含 InitContainer）。
func PodWorkloadResourcesTotals(pod *corev1.Pod) (cpuReqMilli, memReqBytes, cpuLimMilli, memLimBytes int64, limitsGap bool) {
	limitsGap = false
	for _, c := range pod.Spec.Containers {
		if q, ok := c.Resources.Requests[corev1.ResourceCPU]; ok {
			cpuReqMilli += q.MilliValue()
		}
		if q, ok := c.Resources.Requests[corev1.ResourceMemory]; ok {
			memReqBytes += q.Value()
		}
		if q, ok := c.Resources.Limits[corev1.ResourceCPU]; ok {
			cpuLimMilli += q.MilliValue()
		} else {
			limitsGap = true
		}
		if q, ok := c.Resources.Limits[corev1.ResourceMemory]; ok {
			memLimBytes += q.Value()
		} else {
			limitsGap = true
		}
	}
	return
}

func parseEfficiencyQueryFloat(c *gin.Context, key string, def float64) float64 {
	s := strings.TrimSpace(c.Query(key))
	if s == "" {
		return def
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil || math.IsNaN(f) || math.IsInf(f, 0) {
		return def
	}
	return f
}

func parseEfficiencyQueryInt(c *gin.Context, key string, def int) int {
	s := strings.TrimSpace(c.Query(key))
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 0 {
		return def
	}
	return n
}

// efficiencyPriorityNote 给人读的处置提示（与排序无关）；limits 显著高于 request 时提示可收紧 limits。
func efficiencyPriorityNote(limitsGap, slackCpu, slackMem bool, cpuLimMilli, memLimMilli, cpuReqMilli, memReqBytes int64) string {
	var parts []string
	if limitsGap {
		parts = append(parts, "缺 limits：先为工作容器补齐 CPU/Memory limits")
	}
	if slackCpu && slackMem {
		parts = append(parts, "CPU+内存 requests 均明显高于用量，优先下调 requests 或评估副本")
	} else if slackCpu {
		parts = append(parts, "CPU requests 明显高于用量，可调低 requests")
	} else if slackMem {
		parts = append(parts, "内存 requests 明显高于用量，可调低 requests")
	}
	if !limitsGap && cpuLimMilli > 0 && cpuReqMilli > 0 && slackCpu && cpuLimMilli >= (cpuReqMilli*3)/2 {
		parts = append(parts, "CPU limit 较 request 余量过大，可酌情收紧 limits 贴近峰值")
	}
	if !limitsGap && memLimMilli > 0 && memReqBytes > 0 && slackMem && memLimMilli >= (memReqBytes*3)/2 {
		parts = append(parts, "内存 limit 较 request 余量过大，可酌情收紧 limits 贴近峰值")
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(parts, "；")
}

// handleK8sPodsResourceEfficiency GET /api/k8s/pods/resource-efficiency
// 对比 Running Pod 的 resources.requests 与 Prometheus cAdvisor 用量，筛出「申请明显大于实际」的条目；并统计缺 limits 的 Pod。
func handleK8sPodsResourceEfficiency(c *gin.Context, k8s *kubernetes.Clientset, cfg Config) {
	if !GuardK8s(c, k8s) {
		return
	}
	maxCpuRatio := parseEfficiencyQueryFloat(c, "maxCpuRatio", 0.55)
	maxMemRatio := parseEfficiencyQueryFloat(c, "maxMemRatio", 0.55)
	minCpuReqMilli := int64(parseEfficiencyQueryInt(c, "minCpuRequestMilli", 500))
	minMemReqBytes := int64(parseEfficiencyQueryInt(c, "minMemRequestMiB", 256)) * 1024 * 1024
	rowLimit := parseEfficiencyQueryInt(c, "limit", 50)
	if rowLimit < 1 {
		rowLimit = 1
	}
	if rowLimit > 200 {
		rowLimit = 200
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 55*time.Second)
	defer cancel()

	podList, err := k8s.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "列出 Pod 失败: " + err.Error()})
		return
	}

	base := strings.TrimSpace(GetPrometheusURLForScope(cfg, "k8s"))
	promOK := base != ""
	var cpuByPod, memByPod map[string]float64
	var promHint string
	if promOK {
		nsMatch := `namespace!=""`
		podMatch := `,pod!=""`
		// 与 clusterK8sPrometheusMetrics / Top 排行一致，避免 image 标签缺失时与集群「用量」标量脱节
		commonSel := nsMatch + podMatch + `,container!="",container!="POD"`
		cpuQ := `sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{` + commonSel + `}[5m]))`
		memQ := `sum by (namespace, pod) (container_memory_working_set_bytes{` + commonSel + `})`
		var errCPU, errMem error
		cpuByPod, errCPU = prometheusInstantVectorNamespacePod(ctx, cfg, base, cpuQ)
		memByPod, errMem = prometheusInstantVectorNamespacePod(ctx, cfg, base, memQ)
		if errCPU != nil {
			promHint = "CPU: " + errCPU.Error()
		}
		if errMem != nil {
			if promHint != "" {
				promHint += "; "
			}
			promHint += "内存: " + errMem.Error()
		}
		if errCPU != nil && errMem != nil {
			promOK = false
		}
	}

	type row struct {
		Key             string  `json:"key"`
		Namespace       string  `json:"namespace"`
		Pod             string  `json:"pod"`
		Node            string  `json:"node,omitempty"`
		CpuRequestMilli int64   `json:"cpuRequestMilli"`
		MemRequestBytes int64   `json:"memRequestBytes"`
		CpuLimitMilli   int64   `json:"cpuLimitMilli"`
		MemLimitBytes   int64   `json:"memLimitBytes"`
		CpuUseCores     float64 `json:"cpuUseCores,omitempty"`
		MemUseBytes     float64 `json:"memUseBytes,omitempty"`
		CpuUseRatio     float64 `json:"cpuUseRatio,omitempty"`
		MemUseRatio     float64 `json:"memUseRatio,omitempty"`
		LimitsGap       bool    `json:"limitsGap"`
		SlackCpu        bool    `json:"slackCpu"`
		SlackMem        bool    `json:"slackMem"`
		PriorityNote    string  `json:"priorityNote,omitempty"`
		waste           float64
	}
	var rows []row
	missingLimits := 0
	scanned := 0
	var sumCpuReqMilli, sumMemReqBytes int64
	var sumCpuUseCores, sumMemUseBytes float64
	var runningWithCpuReq, runningWithMemReq int
	var runningWithCpuProm, runningWithMemProm int

	for i := range podList.Items {
		p := &podList.Items[i]
		if p.Status.Phase != corev1.PodRunning {
			continue
		}
		scanned++
		cpuR, memR, cpuL, memL, limGap := PodWorkloadResourcesTotals(p)
		if limGap {
			missingLimits++
		}
		key := p.Namespace + "/" + p.Name
		var useC, useM float64
		var hasC, hasM bool
		if promOK {
			if v, ok := cpuByPod[key]; ok {
				useC, hasC = v, true
			}
			if v, ok := memByPod[key]; ok {
				useM, hasM = v, true
			}
		}

		sumCpuReqMilli += cpuR
		sumMemReqBytes += memR
		sumCpuUseCores += useC
		sumMemUseBytes += useM
		if cpuR > 0 {
			runningWithCpuReq++
			if hasC {
				runningWithCpuProm++
			}
		}
		if memR > 0 {
			runningWithMemReq++
			if hasM {
				runningWithMemProm++
			}
		}

		reqCpuF := float64(cpuR) / 1000.0
		var cpuRatio float64
		if cpuR > 0 && hasC {
			cpuRatio = useC / reqCpuF
		}
		var memRatio float64
		if memR > 0 && hasM {
			memRatio = useM / float64(memR)
		}

		slackCPU := cpuR >= minCpuReqMilli && hasC && cpuRatio < maxCpuRatio
		slackMem := memR >= minMemReqBytes && hasM && memRatio < maxMemRatio
		if !slackCPU && !slackMem {
			continue
		}
		waste := 0.0
		if slackCPU && cpuR > 0 {
			waste += (1.0 - cpuRatio)
		}
		if slackMem && memR > 0 {
			waste += (1.0 - memRatio)
		}
		prio := efficiencyPriorityNote(limGap, slackCPU, slackMem, cpuL, memL, cpuR, memR)
		rows = append(rows, row{
			Key:             key,
			Namespace:       p.Namespace,
			Pod:             p.Name,
			Node:            strings.TrimSpace(p.Spec.NodeName),
			CpuRequestMilli: cpuR,
			MemRequestBytes: memR,
			CpuLimitMilli:   cpuL,
			MemLimitBytes:   memL,
			CpuUseCores:     useC,
			MemUseBytes:     useM,
			CpuUseRatio:     cpuRatio,
			MemUseRatio:     memRatio,
			LimitsGap:       limGap,
			SlackCpu:        slackCPU,
			SlackMem:        slackMem,
			PriorityNote:    prio,
			waste:           waste,
		})
	}

	minSlackRatio := func(r row) float64 {
		m := 2.0
		if r.SlackCpu {
			m = math.Min(m, r.CpuUseRatio)
		}
		if r.SlackMem {
			m = math.Min(m, r.MemUseRatio)
		}
		if m > 1.5 {
			return 1.0
		}
		return m
	}
	sort.Slice(rows, func(i, j int) bool {
		a, b := rows[i], rows[j]
		// 缺 limits 优先；其次浪费度高；再其次实际/申请更低（更急需降 requests/对齐 limits）
		if a.LimitsGap != b.LimitsGap {
			return a.LimitsGap && !b.LimitsGap
		}
		if a.waste != b.waste {
			return a.waste > b.waste
		}
		ma, mb := minSlackRatio(a), minSlackRatio(b)
		if ma != mb {
			return ma < mb
		}
		return a.Key < b.Key
	})
	if len(rows) > rowLimit {
		rows = rows[:rowLimit]
	}

	outRows := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		h := gin.H{
			"key":             r.Key,
			"namespace":       r.Namespace,
			"pod":             r.Pod,
			"node":            r.Node,
			"cpuRequestMilli": r.CpuRequestMilli,
			"memRequestBytes": r.MemRequestBytes,
			"cpuLimitMilli":   r.CpuLimitMilli,
			"memLimitBytes":   r.MemLimitBytes,
			"limitsGap":       r.LimitsGap,
			"slackCpu":        r.SlackCpu,
			"slackMem":        r.SlackMem,
		}
		if r.CpuUseCores > 0 || r.SlackCpu {
			h["cpuUseCores"] = r.CpuUseCores
		}
		if r.MemUseBytes > 0 || r.SlackMem {
			h["memUseBytes"] = r.MemUseBytes
		}
		if r.CpuRequestMilli > 0 {
			h["cpuUseRatio"] = r.CpuUseRatio
		}
		if r.MemRequestBytes > 0 {
			h["memUseRatio"] = r.MemUseRatio
		}
		if strings.TrimSpace(r.PriorityNote) != "" {
			h["priorityNote"] = r.PriorityNote
		}
		outRows = append(outRows, h)
	}

	cluster := gin.H{
		"cpuRequestMilliTotal":   sumCpuReqMilli,
		"memRequestBytesTotal":   sumMemReqBytes,
		"cpuUseCoresTotal":       sumCpuUseCores,
		"memUseBytesTotal":       sumMemUseBytes,
		"runningPodsWithCpuReq":  runningWithCpuReq,
		"runningPodsWithMemReq":  runningWithMemReq,
		"runningPodsWithCpuProm": runningWithCpuProm,
		"runningPodsWithMemProm": runningWithMemProm,
	}
	if promOK && sumCpuReqMilli > 0 {
		cluster["cpuUseOverRequestRatio"] = sumCpuUseCores / (float64(sumCpuReqMilli) / 1000.0)
	}
	if promOK && sumMemReqBytes > 0 {
		cluster["memUseOverRequestRatio"] = sumMemUseBytes / float64(sumMemReqBytes)
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":                 true,
		"prometheus":         promOK,
		"prometheusHint":     promHint,
		"scannedRunningPods": scanned,
		"missingLimitsPods":  missingLimits,
		"slackShown":         len(outRows),
		"cluster":            cluster,
		"params": gin.H{
			"maxCpuRatio":        maxCpuRatio,
			"maxMemRatio":        maxMemRatio,
			"minCpuRequestMilli": minCpuReqMilli,
			"minMemRequestBytes": minMemReqBytes,
			"limit":              rowLimit,
		},
		"rows": outRows,
	})
}
