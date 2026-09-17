package internal

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// 上游固定版本，便于国内镜像改写与复现；Dashboard 2.7 为 aio 单文件 recommended 的最后一档常用发行。
const (
	k8sMetricsServerComponentsURL        = "https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.7.2/components.yaml"
	k8sKubernetesDashboardRecommendedURL = "https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml"

	k8sMetricsServerDeployment   = "metrics-server"
	k8sMetricsServerNamespace    = "kube-system"
	k8sKubernetesDashboardNS     = "kubernetes-dashboard"
	k8sDashboardAdminBindingYAML = `apiVersion: v1
kind: ServiceAccount
metadata:
  name: kube-bt-sync-dashboard-admin
  namespace: kubernetes-dashboard
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: kube-bt-sync-dashboard-admin
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- kind: ServiceAccount
  name: kube-bt-sync-dashboard-admin
  namespace: kubernetes-dashboard
`
)

// RewriteK8sDashboardMonitoringAddonImages 将 metrics-server（registry.k8s.io）与 Dashboard（kubernetesui/*）改写为国内可拉取前缀。
// 与 ingress 一致：若 IngressNginxSkipK8sRegistryMirror 则不改写。
func RewriteK8sDashboardMonitoringAddonImages(raw []byte, cfg Config) []byte {
	if cfg.IngressNginxSkipK8sRegistryMirror {
		return raw
	}
	b := RewriteIngressManifestK8sRegistryImages(raw, cfg)
	prefix := strings.TrimSuffix(strings.TrimSpace(cfg.IngressNginxK8sImageMirrorPrefix), "/")
	if prefix == "" {
		prefix = "m.daocloud.io/docker.io"
	}
	return rewriteKubernetesUIImageToMirror(b, prefix)
}

func rewriteKubernetesUIImageToMirror(manifest []byte, dockerMirrorPrefix string) []byte {
	if dockerMirrorPrefix == "" {
		return manifest
	}
	s := string(manifest)
	mp := strings.TrimSuffix(dockerMirrorPrefix, "/")
	s = strings.ReplaceAll(s, "image: kubernetesui/", "image: "+mp+"/kubernetesui/")
	s = strings.ReplaceAll(s, "image: docker.io/kubernetesui/", "image: "+mp+"/kubernetesui/")
	return []byte(s)
}

func patchMetricsServerKubeletInsecureTLS(ctx context.Context, k8s *kubernetes.Clientset) error {
	if k8s == nil {
		return fmt.Errorf("Kubernetes 客户端未初始化")
	}
	waitCtx, cancel := context.WithTimeout(ctx, 4*time.Minute)
	defer cancel()
	for {
		dep, err := k8s.AppsV1().Deployments(k8sMetricsServerNamespace).Get(waitCtx, k8sMetricsServerDeployment, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				select {
				case <-waitCtx.Done():
					return fmt.Errorf("等待 metrics-server Deployment: %w", waitCtx.Err())
				case <-time.After(2 * time.Second):
				}
				continue
			}
			return fmt.Errorf("读取 metrics-server Deployment: %w", err)
		}
		changed := false
		for i := range dep.Spec.Template.Spec.Containers {
			c := &dep.Spec.Template.Spec.Containers[i]
			if len(dep.Spec.Template.Spec.Containers) > 1 && c.Name != "metrics-server" {
				continue
			}
			has := false
			for _, a := range c.Args {
				if a == "--kubelet-insecure-tls" || strings.HasPrefix(a, "--kubelet-insecure-tls=") {
					has = true
					break
				}
			}
			if !has {
				c.Args = append(c.Args, "--kubelet-insecure-tls")
				changed = true
			}
		}
		if !changed {
			return nil
		}
		_, err = k8s.AppsV1().Deployments(k8sMetricsServerNamespace).Update(waitCtx, dep, metav1.UpdateOptions{})
		if err == nil {
			return nil
		}
		if !apierrors.IsConflict(err) {
			return fmt.Errorf("更新 metrics-server Deployment: %w", err)
		}
		select {
		case <-waitCtx.Done():
			return fmt.Errorf("更新 metrics-server: %w", waitCtx.Err())
		case <-time.After(2 * time.Second):
		}
	}
}

