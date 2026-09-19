package internal

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

const ingressControllerPodLabelKey = "app.kubernetes.io/component=controller"

// IngressAddonCheck 单项检查结果。
type IngressAddonCheck struct {
	Name   string `json:"name"`
	OK     bool   `json:"ok"`
	Detail string `json:"detail,omitempty"`
}

// IngressAddonVerification ingress-nginx + hostNetwork 自检汇总。
type IngressAddonVerification struct {
	OK              bool                `json:"ok"`
	CheckedAt       string              `json:"checkedAt"`
	Checks          []IngressAddonCheck `json:"checks"`
	Issues          []string            `json:"issues"`
	Remedies        []string            `json:"remedies"`
	AutoRepairs     []string            `json:"autoRepairs,omitempty"`
	TcpProbeAddr    string              `json:"tcpProbeAddr,omitempty"`
	TcpHttpOpen     bool                `json:"tcpHttpOpen"`
	HttpProbeOk     bool                `json:"httpProbeOk"`
	HttpProbeDetail string              `json:"httpProbeDetail,omitempty"`
	WaitedSeconds   int                 `json:"waitedSeconds,omitempty"`
}

// IngressVerifyOpts WaitVerifyIngressNginxHostNetwork 参数。
type IngressVerifyOpts struct {
	PollEvery         time.Duration
	Remediate         bool
	MaxRepairAttempts int
	ProbeTCP          bool
	ProbeHTTP         bool
}

func deploymentReplicasDesired(dep *appsv1.Deployment) int32 {
	if dep == nil || dep.Spec.Replicas == nil {
		return 1
	}
	return *dep.Spec.Replicas
}

func deploymentRolloutLooksReady(dep *appsv1.Deployment) bool {
	if dep == nil {
		return false
	}
	want := deploymentReplicasDesired(dep)
	if dep.Status.ObservedGeneration < dep.Generation {
		return false
	}
	if dep.Status.UpdatedReplicas < want {
		return false
	}
	if dep.Status.ReadyReplicas < want {
		return false
	}
	if dep.Status.AvailableReplicas < want {
		return false
	}
	return true
}

// deploymentRolloutLooksReadyRelaxed 在 Ready/Available 已达期望副本时视为就绪，容忍 ObservedGeneration、UpdatedReplicas 的短暂滞后（长名 Deployment 滚动后 API 常见）。
func deploymentRolloutLooksReadyRelaxed(dep *appsv1.Deployment) bool {
	if dep == nil {
		return false
	}
	if deploymentRolloutLooksReady(dep) {
		return true
	}
	want := deploymentReplicasDesired(dep)
	if want <= 0 {
		return false
	}
	return dep.Status.ReadyReplicas >= want && dep.Status.AvailableReplicas >= want
}

func nodeInternalIP(ctx context.Context, k8s *kubernetes.Clientset, nodeName string) string {
	if k8s == nil || nodeName == "" {
		return ""
	}
	n, err := k8s.CoreV1().Nodes().Get(ctx, nodeName, metav1.GetOptions{})
	if err != nil || n == nil {
		return ""
	}
	for _, a := range n.Status.Addresses {
		if a.Type == corev1.NodeInternalIP && a.Address != "" {
			return a.Address
		}
	}
	for _, a := range n.Status.Addresses {
		if a.Type == corev1.NodeExternalIP && a.Address != "" {
			return a.Address
		}
	}
	return ""
}

func podReady(pod *corev1.Pod) bool {
	if pod == nil {
		return false
	}
	for _, c := range pod.Status.Conditions {
		if c.Type == corev1.PodReady && c.Status == corev1.ConditionTrue {
			return true
		}
	}
	return false
}

func tcpDial(ctx context.Context, addr string, timeout time.Duration) bool {
	d := net.Dialer{Timeout: timeout}
	c, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return false
	}
	_ = c.Close()
	return true
}

