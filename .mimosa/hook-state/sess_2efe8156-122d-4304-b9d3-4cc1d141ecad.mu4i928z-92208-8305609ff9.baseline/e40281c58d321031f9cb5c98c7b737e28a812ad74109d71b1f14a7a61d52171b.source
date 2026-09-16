package internal

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// 固定 release/命名空间，避免与用户已有 monitoring 命名空间混用。
const (
	kubePromStackReleaseName = "kbt-prom"
	kubePromStackNamespace   = "kube-bt-sync-monitoring"
)

// 优先 56.21.0；失败时依次尝试备用版本（GitHub release 资源名均为 kube-prometheus-stack-X.Y.Z.tgz）。
var kubePrometheusStackChartURLs = []string{
	"https://github.com/prometheus-community/helm-charts/releases/download/kube-prometheus-stack-56.21.0/kube-prometheus-stack-56.21.0.tgz",
	"https://github.com/prometheus-community/helm-charts/releases/download/kube-prometheus-stack-55.11.0/kube-prometheus-stack-55.11.0.tgz",
}

// KubePromStackInstallOpts 一键安装参数。
type KubePromStackInstallOpts struct {
	GrafanaEnabled          bool
	AlertmanagerEnabled     bool
	AutoSwitchPrometheusURL bool
	ClearVMSelect           bool
	// kubeEtcd：与 kube-prometheus-stack chart 中 kubeEtcd 段一致；启用时需填写 control-plane IP（或可达主机名）。
	KubeEtcdEnabled        bool
	KubeEtcdEndpoints      []string
	KubeEtcdServiceEnabled bool
	KubeEtcdPort           int
	KubeEtcdTargetPort     int
}

// KubePromStackInstallResult 安装结果摘要。
type KubePromStackInstallResult struct {
	PrometheusBaseURL string
	ServiceName       string
	Namespace         string
}

// RewriteKubePrometheusRenderedImages 将 helm template 输出中的常见公网镜像前缀改写为 DaoCloud 加速（与 ingress 清单改写思路一致）。
func RewriteKubePrometheusRenderedImages(raw []byte) []byte {
	if len(raw) == 0 {
		return raw
	}
	s := string(raw)
	repl := []struct{ from, to string }{
		{"quay.io/", "quay.m.daocloud.io/"},
		{"gcr.io/", "gcr.m.daocloud.io/"},
		{"registry.k8s.io/", "m.daocloud.io/registry.k8s.io/"},
		{"docker.io/", "docker.m.daocloud.io/"},
	}
	for _, r := range repl {
		s = strings.ReplaceAll(s, r.from, r.to)
	}
	// DaoCloud 对 quay.io/prometheus/* 部分 tag 可能仅提供 amd64，在 ARM 等节点会出现 exec format error；
	// 官方 Quay 该命名空间镜像带多架构 manifest list，故对 Prometheus 社区「prometheus」组织镜像仍走直连。
	s = strings.ReplaceAll(s, "quay.m.daocloud.io/prometheus/", "quay.io/prometheus/")
	return []byte(s)
}

func buildKubePromStackValuesYAML(opts KubePromStackInstallOpts) string {
	var b strings.Builder
	fmt.Fprintf(&b, `grafana:
  enabled: %v
alertmanager:
  enabled: %v
kubeApiServer:
  enabled: true
kubeControllerManager:
  enabled: true
kubeScheduler:
  enabled: true
`, opts.GrafanaEnabled, opts.AlertmanagerEnabled)

	if opts.KubeEtcdEnabled && len(opts.KubeEtcdEndpoints) > 0 {
		port := opts.KubeEtcdPort
		if port <= 0 {
			port = 2381
		}
		tgt := opts.KubeEtcdTargetPort
		if tgt <= 0 {
			tgt = 2381
		}
		b.WriteString("kubeEtcd:\n  enabled: true\n  endpoints:\n")
		for _, ep := range opts.KubeEtcdEndpoints {
			ep = strings.TrimSpace(ep)
			if ep == "" {
				continue
			}
			fmt.Fprintf(&b, "    - %q\n", ep)
		}
		fmt.Fprintf(&b, "  service:\n    enabled: %v\n    port: %d\n    targetPort: %d\n",
			opts.KubeEtcdServiceEnabled, port, tgt)
	} else {
		b.WriteString("kubeEtcd:\n  enabled: false\n")
	}

	b.WriteString(`kubeStateMetrics:
  enabled: true
nodeExporter:
  enabled: true
defaultRules:
  create: true
prometheus:
  prometheusSpec:
    retention: 15d
    scrapeInterval: 30s
    serviceMonitorSelectorNilUsesHelmValues: false
    podMonitorSelectorNilUsesHelmValues: false
    ruleSelectorNilUsesHelmValues: false
    serviceMonitorNamespaceSelector: {}
    podMonitorNamespaceSelector: {}
`)
	return b.String()
}

