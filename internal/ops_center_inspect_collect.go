package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/find"
	"github.com/vmware/govmomi/performance"
	"github.com/vmware/govmomi/vim25/mo"
	"github.com/vmware/govmomi/vim25/types"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func int64PtrInspect(v int64) *int64 { return &v }

func inspectMdEscape(s string) string {
	s = strings.ReplaceAll(s, "|", "\\|")
	s = strings.ReplaceAll(s, "\n", " ")
	if len(s) > 200 {
		return s[:200] + "…"
	}
	return s
}

// inspectPodVmLogSampleBlock 拉取 VictoriaLogs 中与 Pod 匹配的近窗样本，供巡检与 kubectl 日志对照（未配置 VL 时返回空串）。
func inspectPodVmLogSampleBlock(ctx context.Context, app *ServerApp, cfg Config, ns, podName string) string {
	base := normalizeVictoriaLogsBase(effectiveVictoriaLogsURL(app.Runtime(), cfg))
	if base == "" {
		return ""
	}
	q := buildVmLogQuery("kubernetes", ns, "", "any", podName)
	end := time.Now().UTC()
	start := end.Add(-6 * time.Hour)
	rows, truncated, scanWarn, _, err := fetchVictoriaLogsNDJSON(ctx, cfg, base, q, 80, start.Format(time.RFC3339Nano), end.Format(time.RFC3339Nano))
	if err != nil {
		return "**VictoriaLogs（VMLog，约 6 小时窗）**\n\n_查询失败：" + inspectMdEscape(err.Error()) + "_\n\n"
	}
	if len(rows) == 0 {
		return "**VictoriaLogs（VMLog，约 6 小时窗）**\n\n_无命中（可能未采集或未入库）。_\n\n"
	}
	s := buildVmLogSampleForAI(rows, 24)
	rs := []rune(s)
	if len(rs) > 10000 {
		s = string(rs[:10000]) + "…"
	}
	tail := ""
	if truncated || scanWarn != "" {
		tail = fmt.Sprintf("\n\n_（VL truncated=%v scan=%s）_", truncated, inspectMdEscape(scanWarn))
	}
	return "**VictoriaLogs（VMLog，约 6 小时窗）**\n\n```text\n" + s + "\n```" + tail + "\n\n"
}

type inspectPodIssueInfo struct {
	Kind     string
	Severity string
	Cause    string
	Fix      string
}

func inspectPodIssueHint(p *corev1.Pod, logText string) inspectPodIssueInfo {
	logLower := strings.ToLower(strings.TrimSpace(logText))
	waitReasons := make([]string, 0, 4)
	termReasons := make([]string, 0, 4)
	addReason := func(dst *[]string, s string) {
		s = strings.TrimSpace(s)
		if s == "" {
			return
		}
		for _, it := range *dst {
			if it == s {
				return
			}
		}
		*dst = append(*dst, s)
	}
	for _, cs := range p.Status.ContainerStatuses {
		if cs.State.Waiting != nil {
			addReason(&waitReasons, cs.State.Waiting.Reason)
			addReason(&waitReasons, cs.State.Waiting.Message)
		}
		if cs.LastTerminationState.Terminated != nil {
			addReason(&termReasons, cs.LastTerminationState.Terminated.Reason)
			addReason(&termReasons, cs.LastTerminationState.Terminated.Message)
		}
		if cs.State.Terminated != nil {
			addReason(&termReasons, cs.State.Terminated.Reason)
			addReason(&termReasons, cs.State.Terminated.Message)
		}
	}
	reasonText := strings.ToLower(strings.Join(append(waitReasons, termReasons...), " | "))
	switch {
	case strings.Contains(reasonText, "oomkilled") || strings.Contains(logLower, "out of memory"):
		return inspectPodIssueInfo{
			Kind:     "内存不足 / OOM",
			Severity: "high",
			Cause:    "容器因内存不足被 OOMKilled，或进程在启动时触发了内存峰值。",
			Fix:      "检查该 Pod 的 memory request/limit 与应用堆内存配置；适当提高内存限制，或降低 JVM/Node/Go 进程的启动占用。",
		}
	case strings.Contains(reasonText, "imagepullbackoff") || strings.Contains(reasonText, "errimagepull") || strings.Contains(logLower, "pull access denied") || strings.Contains(logLower, "not found"):
		return inspectPodIssueInfo{
			Kind:     "镜像拉取失败",
			Severity: "high",
			Cause:    "镜像拉取失败，常见为镜像名/标签错误、仓库鉴权缺失，或节点无法访问镜像仓库。",
			Fix:      "确认 image 名称与 tag 存在；检查 imagePullSecrets、私有仓库账号和节点到镜像仓库的网络连通性。",
		}
	case strings.Contains(reasonText, "createcontainerconfigerror") || strings.Contains(logLower, "configmap") || strings.Contains(logLower, "secret") || strings.Contains(logLower, "not found"):
		return inspectPodIssueInfo{
			Kind:     "配置缺失 / 引用错误",
			Severity: "high",
			Cause:    "容器启动依赖的 ConfigMap / Secret / 环境变量配置不完整，导致容器创建失败。",
			Fix:      "检查 Deployment/StatefulSet 引用的 ConfigMap、Secret、envFrom、volumeMount 是否存在且键名正确，再重新滚动发布。",
		}
	case strings.Contains(reasonText, "crashloopbackoff") || strings.Contains(logLower, "panic") || strings.Contains(logLower, "fatal") || strings.Contains(logLower, "exception"):
		return inspectPodIssueInfo{
			Kind:     "CrashLoop / 启动崩溃",
			Severity: "high",
			Cause:    "容器启动后很快崩溃并进入 CrashLoopBackOff，通常是启动参数、依赖连接、配置解析或代码异常。",
			Fix:      "先看容器启动日志和上一轮退出日志；确认配置、数据库/Redis/外部 API 连接是否可用，必要时降低探针强度避免启动期被反复拉起。",
		}
	case strings.Contains(reasonText, "failedmount") || strings.Contains(logLower, "mountvolume") || strings.Contains(logLower, "unable to attach or mount volumes"):
		return inspectPodIssueInfo{
			Kind:     "存储挂载失败",
			Severity: "high",
			Cause:    "Pod 依赖的 PVC / 卷挂载失败，导致容器无法正常启动。",
			Fix:      "检查 PVC 绑定状态、StorageClass、节点挂载权限与 CSI 驱动日志，确认卷已创建且目标节点可挂载。",
		}
	case strings.Contains(logLower, "connection refused") || strings.Contains(logLower, "i/o timeout") || strings.Contains(logLower, "no route to host") || strings.Contains(logLower, "dial tcp"):
		return inspectPodIssueInfo{
			Kind:     "依赖服务不可达",
			Severity: "medium",
			Cause:    "应用启动时访问依赖服务失败，表现为连接拒绝、超时或网络不可达。",
			Fix:      "检查目标服务 DNS、Service/Endpoint、端口、NetworkPolicy 与防火墙；确认依赖服务本身已经就绪。",
		}
	case strings.Contains(logLower, "liveness probe failed") || strings.Contains(logLower, "readiness probe failed") || strings.Contains(logLower, "startup probe failed"):
		return inspectPodIssueInfo{
			Kind:     "探针失败",
			Severity: "medium",
			Cause:    "健康检查探针失败，Kubelet 认为应用未就绪或不断重启。",
			Fix:      "核对探针路径、端口、scheme、超时时间和 initialDelaySeconds；对启动慢的服务优先增加 startupProbe 或延长初始等待。",
		}
	case p.Status.Phase == corev1.PodPending:
		return inspectPodIssueInfo{
			Kind:     "调度 / 启动等待",
			Severity: "medium",
			Cause:    "Pod 长时间 Pending，通常是调度、镜像拉取、卷挂载或资源不足导致。",
			Fix:      "先看 Pod events 与 describe 输出，重点排查节点资源、污点容忍、PVC 绑定、镜像仓库与 CNI。",
		}
	case p.Status.Phase == corev1.PodFailed:
		return inspectPodIssueInfo{
			Kind:     "Pod 失败退出",
			Severity: "high",
			Cause:    "Pod 已进入 Failed，说明容器最终退出且未能恢复。",
			Fix:      "检查最后一次终止原因、退出码和上一轮日志；若由 Job 触发，还需核对重试策略和业务参数。",
		}
	default:
		return inspectPodIssueInfo{
			Kind:     "待人工判断",
			Severity: "medium",
			Cause:    "该 Pod 处于异常状态，但日志中暂无明确特征；通常与配置、依赖、资源或探针有关。",
			Fix:      "结合 `kubectl describe pod` 里的 Events、容器退出原因和日志首个报错继续排查；优先确认镜像、配置、卷和依赖连通性。",
		}
	}
}

