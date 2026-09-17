package internal

import (
	"context"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// cloudVMFindRunningPodName 按 Deployment 实例标签查找运行中的 cloud-vm 容器 Pod。
func cloudVMFindRunningPodName(ctx context.Context, k8s *kubernetes.Clientset, ns, depName string) (string, error) {
	if k8s == nil || strings.TrimSpace(ns) == "" || strings.TrimSpace(depName) == "" {
		return "", fmt.Errorf("参数无效")
	}
	lo := metav1.ListOptions{LabelSelector: "app.kubernetes.io/instance=" + depName}
	pl, err := k8s.CoreV1().Pods(ns).List(ctx, lo)
	if err != nil {
		return "", err
	}
	for _, p := range pl.Items {
		if p.Status.Phase != corev1.PodRunning || p.DeletionTimestamp != nil {
			continue
		}
		if strings.TrimSpace(p.Name) == "" {
			continue
		}
		return p.Name, nil
	}
	return "", fmt.Errorf("未找到运行中的 Pod（请等待云主机就绪）")
}

// CloudVMExecGoogle204Check 在云主机 Pod 内访问 Google generate_204，用于判断出站是否可达。
// 若实例勾选了 Hysteria2 客户端，则强制经本机 HTTP inbound（127.0.0.1:listenPort）发 curl，与 hysteria client 暴露的本地代理一致；否则直连（适用于无外网墙环境或 Pod 已设 HTTP(S)_PROXY 等）。
func CloudVMExecGoogle204Check(ctx context.Context, k8s *kubernetes.Clientset, rc *rest.Config, ns, depName string, sw CloudVMSoftwareOpts) (ok bool, detail string) {
	pod, err := cloudVMFindRunningPodName(ctx, k8s, ns, depName)
	if err != nil {
		return false, err.Error()
	}
	var script string
	if sw.InstallHysteria2 {
		p := NormalizeHysteria2ListenPort(sw.Hysteria2ListenPort)
		// -x：HTTPS 走 HTTP CONNECT；与 Pod 内 hysteria 的 http.listen 一致（平台已改为 0.0.0.0，本机仍可用 127.0.0.1）
		script = fmt.Sprintf(`code=$(curl -s -o /dev/null -w "%%{http_code}" --max-time 25 -x http://127.0.0.1:%d https://www.google.com/generate_204 2>/dev/null || echo 0)
if [ "$code" = "204" ]; then echo OK; else echo "FAIL:$code"; fi`, p)
	} else {
		script = `code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 https://www.google.com/generate_204 2>/dev/null || echo 0)
if [ "$code" = "204" ]; then echo OK; else echo "FAIL:$code"; fi`
	}
	cmd := []string{"/bin/sh", "-c", script}
	out, serr, err := k8sPodExecRun(ctx, k8s, rc, ns, pod, "cloud-vm", cmd, nil)
	if err != nil {
		return false, strings.TrimSpace(err.Error() + " " + serr.String())
	}
	line := strings.TrimSpace(out.String())
	if strings.HasPrefix(line, "OK") {
		if sw.InstallHysteria2 {
			p := NormalizeHysteria2ListenPort(sw.Hysteria2ListenPort)
			return true, fmt.Sprintf("可访问 Google（HTTP 204，经本机 Hysteria HTTP 代理 127.0.0.1:%d）", p)
		}
		return true, "可访问 Google（HTTP 204）"
	}
	if sw.InstallHysteria2 && strings.Contains(line, "FAIL:0") {
		line += fmt.Sprintf("（curl 无法经 127.0.0.1:%d 走代理，请确认 hysteria client 已启动且 YAML 中 http.listen 端口与向导一致）", NormalizeHysteria2ListenPort(sw.Hysteria2ListenPort))
	}
	return false, line
}

// 客户端本地 HTTP/SOCKS 等 inbound 默认端口（须与 YAML 中 listen 一致）
const hysteria2DefaultListenPort = 8080

// NormalizeHysteria2ListenPort 云主机 Pod 内监听端口；<1024 需特权，强制改为默认。
func NormalizeHysteria2ListenPort(p int) int {
	if p <= 0 || p > 65535 {
		return hysteria2DefaultListenPort
	}
	if p < 1024 {
		return hysteria2DefaultListenPort
	}
	return p
}

// hysteriaClientLoopbackListenRE 匹配客户端 YAML 中 socks5/http/tproxy 等段的 listen（常见为 127.0.0.1:端口）。
var hysteriaClientLoopbackListenRE = regexp.MustCompile(`(?m)^(\s*listen:\s*)(127\.0\.0\.1|localhost|\[::1\])(:\d+)`)

// PatchHysteria2ClientYAMLForCluster 将本地代理 listen 从回环改为 0.0.0.0，便于集群内其它 Pod 经 ClusterIP 访问 HTTP/SOCKS 等 inbound。
// 端口以配置文件为准；请在向导中填写与 YAML 中本地 listen 一致的端口以便 Deployment 暴露。
func PatchHysteria2ClientYAMLForCluster(yaml string) string {
	yaml = strings.TrimSpace(yaml)
	if yaml == "" {
		return yaml
	}
	return hysteriaClientLoopbackListenRE.ReplaceAllString(yaml, "${1}0.0.0.0$3")
}

// ExpandHysteriaShareURIToClientYAML 将官方分享链（整段单行 hysteria2:// 或 hy2://）展开为含 server 与本地 http inbound 的 YAML。
// 片段 # 备注名会去掉；本地端口由 listenPort 指定（须与向导中「本地 inbound 端口」一致）。
// 参见 https://v2.hysteria.network/docs/developers/URI-Scheme/
func ExpandHysteriaShareURIToClientYAML(raw string, listenPort int) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.ContainsAny(raw, "\n\r") {
		return raw
	}
	low := strings.ToLower(raw)
	if !strings.HasPrefix(low, "hysteria2://") && !strings.HasPrefix(low, "hy2://") {
		return raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return raw
	}
	u.Fragment = ""
	server := u.String()
	p := NormalizeHysteria2ListenPort(listenPort)
	// 分享 URI 常含 & ? :，用引号包 server 值以符合 YAML
	q := strconv.Quote(server)
	return "server: " + q + "\nhttp:\n  listen: 127.0.0.1:" + strconv.Itoa(p) + "\n"
}

