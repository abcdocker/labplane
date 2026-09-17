package internal

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// GET /api/k8s/object-json?kind=Deployment&namespace=&name=
func handleK8sGetObjectJSON(c *gin.Context, k8s *kubernetes.Clientset) {
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
	var (
		obj interface{}
		err error
	)
	switch kind {
	case "Deployment":
		var o *appsv1.Deployment
		o, err = k8s.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
		if err == nil {
			o.ManagedFields = nil
			obj = o
		}
	case "StatefulSet":
		var o *appsv1.StatefulSet
		o, err = k8s.AppsV1().StatefulSets(ns).Get(ctx, name, metav1.GetOptions{})
		if err == nil {
			o.ManagedFields = nil
			obj = o
		}
	case "DaemonSet":
		var o *appsv1.DaemonSet
		o, err = k8s.AppsV1().DaemonSets(ns).Get(ctx, name, metav1.GetOptions{})
		if err == nil {
			o.ManagedFields = nil
			obj = o
		}
	case "Service":
		var o *corev1.Service
		o, err = k8s.CoreV1().Services(ns).Get(ctx, name, metav1.GetOptions{})
		if err == nil {
			o.ManagedFields = nil
			obj = o
		}
	case "Ingress":
		var o *networkingv1.Ingress
		o, err = k8s.NetworkingV1().Ingresses(ns).Get(ctx, name, metav1.GetOptions{})
		if err == nil {
			o.ManagedFields = nil
			obj = o
		}
	case "ConfigMap":
		var o *corev1.ConfigMap
		o, err = k8s.CoreV1().ConfigMaps(ns).Get(ctx, name, metav1.GetOptions{})
		if err == nil {
			o.ManagedFields = nil
			obj = o
		}
	case "Secret":
		var o *corev1.Secret
		o, err = k8s.CoreV1().Secrets(ns).Get(ctx, name, metav1.GetOptions{})
		if err == nil {
			o.ManagedFields = nil
			obj = o
		}
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
	c.JSON(http.StatusOK, gin.H{"object": obj})
}

type putK8sObjectBody struct {
	Kind   string          `json:"kind"`
	Object json.RawMessage `json:"object"`
	// SkipWorkloadSchedulingCheck 为 true 时跳过 Deployment/StatefulSet 保存前的调度余量预检（应急用）。
	SkipWorkloadSchedulingCheck bool `json:"skipWorkloadSchedulingCheck"`
}

func k8sAppendRevisionAfterObjectJSONPut(app *ServerApp, c *gin.Context, kind string, body putK8sObjectBody) {
	var meta struct {
		Metadata struct {
			Namespace string `json:"namespace"`
			Name      string `json:"name"`
		} `json:"metadata"`
	}
	_ = json.Unmarshal(body.Object, &meta)
	ns := strings.TrimSpace(meta.Metadata.Namespace)
	name := strings.TrimSpace(meta.Metadata.Name)
	if ns == "" || name == "" {
		return
	}
	ctx := context.TODO()
	b, err := k8sGetObjectYAMLBytes(ctx, app.K8s(), kind, ns, name)
	if err != nil {
		return
	}
	_ = k8sObjectRevisionAppend(app, kind, ns, name, dashboardUsernameFromGin(c), "object-json", string(b))
}

// PUT /api/k8s/object-json  body: { kind, object } — 与 GET 结构一致，用于图形化编辑后写回
func handleK8sPutObjectJSON(c *gin.Context, app *ServerApp) {
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	var body putK8sObjectBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数解析失败: " + err.Error()})
		return
	}
	kind := strings.TrimSpace(body.Kind)
	if kind == "" || len(body.Object) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要 kind 与 object"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()
	var err error
	switch kind {
	case "Deployment":
		var o appsv1.Deployment
		if e := json.Unmarshal(body.Object, &o); e != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object 非合法 Deployment JSON: " + e.Error()})
			return
		}
		if o.Name == "" || o.Namespace == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object.metadata.name/namespace 必填"})
			return
		}
		var ex *appsv1.Deployment
		ex, err = k8s.AppsV1().Deployments(o.Namespace).Get(ctx, o.Name, metav1.GetOptions{})
		if err != nil {
			break
		}
		o.ResourceVersion = ex.ResourceVersion
		if !body.SkipWorkloadSchedulingCheck {
			pre, perr := PrecheckDeploymentScheduling(ctx, k8s, &o)
			if perr != nil {
				RespondAPIError500(c, perr.Error())
				return
			}
			if !pre.OK {
				c.JSON(http.StatusUnprocessableEntity, gin.H{"error": pre.Message, "check": pre})
				return
			}
		}
		_, err = k8s.AppsV1().Deployments(o.Namespace).Update(ctx, &o, metav1.UpdateOptions{})
	case "StatefulSet":
		var o appsv1.StatefulSet
		if e := json.Unmarshal(body.Object, &o); e != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object 非合法 StatefulSet JSON: " + e.Error()})
			return
		}
		if o.Name == "" || o.Namespace == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object.metadata.name/namespace 必填"})
			return
		}
		var ex *appsv1.StatefulSet
		ex, err = k8s.AppsV1().StatefulSets(o.Namespace).Get(ctx, o.Name, metav1.GetOptions{})
		if err != nil {
			break
		}
		o.ResourceVersion = ex.ResourceVersion
		if !body.SkipWorkloadSchedulingCheck {
			pre, perr := PrecheckStatefulSetScheduling(ctx, k8s, &o)
			if perr != nil {
				RespondAPIError500(c, perr.Error())
				return
			}
			if !pre.OK {
				c.JSON(http.StatusUnprocessableEntity, gin.H{"error": pre.Message, "check": pre})
				return
			}
		}
		_, err = k8s.AppsV1().StatefulSets(o.Namespace).Update(ctx, &o, metav1.UpdateOptions{})
	case "DaemonSet":
		var o appsv1.DaemonSet
		if e := json.Unmarshal(body.Object, &o); e != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object 非合法 DaemonSet JSON: " + e.Error()})
			return
		}
		if o.Name == "" || o.Namespace == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object.metadata.name/namespace 必填"})
			return
		}
		var ex *appsv1.DaemonSet
		ex, err = k8s.AppsV1().DaemonSets(o.Namespace).Get(ctx, o.Name, metav1.GetOptions{})
		if err != nil {
			break
		}
		o.ResourceVersion = ex.ResourceVersion
		_, err = k8s.AppsV1().DaemonSets(o.Namespace).Update(ctx, &o, metav1.UpdateOptions{})
	case "Service":
		var o corev1.Service
		if e := json.Unmarshal(body.Object, &o); e != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object 非合法 Service JSON: " + e.Error()})
			return
		}
		if o.Name == "" || o.Namespace == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object.metadata.name/namespace 必填"})
			return
		}
		var ex *corev1.Service
		ex, err = k8s.CoreV1().Services(o.Namespace).Get(ctx, o.Name, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				o.ResourceVersion = ""
				o.UID = ""
				_, err = k8s.CoreV1().Services(o.Namespace).Create(ctx, &o, metav1.CreateOptions{})
				if err == nil {
					SetAuditDetail(c, "已创建 Service "+o.Namespace+"/"+o.Name)
					k8sAppendRevisionAfterObjectJSONPut(app, c, kind, body)
					c.JSON(http.StatusOK, gin.H{"message": "已创建"})
					return
				}
			}
			break
		}
		o.ResourceVersion = ex.ResourceVersion
		_, err = k8s.CoreV1().Services(o.Namespace).Update(ctx, &o, metav1.UpdateOptions{})
	case "ConfigMap":
		var o corev1.ConfigMap
		if e := json.Unmarshal(body.Object, &o); e != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object 非合法 ConfigMap JSON: " + e.Error()})
			return
		}
		if o.Name == "" || o.Namespace == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object.metadata.name/namespace 必填"})
			return
		}
		var ex *corev1.ConfigMap
		ex, err = k8s.CoreV1().ConfigMaps(o.Namespace).Get(ctx, o.Name, metav1.GetOptions{})
		if err != nil {
			break
		}
		o.ResourceVersion = ex.ResourceVersion
		_, err = k8s.CoreV1().ConfigMaps(o.Namespace).Update(ctx, &o, metav1.UpdateOptions{})
	case "Secret":
		var o corev1.Secret
		if e := json.Unmarshal(body.Object, &o); e != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object 非合法 Secret JSON: " + e.Error()})
			return
		}
		if o.Name == "" || o.Namespace == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "object.metadata.name/namespace 必填"})
			return
		}
		var ex *corev1.Secret
		ex, err = k8s.CoreV1().Secrets(o.Namespace).Get(ctx, o.Name, metav1.GetOptions{})
		if err != nil {
			break
		}
		o.ResourceVersion = ex.ResourceVersion
		_, err = k8s.CoreV1().Secrets(o.Namespace).Update(ctx, &o, metav1.UpdateOptions{})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的 kind: " + kind})
		return
	}
	if err != nil {
		if apierrors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "资源不存在或已变更"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	k8sAppendRevisionAfterObjectJSONPut(app, c, kind, body)
	SetAuditDetail(c, "已更新资源 JSON "+kind+" "+auditNsName(body.Object))
	c.JSON(http.StatusOK, gin.H{"message": "已保存"})
}

