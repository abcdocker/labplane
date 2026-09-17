package internal

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
	sigyaml "sigs.k8s.io/yaml"
)

const (
	defaultIngressNginxBaremetalURL   = "https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/baremetal/deploy.yaml"
	ingressNginxControllerServiceName = "ingress-nginx-controller"
	ingressNginxControllerNamespace   = "ingress-nginx"
	ingressNginxControllerDeployName = "ingress-nginx-controller"
)

// IngressControllerTemplateMetricsPort 从控制器容器模板解析 metrics 容器端口声明（上游默认 10254；v1.10 不支持 --metrics-port）。
func IngressControllerTemplateMetricsPort(cont corev1.Container) int32 {
	for _, p := range cont.Ports {
		switch p.Name {
		case "metrics", "prometheus", "monitoring":
			return p.ContainerPort
		}
	}
	return 10254
}

func effectiveIngressNginxHostHTTPPort(rs *RuntimeSettings, cfg Config) int32 {
	if rs != nil && rs.IngressNginxHostHTTPPort > 0 && rs.IngressNginxHostHTTPPort <= 65535 {
		return int32(rs.IngressNginxHostHTTPPort)
	}
	if cfg.IngressNginxHostHTTPPort > 0 && cfg.IngressNginxHostHTTPPort <= 65535 {
		return cfg.IngressNginxHostHTTPPort
	}
	return 80
}

func effectiveIngressNginxHostHTTPSPort(rs *RuntimeSettings, cfg Config) int32 {
	if rs != nil && rs.IngressNginxHostHTTPSPort > 0 && rs.IngressNginxHostHTTPSPort <= 65535 {
		return int32(rs.IngressNginxHostHTTPSPort)
	}
	if cfg.IngressNginxHostHTTPSPort > 0 && cfg.IngressNginxHostHTTPSPort <= 65535 {
		return cfg.IngressNginxHostHTTPSPort
	}
	return 443
}

func effectiveIngressNginxControllerNodeName(rs *RuntimeSettings, cfg Config) string {
	if rs != nil && strings.TrimSpace(rs.IngressNginxControllerNodeName) != "" {
		return strings.TrimSpace(rs.IngressNginxControllerNodeName)
	}
	return strings.TrimSpace(cfg.IngressNginxControllerNodeName)
}

// ingressDeploymentPinnedHostname 读取 Deployment 模板上的 kubernetes.io/hostname 固定调度（若有）。
func ingressDeploymentPinnedHostname(dep *appsv1.Deployment) string {
	if dep == nil {
		return ""
	}
	if dep.Spec.Template.Spec.NodeSelector == nil {
		return ""
	}
	v, ok := dep.Spec.Template.Spec.NodeSelector[corev1.LabelHostname]
	if !ok {
		return ""
	}
	return strings.TrimSpace(v)
}

// applyIngressHostnameNodePin 设置或清除控制器 Pod 的节点固定；非空时同时将副本数设为 1（hostNetwork 单实例）。
func applyIngressHostnameNodePin(dep *appsv1.Deployment, nodeName string) {
	if dep == nil {
		return
	}
	spec := &dep.Spec.Template.Spec
	n := strings.TrimSpace(nodeName)
	if n == "" {
		if spec.NodeSelector != nil {
			delete(spec.NodeSelector, corev1.LabelHostname)
			if len(spec.NodeSelector) == 0 {
				spec.NodeSelector = nil
			}
		}
		return
	}
	if spec.NodeSelector == nil {
		spec.NodeSelector = map[string]string{}
	}
	spec.NodeSelector[corev1.LabelHostname] = n
	one := int32(1)
	dep.Spec.Replicas = &one
}

func httpGetBody(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	client := &http.Client{Timeout: 8 * time.Minute}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		slurp, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
		return nil, fmt.Errorf("HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(slurp)))
	}
	return io.ReadAll(res.Body)
}

