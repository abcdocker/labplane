package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
)

// podTemplatePortsForJSON 汇总 Pod 模板中各容器的 ports，供列表/详情展示（含 init 容器）。
func podTemplatePortsForJSON(podSpec *corev1.PodSpec) []map[string]interface{} {
	if podSpec == nil {
		return nil
	}
	var out []map[string]interface{}
	appendPorts := func(containers []corev1.Container, init bool) {
		for _, c := range containers {
			for _, p := range c.Ports {
				proto := string(p.Protocol)
				if proto == "" {
					proto = "TCP"
				}
				row := map[string]interface{}{
					"container":     c.Name,
					"port":          p.ContainerPort,
					"protocol":      proto,
					"initContainer": init,
				}
				if p.Name != "" {
					row["portName"] = p.Name
				}
				if p.HostPort > 0 {
					row["hostPort"] = p.HostPort
				}
				out = append(out, row)
			}
		}
	}
	appendPorts(podSpec.InitContainers, true)
	appendPorts(podSpec.Containers, false)
	return out
}

// k8sListJSON 列出带可选 namespace 查询参数的资源（空则全集群），统一 Guard、超时与错误 JSON。
func k8sListJSON[Item any](c *gin.Context, k8s *kubernetes.Clientset, errPrefix string, list func(ctx context.Context, ns string) ([]Item, error), row func(Item) map[string]interface{}) {
	if !GuardK8s(c, k8s) {
		return
	}
	ns := c.Query("namespace")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	items, err := list(ctx, ns)
	if err != nil {
		RespondAPIError500(c, errPrefix+err.Error())
		return
	}
	out := make([]map[string]interface{}, 0, len(items))
	for i := range items {
		out = append(out, row(items[i]))
	}
	c.JSON(http.StatusOK, out)
}

func k8sWorkloadRowReadyCounts(ts metav1.Time, namespace, name string, labels map[string]string, ready, desired int32, selector *metav1.LabelSelector, hostNetwork bool, podSpec *corev1.PodSpec) map[string]interface{} {
	ls := ""
	if selector != nil {
		ls = metav1.FormatLabelSelector(selector)
	}
	return map[string]interface{}{
		"namespace":        namespace,
		"name":             name,
		"labels":           k8sLabelsString(labels),
		"ready":            fmt.Sprintf("%d/%d", ready, desired),
		"age":              ts.Time.Format(time.RFC3339),
		"labelSelector":    ls,
		"hostNetwork":      hostNetwork,
		"podTemplatePorts": podTemplatePortsForJSON(podSpec),
	}
}

func handleK8sDeployments(c *gin.Context, k8s *kubernetes.Clientset) {
	k8sListJSON(c, k8s, "列出 Deployment 失败: ", func(ctx context.Context, ns string) ([]appsv1.Deployment, error) {
		var list *appsv1.DeploymentList
		var err error
		if ns != "" {
			list, err = k8s.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{})
		} else {
			list, err = k8s.AppsV1().Deployments("").List(ctx, metav1.ListOptions{})
		}
		if err != nil {
			return nil, err
		}
		return list.Items, nil
	}, func(d appsv1.Deployment) map[string]interface{} {
		desired := int32(1)
		if d.Spec.Replicas != nil {
			desired = *d.Spec.Replicas
		}
		return k8sWorkloadRowReadyCounts(d.CreationTimestamp, d.Namespace, d.Name, d.Labels, d.Status.ReadyReplicas, desired, d.Spec.Selector, d.Spec.Template.Spec.HostNetwork, &d.Spec.Template.Spec)
	})
}

func handleK8sStatefulSets(c *gin.Context, k8s *kubernetes.Clientset) {
	k8sListJSON(c, k8s, "列出 StatefulSet 失败: ", func(ctx context.Context, ns string) ([]appsv1.StatefulSet, error) {
		var list *appsv1.StatefulSetList
		var err error
		if ns != "" {
			list, err = k8s.AppsV1().StatefulSets(ns).List(ctx, metav1.ListOptions{})
		} else {
			list, err = k8s.AppsV1().StatefulSets("").List(ctx, metav1.ListOptions{})
		}
		if err != nil {
			return nil, err
		}
		return list.Items, nil
	}, func(s appsv1.StatefulSet) map[string]interface{} {
		desired := int32(1)
		if s.Spec.Replicas != nil {
			desired = *s.Spec.Replicas
		}
		return k8sWorkloadRowReadyCounts(s.CreationTimestamp, s.Namespace, s.Name, s.Labels, s.Status.ReadyReplicas, desired, s.Spec.Selector, s.Spec.Template.Spec.HostNetwork, &s.Spec.Template.Spec)
	})
}