func inspectCollectK8sSection(ctx context.Context, app *ServerApp, cfg Config, ai OpsAIInspectConfig) InspectionSection {
	sec := InspectionSection{ID: "k8s", Title: "Kubernetes 集群与负载"}
	if !ai.InspectK8s {
		sec.Status = "skip"
		sec.Markdown = "未在「巡检范围」中勾选 Kubernetes。"
		return sec
	}
	k8s := app.K8s()
	if k8s == nil {
		sec.Status = "fail"
		sec.Markdown = "**集群未连接**，无法采集 API、事件与日志。"
		return sec
	}
	var b strings.Builder
	b.WriteString("### 控制面与资源概览\n\n")

	ver, err := k8s.Discovery().ServerVersion()
	if err != nil {
		b.WriteString(fmt.Sprintf("- 版本信息：读取失败 `%s`\n", err.Error()))
		sec.Status = "warn"
	} else {
		b.WriteString(fmt.Sprintf("- **Server 版本**：`%s`（platform: %s）\n", ver.GitVersion, ver.Platform))
	}

	nsList, err := k8s.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		b.WriteString(fmt.Sprintf("- Namespace 列表失败：%s\n", err.Error()))
		sec.Status = "fail"
	} else {
		b.WriteString(fmt.Sprintf("- **Namespace 数量**：%d\n", len(nsList.Items)))
	}

	podList, err := k8s.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		b.WriteString(fmt.Sprintf("- Pod 列表失败：%s\n", err.Error()))
		if sec.Status != "fail" {
			sec.Status = "warn"
		}
	} else {
		run, pend, fail, ccb := 0, 0, 0, 0
		for _, p := range podList.Items {
			switch p.Status.Phase {
			case corev1.PodRunning:
				run++
			case corev1.PodPending:
				pend++
			case corev1.PodFailed:
				fail++
			}
			if podHasCrashLoopBackOff(&p) {
				ccb++
			}
		}
		b.WriteString(fmt.Sprintf("- **Pod**：共 %d（Running %d · Pending %d · Failed %d · CrashLoop %d）\n",
			len(podList.Items), run, pend, fail, ccb))
	}

	nodeList, err := k8s.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		b.WriteString(fmt.Sprintf("- Node 列表失败：%s\n", err.Error()))
	} else {
		notReady := 0
		for _, n := range nodeList.Items {
			ok := false
			for _, c := range n.Status.Conditions {
				if c.Type == corev1.NodeReady && c.Status == corev1.ConditionTrue {
					ok = true
					break
				}
			}
			if !ok {
				notReady++
			}
		}
		b.WriteString(fmt.Sprintf("- **Node**：%d 台（NotReady %d）\n", len(nodeList.Items), notReady))
		if notReady > 0 && sec.Status != "fail" {
			sec.Status = "warn"
		}
	}

	countOrWarn := func(label string, n int, err error) {
		if err != nil {
			b.WriteString(fmt.Sprintf("- %s：统计失败 `%s`\n", label, err.Error()))
			if sec.Status != "fail" {
				sec.Status = "warn"
			}
			return
		}
		b.WriteString(fmt.Sprintf("- **%s**：%d\n", label, n))
	}

	if dep, err := k8s.AppsV1().Deployments("").List(ctx, metav1.ListOptions{}); err == nil {
		countOrWarn("Deployments", len(dep.Items), nil)
	} else {
		countOrWarn("Deployments", 0, err)
	}
	if sts, err := k8s.AppsV1().StatefulSets("").List(ctx, metav1.ListOptions{}); err == nil {
		countOrWarn("StatefulSets", len(sts.Items), nil)
	} else {
		countOrWarn("StatefulSets", 0, err)
	}
	if ds, err := k8s.AppsV1().DaemonSets("").List(ctx, metav1.ListOptions{}); err == nil {
		countOrWarn("DaemonSets", len(ds.Items), nil)
	} else {
		countOrWarn("DaemonSets", 0, err)
	}
	if jobs, err := k8s.BatchV1().Jobs("").List(ctx, metav1.ListOptions{}); err == nil {
		countOrWarn("Jobs", len(jobs.Items), nil)
	} else {
		countOrWarn("Jobs", 0, err)
	}
	if cj, err := k8s.BatchV1().CronJobs("").List(ctx, metav1.ListOptions{}); err == nil {
		countOrWarn("CronJobs", len(cj.Items), nil)
	} else {
		countOrWarn("CronJobs", 0, err)
	}
	if pvc, err := k8s.CoreV1().PersistentVolumeClaims("").List(ctx, metav1.ListOptions{}); err == nil {
		countOrWarn("PVC", len(pvc.Items), nil)
	} else {
		countOrWarn("PVC", 0, err)
	}
	if ing, err := k8s.NetworkingV1().Ingresses("").List(ctx, metav1.ListOptions{}); err == nil {
		countOrWarn("Ingresses", len(ing.Items), nil)
	} else {
		countOrWarn("Ingresses", 0, err)
	}
	if svc, err := k8s.CoreV1().Services("").List(ctx, metav1.ListOptions{}); err == nil {
		countOrWarn("Services", len(svc.Items), nil)
	} else {
		countOrWarn("Services", 0, err)
	}
	if cm, err := k8s.CoreV1().ConfigMaps("").List(ctx, metav1.ListOptions{Limit: 5000}); err == nil {
		b.WriteString(fmt.Sprintf("- **ConfigMaps**（至多统计前 5000 条）**：%d\n", len(cm.Items)))
	}
	if secList, err := k8s.CoreV1().Secrets("").List(ctx, metav1.ListOptions{Limit: 5000}); err == nil {
		b.WriteString(fmt.Sprintf("- **Secrets**（至多统计前 5000 条）**：%d\n", len(secList.Items)))
	}

	b.WriteString("\n### 近期事件（kube-system 等）\n\n")
	eventNS := []string{"kube-system", "default"}
	seen := map[string]bool{}
	var evLines []string
	for _, ns := range eventNS {
		if seen[ns] {
			continue
		}
		seen[ns] = true
		evs, err := k8s.CoreV1().Events(ns).List(ctx, metav1.ListOptions{Limit: 25})
		if err != nil {
			evLines = append(evLines, fmt.Sprintf("- `%s` 列出失败: %s", ns, err.Error()))
			continue
		}
		for _, e := range evs.Items {
			reason := strings.TrimSpace(e.Reason)
			msg := inspectMdEscape(e.Message)
			evLines = append(evLines, fmt.Sprintf("| %s | %s | %s | %s |",
				ns, e.InvolvedObject.Kind+"/"+e.InvolvedObject.Name, reason, msg))
		}
	}
	if len(evLines) == 0 {
		b.WriteString("_无事件或列表为空_\n")
	} else {
		b.WriteString("| 命名空间 | 对象 | Reason | 消息 |\n| --- | --- | --- | --- |\n")
		for _, line := range evLines {
			b.WriteString(line + "\n")
		}
	}

	b.WriteString("\n### 异常 / 高重启 Pod 日志摘录（kubectl 当前/上轮日志 + VictoriaLogs 入库对照）\n\n")
	if podList != nil {
		type cand struct {
			ns, name, phase string
			restarts        int32
		}
		var cands []cand
		for _, p := range podList.Items {
			rst := int32(0)
			for _, cs := range p.Status.ContainerStatuses {
				rst += cs.RestartCount
			}
			ph := string(p.Status.Phase)
			if ph == string(corev1.PodFailed) || ph == string(corev1.PodPending) || podHasCrashLoopBackOff(&p) || rst >= 3 {
				cands = append(cands, cand{p.Namespace, p.Name, ph, rst})
			}
		}
		sort.Slice(cands, func(i, j int) bool {
			if cands[i].restarts != cands[j].restarts {
				return cands[i].restarts > cands[j].restarts
			}
			if cands[i].phase != cands[j].phase {
				return cands[i].phase < cands[j].phase
			}
			return cands[i].ns+"/"+cands[i].name < cands[j].ns+"/"+cands[j].name
		})
		if len(cands) > 32 {
			cands = cands[:32]
		}
		nLog := 0
		typeCount := map[string]int{}
		for _, c := range cands {
			if nLog >= 8 {
				break
			}
			pod, err := k8s.CoreV1().Pods(c.ns).Get(ctx, c.name, metav1.GetOptions{})
			if err != nil {
				continue
			}
			cn := ""
			if len(pod.Spec.Containers) > 0 {
				cn = pod.Spec.Containers[0].Name
			}
			if cn == "" {
				continue
			}
			req := k8s.CoreV1().Pods(c.ns).GetLogs(c.name, &corev1.PodLogOptions{Container: cn, TailLines: int64PtrInspect(80)})
			stream, err := req.Stream(ctx)
			if err != nil {
				b.WriteString(fmt.Sprintf("#### `%s/%s`（%s）\n\n_拉取当前实例日志失败：%s_\n\n", c.ns, c.name, c.phase, err.Error()))
				nLog++
				continue
			}
			buf := new(strings.Builder)
			_, _ = io.Copy(buf, io.LimitReader(stream, 12000))
			_ = stream.Close()
			logText := strings.TrimSpace(buf.String())

			prevText := ""
			if c.restarts > 0 {
				reqPrev := k8s.CoreV1().Pods(c.ns).GetLogs(c.name, &corev1.PodLogOptions{
					Container: cn, TailLines: int64PtrInspect(120), Previous: true,
				})
				if ps, err2 := reqPrev.Stream(ctx); err2 == nil {
					pb := new(strings.Builder)
					_, _ = io.Copy(pb, io.LimitReader(ps, 16000))
					_ = ps.Close()
					prevText = strings.TrimSpace(pb.String())
				} else {
					prevText = fmt.Sprintf("_拉取上轮实例日志失败：%s_", err2.Error())
				}
			} else {
				prevText = "_无重启记录，无 previous 日志。_"
			}

			info := inspectPodIssueHint(pod, logText)
			typeCount[info.Kind]++
			vmBlock := inspectPodVmLogSampleBlock(ctx, app, cfg, c.ns, c.name)
			b.WriteString(fmt.Sprintf("#### `%s/%s`（%s · restarts≈%d）\n\n- **问题类型**：%s\n- **严重级别**：%s\n- **可能原因**：%s\n- **建议处理**：%s\n\n**当前实例日志（尾部）**\n\n```text\n%s\n```\n\n**上轮容器实例日志（--previous）**\n\n```text\n%s\n```\n\n%s",
				c.ns, c.name, c.phase, c.restarts, inspectMdEscape(info.Kind), inspectMdEscape(info.Severity), inspectMdEscape(info.Cause), inspectMdEscape(info.Fix), logText, prevText, vmBlock))
			nLog++
		}
		if len(typeCount) > 0 {
			keys := make([]string, 0, len(typeCount))
			for k := range typeCount {
				keys = append(keys, k)
			}
			sort.Slice(keys, func(i, j int) bool {
				if typeCount[keys[i]] != typeCount[keys[j]] {
					return typeCount[keys[i]] > typeCount[keys[j]]
				}
				return keys[i] < keys[j]
			})
			var summary []string
			for _, k := range keys {
				summary = append(summary, fmt.Sprintf("`%s` × %d", k, typeCount[k]))
			}
			b.WriteString("**异常类型汇总**：" + strings.Join(summary, "，") + "\n\n")
		}
		if nLog == 0 {
			b.WriteString("_未发现 Failed/Pending/CrashLoop 或高重启 Pod，或未成功拉取日志。_\n")
		}
	}

	if ai.InspectPrometheus {
		b.WriteString("\n### 资源使用率（Prometheus）\n\n")
		for _, sc := range []string{"k8s", "vcenter"} {
			u := GetPrometheusURLForScope(cfg, sc)
			if u == "" {
				b.WriteString(fmt.Sprintf("- **%s**：未配置数据源\n", sc))
				continue
			}
			if v := PrometheusPromQLInstantScalar(cfg, sc, "1"); v == nil {
				b.WriteString(fmt.Sprintf("- **%s**：探活查询失败\n", sc))
				if sec.Status != "fail" {
					sec.Status = "warn"
				}
			} else {
				b.WriteString(fmt.Sprintf("- **%s**：即时查询可用（示例 `up` 标量已返回）\n", sc))
			}
		}
		qCluster := `sum(rate(container_cpu_usage_seconds_total{container!=""}[5m]))`
		if v := PrometheusPromQLInstantScalar(cfg, "k8s", qCluster); v != nil {
			b.WriteString(fmt.Sprintf("- 集群容器 CPU 使用（核，近似）: **%.3f**\n", *v))
		}
	}

	if sec.Status == "" {
		sec.Status = "ok"
	}
	sec.Markdown = b.String()
	return sec
}

