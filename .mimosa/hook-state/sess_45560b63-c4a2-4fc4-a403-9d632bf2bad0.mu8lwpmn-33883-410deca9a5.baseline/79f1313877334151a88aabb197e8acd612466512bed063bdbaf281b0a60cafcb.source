package internal

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/discovery/cached/memory"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/restmapper"
)

// LinkedCRPatchResult 同步修改上层 CR（ownerReferences）中单条结果。
type LinkedCRPatchResult struct {
	APIVersion string `json:"apiVersion"`
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	Namespace  string `json:"namespace,omitempty"`
	Clustered  bool   `json:"clustered,omitempty"`
	OK         bool   `json:"ok"`
	Message    string `json:"message,omitempty"`
}

// LinkedHelmResult 可选执行 helm upgrade（需 chart 引用与镜像内 helm）。
type LinkedHelmResult struct {
	Attempted bool   `json:"attempted"`
	OK        bool   `json:"ok,omitempty"`
	Message   string `json:"message,omitempty"`
	Command   string `json:"command,omitempty"`
}

// LinkedSyncResult PATCH Deployment/STS 后关联同步摘要。
type LinkedSyncResult struct {
	CRPatches []LinkedCRPatchResult `json:"crPatches,omitempty"`
	Helm      *LinkedHelmResult     `json:"helm,omitempty"`
}

func helmReleaseFromObjectMeta(objMeta metav1.ObjectMeta) (release, helmNamespace string) {
	if objMeta.Annotations == nil {
		return "", ""
	}
	release = strings.TrimSpace(objMeta.Annotations["meta.helm.sh/release-name"])
	helmNamespace = strings.TrimSpace(objMeta.Annotations["meta.helm.sh/release-namespace"])
	if helmNamespace == "" {
		helmNamespace = objMeta.Namespace
	}
	return release, helmNamespace
}

func skipOwnerRefForCRSync(o metav1.OwnerReference) bool {
	if o.APIVersion == "" || o.Kind == "" || strings.TrimSpace(o.Name) == "" {
		return true
	}
	// 常见内置控制器不会把 Deployment 作为子对象挂在 CR 下又回指 — 保守跳过纯 v1 引用（如 ConfigMap 所有者极少见）
	if o.Kind == "Node" || o.Kind == "Namespace" {
		return true
	}
	return false
}

func newDeferredRESTMapper(cfg *rest.Config) (meta.RESTMapper, error) {
	dc, err := discovery.NewDiscoveryClientForConfig(cfg)
	if err != nil {
		return nil, err
	}
	return restmapper.NewDeferredDiscoveryRESTMapper(memory.NewMemCacheClient(dc)), nil
}

func restMappingForOwner(mapper meta.RESTMapper, o metav1.OwnerReference) (*meta.RESTMapping, error) {
	gv, err := schema.ParseGroupVersion(o.APIVersion)
	if err != nil {
		return nil, err
	}
	gvk := gv.WithKind(o.Kind)
	return mapper.RESTMapping(gvk.GroupKind(), gvk.Version)
}

func patchContainerListInPlace(containers []interface{}, targetName string, body workloadPatchResourcesBody) bool {
	if len(containers) == 0 {
		return false
	}
	conv := runtime.DefaultUnstructuredConverter
	patchedAny := false
	for i := range containers {
		cm, ok := containers[i].(map[string]interface{})
		if !ok {
			continue
		}
		cn, _, _ := unstructured.NestedString(cm, "name")
		if targetName != "" && cn != targetName {
			continue
		}
		if targetName == "" && i > 0 {
			// 未指定容器名时只改第一个工作容器
			continue
		}
		var c corev1.Container
		if err := conv.FromUnstructured(cm, &c); err != nil {
			continue
		}
		if c.Resources.Requests == nil {
			c.Resources.Requests = corev1.ResourceList{}
		}
		if c.Resources.Limits == nil {
			c.Resources.Limits = corev1.ResourceList{}
		}
		mergeResourceStringIntoQuantity(&c.Resources.Requests, corev1.ResourceCPU, body.CpuRequest)
		mergeResourceStringIntoQuantity(&c.Resources.Requests, corev1.ResourceMemory, body.MemoryRequest)
		mergeResourceStringIntoQuantity(&c.Resources.Limits, corev1.ResourceCPU, body.CpuLimit)
		mergeResourceStringIntoQuantity(&c.Resources.Limits, corev1.ResourceMemory, body.MemoryLimit)
		out, err := conv.ToUnstructured(&c)
		if err != nil {
			continue
		}
		containers[i] = out
		patchedAny = true
		if targetName != "" {
			break
		}
		break
	}
	return patchedAny
}

