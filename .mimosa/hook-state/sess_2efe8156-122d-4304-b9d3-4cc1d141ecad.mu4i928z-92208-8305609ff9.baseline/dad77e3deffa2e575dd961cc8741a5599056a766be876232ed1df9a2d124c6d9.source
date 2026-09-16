package internal

import (
	"context"
	"fmt"
	"io"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/fields"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
	sigyaml "sigs.k8s.io/yaml"
)

func handleK8sSummary(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	nsList, err := k8s.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "列出 Namespace 失败: " + err.Error()})
		return
	}
	podList, err := k8s.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "列出 Pod 失败: " + err.Error()})
		return
	}
	svcList, err := k8s.CoreV1().Services("").List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "列出 Service 失败: " + err.Error()})
		return
	}
	nodeList, err := k8s.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "列出 Node 失败: " + err.Error()})
		return
	}

	podsRunning := 0
	podsFailed := 0
	podsPending := 0
	podsCrashLoop := 0
	type anomalyPick struct {
		key      string
		priority int
		payload  gin.H
	}
	anomalyPicks := make([]anomalyPick, 0, 64)
	for _, p := range podList.Items {
		switch p.Status.Phase {
		case corev1.PodRunning:
			podsRunning++
		case corev1.PodFailed:
			podsFailed++
		case corev1.PodPending:
			podsPending++
		}
		crash := false
		for _, cs := range p.Status.ContainerStatuses {
			if cs.State.Waiting != nil && cs.State.Waiting.Reason == "CrashLoopBackOff" {
				crash = true
				break
			}
		}
		if !crash {
			for _, cs := range p.Status.InitContainerStatuses {
				if cs.State.Waiting != nil && cs.State.Waiting.Reason == "CrashLoopBackOff" {
					crash = true
					break
				}
			}
		}
		if crash {
			podsCrashLoop++
		}
		if podSummaryIsAnomaly(&p) {
			reason := podBriefAnomalyReason(&p)
			if reason == "" {
				reason = string(p.Status.Phase)
			}
			key := p.Namespace + "/" + p.Name
			anomalyPicks = append(anomalyPicks, anomalyPick{
				key:      key,
				priority: anomalyPodPriority(&p),
				payload: gin.H{
					"namespace": p.Namespace,
					"name":      p.Name,
					"phase":     string(p.Status.Phase),
					"reason":    reason,
				},
			})
		}
	}
	sort.Slice(anomalyPicks, func(i, j int) bool {
		if anomalyPicks[i].priority != anomalyPicks[j].priority {
			return anomalyPicks[i].priority < anomalyPicks[j].priority
		}
		return anomalyPicks[i].key < anomalyPicks[j].key
	})
	const maxAnomalyPods = 48
	if len(anomalyPicks) > maxAnomalyPods {
		anomalyPicks = anomalyPicks[:maxAnomalyPods]
	}
	anomalyPods := make([]gin.H, len(anomalyPicks))
	for i := range anomalyPicks {
		anomalyPods[i] = anomalyPicks[i].payload
	}

	nodesNotReady := 0
	for _, n := range nodeList.Items {
		ready := false
		for _, cond := range n.Status.Conditions {
			if cond.Type == corev1.NodeReady && cond.Status == corev1.ConditionTrue {
				ready = true
				break
			}
		}
		if !ready {
			nodesNotReady++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"namespaceCount": len(nsList.Items),
		"podCount":       len(podList.Items),
		"serviceCount":   len(svcList.Items),
		"nodeCount":      len(nodeList.Items),
		"podsRunning":    podsRunning,
		"podsFailed":     podsFailed,
		"podsPending":    podsPending,
		"podsCrashLoop":  podsCrashLoop,
		"nodesNotReady":  nodesNotReady,
		"anomalyPods":    anomalyPods,
	})
}

func podHasCrashLoopBackOff(p *corev1.Pod) bool {
	for _, cs := range p.Status.ContainerStatuses {
		if cs.State.Waiting != nil && cs.State.Waiting.Reason == "CrashLoopBackOff" {
			return true
		}
	}
	for _, cs := range p.Status.InitContainerStatuses {
		if cs.State.Waiting != nil && cs.State.Waiting.Reason == "CrashLoopBackOff" {
			return true
		}
	}
	return false
}

func podSummaryIsAnomaly(p *corev1.Pod) bool {
	switch p.Status.Phase {
	case corev1.PodFailed, corev1.PodPending, corev1.PodUnknown:
		return true
	}
	return podHasCrashLoopBackOff(p)
}

func anomalyPodPriority(p *corev1.Pod) int {
	if p.Status.Phase == corev1.PodFailed {
		return 0
	}
	if podHasCrashLoopBackOff(p) {
		return 1
	}
	if p.Status.Phase == corev1.PodPending {
		return 2
	}
	if p.Status.Phase == corev1.PodUnknown {
		return 3
	}
	return 9
}