// InstallK8sDashboardMonitoringStack 安装 metrics-server + Kubernetes Dashboard 2.7（recommended）+ 平台创建的 cluster-admin ServiceAccount（登录用 Token）。
func InstallK8sDashboardMonitoringStack(ctx context.Context, k8s *kubernetes.Clientset, restCfg *rest.Config, platformCfg Config, mirror ManifestMirrorMode, kubeletInsecureTLS bool) error {
	if k8s == nil || restCfg == nil {
		return fmt.Errorf("Kubernetes 未连接")
	}
	msRaw, err := httpGetManifestBytes(ctx, k8sMetricsServerComponentsURL, mirror)
	if err != nil {
		return fmt.Errorf("下载 metrics-server 清单: %w", err)
	}
	msRaw = RewriteK8sDashboardMonitoringAddonImages(msRaw, platformCfg)
	if err := applyYAMLManifestDynamic(ctx, restCfg, msRaw); err != nil {
		return fmt.Errorf("应用 metrics-server: %w", err)
	}
	if kubeletInsecureTLS {
		if err := patchMetricsServerKubeletInsecureTLS(ctx, k8s); err != nil {
			return err
		}
	}
	dashRaw, err := httpGetManifestBytes(ctx, k8sKubernetesDashboardRecommendedURL, mirror)
	if err != nil {
		return fmt.Errorf("下载 kubernetes-dashboard 清单: %w", err)
	}
	dashRaw = RewriteK8sDashboardMonitoringAddonImages(dashRaw, platformCfg)
	if err := applyYAMLManifestDynamic(ctx, restCfg, dashRaw); err != nil {
		return fmt.Errorf("应用 kubernetes-dashboard: %w", err)
	}
	if err := applyYAMLManifestDynamic(ctx, restCfg, []byte(k8sDashboardAdminBindingYAML)); err != nil {
		return fmt.Errorf("应用 Dashboard 管理员 ServiceAccount: %w", err)
	}
	return nil
}

func deploymentStatusBrief(ctx context.Context, k8s *kubernetes.Clientset, ns, name string) gin.H {
	out := gin.H{
		"namespace":       ns,
		"name":            name,
		"found":           false,
		"readyReplicas":   int32(0),
		"desiredReplicas": int32(0),
		"rolloutReady":    false,
	}
	if k8s == nil {
		return out
	}
	dep, err := k8s.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		if !apierrors.IsNotFound(err) {
			out["error"] = err.Error()
		}
		return out
	}
	out["found"] = true
	want := int32(1)
	if dep.Spec.Replicas != nil {
		want = *dep.Spec.Replicas
	}
	out["desiredReplicas"] = want
	out["readyReplicas"] = dep.Status.ReadyReplicas
	out["rolloutReady"] = deploymentRolloutLooksReady(dep)
	return out
}

// K8sDashboardMonitoringStackStatus 供 /api/k8s/addons/status 合并展示。
func K8sDashboardMonitoringStackStatus(ctx context.Context, k8s *kubernetes.Clientset) gin.H {
	if k8s == nil {
		return gin.H{
			"metricsServer": gin.H{
				"namespace": k8sMetricsServerNamespace,
				"installed": false,
			},
			"kubernetesDashboard": gin.H{
				"namespace": k8sKubernetesDashboardNS,
				"installed": false,
			},
		}
	}
	msDep := deploymentStatusBrief(ctx, k8s, k8sMetricsServerNamespace, k8sMetricsServerDeployment)
	msInstalled, _ := msDep["found"].(bool)
	msRollout, _ := msDep["rolloutReady"].(bool)

	dashMain := deploymentStatusBrief(ctx, k8s, k8sKubernetesDashboardNS, "kubernetes-dashboard")
	dashScraper := deploymentStatusBrief(ctx, k8s, k8sKubernetesDashboardNS, "dashboard-metrics-scraper")
	dmFound, _ := dashMain["found"].(bool)
	dsFound, _ := dashScraper["found"].(bool)
	dmOk, _ := dashMain["rolloutReady"].(bool)
	dsOk, _ := dashScraper["rolloutReady"].(bool)

	nsExists := false
	if _, err := k8s.CoreV1().Namespaces().Get(ctx, k8sKubernetesDashboardNS, metav1.GetOptions{}); err == nil {
		nsExists = true
	}

	saExists := false
	if _, err := k8s.CoreV1().ServiceAccounts(k8sKubernetesDashboardNS).Get(ctx, "kube-bt-sync-dashboard-admin", metav1.GetOptions{}); err == nil {
		saExists = true
	}

	dashboardLikely := nsExists && dmFound
	allReady := msInstalled && msRollout && dmOk && (!dsFound || dsOk)

	return gin.H{
		"metricsServer": gin.H{
			"namespace":              k8sMetricsServerNamespace,
			"deployment":             msDep,
			"installed":              msInstalled,
			"rolloutReady":           msRollout,
			"kubeletInsecureTlsHint": "多数国内/自签 kubelet 证书环境需为 metrics-server 增加参数 --kubelet-insecure-tls；一键安装默认可勾选注入。",
		},
		"kubernetesDashboard": gin.H{
			"namespace":             k8sKubernetesDashboardNS,
			"namespaceExists":       nsExists,
			"dashboardDeployment":   dashMain,
			"scraperDeployment":     dashScraper,
			"installed":             dashboardLikely,
			"uiPodsLikelyReady":     dmOk && (!dsFound || dsOk),
			"adminServiceAccount":   "kube-bt-sync-dashboard-admin",
			"adminBindingInstalled": saExists,
			"accessHint":            "kubectl proxy 后访问 /api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/ ；登录用 kubectl create token kube-bt-sync-dashboard-admin -n kubernetes-dashboard --duration=24h",
			"allComponentsReady":    allReady,
		},
	}
}

