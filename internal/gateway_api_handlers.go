package internal

// Gateway API（gateway.networking.k8s.io）路由管理后端：
// 通过 dynamic client 提供 GatewayClass/Gateway/HTTPRoute/GRPCRoute 的
// 列表 / 原始 YAML / Apply（创建或更新）/ 删除。不引入 sigs.k8s.io/gateway-api
// 依赖，兼容集群已安装的 v1 与 v1alpha2（gateway-api < v1.1）CRD 版本——
// 优先 v1，命中 404 时自动回退 v1alpha2。
// Ingress 侧的列表/Apply/删除沿用既有 /api/ingress* 端点，本文件补充 IngressClass 列表。

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	errors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"github.com/gin-gonic/gin"
	"sigs.k8s.io/yaml"
)

const gwapiGroup = "gateway.networking.k8s.io"

type gwapiResourceDef struct {
	Kind       string
	Resource   string
	Namespaced bool
}

var gwapiResources = map[string]gwapiResourceDef{
	"gatewayclasses": {Kind: "GatewayClass", Resource: "gatewayclasses", Namespaced: false},
	"gateways":       {Kind: "Gateway", Resource: "gateways", Namespaced: true},
	"httproutes":     {Kind: "HTTPRoute", Resource: "httproutes", Namespaced: true},
	"grpcroutes":     {Kind: "GRPCRoute", Resource: "grpcroutes", Namespaced: true},
}

// gwapiVersionFor 探测集群可用的 CRD 版本：优先 v1；v1 不存在（NotFound）时实际探测
// v1alpha2，两者都不存在则返回错误（上层据此报告"未安装 Gateway API"）。
// 注意不能把 v1 的 NotFound 直接当作"v1alpha2 可用"——CRD 完全未安装时同样返回 NotFound。
func gwapiVersionFor(dyn dynamic.Interface, def gwapiResourceDef) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	gvr := func(version string) schema.GroupVersionResource {
		return schema.GroupVersionResource{Group: gwapiGroup, Version: version, Resource: def.Resource}
	}
	_, err := dyn.Resource(gvr("v1")).List(ctx, metav1.ListOptions{Limit: 1})
	if err == nil {
		return "v1", nil
	}
	if !errors.IsNotFound(err) {
		return "", err
	}
	if _, err2 := dyn.Resource(gvr("v1alpha2")).List(ctx, metav1.ListOptions{Limit: 1}); err2 == nil {
		return "v1alpha2", nil
	} else if !errors.IsNotFound(err2) {
		return "", err2
	}
	return "", errors.NewNotFound(schema.GroupResource{Group: gwapiGroup, Resource: def.Resource}, "")
}

func gwapiRI(dyn dynamic.Interface, def gwapiResourceDef, version, namespace string) dynamic.ResourceInterface {
	ri := dyn.Resource(schema.GroupVersionResource{Group: gwapiGroup, Version: version, Resource: def.Resource})
	if def.Namespaced {
		return ri.Namespace(namespace)
	}
	return ri
}

// gwapiSummary 提取前端列表所需的精简字段。
func gwapiSummary(u unstructured.Unstructured, def gwapiResourceDef) gin.H {
	item := gin.H{
		"type":        strings.ToLower(def.Resource) + "s",
		"kind":        def.Kind,
		"namespace":   u.GetNamespace(),
		"name":        u.GetName(),
		"createdAt":   metav1TimeRFC3339(u.GetCreationTimestamp()),
		"labels":      len(u.GetLabels()),
		"annotations": len(u.GetAnnotations()),
	}
	conds, _, _ := unstructured.NestedSlice(u.Object, "status", "conditions")
	for _, rc := range conds {
		m, ok := rc.(map[string]any)
		if !ok {
			continue
		}
		typ, _ := m["type"].(string)
		status, _ := m["status"].(string)
		reason, _ := m["reason"].(string)
		item["condition"] = gin.H{"type": typ, "status": status, "reason": reason}
		break
	}
	switch def.Kind {
	case "GatewayClass":
		controller, _, _ := unstructured.NestedString(u.Object, "spec", "controllerName")
		item["controller"] = controller
		if desc, _, _ := unstructured.NestedString(u.Object, "spec", "description"); desc != "" {
			item["description"] = desc
		}
	case "Gateway":
		className, _, _ := unstructured.NestedString(u.Object, "spec", "gatewayClassName")
		item["class"] = className
		addrs, _, _ := unstructured.NestedSlice(u.Object, "status", "addresses")
		ips := make([]string, 0, len(addrs))
		for _, a := range addrs {
			if m, ok := a.(map[string]any); ok {
				if v, _ := m["value"].(string); v != "" {
					ips = append(ips, v)
				}
			}
		}
		item["addresses"] = ips
		if listeners, found, _ := unstructured.NestedSlice(u.Object, "spec", "listeners"); found {
			item["listeners"] = len(listeners)
		}
	case "HTTPRoute", "GRPCRoute":
		hostnames, _, _ := unstructured.NestedStringSlice(u.Object, "spec", "hostnames")
		item["hostnames"] = hostnames
		parents, _, _ := unstructured.NestedSlice(u.Object, "spec", "parentRefs")
		pnames := make([]string, 0, len(parents))
		for _, p := range parents {
			if m, ok := p.(map[string]any); ok {
				if n, _ := m["name"].(string); n != "" {
					pnames = append(pnames, n)
				}
			}
		}
		item["parents"] = pnames
	}
	return item
}