func resolveHelmBinary() (string, error) {
	if p := strings.TrimSpace(os.Getenv("HELM_BIN")); p != "" {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p, nil
		}
	}
	if st, err := os.Stat("/app/helm"); err == nil && !st.IsDir() {
		return "/app/helm", nil
	}
	return exec.LookPath("helm")
}

func findPrometheusOperatorDeployment(ctx context.Context, k8s *kubernetes.Clientset, ns string) (*appsv1.Deployment, error) {
	if k8s == nil {
		return nil, fmt.Errorf("k8s 为空")
	}
	release := kubePromStackReleaseName
	pickBest := func(items []appsv1.Deployment) *appsv1.Deployment {
		if len(items) == 0 {
			return nil
		}
		var prefixed []appsv1.Deployment
		for i := range items {
			if strings.HasPrefix(items[i].Name, release+"-") {
				prefixed = append(prefixed, items[i])
			}
		}
		use := items
		if len(prefixed) > 0 {
			use = prefixed
		}
		var best *appsv1.Deployment
		for i := range use {
			d := &use[i]
			if deploymentRolloutLooksReadyRelaxed(d) {
				return d
			}
			if best == nil {
				best = d
			}
		}
		return best
	}

	list, err := k8s.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{LabelSelector: "app.kubernetes.io/name=prometheus-operator"})
	if err == nil && list != nil && len(list.Items) > 0 {
		if d := pickBest(list.Items); d != nil {
			return d, nil
		}
	}
	// 显式名称：含 chart 在 63 字符限制下截断后的 kube-prometheus-s-operator
	candidates := []string{
		release + "-kube-prometheus-stack-operator",
		release + "-kube-prometheus-operator",
		release + "-kube-prometheus-s-operator",
		release + "-operator",
	}
	var last error
	for _, c := range candidates {
		d, e := k8s.AppsV1().Deployments(ns).Get(ctx, c, metav1.GetOptions{})
		if e == nil && d != nil {
			return d, nil
		}
		last = e
	}
	if last == nil {
		last = fmt.Errorf("未找到")
	}
	return nil, fmt.Errorf("未找到 prometheus-operator Deployment: %w", last)
}

func downloadKubePromChartTGZ(ctx context.Context, mirror ManifestMirrorMode) ([]byte, error) {
	var last error
	for _, u := range kubePrometheusStackChartURLs {
		b, err := httpGetManifestBytes(ctx, u, mirror)
		if err == nil && len(b) > 100 {
			return b, nil
		}
		last = err
	}
	if last == nil {
		last = fmt.Errorf("未知错误")
	}
	return nil, fmt.Errorf("下载 kube-prometheus-stack chart 失败: %w", last)
}

