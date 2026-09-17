package internal

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type k8sAddonsIngressBody struct {
	IngressManifestURL string `json:"ingressManifestUrl"`
	HostHTTPPort       int    `json:"hostHttpPort"`
	HostHTTPSPort      int    `json:"hostHttpsPort"`
	ManifestMirror     string `json:"manifestMirror"`
	ControllerNodeName string `json:"controllerNodeName"`
}

type k8sAddonsIngressControllerNodeBody struct {
	ControllerNodeName string `json:"controllerNodeName"`
}

func resolveManifestMirror(bodyMirror string, cfg Config) ManifestMirrorMode {
	if strings.TrimSpace(bodyMirror) != "" {
		return ParseManifestMirrorMode(bodyMirror)
	}
	return ParseManifestMirrorMode(cfg.K8sAddonsManifestMirror)
}

func handleK8sAddonsStatus(c *gin.Context, app *ServerApp) {
	if !GuardK8s(c, app.K8s()) {
		return
	}
	k8s := app.K8s()
	cfg := app.Cfg()
	ctx := c.Request.Context()
	nsIng := "ingress-nginx"

	ingNsExists := false
	if _, err := k8s.CoreV1().Namespaces().Get(ctx, nsIng, metav1.GetOptions{}); err == nil {
		ingNsExists = true
	}

	countPods := func(ns string) (total int, ready int) {
		list, err := k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
		if err != nil {
			return 0, 0
		}
		total = len(list.Items)
		for _, p := range list.Items {
			for _, cond := range p.Status.Conditions {
				if cond.Type == corev1.PodReady && cond.Status == corev1.ConditionTrue {
					ready++
					break
				}
			}
		}
		return total, ready
	}
	it, ir := countPods(nsIng)

	svcType := ""
	svcMissing := false
	svcErr := ""
	svc, err := k8s.CoreV1().Services(nsIng).Get(ctx, ingressNginxControllerServiceName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			svcMissing = true
		} else {
			svcErr = err.Error()
		}
	} else if svc != nil {
		svcType = string(svc.Spec.Type)
	}

	hostNet := false
	depHTTP := int32(0)
	depHTTPS := int32(0)
	depMetrics := int32(0)
	var depPinnedNode string
	if dep, err := k8s.AppsV1().Deployments(nsIng).Get(ctx, ingressNginxControllerDeployName, metav1.GetOptions{}); err == nil && dep != nil {
		hostNet = dep.Spec.Template.Spec.HostNetwork
		depPinnedNode = ingressDeploymentPinnedHostname(dep)
		idx := findIngressControllerContainerIndex(dep.Spec.Template.Spec.Containers)
		if idx >= 0 {
			cont := dep.Spec.Template.Spec.Containers[idx]
			depMetrics = IngressControllerTemplateMetricsPort(cont)
			for _, p := range cont.Ports {
				switch p.Name {
				case "http":
					depHTTP = p.ContainerPort
				case "https":
					depHTTPS = p.ContainerPort
				}
			}
		}
	}

	mirrorMode := ParseManifestMirrorMode(cfg.K8sAddonsManifestMirror)
	wantHTTP := effectiveIngressNginxHostHTTPPort(app.Runtime(), cfg)
	wantHTTPS := effectiveIngressNginxHostHTTPSPort(app.Runtime(), cfg)
	wantNode := effectiveIngressNginxControllerNodeName(app.Runtime(), cfg)
	nodeMatch := (wantNode == "" && depPinnedNode == "") || (wantNode != "" && depPinnedNode == wantNode)

	dashStack := K8sDashboardMonitoringStackStatus(ctx, k8s)
	kps := KubePrometheusStackAddonStatus(ctx, k8s, app.Cfg())
	payload := gin.H{
		"checkedAt": time.Now().UTC().Format(time.RFC3339),
		"manifestMirror": gin.H{
			"effective": K8sAddonsManifestMirrorCanonical(mirrorMode),
			"hint":      "YAML 下载会依次尝试：jsDelivr（cdn.jsdelivr.net/gh）、多条 ghproxy 线、最后直连 raw.githubusercontent.com；单线超时约 90s 后自动换线。节点拉镜像另见 registry.k8s.io 改写。若仍失败请在内网托管 deploy.yaml 并填写 ingressNginxManifestUrl。",
		},
		"ingressNginxK8sRegistryMirror": !cfg.IngressNginxSkipK8sRegistryMirror,
		"ingressNginx": gin.H{
			"namespace":                    nsIng,
			"namespaceExists":              ingNsExists,
			"podTotal":                     it,
			"podReady":                     ir,
			"installed":                    it > 0,
			"likelyInstalled":              it > 0,
			"controllersLikelyReady":       it > 0 && ir > 0,
			"controllerServiceType":        svcType,
			"serviceMissing":               svcMissing,
			"serviceError":                 svcErr,
			"hostNetwork":                  hostNet,
			"deploymentHttpPort":           depHTTP,
			"deploymentHttpsPort":          depHTTPS,
			"desiredHostHttpPort":          wantHTTP,
			"desiredHostHttpsPort":         wantHTTPS,
			"deploymentMetricsPort":        depMetrics,
			"hostPortsMatchDesired":        hostNet && depHTTP == wantHTTP && depHTTPS == wantHTTPS,
			"deploymentControllerNodeName": depPinnedNode,
			"desiredControllerNodeName":    wantNode,
			"controllerNodeMatchDesired":   nodeMatch,
		},
	}
	for k, v := range dashStack {
		payload[k] = v
	}
	payload["kubePrometheusStack"] = kps
	c.JSON(http.StatusOK, payload)
}

