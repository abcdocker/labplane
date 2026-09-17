package internal

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	sigyaml "sigs.k8s.io/yaml"
)

var gvrCRD = schema.GroupVersionResource{
	Group:    "apiextensions.k8s.io",
	Version:  "v1",
	Resource: "customresourcedefinitions",
}

const crClusterNamespaceToken = "__cluster__"

func crdStorageVersion(u *unstructured.Unstructured) string {
	versions, _, _ := unstructured.NestedSlice(u.Object, "spec", "versions")
	for _, raw := range versions {
		ver, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		if stor, _ := ver["storage"].(bool); stor {
			if n, ok := ver["name"].(string); ok && n != "" {
				return n
			}
		}
	}
	if len(versions) > 0 {
		if ver, ok := versions[0].(map[string]interface{}); ok {
			if n, ok := ver["name"].(string); ok {
				return n
			}
		}
	}
	return ""
}

func crdEstablished(u *unstructured.Unstructured) bool {
	conds, _, _ := unstructured.NestedSlice(u.Object, "status", "conditions")
	for _, raw := range conds {
		c, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		t, _ := c["type"].(string)
		st, _ := c["status"].(string)
		if t == "Established" && st == "True" {
			return true
		}
	}
	return false
}

func crdToGVR(u *unstructured.Unstructured) (schema.GroupVersionResource, string, error) {
	group, found, err := unstructured.NestedString(u.Object, "spec", "group")
	if err != nil || !found || strings.TrimSpace(group) == "" {
		return schema.GroupVersionResource{}, "", fmt.Errorf("CRD 缺少 spec.group")
	}
	plural, found, err := unstructured.NestedString(u.Object, "spec", "names", "plural")
	if err != nil || !found || strings.TrimSpace(plural) == "" {
		return schema.GroupVersionResource{}, "", fmt.Errorf("CRD 缺少 spec.names.plural")
	}
	ver := crdStorageVersion(u)
	if ver == "" {
		return schema.GroupVersionResource{}, "", fmt.Errorf("CRD 无可用 spec.versions")
	}
	scope, _, _ := unstructured.NestedString(u.Object, "spec", "scope")
	return schema.GroupVersionResource{Group: group, Version: ver, Resource: plural}, strings.TrimSpace(scope), nil
}

func crdKind(u *unstructured.Unstructured) string {
	k, _, _ := unstructured.NestedString(u.Object, "spec", "names", "kind")
	return k
}