// InstallKubePrometheusStack 使用 helm template 渲染 chart，镜像改写后 client-go 应用（不依赖集群内 Tiller）。
func InstallKubePrometheusStack(ctx context.Context, app *ServerApp, mirror ManifestMirrorMode, platformCfg Config, opts KubePromStackInstallOpts) (*KubePromStackInstallResult, error) {
	if app.K8s() == nil || app.K8sREST() == nil {
		return nil, fmt.Errorf("Kubernetes 未连接")
	}
	helmBin, err := resolveHelmBinary()
	if err != nil {
		return nil, fmt.Errorf("未找到 helm 可执行文件：请在镜像内放置 /app/helm，或设置 HELM_BIN，或将 helm 加入 PATH: %w", err)
	}

	workDir, err := os.MkdirTemp("", "kubebt-kps-*")
	if err != nil {
		return nil, err
	}
	defer func() { _ = os.RemoveAll(workDir) }()

	tgzBytes, err := downloadKubePromChartTGZ(ctx, mirror)
	if err != nil {
		return nil, err
	}
	chartPath := filepath.Join(workDir, "chart.tgz")
	if err := os.WriteFile(chartPath, tgzBytes, 0600); err != nil {
		return nil, err
	}
	valuesPath := filepath.Join(workDir, "values.yaml")
	if err := os.WriteFile(valuesPath, []byte(buildKubePromStackValuesYAML(opts)), 0600); err != nil {
		return nil, err
	}

	// helm template 仅本地渲染，无需 kubeconfig；应用清单走 applyYAMLManifestDynamic。
	cmd := exec.CommandContext(ctx, helmBin, "template", kubePromStackReleaseName, chartPath,
		"--namespace", kubePromStackNamespace,
		"--include-crds",
		"-f", valuesPath,
	)
	cmd.Env = helmHelmEnv(workDir)
	cmd.Dir = workDir
	out, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("helm template 失败: %w\nstderr=%s", err, string(ee.Stderr))
		}
		return nil, fmt.Errorf("helm template: %w", err)
	}
	rendered := out
	if !platformCfg.IngressNginxSkipK8sRegistryMirror {
		rendered = RewriteKubePrometheusRenderedImages(rendered)
	}
	// 清单中文档顺序不定，ServiceAccount 等可能早于 Namespace；chart 也可能不渲染 Namespace
	if err := ensureNamespace(ctx, app.K8s(), kubePromStackNamespace); err != nil {
		return nil, fmt.Errorf("创建或确认命名空间 %s: %w", kubePromStackNamespace, err)
	}
	if err := applyYAMLManifestDynamic(ctx, app.K8sREST(), rendered); err != nil {
		return nil, fmt.Errorf("应用 kube-prometheus-stack 渲染清单: %w", err)
	}

	svc, err := discoverPrometheusService(ctx, app.K8s(), kubePromStackNamespace)
	if err != nil {
		return nil, fmt.Errorf("安装已提交但未找到 Prometheus Service: %w", err)
	}
	base := prometheusHTTPBaseFromService(svc)
	return &KubePromStackInstallResult{
		PrometheusBaseURL: base,
		ServiceName:       svc.Name,
		Namespace:         svc.Namespace,
	}, nil
}

func helmHelmEnv(tmpRoot string) []string {
	base := filepath.Join(tmpRoot, "helmhome")
	_ = os.MkdirAll(filepath.Join(base, "cache"), 0700)
	_ = os.MkdirAll(filepath.Join(base, "config"), 0700)
	_ = os.MkdirAll(filepath.Join(base, "data"), 0700)
	return append(os.Environ(),
		"HELM_CACHE_HOME="+filepath.Join(base, "cache"),
		"HELM_CONFIG_HOME="+filepath.Join(base, "config"),
		"HELM_DATA_HOME="+filepath.Join(base, "data"),
		"HOME="+tmpRoot,
	)
}

func discoverPrometheusService(ctx context.Context, k8s *kubernetes.Clientset, ns string) (*corev1.Service, error) {
	if k8s == nil {
		return nil, fmt.Errorf("k8s 为空")
	}
	list, err := k8s.CoreV1().Services(ns).List(ctx, metav1.ListOptions{LabelSelector: "operated-prometheus=true"})
	if err == nil && list != nil {
		for i := range list.Items {
			s := &list.Items[i]
			for _, p := range s.Spec.Ports {
				if p.Port == 9090 || p.Name == "http-web" || p.Name == "web" {
					return s, nil
				}
			}
		}
	}
	name := kubePromStackReleaseName + "-kube-prometheus-prometheus"
	return k8s.CoreV1().Services(ns).Get(ctx, name, metav1.GetOptions{})
}