func handleK8sAddonsIngressNginxInstall(c *gin.Context, app *ServerApp) {
	if !GuardK8sREST(c, app.K8s(), app.K8sREST()) {
		return
	}
	var body k8sAddonsIngressBody
	_ = c.ShouldBindJSON(&body)
	cfg := app.Cfg()
	manifestURL := strings.TrimSpace(body.IngressManifestURL)
	if manifestURL == "" {
		manifestURL = strings.TrimSpace(cfg.IngressNginxManifestURL)
	}
	httpP := int32(body.HostHTTPPort)
	if httpP <= 0 {
		httpP = effectiveIngressNginxHostHTTPPort(app.Runtime(), cfg)
	}
	httpsP := int32(body.HostHTTPSPort)
	if httpsP <= 0 {
		httpsP = effectiveIngressNginxHostHTTPSPort(app.Runtime(), cfg)
	}
	mirror := resolveManifestMirror(body.ManifestMirror, cfg)
	nodeName := strings.TrimSpace(body.ControllerNodeName)
	if nodeName == "" {
		nodeName = effectiveIngressNginxControllerNodeName(app.Runtime(), cfg)
	}
	var nodePin *string
	if nodeName != "" {
		nodePin = &nodeName
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Minute)
	defer cancel()
	if nodeName != "" {
		if _, err := app.K8s().CoreV1().Nodes().Get(ctx, nodeName, metav1.GetOptions{}); err != nil {
			if apierrors.IsNotFound(err) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "节点不存在: " + nodeName})
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"error": "读取节点: " + err.Error()})
			return
		}
	}
	if err := InstallIngressNginxHostNetwork(ctx, app.K8s(), app.K8sREST(), cfg, manifestURL, mirror, httpP, httpsP, nodePin); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	verifyCtx, verifyCancel := context.WithTimeout(c.Request.Context(), 8*time.Minute)
	defer verifyCancel()
	verification := WaitVerifyIngressNginxHostNetwork(verifyCtx, app.K8s(), httpP, httpsP, IngressVerifyOpts{
		PollEvery:         10 * time.Second,
		Remediate:         true,
		MaxRepairAttempts: 12,
		ProbeTCP:          true,
		ProbeHTTP:         true,
	})
	SetAuditDetail(c, fmt.Sprintf("安装 ingress-nginx hostNetwork http=%d https=%d node=%q verify_ok=%v", httpP, httpsP, nodeName, verification.OK))
	msg := fmt.Sprintf("ingress-nginx 已安装，控制器已设为 hostNetwork（HTTP %d / HTTPS %d）", httpP, httpsP)
	if nodeName != "" {
		msg += fmt.Sprintf("，固定节点 %s", nodeName)
	}
	if !verification.OK {
		msg += "；自检未全部通过，请查看 verification 中的问题与处理建议。"
	}
	c.JSON(http.StatusOK, gin.H{
		"ok":                            true,
		"hostHttpPort":                  httpP,
		"hostHttpsPort":                 httpsP,
		"message":                       msg,
		"manifestMirror":                K8sAddonsManifestMirrorCanonical(mirror),
		"ingressNginxK8sRegistryMirror": !cfg.IngressNginxSkipK8sRegistryMirror,
		"controllerNodeName":            nodeName,
		"verification":                  verification,
	})
}