func handleK8sDaemonSets(c *gin.Context, k8s *kubernetes.Clientset) {
	k8sListJSON(c, k8s, "列出 DaemonSet 失败: ", func(ctx context.Context, ns string) ([]appsv1.DaemonSet, error) {
		var list *appsv1.DaemonSetList
		var err error
		if ns != "" {
			list, err = k8s.AppsV1().DaemonSets(ns).List(ctx, metav1.ListOptions{})
		} else {
			list, err = k8s.AppsV1().DaemonSets("").List(ctx, metav1.ListOptions{})
		}
		if err != nil {
			return nil, err
		}
		return list.Items, nil
	}, func(d appsv1.DaemonSet) map[string]interface{} {
		return k8sWorkloadRowReadyCounts(d.CreationTimestamp, d.Namespace, d.Name, d.Labels, d.Status.NumberReady, d.Status.DesiredNumberScheduled, d.Spec.Selector, d.Spec.Template.Spec.HostNetwork, &d.Spec.Template.Spec)
	})
}

func handleK8sPVCs(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ns := c.Query("namespace")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	var list *corev1.PersistentVolumeClaimList
	var err error
	if ns != "" {
		list, err = k8s.CoreV1().PersistentVolumeClaims(ns).List(ctx, metav1.ListOptions{})
	} else {
		list, err = k8s.CoreV1().PersistentVolumeClaims("").List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		RespondAPIError500(c, "列出 PVC 失败: "+err.Error())
		return
	}
	out := make([]map[string]interface{}, 0, len(list.Items))
	for _, p := range list.Items {
		capacity := "—"
		if p.Status.Capacity != nil {
			if q, ok := p.Status.Capacity[corev1.ResourceStorage]; ok {
				capacity = q.String()
			}
		}
		modes := make([]string, 0, len(p.Spec.AccessModes))
		for _, m := range p.Spec.AccessModes {
			modes = append(modes, string(m))
		}
		sc := ""
		if p.Spec.StorageClassName != nil {
			sc = *p.Spec.StorageClassName
		}
		out = append(out, map[string]interface{}{
			"namespace":    p.Namespace,
			"name":         p.Name,
			"labels":       k8sLabelsString(p.Labels),
			"status":       string(p.Status.Phase),
			"capacity":     capacity,
			"accessModes":  modes,
			"storageClass": sc,
			"age":          p.CreationTimestamp.Time.Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, out)
}

// k8sExpandPVCStorage 将 PVC 声明容量上调至 newSize（须大于当前 requests.storage；依赖 StorageClass.allowVolumeExpansion 与 CSI）。
func k8sExpandPVCStorage(ctx context.Context, k8s *kubernetes.Clientset, ns, pvcName, newSize string) error {
	newSize = strings.TrimSpace(newSize)
	if newSize == "" {
		return fmt.Errorf("size 为空")
	}
	newQ, err := resource.ParseQuantity(newSize)
	if err != nil {
		return fmt.Errorf("无效容量: %w", err)
	}
	pvc, err := k8s.CoreV1().PersistentVolumeClaims(ns).Get(ctx, pvcName, metav1.GetOptions{})
	if err != nil {
		return err
	}
	curQ, ok := pvc.Spec.Resources.Requests[corev1.ResourceStorage]
	if !ok {
		return fmt.Errorf("PVC 无 spec.resources.requests.storage")
	}
	if newQ.Cmp(curQ) <= 0 {
		return fmt.Errorf("新容量须大于当前声明 %s", curQ.String())
	}
	patchMap := map[string]interface{}{
		"spec": map[string]interface{}{
			"resources": map[string]interface{}{
				"requests": map[string]interface{}{
					"storage": newSize,
				},
			},
		},
	}
	patchBytes, err := json.Marshal(patchMap)
	if err != nil {
		return err
	}
	_, err = k8s.CoreV1().PersistentVolumeClaims(ns).Patch(ctx, pvcName, types.MergePatchType, patchBytes, metav1.PatchOptions{})
	return err
}

func handleK8sPVCExpand(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ns := strings.TrimSpace(c.Param("namespace"))
	name := strings.TrimSpace(c.Param("name"))
	if ns == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "namespace 与 name 必填"})
		return
	}
	var body struct {
		Size string `json:"size"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	newStr := strings.TrimSpace(body.Size)
	if newStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供 size，例如 50Gi"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	err := k8sExpandPVCStorage(ctx, k8s, ns, name, newStr)
	if err != nil {
		if apierrors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "PVC 不存在"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error() + "（需 StorageClass allowVolumeExpansion 及 CSI 支持在线扩容；部分环境需在节点上扩展文件系统）"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "size": newStr})
}

func handleK8sConfigMaps(c *gin.Context, k8s *kubernetes.Clientset) {
	k8sListJSON(c, k8s, "列出 ConfigMap 失败: ", func(ctx context.Context, ns string) ([]corev1.ConfigMap, error) {
		var list *corev1.ConfigMapList
		var err error
		if ns != "" {
			list, err = k8s.CoreV1().ConfigMaps(ns).List(ctx, metav1.ListOptions{})
		} else {
			list, err = k8s.CoreV1().ConfigMaps("").List(ctx, metav1.ListOptions{})
		}
		if err != nil {
			return nil, err
		}
		return list.Items, nil
	}, func(cm corev1.ConfigMap) map[string]interface{} {
		keys := len(cm.Data) + len(cm.BinaryData)
		return map[string]interface{}{
			"namespace": cm.Namespace,
			"name":      cm.Name,
			"labels":    k8sLabelsString(cm.Labels),
			"keys":      keys,
			"age":       cm.CreationTimestamp.Time.Format(time.RFC3339),
		}
	})
}

func handleK8sSecrets(c *gin.Context, k8s *kubernetes.Clientset) {
	k8sListJSON(c, k8s, "列出 Secret 失败: ", func(ctx context.Context, ns string) ([]corev1.Secret, error) {
		var list *corev1.SecretList
		var err error
		if ns != "" {
			list, err = k8s.CoreV1().Secrets(ns).List(ctx, metav1.ListOptions{})
		} else {
			list, err = k8s.CoreV1().Secrets("").List(ctx, metav1.ListOptions{})
		}
		if err != nil {
			return nil, err
		}
		return list.Items, nil
	}, func(s corev1.Secret) map[string]interface{} {
		keys := len(s.Data) + len(s.StringData)
		return map[string]interface{}{
			"namespace": s.Namespace,
			"name":      s.Name,
			"labels":    k8sLabelsString(s.Labels),
			"type":      string(s.Type),
			"keys":      keys,
			"age":       s.CreationTimestamp.Time.Format(time.RFC3339),
		}
	})
}

func handleK8sIngresses(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ns := c.Query("namespace")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	var list *networkingv1.IngressList
	var err error
	if ns != "" {
		list, err = k8s.NetworkingV1().Ingresses(ns).List(ctx, metav1.ListOptions{})
	} else {
		list, err = k8s.NetworkingV1().Ingresses("").List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		RespondAPIError500(c, "列出 Ingress 失败: "+err.Error())
		return
	}
	out := make([]map[string]interface{}, 0, len(list.Items))
	for _, ing := range list.Items {
		var hosts []string
		for _, r := range ing.Spec.Rules {
			if strings.TrimSpace(r.Host) != "" {
				hosts = append(hosts, r.Host)
			}
		}
		var backends []string
		if ing.Spec.DefaultBackend != nil && ing.Spec.DefaultBackend.Service != nil {
			svc := ing.Spec.DefaultBackend.Service.Name
			port := ing.Spec.DefaultBackend.Service.Port.Number
			if port == 0 && ing.Spec.DefaultBackend.Service.Port.Name != "" {
				backends = append(backends, fmt.Sprintf("%s:%s", svc, ing.Spec.DefaultBackend.Service.Port.Name))
			} else {
				backends = append(backends, fmt.Sprintf("%s:%d", svc, port))
			}
		}
		for _, r := range ing.Spec.Rules {
			if r.HTTP == nil {
				continue
			}
			for _, p := range r.HTTP.Paths {
				if p.Backend.Service == nil {
					continue
				}
				svc := p.Backend.Service.Name
				port := p.Backend.Service.Port.Number
				if port == 0 && p.Backend.Service.Port.Name != "" {
					backends = append(backends, fmt.Sprintf("%s:%s", svc, p.Backend.Service.Port.Name))
				} else {
					backends = append(backends, fmt.Sprintf("%s:%d", svc, port))
				}
			}
		}
		class := ""
		if ing.Spec.IngressClassName != nil {
			class = *ing.Spec.IngressClassName
		}
		if class == "" {
			class = ing.Annotations["kubernetes.io/ingress.class"]
		}
		out = append(out, map[string]interface{}{
			"namespace":       ing.Namespace,
			"name":            ing.Name,
			"labels":          k8sLabelsString(ing.Labels),
			"annotationCount": len(ing.Annotations),
			"hosts":           hosts,
			"backends":        backends,
			"class":           class,
			"age":             ing.CreationTimestamp.Time.Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, out)
}

// handleK8sStorageClasses 列出集群 StorageClass（用于应用中心 Redis 等选择卷类型）。
func handleK8sStorageClasses(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	list, err := k8s.StorageV1().StorageClasses().List(ctx, metav1.ListOptions{})
	if err != nil {
		RespondAPIError500(c, "列出 StorageClass 失败: "+err.Error())
		return
	}
	out := make([]gin.H, 0, len(list.Items))
	for i := range list.Items {
		sc := &list.Items[i]
		isDef := sc.Annotations["storageclass.kubernetes.io/is-default-class"] == "true"
		prov := sc.Provisioner
		out = append(out, gin.H{
			"name":        sc.Name,
			"isDefault":   isDef,
			"provisioner": prov,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": out})
}

// k8sLabelsString 将 metadata.labels 格式化为可读字符串（按 key 排序）。
func k8sLabelsString(m map[string]string) string {
	if len(m) == 0 {
		return ""
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%s=%s", k, m[k]))
	}
	return strings.Join(parts, ", ")
}