func prometheusHTTPBaseFromService(svc *corev1.Service) string {
	if svc == nil {
		return ""
	}
	port := int32(9090)
	for _, p := range svc.Spec.Ports {
		if p.Port == 9090 || p.Name == "http-web" || p.Name == "web" {
			port = p.Port
			break
		}
	}
	ns := svc.Namespace
	if ns == "" {
		ns = kubePromStackNamespace
	}
	return fmt.Sprintf("http://%s.%s.svc:%d", svc.Name, ns, port)
}

func kubePromBenignWaitingReason(reason string) bool {
	switch strings.TrimSpace(reason) {
	case "ContainerCreating", "PodInitializing", "Scheduled":
		return true
	default:
		return false
	}
}

func kubePromMonitoringWorkloadPod(p *corev1.Pod) bool {
	if p == nil {
		return false
	}
	n := strings.ToLower(p.Name)
	return strings.Contains(n, "prometheus") ||
		strings.Contains(n, "alertmanager") ||
		strings.Contains(n, "operator") ||
		strings.Contains(n, "kube-state") ||
		strings.Contains(n, "node-exporter") ||
		strings.Contains(n, "grafana")
}

func appendContainerIssueLines(out []string, podName, cname string, cs corev1.ContainerStatus) []string {
	add := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" {
			return
		}
		for _, ex := range out {
			if ex == s {
				return
			}
		}
		out = append(out, s)
	}
	if w := cs.State.Waiting; w != nil {
		skipBenign := kubePromBenignWaitingReason(w.Reason) && !strings.Contains(strings.ToLower(w.Message), "exec format")
		if !skipBenign {
			line := strings.TrimSpace(strings.TrimSpace(w.Reason) + " " + strings.TrimSpace(w.Message))
			if line != "" {
				add(fmt.Sprintf("%s/%s: %s", podName, cname, line))
			}
		}
	}
	if t := cs.State.Terminated; t != nil && t.ExitCode != 0 {
		add(fmt.Sprintf("%s/%s: exited %d %s %s", podName, cname, t.ExitCode, strings.TrimSpace(t.Reason), strings.TrimSpace(t.Message)))
	}
	if lt := cs.LastTerminationState.Terminated; lt != nil && lt.ExitCode != 0 {
		add(fmt.Sprintf("%s/%s: last exit %d %s %s", podName, cname, lt.ExitCode, strings.TrimSpace(lt.Reason), strings.TrimSpace(lt.Message)))
	}
	return out
}

// kubePromMonitoringPodIssueSummaries 收集监控命名空间内典型工作负载 Pod 的 Waiting / 异常退出摘要（供安装页展示）。
func kubePromMonitoringPodIssueSummaries(ctx context.Context, k8s *kubernetes.Clientset, ns string) []string {
	if k8s == nil {
		return nil
	}
	list, err := k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return []string{"列举 Pod: " + manifestErrSnippet(err, 160)}
	}
	if list == nil {
		return nil
	}
	var out []string
	for i := range list.Items {
		p := &list.Items[i]
		if !kubePromMonitoringWorkloadPod(p) {
			continue
		}
		podName := p.Name
		for _, cs := range p.Status.ContainerStatuses {
			out = appendContainerIssueLines(out, podName, cs.Name, cs)
		}
		for _, cs := range p.Status.InitContainerStatuses {
			out = appendContainerIssueLines(out, podName, cs.Name+" (init)", cs)
		}
		if len(p.Status.ContainerStatuses) == 0 && len(p.Status.InitContainerStatuses) == 0 {
			if p.Status.Phase == corev1.PodFailed || (p.Status.Phase == corev1.PodPending && p.Status.Reason != "") {
				line := fmt.Sprintf("%s: phase=%s %s", podName, p.Status.Phase, strings.TrimSpace(p.Status.Message))
				out = append(out, strings.TrimSpace(line))
			}
		}
	}
	const maxLines = 18
	if len(out) > maxLines {
		out = out[:maxLines]
		out = append(out, fmt.Sprintf("… 另有摘要已截断（共>%d 条）", maxLines))
	}
	return out
}