// perfSampleToMbps 将 vSphere 性能采样值换算为 **兆比特/秒（Mb/s，小写 b）**。
// 常见：net.received/transmitted 为 kiloBytesPerSecond（KB/s）→ Mbps = val×8/1024。
func perfSampleToMbps(val float64, unitKey string) float64 {
	if val <= 0 || math.IsNaN(val) || math.IsInf(val, 0) {
		return 0
	}
	u := strings.ToLower(strings.TrimSpace(unitKey))
	if strings.Contains(u, "megabytespersecond") || (strings.Contains(u, "megabyte") && strings.Contains(u, "second")) {
		return val * 8
	}
	if strings.Contains(u, "kilobytespersecond") || (strings.Contains(u, "kilobyte") && strings.Contains(u, "second")) {
		return val * 8 / 1024
	}
	return val * 8 / 1024
}

func ginHFloat64(h gin.H, key string) (float64, bool) {
	v, ok := h[key]
	if !ok || v == nil {
		return 0, false
	}
	switch x := v.(type) {
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	default:
		return 0, false
	}
}

func ginHNetThroughputMbps(row gin.H) (dlMbps, ulMbps float64) {
	rx, _ := ginHFloat64(row, "netRx")
	tx, _ := ginHFloat64(row, "netTx")
	uRx, _ := row["netRxUnit"].(string)
	uTx, _ := row["netTxUnit"].(string)
	return perfSampleToMbps(rx, uRx), perfSampleToMbps(tx, uTx)
}