func walkPatchSpecContainers(m map[string]interface{}, targetName string, depth int, body workloadPatchResourcesBody) bool {
	if depth > 24 || m == nil {
		return false
	}
	patched := false
	if arr, ok := m["containers"].([]interface{}); ok {
		if patchContainerListInPlace(arr, targetName, body) {
			patched = true
		}
	}
	for k, v := range m {
		if k == "status" {
			continue
		}
		switch vv := v.(type) {
		case map[string]interface{}:
			if walkPatchSpecContainers(vv, targetName, depth+1, body) {
				patched = true
			}
		case []interface{}:
			for _, it := range vv {
				if mm, ok := it.(map[string]interface{}); ok {
					if walkPatchSpecContainers(mm, targetName, depth+1, body) {
						patched = true
					}
				}
			}
		}
	}
	return patched
}

func patchUnstructuredCRSpecContainers(u *unstructured.Unstructured, targetName string, body workloadPatchResourcesBody) bool {
	spec, ok := u.Object["spec"].(map[string]interface{})
	if !ok || spec == nil {
		return false
	}
	return walkPatchSpecContainers(spec, targetName, 0, body)
}

func syncOwnedCRsForWorkload(
	ctx context.Context,
	k8s *kubernetes.Clientset,
	cfg *rest.Config,
	objMeta metav1.ObjectMeta,
	tpl *corev1.PodTemplateSpec,
	body workloadPatchResourcesBody,
) []LinkedCRPatchResult {
	var out []LinkedCRPatchResult
	if k8s == nil || cfg == nil {
		return out
	}
	targetName := strings.TrimSpace(body.Container)
	if tpl != nil && targetName == "" && len(tpl.Spec.Containers) > 0 {
		targetName = tpl.Spec.Containers[0].Name
	}
	dyn, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return append(out, LinkedCRPatchResult{OK: false, Message: "dynamic client: " + err.Error()})
	}
	mapper, err := newDeferredRESTMapper(cfg)
	if err != nil {
		return append(out, LinkedCRPatchResult{OK: false, Message: "restmapper: " + err.Error()})
	}

	for _, o := range objMeta.OwnerReferences {
		if skipOwnerRefForCRSync(o) {
			continue
		}
		mapping, err := restMappingForOwner(mapper, o)
		if err != nil {
			out = append(out, LinkedCRPatchResult{
				APIVersion: o.APIVersion, Kind: o.Kind, Name: o.Name, Namespace: objMeta.Namespace,
				OK: false, Message: "REST 映射失败: " + err.Error(),
			})
			continue
		}
		gvr := mapping.Resource
		ns := objMeta.Namespace
		var dr dynamic.ResourceInterface
		clustered := mapping.Scope.Name() == meta.RESTScopeNameRoot
		if mapping.Scope.Name() == meta.RESTScopeNameRoot {
			dr = dyn.Resource(gvr)
		} else {
			dr = dyn.Resource(gvr).Namespace(ns)
		}
		u, err := dr.Get(ctx, o.Name, metav1.GetOptions{})
		if err != nil {
			out = append(out, LinkedCRPatchResult{
				APIVersion: o.APIVersion, Kind: o.Kind, Name: o.Name, Namespace: ns, Clustered: clustered,
				OK: false, Message: err.Error(),
			})
			continue
		}
		dup := u.DeepCopy()
		if !patchUnstructuredCRSpecContainers(dup, targetName, body) {
			out = append(out, LinkedCRPatchResult{
				APIVersion: o.APIVersion, Kind: o.Kind, Name: o.Name, Namespace: ns, Clustered: clustered,
				OK: false, Message: "未在 spec 下找到可匹配的 containers（需与目标容器名一致或单容器）",
			})
			continue
		}
		dup.SetManagedFields(nil)
		if _, err := dr.Update(ctx, dup, metav1.UpdateOptions{}); err != nil {
			msg := err.Error()
			if apierrors.IsConflict(err) {
				msg += "（资源版本冲突，请重试）"
			}
			out = append(out, LinkedCRPatchResult{
				APIVersion: o.APIVersion, Kind: o.Kind, Name: o.Name, Namespace: ns, Clustered: clustered,
				OK: false, Message: msg,
			})
			continue
		}
		out = append(out, LinkedCRPatchResult{
			APIVersion: o.APIVersion, Kind: o.Kind, Name: o.Name, Namespace: ns, Clustered: clustered,
			OK: true, Message: "已同步 spec 内 containers 资源",
		})
	}
	return out
}

func helmValuesPrefix(body workloadPatchResourcesBody) string {
	p := strings.TrimSpace(body.HelmResourcesValuesPrefix)
	if p != "" {
		return strings.Trim(p, ".")
	}
	return "resources"
}