func kubePromRolloutRemediesForIssues(issues []string) []string {
	var remedies []string
	joined := strings.Join(issues, " ")
	if strings.Contains(strings.ToLower(joined), "exec format error") {
		remedies = append(remedies, "若出现 exec format error：多为容器镜像 CPU 架构与节点不一致（例如在 ARM 节点上拉了 amd64 镜像）。可在集群设置关闭「K8s 镜像改写」后重试，或换用支持你节点架构的镜像仓库/多架构清单。")
	}
	return remedies
}

// WaitKubePrometheusStackRollout 等待 operator Deployment 与 Prometheus StatefulSet 就绪（尽力而为）。
func WaitKubePrometheusStackRollout(ctx context.Context, k8s *kubernetes.Clientset, maxWait time.Duration) IngressAddonVerification {
	started := time.Now()
	deadline := time.Now().Add(maxWait)
	var last []IngressAddonCheck
	if k8s == nil {
		return IngressAddonVerification{
			OK: false, CheckedAt: time.Now().UTC().Format(time.RFC3339),
			Issues: []string{"Kubernetes 客户端不可用"}, Remedies: []string{"确认集群已连接"},
		}
	}
	ns := kubePromStackNamespace

	for time.Now().Before(deadline) {
		if ctx.Err() != nil {
			break
		}
		var checks []IngressAddonCheck

		opDep, opErr := findPrometheusOperatorDeployment(ctx, k8s, ns)
		if opErr != nil || opDep == nil {
			checks = append(checks, IngressAddonCheck{Name: "prometheus-operator Deployment", OK: false, Detail: manifestErrSnippet(opErr, 140)})
		} else {
			ok := deploymentRolloutLooksReadyRelaxed(opDep)
			checks = append(checks, IngressAddonCheck{
				Name:   "prometheus-operator Deployment (" + opDep.Name + ")",
				OK:     ok,
				Detail: fmt.Sprintf("ready %d/%d", opDep.Status.ReadyReplicas, deploymentReplicasDesired(opDep)),
			})
		}

		stsList, err := k8s.AppsV1().StatefulSets(ns).List(ctx, metav1.ListOptions{})
		promOK := false
		promDetail := "未找到 StatefulSet"
		if err == nil && stsList != nil {
			for _, st := range stsList.Items {
				if strings.HasPrefix(st.Name, "prometheus-") && strings.Contains(st.Name, "kube-prometheus") {
					want := int32(1)
					if st.Spec.Replicas != nil {
						want = *st.Spec.Replicas
					}
					if want == 0 {
						want = 1
					}
					ready := st.Status.ReadyReplicas >= want
					promDetail = fmt.Sprintf("%s ready %d/%d", st.Name, st.Status.ReadyReplicas, want)
					promOK = ready
					break
				}
			}
		} else if err != nil {
			promDetail = manifestErrSnippet(err, 140)
		}
		checks = append(checks, IngressAddonCheck{Name: "Prometheus StatefulSet", OK: promOK, Detail: promDetail})

		svc, err := discoverPrometheusService(ctx, k8s, ns)
		svcOK := err == nil && svc != nil
		sd := "已发现 Service"
		if err != nil {
			sd = manifestErrSnippet(err, 120)
		}
		checks = append(checks, IngressAddonCheck{Name: "Prometheus Service", OK: svcOK, Detail: sd})

		amNeeded := false
		amOK := true
		amDetail := "未启用（未发现 Alertmanager StatefulSet）"
		if err == nil && stsList != nil {
			for _, st := range stsList.Items {
				if strings.HasPrefix(st.Name, "alertmanager-") && strings.Contains(st.Name, "kube-prometheus") {
					amNeeded = true
					want := int32(1)
					if st.Spec.Replicas != nil {
						want = *st.Spec.Replicas
					}
					if want == 0 {
						amOK = true
						amDetail = fmt.Sprintf("%s replicas=0", st.Name)
						break
					}
					amOK = st.Status.ReadyReplicas >= want
					amDetail = fmt.Sprintf("%s ready %d/%d", st.Name, st.Status.ReadyReplicas, want)
					break
				}
			}
		}
		if amNeeded {
			checks = append(checks, IngressAddonCheck{Name: "Alertmanager StatefulSet", OK: amOK, Detail: amDetail})
		}

		podIssues := kubePromMonitoringPodIssueSummaries(ctx, k8s, ns)
		podOK := len(podIssues) == 0
		pd := "未发现典型工作负载容器的异常 Waiting / 终止摘要"
		if len(podIssues) > 0 {
			pd = strings.Join(podIssues, " | ")
			if len(pd) > 900 {
				pd = pd[:900] + "…"
			}
		}
		checks = append(checks, IngressAddonCheck{Name: "工作负载 Pod", OK: podOK, Detail: pd})

		last = checks
		allOK := true
		for _, c := range checks {
			if !c.OK {
				allOK = false
				break
			}
		}
		if allOK {
			return IngressAddonVerification{
				OK:            true,
				CheckedAt:     time.Now().UTC().Format(time.RFC3339),
				Checks:        checks,
				WaitedSeconds: int(time.Since(started).Seconds()),
			}
		}
		select {
		case <-ctx.Done():
			deadline = time.Now()
		case <-time.After(12 * time.Second):
		}
	}

	podSnap := kubePromMonitoringPodIssueSummaries(ctx, k8s, ns)
	issues := []string{"等待超时：Prometheus 栈尚未完全就绪"}
	issues = append(issues, podSnap...)
	rem := []string{
		"kubectl get pods -n " + ns,
		"kubectl describe pod -n " + ns + " 排查镜像拉取与 RBAC",
		"确认节点可拉取 DaoCloud 镜像前缀或关闭镜像改写后使用自建仓库",
	}
	rem = append(rem, kubePromRolloutRemediesForIssues(podSnap)...)
	return IngressAddonVerification{
		OK:            false,
		CheckedAt:     time.Now().UTC().Format(time.RFC3339),
		Checks:        last,
		Issues:        issues,
		Remedies:      rem,
		WaitedSeconds: int(time.Since(started).Seconds()),
	}
}