func applyDynamicYAMLDoc(ctx context.Context, dyn dynamic.Interface, mapper meta.RESTMapper, yamlDoc string) error {
	yamlDoc = strings.TrimSpace(yamlDoc)
	if yamlDoc == "" {
		return nil
	}
	jsonData, err := sigyaml.YAMLToJSON([]byte(yamlDoc))
	if err != nil {
		return fmt.Errorf("YAML 转 JSON: %w", err)
	}
	js := strings.TrimSpace(string(jsonData))
	// Helm template 常在 --- 之间产生仅注释或 YAML null 的片段，不能当 K8s 对象 apply
	if js == "" || js == "null" || js == "{}" {
		return nil
	}
	obj := &unstructured.Unstructured{}
	if err := obj.UnmarshalJSON(jsonData); err != nil {
		return fmt.Errorf("解析对象: %w", err)
	}
	gvk := obj.GroupVersionKind()
	if gvk.Kind == "" || gvk.Version == "" {
		if gvk.Kind == "" && obj.GetAPIVersion() == "" {
			return nil
		}
		return fmt.Errorf("缺少 kind 或 apiVersion")
	}
	mapping, err := mapper.RESTMapping(schema.GroupKind{Group: gvk.Group, Kind: gvk.Kind}, gvk.Version)
	if err != nil {
		return fmt.Errorf("REST 映射 %v: %w", gvk, err)
	}
	var dr dynamic.ResourceInterface
	if mapping.Scope.Name() == meta.RESTScopeNameRoot {
		dr = dyn.Resource(mapping.Resource)
	} else {
		ns := obj.GetNamespace()
		if ns == "" {
			ns = metav1.NamespaceDefault
		}
		dr = dyn.Resource(mapping.Resource).Namespace(ns)
	}
	name := obj.GetName()
	if name == "" {
		return fmt.Errorf("%s 缺少 metadata.name", gvk.Kind)
	}
	_, err = dr.Apply(ctx, name, obj, metav1.ApplyOptions{
		FieldManager: "kube-bt-sync",
		Force:        true,
	})
	if err != nil {
		return fmt.Errorf("Apply %s %s/%s: %w", gvk.Kind, obj.GetNamespace(), name, err)
	}
	return nil
}

func applyYAMLManifestDynamic(ctx context.Context, cfg *rest.Config, yamlBytes []byte) error {
	dyn, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return err
	}
	dc, err := discovery.NewDiscoveryClientForConfig(cfg)
	if err != nil {
		return err
	}
	cache := memory.NewMemCacheClient(dc)
	mapper := restmapper.NewDeferredDiscoveryRESTMapper(cache)
	docs := splitYAMLDocuments(string(yamlBytes))
	const maxPasses = 30
	var lastRetryable error
	for pass := 0; pass < maxPasses; pass++ {
		mapper.Reset()
		lastRetryable = nil
		for i, doc := range docs {
			if err := applyDynamicYAMLDoc(ctx, dyn, mapper, doc); err != nil {
				msg := err.Error()
				if strings.Contains(msg, "no matches for kind") ||
					strings.Contains(msg, "could not find the requested resource") ||
					strings.Contains(msg, "the server could not find the requested resource") {
					lastRetryable = fmt.Errorf("文档 #%d: %w", i+1, err)
					break
				}
				return fmt.Errorf("文档 #%d: %w", i+1, err)
			}
		}
		if lastRetryable == nil {
			return nil
		}
		if pass == maxPasses-1 {
			return fmt.Errorf("CRD/资源未在超时内就绪: %w", lastRetryable)
		}
		time.Sleep(time.Duration(250+pass*80) * time.Millisecond)
	}
	return fmt.Errorf("apply 重试耗尽")
}

func stripIngressHostNetworkPortArgs(args []string) []string {
	var out []string
	for _, a := range args {
		if strings.HasPrefix(a, "--http-port=") ||
			strings.HasPrefix(a, "--https-port=") ||
			strings.HasPrefix(a, "--metrics-port=") {
			// v1.10 控制器无 --metrics-port，旧版本若误注入会导致 unknown flag
			continue
		}
		out = append(out, a)
	}
	return out
}