type vcInspectVMRow struct {
	name   string
	power  string
	cpu    int32
	mem    int64
	cpuPct float64
	memPct float64
	ref    types.ManagedObjectReference
}

func inspectCollectVCenterSection(ctx context.Context, app *ServerApp, ai OpsAIInspectConfig) InspectionSection {
	sec := InspectionSection{ID: "vcenter", Title: "vCenter 虚拟机"}
	if !ai.InspectVCenter {
		sec.Status = "skip"
		sec.Markdown = "未勾选 vCenter 巡检。"
		return sec
	}
	vc := app.VCenter()
	if vc == nil || !vc.cfg.vCenterConfigured() {
		sec.Status = "warn"
		sec.Markdown = "**vCenter 未配置或未连接**。"
		return sec
	}
	var b strings.Builder
	var rows []vcInspectVMRow
	listed, on, warnCPU := 0, 0, 0
	err := vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
		f := find.NewFinder(client.Client, true)
		dcs, err := f.DatacenterList(ctx, "*")
		if err != nil {
			return err
		}
		rows = rows[:0]
		listed, on, warnCPU = 0, 0, 0
	outerVC:
		for _, dc := range dcs {
			f.SetDatacenter(dc)
			vms, err := f.VirtualMachineList(ctx, "*")
			if err != nil {
				continue
			}
			for _, vm := range vms {
				if listed >= 400 {
					break outerVC
				}
				var m mo.VirtualMachine
				if err := vm.Properties(ctx, vm.Reference(), []string{"summary"}, &m); err != nil {
					continue
				}
				if m.Summary.Config.Name == "" {
					continue
				}
				listed++
				ps := string(m.Summary.Runtime.PowerState)
				if ps == "poweredOn" {
					on++
				}
				cpu := m.Summary.Config.NumCpu
				memMB := int64(m.Summary.Config.MemorySizeMB)
				qs := m.Summary.QuickStats
				rt := m.Summary.Runtime
				cpuPct := 0.0
				if rt.MaxCpuUsage > 0 && qs.OverallCpuUsage > 0 {
					cpuPct = float64(qs.OverallCpuUsage) / float64(rt.MaxCpuUsage) * 100
				}
				memPct := 0.0
				if memMB > 0 && qs.GuestMemoryUsage > 0 {
					memPct = float64(qs.GuestMemoryUsage) / float64(memMB) * 100
				}
				if cpuPct >= 90 {
					warnCPU++
				}
				rows = append(rows, vcInspectVMRow{
					name:   m.Summary.Config.Name,
					power:  ps,
					cpu:    cpu,
					mem:    memMB,
					cpuPct: cpuPct,
					memPct: memPct,
					ref:    vm.Reference(),
				})
			}
		}

		dlMbps := make([]float64, len(rows))
		ulMbps := make([]float64, len(rows))
		pm := performance.NewManager(client.Client)
		infoByName, errPm := pm.CounterInfoByName(ctx)
		if errPm != nil {
			return fmt.Errorf("vCenter 性能计数器: %w", errPm)
		}
		var wg sync.WaitGroup
		sem := make(chan struct{}, 12)
		for i := range rows {
			if strings.EqualFold(rows[i].power, "poweredOn") {
				wg.Add(1)
				go func(i int) {
					defer wg.Done()
					sem <- struct{}{}
					defer func() { <-sem }()
					h := queryVMDiskNetLatestPoint(ctx, pm, infoByName, rows[i].ref)
					dl, ul := ginHNetThroughputMbps(h)
					dlMbps[i], ulMbps[i] = dl, ul
				}(i)
			}
		}
		wg.Wait()

		b.Reset()
		b.WriteString("### 虚拟机清单与使用率摘要\n\n")
		b.WriteString("| 虚拟机 | 电源 | CPU | 内存(MB) | CPU使用% | 内存使用% | 下载(Mb/s) | 上传(Mb/s) |\n")
		b.WriteString("| --- | --- | --- | --- | --- | --- | --- | --- |\n")
		for i, r := range rows {
			dlStr, ulStr := "—", "—"
			if strings.EqualFold(r.power, "poweredOn") {
				dlStr = fmt.Sprintf("%.2f", dlMbps[i])
				ulStr = fmt.Sprintf("%.2f", ulMbps[i])
			}
			b.WriteString(fmt.Sprintf("| %s | %s | %d | %d | %.1f | %.1f | %s | %s |\n",
				inspectMdEscape(r.name), r.power, r.cpu, r.mem, r.cpuPct, r.memPct, dlStr, ulStr))
		}
		return nil
	})
	if err != nil {
		sec.Status = "fail"
		sec.Markdown = fmt.Sprintf("vCenter 巡检失败：%s", err.Error())
		return sec
	}
	b.WriteString(fmt.Sprintf("\n**统计**：已列出至多 400 台；采样范围内合计 **%d** 台，其中开机 **%d** 台。", listed, on))
	b.WriteString("\n\n_**网络列说明**：**下载**≈来宾入站（`net.received` / `net.bytesRx`），**上传**≈来宾出站（`net.transmitted` / `net.bytesTx`）；取与虚拟机详情「资源监控」相同的历史 rollup **最新点**，无历史时再试实时；单位为 **Mb/s（兆比特/秒）**。关机或未启用统计时为「—」。_\n")
	if warnCPU > 0 {
		b.WriteString(fmt.Sprintf(" 有 **%d** 台 CPU 使用率估算 ≥90%%（请结合真实容量评估）。", warnCPU))
		sec.Status = "warn"
	}
	if sec.Status == "" {
		sec.Status = "ok"
	}
	sec.Markdown = b.String()
	return sec
}