// KubePrometheusStackAddonStatus 供 /api/k8s/addons/status。
func KubePrometheusStackAddonStatus(ctx context.Context, k8s *kubernetes.Clientset, cfg Config) gin.H {
	ns := kubePromStackNamespace
	out := gin.H{
		"namespace":   ns,
		"releaseName": kubePromStackReleaseName,
		"installed":   false,
		"hint":        "一键安装后默认抓取 apiserver、kube-controller-manager、kube-scheduler、kube-state-metrics、node-exporter、kubelet/cAdvisor（全命名空间 ServiceMonitor）；etcd 仍关闭（自建 kubeadm 可在 values 中启用 kubeEtcd）。托管云若控制面不可达可将对应 kube*.enabled 改为 false。平台进程在集群外时 prometheusUrlK8s 勿用 *.svc，请填 Ingress/NodePort 可达地址。启用 etcd 抓取后，侧栏「etcd」可查看 WAL P99、Leader 切换与库大小等指标。",
	}
	if k8s == nil {
		return out
	}
	if _, err := k8s.CoreV1().Namespaces().Get(ctx, ns, metav1.GetOptions{}); err != nil {
		if !apierrors.IsNotFound(err) {
			out["namespaceError"] = err.Error()
		}
		return out
	}
	out["namespaceExists"] = true
	opDep, opErr := findPrometheusOperatorDeployment(ctx, k8s, ns)
	opReady := opErr == nil && opDep != nil && deploymentRolloutLooksReadyRelaxed(opDep)
	if opDep != nil {
		out["operatorDeploymentName"] = opDep.Name
	}

	var promSTS string
	var promReady bool
	var amSTS string
	var amReady bool
	stsList, _ := k8s.AppsV1().StatefulSets(ns).List(ctx, metav1.ListOptions{})
	if stsList != nil {
		for _, st := range stsList.Items {
			if promSTS == "" && strings.HasPrefix(st.Name, "prometheus-") && strings.Contains(st.Name, "kube-prometheus") {
				promSTS = st.Name
				want := int32(1)
				if st.Spec.Replicas != nil {
					want = *st.Spec.Replicas
				}
				promReady = want > 0 && st.Status.ReadyReplicas >= want
			}
			if amSTS == "" && strings.HasPrefix(st.Name, "alertmanager-") && strings.Contains(st.Name, "kube-prometheus") {
				amSTS = st.Name
				want := int32(1)
				if st.Spec.Replicas != nil {
					want = *st.Spec.Replicas
				}
				amReady = want > 0 && st.Status.ReadyReplicas >= want
			}
		}
	}
	out["operatorDeploymentReady"] = opReady
	out["prometheusStatefulSet"] = promSTS
	out["prometheusReady"] = promReady
	out["alertmanagerStatefulSet"] = amSTS
	out["alertmanagerReady"] = amReady
	out["podWarnings"] = kubePromMonitoringPodIssueSummaries(ctx, k8s, ns)

	if svc, err := discoverPrometheusService(ctx, k8s, ns); err == nil && svc != nil {
		out["discoveredPrometheusURL"] = prometheusHTTPBaseFromService(svc)
	}
	amMust := strings.TrimSpace(amSTS) != ""
	out["installed"] = opReady && promReady && (!amMust || amReady)

	// 与「安装/自检通过」解耦：监控页走运行时 prometheusUrlK8s / vmSelectUrlK8s，此处探测该地址的 TSDB 是否真有 kube-state-metrics 系列
	if strings.TrimSpace(GetPrometheusURLForScope(cfg, "k8s")) == "" {
		out["prometheusMetricsProbe"] = gin.H{
			"skipped": true,
			"detail":  "未配置 K8s Prometheus/VM 查询地址，集群监控页无法拉取 kube_*",
		}
	} else {
		c, probeDetail, srcNote, masked := PrometheusKubeNodeInfoCountProbe(cfg)
		ph := gin.H{
			"querySourceNote":    srcNote,
			"effectiveUrlMasked": masked,
		}
		if c != nil {
			ph["kubeNodeInfoCount"] = *c
			ph["ok"] = *c > 0
		} else {
			ph["kubeNodeInfoCount"] = nil
			ph["ok"] = false
		}
		if probeDetail != "" {
			ph["detail"] = probeDetail
		}
		out["prometheusMetricsProbe"] = ph
	}
	return out
}

// PatchRuntimePrometheusK8sURL 写入 prometheusUrlK8s 并重载进程配置。
func PatchRuntimePrometheusK8sURL(app *ServerApp, promURL string, clearVMSelect bool) error {
	promURL = strings.TrimSpace(promURL)
	if err := validatePrometheusBaseURL(promURL); err != nil {
		return fmt.Errorf("Prometheus URL 无效: %w", err)
	}
	path := filepath.Join(app.DataDir(), runtimeConfigFileName)
	cur, err := LoadRuntimeSettings(path)
	if err != nil || cur == nil || !cur.Initialized {
		return fmt.Errorf("运行时未初始化")
	}
	cur.PrometheusURLK8s = promURL
	if clearVMSelect {
		cur.VMSelectURLK8s = ""
	}
	if err := SaveRuntimeSettingsUnified(path, app.MySQLDB(), cur); err != nil {
		return err
	}
	if err := app.Reload(); err != nil {
		return err
	}
	InvalidateRuntimeStatusCache(context.Background(), app)
	return nil
}
