package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	"k8s.io/client-go/kubernetes"
	sigyaml "sigs.k8s.io/yaml"
)

type workloadSchedulingCheckBody struct {
	Kind   string          `json:"kind"`
	Object json.RawMessage `json:"object"`
}

// POST /api/k8s/workloads/scheduling-check
func handleK8sWorkloadSchedulingCheck(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	var body workloadSchedulingCheckBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数解析失败: " + err.Error()})
		return
	}
	kind := strings.TrimSpace(body.Kind)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 70*time.Second)
	defer cancel()
	var r *WorkloadSchedulingPrecheckResult
	var err error
	switch kind {
	case "Deployment":
		var o appsv1.Deployment
		if e := json.Unmarshal(body.Object, &o); e != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object 非合法 Deployment: " + e.Error()})
			return
		}
		r, err = PrecheckDeploymentScheduling(ctx, k8s, &o)
	case "StatefulSet":
		var o appsv1.StatefulSet
		if e := json.Unmarshal(body.Object, &o); e != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object 非合法 StatefulSet: " + e.Error()})
			return
		}
		r, err = PrecheckStatefulSetScheduling(ctx, k8s, &o)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持 kind=Deployment 或 StatefulSet"})
		return
	}
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if !r.OK {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"ok":    false,
			"check": r,
			"error": r.Message,
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "check": r})
}

type workloadPatchResourcesBody struct {
	Kind          string `json:"kind"` // Deployment | StatefulSet
	Namespace     string `json:"namespace"`
	Name          string `json:"name"`
	Container     string `json:"container,omitempty"`
	CpuRequest    string `json:"cpuRequest,omitempty"`
	MemoryRequest string `json:"memoryRequest,omitempty"`
	CpuLimit      string `json:"cpuLimit,omitempty"`
	MemoryLimit   string `json:"memoryLimit,omitempty"`
	// SyncLinked 为 true 时在成功更新 Deployment/STS 后，尝试同步 owner CR 的 spec 内 containers 资源，并按需执行 helm upgrade。
	SyncLinked bool `json:"syncLinked,omitempty"`
	// HelmChartRef 非空且存在 meta.helm.sh/release-name 时，在 syncLinked 下执行 helm upgrade --reuse-values（需镜像内有 helm 且能写临时 kubeconfig）。
	HelmChartRef string `json:"helmChartRef,omitempty"`
	// HelmExtraSets 每项为 key=value，作为额外 --set-string 传给 helm。
	HelmExtraSets []string `json:"helmExtraSets,omitempty"`
	// HelmResourcesValuesPrefix 为 helm values 中 resources 的路径前缀，默认 resources（常见 Bitnami 单 chart）；子 chart 可设为如 redis.master.resources。
	HelmResourcesValuesPrefix string `json:"helmResourcesValuesPrefix,omitempty"`
	// HelmSkipAutoResourceSets 为 true 时不根据 cpu/memory 请求自动生成 --set-string，仅使用 HelmExtraSets。
	HelmSkipAutoResourceSets bool `json:"helmSkipAutoResourceSets,omitempty"`
}

func mergeResourceStringIntoQuantity(dst *corev1.ResourceList, key corev1.ResourceName, val string) {
	t := strings.TrimSpace(val)
	if t == "" {
		delete(*dst, key)
		return
	}
	q, err := resource.ParseQuantity(t)
	if err != nil {
		return
	}
	if *dst == nil {
		*dst = corev1.ResourceList{}
	}
	(*dst)[key] = q
}