func inspectCollectPrometheusSection(ctx context.Context, app *ServerApp, cfg Config, ai OpsAIInspectConfig) InspectionSection {
	sec := InspectionSection{ID: "prometheus", Title: "Prometheus 数据源"}
	if !ai.InspectPrometheusK8s && !ai.InspectPrometheusVCenter {
		sec.Status = "skip"
		sec.Markdown = "未勾选 Prometheus 巡检。"
		return sec
	}
	var b strings.Builder
	b.WriteString("### 数据源可达性与基础探测\n\n")
	type row struct {
		scope string
		ok    bool
		msg   string
	}
	rows := make([]row, 0, 2)
	if ai.InspectPrometheusK8s {
		if _, hint := PrometheusPromQLInstantProbe(cfg, "k8s", "1"); hint != "" {
			rows = append(rows, row{scope: "k8s", ok: false, msg: hint})
			sec.Status = "warn"
		} else {
			rows = append(rows, row{scope: "k8s", ok: true, msg: "即时查询可用"})
		}
	}
	if ai.InspectPrometheusVCenter {
		if _, hint := PrometheusPromQLInstantProbe(cfg, "vcenter", "1"); hint != "" {
			rows = append(rows, row{scope: "vcenter", ok: false, msg: hint})
			sec.Status = "warn"
		} else {
			rows = append(rows, row{scope: "vcenter", ok: true, msg: "即时查询可用"})
		}
	}
	b.WriteString("| 作用域 | 状态 | 说明 |\n| --- | --- | --- |\n")
	for _, r := range rows {
		st := "正常"
		if !r.ok {
			st = "警告"
		}
		b.WriteString(fmt.Sprintf("| %s | %s | %s |\n", r.scope, st, inspectMdEscape(r.msg)))
	}
	sec.Markdown = b.String()
	if sec.Status == "" {
		sec.Status = "ok"
	}
	return sec
}