func podBriefAnomalyReason(p *corev1.Pod) string {
	if podHasCrashLoopBackOff(p) {
		return "CrashLoopBackOff"
	}
	for i := range p.Status.ContainerStatuses {
		cs := &p.Status.ContainerStatuses[i]
		if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
			return cs.State.Waiting.Reason
		}
		if cs.State.Terminated != nil {
			r := cs.State.Terminated.Reason
			if r != "" && r != "Completed" {
				return r
			}
		}
	}
	for i := range p.Status.InitContainerStatuses {
		cs := &p.Status.InitContainerStatuses[i]
		if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
			return cs.State.Waiting.Reason
		}
	}
	if p.Status.Reason != "" {
		return p.Status.Reason
	}
	return ""
}

func handleK8sPods(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ns := c.Query("namespace")
	ls := strings.TrimSpace(c.Query("labelSelector"))
	nodeOn := strings.TrimSpace(c.Query("node"))
	phaseFilter := strings.TrimSpace(c.Query("phase"))
	problem := strings.ToLower(strings.TrimSpace(c.Query("problem")))
	ctx := context.TODO()
	opts := metav1.ListOptions{}
	if ls != "" {
		opts.LabelSelector = ls
	}
	if nodeOn != "" {
		opts.FieldSelector = fields.OneTermEqualSelector("spec.nodeName", nodeOn).String()
	}
	var list *corev1.PodList
	var err error
	if ns != "" {
		list, err = k8s.CoreV1().Pods(ns).List(ctx, opts)
	} else {
		list, err = k8s.CoreV1().Pods("").List(ctx, opts)
	}
	if err != nil {
		RespondAPIError500(c, "列出 Pod 失败: " + err.Error())
		return
	}
	out := make([]map[string]interface{}, 0, len(list.Items))
	for _, p := range list.Items {
		if phaseFilter != "" && string(p.Status.Phase) != phaseFilter {
			continue
		}
		if problem == "crashloop" && !podHasCrashLoopBackOff(&p) {
			continue
		}
		restarts := int32(0)
		for _, cs := range p.Status.ContainerStatuses {
			restarts += cs.RestartCount
		}
		node := p.Spec.NodeName
		if node == "" {
			node = "—"
		}
		firstContainer := ""
		if len(p.Spec.Containers) > 0 {
			firstContainer = p.Spec.Containers[0].Name
		} else if len(p.Spec.InitContainers) > 0 {
			firstContainer = p.Spec.InitContainers[0].Name
		}
		cpuReqMilli, memReqBytes, _, _, _ := PodWorkloadResourcesTotals(&p)
		out = append(out, map[string]interface{}{
			"namespace":        p.Namespace,
			"name":             p.Name,
			"phase":            string(p.Status.Phase),
			"node":             node,
			"restarts":         restarts,
			"age":              p.CreationTimestamp.Time.Format(time.RFC3339),
			"firstContainer":   firstContainer,
			"cpuRequestMilli":  cpuReqMilli,
			"memRequestBytes":  memReqBytes,
		})
	}
	c.JSON(http.StatusOK, out)
}