func handleK8sAddonsIngressControllerNode(c *gin.Context, app *ServerApp) {
	if !GuardK8s(c, app.K8s()) {
		return
	}
	var body k8sAddonsIngressControllerNodeBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 无效"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 4*time.Minute)
	defer cancel()
	name := strings.TrimSpace(body.ControllerNodeName)
	if err := PatchIngressNginxControllerNode(ctx, app.K8s(), name); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, fmt.Sprintf("ingress-nginx 控制器调度节点: %q", name))
	c.JSON(http.StatusOK, gin.H{
		"ok":                 true,
		"controllerNodeName": name,
		"message": func() string {
			if name == "" {
				return "已取消节点固定，控制器可按集群默认策略调度"
			}
			return fmt.Sprintf("已固定调度到节点 %s（副本数已设为 1）", name)
		}(),
	})
}

func handleK8sAddonsIngressNginxUninstall(c *gin.Context, app *ServerApp) {
	if !GuardK8s(c, app.K8s()) {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Minute)
	defer cancel()
	if err := UninstallKubernetesNamespace(ctx, app.K8s(), "ingress-nginx"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "卸载 ingress-nginx：删除命名空间 ingress-nginx")
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "已卸载 ingress-nginx（ingress-nginx 及相关 Webhook）"})
}

func handleK8sAddonsIngressHostPorts(c *gin.Context, app *ServerApp) {
	if !GuardK8s(c, app.K8s()) {
		return
	}
	var body k8sAddonsIngressBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 无效"})
		return
	}
	cfg := app.Cfg()
	httpP := int32(body.HostHTTPPort)
	if httpP <= 0 {
		httpP = effectiveIngressNginxHostHTTPPort(app.Runtime(), cfg)
	}
	httpsP := int32(body.HostHTTPSPort)
	if httpsP <= 0 {
		httpsP = effectiveIngressNginxHostHTTPSPort(app.Runtime(), cfg)
	}
	if httpP < 1 || httpP > 65535 || httpsP < 1 || httpsP > 65535 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hostHttpPort / hostHttpsPort 须在 1–65535"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Minute)
	defer cancel()
	if err := PatchIngressNginxHostPorts(ctx, app.K8s(), httpP, httpsP); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	verifyCtx, verifyCancel := context.WithTimeout(c.Request.Context(), 3*time.Minute)
	defer verifyCancel()
	verification := WaitVerifyIngressNginxHostNetwork(verifyCtx, app.K8s(), httpP, httpsP, IngressVerifyOpts{
		PollEvery:         8 * time.Second,
		Remediate:         true,
		MaxRepairAttempts: 6,
		ProbeTCP:          true,
		ProbeHTTP:         true,
	})
	c.JSON(http.StatusOK, gin.H{
		"ok":            true,
		"hostHttpPort":  httpP,
		"hostHttpsPort": httpsP,
		"verification":  verification,
	})
}