// POST /api/k8s/workloads/patch-container-resources
func handleK8sWorkloadPatchContainerResources(c *gin.Context, app *ServerApp) {
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	var body workloadPatchResourcesBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数解析失败: " + err.Error()})
		return
	}
	ns := strings.TrimSpace(body.Namespace)
	name := strings.TrimSpace(body.Name)
	kind := strings.TrimSpace(body.Kind)
	if ns == "" || name == "" || (kind != "Deployment" && kind != "StatefulSet") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要 kind(Deployment|StatefulSet)、namespace、name"})
		return
	}
	reqTimeout := 90 * time.Second
	if body.SyncLinked {
		reqTimeout = 12 * time.Minute
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), reqTimeout)
	defer cancel()

	patchPodTemplate := func(tpl *corev1.PodTemplateSpec) error {
		if tpl == nil {
			return fmt.Errorf("空模板")
		}
		if len(tpl.Spec.Containers) == 0 {
			return fmt.Errorf("无工作容器")
		}
		idx := 0
		if cn := strings.TrimSpace(body.Container); cn != "" {
			found := -1
			for i := range tpl.Spec.Containers {
				if tpl.Spec.Containers[i].Name == cn {
					found = i
					break
				}
			}
			if found < 0 {
				return fmt.Errorf("未找到容器 %q", cn)
			}
			idx = found
		}
		c0 := &tpl.Spec.Containers[idx]
		if c0.Resources.Requests == nil {
			c0.Resources.Requests = corev1.ResourceList{}
		}
		if c0.Resources.Limits == nil {
			c0.Resources.Limits = corev1.ResourceList{}
		}
		mergeResourceStringIntoQuantity(&c0.Resources.Requests, corev1.ResourceCPU, body.CpuRequest)
		mergeResourceStringIntoQuantity(&c0.Resources.Requests, corev1.ResourceMemory, body.MemoryRequest)
		mergeResourceStringIntoQuantity(&c0.Resources.Limits, corev1.ResourceCPU, body.CpuLimit)
		mergeResourceStringIntoQuantity(&c0.Resources.Limits, corev1.ResourceMemory, body.MemoryLimit)
		return nil
	}

	switch kind {
	case "Deployment":
		dep, err := k8s.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		if err := patchPodTemplate(&dep.Spec.Template); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		pre, err := PrecheckDeploymentScheduling(ctx, k8s, dep)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		if !pre.OK {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": pre.Message, "check": pre})
			return
		}
		ex, err := k8s.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		dep.ResourceVersion = ex.ResourceVersion
		if _, err := k8s.AppsV1().Deployments(ns).Update(ctx, dep, metav1.UpdateOptions{}); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		if body.SyncLinked {
			ls := SyncWorkloadLinkedResources(ctx, app, dep.ObjectMeta, &dep.Spec.Template, body)
			SetAuditDetail(c, "工作负载调资源+关联同步 Deployment "+ns+"/"+name)
			c.JSON(http.StatusOK, gin.H{"ok": true, "message": "已更新 resources", "linkedSync": ls})
			return
		}
	case "StatefulSet":
		sts, err := k8s.AppsV1().StatefulSets(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		if err := patchPodTemplate(&sts.Spec.Template); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		pre, err := PrecheckStatefulSetScheduling(ctx, k8s, sts)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		if !pre.OK {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": pre.Message, "check": pre})
			return
		}
		ex, err := k8s.AppsV1().StatefulSets(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		sts.ResourceVersion = ex.ResourceVersion
		if _, err := k8s.AppsV1().StatefulSets(ns).Update(ctx, sts, metav1.UpdateOptions{}); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		if body.SyncLinked {
			ls := SyncWorkloadLinkedResources(ctx, app, sts.ObjectMeta, &sts.Spec.Template, body)
			SetAuditDetail(c, "工作负载调资源+关联同步 StatefulSet "+ns+"/"+name)
			c.JSON(http.StatusOK, gin.H{"ok": true, "message": "已更新 resources", "linkedSync": ls})
			return
		}
	}
	SetAuditDetail(c, "工作负载调资源 "+kind+" "+ns+"/"+name)
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "已更新 resources"})
}

// --- 资源建议（Deployment / StatefulSet 聚合 Pod 用量） ---

type workloadAdvisoryRow struct {
	Kind                 string  `json:"kind"`
	Namespace            string  `json:"namespace"`
	Name                 string  `json:"name"`
	ReplicasDesired      int32   `json:"replicasDesired"`
	RunningPods          int     `json:"runningPods"`
	CpuRequestMilliPod   int64   `json:"cpuRequestMilliPod"`
	MemRequestBytesPod   int64   `json:"memRequestBytesPod"`
	CpuUseCoresAgg       float64 `json:"cpuUseCoresAgg"`
	MemUseBytesAgg       float64 `json:"memUseBytesAgg"`
	CpuUseRatioAvg       float64 `json:"cpuUseRatioAvg"`
	MemUseRatioAvg       float64 `json:"memUseRatioAvg"`
	Risk                 bool    `json:"risk"`
	SuggestedCpuRequest  string  `json:"suggestedCpuRequest,omitempty"`
	SuggestedMemoryRequest string `json:"suggestedMemoryRequest,omitempty"`
	SuggestedCpuLimit    string  `json:"suggestedCpuLimit,omitempty"`
	SuggestedMemoryLimit string  `json:"suggestedMemoryLimit,omitempty"`
	Note                 string  `json:"note,omitempty"`
}