func handleK8sPodGet(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ns := c.Param("namespace")
	name := c.Param("name")
	ctx := context.TODO()
	pod, err := k8s.CoreV1().Pods(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Pod 不存在"})
			return
		}
		RespondAPIError500(c, "获取 Pod 失败: " + err.Error())
		return
	}
	pod.ObjectMeta.ManagedFields = nil

	restarts := int32(0)
	for _, cs := range pod.Status.ContainerStatuses {
		restarts += cs.RestartCount
	}
	node := pod.Spec.NodeName
	if node == "" {
		node = "—"
	}

	containers := make([]gin.H, 0, len(pod.Spec.Containers)+len(pod.Spec.InitContainers))
	for _, ctn := range pod.Spec.InitContainers {
		containers = append(containers, gin.H{"name": ctn.Name, "image": ctn.Image, "init": true})
	}
	var cpuLimitMilli int64
	var memLimitBytes int64
	var cpuRequestMilli int64
	var memRequestBytes int64
	for _, ctn := range pod.Spec.Containers {
		req := ctn.Resources.Requests
		lim := ctn.Resources.Limits
		cpuReqStr := ""
		memReqStr := ""
		cpuLimStr := ""
		memLimStr := ""
		if q, ok := req[corev1.ResourceCPU]; ok {
			cpuReqStr = q.String()
			cpuRequestMilli += q.MilliValue()
		}
		if q, ok := req[corev1.ResourceMemory]; ok {
			memReqStr = q.String()
			memRequestBytes += q.Value()
		}
		if q, ok := lim[corev1.ResourceCPU]; ok {
			cpuLimStr = q.String()
			cpuLimitMilli += q.MilliValue()
		}
		if q, ok := lim[corev1.ResourceMemory]; ok {
			memLimStr = q.String()
			memLimitBytes += q.Value()
		}
		containers = append(containers, gin.H{
			"name":          ctn.Name,
			"image":         ctn.Image,
			"init":          false,
			"cpuRequest":    cpuReqStr,
			"memoryRequest": memReqStr,
			"cpuLimit":      cpuLimStr,
			"memoryLimit":   memLimStr,
		})
	}

	yamlBytes, err := sigyaml.Marshal(pod)
	if err != nil {
		RespondAPIError500(c, "序列化 YAML 失败: " + err.Error())
		return
	}

	eventList, errEv := k8s.CoreV1().Events(ns).List(ctx, metav1.ListOptions{
		FieldSelector: fields.OneTermEqualSelector("involvedObject.uid", string(pod.UID)).String(),
	})
	if errEv != nil || eventList == nil || len(eventList.Items) == 0 {
		fs := fields.AndSelectors(
			fields.OneTermEqualSelector("involvedObject.kind", "Pod"),
			fields.OneTermEqualSelector("involvedObject.name", name),
		)
		eventList, _ = k8s.CoreV1().Events(ns).List(ctx, metav1.ListOptions{FieldSelector: fs.String()})
	}
	eventsOut := make([]gin.H, 0)
	if eventList != nil {
		sort.Slice(eventList.Items, func(i, j int) bool {
			return eventList.Items[i].LastTimestamp.After(eventList.Items[j].LastTimestamp.Time)
		})
		for _, ev := range eventList.Items {
			first := ""
			if !ev.FirstTimestamp.IsZero() {
				first = ev.FirstTimestamp.Time.Format(time.RFC3339)
			}
			last := ""
			if !ev.LastTimestamp.IsZero() {
				last = ev.LastTimestamp.Time.Format(time.RFC3339)
			}
			eventsOut = append(eventsOut, gin.H{
				"type":           ev.Type,
				"reason":         ev.Reason,
				"message":        ev.Message,
				"count":          ev.Count,
				"firstTimestamp": first,
				"lastTimestamp":  last,
				"age":            last,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"namespace":         pod.Namespace,
		"name":              pod.Name,
		"phase":             string(pod.Status.Phase),
		"node":              node,
		"restarts":          restarts,
		"age":               pod.CreationTimestamp.Time.Format(time.RFC3339),
		"containers":        containers,
		"cpuRequestMilli":   cpuRequestMilli,
		"memRequestBytes":   memRequestBytes,
		"cpuLimitMilli":     cpuLimitMilli,
		"memLimitBytes":     memLimitBytes,
		"yaml":              string(yamlBytes),
		"events":            eventsOut,
	})
}

// handleK8sPodLogs 返回指定容器的 stdout/stderr 日志（Kubernetes PodLog）。
// GET /api/k8s/pods/:namespace/:name/logs?container=&tailLines=&previous=
// container 可省略：将使用 Pod 第一个工作容器（无则第一个 init 容器）。
func handleK8sPodLogs(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ns := c.Param("namespace")
	name := c.Param("name")
	container := strings.TrimSpace(c.Query("container"))
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()

	if container == "" {
		pod, err := k8s.CoreV1().Pods(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Pod 不存在"})
				return
			}
			RespondAPIError500(c, "读取 Pod 失败: " + err.Error())
			return
		}
		if len(pod.Spec.Containers) > 0 {
			container = pod.Spec.Containers[0].Name
		} else if len(pod.Spec.InitContainers) > 0 {
			container = pod.Spec.InitContainers[0].Name
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Pod 无容器，无法取日志"})
			return
		}
	}

	tailLines := int64(500)
	if t := c.Query("tailLines"); t != "" {
		if n, err := strconv.ParseInt(t, 10, 64); err == nil && n > 0 && n <= 10000 {
			tailLines = n
		}
	}
	previous := c.Query("previous") == "true"
	follow := false
	opts := &corev1.PodLogOptions{
		Container: container,
		TailLines: &tailLines,
		Previous:  previous,
		Follow:    follow,
	}
	req := k8s.CoreV1().Pods(ns).GetLogs(name, opts)
	stream, err := req.Stream(ctx)
	if err != nil {
		if apierrors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Pod 不存在或无法读取日志"})
			return
		}
		RespondAPIError500(c, "获取日志失败: " + err.Error())
		return
	}
	defer stream.Close()
	buf, err := io.ReadAll(stream)
	if err != nil {
		RespondAPIError500(c, "读取日志流失败: " + err.Error())
		return
	}
	c.Data(http.StatusOK, "text/plain; charset=utf-8", buf)
}

// podRestartListRow GET /api/k8s/pod-restarts 返回项；includeEventHints=1 时填充 Events 粗分类（与 /pod-restart-insights 同源逻辑）。
type podRestartListRow struct {
	Namespace         string   `json:"namespace"`
	Name              string   `json:"name"`
	Phase             string   `json:"phase"`
	Restarts          int32    `json:"restarts"`
	PrimaryContainer  string   `json:"primaryContainer,omitempty"`
	OomKilledSuspect  bool     `json:"oomKilledSuspect,omitempty"`
	EvictedSuspect    bool     `json:"evictedSuspect,omitempty"`
	BackOffSuspect    bool     `json:"backOffSuspect,omitempty"`
	RecentReasons     []string `json:"recentReasons,omitempty"`
	TopOwnerKind      string   `json:"topOwnerKind,omitempty"`
	TopOwnerName      string   `json:"topOwnerName,omitempty"`
	HelmRelease       string   `json:"helmRelease,omitempty"`
	Hints             []string `json:"hints,omitempty"`
}

