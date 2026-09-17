package internal

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	appsv1 "k8s.io/api/apps/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	sigyaml "sigs.k8s.io/yaml"
)

// POST /api/k8s/apply-yaml  body: { yamlContent: string } — 多文档 --- 分隔；支持常见 workload/网络/RBAC 周边资源及 kind: List
func handleK8sApplyYamlGeneric(c *gin.Context, app *ServerApp) {
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	var req YamlRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数解析失败: " + err.Error()})
		return
	}
	docs := splitYAMLDocuments(req.YamlContent)
	if len(docs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "YAML 为空"})
		return
	}
	ctx := context.TODO()
	applied := 0
	user := dashboardUsernameFromGin(c)
	for _, doc := range docs {
		doc = strings.TrimSpace(doc)
		if doc == "" {
			continue
		}
		if normalizeYAMLDocument(doc) == "" {
			continue
		}
		if err := applyOneKubernetesYAML(ctx, k8s, doc, req.SkipWorkloadSchedulingCheck); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		applied++
		K8sAppendObjectRevisionsFromYAML(app, user, "apply-yaml", doc)
	}
	if applied == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "未找到可应用的 Kubernetes 资源片段：每段需含 apiVersion 与 kind；Helm/多文件合并时纯 `# Source:` 或空段会被跳过，请确认至少有一段有效清单",
		})
		return
	}
	SetAuditDetail(c, fmt.Sprintf("已应用 YAML 共 %d 段到集群", applied))
	c.JSON(http.StatusOK, gin.H{"message": "YAML 已成功应用到集群"})
}

func splitYAMLDocuments(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	parts := strings.Split(s, "\n---")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if strings.HasPrefix(p, "---") {
			p = strings.TrimSpace(strings.TrimPrefix(p, "---"))
		}
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return []string{s}
	}
	return out
}

func applyKubernetesYAMLList(ctx context.Context, k8s *kubernetes.Clientset, doc string, skipWorkloadSchedulingCheck bool) error {
	doc = normalizeYAMLDocument(doc)
	if doc == "" {
		return fmt.Errorf("List 资源在规范化后为空")
	}
	var root map[string]interface{}
	if err := sigyaml.Unmarshal([]byte(doc), &root); err != nil {
		return err
	}
	rawItems, ok := root["items"]
	if !ok {
		return fmt.Errorf("List 资源缺少 items")
	}
	items, ok := rawItems.([]interface{})
	if !ok || len(items) == 0 {
		return fmt.Errorf("List 资源的 items 须为非空数组")
	}
	for i, it := range items {
		itemYAML, err := sigyaml.Marshal(it)
		if err != nil {
			return fmt.Errorf("List items[%d] 序列化: %w", i, err)
		}
		if err := applyOneKubernetesYAML(ctx, k8s, string(itemYAML), skipWorkloadSchedulingCheck); err != nil {
			return fmt.Errorf("List items[%d]: %w", i, err)
		}
	}
	return nil
}

