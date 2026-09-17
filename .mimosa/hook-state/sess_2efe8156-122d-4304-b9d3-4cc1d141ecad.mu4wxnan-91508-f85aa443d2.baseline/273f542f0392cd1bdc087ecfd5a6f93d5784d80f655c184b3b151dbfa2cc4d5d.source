package internal

import "strings"

// runtimeSettingsAuditSummary 生成运行配置变更的人类可读摘要（不写敏感值）。
func runtimeSettingsAuditSummary(cur, next *RuntimeSettings) string {
	if cur == nil || next == nil {
		return "运行配置已保存"
	}
	var parts []string
	add := func(label string, a, b string) {
		if strings.TrimSpace(a) != strings.TrimSpace(b) {
			parts = append(parts, label)
		}
	}
	addI := func(label string, a, b int) {
		if a != b {
			parts = append(parts, label)
		}
	}
	addB := func(label string, a, b bool) {
		if a != b {
			parts = append(parts, label)
		}
	}
	addP := func(label string, a, b *bool) {
		if !boolPtrEqual(a, b) {
			parts = append(parts, label)
		}
	}
	addPI := func(label string, a, b *int) {
		if !intPtrEqual(a, b) {
			parts = append(parts, label)
		}
	}

	add("宝塔面板 URL", cur.BaotaURL, next.BaotaURL)
	if runtimeBaotaTargetsAuditChanged(cur.BaotaTargets, next.BaotaTargets) {
		parts = append(parts, "多宝塔实例列表")
	}
	addP("宝塔跳过 TLS", cur.BaotaSkipTLSVerify, next.BaotaSkipTLSVerify)
	addP("宝塔禁用 Keep-Alive", cur.BaotaDisableHTTPKeepAlive, next.BaotaDisableHTTPKeepAlive)
	addI("宝塔 HTTP 超时(s)", cur.BaotaHTTPTimeoutSec, next.BaotaHTTPTimeoutSec)
	addI("宝塔 TCP 探活超时(s)", cur.BaotaTCPProbeTimeoutSec, next.BaotaTCPProbeTimeoutSec)
	addI("宝塔探活最小间隔(s)", cur.BaotaCheckMinIntervalSec, next.BaotaCheckMinIntervalSec)
	add("DDNS 域名", cur.DDNSHost, next.DDNSHost)
	add("默认端口", cur.DefaultPort, next.DefaultPort)
	add("宝塔 SSL 证书名", cur.BaotaSSLCertName, next.BaotaSSLCertName)
	add("宝塔 SSL PEM 路径", cur.BaotaSSLPemPath, next.BaotaSSLPemPath)
	add("宝塔 SSL KEY 路径", cur.BaotaSSLKeyPath, next.BaotaSSLKeyPath)
	if next.ClearBaotaSSLMaterial {
		parts = append(parts, "清空宝塔 HTTPS 证书内容")
	} else if strings.TrimSpace(next.BaotaSSLPemContent) != "" || strings.TrimSpace(next.BaotaSSLKeyContent) != "" {
		parts = append(parts, "更新宝塔 HTTPS 证书内容")
	}
	addI("同步间隔(s)", cur.SyncIntervalSec, next.SyncIntervalSec)
	add("控制台用户", cur.DashboardUser, next.DashboardUser)
	if cur.DashboardPassword != next.DashboardPassword {
		parts = append(parts, "控制台密码")
	}
	add("控制台监听地址", cur.DashboardListenAddr, next.DashboardListenAddr)
	addI("会话有效天数", cur.DashboardSessionDays, next.DashboardSessionDays)
	addB("会话 Cookie Secure", cur.DashboardCookieSecure, next.DashboardCookieSecure)
	add("OIDC Issuer", cur.OIDCIssuerURL, next.OIDCIssuerURL)
	add("OIDC Client ID", cur.OIDCClientID, next.OIDCClientID)
	if cur.OIDCClientSecret != next.OIDCClientSecret {
		parts = append(parts, "OIDC Client Secret")
	}
	add("OIDC Redirect URL", cur.OIDCRedirectURL, next.OIDCRedirectURL)
	add("OIDC Scopes", cur.OIDCScopes, next.OIDCScopes)
	addP("OIDC 跳过 Issuer 校验", cur.OIDCSkipIssuerCheck, next.OIDCSkipIssuerCheck)
	addP("OIDC 跳过 ClientID/Aud 校验", cur.OIDCSkipClientIDCheck, next.OIDCSkipClientIDCheck)
	add("OIDC 签名算法列表", cur.OIDCSupportedSigningAlgs, next.OIDCSupportedSigningAlgs)
	addPI("OIDC 时钟偏移(s)", cur.OIDCClockSkewSec, next.OIDCClockSkewSec)
	add("Prometheus URL（全局）", cur.PrometheusURL, next.PrometheusURL)
	add("Prometheus URL（K8s）", cur.PrometheusURLK8s, next.PrometheusURLK8s)
	add("Prometheus URL（vCenter）", cur.PrometheusURLVCenter, next.PrometheusURLVCenter)
	add("Prometheus URL（公有云）", cur.PrometheusURLCloud, next.PrometheusURLCloud)
	add("VictoriaMetrics URL（K8s）", cur.VMSelectURLK8s, next.VMSelectURLK8s)
	add("VictoriaMetrics URL（vCenter）", cur.VMSelectURLVCenter, next.VMSelectURLVCenter)
	add("VictoriaMetrics URL（公有云）", cur.VMSelectURLCloud, next.VMSelectURLCloud)
	add("VictoriaLogs URL", cur.VictoriaLogsURL, next.VictoriaLogsURL)
	add("VMLog Vector 下载基址", cur.VMLogVectorDownloadBaseURL, next.VMLogVectorDownloadBaseURL)
	addI("VictoriaLogs 保留天数", cur.VictoriaLogsRetentionDays, next.VictoriaLogsRetentionDays)
	add("Harbor URL", cur.HarborBaseURL, next.HarborBaseURL)
	add("Harbor 用户名", cur.HarborUsername, next.HarborUsername)
	addB("Harbor 跳过 TLS", cur.HarborSkipTLS, next.HarborSkipTLS)
	if cur.HarborPassword != next.HarborPassword {
		parts = append(parts, "Harbor 密码或 Robot Secret")
	}
	addI("Prometheus 超时(s)", cur.PrometheusTimeoutSec, next.PrometheusTimeoutSec)
	addB("Prometheus 跳过 TLS", cur.PrometheusSkipTLS, next.PrometheusSkipTLS)
	if cur.PrometheusBearerToken != next.PrometheusBearerToken {
		parts = append(parts, "Prometheus Bearer Token")
	}
	add("vCenter URL", cur.VCenterURL, next.VCenterURL)
	add("vCenter 用户", cur.VCenterUser, next.VCenterUser)
	if cur.VCenterPassword != next.VCenterPassword {
		parts = append(parts, "vCenter 密码")
	}
	addB("vCenter 跳过 TLS", cur.VCenterInsecure, next.VCenterInsecure)
	add("WebMKS 脚本 URL", cur.VCenterWmksScriptURL, next.VCenterWmksScriptURL)
	add("WebMKS CSS URL", cur.VCenterWmksCssURL, next.VCenterWmksCssURL)
	add("vCenter UI 基址", cur.VCenterUIBaseURL, next.VCenterUIBaseURL)
	add("ESXi 控制台拨号地址", cur.VCenterConsoleHost, next.VCenterConsoleHost)
	add("vCenter UI 指纹", cur.VCenterUIThumbprint, next.VCenterUIThumbprint)
	add("VM SSH 用户", cur.VCenterVMSshUser, next.VCenterVMSshUser)
	add("VM SSH 私钥路径", cur.VCenterVMSshPrivateKeyPath, next.VCenterVMSshPrivateKeyPath)
	if cur.VCenterVMSshPassword != next.VCenterVMSshPassword {
		parts = append(parts, "VM SSH 密码")
	}
	if cur.VCenterVMSshKeyPassphrase != next.VCenterVMSshKeyPassphrase {
		parts = append(parts, "VM SSH 私钥口令")
	}
	addI("VM SSH 端口", cur.VCenterVMSshPort, next.VCenterVMSshPort)
	addB("VM SSH 跳过主机密钥校验", cur.VCenterVMSshInsecureHostKey, next.VCenterVMSshInsecureHostKey)
	add("VM SSH 主机密钥指纹", cur.VCenterVMSshHostKeyFingerprint, next.VCenterVMSshHostKeyFingerprint)
	add("SSH 存储后端", cur.SSHSettingsBackend, next.SSHSettingsBackend)
	if cur.EncryptionKey != next.EncryptionKey {
		parts = append(parts, "加密密钥 KUBEBT_ENCRYPTION_KEY")
	}
	add("Redis 地址", cur.RedisAddr, next.RedisAddr)
	if cur.RedisPassword != next.RedisPassword {
		parts = append(parts, "Redis 密码")
	}
	addI("Redis DB", cur.RedisDB, next.RedisDB)
	add("Redis 前缀", cur.RedisKeyPrefix, next.RedisKeyPrefix)
	add("Redis 模式", cur.RedisMode, next.RedisMode)
	add("Redis 主机", cur.RedisHost, next.RedisHost)
	addI("Redis 端口", cur.RedisPort, next.RedisPort)
	add("Redis Sentinel Master", cur.RedisSentinelMaster, next.RedisSentinelMaster)
	add("MySQL DSN", cur.MySQLDSN, next.MySQLDSN)
	add("MySQL 主机", cur.MySQLHost, next.MySQLHost)
	addI("MySQL 端口", cur.MySQLPort, next.MySQLPort)
	add("MySQL 库名", cur.MySQLDatabase, next.MySQLDatabase)
	add("MySQL 用户", cur.MySQLUser, next.MySQLUser)
	if cur.MySQLPassword != next.MySQLPassword {
		parts = append(parts, "MySQL 密码")
	}
	add("SSH 设置目录", cur.SSHSettingsDir, next.SSHSettingsDir)
	add("平台对外 URL", cur.PlatformPublicURL, next.PlatformPublicURL)
	add("平台显示名称", cur.PlatformDisplayName, next.PlatformDisplayName)
	add("平台 Logo URL", cur.PlatformLogoURL, next.PlatformLogoURL)
	add("平台 favicon URL", cur.PlatformFaviconURL, next.PlatformFaviconURL)
	add("静态资源 CDN 根", cur.AssetsCDNBaseURL, next.AssetsCDNBaseURL)
	add("SSH 终端字体", cur.SshTerminalFontFamily, next.SshTerminalFontFamily)
	addI("SSH 终端字号", cur.SshTerminalFontSize, next.SshTerminalFontSize)
	addB("Ingress↔宝塔同步", cur.IngressBaotaSyncEnabled, next.IngressBaotaSyncEnabled)
	addI("Ingress-Nginx Host HTTP 端口", cur.IngressNginxHostHTTPPort, next.IngressNginxHostHTTPPort)
	addI("Ingress-Nginx Host HTTPS 端口", cur.IngressNginxHostHTTPSPort, next.IngressNginxHostHTTPSPort)
	add("Ingress-Nginx 控制器节点", cur.IngressNginxControllerNodeName, next.IngressNginxControllerNodeName)
	add("Ingress-Nginx 清单 URL", cur.IngressNginxManifestURL, next.IngressNginxManifestURL)
	add("K8s 扩展清单镜像模式", cur.K8sAddonsManifestMirror, next.K8sAddonsManifestMirror)
	addI("vCenter 缓存 TTL(s)", cur.VCenterCacheTTLSec, next.VCenterCacheTTLSec)
	if k8sSidebarMenuChanged(cur.K8sSidebarMenu, next.K8sSidebarMenu) {
		parts = append(parts, "Kubernetes 侧栏菜单")
	}
	if k8sBlockChanged(cur.K8s, next.K8s) {
		parts = append(parts, "Kubernetes 连接（模式或 Kubeconfig）")
	}
	add("iDRAC 地址", cur.IdracHost, next.IdracHost)
	add("iDRAC 用户", cur.IdracUser, next.IdracUser)
	if cur.IdracPassword != next.IdracPassword {
		parts = append(parts, "iDRAC 密码")
	}
	addB("iDRAC 跳过 TLS", cur.IdracInsecure, next.IdracInsecure)
	if cur.BaotaAPIKey != next.BaotaAPIKey {
		parts = append(parts, "宝塔 API Key")
	}
	if len(parts) == 0 {
		return "运行配置已保存（与上次相比无检测到的字段变更）"
	}
	return "变更项：" + strings.Join(parts, "、")
}

func boolPtrEqual(a, b *bool) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

func intPtrEqual(a, b *int) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

func k8sBlockChanged(a, b *RuntimeK8s) bool {
	if a == nil && b == nil {
		return false
	}
	if a == nil || b == nil {
		return true
	}
	if strings.TrimSpace(a.Mode) != strings.TrimSpace(b.Mode) {
		return true
	}
	if strings.TrimSpace(a.KubeconfigYAML) != strings.TrimSpace(b.KubeconfigYAML) {
		return true
	}
	return false
}

func k8sSidebarMenuChanged(a, b []RuntimeK8sSidebarMenuItem) bool {
	na, _ := normalizeRuntimeK8sSidebarMenu(a)
	nb, _ := normalizeRuntimeK8sSidebarMenu(b)
	if len(na) != len(nb) {
		return true
	}
	for i := range na {
		if na[i].Key != nb[i].Key ||
			strings.TrimSpace(na[i].Label) != strings.TrimSpace(nb[i].Label) ||
			na[i].Hidden != nb[i].Hidden ||
			na[i].Order != nb[i].Order {
			return true
		}
	}
	return false
}