func podRestartListRowFromCand(p *corev1.Pod, rst int32, ir restartInsightRow) podRestartListRow {
	pc := ""
	if len(p.Spec.Containers) > 0 {
		pc = p.Spec.Containers[0].Name
	}
	return podRestartListRow{
		Namespace:         p.Namespace,
		Name:              p.Name,
		Phase:             string(p.Status.Phase),
		Restarts:          rst,
		PrimaryContainer:  pc,
		OomKilledSuspect:  ir.OomKilledSuspect,
		EvictedSuspect:    ir.EvictedSuspect,
		BackOffSuspect:    ir.BackOffSuspect,
		RecentReasons:     ir.RecentReasons,
		TopOwnerKind:      ir.TopOwnerKind,
		TopOwnerName:      ir.TopOwnerName,
		HelmRelease:       ir.HelmRelease,
		Hints:             ir.Hints,
	}
}

// handleK8sPodRestarts 列出全集群「工作容器重启次数合计」较高的 Pod，供 Dashboard 高重启视图与排查入口。
// GET /api/k8s/pod-restarts?minRestarts=5&limit=60&includeEventHints=1
func handleK8sPodRestarts(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	minR := int32(5)
	if v := strings.TrimSpace(c.Query("minRestarts")); v != "" {
		if n, err := strconv.ParseInt(v, 10, 32); err == nil && n >= 1 && n <= 5000 {
			minR = int32(n)
		}
	}
	limit := 60
	if v := strings.TrimSpace(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 1 && n <= 200 {
			limit = n
		}
	}
	hintsParam := strings.TrimSpace(strings.ToLower(c.Query("includeEventHints")))
	includeHints := hintsParam == "1" || hintsParam == "true" || hintsParam == "yes"
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()
	list, err := k8s.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "列出 Pod 失败: " + err.Error()})
		return
	}
	type cand struct {
		p   *corev1.Pod
		rst int32
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
		cands = append(cands, cand{p: p, rst: rst})
	}
	sort.Slice(cands, func(i, j int) bool {
		if cands[i].rst != cands[j].rst {
			return cands[i].rst > cands[j].rst
		}
		if cands[i].p.Namespace != cands[j].p.Namespace {
			return cands[i].p.Namespace < cands[j].p.Namespace
		}
		return cands[i].p.Name < cands[j].p.Name
	})
	if len(cands) > limit {
		cands = cands[:limit]
	}
	rows := make([]podRestartListRow, len(cands))
	if includeHints && len(cands) > 0 {
		var wg sync.WaitGroup
		sem := make(chan struct{}, 8)
		for i := range cands {
			i := i
			cd := cands[i]
			wg.Add(1)
			go func() {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()
				subCtx, cc := context.WithTimeout(ctx, 20*time.Second)
				defer cc()
				ir := enrichPodRestartInsight(subCtx, k8s, cd.p, cd.rst)
				rows[i] = podRestartListRowFromCand(cd.p, cd.rst, ir)
			}()
		}
		wg.Wait()
	} else {
		for i, cd := range cands {
			rows[i] = podRestartListRowFromCand(cd.p, cd.rst, restartInsightRow{})
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "minRestarts": minR, "includeEventHints": includeHints, "items": rows})
}

func handleK8sPodDelete(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ns := c.Param("namespace")
	name := c.Param("name")
	ctx := context.TODO()
	err := k8s.CoreV1().Pods(ns).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Pod 不存在"})
			return
		}
		RespondAPIError500(c, "删除 Pod 失败: " + err.Error())
		return
	}
	SetAuditDetail(c, "删除 Pod "+ns+"/"+name)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// formatK8sServicePort 人类可读端口：协议、Service 端口、目标端口，NodePort / LoadBalancer 时附节点端口。
func formatK8sServicePort(p corev1.ServicePort) string {
	protocol := string(p.Protocol)
	if protocol == "" {
		protocol = "TCP"
	}
	nm := strings.TrimSpace(p.Name)
	if nm == "" {
		nm = strings.ToLower(protocol)
	}
	target := ""
	switch p.TargetPort.Type {
	case intstr.Int:
		if p.TargetPort.IntVal > 0 {
			target = fmt.Sprintf("%d", p.TargetPort.IntVal)
		}
	case intstr.String:
		if t := strings.TrimSpace(p.TargetPort.StrVal); t != "" {
			target = t
		}
	}
	var b strings.Builder
	fmt.Fprintf(&b, "%s:%d/%s", nm, p.Port, protocol)
	if target != "" {
		fmt.Fprintf(&b, "→%s", target)
	}
	if p.NodePort > 0 {
		fmt.Fprintf(&b, " (NodePort %d)", p.NodePort)
	}
	return b.String()
}