func applyOneKubernetesYAML(ctx context.Context, k8s *kubernetes.Clientset, doc string, skipWorkloadSchedulingCheck bool) error {
	doc = normalizeYAMLDocument(doc)
	if doc == "" {
		return fmt.Errorf("YAML 片段在去掉注释与分隔符后为空")
	}
	doc = ensureKubernetesYAMLGVK(doc)
	if err := sigyaml.Unmarshal([]byte(doc), &struct{}{}); err != nil {
		return err
	}
	kind := kubernetesYAMLKind(doc)
	if kind == "" {
		return fmt.Errorf("无法识别 YAML kind（请确保包含顶格字段 kind，例如 kind: Deployment）；支持 Deployment/StatefulSet/DaemonSet/ReplicaSet/Job/CronJob/Pod/Service/PVC/ConfigMap/Secret/Ingress/NetworkPolicy/HorizontalPodAutoscaler/Namespace/ServiceAccount 及 kind: List 多段清单")
	}
	if kind == "List" {
		return applyKubernetesYAMLList(ctx, k8s, doc, skipWorkloadSchedulingCheck)
	}
	switch kind {
	case "Deployment":
		var o appsv1.Deployment
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		if o.Namespace == "" {
			o.Namespace = "default"
		}
		cli := k8s.AppsV1().Deployments(o.Namespace)
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			if !skipWorkloadSchedulingCheck {
				pre, perr := PrecheckDeploymentScheduling(ctx, k8s, &o)
				if perr != nil {
					return perr
				}
				if !pre.OK {
					return fmt.Errorf("%s", pre.Message)
				}
			}
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	case "DaemonSet":
		var o appsv1.DaemonSet
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		if o.Namespace == "" {
			o.Namespace = "default"
		}
		cli := k8s.AppsV1().DaemonSets(o.Namespace)
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	case "ReplicaSet":
		var o appsv1.ReplicaSet
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		if o.Namespace == "" {
			o.Namespace = "default"
		}
		cli := k8s.AppsV1().ReplicaSets(o.Namespace)
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	case "StatefulSet":
		var o appsv1.StatefulSet
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		if o.Namespace == "" {
			o.Namespace = "default"
		}
		cli := k8s.AppsV1().StatefulSets(o.Namespace)
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			if !skipWorkloadSchedulingCheck {
				pre, perr := PrecheckStatefulSetScheduling(ctx, k8s, &o)
				if perr != nil {
					return perr
				}
				if !pre.OK {
					return fmt.Errorf("%s", pre.Message)
				}
			}
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	case "Job":
		var o batchv1.Job
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		if o.Namespace == "" {
			o.Namespace = "default"
		}
		cli := k8s.BatchV1().Jobs(o.Namespace)
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	case "CronJob":
		var o batchv1.CronJob
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		if o.Namespace == "" {
			o.Namespace = "default"
		}
		cli := k8s.BatchV1().CronJobs(o.Namespace)
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	case "Pod":
		var o corev1.Pod
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		if o.Namespace == "" {
			o.Namespace = "default"
		}
		cli := k8s.CoreV1().Pods(o.Namespace)
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	case "Service":
		var o corev1.Service
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		if o.Namespace == "" {
			o.Namespace = "default"
		}
		cli := k8s.CoreV1().Services(o.Namespace)
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	case "PersistentVolumeClaim":
		var o corev1.PersistentVolumeClaim
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		if o.Namespace == "" {
			o.Namespace = "default"
		}
		cli := k8s.CoreV1().PersistentVolumeClaims(o.Namespace)
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	case "ConfigMap":
		var o corev1.ConfigMap
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		if o.Namespace == "" {
			o.Namespace = "default"
		}
		cli := k8s.CoreV1().ConfigMaps(o.Namespace)
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	case "Secret":
		var o corev1.Secret
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		if o.Namespace == "" {
			o.Namespace = "default"
		}
		cli := k8s.CoreV1().Secrets(o.Namespace)
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	case "NetworkPolicy":
		var o networkingv1.NetworkPolicy
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		if o.Namespace == "" {
			o.Namespace = "default"
		}
		cli := k8s.NetworkingV1().NetworkPolicies(o.Namespace)
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	case "HorizontalPodAutoscaler":
		var o autoscalingv2.HorizontalPodAutoscaler
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		if o.Namespace == "" {
			o.Namespace = "default"
		}
		cli := k8s.AutoscalingV2().HorizontalPodAutoscalers(o.Namespace)
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	case "Namespace":
		var o corev1.Namespace
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		cli := k8s.CoreV1().Namespaces()
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	case "ServiceAccount":
		var o corev1.ServiceAccount
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		if o.Namespace == "" {
			o.Namespace = "default"
		}
		cli := k8s.CoreV1().ServiceAccounts(o.Namespace)
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	case "Ingress":
		var o networkingv1.Ingress
		if err := sigyaml.Unmarshal([]byte(doc), &o); err != nil {
			return err
		}
		if o.Namespace == "" {
			o.Namespace = "default"
		}
		cli := k8s.NetworkingV1().Ingresses(o.Namespace)
		ex, err := cli.Get(ctx, o.Name, metav1.GetOptions{})
		if err == nil {
			o.ResourceVersion = ex.ResourceVersion
			_, err = cli.Update(ctx, &o, metav1.UpdateOptions{})
			return err
		}
		if apierrors.IsNotFound(err) {
			_, err = cli.Create(ctx, &o, metav1.CreateOptions{})
			return err
		}
		return err
	default:
		return fmt.Errorf("暂不支持的 kind: %s（可拆成多段 YAML 或使用 kubectl；已支持 List 包裹的多资源）", kind)
	}
}