func patchIngressControllerContainer(c *corev1.Container, httpPort, httpsPort int32) {
	c.Args = stripIngressHostNetworkPortArgs(c.Args)
	c.Args = append(c.Args,
		fmt.Sprintf("--http-port=%d", httpPort),
		fmt.Sprintf("--https-port=%d", httpsPort),
	)
	for i := range c.Ports {
		switch c.Ports[i].Name {
		case "http":
			c.Ports[i].ContainerPort = httpPort
		case "https":
			c.Ports[i].ContainerPort = httpsPort
		}
	}
}

func findIngressControllerContainerIndex(containers []corev1.Container) int {
	for i := range containers {
		if containers[i].Name == "controller" {
			return i
		}
	}
	if len(containers) == 1 {
		return 0
	}
	return -1
}

// FinishIngressNginxHostNetwork 将 ingress-nginx 控制器 Deployment 设为 hostNetwork，并调整容器端口与参数；控制器 Service 改为 ClusterIP（不再使用 NodePort/LoadBalancer）。
// nodePin 为 nil 时不改节点固定策略；非 nil 时按字符串设置或清除（空字符串表示删除 kubernetes.io/hostname 选择器）。
func FinishIngressNginxHostNetwork(ctx context.Context, k8s *kubernetes.Clientset, httpPort, httpsPort int32, nodePin *string) error {
	if k8s == nil {
		return fmt.Errorf("Kubernetes 客户端未初始化")
	}
	if httpPort < 1 || httpPort > 65535 || httpsPort < 1 || httpsPort > 65535 {
		return fmt.Errorf("主机端口须在 1–65535")
	}
	waitCtx, cancel := context.WithTimeout(ctx, 4*time.Minute)
	defer cancel()
	var lastDepErr error
	for {
		dep, err := k8s.AppsV1().Deployments(ingressNginxControllerNamespace).Get(waitCtx, ingressNginxControllerDeployName, metav1.GetOptions{})
		lastDepErr = err
		if err == nil && dep != nil {
			dep.Spec.Template.Spec.HostNetwork = true
			dep.Spec.Template.Spec.DNSPolicy = corev1.DNSClusterFirstWithHostNet
			idx := findIngressControllerContainerIndex(dep.Spec.Template.Spec.Containers)
			if idx < 0 {
				return fmt.Errorf("未在 Deployment 中找到 ingress 控制器容器")
			}
			patchIngressControllerContainer(&dep.Spec.Template.Spec.Containers[idx], httpPort, httpsPort)
			if nodePin != nil {
				applyIngressHostnameNodePin(dep, *nodePin)
			}
			_, err = k8s.AppsV1().Deployments(ingressNginxControllerNamespace).Update(waitCtx, dep, metav1.UpdateOptions{})
			if err == nil {
				break
			}
			if !apierrors.IsConflict(err) {
				return fmt.Errorf("更新 ingress Deployment（hostNetwork）: %w", err)
			}
			select {
			case <-waitCtx.Done():
				return fmt.Errorf("更新 ingress Deployment: %w", waitCtx.Err())
			case <-time.After(2 * time.Second):
			}
			continue
		}
		if err != nil && !apierrors.IsNotFound(err) {
			return fmt.Errorf("读取 ingress Deployment: %w", err)
		}
		select {
		case <-waitCtx.Done():
			if apierrors.IsNotFound(lastDepErr) {
				return fmt.Errorf("超时：未找到 %s/%s Deployment", ingressNginxControllerNamespace, ingressNginxControllerDeployName)
			}
			return fmt.Errorf("等待 ingress Deployment: %w", waitCtx.Err())
		case <-time.After(2 * time.Second):
		}
	}

	svcCtx, svcCancel := context.WithTimeout(ctx, 2*time.Minute)
	defer svcCancel()
	for {
		svc, err := k8s.CoreV1().Services(ingressNginxControllerNamespace).Get(svcCtx, ingressNginxControllerServiceName, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				return nil
			}
			return fmt.Errorf("读取 ingress Service: %w", err)
		}
		svc.Spec.Type = corev1.ServiceTypeClusterIP
		newPorts := make([]corev1.ServicePort, 0, len(svc.Spec.Ports))
		for _, p := range svc.Spec.Ports {
			np := corev1.ServicePort{
				Name:        p.Name,
				Protocol:    p.Protocol,
				Port:        p.Port,
				TargetPort:  p.TargetPort,
				AppProtocol: p.AppProtocol,
			}
			newPorts = append(newPorts, np)
		}
		svc.Spec.Ports = newPorts
		_, err = k8s.CoreV1().Services(ingressNginxControllerNamespace).Update(svcCtx, svc, metav1.UpdateOptions{})
		if err == nil {
			return nil
		}
		if !apierrors.IsConflict(err) {
			return fmt.Errorf("将 ingress Service 改为 ClusterIP: %w", err)
		}
		select {
		case <-svcCtx.Done():
			return fmt.Errorf("更新 ingress Service: %w", svcCtx.Err())
		case <-time.After(2 * time.Second):
		}
	}
}

