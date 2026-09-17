package internal

import (
	"context"
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// k8sServicePortRow 与控制台 Service 列表端口列一致，便于工作负载详情对照 targetPort。
type k8sServicePortRow struct {
	Name       string `json:"name,omitempty"`
	Port       int32  `json:"port"`
	TargetPort string `json:"targetPort"`
	Protocol   string `json:"protocol"`
	NodePort   int32  `json:"nodePort,omitempty"`
}

// k8sServicePortSummary 与 Pod 模板 labels 匹配的单个 Service 及其端口。
type k8sServicePortSummary struct {
	ServiceName string              `json:"serviceName"`
	ServiceType string              `json:"serviceType"`
	ClusterIP   string              `json:"clusterIP,omitempty"`
	Ports       []k8sServicePortRow `json:"ports"`
}

// k8sResourceRelationsResponse 控制台资源互链（同命名空间内推断）。
type k8sResourceRelationsResponse struct {
	Services               []string                `json:"services"`
	Ingresses              []string                `json:"ingresses"`
	Deployments            []string                `json:"deployments"`
	StatefulSets           []string                `json:"statefulSets"`
	DaemonSets             []string                `json:"daemonSets"`
	Pods                   []string                `json:"pods"`
	ConfigMaps             []string                `json:"configMaps"`
	Secrets                []string                `json:"secrets"`
	MatchingServicePorts   []k8sServicePortSummary `json:"matchingServicePorts,omitempty"`
}

func servicePortSummaryFrom(s *corev1.Service) k8sServicePortSummary {
	sum := k8sServicePortSummary{
		ServiceName: s.Name,
		ServiceType: string(s.Spec.Type),
		ClusterIP:   s.Spec.ClusterIP,
	}
	for _, p := range s.Spec.Ports {
		proto := string(p.Protocol)
		if proto == "" {
			proto = "TCP"
		}
		row := k8sServicePortRow{
			Name:       p.Name,
			Port:       p.Port,
			TargetPort: p.TargetPort.String(),
			Protocol:   proto,
		}
		if p.NodePort > 0 {
			row.NodePort = p.NodePort
		}
		sum.Ports = append(sum.Ports, row)
	}
	return sum
}

// listMatchingServicesForPodTemplateLabels 找出 selector 与 Pod 模板 labels 匹配的 Service，并带上端口映射。
func listMatchingServicesForPodTemplateLabels(ctx context.Context, k8s *kubernetes.Clientset, ns string, tplLabels map[string]string) ([]string, map[string]struct{}, []k8sServicePortSummary, error) {
	svcs, err := k8s.CoreV1().Services(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, nil, nil, err
	}
	svcNameSet := make(map[string]struct{})
	var names []string
	var summaries []k8sServicePortSummary
	for i := range svcs.Items {
		s := &svcs.Items[i]
		if !labelsMatchSelector(tplLabels, s.Spec.Selector) {
			continue
		}
		svcNameSet[s.Name] = struct{}{}
		names = append(names, s.Name)
		summaries = append(summaries, servicePortSummaryFrom(s))
	}
	outNames := dedupeSorted(names)
	sort.Slice(summaries, func(i, j int) bool {
		return summaries[i].ServiceName < summaries[j].ServiceName
	})
	return outNames, svcNameSet, summaries, nil
}

func labelsMatchSelector(labels map[string]string, sel map[string]string) bool {
	if len(sel) == 0 {
		return false
	}
	for k, v := range sel {
		if labels[k] != v {
			return false
		}
	}
	return true
}

func dedupeSorted(in []string) []string {
	seen := make(map[string]struct{})
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}

func ingressBackendServiceNames(ing *networkingv1.Ingress) []string {
	var names []string
	if ing.Spec.DefaultBackend != nil && ing.Spec.DefaultBackend.Service != nil {
		n := strings.TrimSpace(ing.Spec.DefaultBackend.Service.Name)
		if n != "" {
			names = append(names, n)
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
			n := strings.TrimSpace(p.Backend.Service.Name)
			if n != "" {
				names = append(names, n)
			}
		}
	}
	return dedupeSorted(names)
}

func volumeRefsFromPodSpec(spec *corev1.PodSpec) (cms, secs []string) {
	cmSet := map[string]struct{}{}
	secSet := map[string]struct{}{}
	addCM := func(n string) {
		n = strings.TrimSpace(n)
		if n != "" {
			cmSet[n] = struct{}{}
		}
	}
	addSec := func(n string) {
		n = strings.TrimSpace(n)
		if n != "" {
			secSet[n] = struct{}{}
		}
	}
	for _, v := range spec.Volumes {
		if v.ConfigMap != nil {
			addCM(v.ConfigMap.Name)
		}
		if v.Secret != nil {
			addSec(v.Secret.SecretName)
		}
		if v.Projected != nil {
			for _, src := range v.Projected.Sources {
				if src.ConfigMap != nil {
					addCM(src.ConfigMap.Name)
				}
				if src.Secret != nil {
					addSec(src.Secret.Name)
				}
			}
		}
	}
	scanContainers := func(containers []corev1.Container) {
		for _, c := range containers {
			for _, e := range c.EnvFrom {
				if e.ConfigMapRef != nil {
					addCM(e.ConfigMapRef.Name)
				}
				if e.SecretRef != nil {
					addSec(e.SecretRef.Name)
				}
			}
			for _, e := range c.Env {
				if e.ValueFrom == nil {
					continue
				}
				if e.ValueFrom.ConfigMapKeyRef != nil {
					addCM(e.ValueFrom.ConfigMapKeyRef.Name)
				}
				if e.ValueFrom.SecretKeyRef != nil {
					addSec(e.ValueFrom.SecretKeyRef.Name)
				}
			}
		}
	}
	scanContainers(spec.Containers)
	scanContainers(spec.InitContainers)
	for _, ips := range spec.ImagePullSecrets {
		addSec(ips.Name)
	}
	for k := range cmSet {
		cms = append(cms, k)
	}
	for k := range secSet {
		secs = append(secs, k)
	}
	return dedupeSorted(cms), dedupeSorted(secs)
}

func podSpecUsesConfigMap(spec *corev1.PodSpec, want string) bool {
	want = strings.TrimSpace(want)
	if want == "" {
		return false
	}
	cms, _ := volumeRefsFromPodSpec(spec)
	for _, x := range cms {
		if x == want {
			return true
		}
	}
	return false
}

func podSpecUsesSecret(spec *corev1.PodSpec, want string) bool {
	want = strings.TrimSpace(want)
	if want == "" {
		return false
	}
	_, secs := volumeRefsFromPodSpec(spec)
	for _, x := range secs {
		if x == want {
			return true
		}
	}
	return false
}

func isControllerRef(ref metav1.OwnerReference) bool {
	return ref.Controller != nil && *ref.Controller
}

func resolvePodWorkloadOwners(ctx context.Context, k8s *kubernetes.Clientset, ns string, pod *corev1.Pod) (deps, stss, dss []string) {
	for _, ref := range pod.OwnerReferences {
		if !isControllerRef(ref) {
			continue
		}
		switch ref.Kind {
		case "ReplicaSet":
			rs, err := k8s.AppsV1().ReplicaSets(ns).Get(ctx, ref.Name, metav1.GetOptions{})
			if err != nil {
				continue
			}
			for _, r2 := range rs.OwnerReferences {
				if r2.Kind == "Deployment" {
					deps = append(deps, r2.Name)
				}
			}
		case "StatefulSet":
			stss = append(stss, ref.Name)
		case "DaemonSet":
			dss = append(dss, ref.Name)
		}
	}
	return dedupeSorted(deps), dedupeSorted(stss), dedupeSorted(dss)
}

func podSiblingLabelSelector(ctx context.Context, k8s *kubernetes.Clientset, ns string, pod *corev1.Pod) string {
	for _, ref := range pod.OwnerReferences {
		if !isControllerRef(ref) {
			continue
		}
		switch ref.Kind {
		case "ReplicaSet":
			rs, err := k8s.AppsV1().ReplicaSets(ns).Get(ctx, ref.Name, metav1.GetOptions{})
			if err != nil || rs.Spec.Selector == nil {
				return ""
			}
			return metav1.FormatLabelSelector(rs.Spec.Selector)
		case "StatefulSet":
			sts, err := k8s.AppsV1().StatefulSets(ns).Get(ctx, ref.Name, metav1.GetOptions{})
			if err != nil || sts.Spec.Selector == nil {
				return ""
			}
			return metav1.FormatLabelSelector(sts.Spec.Selector)
		case "DaemonSet":
			ds, err := k8s.AppsV1().DaemonSets(ns).Get(ctx, ref.Name, metav1.GetOptions{})
			if err != nil || ds.Spec.Selector == nil {
				return ""
			}
			return metav1.FormatLabelSelector(ds.Spec.Selector)
		}
	}
	return ""
}

func podNamesExcludingSelf(names []string, self string) []string {
	out := make([]string, 0, len(names))
	for _, n := range names {
		if n != self {
			out = append(out, n)
		}
	}
	return out
}

func relationsFromPodsUsingVolumeRef(
	ctx context.Context,
	k8s *kubernetes.Clientset,
	ns string,
	podRefs func(*corev1.PodSpec) bool,
) (k8sResourceRelationsResponse, error) {
	out := k8sResourceRelationsResponse{}
	podList, err := k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return out, err
	}
	podNameSet := map[string]struct{}{}
	labelsByPod := map[string]map[string]string{}
	for _, p := range podList.Items {
		if podRefs(&p.Spec) {
			podNameSet[p.Name] = struct{}{}
			labelsByPod[p.Name] = p.Labels
		}
	}
	for n := range podNameSet {
		out.Pods = append(out.Pods, n)
	}
	out.Pods = dedupeSorted(out.Pods)

	depList, err := k8s.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return out, err
	}
	for _, d := range depList.Items {
		if podRefs(&d.Spec.Template.Spec) {
			out.Deployments = append(out.Deployments, d.Name)
		}
	}
	out.Deployments = dedupeSorted(out.Deployments)

	stsList, err := k8s.AppsV1().StatefulSets(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return out, err
	}
	for _, s := range stsList.Items {
		if podRefs(&s.Spec.Template.Spec) {
			out.StatefulSets = append(out.StatefulSets, s.Name)
		}
	}
	out.StatefulSets = dedupeSorted(out.StatefulSets)

	dsList, err := k8s.AppsV1().DaemonSets(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return out, err
	}
	for _, d := range dsList.Items {
		if podRefs(&d.Spec.Template.Spec) {
			out.DaemonSets = append(out.DaemonSets, d.Name)
		}
	}
	out.DaemonSets = dedupeSorted(out.DaemonSets)

	// Owner 链：裸 Pod 或模板未写全的引用
	for _, p := range podList.Items {
		if !podRefs(&p.Spec) {
			continue
		}
		dps, sts, dss := resolvePodWorkloadOwners(ctx, k8s, ns, &p)
		out.Deployments = append(out.Deployments, dps...)
		out.StatefulSets = append(out.StatefulSets, sts...)
		out.DaemonSets = append(out.DaemonSets, dss...)
	}
	out.Deployments = dedupeSorted(out.Deployments)
	out.StatefulSets = dedupeSorted(out.StatefulSets)
	out.DaemonSets = dedupeSorted(out.DaemonSets)

	svcNameSet := make(map[string]struct{})
	svcs, err := k8s.CoreV1().Services(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return out, err
	}
	for _, p := range podList.Items {
		if !podRefs(&p.Spec) {
			continue
		}
		for _, s := range svcs.Items {
			if len(s.Spec.Selector) == 0 {
				continue
			}
			if labelsMatchSelector(p.Labels, s.Spec.Selector) {
				svcNameSet[s.Name] = struct{}{}
			}
		}
	}
	for s := range svcNameSet {
		out.Services = append(out.Services, s)
	}
	out.Services = dedupeSorted(out.Services)
	ingNames, _ := ingressesReferencingServices(ctx, k8s, ns, svcNameSet)
	out.Ingresses = ingNames

	return out, nil
}