// k8sGetObjectYAMLBytes 与 GET object-yaml 一致，供修订快照等复用。
func k8sGetObjectYAMLBytes(ctx context.Context, k8s *kubernetes.Clientset, kind, ns, name string) ([]byte, error) {
	var (
		yamlBytes []byte
		err       error
	)
	switch kind {
	case "Deployment":
		o, e := k8s.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
		if e != nil {
			err = e
			break
		}
		o.APIVersion, o.Kind = "apps/v1", "Deployment"
		o.ManagedFields = nil
		yamlBytes, err = sigyaml.Marshal(o)
	case "StatefulSet":
		o, e := k8s.AppsV1().StatefulSets(ns).Get(ctx, name, metav1.GetOptions{})
		if e != nil {
			err = e
			break
		}
		o.APIVersion, o.Kind = "apps/v1", "StatefulSet"
		o.ManagedFields = nil
		yamlBytes, err = sigyaml.Marshal(o)
	case "DaemonSet":
		o, e := k8s.AppsV1().DaemonSets(ns).Get(ctx, name, metav1.GetOptions{})
		if e != nil {
			err = e
			break
		}
		o.APIVersion, o.Kind = "apps/v1", "DaemonSet"
		o.ManagedFields = nil
		yamlBytes, err = sigyaml.Marshal(o)
	case "Pod":
		o, e := k8s.CoreV1().Pods(ns).Get(ctx, name, metav1.GetOptions{})
		if e != nil {
			err = e
			break
		}
		o.APIVersion, o.Kind = "v1", "Pod"
		o.ManagedFields = nil
		yamlBytes, err = sigyaml.Marshal(o)
	case "Service":
		o, e := k8s.CoreV1().Services(ns).Get(ctx, name, metav1.GetOptions{})
		if e != nil {
			err = e
			break
		}
		o.APIVersion, o.Kind = "v1", "Service"
		o.ManagedFields = nil
		yamlBytes, err = sigyaml.Marshal(o)
	case "PersistentVolumeClaim":
		o, e := k8s.CoreV1().PersistentVolumeClaims(ns).Get(ctx, name, metav1.GetOptions{})
		if e != nil {
			err = e
			break
		}
		o.APIVersion, o.Kind = "v1", "PersistentVolumeClaim"
		o.ManagedFields = nil
		yamlBytes, err = sigyaml.Marshal(o)
	case "ConfigMap":
		o, e := k8s.CoreV1().ConfigMaps(ns).Get(ctx, name, metav1.GetOptions{})
		if e != nil {
			err = e
			break
		}
		o.APIVersion, o.Kind = "v1", "ConfigMap"
		o.ManagedFields = nil
		var raw []byte
		raw, err = sigyaml.Marshal(o)
		if err != nil {
			break
		}
		yamlBytes, err = reformatConfigMapYAMLForDisplayWithData(raw, o.Data)
		if err != nil {
			yamlBytes = raw
			err = nil
		}
	case "Secret":
		o, e := k8s.CoreV1().Secrets(ns).Get(ctx, name, metav1.GetOptions{})
		if e != nil {
			err = e
			break
		}
		o.APIVersion, o.Kind = "v1", "Secret"
		o.ManagedFields = nil
		yamlBytes, err = sigyaml.Marshal(o)
	case "Ingress":
		o, e := k8s.NetworkingV1().Ingresses(ns).Get(ctx, name, metav1.GetOptions{})
		if e != nil {
			err = e
			break
		}
		o.APIVersion, o.Kind = "networking.k8s.io/v1", "Ingress"
		o.ManagedFields = nil
		yamlBytes, err = sigyaml.Marshal(o)
	default:
		return nil, fmt.Errorf("不支持的 kind: %s", kind)
	}
	return yamlBytes, err
}

// GET /api/k8s/object-yaml?kind=Deployment&namespace=&name=
func handleK8sGetObjectYAML(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	kind := strings.TrimSpace(c.Query("kind"))
	ns := strings.TrimSpace(c.Query("namespace"))
	name := strings.TrimSpace(c.Query("name"))
	if kind == "" || ns == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要 query: kind, namespace, name"})
		return
	}
	ctx := context.TODO()
	yamlBytes, err := k8sGetObjectYAMLBytes(ctx, k8s, kind, ns, name)
	if err != nil {
		if strings.HasPrefix(err.Error(), "不支持的 kind:") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	if err != nil {
		if apierrors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "资源不存在"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"yaml": string(yamlBytes)})
}

// DELETE /api/k8s/objects/:kind/:namespace/:name  kind: deployment|statefulset|pod|service|pvc|configmap
func handleK8sDeleteObject(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	kind := strings.ToLower(strings.TrimSpace(c.Param("kind")))
	ns := c.Param("namespace")
	name := c.Param("name")
	if ns == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "路径无效"})
		return
	}
	ctx := context.TODO()
	var err error
	switch kind {
	case "deployment":
		err = k8s.AppsV1().Deployments(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "statefulset":
		err = k8s.AppsV1().StatefulSets(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "daemonset":
		err = k8s.AppsV1().DaemonSets(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "pod":
		err = k8s.CoreV1().Pods(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "service":
		err = k8s.CoreV1().Services(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "pvc":
		err = k8s.CoreV1().PersistentVolumeClaims(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "configmap":
		err = k8s.CoreV1().ConfigMaps(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "secret":
		err = k8s.CoreV1().Secrets(ns).Delete(ctx, name, metav1.DeleteOptions{})
	case "ingress":
		err = k8s.NetworkingV1().Ingresses(ns).Delete(ctx, name, metav1.DeleteOptions{})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的 kind: " + kind})
		return
	}
	if err != nil {
		if apierrors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "资源不存在"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, fmt.Sprintf("删除资源 %s %s/%s", kind, ns, name))
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}