func httpProbeIngressDefault(ctx context.Context, host string, port int32) (ok bool, detail string) {
	if port < 1 {
		return false, "端口无效"
	}
	u := fmt.Sprintf("http://%s/", net.JoinHostPort(host, strconv.Itoa(int(port))))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return false, err.Error()
	}
	client := &http.Client{Timeout: 5 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return false, err.Error()
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 512))
	// 404/502 等仍表示有进程在监听 HTTP
	return true, fmt.Sprintf("HTTP %d", res.StatusCode)
}

func appendUnique(slice []string, s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return slice
	}
	for _, x := range slice {
		if x == s {
			return slice
		}
	}
	return append(slice, s)
}

func ingressDeploymentNeedsHostNetFix(dep *appsv1.Deployment, wantHTTP, wantHTTPS int32) bool {
	if dep == nil {
		return false
	}
	if !dep.Spec.Template.Spec.HostNetwork {
		return true
	}
	if dep.Spec.Template.Spec.DNSPolicy != corev1.DNSClusterFirstWithHostNet {
		return true
	}
	idx := findIngressControllerContainerIndex(dep.Spec.Template.Spec.Containers)
	if idx < 0 {
		return true
	}
	cont := dep.Spec.Template.Spec.Containers[idx]
	var gotH, gotS int32
	for _, p := range cont.Ports {
		switch p.Name {
		case "http":
			gotH = p.ContainerPort
		case "https":
			gotS = p.ContainerPort
		}
	}
	return gotH != wantHTTP || gotS != wantHTTPS
}