// gwapiErrorOutput 统一把 dynamic client 错误转 HTTP 响应。
func gwapiErrorOutput(c *gin.Context, action string, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.IsNotFound(err):
		status = http.StatusNotFound
	case errors.IsForbidden(err):
		status = http.StatusForbidden
	case errors.IsAlreadyExists(err):
		status = http.StatusConflict
	default:
		if se, ok := err.(errors.APIStatus); ok && se.Status().Code > 0 {
			status = int(se.Status().Code)
		}
	}
	c.JSON(status, gin.H{"error": action + "失败: " + err.Error()})
}

// GET /api/k8s/gwapi/status — 集群是否安装了 Gateway API CRD 及可用版本。
func handleK8sGatewayAPIStatus(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) {
	if !GuardK8sREST(c, k8s, rc) {
		return
	}
	dyn, err := dynamic.NewForConfig(rc)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	version, err := gwapiVersionFor(dyn, gwapiResources["gateways"])
	if err != nil {
		// CRD 未安装时 API server 通常返回 NotFound；其余错误原样上报
		if errors.IsNotFound(err) {
			c.JSON(http.StatusOK, gin.H{"available": false, "version": ""})
			return
		}
		c.JSON(http.StatusOK, gin.H{"available": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"available": true, "version": version})
}

// GET /api/k8s/gwapi/list?type=gateways|httproutes|grpcroutes|gatewayclasses&namespace=
func handleK8sGatewayAPIList(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) {
	if !GuardK8sREST(c, k8s, rc) {
		return
	}
	typeName := strings.TrimSpace(c.Query("type"))
	def, ok := gwapiResources[typeName]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type 无效，支持 gatewayclasses/gateways/httproutes/grpcroutes"})
		return
	}
	dyn, err := dynamic.NewForConfig(rc)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	version, err := gwapiVersionFor(dyn, def)
	if err != nil {
		gwapiErrorOutput(c, "探测 Gateway API 版本", err)
		return
	}
	ns := strings.TrimSpace(c.Query("namespace"))
	if ns == "*" {
		ns = ""
	}
	ri := gwapiRI(dyn, def, version, ns)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	list, err := ri.List(ctx, metav1.ListOptions{})
	if err != nil {
		gwapiErrorOutput(c, "查询 "+def.Kind, err)
		return
	}
	items := make([]gin.H, 0, len(list.Items))
	for _, u := range list.Items {
		items = append(items, gwapiSummary(u, def))
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "kind": def.Kind, "version": version})
}

// GET /api/k8s/gwapi/yaml?type=&namespace=&name=&format=yaml|json
func handleK8sGatewayAPIYAML(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) {
	if !GuardK8sREST(c, k8s, rc) {
		return
	}
	def, name, err := gwapiDefFromQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	dyn, err := dynamic.NewForConfig(rc)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	version, err := gwapiVersionFor(dyn, def)
	if err != nil {
		gwapiErrorOutput(c, "探测 Gateway API 版本", err)
		return
	}
	ri := gwapiRI(dyn, def, version, strings.TrimSpace(c.Query("namespace")))
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	u, err := ri.Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		gwapiErrorOutput(c, "获取 "+def.Kind, err)
		return
	}
	yamlStr, yerr := unstructuredToYAML(u)
	if yerr != nil {
		RespondAPIError500(c, "序列化 YAML 失败: "+yerr.Error())
		return
	}
	if strings.EqualFold(c.Query("format"), "json") {
		c.JSON(http.StatusOK, gin.H{"yaml": yamlStr, "object": u.Object})
		return
	}
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(yamlStr))
}

func gwapiDefFromQuery(c *gin.Context) (gwapiResourceDef, string, error) {
	typeName := strings.TrimSpace(c.Query("type"))
	def, ok := gwapiResources[typeName]
	if !ok {
		return gwapiResourceDef{}, "", fmt.Errorf("type 无效，支持 gatewayclasses/gateways/httproutes/grpcroutes")
	}
	name := strings.TrimSpace(c.Query("name"))
	if name == "" {
		return gwapiResourceDef{}, "", fmt.Errorf("缺少 name")
	}
	if def.Namespaced && strings.TrimSpace(c.Query("namespace")) == "" {
		return gwapiResourceDef{}, "", fmt.Errorf("该资源为命名空间级，缺少 namespace")
	}
	return def, name, nil
}