func handleK8sAddonsIngressVerify(c *gin.Context, app *ServerApp) {
	if !GuardK8s(c, app.K8s()) {
		return
	}
	cfg := app.Cfg()
	maxSec, _ := strconv.Atoi(c.DefaultQuery("maxWaitSec", "0"))
	if maxSec < 0 {
		maxSec = 0
	}
	if maxSec > 600 {
		maxSec = 600
	}
	remediate := c.Query("remediate") == "1" || strings.EqualFold(c.Query("remediate"), "true")
	httpP := effectiveIngressNginxHostHTTPPort(app.Runtime(), cfg)
	httpsP := effectiveIngressNginxHostHTTPSPort(app.Runtime(), cfg)
	if q := strings.TrimSpace(c.Query("hostHttpPort")); q != "" {
		if v, err := strconv.Atoi(q); err == nil && v > 0 && v <= 65535 {
			httpP = int32(v)
		}
	}
	if q := strings.TrimSpace(c.Query("hostHttpsPort")); q != "" {
		if v, err := strconv.Atoi(q); err == nil && v > 0 && v <= 65535 {
			httpsP = int32(v)
		}
	}
	probeTCP := c.Query("probeTcp") != "0"
	probeHTTP := c.Query("probeHttp") != "0"

	if maxSec <= 0 {
		reqCtx := c.Request.Context()
		if remediate && app.K8s() != nil {
			dep, err := app.K8s().AppsV1().Deployments(ingressNginxControllerNamespace).Get(reqCtx, ingressNginxControllerDeployName, metav1.GetOptions{})
			if err == nil && dep != nil && ingressDeploymentNeedsHostNetFix(dep, httpP, httpsP) {
				_ = FinishIngressNginxHostNetwork(reqCtx, app.K8s(), httpP, httpsP, nil)
			}
		}
		rep := RunIngressNginxHostNetworkVerification(reqCtx, app.K8s(), httpP, httpsP, probeTCP, probeHTTP)
		c.JSON(http.StatusOK, gin.H{"verification": rep})
		return
	}

	vctx, cancel := context.WithTimeout(c.Request.Context(), time.Duration(maxSec)*time.Second)
	defer cancel()
	rep := WaitVerifyIngressNginxHostNetwork(vctx, app.K8s(), httpP, httpsP, IngressVerifyOpts{
		PollEvery:         10 * time.Second,
		Remediate:         remediate,
		MaxRepairAttempts: 15,
		ProbeTCP:          probeTCP,
		ProbeHTTP:         probeHTTP,
	})
	c.JSON(http.StatusOK, gin.H{"verification": rep})
}

type k8sAddonsDashboardMonitoringBody struct {
	ManifestMirror     string `json:"manifestMirror"`
	KubeletInsecureTLS *bool  `json:"kubeletInsecureTls"`
}

func handleK8sAddonsDashboardMonitoringInstall(c *gin.Context, app *ServerApp) {
	if !GuardK8sREST(c, app.K8s(), app.K8sREST()) {
		return
	}
	var body k8sAddonsDashboardMonitoringBody
	_ = c.ShouldBindJSON(&body)
	cfg := app.Cfg()
	mirror := resolveManifestMirror(body.ManifestMirror, cfg)
	kubeTLS := true
	if body.KubeletInsecureTLS != nil {
		kubeTLS = *body.KubeletInsecureTLS
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 18*time.Minute)
	defer cancel()
	if err := InstallK8sDashboardMonitoringStack(ctx, app.K8s(), app.K8sREST(), cfg, mirror, kubeTLS); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	verifyCtx, verifyCancel := context.WithTimeout(c.Request.Context(), 8*time.Minute)
	defer verifyCancel()
	verification := WaitVerifyK8sDashboardMonitoringStack(verifyCtx, app.K8s(), 10*time.Second, 7*time.Minute+30*time.Second)
	msg := "已安装 metrics-server、Kubernetes Dashboard 2.7（recommended）及登录用 ServiceAccount kube-bt-sync-dashboard-admin；清单走国内友好下载线，容器镜像默认改写为 DaoCloud 加速前缀（与 ingress 一致，未关闭 registry 镜像改写时）。"
	if !verification.OK {
		msg += " 自检未全部通过，请展开 verification 查看明细与处理建议。"
	}
	SetAuditDetail(c, fmt.Sprintf("一键安装 K8s Dashboard+metrics-server verify_ok=%v kubelet_insecure_tls=%v", verification.OK, kubeTLS))
	c.JSON(http.StatusOK, gin.H{
		"ok":                 true,
		"message":            msg,
		"manifestMirror":     K8sAddonsManifestMirrorCanonical(mirror),
		"kubeletInsecureTls": kubeTLS,
		"verification":       verification,
		"loginTokenHint":     "kubectl create token kube-bt-sync-dashboard-admin -n kubernetes-dashboard --duration=24h",
		"prometheusHint":     "本平台「集群 → 监控」等页面的 Prometheus / vmselect 地址仍在集群设置中单独配置 prometheusUrlK8s、vmSelectUrlK8s；与 Dashboard Web UI 独立。若需完整 PromQL 指标栈，可另装 kube-prometheus-stack 后填入集群内 Service URL。",
	})
}