func helmSetPairsFromBody(body workloadPatchResourcesBody) []string {
	if strings.TrimSpace(body.HelmChartRef) == "" {
		return nil
	}
	if body.HelmSkipAutoResourceSets {
		return nil
	}
	prefix := helmValuesPrefix(body)
	var pairs []string
	add := func(suffix, val string) {
		val = strings.TrimSpace(val)
		if val == "" {
			return
		}
		pairs = append(pairs, prefix+"."+suffix+"="+val)
	}
	add("requests.cpu", body.CpuRequest)
	add("requests.memory", body.MemoryRequest)
	add("limits.cpu", body.CpuLimit)
	add("limits.memory", body.MemoryLimit)
	return pairs
}

func runHelmUpgradeLinked(ctx context.Context, app *ServerApp, release, helmNS, chartRef string, body workloadPatchResourcesBody) LinkedHelmResult {
	res := LinkedHelmResult{Attempted: true}
	if app == nil {
		res.Message = "app 为空"
		return res
	}
	helmBin, err := resolveHelmBinary()
	if err != nil {
		res.Message = "未找到 helm 可执行文件: " + err.Error()
		return res
	}
	kcfg, cleanup, err := WriteTempKubeconfigForHelm(app)
	if err != nil {
		res.Message = err.Error()
		return res
	}
	defer cleanup()

	ctx2, cancel := context.WithTimeout(ctx, 8*time.Minute)
	defer cancel()

	args := []string{
		"upgrade", release, chartRef,
		"-n", helmNS,
		"--kubeconfig", kcfg,
		"--reuse-values",
		"--wait=false",
	}
	for _, kv := range helmSetPairsFromBody(body) {
		if kv == "" {
			continue
		}
		args = append(args, "--set-string", kv)
	}
	for _, kv := range body.HelmExtraSets {
		kv = strings.TrimSpace(kv)
		if kv == "" || !strings.Contains(kv, "=") {
			continue
		}
		args = append(args, "--set-string", kv)
	}

	cmd := exec.CommandContext(ctx2, helmBin, args...)
	cmd.Env = append([]string{}, osEnvironWithoutHelmKubeconfig()...)
	cmd.Env = append(cmd.Env, "KUBECONFIG="+kcfg)
	res.Command = helmBin + " " + strings.Join(shellQuoteArgs(args), " ")
	out, err := cmd.CombinedOutput()
	if err != nil {
		res.OK = false
		res.Message = fmt.Sprintf("%v; stderr/out=%s", err, strings.TrimSpace(string(out)))
		return res
	}
	res.OK = true
	res.Message = strings.TrimSpace(string(out))
	if res.Message == "" {
		res.Message = "helm upgrade 已执行"
	}
	return res
}

func osEnvironWithoutHelmKubeconfig() []string {
	var env []string
	for _, e := range os.Environ() {
		if strings.HasPrefix(e, "KUBECONFIG=") {
			continue
		}
		env = append(env, e)
	}
	return env
}

func shellQuoteArgs(args []string) []string {
	out := make([]string, len(args))
	for i, a := range args {
		if strings.ContainsAny(a, " \t\"'") {
			out[i] = fmt.Sprintf("%q", a)
		} else {
			out[i] = a
		}
	}
	return out
}

// SyncWorkloadLinkedResources 在工作负载已成功 Update 后：同步 owner CR 中 spec 树下 containers 资源；可选 helm upgrade。
func SyncWorkloadLinkedResources(
	ctx context.Context,
	app *ServerApp,
	objMeta metav1.ObjectMeta,
	tpl *corev1.PodTemplateSpec,
	body workloadPatchResourcesBody,
) *LinkedSyncResult {
	res := &LinkedSyncResult{}
	if app == nil || app.K8s() == nil || app.K8sREST() == nil {
		return res
	}
	res.CRPatches = syncOwnedCRsForWorkload(ctx, app.K8s(), app.K8sREST(), objMeta, tpl, body)

	rel, hns := helmReleaseFromObjectMeta(objMeta)
	if rel != "" && strings.TrimSpace(body.HelmChartRef) != "" {
		h := runHelmUpgradeLinked(ctx, app, rel, hns, strings.TrimSpace(body.HelmChartRef), body)
		res.Helm = &h
	} else if rel != "" {
		res.Helm = &LinkedHelmResult{
			Attempted: false,
			Message: fmt.Sprintf(
				"检测到 Helm release %q（命名空间 %q）；未传 helmChartRef 时跳过 helm upgrade。请在请求体中设置 helmChartRef（如 bitnami/redis 或 oci://…）并可配合 helmExtraSets 指定子 chart 路径。",
				rel, hns,
			),
		}
	}
	return res
}