// RunIngressNginxHostNetworkVerification 单次检查（不含自动修复）。doTCP/doHTTP 在无法解析节点 IP 时会跳过。
func RunIngressNginxHostNetworkVerification(ctx context.Context, k8s *kubernetes.Clientset, wantHTTP, wantHTTPS int32, doTCP, doHTTP bool) IngressAddonVerification {
	now := time.Now().UTC().Format(time.RFC3339)
	out := IngressAddonVerification{
		CheckedAt: now,
		Checks:    nil,
		Issues:    nil,
		Remedies:  nil,
	}
	ns := ingressNginxControllerNamespace

	if k8s == nil {
		out.Issues = append(out.Issues, "Kubernetes 客户端未初始化")
		out.Remedies = append(out.Remedies, "请确认集群已连接且本服务 kubeconfig 有效。")
		return out
	}

	_, err := k8s.CoreV1().Namespaces().Get(ctx, ns, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			out.Checks = append(out.Checks, IngressAddonCheck{Name: "namespace", OK: false, Detail: "ingress-nginx 不存在"})
			out.Issues = append(out.Issues, "命名空间 ingress-nginx 不存在")
			out.Remedies = append(out.Remedies, "清单可能未成功应用或命名空间被删除：请重新执行「安装 / 升级 ingress-nginx」。")
			return out
		}
		out.Checks = append(out.Checks, IngressAddonCheck{Name: "namespace", OK: false, Detail: err.Error()})
		out.Issues = append(out.Issues, "读取命名空间失败: "+err.Error())
		return out
	}
	out.Checks = append(out.Checks, IngressAddonCheck{Name: "namespace", OK: true, Detail: ns})

	dep, err := k8s.AppsV1().Deployments(ns).Get(ctx, ingressNginxControllerDeployName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			out.Checks = append(out.Checks, IngressAddonCheck{Name: "deployment", OK: false, Detail: "未找到 ingress-nginx-controller"})
			out.Issues = append(out.Issues, "未找到 Deployment ingress-nginx-controller")
			out.Remedies = append(out.Remedies, "等待资源创建完成，或重新安装；可用 kubectl get deploy -n ingress-nginx 查看。")
			return out
		}
		out.Checks = append(out.Checks, IngressAddonCheck{Name: "deployment", OK: false, Detail: err.Error()})
		out.Issues = append(out.Issues, "读取 Deployment 失败: "+err.Error())
		return out
	}
	out.Checks = append(out.Checks, IngressAddonCheck{Name: "deployment", OK: true})

	hostNet := dep.Spec.Template.Spec.HostNetwork
	dnsOK := dep.Spec.Template.Spec.DNSPolicy == corev1.DNSClusterFirstWithHostNet
	out.Checks = append(out.Checks, IngressAddonCheck{Name: "hostNetwork", OK: hostNet, Detail: fmt.Sprintf("template.hostNetwork=%v", hostNet)})
	if !hostNet {
		out.Issues = append(out.Issues, "Deployment 模板未启用 hostNetwork")
		out.Remedies = append(out.Remedies, "点击「仅应用端口」或重新安装；若使用 GitOps，请避免覆盖控制器 Deployment 的 hostNetwork 字段。")
	}
	out.Checks = append(out.Checks, IngressAddonCheck{Name: "dnsPolicy", OK: dnsOK, Detail: string(dep.Spec.Template.Spec.DNSPolicy)})
	if !dnsOK {
		out.Issues = append(out.Issues, "DNS 策略应为 ClusterFirstWithHostNet（hostNetwork 场景）")
		out.Remedies = append(out.Remedies, "将自动尝试重新应用控制器配置；若仍失败请重新安装。")
	}

	idx := findIngressControllerContainerIndex(dep.Spec.Template.Spec.Containers)
	var depHTTP, depHTTPS int32
	if idx >= 0 {
		cont := dep.Spec.Template.Spec.Containers[idx]
		for _, p := range cont.Ports {
			switch p.Name {
			case "http":
				depHTTP = p.ContainerPort
			case "https":
				depHTTPS = p.ContainerPort
			}
		}
	}
	portMatch := hostNet && depHTTP == wantHTTP && depHTTPS == wantHTTPS
	out.Checks = append(out.Checks, IngressAddonCheck{
		Name: "ports",
		OK:   portMatch,
		Detail: fmt.Sprintf("模板 http=%d https=%d，期望 http=%d https=%d",
			depHTTP, depHTTPS, wantHTTP, wantHTTPS),
	})
	if !portMatch {
		out.Issues = append(out.Issues, fmt.Sprintf("容器端口与期望不一致（当前 http=%d https=%d，期望 %d/%d）", depHTTP, depHTTPS, wantHTTP, wantHTTPS))
		out.Remedies = append(out.Remedies, "在页面确认 HTTP/HTTPS 端口后点击「仅应用端口」，或于运行时设置中保存端口后重试。")
	}

	rolloutOK := deploymentRolloutLooksReady(dep)
	out.Checks = append(out.Checks, IngressAddonCheck{
		Name:   "rollout",
		OK:     rolloutOK,
		Detail: fmt.Sprintf("ready=%d/%d available=%d gen=%d observed=%d", dep.Status.ReadyReplicas, deploymentReplicasDesired(dep), dep.Status.AvailableReplicas, dep.Generation, dep.Status.ObservedGeneration),
	})
	if !rolloutOK {
		out.Issues = append(out.Issues, "Deployment 尚未完成就绪滚动（Ready/Available 副本不足或 Generation 未观测）")
		out.Remedies = append(out.Remedies, "执行 kubectl describe deploy -n ingress-nginx ingress-nginx-controller 与 kubectl get pods -n ingress-nginx 查看原因。")
	}

	list, err := k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{LabelSelector: ingressControllerPodLabelKey})
	if err != nil {
		out.Checks = append(out.Checks, IngressAddonCheck{Name: "controller_pods", OK: false, Detail: err.Error()})
		out.Issues = append(out.Issues, "列出控制器 Pod 失败: "+err.Error())
	} else if len(list.Items) == 0 {
		out.Checks = append(out.Checks, IngressAddonCheck{Name: "controller_pods", OK: false, Detail: "无匹配 Pod"})
		out.Issues = append(out.Issues, "未找到 app.kubernetes.io/component=controller 的 Pod")
		out.Remedies = append(out.Remedies, "等待调度完成；若长期为空，检查 Deployment selector 与清单版本是否一致。")
	} else {
		allHostNet := true
		allReady := true
		var detailParts []string
		var probePod *corev1.Pod
		for i := range list.Items {
			p := &list.Items[i]
			detailParts = append(detailParts, fmt.Sprintf("%s(%s)", p.Name, p.Status.Phase))
			if !p.Spec.HostNetwork {
				allHostNet = false
			}
			if p.Status.Phase == corev1.PodRunning && podReady(p) {
				if probePod == nil {
					probePod = p
				}
			} else {
				allReady = false
			}
		}
		out.Checks = append(out.Checks, IngressAddonCheck{
			Name:   "controller_pods",
			OK:     allReady && allHostNet,
			Detail: strings.Join(detailParts, ", "),
		})
		if !allHostNet {
			out.Issues = append(out.Issues, "部分控制器 Pod 未使用 hostNetwork（与 Deployment 不一致时多为旧 Pod）")
			out.Remedies = append(out.Remedies, "删除控制器 Pod 使其按新模板重建：kubectl delete pod -n ingress-nginx -l app.kubernetes.io/component=controller")
		}
		if !allReady {
			out.Issues = append(out.Issues, "控制器 Pod 未全部 Running+Ready")
			out.Remedies = append(out.Remedies, "hostNetwork 下若 80/443 被节点其它进程占用会导致 CrashLoop：在节点执行 ss -lntp | grep ':80\\b' 或对应端口排查。")
			out.Remedies = append(out.Remedies, "查看事件：kubectl describe pod -n ingress-nginx -l app.kubernetes.io/component=controller")
		}

		if doTCP || doHTTP {
			if probePod != nil && probePod.Spec.NodeName != "" {
				ip := nodeInternalIP(ctx, k8s, probePod.Spec.NodeName)
				if ip == "" {
					out.Checks = append(out.Checks, IngressAddonCheck{Name: "node_ip", OK: false, Detail: "无法解析节点 IP"})
					out.Issues = append(out.Issues, "无法从 Node 状态解析用于探测的 IP")
				} else {
					addr := net.JoinHostPort(ip, strconv.Itoa(int(wantHTTP)))
					out.TcpProbeAddr = addr
					if doTCP {
						open := tcpDial(ctx, addr, 4*time.Second)
						out.TcpHttpOpen = open
						out.Checks = append(out.Checks, IngressAddonCheck{Name: "tcp_http", OK: open, Detail: addr})
						if !open {
							out.Issues = append(out.Issues, fmt.Sprintf("TCP 无法连接 %s（HTTP 端口）", addr))
							out.Remedies = append(out.Remedies, "若 Pod 已 Ready 仍失败：检查本管理平台到节点 IP 的网络路径、云安全组/防火墙是否放行该端口。")
							out.Remedies = append(out.Remedies, fmt.Sprintf("在能访问节点的机器上测试：curl -v --max-time 5 http://%s/ （Ingress 返回 404 通常仍表示监听正常）", addr))
						}
					}
					tryHTTP := doHTTP && (!doTCP || out.TcpHttpOpen)
					if tryHTTP {
						ok, det := httpProbeIngressDefault(ctx, ip, wantHTTP)
						out.HttpProbeOk = ok
						out.HttpProbeDetail = det
						out.Checks = append(out.Checks, IngressAddonCheck{Name: "http_default", OK: ok, Detail: det})
						if !ok {
							out.Issues = append(out.Issues, "HTTP 探测失败: "+det)
						}
					}
				}
			} else if allReady {
				out.Checks = append(out.Checks, IngressAddonCheck{Name: "tcp_http", OK: false, Detail: "无可用 Pod 做探测"})
			}
		}
	}

	svc, err := k8s.CoreV1().Services(ns).Get(ctx, ingressNginxControllerServiceName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			out.Checks = append(out.Checks, IngressAddonCheck{Name: "service", OK: false, Detail: "Service 不存在"})
			out.Issues = append(out.Issues, "控制器 Service 不存在")
		} else {
			out.Checks = append(out.Checks, IngressAddonCheck{Name: "service", OK: false, Detail: err.Error()})
		}
	} else {
		st := string(svc.Spec.Type)
		svcOK := svc.Spec.Type == corev1.ServiceTypeClusterIP
		out.Checks = append(out.Checks, IngressAddonCheck{Name: "service", OK: svcOK, Detail: st})
		if !svcOK {
			out.Issues = append(out.Issues, fmt.Sprintf("控制器 Service 类型为 %s，hostNetwork 模式建议使用 ClusterIP", st))
			out.Remedies = append(out.Remedies, "重新安装或「仅应用端口」会尝试将 Service 改为 ClusterIP 并去掉 NodePort。")
		}
	}

	out.OK = true
	for _, ch := range out.Checks {
		if !ch.OK {
			out.OK = false
			break
		}
	}

	if out.OK {
		out.Remedies = nil
	}
	return out
}