func handleK8sAddonsDashboardMonitoringVerify(c *gin.Context, app *ServerApp) {
	if !GuardK8s(c, app.K8s()) {
		return
	}
	maxSec, _ := strconv.Atoi(c.DefaultQuery("maxWaitSec", "120"))
	if maxSec < 1 {
		maxSec = 1
	}
	if maxSec > 600 {
		maxSec = 600
	}
	wait := time.Duration(maxSec) * time.Second
	vctx, cancel := context.WithTimeout(c.Request.Context(), wait)
	defer cancel()
	verification := WaitVerifyK8sDashboardMonitoringStack(vctx, app.K8s(), 8*time.Second, wait)
	c.JSON(http.StatusOK, gin.H{"verification": verification})
}

type k8sAddonsKubePromBody struct {
	ManifestMirror           string   `json:"manifestMirror"`
	GrafanaEnabled           bool     `json:"grafanaEnabled"`
	AlertmanagerEnabled      bool     `json:"alertmanagerEnabled"`
	AutoSwitchPrometheusURL  *bool    `json:"autoSwitchPrometheusUrl"`
	ClearVMSelect            *bool    `json:"clearVmSelect"`
	KubeEtcdEnabled          *bool    `json:"kubeEtcdEnabled"`
	KubeEtcdEndpoints        []string `json:"kubeEtcdEndpoints"`
	KubeEtcdServiceEnabled   *bool    `json:"kubeEtcdServiceEnabled"`
	KubeEtcdPort             *int     `json:"kubeEtcdPort"`
	KubeEtcdTargetPort       *int     `json:"kubeEtcdTargetPort"`
}