// NormalizeHysteriaClientSecretYAML 分享链 → YAML → 本地 listen 改为 0.0.0.0，供写入 Secret。
func NormalizeHysteriaClientSecretYAML(raw string, listenPort int) string {
	expanded := ExpandHysteriaShareURIToClientYAML(raw, listenPort)
	return PatchHysteria2ClientYAMLForCluster(expanded)
}

// hysteriaSocksListenPortFromClientYAML 从客户端 YAML 中解析 socks5.listen 端口；无 socks5 段时返回 0（勿把 HTTP 端口当作 SOCKS）。
var hysteriaYAMLsocks5ListenRE = regexp.MustCompile(`(?is)socks5\s*:\s*(?:[^\n]+\n|\s+)*?\s*listen:\s*(?:[0-9.]+\s*:\s*|\[[^\]]+\]\s*:\s*|localhost\s*:\s*)?(\d+)`)

func hysteriaSocksListenPortFromClientYAML(yaml string) int {
	yaml = strings.TrimSpace(yaml)
	if yaml == "" || !strings.Contains(strings.ToLower(yaml), "socks5") {
		return 0
	}
	m := hysteriaYAMLsocks5ListenRE.FindStringSubmatch(yaml)
	if len(m) < 2 {
		return 0
	}
	n, err := strconv.Atoi(m[1])
	if err != nil || n <= 0 || n > 65535 {
		return 0
	}
	return n
}

func cloudVMHysteria2ServiceName(depName string) string {
	return strings.TrimSpace(depName) + "-hy2"
}

// CloudVMHysteria2ClusterEndpoint 集群内 DNS:TCP 端口（客户端本地代理）。
func CloudVMHysteria2ClusterEndpoint(ns, depName string, port int) string {
	ns = strings.TrimSpace(ns)
	depName = strings.TrimSpace(depName)
	if ns == "" || depName == "" {
		return ""
	}
	p := NormalizeHysteria2ListenPort(port)
	return fmt.Sprintf("%s.%s.svc.cluster.local:%d", cloudVMHysteria2ServiceName(depName), ns, p)
}

func buildCloudVMHysteria2ClusterIPService(ns, svcName, depName string, port int32) *corev1.Service {
	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      svcName,
			Namespace: ns,
			Labels: map[string]string{
				"kube-bt-sync.io/cloud-vm-hy2": "true",
				"app.kubernetes.io/name":       "kube-bt-cloud-vm-hy2",
			},
		},
		Spec: corev1.ServiceSpec{
			Type:     corev1.ServiceTypeClusterIP,
			Selector: map[string]string{"app.kubernetes.io/instance": depName},
			Ports: []corev1.ServicePort{
				{Name: "hy2-tcp", Port: port, TargetPort: intstr.FromInt(int(port)), Protocol: corev1.ProtocolTCP},
			},
		},
	}
}

func upsertCloudVMHysteria2Service(ctx context.Context, k8s *kubernetes.Clientset, ns, depName string, sw CloudVMSoftwareOpts) error {
	if k8s == nil {
		return nil
	}
	svcName := cloudVMHysteria2ServiceName(depName)
	if !sw.InstallHysteria2 || strings.TrimSpace(sw.Hysteria2ConfigYAML) == "" {
		_ = k8s.CoreV1().Services(ns).Delete(ctx, svcName, metav1.DeleteOptions{})
		return nil
	}
	port := int32(NormalizeHysteria2ListenPort(sw.Hysteria2ListenPort))
	want := buildCloudVMHysteria2ClusterIPService(ns, svcName, depName, port)
	_, err := k8s.CoreV1().Services(ns).Get(ctx, svcName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			_, err = k8s.CoreV1().Services(ns).Create(ctx, want, metav1.CreateOptions{})
			return err
		}
		return err
	}
	_, err = k8s.CoreV1().Services(ns).Update(ctx, want, metav1.UpdateOptions{})
	return err
}