func suggestQuantityMilli(headroom float64, useCores float64, nPods int) string {
	if nPods < 1 {
		nPods = 1
	}
	per := useCores / float64(nPods) * headroom
	m := int64(math.Ceil(per * 1000))
	if m < 50 {
		m = 50
	}
	return fmt.Sprintf("%dm", m)
}

func suggestQuantityMem(headroom float64, useBytes float64, nPods int) string {
	if nPods < 1 {
		nPods = 1
	}
	per := useBytes / float64(nPods) * headroom
	mi := int64(math.Ceil(per / (1024 * 1024)))
	if mi < 32 {
		mi = 32
	}
	return fmt.Sprintf("%dMi", mi)
}

func appendWorkloadRows(
	ctx context.Context,
	k8s *kubernetes.Clientset,
	kind string,
	listNS string,
	cpuByPod, memByPod map[string]float64,
	promOK bool,
	maxCpuRatio, maxMemRatio float64,
	minCpuMilli, minMemBytes int64,
	headroom float64,
	out *[]workloadAdvisoryRow,
	remain *int,
) error {
	if *remain <= 0 {
		return nil
	}
	var deps []*appsv1.Deployment
	var stss []*appsv1.StatefulSet
	if kind == "Deployment" {
		var list *appsv1.DeploymentList
		var err error
		if listNS != "" {
			list, err = k8s.AppsV1().Deployments(listNS).List(ctx, metav1.ListOptions{})
		} else {
			list, err = k8s.AppsV1().Deployments("").List(ctx, metav1.ListOptions{})
		}
		if err != nil {
			return err
		}
		for i := range list.Items {
			deps = append(deps, &list.Items[i])
		}
	} else {
		var list *appsv1.StatefulSetList
		var err error
		if listNS != "" {
			list, err = k8s.AppsV1().StatefulSets(listNS).List(ctx, metav1.ListOptions{})
		} else {
			list, err = k8s.AppsV1().StatefulSets("").List(ctx, metav1.ListOptions{})
		}
		if err != nil {
			return err
		}
		for i := range list.Items {
			stss = append(stss, &list.Items[i])
		}
	}

	process := func(ns, wname string, selector *metav1.LabelSelector, tpl corev1.PodTemplateSpec, rep int32, wkind string) error {
		if *remain <= 0 {
			return nil
		}
		if selector == nil || (len(selector.MatchLabels) == 0 && len(selector.MatchExpressions) == 0) {
			return nil
		}
		sel, err := metav1.LabelSelectorAsSelector(selector)
		if err != nil {
			return nil
		}
		pods, err := k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{LabelSelector: sel.String()})
		if err != nil {
			return err
		}
		var run int
		var cpuU, memU float64
		for _, p := range pods.Items {
			if p.Status.Phase != corev1.PodRunning {
				continue
			}
			run++
			key := p.Namespace + "/" + p.Name
			if promOK {
				cpuU += cpuByPod[key]
				memU += memByPod[key]
			}
		}
		fake := corev1.Pod{Spec: tpl.Spec}
		cpuR, memR, cpuL, memL, _ := PodWorkloadResourcesTotals(&fake)
		if cpuR < minCpuMilli && memR < minMemBytes {
			return nil
		}
		cpuRatio := 0.0
		if cpuR > 0 && promOK && run > 0 {
			cpuRatio = (cpuU / float64(run)) / (float64(cpuR) / 1000.0)
		}
		memRatio := 0.0
		if memR > 0 && promOK && run > 0 {
			memRatio = (memU / float64(run)) / float64(memR)
		}
		riskCPU := promOK && cpuR >= minCpuMilli && run > 0 && cpuRatio < maxCpuRatio
		riskMem := promOK && memR >= minMemBytes && run > 0 && memRatio < maxMemRatio
		if !riskCPU && !riskMem {
			return nil
		}
		row := workloadAdvisoryRow{
			Kind:               wkind,
			Namespace:          ns,
			Name:               wname,
			ReplicasDesired:    rep,
			RunningPods:        run,
			CpuRequestMilliPod: cpuR,
			MemRequestBytesPod: memR,
			CpuUseCoresAgg:     cpuU,
			MemUseBytesAgg:     memU,
			CpuUseRatioAvg:     cpuRatio,
			MemUseRatioAvg:     memRatio,
			Risk:               true,
		}
		if riskCPU || riskMem {
			row.Note = "实际用量（Running Pod 均值）明显低于 requests；可考虑下调 requests/limits 或副本。"
		}
		if promOK && run > 0 {
			if riskCPU {
				row.SuggestedCpuRequest = suggestQuantityMilli(headroom, cpuU, run)
				if cpuL > 0 {
					lim := int64(math.Ceil(float64(cpuL) * 0.85))
					if lim < 50 {
						lim = 50
					}
					row.SuggestedCpuLimit = fmt.Sprintf("%dm", lim)
				}
			}
			if riskMem {
				row.SuggestedMemoryRequest = suggestQuantityMem(headroom, memU, run)
			if memL > 0 {
				limMi := int64(math.Ceil(float64(memL) * 0.85 / float64(1024*1024)))
				if limMi < 32 {
					limMi = 32
				}
				row.SuggestedMemoryLimit = fmt.Sprintf("%dMi", limMi)
			}
			}
		}
		*out = append(*out, row)
		*remain--
		return nil
	}

	if kind == "Deployment" {
		for _, d := range deps {
			rep := int32(1)
			if d.Spec.Replicas != nil {
				rep = *d.Spec.Replicas
			}
			if err := process(d.Namespace, d.Name, d.Spec.Selector, d.Spec.Template, rep, "Deployment"); err != nil {
				return err
			}
		}
	} else {
		for _, s := range stss {
			rep := int32(1)
			if s.Spec.Replicas != nil {
				rep = *s.Spec.Replicas
			}
			if err := process(s.Namespace, s.Name, s.Spec.Selector, s.Spec.Template, rep, "StatefulSet"); err != nil {
				return err
			}
		}
	}
	return nil
}