func auditNsName(raw json.RawMessage) string {
	var meta struct {
		Metadata struct {
			Namespace string `json:"namespace"`
			Name      string `json:"name"`
		} `json:"metadata"`
	}
	_ = json.Unmarshal(raw, &meta)
	return meta.Metadata.Namespace + "/" + meta.Metadata.Name
}

// SecretDataItem represents one key/value entry in a Secret.
type SecretDataItem struct {
	Key     string  `json:"key"`
	Encoded *string `json:"encoded"` // Base64-encoded value from data; null for stringData keys
	Decoded string  `json:"decoded"` // plaintext
	Source  string  `json:"source"`  // "data" or "stringData"
}

// GET /api/k8s/secret-data?namespace=&name=
func handleK8sGetSecretData(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ns := strings.TrimSpace(c.Query("namespace"))
	name := strings.TrimSpace(c.Query("name"))
	if ns == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要 query: namespace, name"})
		return
	}
	ctx := context.TODO()
	o, err := k8s.CoreV1().Secrets(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "资源不存在"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	items := make([]SecretDataItem, 0, len(o.Data)+len(o.StringData))
	for k, v := range o.Data {
		enc := base64.StdEncoding.EncodeToString(v)
		items = append(items, SecretDataItem{
			Key:     k,
			Encoded: &enc,
			Decoded: string(v),
			Source:  "data",
		})
	}
	for k, v := range o.StringData {
		items = append(items, SecretDataItem{
			Key:     k,
			Encoded: nil,
			Decoded: v,
			Source:  "stringData",
		})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Key < items[j].Key })
	c.JSON(http.StatusOK, gin.H{
		"type":  string(o.Type),
		"items": items,
	})
}