func handleK8sAddonsKubePrometheusStackInstall(c *gin.Context, app *ServerApp) {
	if !GuardK8sREST(c, app.K8s(), app.K8sREST()) {
		return
	}
	var body k8sAddonsKubePromBody
	_ = c.ShouldBindJSON(&body)
	cfg := app.Cfg()
	mirror := resolveManifestMirror(body.ManifestMirror, cfg)
	autoSwitch := true
	if body.AutoSwitchPrometheusURL != nil {
		autoSwitch = *body.AutoSwitchPrometheusURL
	}
	clearVM := true
	if body.ClearVMSelect != nil {
		clearVM = *body.ClearVMSelect
	}
	etcdEnabled := body.KubeEtcdEnabled != nil && *body.KubeEtcdEnabled
	var etcdEps []string
	for _, e := range body.KubeEtcdEndpoints {
		t := strings.TrimSpace(e)
		if t != "" {
			etcdEps = append(etcdEps, t)
		}
	}
	if etcdEnabled && len(etcdEps) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "已启用 etcd 抓取，但未填写任何 control-plane 地址。请在 kubeEtcd.endpoints 中填入 Master IP（每行或逗号分隔）。"})
		return
	}
	etcdSvc := true
	if body.KubeEtcdServiceEnabled != nil {
		etcdSvc = *body.KubeEtcdServiceEnabled
	}
	etcdPort := 2381
	if body.KubeEtcdPort != nil && *body.KubeEtcdPort > 0 && *body.KubeEtcdPort <= 65535 {
		etcdPort = *body.KubeEtcdPort
	}
	etcdTgt := 2381
	if body.KubeEtcdTargetPort != nil && *body.KubeEtcdTargetPort > 0 && *body.KubeEtcdTargetPort <= 65535 {
		etcdTgt = *body.KubeEtcdTargetPort
	}
	opts := KubePromStackInstallOpts{
		GrafanaEnabled:          body.GrafanaEnabled,
		AlertmanagerEnabled:     body.AlertmanagerEnabled,
		AutoSwitchPrometheusURL: autoSwitch,
		ClearVMSelect:           clearVM,
		KubeEtcdEnabled:         etcdEnabled,
		KubeEtcdEndpoints:       etcdEps,
		KubeEtcdServiceEnabled:  etcdSvc,
		KubeEtcdPort:            etcdPort,
		KubeEtcdTargetPort:      etcdTgt,
	}
	valuesYAML := buildKubePromStackValuesYAML(opts)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 28*time.Minute)
	defer cancel()
	res, err := InstallKubePrometheusStack(ctx, app, mirror, cfg, opts)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	verifyCtx, verifyCancel := context.WithTimeout(c.Request.Context(), 16*time.Minute)
	defer verifyCancel()
	verification := WaitKubePrometheusStackRollout(verifyCtx, app.K8s(), 15*time.Minute)

	patched := ""
	var patchErr error
	if autoSwitch && strings.TrimSpace(res.PrometheusBaseURL) != "" {
		patchErr = PatchRuntimePrometheusK8sURL(app, res.PrometheusBaseURL, clearVM)
		if patchErr == nil {
			patched = strings.TrimSpace(res.PrometheusBaseURL)
		}
	}
	msg := "kube-prometheus-stack 已应用至命名空间 " + kubePromStackNamespace + "（含 Prometheus Operator、Prometheus、kube-state-metrics、node-exporter，并默认抓取 apiserver / kube-controller-manager / kube-scheduler 等 ServiceMonitor）。"
	if etcdEnabled && len(etcdEps) > 0 {
		msg += " 已按表单启用 kubeEtcd（chart 将在 kube-system 生成 Service/Endpoints 与 ServiceMonitor，抓取 metrics 端口）；请到 Prometheus Targets 确认 etcd 为 UP，侧栏「etcd」页可查看 WAL / Leader 等指标。"
	}
	if autoSwitch {
		if patchErr != nil {
			msg += " 自动写入 prometheusUrlK8s 失败，请手动填写：" + res.PrometheusBaseURL + "（原因：" + patchErr.Error() + "）"
		} else if patched != "" {
			msg += " 已将运行时 prometheusUrlK8s 指向 " + patched + "。"
			if clearVM {
				msg += " 已清空 vmSelectUrlK8s。"
			}
		}
	}
	if !verification.OK {
		msg += " 组件自检未全部通过，请查看 verification。"
	}
	SetAuditDetail(c, fmt.Sprintf("一键安装 kube-prometheus-stack verify_ok=%v auto_prometheus_url=%v kube_etcd=%v", verification.OK, patched != "", etcdEnabled && len(etcdEps) > 0))
	c.JSON(http.StatusOK, gin.H{
		"ok":                         true,
		"message":                    msg,
		"manifestMirror":             K8sAddonsManifestMirrorCanonical(mirror),
		"prometheusBaseURL":          res.PrometheusBaseURL,
		"prometheusService":          res.ServiceName,
		"namespace":                  res.Namespace,
		"runtimePrometheusPatched":   patched != "",
		"patchedPrometheusUrlK8s":    patched,
		"patchError":                 errStringPtr(patchErr),
		"verification":               verification,
		"reachableHint":              "若 kube-bt-sync 进程运行在集群外，可能无法解析 .svc 地址；请将 prometheusUrlK8s 改为 NodePort、Ingress 或 kubectl port-forward 可达的 URL。",
		"kubePromStackValuesYaml":    valuesYAML,
		"kubeEtcd": gin.H{
			"enabled":         etcdEnabled,
			"endpoints":       etcdEps,
			"serviceEnabled":  etcdSvc,
			"port":            etcdPort,
			"targetPort":      etcdTgt,
		},
	})
}

func errStringPtr(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func handleK8sAddonsKubePrometheusStackVerify(c *gin.Context, app *ServerApp) {
	if !GuardK8s(c, app.K8s()) {
		return
	}
	maxSec, _ := strconv.Atoi(c.DefaultQuery("maxWaitSec", "300"))
	if maxSec < 1 {
		maxSec = 1
	}
	if maxSec > 1200 {
		maxSec = 1200
	}
	wait := time.Duration(maxSec) * time.Second
	vctx, cancel := context.WithTimeout(c.Request.Context(), wait)
	defer cancel()
	verification := WaitKubePrometheusStackRollout(vctx, app.K8s(), wait)
	c.JSON(http.StatusOK, gin.H{"verification": verification})
}