// InstallIngressNginxHostNetwork 安装官方 bare metal 清单，并强制控制器使用 hostNetwork + 指定 HTTP/HTTPS 监听端口（metrics 沿用清单默认 10254，v1.10 不支持 --metrics-port）。
// nodePin 非 nil 时同步写入节点固定（与 Finish 语义一致）；安装完成后执行一次 Finish 时已包含该策略。
func InstallIngressNginxHostNetwork(ctx context.Context, k8s *kubernetes.Clientset, restCfg *rest.Config, platformCfg Config, manifestURL string, mirror ManifestMirrorMode, httpPort, httpsPort int32, nodePin *string) error {
	u := strings.TrimSpace(manifestURL)
	if u == "" {
		u = defaultIngressNginxBaremetalURL
	}
	raw, err := httpGetManifestBytes(ctx, u, mirror)
	if err != nil {
		return fmt.Errorf("下载 ingress-nginx 清单: %w", err)
	}
	raw = RewriteIngressManifestK8sRegistryImages(raw, platformCfg)
	if err := applyYAMLManifestDynamic(ctx, restCfg, raw); err != nil {
		return err
	}
	return FinishIngressNginxHostNetwork(ctx, k8s, httpPort, httpsPort, nodePin)
}

// PatchIngressNginxHostPorts 集群已安装 ingress-nginx 时仅应用 hostNetwork 与端口调整。
func PatchIngressNginxHostPorts(ctx context.Context, k8s *kubernetes.Clientset, httpPort, httpsPort int32) error {
	return FinishIngressNginxHostNetwork(ctx, k8s, httpPort, httpsPort, nil)
}

// PatchIngressNginxControllerNode 仅更新控制器调度节点（nodeSelector kubernetes.io/hostname）；nodeName 空表示取消固定。
func PatchIngressNginxControllerNode(ctx context.Context, k8s *kubernetes.Clientset, nodeName string) error {
	if k8s == nil {
		return fmt.Errorf("Kubernetes 客户端未初始化")
	}
	n := strings.TrimSpace(nodeName)
	if n != "" {
		_, err := k8s.CoreV1().Nodes().Get(ctx, n, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				return fmt.Errorf("节点不存在: %s", n)
			}
			return fmt.Errorf("读取节点: %w", err)
		}
	}
	waitCtx, cancel := context.WithTimeout(ctx, 4*time.Minute)
	defer cancel()
	for {
		dep, err := k8s.AppsV1().Deployments(ingressNginxControllerNamespace).Get(waitCtx, ingressNginxControllerDeployName, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				return fmt.Errorf("未找到 Deployment %s/%s", ingressNginxControllerNamespace, ingressNginxControllerDeployName)
			}
			return fmt.Errorf("读取 ingress Deployment: %w", err)
		}
		applyIngressHostnameNodePin(dep, n)
		_, err = k8s.AppsV1().Deployments(ingressNginxControllerNamespace).Update(waitCtx, dep, metav1.UpdateOptions{})
		if err == nil {
			return nil
		}
		if !apierrors.IsConflict(err) {
			return fmt.Errorf("更新 ingress Deployment（节点固定）: %w", err)
		}
		select {
		case <-waitCtx.Done():
			return fmt.Errorf("更新 ingress Deployment: %w", waitCtx.Err())
		case <-time.After(2 * time.Second):
		}
	}
}