// GET /api/k8s/workloads/resource-advisory?namespace=&limit=30
func handleK8sWorkloadsResourceAdvisory(c *gin.Context, k8s *kubernetes.Clientset, cfg Config) {
	if !GuardK8s(c, k8s) {
		return
	}
	ns := strings.TrimSpace(c.Query("namespace"))
	limit := 30
	if v := strings.TrimSpace(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 1 && n <= 100 {
			limit = n
		}
	}
	maxCpuRatio := 0.45
	maxMemRatio := 0.45
	headroom := 1.38
	minCpuMilli := int64(500)
	minMemBytes := int64(256 * 1024 * 1024)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()

	base := strings.TrimSpace(GetPrometheusURLForScope(cfg, "k8s"))
	promOK := base != ""
	var cpuByPod, memByPod map[string]float64
	var promHint string
	if promOK {
		commonSel := `namespace!="",pod!="",container!="",container!="POD"`
		cpuQ := `sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{` + commonSel + `}[5m]))`
		memQ := `sum by (namespace, pod) (container_memory_working_set_bytes{` + commonSel + `})`
		var errCPU, errMem error
		cpuByPod, errCPU = prometheusInstantVectorNamespacePod(ctx, cfg, base, cpuQ)
		memByPod, errMem = prometheusInstantVectorNamespacePod(ctx, cfg, base, memQ)
		if errCPU != nil {
			promHint = "CPU: " + errCPU.Error()
		}
		if errMem != nil {
			promHint += " Mem: " + errMem.Error()
		}
		if errCPU != nil && errMem != nil {
			promOK = false
		}
	}

	var rows []workloadAdvisoryRow
	remain := limit
	_ = appendWorkloadRows(ctx, k8s, "Deployment", ns, cpuByPod, memByPod, promOK, maxCpuRatio, maxMemRatio, minCpuMilli, minMemBytes, headroom, &rows, &remain)
	_ = appendWorkloadRows(ctx, k8s, "StatefulSet", ns, cpuByPod, memByPod, promOK, maxCpuRatio, maxMemRatio, minCpuMilli, minMemBytes, headroom, &rows, &remain)
	sort.Slice(rows, func(i, j int) bool {
		a, b := rows[i], rows[j]
		if a.CpuUseRatioAvg != b.CpuUseRatioAvg {
			return a.CpuUseRatioAvg < b.CpuUseRatioAvg
		}
		return a.Namespace+"/"+a.Name < b.Namespace+"/"+b.Name
	})

	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		h := gin.H{
			"kind": r.Kind, "namespace": r.Namespace, "name": r.Name,
			"replicasDesired": r.ReplicasDesired, "runningPods": r.RunningPods,
			"cpuRequestMilliPod": r.CpuRequestMilliPod, "memRequestBytesPod": r.MemRequestBytesPod,
			"cpuUseCoresAgg": r.CpuUseCoresAgg, "memUseBytesAgg": r.MemUseBytesAgg,
			"cpuUseRatioAvg": r.CpuUseRatioAvg, "memUseRatioAvg": r.MemUseRatioAvg,
			"risk": r.Risk, "note": r.Note,
		}
		if r.SuggestedCpuRequest != "" {
			h["suggestedCpuRequest"] = r.SuggestedCpuRequest
		}
		if r.SuggestedMemoryRequest != "" {
			h["suggestedMemoryRequest"] = r.SuggestedMemoryRequest
		}
		if r.SuggestedCpuLimit != "" {
			h["suggestedCpuLimit"] = r.SuggestedCpuLimit
		}
		if r.SuggestedMemoryLimit != "" {
			h["suggestedMemoryLimit"] = r.SuggestedMemoryLimit
		}
		out = append(out, h)
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":             true,
		"prometheus":     promOK,
		"prometheusHint": promHint,
		"rows":           out,
	})
}