func inspectCollectVMLogSection(ctx context.Context, app *ServerApp, cfg Config, ai OpsAIInspectConfig) InspectionSection {
	sec := InspectionSection{ID: "vmlog", Title: "VictoriaLogs / VM 日志"}
	if !ai.InspectVMLog {
		sec.Status = "skip"
		sec.Markdown = "未勾选 VictoriaLogs / VM 日志巡检。"
		return sec
	}
	var b strings.Builder
	base := normalizeVictoriaLogsBase(effectiveVictoriaLogsURL(app.Runtime(), cfg))
	if base == "" {
		sec.Status = "warn"
		sec.Markdown = "未配置 VictoriaLogs 根地址。请在运行时设置 `victoriaLogsUrl`。"
		return sec
	}
	b.WriteString("### VictoriaLogs 健康与最近日志\n\n")
	b.WriteString(fmt.Sprintf("- **VictoriaLogs 地址**：`%s`\n", inspectMdEscape(maskPrometheusURL(base))))
	start := time.Now().UTC().Add(-24 * time.Hour).Format(time.RFC3339Nano)
	end := time.Now().UTC().Format(time.RFC3339Nano)
	hits, err := fetchVictoriaLogsHits(ctx, cfg, base, "*", start, end, "1h")
	if err != nil {
		sec.Status = "warn"
		b.WriteString(fmt.Sprintf("- **趋势查询失败**：%s\n", inspectMdEscape(err.Error())))
		sec.Markdown = b.String()
		return sec
	}
	total := 0
	nonZero := 0
	if hits != nil {
		for _, s := range hits.Hits {
			total += int(math.Round(s.Total))
			for _, v := range s.Values {
				if v > 0 {
					nonZero++
				}
			}
		}
	}
	b.WriteString(fmt.Sprintf("- **近 24 小时日志量**：约 %d 条（非零时间桶 %d）\n", total, nonZero))
	rows, truncated, scanWarn, _, err := fetchVictoriaLogsNDJSON(ctx, cfg, base, "*", 5, start, end)
	rowsWide, _, _, _, errWide := fetchVictoriaLogsNDJSON(ctx, cfg, base, "*", 300, start, end)
	if err != nil {
		sec.Status = "warn"
		b.WriteString(fmt.Sprintf("- **最近日志读取失败**：%s\n", inspectMdEscape(err.Error())))
	} else if len(rows) == 0 {
		sec.Status = "warn"
		b.WriteString("- **最近 24 小时无日志样本**：可能采集端未上报、筛选为空，或 VL 当前无数据。\n")
	} else {
		b.WriteString("- **最近日志样本**：\n")
		for _, row := range rows {
			tm := ""
			if t, ok := parseRowTime(row); ok {
				tm = t.Format(time.RFC3339)
			}
			msg := vmlogRowMsg(row)
			if msg == "" {
				msg = inspectMdEscape(rowJSONLower(row))
			} else {
				msg = inspectMdEscape(msg)
			}
			b.WriteString(fmt.Sprintf("  - `%s` %s\n", tm, msg))
		}
	}
	if errWide == nil && len(rowsWide) > 0 {
		type srcStat struct {
			key   string
			count int
		}
		type targetRisk struct {
			score    int
			high     int
			medium   int
			patterns map[string]int
		}
		srcCount := map[string]int{}
		errCount := map[string]int{}
		riskCount := map[string]int{}
		targetRiskMap := map[string]*targetRisk{}
		for _, row := range rowsWide {
			vmHost := strings.TrimSpace(rowValueByPath(row, "vm_host"))
			logSrc := strings.TrimSpace(rowValueByPath(row, "log_source"))
			srcKey := strings.TrimSpace(vmHost + " / " + logSrc)
			if vmHost != "" || logSrc != "" {
				srcCount[srcKey]++
			}
			msgLower := strings.ToLower(vmlogRowMsg(row))
			pat := ""
			riskLevel := ""
			switch {
			case strings.Contains(msgLower, "oomkilled") || strings.Contains(msgLower, "out of memory"):
				pat = "OOM / 内存不足"
				riskCount["高风险"]++
				riskLevel = "high"
			case strings.Contains(msgLower, "crashloopbackoff") || strings.Contains(msgLower, "panic") || strings.Contains(msgLower, "fatal"):
				pat = "CrashLoop / 崩溃"
				riskCount["高风险"]++
				riskLevel = "high"
			case strings.Contains(msgLower, "connection refused") || strings.Contains(msgLower, "dial tcp") || strings.Contains(msgLower, "i/o timeout"):
				pat = "依赖连接失败"
				riskCount["中风险"]++
				riskLevel = "medium"
			case strings.Contains(msgLower, "probe failed"):
				pat = "探针失败"
				riskCount["中风险"]++
				riskLevel = "medium"
			case strings.Contains(msgLower, "imagepullbackoff") || strings.Contains(msgLower, "errimagepull"):
				pat = "镜像拉取失败"
				riskCount["高风险"]++
				riskLevel = "high"
			case strings.Contains(msgLower, " 500 ") || strings.Contains(msgLower, " 502 ") || strings.Contains(msgLower, " 503 ") || strings.Contains(msgLower, " 504 "):
				pat = "HTTP 5xx"
				riskCount["高风险"]++
				riskLevel = "high"
			}
			if pat != "" {
				errCount[pat]++
				if srcKey != "/" && strings.TrimSpace(srcKey) != "" {
					tr := targetRiskMap[srcKey]
					if tr == nil {
						tr = &targetRisk{patterns: map[string]int{}}
						targetRiskMap[srcKey] = tr
					}
					tr.patterns[pat]++
					switch riskLevel {
					case "high":
						tr.high++
						tr.score += 3
					case "medium":
						tr.medium++
						tr.score += 1
					}
				}
			}
		}
		if len(srcCount) > 0 {
			var stats []srcStat
			for k, n := range srcCount {
				if strings.TrimSpace(k) == "/" {
					continue
				}
				stats = append(stats, srcStat{key: k, count: n})
			}
			sort.Slice(stats, func(i, j int) bool {
				if stats[i].count != stats[j].count {
					return stats[i].count > stats[j].count
				}
				return stats[i].key < stats[j].key
			})
			b.WriteString("\n### 活跃采集源（近 24 小时样本）\n\n")
			for i, st := range stats {
				if i >= 5 {
					break
				}
				b.WriteString(fmt.Sprintf("- `%s`：约 %d 条样本\n", inspectMdEscape(st.key), st.count))
			}
		}
		if len(errCount) > 0 {
			var errs []srcStat
			for k, n := range errCount {
				errs = append(errs, srcStat{key: k, count: n})
			}
			sort.Slice(errs, func(i, j int) bool {
				if errs[i].count != errs[j].count {
					return errs[i].count > errs[j].count
				}
				return errs[i].key < errs[j].key
			})
			b.WriteString("\n### 异常模式 Top\n\n")
			for i, st := range errs {
				if i >= 5 {
					break
				}
				b.WriteString(fmt.Sprintf("- `%s`：命中约 %d 条\n", inspectMdEscape(st.key), st.count))
			}
		}
		if len(riskCount) > 0 {
			b.WriteString("\n### 风险等级汇总\n\n")
			for _, rk := range []string{"高风险", "中风险"} {
				if n := riskCount[rk]; n > 0 {
					b.WriteString(fmt.Sprintf("- **%s**：约 %d 条异常日志命中\n", rk, n))
				}
			}
		}
		if len(targetRiskMap) > 0 {
			type riskRow struct {
				key   string
				score int
				high  int
				med   int
				top   string
			}
			var rowsRisk []riskRow
			for k, v := range targetRiskMap {
				topPat := ""
				topCnt := 0
				for pk, pn := range v.patterns {
					if pn > topCnt || (pn == topCnt && pk < topPat) {
						topPat = pk
						topCnt = pn
					}
				}
				rowsRisk = append(rowsRisk, riskRow{
					key:   k,
					score: v.score,
					high:  v.high,
					med:   v.medium,
					top:   topPat,
				})
			}
			sort.Slice(rowsRisk, func(i, j int) bool {
				if rowsRisk[i].score != rowsRisk[j].score {
					return rowsRisk[i].score > rowsRisk[j].score
				}
				if rowsRisk[i].high != rowsRisk[j].high {
					return rowsRisk[i].high > rowsRisk[j].high
				}
				return rowsRisk[i].key < rowsRisk[j].key
			})
			b.WriteString("\n### 高风险目标 Top\n\n")
			for i, r := range rowsRisk {
				if i >= 8 {
					break
				}
				b.WriteString(fmt.Sprintf("- `%s`：风险分 %d（高风险 %d · 中风险 %d） · 主要模式 `%s`\n",
					inspectMdEscape(r.key), r.score, r.high, r.med, inspectMdEscape(r.top)))
			}
		}
	}
	if truncated || scanWarn != "" {
		b.WriteString(fmt.Sprintf("- **查询提示**：truncated=%v scanWarn=%s\n", truncated, inspectMdEscape(scanWarn)))
	}
	tasks := vmShipperTaskList(50)
	enabled := 0
	verifyOK := 0
	staleTargets := make([]string, 0, 8)
	activePairs := make([]struct{ vmHost, logSource string }, 0, 16)
	for _, t := range tasks {
		inspect, _ := t["inspect"].(gin.H)
		verify, _ := t["verify"].(gin.H)
		vmHost, _ := t["vmHost"].(string)
		logSource, _ := t["logSource"].(string)
		if inspect != nil {
			if v, ok := inspect["serviceActive"].(bool); ok && v {
				enabled++
				if strings.TrimSpace(vmHost) != "" || strings.TrimSpace(logSource) != "" {
					activePairs = append(activePairs, struct{ vmHost, logSource string }{vmHost: strings.TrimSpace(vmHost), logSource: strings.TrimSpace(logSource)})
				}
			}
		}
		if verify != nil {
			if v, ok := verify["ok"].(bool); ok && v {
				verifyOK++
			} else if attempted, ok := verify["attempted"].(bool); ok && attempted {
				staleTargets = append(staleTargets, strings.TrimSpace(vmHost+" / "+logSource))
			}
		}
	}
	b.WriteString(fmt.Sprintf("- **已开启采集目标（近 50 任务内）**：服务运行中 %d 个 · 已验证进库 %d 个\n", enabled, verifyOK))
	if len(staleTargets) > 0 {
		b.WriteString("- **疑似断流或暂未进库目标**：\n")
		for i, s := range staleTargets {
			if i >= 8 {
				break
			}
			b.WriteString(fmt.Sprintf("  - `%s`\n", inspectMdEscape(s)))
		}
		if sec.Status == "" {
			sec.Status = "warn"
		}
	}
	proactiveStale := make([]string, 0, 8)
	if len(activePairs) > 0 {
		st1h := time.Now().UTC().Add(-1 * time.Hour).Format(time.RFC3339Nano)
		ed1h := time.Now().UTC().Format(time.RFC3339Nano)
		for _, pair := range activePairs {
			if pair.vmHost == "" && pair.logSource == "" {
				continue
			}
			qparts := make([]string, 0, 2)
			if pair.vmHost != "" {
				qparts = append(qparts, "vm_host:"+logsQLQuoteValue(pair.vmHost))
			}
			if pair.logSource != "" {
				qparts = append(qparts, "log_source:"+logsQLQuoteValue(pair.logSource))
			}
			query := strings.Join(qparts, " AND ")
			h1, err := fetchVictoriaLogsHits(ctx, cfg, base, query, st1h, ed1h, "1h")
			if err != nil || h1 == nil || len(h1.Hits) == 0 {
				continue
			}
			total1h := 0
			for _, s := range h1.Hits {
				total1h += int(math.Round(s.Total))
			}
			if total1h == 0 {
				proactiveStale = append(proactiveStale, strings.TrimSpace(pair.vmHost+" / "+pair.logSource))
			}
		}
	}
	if len(proactiveStale) > 0 {
		b.WriteString("\n### 主动断流判定（近 1 小时）\n\n")
		for i, s := range proactiveStale {
			if i >= 8 {
				break
			}
			b.WriteString(fmt.Sprintf("- `%s`：服务运行中，但最近 1 小时未查到日志命中\n", inspectMdEscape(s)))
		}
		if sec.Status == "" {
			sec.Status = "warn"
		}
	}
	if len(activePairs) > 0 {
		type surgeRow struct {
			key     string
			now1h   int
			prev1h  int
			now24h  int
			prev24h int
			score   int
		}
		stNow1h := time.Now().UTC().Add(-1 * time.Hour).Format(time.RFC3339Nano)
		stPrev1h := time.Now().UTC().Add(-2 * time.Hour).Format(time.RFC3339Nano)
		edPrev1h := time.Now().UTC().Add(-1 * time.Hour).Format(time.RFC3339Nano)
		stNow24h := time.Now().UTC().Add(-24 * time.Hour).Format(time.RFC3339Nano)
		stPrev24h := time.Now().UTC().Add(-48 * time.Hour).Format(time.RFC3339Nano)
		edPrev24h := time.Now().UTC().Add(-24 * time.Hour).Format(time.RFC3339Nano)
		var surges []surgeRow
		seenPairs := map[string]bool{}
		for _, pair := range activePairs {
			key := strings.TrimSpace(pair.vmHost + " / " + pair.logSource)
			if key == "/" || key == "" || seenPairs[key] {
				continue
			}
			seenPairs[key] = true
			qparts := make([]string, 0, 2)
			if pair.vmHost != "" {
				qparts = append(qparts, "vm_host:"+logsQLQuoteValue(pair.vmHost))
			}
			if pair.logSource != "" {
				qparts = append(qparts, "log_source:"+logsQLQuoteValue(pair.logSource))
			}
			query := strings.Join(qparts, " AND ")
			sumHits := func(start, end string) int {
				h, err := fetchVictoriaLogsHits(ctx, cfg, base, query, start, end, "1h")
				if err != nil || h == nil {
					return 0
				}
				total := 0
				for _, s := range h.Hits {
					total += int(math.Round(s.Total))
				}
				return total
			}
			n1 := sumHits(stNow1h, end)
			p1 := sumHits(stPrev1h, edPrev1h)
			n24 := sumHits(stNow24h, end)
			p24 := sumHits(stPrev24h, edPrev24h)
			score := 0
			if n1 >= 20 && n1 >= p1*3 && n1-p1 >= 10 {
				score += 3
			}
			if n24 >= 100 && n24 >= p24*2 && n24-p24 >= 50 {
				score += 2
			}
			if score > 0 {
				surges = append(surges, surgeRow{key: key, now1h: n1, prev1h: p1, now24h: n24, prev24h: p24, score: score})
			}
		}
		if len(surges) > 0 {
			sort.Slice(surges, func(i, j int) bool {
				if surges[i].score != surges[j].score {
					return surges[i].score > surges[j].score
				}
				if surges[i].now1h != surges[j].now1h {
					return surges[i].now1h > surges[j].now1h
				}
				return surges[i].key < surges[j].key
			})
			b.WriteString("\n### 激增目标（时间对比）\n\n")
			for i, s := range surges {
				if i >= 8 {
					break
				}
				b.WriteString(fmt.Sprintf("- `%s`：近1h %d 条 vs 前1h %d 条；近24h %d 条 vs 前24h %d 条\n",
					inspectMdEscape(s.key), s.now1h, s.prev1h, s.now24h, s.prev24h))
			}
			if sec.Status == "" {
				sec.Status = "warn"
			}
		}
	}
	sec.Markdown = b.String()
	if sec.Status == "" {
		sec.Status = "ok"
	}
	return sec
}