// POST /api/k8s/gwapi/apply — body {yaml, defaultNamespace?}，多文档支持；仅接受 Gateway API 四类 kind。
func handleK8sGatewayAPIApply(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) {
	if !GuardK8sREST(c, k8s, rc) {
		return
	}
	var body struct {
		YAML             string `json:"yaml"`
		DefaultNamespace string `json:"defaultNamespace"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.YAML) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效：需要 yaml"})
		return
	}
	dyn, err := dynamic.NewForConfig(rc)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	docs := splitYAMLDocuments(body.YAML)
	if len(docs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未解析到有效的 YAML 文档"})
		return
	}
	results := make([]gin.H, 0, len(docs))
	for _, doc := range docs {
		var m map[string]any
		if err := yaml.Unmarshal([]byte(doc), &m); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "YAML 解析失败: " + err.Error()})
			return
		}
		u := unstructured.Unstructured{Object: m}
		kind := strings.TrimSpace(u.GetKind())
		apiVersion := strings.TrimSpace(u.GetAPIVersion())
		def, ok := gwapiResources[strings.ToLower(kind)+"s"]
		if !ok || apiVersion != gwapiGroup+"/v1" && apiVersion != gwapiGroup+"/v1alpha2" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("仅支持 Gateway API 资源（gatewayclasses/gateways/httproutes/grpcroutes），遇到 kind=%s apiVersion=%s", kind, apiVersion),
			})
			return
		}
		version, verr := gwapiVersionFor(dyn, def)
		if verr != nil {
			gwapiErrorOutput(c, "探测 Gateway API 版本", verr)
			return
		}
		ns := u.GetNamespace()
		if def.Namespaced {
			if ns == "" {
				ns = strings.TrimSpace(body.DefaultNamespace)
			}
			if ns == "" {
				ns = "default"
			}
			u.SetNamespace(ns)
		} else {
			u.SetNamespace("")
		}
		ri := gwapiRI(dyn, def, version, ns)
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		existing, gerr := ri.Get(ctx, u.GetName(), metav1.GetOptions{})
		if gerr != nil && !errors.IsNotFound(gerr) {
			cancel()
			gwapiErrorOutput(c, "查询 "+def.Kind, gerr)
			return
		}
		var action string
		if errors.IsNotFound(gerr) {
			_, aerr := ri.Create(ctx, &u, metav1.CreateOptions{})
			action = "created"
			if aerr != nil {
				cancel()
				gwapiErrorOutput(c, "创建 "+def.Kind, aerr)
				return
			}
		} else {
			u.SetResourceVersion(existing.GetResourceVersion())
			_, aerr := ri.Update(ctx, &u, metav1.UpdateOptions{})
			action = "updated"
			if aerr != nil {
				cancel()
				gwapiErrorOutput(c, "更新 "+def.Kind, aerr)
				return
			}
		}
		cancel()
		ref := u.GetName()
		if def.Namespaced {
			ref = ns + "/" + ref
		}
		results = append(results, gin.H{"kind": def.Kind, "name": ref, "action": action})
	}
	SetAuditDetail(c, "已应用 Gateway API YAML 共 "+fmt.Sprintf("%d", len(results))+" 段")
	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("已应用 %d 段 Gateway API YAML", len(results)), "results": results})
}

// DELETE /api/k8s/gwapi/resource/:type/:namespace/:name — gatewayclasses 忽略 namespace 段。
func handleK8sGatewayAPIDelete(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) {
	if !GuardK8sREST(c, k8s, rc) {
		return
	}
	typeName := strings.TrimSpace(c.Param("type"))
	def, ok := gwapiResources[typeName]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type 无效"})
		return
	}
	name := strings.TrimSpace(c.Param("name"))
	ns := strings.TrimSpace(c.Param("namespace"))
	if def.Namespaced && ns == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 namespace"})
		return
	}
	dyn, err := dynamic.NewForConfig(rc)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	version, verr := gwapiVersionFor(dyn, def)
	if verr != nil {
		gwapiErrorOutput(c, "探测 Gateway API 版本", verr)
		return
	}
	ri := gwapiRI(dyn, def, version, ns)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	if err := ri.Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		gwapiErrorOutput(c, "删除 "+def.Kind, err)
		return
	}
	ref := name
	if def.Namespaced {
		ref = ns + "/" + name
	}
	SetAuditDetail(c, "删除 "+def.Kind+" "+ref)
	c.JSON(http.StatusOK, gin.H{"message": "已删除 " + def.Kind + " " + ref})
}

// GET /api/k8s/ingressclasses — 路由管理面板 Ingress 页签的控制器下拉/列表。
func handleK8sIngressClasses(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	list, err := k8s.NetworkingV1().IngressClasses().List(ctx, metav1.ListOptions{})
	if err != nil {
		gwapiErrorOutput(c, "查询 IngressClass", err)
		return
	}
	items := make([]gin.H, 0, len(list.Items))
	for _, ic := range list.Items {
		items = append(items, gin.H{
			"name":       ic.Name,
			"controller": ic.Spec.Controller,
			"default":    ic.Annotations["ingressclass.kubernetes.io/is-default-class"] == "true",
			"createdAt":  metav1TimeRFC3339(ic.CreationTimestamp),
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}