// --- 高重启 + Events 粗分析 ---

type restartInsightRow struct {
	Namespace       string   `json:"namespace"`
	Name            string   `json:"name"`
	Phase           string   `json:"phase"`
	Restarts        int32    `json:"restarts"`
	OomKilledSuspect bool    `json:"oomKilledSuspect"`
	EvictedSuspect  bool     `json:"evictedSuspect"`
	BackOffSuspect  bool     `json:"backOffSuspect"`
	RecentReasons   []string `json:"recentReasons,omitempty"`
	TopOwnerKind    string   `json:"topOwnerKind,omitempty"`
	TopOwnerName    string   `json:"topOwnerName,omitempty"`
	HelmRelease     string   `json:"helmRelease,omitempty"`
	Hints           []string `json:"hints,omitempty"`
}

func podTopOwnerRef(p *corev1.Pod) (kind, name string) {
	for _, or := range p.OwnerReferences {
		if or.Controller != nil && *or.Controller {
			return or.Kind, or.Name
		}
	}
	if len(p.OwnerReferences) > 0 {
		or := p.OwnerReferences[0]
		return or.Kind, or.Name
	}
	return "", ""
}

func resolveRolloutTarget(ctx context.Context, k8s *kubernetes.Clientset, ns, kind, name string) (wk, wn string) {
	switch kind {
	case "ReplicaSet":
		rs, err := k8s.AppsV1().ReplicaSets(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return kind, name
		}
		for _, or := range rs.OwnerReferences {
			if or.Kind == "Deployment" {
				return "Deployment", or.Name
			}
		}
		return kind, name
	default:
		return kind, name
	}
}

// GET /api/k8s/pod-restart-insights?minRestarts=8&limit=25
func handleK8sPodRestartInsights(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	minR := int32(8)
	if v := strings.TrimSpace(c.Query("minRestarts")); v != "" {
		if n, err := strconv.ParseInt(v, 10, 32); err == nil && n >= 1 {
			minR = int32(n)
		}
	}
	limit := 25
	if v := strings.TrimSpace(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 1 && n <= 80 {
			limit = n
		}
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()
	list, err := k8s.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	type cand struct {
		p *corev1.Pod
		r int32
	}
	var cands []cand
	for i := range list.Items {
		p := &list.Items[i]
		var rst int32
		for _, cs := range p.Status.ContainerStatuses {
			rst += cs.RestartCount
		}
		if rst < minR {
			continue
		}
		cands = append(cands, cand{p: p, r: rst})
	}
	sort.Slice(cands, func(i, j int) bool {
		if cands[i].r != cands[j].r {
			return cands[i].r > cands[j].r
		}
		return cands[i].p.Namespace+"/"+cands[i].p.Name < cands[j].p.Namespace+"/"+cands[j].p.Name
	})
	if len(cands) > limit {
		cands = cands[:limit]
	}

	out := make([]restartInsightRow, len(cands))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 10)
	for i := range cands {
		i := i
		cnd := cands[i]
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			subCtx, cancel := context.WithTimeout(ctx, 25*time.Second)
			defer cancel()
			out[i] = enrichPodRestartInsight(subCtx, k8s, cnd.p, cnd.r)
		}()
	}
	wg.Wait()
	c.JSON(http.StatusOK, gin.H{"ok": true, "items": out})
}