// WaitVerifyIngressNginxHostNetwork 轮询验证；remediate 时在发现模板配置漂移时重复调用 FinishIngressNginxHostNetwork。
func WaitVerifyIngressNginxHostNetwork(ctx context.Context, k8s *kubernetes.Clientset, wantHTTP, wantHTTPS int32, opts IngressVerifyOpts) IngressAddonVerification {
	if opts.PollEvery <= 0 {
		opts.PollEvery = 12 * time.Second
	}
	if opts.MaxRepairAttempts <= 0 {
		opts.MaxRepairAttempts = 10
	}
	start := time.Now()
	repairs := 0
	var auto []string
	var last IngressAddonVerification
	snapshot := func() IngressAddonVerification {
		snapCtx, snapCancel := context.WithTimeout(context.Background(), 25*time.Second)
		defer snapCancel()
		return RunIngressNginxHostNetworkVerification(snapCtx, k8s, wantHTTP, wantHTTPS, opts.ProbeTCP, opts.ProbeHTTP)
	}
	for {
		if err := ctx.Err(); err != nil {
			last.WaitedSeconds = int(time.Since(start).Seconds())
			last.AutoRepairs = auto
			if last.CheckedAt == "" {
				last = snapshot()
			}
			last.Issues = appendUnique(last.Issues, "等待超时："+err.Error())
			last.Remedies = appendUnique(last.Remedies, "可适当延长等待后使用「深度自检」；或根据 Issues 在节点/集群侧排查。")
			last.OK = false
			return last
		}

		if opts.Remediate && repairs < opts.MaxRepairAttempts && k8s != nil {
			dep, err := k8s.AppsV1().Deployments(ingressNginxControllerNamespace).Get(ctx, ingressNginxControllerDeployName, metav1.GetOptions{})
			if err == nil && dep != nil && ingressDeploymentNeedsHostNetFix(dep, wantHTTP, wantHTTPS) {
				_ = FinishIngressNginxHostNetwork(ctx, k8s, wantHTTP, wantHTTPS, nil)
				repairs++
				auto = append(auto, fmt.Sprintf("已自动重新应用 hostNetwork/端口/Service（第 %d 次）", repairs))
				select {
				case <-ctx.Done():
					last = snapshot()
					last.WaitedSeconds = int(time.Since(start).Seconds())
					last.AutoRepairs = auto
					last.Issues = appendUnique(last.Issues, "等待超时："+ctx.Err().Error())
					last.Remedies = appendUnique(last.Remedies, "可适当延长等待后使用「深度自检」；或根据 Issues 在节点/集群侧排查。")
					last.OK = false
					return last
				case <-time.After(5 * time.Second):
				}
				continue
			}
		}

		last = RunIngressNginxHostNetworkVerification(ctx, k8s, wantHTTP, wantHTTPS, opts.ProbeTCP, opts.ProbeHTTP)
		last.WaitedSeconds = int(time.Since(start).Seconds())
		last.AutoRepairs = append([]string(nil), auto...)
		if last.OK {
			return last
		}

		select {
		case <-ctx.Done():
			last.OK = false
			last.AutoRepairs = auto
			last.Issues = appendUnique(last.Issues, "等待超时："+ctx.Err().Error())
			last.Remedies = appendUnique(last.Remedies, "可适当延长等待后使用「深度自检」；或根据 Issues 在节点/集群侧排查。")
			return last
		case <-time.After(opts.PollEvery):
		}
	}
}