func buildK8sServicePortEntry(p corev1.ServicePort) map[string]interface{} {
	protocol := string(p.Protocol)
	if protocol == "" {
		protocol = "TCP"
	}
	nm := strings.TrimSpace(p.Name)
	if nm == "" {
		nm = strings.ToLower(protocol)
	}
	target := ""
	switch p.TargetPort.Type {
	case intstr.Int:
		if p.TargetPort.IntVal > 0 {
			target = fmt.Sprintf("%d", p.TargetPort.IntVal)
		}
	case intstr.String:
		if t := strings.TrimSpace(p.TargetPort.StrVal); t != "" {
			target = t
		}
	}
	if target == "" {
		target = fmt.Sprintf("%d", p.Port)
	}
	ent := map[string]interface{}{
		"name":     nm,
		"port":     p.Port,
		"protocol": protocol,
		"target":   target,
	}
	if p.NodePort > 0 {
		ent["nodePort"] = p.NodePort
	}
	return ent
}

func handleK8sServices(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ns := c.Query("namespace")
	ctx := context.TODO()
	var list *corev1.ServiceList
	var err error
	if ns != "" {
		list, err = k8s.CoreV1().Services(ns).List(ctx, metav1.ListOptions{})
	} else {
		list, err = k8s.CoreV1().Services("").List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		RespondAPIError500(c, "列出 Service 失败: " + err.Error())
		return
	}
	out := make([]map[string]interface{}, 0, len(list.Items))
	for _, s := range list.Items {
		ports := make([]string, 0, len(s.Spec.Ports))
		portEntries := make([]map[string]interface{}, 0, len(s.Spec.Ports))
		for _, p := range s.Spec.Ports {
			ports = append(ports, formatK8sServicePort(p))
			portEntries = append(portEntries, buildK8sServicePortEntry(p))
		}
		out = append(out, map[string]interface{}{
			"namespace":    s.Namespace,
			"name":         s.Name,
			"labels":       k8sLabelsString(s.Labels),
			"type":         string(s.Spec.Type),
			"clusterIP":    s.Spec.ClusterIP,
			"ports":        ports,
			"portEntries":  portEntries,
			"age":          s.CreationTimestamp.Time.Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, out)
}

func nodeAllocatableCPUCores(n *corev1.Node) float64 {
	q, ok := n.Status.Allocatable[corev1.ResourceCPU]
	if !ok || q.IsZero() {
		q = n.Status.Capacity[corev1.ResourceCPU]
	}
	return float64(q.MilliValue()) / 1000.0
}

func nodeAllocatableMemBytes(n *corev1.Node) float64 {
	q, ok := n.Status.Allocatable[corev1.ResourceMemory]
	if !ok || q.IsZero() {
		q = n.Status.Capacity[corev1.ResourceMemory]
	}
	return float64(q.Value())
}

func promInstanceMatchesNodeIP(nodeIP, promInstance string) bool {
	nodeIP = strings.TrimSpace(nodeIP)
	promInstance = strings.TrimSpace(promInstance)
	if nodeIP == "" || promInstance == "" {
		return false
	}
	if promInstance == nodeIP {
		return true
	}
	if strings.HasPrefix(promInstance, nodeIP+":") {
		return true
	}
	if strings.HasPrefix(promInstance, "["+nodeIP+"]:") {
		return true
	}
	return false
}

func pickPromValueByHostname(nodeName string, m map[string]float64) (float64, bool) {
	if len(m) == 0 || strings.TrimSpace(nodeName) == "" {
		return 0, false
	}
	if v, ok := m[nodeName]; ok {
		return v, true
	}
	for k, v := range m {
		if strings.EqualFold(k, nodeName) {
			return v, true
		}
	}
	return 0, false
}

func pickPromValueByInstanceIP(internalIP string, m map[string]float64) (float64, bool) {
	internalIP = strings.TrimSpace(internalIP)
	if internalIP == "" || len(m) == 0 {
		return 0, false
	}
	for inst, v := range m {
		if promInstanceMatchesNodeIP(internalIP, inst) {
			return v, true
		}
	}
	return 0, false
}

func findCommonInstanceForIP(internalIP string, cpuM, memM map[string]float64) (string, bool) {
	internalIP = strings.TrimSpace(internalIP)
	if internalIP == "" || len(cpuM) == 0 || len(memM) == 0 {
		return "", false
	}
	for k := range cpuM {
		if _, ok := memM[k]; !ok {
			continue
		}
		if promInstanceMatchesNodeIP(internalIP, k) {
			return k, true
		}
	}
	return "", false
}

type nodePromResolved struct {
	CPUUsed, MemUsed    float64
	CPUOk, MemOk        bool
	SparkKind, SparkKey string
}

func resolveNodePrometheus(name, internalIP string, cpuH, memH, cpuN, memN, cpuI, memI map[string]float64) nodePromResolved {
	var r nodePromResolved
	tryFull := func(cpuM, memM map[string]float64, kind, sparkKey string) bool {
		cu, ok1 := pickPromValueByHostname(name, cpuM)
		mu, ok2 := pickPromValueByHostname(name, memM)
		if ok1 && ok2 {
			r.CPUUsed, r.MemUsed = cu, mu
			r.CPUOk, r.MemOk = true, true
			r.SparkKind, r.SparkKey = kind, sparkKey
			return true
		}
		return false
	}
	if tryFull(cpuH, memH, "kubernetes_io_hostname", name) {
		return r
	}
	if tryFull(cpuN, memN, "node", name) {
		return r
	}
	if inst, ok := findCommonInstanceForIP(internalIP, cpuI, memI); ok {
		r.CPUUsed = cpuI[inst]
		r.MemUsed = memI[inst]
		r.CPUOk, r.MemOk = true, true
		r.SparkKind, r.SparkKey = "instance", inst
		return r
	}
	if cu, ok := pickPromValueByHostname(name, cpuH); ok {
		r.CPUUsed, r.CPUOk = cu, true
	} else if cu, ok := pickPromValueByHostname(name, cpuN); ok {
		r.CPUUsed, r.CPUOk = cu, true
	} else if internalIP != "" {
		for k, v := range cpuI {
			if promInstanceMatchesNodeIP(internalIP, k) {
				r.CPUUsed, r.CPUOk = v, true
				break
			}
		}
	}
	if mu, ok := pickPromValueByHostname(name, memH); ok {
		r.MemUsed, r.MemOk = mu, true
	} else if mu, ok := pickPromValueByHostname(name, memN); ok {
		r.MemUsed, r.MemOk = mu, true
	} else if internalIP != "" {
		for k, v := range memI {
			if promInstanceMatchesNodeIP(internalIP, k) {
				r.MemUsed, r.MemOk = v, true
				break
			}
		}
	}
	return r
}

// mergeFloatMapPreferPrimary 用 supplemental 补全 primary 中缺失的 key（不覆盖已有值）。
// 用于 cAdvisor：无 id="/" 时 kubelet 往往只有 pod cgroup 长 id，需按 node/hostname/instance 聚合容器指标。
func mergeFloatMapPreferPrimary(primary map[string]float64, supplemental map[string]float64) map[string]float64 {
	if primary == nil {
		primary = make(map[string]float64)
	}
	if len(supplemental) == 0 {
		return primary
	}
	for k, v := range supplemental {
		if _, ok := primary[k]; !ok {
			primary[k] = v
		}
	}
	return primary
}

func buildNodeSparkPromQL(kind, key string) (cpuQ, memQ string) {
	if strings.TrimSpace(key) == "" {
		return "", ""
	}
	iq := promLabelValue(key)
	var pair string
	switch kind {
	case "instance":
		pair = "instance=" + iq
	case "node":
		pair = "node=" + iq
	default:
		pair = "kubernetes_io_hostname=" + iq
	}
	// 根 cgroup 在部分集群为 id="/"，另一些为 /kubepods.slice 或 /kubepods；用 or 取首个有样本的序列，避免趋势图「无数据」而 instant 有数据。
	cpu := func(id string) string {
		return `sum(rate(container_cpu_usage_seconds_total{id="` + id + `",` + pair + `}[5m]))`
	}
	mem := func(id string) string {
		return `sum(container_memory_working_set_bytes{id="` + id + `",` + pair + `})`
	}
	paths := []string{"/", "/kubepods.slice", "/kubepods"}
	var cb, mb []string
	for _, p := range paths {
		cb = append(cb, cpu(p))
		mb = append(mb, mem(p))
	}
	// 与 kube-prometheus/kubelet 常见形态一致：仅有 pod cgroup 长 id、带 node= 标签时，汇总所有工作容器（排除 POD 占位）
	cb = append(cb, `sum(rate(container_cpu_usage_seconds_total{`+pair+`,container!="POD",container!=""}[5m]))`)
	mb = append(mb, `sum(container_memory_working_set_bytes{`+pair+`,container!="POD",container!=""})`)
	return strings.Join(cb, " or "), strings.Join(mb, " or ")
}

func handleK8sNodes(c *gin.Context, app *ServerApp) {
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	cfg := app.Cfg()
	list, err := k8s.CoreV1().Nodes().List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		RespondAPIError500(c, "列出 Node 失败: " + err.Error())
		return
	}

	reqCtx := c.Request.Context()
	var allPods *corev1.PodList
	var podListErr error
	var podWg sync.WaitGroup
	podWg.Add(1)
	go func() {
		defer podWg.Done()
		pl, err := k8s.CoreV1().Pods("").List(reqCtx, metav1.ListOptions{})
		allPods = pl
		podListErr = err
	}()

	base := strings.TrimSpace(GetPrometheusURLForScope(cfg, "k8s"))
	prometheusConfigured := base != ""

	var cpuH, memH, cpuN, memN, cpuI, memI map[string]float64
	var metricsHint string
	if prometheusConfigured {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 28*time.Second)
		cpuHostQ := `sum by (kubernetes_io_hostname) (rate(container_cpu_usage_seconds_total{id="/"}[5m]))`
		memHostQ := `sum by (kubernetes_io_hostname) (container_memory_working_set_bytes{id="/"})`
		cpuNodeQ := `sum by (node) (rate(container_cpu_usage_seconds_total{id="/"}[5m]))`
		memNodeQ := `sum by (node) (container_memory_working_set_bytes{id="/"})`
		cpuInstQ := `sum by (instance) (rate(container_cpu_usage_seconds_total{id="/"}[5m]))`
		memInstQ := `sum by (instance) (container_memory_working_set_bytes{id="/"})`
		// 无 id="/" 时：按标签聚合全部工作容器（与 kube-prometheus 等场景下长 cgroup id 一致）
		cpuHostAggQ := `sum by (kubernetes_io_hostname) (rate(container_cpu_usage_seconds_total{container!="POD",container!=""}[5m]))`
		memHostAggQ := `sum by (kubernetes_io_hostname) (container_memory_working_set_bytes{container!="POD",container!=""})`
		cpuNodeAggQ := `sum by (node) (rate(container_cpu_usage_seconds_total{container!="POD",container!=""}[5m]))`
		memNodeAggQ := `sum by (node) (container_memory_working_set_bytes{container!="POD",container!=""})`
		cpuInstAggQ := `sum by (instance) (rate(container_cpu_usage_seconds_total{container!="POD",container!=""}[5m]))`
		memInstAggQ := `sum by (instance) (container_memory_working_set_bytes{container!="POD",container!=""})`

		var wg sync.WaitGroup
		var errHCPU, errHMem, errNCPU, errNMem, errICPU, errIMem error
		var errHCPUa, errHMema, errNCPUa, errNMema, errICPUa, errIMema error
		var cpuHostAgg, memHostAgg, cpuNodeAgg, memNodeAgg, cpuInstAgg, memInstAgg map[string]float64
		wg.Add(12)
		go func() {
			defer wg.Done()
			cpuH, errHCPU = prometheusInstantVectorMetricLabel(ctx, cfg, base, cpuHostQ, "kubernetes_io_hostname")
		}()
		go func() {
			defer wg.Done()
			memH, errHMem = prometheusInstantVectorMetricLabel(ctx, cfg, base, memHostQ, "kubernetes_io_hostname")
		}()
		go func() {
			defer wg.Done()
			cpuN, errNCPU = prometheusInstantVectorMetricLabel(ctx, cfg, base, cpuNodeQ, "node")
		}()
		go func() {
			defer wg.Done()
			memN, errNMem = prometheusInstantVectorMetricLabel(ctx, cfg, base, memNodeQ, "node")
		}()
		go func() {
			defer wg.Done()
			cpuI, errICPU = prometheusInstantVectorMetricLabel(ctx, cfg, base, cpuInstQ, "instance")
		}()
		go func() {
			defer wg.Done()
			memI, errIMem = prometheusInstantVectorMetricLabel(ctx, cfg, base, memInstQ, "instance")
		}()
		go func() {
			defer wg.Done()
			cpuHostAgg, errHCPUa = prometheusInstantVectorMetricLabel(ctx, cfg, base, cpuHostAggQ, "kubernetes_io_hostname")
		}()
		go func() {
			defer wg.Done()
			memHostAgg, errHMema = prometheusInstantVectorMetricLabel(ctx, cfg, base, memHostAggQ, "kubernetes_io_hostname")
		}()
		go func() {
			defer wg.Done()
			cpuNodeAgg, errNCPUa = prometheusInstantVectorMetricLabel(ctx, cfg, base, cpuNodeAggQ, "node")
		}()
		go func() {
			defer wg.Done()
			memNodeAgg, errNMema = prometheusInstantVectorMetricLabel(ctx, cfg, base, memNodeAggQ, "node")
		}()
		go func() {
			defer wg.Done()
			cpuInstAgg, errICPUa = prometheusInstantVectorMetricLabel(ctx, cfg, base, cpuInstAggQ, "instance")
		}()
		go func() {
			defer wg.Done()
			memInstAgg, errIMema = prometheusInstantVectorMetricLabel(ctx, cfg, base, memInstAggQ, "instance")
		}()
		wg.Wait()
		cancel()

		// 与 Node.Status.allocatable 对比时，用量优先取「工作负载容器」聚合（排除 id="/" 整机 cgroup，避免含系统预留导致 >100%）
		cpuH = mergeFloatMapPreferPrimary(cpuHostAgg, cpuH)
		memH = mergeFloatMapPreferPrimary(memHostAgg, memH)
		cpuN = mergeFloatMapPreferPrimary(cpuNodeAgg, cpuN)
		memN = mergeFloatMapPreferPrimary(memNodeAgg, memN)
		cpuI = mergeFloatMapPreferPrimary(cpuInstAgg, cpuI)
		memI = mergeFloatMapPreferPrimary(memInstAgg, memI)

		var hints []string
		if errHCPU != nil {
			hints = append(hints, "CPU(主机名): "+errHCPU.Error())
		}
		if errHMem != nil {
			hints = append(hints, "内存(主机名): "+errHMem.Error())
		}
		if errNCPU != nil {
			hints = append(hints, "CPU(node): "+errNCPU.Error())
		}
		if errNMem != nil {
			hints = append(hints, "内存(node): "+errNMem.Error())
		}
		if errICPU != nil {
			hints = append(hints, "CPU(instance): "+errICPU.Error())
		}
		if errIMem != nil {
			hints = append(hints, "内存(instance): "+errIMem.Error())
		}
		if errHCPUa != nil {
			hints = append(hints, "CPU(主机名·容器聚合): "+errHCPUa.Error())
		}
		if errHMema != nil {
			hints = append(hints, "内存(主机名·容器聚合): "+errHMema.Error())
		}
		if errNCPUa != nil {
			hints = append(hints, "CPU(node·容器聚合): "+errNCPUa.Error())
		}
		if errNMema != nil {
			hints = append(hints, "内存(node·容器聚合): "+errNMema.Error())
		}
		if errICPUa != nil {
			hints = append(hints, "CPU(instance·容器聚合): "+errICPUa.Error())
		}
		if errIMema != nil {
			hints = append(hints, "内存(instance·容器聚合): "+errIMema.Error())
		}
		metricsHint = strings.Join(hints, "；")
	}

	podWg.Wait()
	if podListErr != nil {
		RespondAPIError500(c, "列出 Pod 失败（节点 Pod 计数）: " + podListErr.Error())
		return
	}
	podCountByNode := make(map[string]int, len(list.Items))
	if allPods != nil {
		for i := range allPods.Items {
			nn := strings.TrimSpace(allPods.Items[i].Spec.NodeName)
			if nn != "" {
				podCountByNode[nn]++
			}
		}
	}

	out := make([]map[string]interface{}, 0, len(list.Items))
	for _, n := range list.Items {
		ready := "Unknown"
		for _, cnd := range n.Status.Conditions {
			if cnd.Type == corev1.NodeReady {
				ready = string(cnd.Status)
				break
			}
		}
		roles := make([]string, 0)
		if _, ok := n.Labels["node-role.kubernetes.io/control-plane"]; ok {
			roles = append(roles, "control-plane")
		}
		if _, ok := n.Labels["node-role.kubernetes.io/master"]; ok {
			roles = append(roles, "master")
		}
		if len(roles) == 0 {
			roles = append(roles, "worker")
		}
		internalIP := ""
		for _, a := range n.Status.Addresses {
			if a.Type == corev1.NodeInternalIP {
				internalIP = a.Address
				break
			}
		}
		kubelet := n.Status.NodeInfo.KubeletVersion
		allocCPU := nodeAllocatableCPUCores(&n)
		allocMem := nodeAllocatableMemBytes(&n)

		row := map[string]interface{}{
			"name":          n.Name,
			"ready":         ready,
			"roles":         roles,
			"internalIP":    internalIP,
			"kubelet":       kubelet,
			"age":           n.CreationTimestamp.Time.Format(time.RFC3339),
			"cpuAllocCores": allocCPU,
			"memAllocBytes": allocMem,
			"podCount":      podCountByNode[n.Name],
		}

		if prometheusConfigured {
			res := resolveNodePrometheus(n.Name, internalIP, cpuH, memH, cpuN, memN, cpuI, memI)
			if res.CPUOk {
				row["cpuUsedCores"] = res.CPUUsed
				if allocCPU > 0 {
					row["cpuUsagePercent"] = math.Min(999, (res.CPUUsed/allocCPU)*100)
				}
			}
			if res.MemOk {
				row["memUsedBytes"] = res.MemUsed
				if allocMem > 0 {
					row["memUsagePercent"] = math.Min(999, (res.MemUsed/allocMem)*100)
				}
			}
			sk, sv := res.SparkKind, res.SparkKey
			if sk == "" {
				if inst, ok := findCommonInstanceForIP(internalIP, cpuI, memI); ok {
					sk, sv = "instance", inst
				} else {
					sk, sv = "kubernetes_io_hostname", n.Name
				}
			}
			if cq, mq := buildNodeSparkPromQL(sk, sv); cq != "" && mq != "" {
				row["cpuSparkQuery"] = cq
				row["memSparkQuery"] = mq
			}
		}
		out = append(out, row)
	}

	c.JSON(http.StatusOK, gin.H{
		"nodes":                out,
		"prometheusConfigured": prometheusConfigured,
		"metricsHint":          metricsHint,
	})
}