// enrichPodRestartInsight 汇总单 Pod 的 Events 粗分类、上层工作负载与 Helm 注解提示（供高重启列表与 /pod-restart-insights 复用）。
func enrichPodRestartInsight(ctx context.Context, k8s *kubernetes.Clientset, p *corev1.Pod, restarts int32) restartInsightRow {
	evList, err := k8s.CoreV1().Events(p.Namespace).List(ctx, metav1.ListOptions{
		FieldSelector: "involvedObject.kind=Pod,involvedObject.name=" + p.Name,
	})
	row := restartInsightRow{
		Namespace: p.Namespace,
		Name:      p.Name,
		Phase:     string(p.Status.Phase),
		Restarts:  restarts,
	}
	if err == nil {
		reasons := make([]string, 0, 8)
		for _, e := range evList.Items {
			msg := strings.ToLower(e.Message + " " + e.Reason)
			if strings.Contains(msg, "oomkilled") || strings.Contains(msg, "out of memory") {
				row.OomKilledSuspect = true
			}
			if strings.Contains(msg, "evicted") {
				row.EvictedSuspect = true
			}
			if strings.Contains(msg, "backoff") || strings.Contains(msg, "crashloop") {
				row.BackOffSuspect = true
			}
			if len(reasons) < 6 && strings.TrimSpace(e.Reason) != "" {
				reasons = append(reasons, e.Reason+": "+truncateWorkloadInsightMsg(e.Message, 120))
			}
		}
		row.RecentReasons = reasons
	}
	ok, on := podTopOwnerRef(p)
	row.TopOwnerKind, row.TopOwnerName = ok, on
	wk, wn := resolveRolloutTarget(ctx, k8s, p.Namespace, ok, on)
	row.TopOwnerKind, row.TopOwnerName = wk, wn

	if rel := strings.TrimSpace(p.Annotations["meta.helm.sh/release-name"]); rel != "" {
		row.HelmRelease = rel
		row.Hints = append(row.Hints, "Helm release "+rel+"：一键调资源时可传 syncLinked+helmChartRef 触发 helm upgrade；或在 Values/CI 中持久化。")
	}
	if row.OomKilledSuspect {
		row.Hints = append(row.Hints, "事件疑似 OOM：可上调 memory requests/limits，或通过工作负载资源顾问查看用量。")
	}
	if wk == "Deployment" || wk == "StatefulSet" {
		row.Hints = append(row.Hints, fmt.Sprintf("可尝试一键调资源：PATCH /api/k8s/workloads/patch-container-resources（%s %s/%s）", wk, p.Namespace, wn))
	}
	if strings.Contains(strings.ToLower(wk), "customresource") || strings.Contains(strings.ToLower(wk), "unknown") {
		row.Hints = append(row.Hints, "上层为自定义资源时，请在「自定义资源」页同步修改 CR 中的 resources，否则 Operator 可能覆盖。")
	}
	return row
}

func truncateWorkloadInsightMsg(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// POST /api/k8s/workloads/scheduling-check-yaml 单文档 Deployment/StatefulSet
func handleK8sWorkloadSchedulingCheckYAML(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	var req struct {
		YamlContent string `json:"yamlContent"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	doc := strings.TrimSpace(req.YamlContent)
	if doc == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "yamlContent 为空"})
		return
	}
	kind := kubernetesYAMLKind(doc)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 70*time.Second)
	defer cancel()
	var r *WorkloadSchedulingPrecheckResult
	var err error
	switch kind {
	case "Deployment":
		var o appsv1.Deployment
		if e := sigyaml.Unmarshal([]byte(doc), &o); e != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": e.Error()})
			return
		}
		r, err = PrecheckDeploymentScheduling(ctx, k8s, &o)
	case "StatefulSet":
		var o appsv1.StatefulSet
		if e := sigyaml.Unmarshal([]byte(doc), &o); e != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": e.Error()})
			return
		}
		r, err = PrecheckStatefulSetScheduling(ctx, k8s, &o)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持单文档 kind 为 Deployment 或 StatefulSet"})
		return
	}
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if !r.OK {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"ok": false, "check": r, "error": r.Message})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "check": r})
}