func inspectCollectRedisSection(ctx context.Context, app *ServerApp, cfg Config, ai OpsAIInspectConfig) InspectionSection {
	sec := InspectionSection{ID: "redis", Title: "应用中心 Redis 纳管"}
	if !ai.InspectRedis {
		sec.Status = "skip"
		sec.Markdown = "未勾选 Redis 巡检。"
		return sec
	}
	db := app.MySQLDB()
	if db == nil {
		sec.Status = "skip"
		sec.Markdown = "无 MySQL，无法读取实例表。"
		return sec
	}
	rows, err := db.QueryContext(ctx, `SELECT id, name, mode, config_json FROM labplane_app_redis_instances ORDER BY id DESC LIMIT 25`)
	if err != nil {
		sec.Status = "warn"
		sec.Markdown = fmt.Sprintf("读取实例表失败：%s", err.Error())
		return sec
	}
	defer rows.Close()
	var b strings.Builder
	b.WriteString("### 已登记实例运行时\n\n")
	b.WriteString("| ID | 名称 | 模式 | Ping | 延迟ms | DB 键数 | connected_clients |\n| --- | --- | --- | --- | --- | --- | --- |\n")
	anyFail := false
	for rows.Next() {
		var id int64
		var name, mode, cfgJSON string
		if err := rows.Scan(&id, &name, &mode, &cfgJSON); err != nil {
			continue
		}
		var st appRedisStoredConfig
		if err := json.Unmarshal([]byte(cfgJSON), &st); err != nil {
			b.WriteString(fmt.Sprintf("| %d | %s | %s | 失败 | — | — | 配置 JSON 无效 |\n", id, name, mode))
			anyFail = true
			continue
		}
		rdb, closeFn, err := openAppRedisClient(ctx, cfg, &st)
		if err != nil {
			b.WriteString(fmt.Sprintf("| %d | %s | %s | 失败 | — | — | %s |\n", id, name, mode, inspectMdEscape(err.Error())))
			anyFail = true
			continue
		}
		snap, err := AppRedisRuntimeSnapshot(ctx, rdb)
		closeFn()
		if err != nil {
			b.WriteString(fmt.Sprintf("| %d | %s | %s | 失败 | — | — | %s |\n", id, name, mode, inspectMdEscape(err.Error())))
			anyFail = true
			continue
		}
		lat := fmt.Sprintf("%v", snap["latencyMs"])
		dbsize := fmt.Sprintf("%v", snap["dbsize"])
		clients := "—"
		if sects, ok := snap["sections"].(map[string]map[string]string); ok {
			if c, ok := sects["clients"]; ok {
				clients = c["connected_clients"]
			}
		}
		b.WriteString(fmt.Sprintf("| %d | %s | %s | ok | %s | %s | %s |\n", id, name, mode, lat, dbsize, clients))
	}
	if anyFail {
		sec.Status = "warn"
	} else {
		sec.Status = "ok"
	}
	sec.Markdown = b.String()
	return sec
}

func inspectCollectCloudVmSection(ctx context.Context, app *ServerApp, ai OpsAIInspectConfig) InspectionSection {
	sec := InspectionSection{ID: "cloudvm", Title: "应用中心云主机"}
	if !ai.InspectCloudVm {
		sec.Status = "skip"
		sec.Markdown = "未勾选云主机巡检。"
		return sec
	}
	db := app.MySQLDB()
	if db == nil {
		sec.Status = "skip"
		sec.Markdown = "无 MySQL。"
		return sec
	}
	rows, err := db.QueryContext(ctx, `SELECT id, name, namespace, config_json FROM labplane_app_cloud_vm_instances ORDER BY id DESC LIMIT 40`)
	if err != nil {
		sec.Status = "warn"
		sec.Markdown = err.Error()
		return sec
	}
	defer rows.Close()
	var b strings.Builder
	b.WriteString("### 云主机登记\n\n| ID | 名称 | 命名空间 | 阶段 | NodePort |\n| --- | --- | --- | --- | --- |\n")
	for rows.Next() {
		var id int64
		var name, ns, cfgJSON string
		if err := rows.Scan(&id, &name, &ns, &cfgJSON); err != nil {
			continue
		}
		var st struct {
			Phase    string `json:"phase"`
			NodePort int32  `json:"nodePort"`
		}
		_ = json.Unmarshal([]byte(cfgJSON), &st)
		b.WriteString(fmt.Sprintf("| %d | %s | %s | %s | %d |\n", id, name, ns, st.Phase, st.NodePort))
	}
	sec.Status = "ok"
	sec.Markdown = b.String()
	return sec
}