func listPodsNames(ctx context.Context, k8s *kubernetes.Clientset, ns, labelSelector string, limit int64) ([]string, error) {
	if labelSelector == "" {
		return nil, nil
	}
	list, err := k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{LabelSelector: labelSelector, Limit: limit})
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(list.Items))
	for _, p := range list.Items {
		names = append(names, p.Name)
	}
	sort.Strings(names)
	return names, nil
}

func ingressesReferencingServices(ctx context.Context, k8s *kubernetes.Clientset, ns string, svcNames map[string]struct{}) ([]string, error) {
	if len(svcNames) == 0 {
		return nil, nil
	}
	ings, err := k8s.NetworkingV1().Ingresses(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	var out []string
	for _, ing := range ings.Items {
		for _, bn := range ingressBackendServiceNames(&ing) {
			if _, ok := svcNames[bn]; ok {
				out = append(out, ing.Name)
				break
			}
		}
	}
	return dedupeSorted(out), nil
}

func deploymentsForServiceSelector(ctx context.Context, k8s *kubernetes.Clientset, ns string, sel map[string]string) ([]string, error) {
	if len(sel) == 0 {
		return nil, nil
	}
	list, err := k8s.AppsV1().Deployments(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	var out []string
	for _, d := range list.Items {
		tpl := d.Spec.Template.Labels
		if labelsMatchSelector(tpl, sel) {
			out = append(out, d.Name)
		}
	}
	return dedupeSorted(out), nil
}

func statefulSetsForServiceSelector(ctx context.Context, k8s *kubernetes.Clientset, ns string, sel map[string]string) ([]string, error) {
	if len(sel) == 0 {
		return nil, nil
	}
	list, err := k8s.AppsV1().StatefulSets(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	var out []string
	for _, s := range list.Items {
		tpl := s.Spec.Template.Labels
		if labelsMatchSelector(tpl, sel) {
			out = append(out, s.Name)
		}
	}
	return dedupeSorted(out), nil
}

func daemonSetsForServiceSelector(ctx context.Context, k8s *kubernetes.Clientset, ns string, sel map[string]string) ([]string, error) {
	if len(sel) == 0 {
		return nil, nil
	}
	list, err := k8s.AppsV1().DaemonSets(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	var out []string
	for _, d := range list.Items {
		tpl := d.Spec.Template.Labels
		if labelsMatchSelector(tpl, sel) {
			out = append(out, d.Name)
		}
	}
	return dedupeSorted(out), nil
}

// handleK8sResourceRelations GET ?namespace=&kind=Deployment|StatefulSet|DaemonSet|Service|Ingress|Pod|ConfigMap|Secret&name=
func handleK8sResourceRelations(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ns := strings.TrimSpace(c.Query("namespace"))
	kind := strings.TrimSpace(c.Query("kind"))
	name := strings.TrimSpace(c.Query("name"))
	if ns == "" || kind == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要 query: namespace, kind, name"})
		return
	}
	ctx := context.TODO()
	out := k8sResourceRelationsResponse{}

	switch kind {
	case "Deployment":
		dep, err := k8s.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Deployment 不存在"})
				return
			}
			RespondAPIError500(c, err.Error())
			return
		}
		tplLabels := dep.Spec.Template.Labels
		var summaries []k8sServicePortSummary
		var svcNameSet map[string]struct{}
		out.Services, svcNameSet, summaries, err = listMatchingServicesForPodTemplateLabels(ctx, k8s, ns, tplLabels)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		out.MatchingServicePorts = summaries
		ingNames, _ := ingressesReferencingServices(ctx, k8s, ns, svcNameSet)
		out.Ingresses = ingNames
		out.Deployments = []string{name}
		ls := ""
		if dep.Spec.Selector != nil {
			ls = metav1.FormatLabelSelector(dep.Spec.Selector)
		}
		pods, _ := listPodsNames(ctx, k8s, ns, ls, 50)
		out.Pods = pods
		cm, se := volumeRefsFromPodSpec(&dep.Spec.Template.Spec)
		out.ConfigMaps = cm
		out.Secrets = se

	case "StatefulSet":
		sts, err := k8s.AppsV1().StatefulSets(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				c.JSON(http.StatusNotFound, gin.H{"error": "StatefulSet 不存在"})
				return
			}
			RespondAPIError500(c, err.Error())
			return
		}
		tplLabels := sts.Spec.Template.Labels
		var summaries []k8sServicePortSummary
		var svcNameSet map[string]struct{}
		out.Services, svcNameSet, summaries, err = listMatchingServicesForPodTemplateLabels(ctx, k8s, ns, tplLabels)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		out.MatchingServicePorts = summaries
		ingNames, _ := ingressesReferencingServices(ctx, k8s, ns, svcNameSet)
		out.Ingresses = ingNames
		out.StatefulSets = []string{name}
		ls := ""
		if sts.Spec.Selector != nil {
			ls = metav1.FormatLabelSelector(sts.Spec.Selector)
		}
		pods, _ := listPodsNames(ctx, k8s, ns, ls, 50)
		out.Pods = pods
		cm, se := volumeRefsFromPodSpec(&sts.Spec.Template.Spec)
		out.ConfigMaps = cm
		out.Secrets = se

	case "DaemonSet":
		ds, err := k8s.AppsV1().DaemonSets(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				c.JSON(http.StatusNotFound, gin.H{"error": "DaemonSet 不存在"})
				return
			}
			RespondAPIError500(c, err.Error())
			return
		}
		tplLabels := ds.Spec.Template.Labels
		var summaries []k8sServicePortSummary
		var svcNameSet map[string]struct{}
		out.Services, svcNameSet, summaries, err = listMatchingServicesForPodTemplateLabels(ctx, k8s, ns, tplLabels)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		out.MatchingServicePorts = summaries
		ingNames, _ := ingressesReferencingServices(ctx, k8s, ns, svcNameSet)
		out.Ingresses = ingNames
		out.DaemonSets = []string{name}
		ls := ""
		if ds.Spec.Selector != nil {
			ls = metav1.FormatLabelSelector(ds.Spec.Selector)
		}
		pods, _ := listPodsNames(ctx, k8s, ns, ls, 50)
		out.Pods = pods
		cm, se := volumeRefsFromPodSpec(&ds.Spec.Template.Spec)
		out.ConfigMaps = cm
		out.Secrets = se

	case "Service":
		svc, err := k8s.CoreV1().Services(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Service 不存在"})
				return
			}
			RespondAPIError500(c, err.Error())
			return
		}
		out.Services = []string{name}
		sel := svc.Spec.Selector
		ings, err := k8s.NetworkingV1().Ingresses(ns).List(ctx, metav1.ListOptions{})
		if err == nil {
			for _, ing := range ings.Items {
				for _, bn := range ingressBackendServiceNames(&ing) {
					if bn == name {
						out.Ingresses = append(out.Ingresses, ing.Name)
						break
					}
				}
			}
			out.Ingresses = dedupeSorted(out.Ingresses)
		}
		dps, _ := deploymentsForServiceSelector(ctx, k8s, ns, sel)
		out.Deployments = dps
		stss, _ := statefulSetsForServiceSelector(ctx, k8s, ns, sel)
		out.StatefulSets = stss
		dss, _ := daemonSetsForServiceSelector(ctx, k8s, ns, sel)
		out.DaemonSets = dss
		ls := ""
		for k, v := range sel {
			if ls != "" {
				ls += ","
			}
			ls += k + "=" + v
		}
		out.Pods, _ = listPodsNames(ctx, k8s, ns, ls, 50)

	case "Ingress":
		ing, err := k8s.NetworkingV1().Ingresses(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Ingress 不存在"})
				return
			}
			RespondAPIError500(c, err.Error())
			return
		}
		out.Ingresses = []string{name}
		be := ingressBackendServiceNames(ing)
		out.Services = dedupeSorted(be)
		depSet := map[string]struct{}{}
		stsSet := map[string]struct{}{}
		dsSet := map[string]struct{}{}
		podSet := map[string]struct{}{}
		cmSet := map[string]struct{}{}
		secSet := map[string]struct{}{}
		for _, svcNm := range be {
			svc, err := k8s.CoreV1().Services(ns).Get(ctx, svcNm, metav1.GetOptions{})
			if err != nil {
				continue
			}
			dps, _ := deploymentsForServiceSelector(ctx, k8s, ns, svc.Spec.Selector)
			for _, d := range dps {
				depSet[d] = struct{}{}
			}
			ss, _ := statefulSetsForServiceSelector(ctx, k8s, ns, svc.Spec.Selector)
			for _, s := range ss {
				stsSet[s] = struct{}{}
			}
			dsx, _ := daemonSetsForServiceSelector(ctx, k8s, ns, svc.Spec.Selector)
			for _, x := range dsx {
				dsSet[x] = struct{}{}
			}
			ls := ""
			for k, v := range svc.Spec.Selector {
				if ls != "" {
					ls += ","
				}
				ls += k + "=" + v
			}
			pods, _ := listPodsNames(ctx, k8s, ns, ls, 30)
			for _, p := range pods {
				podSet[p] = struct{}{}
			}
			// ConfigMap / Secret：从匹配到该 Service 的 Deployment 模板收集（各取并集）
			for _, d := range dps {
				depObj, err := k8s.AppsV1().Deployments(ns).Get(ctx, d, metav1.GetOptions{})
				if err != nil {
					continue
				}
				cma, sea := volumeRefsFromPodSpec(&depObj.Spec.Template.Spec)
				for _, x := range cma {
					cmSet[x] = struct{}{}
				}
				for _, x := range sea {
					secSet[x] = struct{}{}
				}
			}
			for _, dn := range dsx {
				dsObj, err := k8s.AppsV1().DaemonSets(ns).Get(ctx, dn, metav1.GetOptions{})
				if err != nil {
					continue
				}
				cma, sea := volumeRefsFromPodSpec(&dsObj.Spec.Template.Spec)
				for _, x := range cma {
					cmSet[x] = struct{}{}
				}
				for _, x := range sea {
					secSet[x] = struct{}{}
				}
			}
			for _, s := range ss {
				stObj, err := k8s.AppsV1().StatefulSets(ns).Get(ctx, s, metav1.GetOptions{})
				if err != nil {
					continue
				}
				cma, sea := volumeRefsFromPodSpec(&stObj.Spec.Template.Spec)
				for _, x := range cma {
					cmSet[x] = struct{}{}
				}
				for _, x := range sea {
					secSet[x] = struct{}{}
				}
			}
		}
		for d := range depSet {
			out.Deployments = append(out.Deployments, d)
		}
		out.Deployments = dedupeSorted(out.Deployments)
		for s := range stsSet {
			out.StatefulSets = append(out.StatefulSets, s)
		}
		out.StatefulSets = dedupeSorted(out.StatefulSets)
		for x := range dsSet {
			out.DaemonSets = append(out.DaemonSets, x)
		}
		out.DaemonSets = dedupeSorted(out.DaemonSets)
		for p := range podSet {
			out.Pods = append(out.Pods, p)
		}
		out.Pods = dedupeSorted(out.Pods)
		for x := range cmSet {
			out.ConfigMaps = append(out.ConfigMaps, x)
		}
		out.ConfigMaps = dedupeSorted(out.ConfigMaps)
		for x := range secSet {
			out.Secrets = append(out.Secrets, x)
		}
		out.Secrets = dedupeSorted(out.Secrets)

	case "Pod":
		pod, err := k8s.CoreV1().Pods(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Pod 不存在"})
				return
			}
			RespondAPIError500(c, err.Error())
			return
		}
		cm, se := volumeRefsFromPodSpec(&pod.Spec)
		out.ConfigMaps = cm
		out.Secrets = se
		dps, sts, dss := resolvePodWorkloadOwners(ctx, k8s, ns, pod)
		out.Deployments = dps
		out.StatefulSets = sts
		out.DaemonSets = dss
		svcs, err := k8s.CoreV1().Services(ns).List(ctx, metav1.ListOptions{})
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		svcNameSet := make(map[string]struct{})
		for _, s := range svcs.Items {
			if len(s.Spec.Selector) == 0 {
				continue
			}
			if labelsMatchSelector(pod.Labels, s.Spec.Selector) {
				svcNameSet[s.Name] = struct{}{}
				out.Services = append(out.Services, s.Name)
			}
		}
		out.Services = dedupeSorted(out.Services)
		ingNames, _ := ingressesReferencingServices(ctx, k8s, ns, svcNameSet)
		out.Ingresses = ingNames
		if ls := podSiblingLabelSelector(ctx, k8s, ns, pod); ls != "" {
			siblings, _ := listPodsNames(ctx, k8s, ns, ls, 80)
			out.Pods = podNamesExcludingSelf(siblings, pod.Name)
		}

	case "ConfigMap":
		_, err := k8s.CoreV1().ConfigMaps(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				c.JSON(http.StatusNotFound, gin.H{"error": "ConfigMap 不存在"})
				return
			}
			RespondAPIError500(c, err.Error())
			return
		}
		rel, err := relationsFromPodsUsingVolumeRef(ctx, k8s, ns, func(spec *corev1.PodSpec) bool {
			return podSpecUsesConfigMap(spec, name)
		})
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		out = rel
		out.ConfigMaps = []string{name}

	case "Secret":
		_, err := k8s.CoreV1().Secrets(ns).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				c.JSON(http.StatusNotFound, gin.H{"error": "Secret 不存在"})
				return
			}
			RespondAPIError500(c, err.Error())
			return
		}
		rel, err := relationsFromPodsUsingVolumeRef(ctx, k8s, ns, func(spec *corev1.PodSpec) bool {
			return podSpecUsesSecret(spec, name)
		})
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		out = rel
		out.Secrets = []string{name}

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的 kind: " + kind + "（支持 Deployment、StatefulSet、Service、Ingress、Pod、ConfigMap、Secret）"})
		return
	}

	c.JSON(http.StatusOK, out)
}