func parseListLimit(c *gin.Context, def, max int64) int64 {
	raw := strings.TrimSpace(c.Query("limit"))
	if raw == "" {
		return def
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || n <= 0 {
		return def
	}
	if n > max {
		return max
	}
	return n
}

func unstructuredToYAML(u *unstructured.Unstructured) (string, error) {
	j, err := u.MarshalJSON()
	if err != nil {
		return "", err
	}
	b, err := sigyaml.JSONToYAML(j)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func eventNsForCR(scope, objectNamespace string) string {
	if strings.EqualFold(scope, "Cluster") {
		return metav1.NamespaceDefault
	}
	if strings.TrimSpace(objectNamespace) == "" {
		return metav1.NamespaceDefault
	}
	return objectNamespace
}

func listEventsForObject(ctx context.Context, k8s *kubernetes.Clientset, eventNs, uid string) ([]gin.H, string) {
	if k8s == nil || strings.TrimSpace(uid) == "" {
		return nil, ""
	}
	evList, err := k8s.CoreV1().Events(eventNs).List(ctx, metav1.ListOptions{
		FieldSelector: "involvedObject.uid=" + uid,
	})
	if err != nil {
		return nil, fmt.Sprintf("事件列表失败（可能无 list events 权限）：%v", err)
	}
	out := make([]gin.H, 0, len(evList.Items))
	for _, e := range evList.Items {
		out = append(out, gin.H{
			"type":           e.Type,
			"reason":         e.Reason,
			"message":        e.Message,
			"firstTimestamp": metav1TimeRFC3339(e.FirstTimestamp),
			"lastTimestamp":  metav1TimeRFC3339(e.LastTimestamp),
			"count":          e.Count,
			"involvedKind":   e.InvolvedObject.Kind,
			"involvedName":   e.InvolvedObject.Name,
			"involvedNs":     e.InvolvedObject.Namespace,
			"source":         e.Source.Component,
		})
	}
	return out, ""
}

func metav1TimeRFC3339(t metav1.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func ownerRefsFromObject(obj map[string]interface{}) ([]gin.H, error) {
	raw, found, err := unstructured.NestedSlice(obj, "metadata", "ownerReferences")
	if err != nil || !found {
		return nil, err
	}
	out := make([]gin.H, 0, len(raw))
	for _, r := range raw {
		m, ok := r.(map[string]interface{})
		if !ok {
			continue
		}
		out = append(out, gin.H{
			"apiVersion":         m["apiVersion"],
			"kind":               m["kind"],
			"name":               m["name"],
			"uid":                m["uid"],
			"controller":         m["controller"],
			"blockOwnerDeletion": m["blockOwnerDeletion"],
		})
	}
	return out, nil
}

// GET /api/k8s/crds
func handleK8sCRDList(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) {
	if !GuardK8sREST(c, k8s, rc) {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()
	dyn, err := dynamic.NewForConfig(rc)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	list, err := dyn.Resource(gvrCRD).List(ctx, metav1.ListOptions{})
	if err != nil {
		status := http.StatusInternalServerError
		if se, ok := err.(apierrors.APIStatus); ok && se.Status().Code > 0 {
			status = int(se.Status().Code)
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	items := make([]gin.H, 0, len(list.Items))
	for _, u := range list.Items {
		name := u.GetName()
		group, _, _ := unstructured.NestedString(u.Object, "spec", "group")
		kind := crdKind(&u)
		plural, _, _ := unstructured.NestedString(u.Object, "spec", "names", "plural")
		scope, _, _ := unstructured.NestedString(u.Object, "spec", "scope")
		items = append(items, gin.H{
			"name":            name,
			"group":           group,
			"kind":            kind,
			"plural":          plural,
			"scope":           scope,
			"storageVersion":  crdStorageVersion(&u),
			"createdAt":       metav1TimeRFC3339(u.GetCreationTimestamp()),
			"established":     crdEstablished(&u),
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

// GET /api/k8s/crds/:crdName
func handleK8sCRDGet(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) {
	if !GuardK8sREST(c, k8s, rc) {
		return
	}
	name := strings.TrimSpace(c.Param("crdName"))
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 CRD 名称"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	dyn, err := dynamic.NewForConfig(rc)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	u, err := dyn.Resource(gvrCRD).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		status := http.StatusInternalServerError
		if apierrors.IsNotFound(err) {
			status = http.StatusNotFound
		} else if se, ok := err.(apierrors.APIStatus); ok && se.Status().Code > 0 {
			status = int(se.Status().Code)
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	yamlStr, _ := unstructuredToYAML(u)
	wantYAML := strings.EqualFold(strings.TrimSpace(c.Query("format")), "yaml")
	if wantYAML {
		c.String(http.StatusOK, yamlStr)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"object": u.Object,
		"yaml":   yamlStr,
	})
}

// DELETE /api/k8s/crds/:crdName
func handleK8sCRDDelete(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) {
	if !GuardK8sREST(c, k8s, rc) {
		return
	}
	name := strings.TrimSpace(c.Param("crdName"))
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 CRD 名称"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()
	dyn, err := dynamic.NewForConfig(rc)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	err = dyn.Resource(gvrCRD).Delete(ctx, name, metav1.DeleteOptions{})
	if err != nil {
		status := http.StatusInternalServerError
		if apierrors.IsNotFound(err) {
			status = http.StatusNotFound
		} else if se, ok := err.(apierrors.APIStatus); ok && se.Status().Code > 0 {
			status = int(se.Status().Code)
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GET /api/k8s/crds/:crdName/instances
func handleK8sCustomResourceList(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) {
	if !GuardK8sREST(c, k8s, rc) {
		return
	}
	crdName := strings.TrimSpace(c.Param("crdName"))
	if crdName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 CRD 名称"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()
	dyn, err := dynamic.NewForConfig(rc)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	crdU, err := dyn.Resource(gvrCRD).Get(ctx, crdName, metav1.GetOptions{})
	if err != nil {
		status := http.StatusInternalServerError
		if apierrors.IsNotFound(err) {
			status = http.StatusNotFound
		} else if se, ok := err.(apierrors.APIStatus); ok && se.Status().Code > 0 {
			status = int(se.Status().Code)
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	gvr, scope, err := crdToGVR(crdU)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	limit := parseListLimit(c, 500, 2000)
	opts := metav1.ListOptions{Limit: limit}
	if ct := strings.TrimSpace(c.Query("continue")); ct != "" {
		opts.Continue = ct
	}
	nsQuery := strings.TrimSpace(c.Query("namespace"))
	var list *unstructured.UnstructuredList
	if strings.EqualFold(scope, "Cluster") {
		list, err = dyn.Resource(gvr).List(ctx, opts)
	} else {
		if nsQuery == "" {
			list, err = dyn.Resource(gvr).List(ctx, opts)
		} else {
			list, err = dyn.Resource(gvr).Namespace(nsQuery).List(ctx, opts)
		}
	}
	if err != nil {
		status := http.StatusInternalServerError
		if se, ok := err.(apierrors.APIStatus); ok && se.Status().Code > 0 {
			status = int(se.Status().Code)
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	rows := make([]gin.H, 0, len(list.Items))
	for _, it := range list.Items {
		rows = append(rows, gin.H{
			"name":       it.GetName(),
			"namespace":  it.GetNamespace(),
			"uid":        string(it.GetUID()),
			"createdAt":  metav1TimeRFC3339(it.GetCreationTimestamp()),
			"apiVersion": it.GetAPIVersion(),
			"kind":       it.GetKind(),
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"crdName": crdName,
		"scope":   scope,
		"gvr":     gin.H{"group": gvr.Group, "version": gvr.Version, "resource": gvr.Resource},
		"items":   rows,
		"continue": list.GetContinue(),
	})
}

// GET /api/k8s/crds/:crdName/instances/:namespace/:objName
func handleK8sCustomResourceGet(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) {
	if !GuardK8sREST(c, k8s, rc) {
		return
	}
	crdName := strings.TrimSpace(c.Param("crdName"))
	nsSeg := strings.TrimSpace(c.Param("namespace"))
	objName := strings.TrimSpace(c.Param("objName"))
	if crdName == "" || objName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少参数"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	dyn, err := dynamic.NewForConfig(rc)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	crdU, err := dyn.Resource(gvrCRD).Get(ctx, crdName, metav1.GetOptions{})
	if err != nil {
		status := http.StatusInternalServerError
		if apierrors.IsNotFound(err) {
			status = http.StatusNotFound
		} else if se, ok := err.(apierrors.APIStatus); ok && se.Status().Code > 0 {
			status = int(se.Status().Code)
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	gvr, scope, err := crdToGVR(crdU)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	clusterScoped := strings.EqualFold(scope, "Cluster")
	if clusterScoped {
		nsSeg = ""
	} else if nsSeg == crClusterNamespaceToken {
		c.JSON(http.StatusBadRequest, gin.H{"error": "命名空间级资源不能使用 __cluster__ 命名空间"})
		return
	}
	var u *unstructured.Unstructured
	if clusterScoped {
		u, err = dyn.Resource(gvr).Get(ctx, objName, metav1.GetOptions{})
	} else {
		u, err = dyn.Resource(gvr).Namespace(nsSeg).Get(ctx, objName, metav1.GetOptions{})
	}
	if err != nil {
		status := http.StatusInternalServerError
		if apierrors.IsNotFound(err) {
			status = http.StatusNotFound
		} else if se, ok := err.(apierrors.APIStatus); ok && se.Status().Code > 0 {
			status = int(se.Status().Code)
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	yamlStr, _ := unstructuredToYAML(u)
	owners, _ := ownerRefsFromObject(u.Object)
	uid := string(u.GetUID())
	evNs := eventNsForCR(scope, u.GetNamespace())
	events, evWarn := listEventsForObject(ctx, k8s, evNs, uid)
	warnings := []string{}
	if evWarn != "" {
		warnings = append(warnings, evWarn)
	}
	c.JSON(http.StatusOK, gin.H{
		"crdName":   crdName,
		"scope":     scope,
		"gvr":       gin.H{"group": gvr.Group, "version": gvr.Version, "resource": gvr.Resource},
		"object":    u.Object,
		"yaml":      yamlStr,
		"createdAt": metav1TimeRFC3339(u.GetCreationTimestamp()),
		"related": gin.H{
			"ownerReferences": owners,
			"events":          events,
			"eventsNamespace": evNs,
		},
		"warnings": warnings,
	})
}

// DELETE /api/k8s/crds/:crdName/instances/:namespace/:objName
func handleK8sCustomResourceDelete(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) {
	if !GuardK8sREST(c, k8s, rc) {
		return
	}
	crdName := strings.TrimSpace(c.Param("crdName"))
	nsSeg := strings.TrimSpace(c.Param("namespace"))
	objName := strings.TrimSpace(c.Param("objName"))
	if crdName == "" || objName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少参数"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	dyn, err := dynamic.NewForConfig(rc)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	crdU, err := dyn.Resource(gvrCRD).Get(ctx, crdName, metav1.GetOptions{})
	if err != nil {
		status := http.StatusInternalServerError
		if apierrors.IsNotFound(err) {
			status = http.StatusNotFound
		} else if se, ok := err.(apierrors.APIStatus); ok && se.Status().Code > 0 {
			status = int(se.Status().Code)
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	gvr, scope, err := crdToGVR(crdU)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	clusterScoped := strings.EqualFold(scope, "Cluster")
	if clusterScoped {
		nsSeg = ""
	} else if nsSeg == crClusterNamespaceToken {
		c.JSON(http.StatusBadRequest, gin.H{"error": "命名空间级资源不能使用 __cluster__ 命名空间"})
		return
	}
	if clusterScoped {
		err = dyn.Resource(gvr).Delete(ctx, objName, metav1.DeleteOptions{})
	} else {
		err = dyn.Resource(gvr).Namespace(nsSeg).Delete(ctx, objName, metav1.DeleteOptions{})
	}
	if err != nil {
		status := http.StatusInternalServerError
		if apierrors.IsNotFound(err) {
			status = http.StatusNotFound
		} else if se, ok := err.(apierrors.APIStatus); ok && se.Status().Code > 0 {
			status = int(se.Status().Code)
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func parseUnstructuredBody(c *gin.Context) (*unstructured.Unstructured, error) {
	ct := strings.ToLower(strings.TrimSpace(c.ContentType()))
	raw, err := c.GetRawData()
	if err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		return nil, fmt.Errorf("请求体为空")
	}
	if strings.Contains(ct, "yaml") {
		j, err := sigyaml.YAMLToJSON(raw)
		if err != nil {
			return nil, fmt.Errorf("YAML 解析: %w", err)
		}
		var u unstructured.Unstructured
		if err := u.UnmarshalJSON(j); err != nil {
			return nil, err
		}
		return &u, nil
	}
	var u unstructured.Unstructured
	if err := u.UnmarshalJSON(raw); err != nil {
		return nil, err
	}
	return &u, nil
}

// POST /api/k8s/crds/:crdName/instances
func handleK8sCustomResourceCreate(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) {
	if !GuardK8sREST(c, k8s, rc) {
		return
	}
	crdName := strings.TrimSpace(c.Param("crdName"))
	if crdName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 CRD 名称"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	dyn, err := dynamic.NewForConfig(rc)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	crdU, err := dyn.Resource(gvrCRD).Get(ctx, crdName, metav1.GetOptions{})
	if err != nil {
		status := http.StatusInternalServerError
		if apierrors.IsNotFound(err) {
			status = http.StatusNotFound
		} else if se, ok := err.(apierrors.APIStatus); ok && se.Status().Code > 0 {
			status = int(se.Status().Code)
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	gvr, scope, err := crdToGVR(crdU)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	obj, err := parseUnstructuredBody(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	clusterScoped := strings.EqualFold(scope, "Cluster")
	if clusterScoped {
		out, err := dyn.Resource(gvr).Create(ctx, obj, metav1.CreateOptions{})
		if err != nil {
			c.JSON(apiStatusOr500(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"object": out.Object})
		return
	}
	ns := strings.TrimSpace(obj.GetNamespace())
	if ns == "" {
		ns = strings.TrimSpace(c.Query("namespace"))
	}
	if ns == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "命名空间级资源须指定 metadata.namespace 或 ?namespace="})
		return
	}
	obj.SetNamespace(ns)
	out, err := dyn.Resource(gvr).Namespace(ns).Create(ctx, obj, metav1.CreateOptions{})
	if err != nil {
		c.JSON(apiStatusOr500(err), gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"object": out.Object})
}

// PUT /api/k8s/crds/:crdName/instances/:namespace/:objName
func handleK8sCustomResourceUpdate(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) {
	if !GuardK8sREST(c, k8s, rc) {
		return
	}
	crdName := strings.TrimSpace(c.Param("crdName"))
	nsSeg := strings.TrimSpace(c.Param("namespace"))
	objName := strings.TrimSpace(c.Param("objName"))
	if crdName == "" || objName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少参数"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	dyn, err := dynamic.NewForConfig(rc)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	crdU, err := dyn.Resource(gvrCRD).Get(ctx, crdName, metav1.GetOptions{})
	if err != nil {
		c.JSON(apiStatusOr500(err), gin.H{"error": err.Error()})
		return
	}
	gvr, scope, err := crdToGVR(crdU)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	obj, err := parseUnstructuredBody(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	clusterScoped := strings.EqualFold(scope, "Cluster")
	if clusterScoped {
		nsSeg = ""
	} else if nsSeg == crClusterNamespaceToken {
		c.JSON(http.StatusBadRequest, gin.H{"error": "命名空间级资源不能使用 __cluster__ 命名空间"})
		return
	}
	if !clusterScoped {
		obj.SetNamespace(nsSeg)
	}
	if n := obj.GetName(); n != "" && n != objName {
		c.JSON(http.StatusBadRequest, gin.H{"error": "metadata.name 与路径中的资源名不一致"})
		return
	}
	obj.SetName(objName)
	var out *unstructured.Unstructured
	if clusterScoped {
		out, err = dyn.Resource(gvr).Update(ctx, obj, metav1.UpdateOptions{})
	} else {
		out, err = dyn.Resource(gvr).Namespace(nsSeg).Update(ctx, obj, metav1.UpdateOptions{})
	}
	if err != nil {
		c.JSON(apiStatusOr500(err), gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"object": out.Object})
}

func apiStatusOr500(err error) int {
	if apierrors.IsNotFound(err) {
		return http.StatusNotFound
	}
	if apierrors.IsConflict(err) {
		return http.StatusConflict
	}
	if apierrors.IsInvalid(err) {
		return http.StatusUnprocessableEntity
	}
	if se, ok := err.(apierrors.APIStatus); ok && se.Status().Code > 0 {
		return int(se.Status().Code)
	}
	return http.StatusInternalServerError
}
