package internal

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// legacyViewerForbiddenK8sPodsAPI Legacy viewer：允许 Pod 列表/详情/日志与 Prometheus 类只读接口；
// 禁止 WebSocket 终端与 DELETE Pod（与自定义权限下 K8sPodExec/K8sPodDelete 语义对齐）。
func legacyViewerForbiddenK8sPodsAPI(method, path string) bool {
	if strings.Contains(path, "/exec/ws") {
		return true
	}
	if method == http.MethodDelete && strings.HasPrefix(path, "/api/k8s/pods/") {
		return true
	}
	if method == http.MethodGet || method == http.MethodHead {
		switch path {
		case "/api/k8s/pods", "/api/k8s/pods/metrics", "/api/k8s/pods/resource-efficiency":
			return false
		default:
			if strings.HasPrefix(path, "/api/k8s/pods/") {
				return false
			}
			return true
		}
	}
	return true
}

// viewerEndpointForbidden 仅读角色禁止访问的接口（敏感操作、Pod、虚拟机控制台/SSH、云主机、审计、运行时密钥等）。
func viewerEndpointForbidden(method, path string) bool {
	if strings.HasPrefix(path, "/api/k8s/pods") {
		return legacyViewerForbiddenK8sPodsAPI(method, path)
	}
	// 重启 AI 报告/rollup：可能含业务日志摘录，与 Pod 详情权限对齐，仅非 viewer 可访问
	if strings.HasPrefix(path, "/api/k8s/pod-restart-ai/") {
		return true
	}
	if strings.HasPrefix(path, "/api/k8s/pvc-files") {
		return true
	}
	if strings.HasPrefix(path, "/api/settings/runtime") {
		return true
	}
	if path == "/api/ingress/yaml" && method == http.MethodPost {
		return true
	}
	if path == "/api/ingress/delete" && method == http.MethodPost {
		return true
	}
	if strings.HasPrefix(path, "/api/baota/") && method == http.MethodPost {
		return true
	}
	if path == "/api/k8s/apply-yaml" && method == http.MethodPost {
		return true
	}
	if method == http.MethodPost && strings.Contains(path, "/api/k8s/deployments/") && strings.HasSuffix(path, "/restart") {
		return true
	}
	if path == "/api/k8s/workloads/patch-container-resources" && method == http.MethodPost {
		return true
	}
	if strings.HasPrefix(path, "/api/k8s/objects") && method == http.MethodDelete {
		return true
	}
	if path == "/api/prometheus/source" && method == http.MethodPost {
		return true
	}
	if strings.HasPrefix(path, "/api/cloud-hosts") {
		return true
	}
	if strings.HasPrefix(path, "/api/toolbox/") {
		return true
	}
	// 应用中心：纳管 Redis 连接写入、删键、安装脚本生成仅管理员
	if strings.HasPrefix(path, "/api/app-center/redis/instances") {
		if method == http.MethodPost && path == "/api/app-center/redis/instances" {
			return true
		}
		if method == http.MethodPut || method == http.MethodDelete {
			return true
		}
		if method == http.MethodPost && strings.Contains(path, "/keys/delete") {
			return true
		}
		if strings.Contains(path, "/redis-cli/ws") {
			return true
		}
	}
	if path == "/api/app-center/redis/install-script" && method == http.MethodPost {
		return true
	}
	if path == "/api/app-center/redis/k8s-deploy" && method == http.MethodPost {
		return true
	}
	if path == "/api/app-center/cloud-vm/bootstrap" && method == http.MethodPut {
		return true
	}
	if path == "/api/app-center/openclaw/bootstrap" && method == http.MethodPut {
		return true
	}
	if path == "/api/app-center/cloud-vm/instances" && method == http.MethodPost {
		return true
	}
	if strings.HasPrefix(path, "/api/app-center/cloud-vm/instances/") && method == http.MethodDelete {
		return true
	}
	if strings.HasPrefix(path, "/api/app-center/cloud-vm/instances/") && method == http.MethodPut {
		return true
	}
	if strings.HasPrefix(path, "/api/app-center/cloud-vm/instances/") && method == http.MethodPost {
		return true
	}
	if method == http.MethodPost && strings.Contains(path, "/api/k8s/pvcs/") && strings.HasSuffix(path, "/expand") {
		return true
	}
	// 云主机 Web SSH 及预检（与 GET 实例详情权限不同：旧版只读可看详情但不能连 SSH）
	if strings.Contains(path, "/api/app-center/cloud-vm/") && strings.Contains(path, "/ssh/") {
		return true
	}
	if path == "/api/app-center/openclaw/k8s-deploy" && method == http.MethodPost {
		return true
	}
	if strings.Contains(path, "/api/app-center/openclaw/instances/") && strings.HasSuffix(path, "/sync-to-inspect") && method == http.MethodPost {
		return true
	}
	if strings.Contains(path, "/api/app-center/openclaw/instances/") && strings.Contains(path, "/gateway-token") {
		return true
	}
	if strings.Contains(path, "/api/app-center/openclaw/instances/") && strings.Contains(path, "/file") {
		return true
	}
	if strings.Contains(path, "/api/app-center/openclaw/instances/") && strings.Contains(path, "/chat-model") && method == http.MethodPost {
		return true
	}
	if strings.Contains(path, "/api/app-center/openclaw/instances/") && strings.Contains(path, "/apply-upstream-runtime") && method == http.MethodPost {
		return true
	}
	if strings.Contains(path, "/api/app-center/openclaw/instances/") && strings.Contains(path, "/telegram-settings") && method == http.MethodPut {
		return true
	}
	if strings.Contains(path, "/api/app-center/openclaw/instances/") && strings.Contains(path, "/google-reachability-check") && method == http.MethodPost {
		return true
	}
	if strings.Contains(path, "/api/app-center/openclaw/instances/") && strings.Contains(path, "/telegram-verify") && method == http.MethodPost {
		return true
	}
	if strings.Contains(path, "/api/app-center/openclaw/instances/") && strings.Contains(path, "/apply-telegram-to-openclaw-json") && method == http.MethodPost {
		return true
	}
	if strings.Contains(path, "/api/app-center/openclaw/instances/") && strings.Contains(path, "/egress-proxy") && method == http.MethodPost {
		return true
	}
	if strings.Contains(path, "/api/app-center/openclaw/instances/") && strings.Contains(path, "/rbac-preset") && method == http.MethodPost {
		return true
	}
	if strings.Contains(path, "/api/app-center/openclaw/instances/") && strings.Contains(path, "/apply-toolchain-preset") && method == http.MethodPost {
		return true
	}
	if strings.HasPrefix(path, "/api/app-center/openclaw/instances/") && method == http.MethodDelete {
		return true
	}
	if path == "/api/app-center/kafka/k8s-deploy" && method == http.MethodPost {
		return true
	}
	if strings.HasPrefix(path, "/api/app-center/kafka/templates") && method != http.MethodGet {
		return true
	}
	if strings.HasPrefix(path, "/api/app-center/kafka/instances/") && (method == http.MethodPost || method == http.MethodDelete || method == http.MethodPut) {
		return true
	}
	if strings.HasPrefix(path, "/api/admin/") {
		return true
	}
	if strings.HasPrefix(path, "/api/audit/") {
		// 仅管理员可读审计（另由 AdminOnlyMiddleware 限制）
		return true
	}
	if path == "/api/k8s/object-yaml" {
		return true
	}
	if strings.HasPrefix(path, "/api/k8s/object-revisions") {
		return true
	}
	if strings.HasPrefix(path, "/api/k8s/object-json") {
		return true
	}
	if strings.HasPrefix(path, "/api/k8s/configmaps") {
		return true
	}
	if strings.HasPrefix(path, "/api/k8s/secrets") {
		return true
	}
	if path == "/api/k8s/secret-data" {
		return true
	}
	// CRD / 自定义资源：viewer 仅可 GET（含清单与 YAML）
	if strings.HasPrefix(path, "/api/k8s/crds") {
		if method != http.MethodGet && method != http.MethodHead {
			return true
		}
	}
	if !strings.HasPrefix(path, "/api/vcenter/") {
		return false
	}
	if strings.Contains(path, "/ssh") || strings.Contains(path, "/sftp/") {
		return true
	}
	if strings.Contains(path, "console-ws") || strings.Contains(path, "/webmks") {
		return true
	}
	if strings.Contains(path, "/ssh-settings") {
		return true
	}
	if strings.Contains(path, "/listening-ports") || strings.Contains(path, "/tcp-established") {
		return true
	}
	if strings.Contains(path, "/power") && method == http.MethodPost {
		return true
	}
	if strings.Contains(path, "/hardware") && method == http.MethodPut {
		return true
	}
	if strings.Contains(path, "/disk/expand") {
		return true
	}
	return false
}

// ViewerRestrictionsMiddleware 在 DashboardAuthMiddleware 之后注册；viewer 角色禁止访问上述路由。
func ViewerRestrictionsMiddleware(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		if !cfg.DashboardAuthEnabled() {
			c.Next()
			return
		}
		roleVal, ok := c.Get("dashboardRole")
		if !ok {
			c.Next()
			return
		}
		role, _ := roleVal.(string)
		if role == DashboardRoleAdmin {
			c.Next()
			return
		}
		m := c.Request.Method
		p := c.Request.URL.Path
		eff := getEffectiveDashboardPermissionsFromGin(c)
		if eff.LegacyViewer {
			if viewerEndpointForbidden(m, p) {
				AbortAPIPermissionDenied(c)
				return
			}
			if appRedisPathIsSensitiveRead(p, m) && appRedisMaskSensitive(eff) {
				AbortAPIPermissionDenied(c)
				return
			}
			c.Next()
			return
		}
		if permissionEndpointForbidden(m, p, eff) {
			AbortAPIPermissionDenied(c)
			return
		}
		c.Next()
	}
}