func inspectCollectSSHSection(app *ServerApp, ai OpsAIInspectConfig) InspectionSection {
	sec := InspectionSection{ID: "ssh", Title: "SSH 凭据存储"}
	if !ai.InspectSSH {
		sec.Status = "skip"
		sec.Markdown = "未勾选 SSH 巡检。"
		return sec
	}
	st := app.SSHStore()
	if st == nil {
		sec.Status = "warn"
		sec.Markdown = "存储未初始化。"
		return sec
	}
	// 仅状态；条数若 store 支持可扩展
	sec.Status = "ok"
	sec.Markdown = "### SSH\n\n后端 **已就绪**（具体条目数因存储实现未在此展开）。\n"
	return sec
}

// vcenterEventTypeLabel 将 govmomi 事件类型名转为中文可读标签。
func vcenterEventTypeLabel(t string) string {
	switch t {
	case "VmPoweredOnEvent":
		return "开机"
	case "VmPoweredOffEvent":
		return "关机"
	case "VmResetEvent":
		return "重启"
	case "VmReconfiguredEvent":
		return "配置变更"
	case "VmSuspendedEvent":
		return "挂起"
	case "VmMigratedEvent":
		return "迁移"
	default:
		return t
	}
}

// inspectCollectVCenterEventsSection 采集 VM 事件记录与宿主机 vCenter 原生告警。
func inspectCollectVCenterEventsSection(ctx context.Context, app *ServerApp, ai OpsAIInspectConfig) InspectionSection {
	sec := InspectionSection{ID: "vcenter_events", Title: "vCenter VM 事件与告警"}
	if !ai.InspectVCenterEvents {
		sec.Status = "skip"
		sec.Markdown = "未勾选 vCenter 事件与告警巡检。"
		return sec
	}
	kv := app.PlatformKV()
	vc := app.VCenter()
	var b strings.Builder

	// —— Part 1：VM 事件记录 ——
	b.WriteString("### VM 电源与配置变更事件（近 24 小时）\n\n")
	events, updatedAt := GetVCenterVMEvents(kv, 100, 24)
	if len(events) == 0 {
		if updatedAt == "" {
			b.WriteString("_事件采集尚未运行（后台 Worker 首次轮询可能稍有延迟，或 vCenter 未配置）。_\n")
			sec.Status = "warn"
		} else {
			b.WriteString(fmt.Sprintf("_近 24 小时无已记录的 VM 事件（最后采集：%s）。_\n", updatedAt))
		}
	} else {
		b.WriteString(fmt.Sprintf("_已记录 %d 条（最后采集：%s）_\n\n", len(events), updatedAt))
		b.WriteString("| 时间 | 虚拟机 | 事件类型 | 宿主机 | 操作用户 | 描述 |\n")
		b.WriteString("| --- | --- | --- | --- | --- | --- |\n")
		// 统计重置/配置变更事件，用于调整巡检状态
		resetCount, reconfigCount := 0, 0
		for _, ev := range events {
			label := vcenterEventTypeLabel(ev.EventType)
			vmName := inspectMdEscape(ev.VmName)
			if vmName == "" {
				vmName = ev.VmMoRef
			}
			b.WriteString(fmt.Sprintf("| %s | %s | %s | %s | %s | %s |\n",
				ev.CreatedAt, vmName, label,
				inspectMdEscape(ev.HostName),
				inspectMdEscape(ev.UserName),
				inspectMdEscape(ev.Message),
			))
			if ev.EventType == "VmResetEvent" {
				resetCount++
			}
			if ev.EventType == "VmReconfiguredEvent" {
				reconfigCount++
			}
		}
		if resetCount > 0 || reconfigCount > 0 {
			b.WriteString(fmt.Sprintf("\n> **摘要**：近 24 小时内 VM 重启 **%d** 次，配置变更 **%d** 次。\n", resetCount, reconfigCount))
			if sec.Status == "" {
				sec.Status = "warn"
			}
		}
	}

	// —— Part 2：vCenter 宿主机原生告警 ——
	b.WriteString("\n### vCenter 宿主机告警（当前状态）\n\n")
	if vc == nil || !vc.cfg.vCenterConfigured() {
		b.WriteString("_vCenter 未配置，跳过告警采集。_\n")
		if sec.Status == "" {
			sec.Status = "warn"
		}
	} else {
		type alarmRow struct {
			host   string
			name   string
			status string
			ts     string
			acked  bool
		}
		var alarmRows []alarmRow
		alarmErr := ""
		alarmErr2 := vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
			// 拉取所有宿主机，对每台宿主机拉取 AlarmState
			var hostSystems []struct {
				ref  types.ManagedObjectReference
				name string
			}
			f := find.NewFinder(client.Client, true)
			dcs, err := f.DatacenterList(ctx, "*")
			if err != nil {
				return err
			}
			for _, dc := range dcs {
				f.SetDatacenter(dc)
				hosts, err := f.HostSystemList(ctx, "*")
				if err != nil {
					continue
				}
				for _, h := range hosts {
					hostSystems = append(hostSystems, struct {
						ref  types.ManagedObjectReference
						name string
					}{ref: h.Reference(), name: h.InventoryPath})
				}
			}
			for _, hs := range hostSystems {
				alarms, warn := hostAlarmStates(ctx, client, hs.ref)
				if warn != "" {
					alarmErr = warn
					continue
				}
				hostLabel := hs.name
				if idx := strings.LastIndex(hostLabel, "/"); idx >= 0 {
					hostLabel = hostLabel[idx+1:]
				}
				for _, a := range alarms {
					status, _ := a["overallStatus"].(string)
					if status == "" || status == "green" {
						continue // 仅记录黄色/红色/灰色告警
					}
					name, _ := a["name"].(string)
					ts, _ := a["time"].(string)
					acked, _ := a["acknowledged"].(bool)
					alarmRows = append(alarmRows, alarmRow{
						host:   hostLabel,
						name:   name,
						status: status,
						ts:     ts,
						acked:  acked,
					})
				}
			}
			return nil
		})
		if alarmErr2 != nil {
			b.WriteString(fmt.Sprintf("_告警采集失败：%s_\n", inspectMdEscape(alarmErr2.Error())))
			if sec.Status == "" {
				sec.Status = "warn"
			}
		} else if len(alarmRows) == 0 {
			b.WriteString("_当前无非绿色宿主机告警。_\n")
		} else {
			redCount := 0
			for _, r := range alarmRows {
				if r.status == "red" {
					redCount++
				}
			}
			b.WriteString(fmt.Sprintf("_共 **%d** 条活跃告警（其中 **%d** 条红色）_\n\n", len(alarmRows), redCount))
			b.WriteString("| 宿主机 | 告警名称 | 状态 | 时间 | 已确认 |\n")
			b.WriteString("| --- | --- | --- | --- | --- |\n")
			for _, r := range alarmRows {
				ackedStr := "否"
				if r.acked {
					ackedStr = "是"
				}
				b.WriteString(fmt.Sprintf("| %s | %s | %s | %s | %s |\n",
					inspectMdEscape(r.host),
					inspectMdEscape(r.name),
					r.status,
					r.ts,
					ackedStr,
				))
			}
			if redCount > 0 {
				sec.Status = "fail"
			} else if sec.Status == "" {
				sec.Status = "warn"
			}
		}
		if alarmErr != "" {
			b.WriteString(fmt.Sprintf("\n> ⚠️ 部分宿主机告警获取遇到问题：%s\n", inspectMdEscape(alarmErr)))
		}
	}

	if sec.Status == "" {
		sec.Status = "ok"
	}
	sec.Markdown = b.String()
	return sec
}