// WaitVerifyK8sDashboardMonitoringStack 安装后轮询 Deployment / Pod 就绪。
func WaitVerifyK8sDashboardMonitoringStack(ctx context.Context, k8s *kubernetes.Clientset, pollEvery time.Duration, maxWait time.Duration) IngressAddonVerification {
	started := time.Now()
	if k8s == nil {
		return IngressAddonVerification{
			OK:        false,
			CheckedAt: time.Now().UTC().Format(time.RFC3339),
			Issues:    []string{"Kubernetes 客户端不可用"},
			Remedies:  []string{"确认集群已连接并具有 apps deployments 读权限"},
		}
	}
	deadline := time.Now().Add(maxWait)
	var lastChecks []IngressAddonCheck
	for time.Now().Before(deadline) {
		if ctx.Err() != nil {
			break
		}
		var checks []IngressAddonCheck
		msDep, err := k8s.AppsV1().Deployments(k8sMetricsServerNamespace).Get(ctx, k8sMetricsServerDeployment, metav1.GetOptions{})
		if err != nil || msDep == nil {
			checks = append(checks, IngressAddonCheck{Name: "metrics-server Deployment", OK: false, Detail: manifestErrSnippet(err, 120)})
		} else {
			ok := deploymentRolloutLooksReady(msDep)
			detail := fmt.Sprintf("ready %d/%d", msDep.Status.ReadyReplicas, deploymentReplicasDesired(msDep))
			checks = append(checks, IngressAddonCheck{Name: "metrics-server Deployment", OK: ok, Detail: detail})
		}

		dashDep, err := k8s.AppsV1().Deployments(k8sKubernetesDashboardNS).Get(ctx, "kubernetes-dashboard", metav1.GetOptions{})
		if err != nil || dashDep == nil {
			checks = append(checks, IngressAddonCheck{Name: "kubernetes-dashboard Deployment", OK: false, Detail: manifestErrSnippet(err, 120)})
		} else {
			ok := deploymentRolloutLooksReady(dashDep)
			detail := fmt.Sprintf("ready %d/%d", dashDep.Status.ReadyReplicas, deploymentReplicasDesired(dashDep))
			checks = append(checks, IngressAddonCheck{Name: "kubernetes-dashboard Deployment", OK: ok, Detail: detail})
		}

		scraperDep, err := k8s.AppsV1().Deployments(k8sKubernetesDashboardNS).Get(ctx, "dashboard-metrics-scraper", metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			checks = append(checks, IngressAddonCheck{Name: "dashboard-metrics-scraper", OK: true, Detail: "未安装（可忽略）"})
		} else if err != nil || scraperDep == nil {
			checks = append(checks, IngressAddonCheck{Name: "dashboard-metrics-scraper Deployment", OK: false, Detail: manifestErrSnippet(err, 120)})
		} else {
			ok := deploymentRolloutLooksReady(scraperDep)
			detail := fmt.Sprintf("ready %d/%d", scraperDep.Status.ReadyReplicas, deploymentReplicasDesired(scraperDep))
			checks = append(checks, IngressAddonCheck{Name: "dashboard-metrics-scraper Deployment", OK: ok, Detail: detail})
		}

		_, err = k8s.CoreV1().ServiceAccounts(k8sKubernetesDashboardNS).Get(ctx, "kube-bt-sync-dashboard-admin", metav1.GetOptions{})
		saOk := err == nil
		checks = append(checks, IngressAddonCheck{Name: "SA kube-bt-sync-dashboard-admin", OK: saOk, Detail: func() string {
			if saOk {
				return "已创建"
			}
			return manifestErrSnippet(err, 120)
		}()})

		lastChecks = checks
		allOK := true
		for _, c := range checks {
			if !c.OK {
				allOK = false
				break
			}
		}
		if allOK {
			return IngressAddonVerification{
				OK:            true,
				CheckedAt:     time.Now().UTC().Format(time.RFC3339),
				Checks:        checks,
				WaitedSeconds: int(time.Since(started).Seconds()),
			}
		}
		select {
		case <-ctx.Done():
			deadline = time.Now()
		case <-time.After(pollEvery):
		}
	}

	issues := []string{"等待超时：部分组件未就绪"}
	remedies := []string{
		"查看 Pod 事件：kubectl describe pod -n kube-system -l k8s-app=metrics-server ；kubectl describe pod -n kubernetes-dashboard",
		"若 metrics-server 因 kubelet 证书报错，编辑 Deployment 增加参数 --kubelet-insecure-tls 后重试",
		"确认节点可拉取 m.daocloud.io 前缀镜像；若禁用镜像改写，请在运行时设置 INGRESS_NGINX_SKIP_K8S_REGISTRY_MIRROR 并改用自建镜像仓库",
	}
	return IngressAddonVerification{
		OK:            false,
		CheckedAt:     time.Now().UTC().Format(time.RFC3339),
		Checks:        lastChecks,
		Issues:        issues,
		Remedies:      remedies,
		WaitedSeconds: int(time.Since(started).Seconds()),
	}
}
