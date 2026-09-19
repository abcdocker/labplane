package internal

import (
	"encoding/json"
	"errors"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	BaotaURL    string
	BaotaAPIKey string
	// BaotaTargets 多实例（runtime baotaTargets）；nil 表示仅使用 BaotaURL/BaotaAPIKey。
	BaotaTargets       []BaotaTargetEntry `json:"-"`
	BaotaSkipTLSVerify bool
	// 默认 true：公网面板下复用连接易陈旧，易导致「awaiting headers」挂满直至 Client.Timeout；设为 false 可省握手。
	BaotaDisableHTTPKeepAlive bool
	BaotaHTTPTimeout          time.Duration
	BaotaTCPProbeTimeout      time.Duration // /api/system/check 等对 BAOTA_URL 仅做 TCP 探活，不调用 HTTP API
	BaotaCheckMinInterval     time.Duration // 对宝塔 TCP 探活结果的最小缓存间隔；0 表示每次请求都拨号
	DDNSHost                  string
	DefaultPort               string
	BaotaUpstreamHost         string
	BaotaUpstreamPort         string
	BaotaUpstreamScheme       string
	BaotaSSLCertName          string // 证书夹中证书标识（目录名），用于 SetCertToSite；可被 Ingress 注解覆盖
	BaotaSSLPemPath           string // 本地 PEM 证书文件路径；需与 BaotaSSLKeyPath 成对出现
	BaotaSSLKeyPath           string // 本地 KEY 私钥文件路径；需与 BaotaSSLPemPath 成对出现
	SyncInterval              time.Duration
	// Dashboard 登录（设置 DASHBOARD_PASSWORD 后启用；空密码表示不启用）
	DashboardUser          string
	DashboardPassword      string
	DashboardSessionSecret string
	DashboardSessionDays   int
	DashboardCookieSecure  bool // HTTPS 部署时建议 true
	// DashboardListenAddr 监听地址，如 :8080、:18080；默认 :8080。环境变量 DASHBOARD_HTTP_ADDR。
	DashboardListenAddr string
	// DASHBOARD_TRUSTED_PROXIES：逗号分隔的 CIDR 或单 IP（Ingress/Nginx/CDN 等上一跳网段），与 Gin SetTrustedProxies 一致；仅当直连 RemoteAddr 落在这些网段内时才信任 X-Forwarded-For / X-Real-IP。未设置且进程在 Kubernetes 内（存在 KUBERNETES_SERVICE_HOST）时，自动使用 RFC1918 + ULA + 回环默认列表，以便记录 Ingress 后的真实客户端 IP；裸机/公网直连未设时仍为空（不信任 XFF，防伪造）。
	DashboardTrustedProxies string
	// DASHBOARD_ACCESS_LOG：是否记录访问日志（含解析后的客户端 IP，供审计）；默认 true。
	DashboardAccessLog          bool
	resolvedDashboardSessionKey []byte
	// Prometheus 可选：监控页代理查询（kube-prometheus 等）
	PrometheusURL        string // 兜底：PROMETHEUS_URL / runtime prometheusUrl
	PrometheusURLK8s     string // Kubernetes 集群监控专用
	PrometheusURLVCenter string // vCenter 相关监控
	PrometheusURLCloud   string // 公有云主机列表；空则继承 PrometheusURLVCenter 再兜底
	// VictoriaMetrics vmselect（Prometheus 查询兼容）；按 scope 非空时优先于对应 PrometheusURL*
	VMSelectURLK8s     string
	VMSelectURLVCenter string
	VMSelectURLCloud   string
	// VictoriaLogs（VMLog）HTTP 根地址，如 http://victoria-logs.monitoring.svc:9428；用于 LogsQL 查询代理
	VictoriaLogsURL string
	// VMLogVectorDownloadBaseURL：虚拟机/宝塔日志采集助手下载 Vector 的自定义基址（无尾斜杠）。
	// 若填写，例如 http://10.0.0.8:8081/vector，则脚本会优先尝试
	// http://10.0.0.8:8081/vector/vector-<version>-<arch>.tar.gz，再回退到内置镜像线与 GitHub。
	VMLogVectorDownloadBaseURL string
	// VictoriaLogsSkipTLS：自签证书时跳过 TLS 校验（内网 https）
	VictoriaLogsSkipTLS bool
	// GeoLite2CountryMMDB：MaxMind GeoLite2-Country.mmdb 本地路径（可选）；用于日志查询 Nginx 访问统计的国家/地区聚合
	GeoLite2CountryMMDB   string
	PrometheusTimeout     time.Duration
	PrometheusSkipTLS     bool
	PrometheusBearerToken string
	// iDRAC 带外（单台；Redfish 物理盘；runtime-config idracHost 等）
	IdracHost     string
	IdracUser     string
	IdracPassword string
	IdracInsecure bool
	// iDRAC VNC 控制台（需先在 iDRAC 设置中启用 VNC Server）
	IdracVncPort     int
	IdracVncPassword string
	// vCenter / vSphere（可选）：虚拟机与 WebMKS 控制台
	VCenterURL      string // 如 https://vcenter.example.com 或 https://vcenter/sdk
	VCenterUser     string
	VCenterPassword string
	VCenterInsecure bool // 跳过 TLS 校验（自签证书）
	// 旧版兼容字段：当前原生控制台已改用内置 noVNC + 后端 WebMKS WebSocket。
	VCenterWmksScriptURL string
	VCenterWmksCssURL    string
	// vSphere UI 外部链接配置；不参与内嵌控制台连接。
	VCenterUIBaseURL string
	// WebMKS 后端拨号地址覆盖；当票据返回的 ESXi 主机名无法被 Pod DNS 解析时填写管理 IP 或 host:port。
	VCenterConsoleHost string
	// VCenterConsoleProxyURL 已废弃，仅保留旧配置兼容。vCenter /ui/webmks
	// 依赖 vSphere Client SSO，不能作为平台服务端的 WebMKS 代理。
	VCenterConsoleProxyURL string
	// 旧版兼容字段；不参与内嵌控制台连接。
	VCenterUIThumbprint string
	// 虚拟机 SSH（页面内终端）：浏览器仅连 Dashboard；SSH 由本进程向 Guest IP 拨号转发，凭据在服务端。运维需将本进程部署在能访问该 IP:端口的网络中。
	VCenterVMSshUser               string
	VCenterVMSshPrivateKeyPath     string
	VCenterVMSshPassword           string
	VCenterVMSshKeyPassphrase      string // 加密私钥口令
	VCenterVMSshPort               int
	VCenterVMSshInsecureHostKey    bool   // true 时跳过 known_hosts 校验（内网常用）
	VCenterVMSshHostKeyFingerprint string // SHA256:...，安全模式下固定 Guest SSH 主机公钥
	// SSH 凭据持久化（可选）：redis / mysql；与 KUBEBT_ENCRYPTION_KEY 配合加密密码与私钥
	SSHSettingsBackend SSHSettingsBackend
	EncryptionKey      string // KUBEBT_ENCRYPTION_KEY
	// TotpIssuer 显示在 Authenticator 中的发行方名称（otpauth issuer）；默认 Kube-BT-Sync。环境变量 KUBEBT_TOTP_ISSUER。
	TotpIssuer     string
	RedisAddr      string
	RedisPassword  string
	RedisDB        int
	RedisKeyPrefix string
	// RedisMode：standalone（单机）| sentinel（哨兵）| cluster（集群）；轻量客户端仅连 redisHost:redisPort
	RedisMode           string
	RedisHost           string
	RedisPort           int
	RedisSentinelMaster string
	// 应用中心 Redis K8s 部署：Harbor/私有仓库前缀（无协议），如 harbor.example.com/library
	RedisImageRegistry string
	// 可选；为空时 exporter 使用与 Redis 相同前缀 + /redis_exporter:tag
	RedisExporterImageRegistry string
	// 可选；完整 redis_exporter 镜像（repository:tag），覆盖前缀拼接逻辑；环境变量 REDIS_EXPORTER_IMAGE
	RedisExporterImageFull string
	// 可选；Redis 主版本线 → 完整服务端镜像，JSON 如 {"7":"harbor.io/lib/redis:7.2"}；环境变量 REDIS_ENGINE_IMAGES_JSON
	RedisEngineImages map[string]string
	// 可选；拉取私网镜像时在 Pod 上使用的 imagePullSecrets 名称（需在目标命名空间预先创建 docker-registry Secret）
	RedisImagePullSecret string
	// 应用中心 Redis K8s 部署：持久化与默认 StorageClass（空则部署时自动选集群默认 SC）
	RedisK8sPersistenceEnabled bool
	RedisK8sStorageSize        string
	RedisK8sStorageClass       string
	MySQLDSN                   string
	MySQLHost                  string
	MySQLPort                  int
	MySQLDatabase              string
	MySQLUser                  string
	MySQLPassword              string
	// SSH_SETTINGS_BACKEND=file 时存放每虚拟机 JSON 的目录（建议 0700）
	SSHSettingsDir string
	// 平台对外访问根 URL（如 https://sync.example.com），用于回调与展示
	PlatformPublicURL string
	// 静态加速根 URL（无尾斜杠），须包含路径前缀如 https://cdn.example.com/cmdb；空则文档公开页、边缘模板、WMKS 前置 jQuery 等走默认公网 CDN
	AssetsCDNBaseURL string
	// 控制台标题与外观（可由 runtime-config 覆盖）
	PlatformDisplayName string
	PlatformLogoURL     string
	PlatformFaviconURL  string
	// Web SSH / xterm 字体（runtime-config 或 KUBEBT_SSH_TERMINAL_* 可覆盖）
	SshTerminalFontFamily string
	SshTerminalFontSize   int // 0 表示前端默认 13
	// Ingress→宝塔同步：在后台开启后才轮询同步；未开启时不访问 K8s Ingress / 宝塔 API
	IngressBaotaSyncEnabled bool
	IngressNginxManifestURL string
	// K8sAddonsManifestMirror：auto | ghproxy_preferred | direct | ghproxy_only
	K8sAddonsManifestMirror string
	// IngressNginxSkipK8sRegistryMirror：为 true 时不改写清单中的 registry.k8s.io（默认 false，国内安装会改写到 DaoCloud 等可拉取路径）
	IngressNginxSkipK8sRegistryMirror bool
	// IngressNginxK8sImageMirrorPrefix：覆盖 registry.k8s.io 的默认改写前缀（无协议、无尾斜杠），空则用 m.daocloud.io/registry.k8s.io
	IngressNginxK8sImageMirrorPrefix string
	// ingress-nginx 控制器 hostNetwork 模式下监听的 HTTP/HTTPS 端口（默认 80 / 443）
	IngressNginxHostHTTPPort  int32
	IngressNginxHostHTTPSPort int32
	// IngressNginxControllerNodeName：安装时默认将控制器固定到该 Node 名称（metadata.name，对应 nodeSelector kubernetes.io/hostname）；空表示不默认固定
	IngressNginxControllerNodeName string
	// vCenter 虚拟机列表在 Redis 中的缓存 TTL（秒）；0 表示默认 120
	VCenterCacheTTLSec int
	// 堡垒机拉取 VM 列表使用的独立 Redis 缓存 TTL（秒）；0 表示默认 3600，与仪表盘列表缓存分离以减轻刷新等待
	VCenterBastionVMListCacheTTLSec int
	// CLOUD_HOST_AUTO_INSTALL_NODE_EXPORTER：SSH 添加公有云主机后，若本机无 node_exporter 则尝试远程安装（需 root 或等价权限；默认 false）。
	CloudHostAutoInstallNodeExporter bool
	// NODE_EXPORTER_VERSION：自动安装时使用的发布版本号（不含 v 前缀）。
	NodeExporterVersion string
	// KUBEBT_RUNTIME_DUAL_WRITE_REDIS：为 true 且能连接 Redis 时，将 runtime-config 与 platform_kv 全量镜像到 Redis（无过期时间），便于在 Redis/运维侧可见与灾备恢复。
	RuntimeDualWriteRedis bool
	// OIDC（如 Authentik）：与 DASHBOARD_PASSWORD 可并存；四项均配置则启用授权码登录
	OIDCIssuerURL    string
	OIDCClientID     string
	OIDCClientSecret string
	OIDCRedirectURL  string
	OIDCScopes       string // 空格分隔，默认 openid profile email
	// OIDC 校验放宽（仅排查或明确信任网络时使用；跳过检查会降低 OpenID 安全保证）
	OIDCSkipIssuerCheck      bool
	OIDCSkipClientIDCheck    bool
	OIDCSupportedSigningAlgs string // 逗号分隔，如 RS256,ES256；空则由发现文档/库默认
	// OIDCClockSkewSec：本机时钟「快于」IdP 时 id_token 易被判过期；校验时将「当前时间」减去该秒数（0 表示不调整）
	OIDCClockSkewSec int
	// PerformanceMode：KUBEBT_PERFORMANCE_MODE=true 时 gin 使用 release 模式，且 /api/namespaces 可对 Redis 短缓存（需 Redis 可用）。
	PerformanceMode bool
	// NamespacesCacheTTLSec：性能模式下命名空间列表缓存秒数；0 表示使用默认 30。
	NamespacesCacheTTLSec int
	// EnableBackgroundJobs：KUBEBT_ENABLE_BACKGROUND_JOBS=false 时关闭定时同步/告警巡检等后台协程，仅保留 HTTP 与连接维护；多副本部署时应仅 1 个 Pod 为 true，其余为 false，避免宝塔同步、告警评估、出站通知等重复执行。
	EnableBackgroundJobs bool
	// Harbor 镜像仓库（可选）：控制台对接 Harbor API v2.0
	HarborBaseURL  string
	HarborUsername string
	HarborPassword string
	HarborSkipTLS  bool
	// 文档中心附件：腾讯云 COS（可选；与 COS 兼容的 AWS SigV4 PUT）。未配置时附件落盘到 dataDir/doc-uploads。
	CosSecretID   string
	CosSecretKey  string
	CosBucket     string // 含 APPID，如 mybucket-1250000000
	CosRegion     string // 如 ap-guangzhou
	CosPrefix     string // 对象键前缀，如 kubebt-docs
	CosPublicBase string // 可选 CDN 根，如 https://cdn.example.com（无尾斜杠）；空则用默认桶域名
}

// CosObjectStorageConfigured 是否启用 COS 上传（密钥与桶、地域齐全）。
func (c Config) CosObjectStorageConfigured() bool {
	return strings.TrimSpace(c.CosSecretID) != "" &&
		strings.TrimSpace(c.CosSecretKey) != "" &&
		strings.TrimSpace(c.CosBucket) != "" &&
		strings.TrimSpace(c.CosRegion) != ""
}

func (c Config) cosBucketHost() string {
	return strings.TrimSpace(c.CosBucket) + ".cos." + strings.TrimSpace(c.CosRegion) + ".myqcloud.com"
}

// dashboardTrustedProxiesK8sDefault：Pod 内直连来源多为 Ingress/Nginx 所在节点或集群私网 IP；
// 与这些网段匹配时 Gin 才采纳 X-Forwarded-For / X-Real-IP，从而记录真实用户 IP 而非上游 Pod IP。
const dashboardTrustedProxiesK8sDefault = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.1/32,::1/128,fc00::/7"

func resolveDashboardTrustedProxies() string {
	s := strings.TrimSpace(os.Getenv("DASHBOARD_TRUSTED_PROXIES"))
	if s != "" {
		return s
	}
	if strings.TrimSpace(os.Getenv("KUBERNETES_SERVICE_HOST")) == "" {
		return ""
	}
	log.Printf("config: DASHBOARD_TRUSTED_PROXIES 未设置，检测到 Kubernetes（KUBERNETES_SERVICE_HOST），使用私网/ULA 默认可信代理列表以解析 Ingress/Nginx 后的真实客户端 IP（X-Forwarded-For / X-Real-IP）")
	return dashboardTrustedProxiesK8sDefault
}

// parseJSONStringMapEnv 解析 JSON 对象（键值均为 string）；非法时打日志并返回 nil。
func parseJSONStringMapEnv(label, raw string) map[string]string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var m map[string]string
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		log.Printf("config: %s 解析失败: %v", label, err)
		return nil
	}
	out := make(map[string]string)
	for k, v := range m {
		kk, vv := strings.TrimSpace(k), strings.TrimSpace(v)
		if kk != "" && vv != "" {
			out[kk] = vv
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func LoadConfig() Config {
	baotaURL := getEnv("BAOTA_URL", "http://127.0.0.1:8888")
	timeoutSec := getEnvAsInt("BAOTA_HTTP_TIMEOUT_SEC", 45)
	if timeoutSec < 10 {
		timeoutSec = 10
	}
	if timeoutSec > 600 {
		timeoutSec = 600
	}
	checkMinSec := getEnvAsInt("BAOTA_CHECK_MIN_INTERVAL_SEC", 90)
	if checkMinSec < 0 {
		checkMinSec = 0
	}
	if checkMinSec > 3600 {
		checkMinSec = 3600
	}
	tcpProbeSec := getEnvAsInt("BAOTA_TCP_PROBE_TIMEOUT_SEC", 5)
	if tcpProbeSec < 1 {
		tcpProbeSec = 1
	}
	if tcpProbeSec > 120 {
		tcpProbeSec = 120
	}
	ingHostHTTP := getEnvAsInt("INGRESS_NGINX_HOST_HTTP_PORT", 80)
	if ingHostHTTP < 1 || ingHostHTTP > 65535 {
		ingHostHTTP = 80
	}
	ingHostHTTPS := getEnvAsInt("INGRESS_NGINX_HOST_HTTPS_PORT", 443)
	if ingHostHTTPS < 1 || ingHostHTTPS > 65535 {
		ingHostHTTPS = 443
	}
	dashDays := getEnvAsInt("DASHBOARD_SESSION_DAYS", 7)
	if dashDays < 1 {
		dashDays = 1
	}
	if dashDays > 365 {
		dashDays = 365
	}
	promTimeoutSec := getEnvAsInt("PROMETHEUS_HTTP_TIMEOUT_SEC", 30)
	if promTimeoutSec < 5 {
		promTimeoutSec = 5
	}
	if promTimeoutSec > 300 {
		promTimeoutSec = 300
	}
	sshPort := getEnvAsInt("VCENTER_VM_SSH_PORT", 22)
	if sshPort <= 0 || sshPort > 65535 {
		sshPort = 22
	}
	cfg := Config{
		BaotaURL:                          baotaURL,
		BaotaAPIKey:                       getEnv("BAOTA_API_KEY", ""), // 必须配置
		BaotaSkipTLSVerify:                loadBaotaSkipTLSVerify(baotaURL),
		BaotaDisableHTTPKeepAlive:         loadBaotaDisableHTTPKeepAlive(),
		BaotaHTTPTimeout:                  time.Duration(timeoutSec) * time.Second,
		BaotaTCPProbeTimeout:              time.Duration(tcpProbeSec) * time.Second,
		BaotaCheckMinInterval:             time.Duration(checkMinSec) * time.Second,
		DDNSHost:                          getEnv("DDNS_HOST", "home.example.com"),
		DefaultPort:                       getEnv("DEFAULT_PORT", "38333"),
		BaotaUpstreamHost:                 strings.TrimSpace(getEnv("BAOTA_UPSTREAM_HOST", "")),
		BaotaUpstreamPort:                 strings.TrimSpace(getEnv("BAOTA_UPSTREAM_PORT", "")),
		BaotaUpstreamScheme:               normalizeBaotaUpstreamScheme(getEnv("BAOTA_UPSTREAM_SCHEME", "http")),
		BaotaSSLCertName:                  strings.TrimSpace(getEnv("BAOTA_SSL_CERT_NAME", "")),
		BaotaSSLPemPath:                   strings.TrimSpace(getEnv("BAOTA_SSL_PEM_PATH", "")),
		BaotaSSLKeyPath:                   strings.TrimSpace(getEnv("BAOTA_SSL_KEY_PATH", "")),
		SyncInterval:                      time.Duration(getEnvAsInt("SYNC_INTERVAL_SEC", 30)) * time.Second,
		DashboardUser:                     getEnv("DASHBOARD_USER", "admin"),
		DashboardPassword:                 strings.TrimSpace(os.Getenv("DASHBOARD_PASSWORD")),
		DashboardSessionSecret:            strings.TrimSpace(os.Getenv("DASHBOARD_SESSION_SECRET")),
		DashboardSessionDays:              dashDays,
		DashboardCookieSecure:             getEnvBool("DASHBOARD_COOKIE_SECURE", false),
		DashboardListenAddr:               normalizeDashboardListenAddr(getEnv("DASHBOARD_HTTP_ADDR", ":8080")),
		DashboardTrustedProxies:           resolveDashboardTrustedProxies(),
		DashboardAccessLog:                getEnvBool("DASHBOARD_ACCESS_LOG", true),
		PrometheusURL:                     strings.TrimSpace(getEnv("PROMETHEUS_URL", "")),
		PrometheusURLK8s:                  strings.TrimSpace(getEnv("PROMETHEUS_URL_K8S", "")),
		PrometheusURLVCenter:              strings.TrimSpace(getEnv("PROMETHEUS_URL_VCENTER", "")),
		PrometheusURLCloud:                strings.TrimSpace(getEnv("PROMETHEUS_URL_CLOUD", "")),
		VMSelectURLK8s:                    strings.TrimSpace(getEnv("VM_SELECT_URL_K8S", "")),
		VMSelectURLVCenter:                strings.TrimSpace(getEnv("VM_SELECT_URL_VCENTER", "")),
		VMSelectURLCloud:                  strings.TrimSpace(getEnv("VM_SELECT_URL_CLOUD", "")),
		VictoriaLogsURL:                   strings.TrimSpace(getEnv("VICTORIA_LOGS_URL", "")),
		GeoLite2CountryMMDB:               strings.TrimSpace(getEnv("KUBEBT_GEOLITE2_COUNTRY_MMDB", "")),
		VMLogVectorDownloadBaseURL:        strings.TrimRight(strings.TrimSpace(getEnv("KUBEBT_VMLOG_VECTOR_DOWNLOAD_BASE_URL", "")), "/"),
		VictoriaLogsSkipTLS:               getEnvBool("VICTORIA_LOGS_SKIP_TLS_VERIFY", false),
		HarborBaseURL:                     strings.TrimSpace(getEnv("HARBOR_BASE_URL", "")),
		HarborUsername:                    strings.TrimSpace(getEnv("HARBOR_USERNAME", "")),
		HarborPassword:                    os.Getenv("HARBOR_PASSWORD"),
		HarborSkipTLS:                     getEnvBool("HARBOR_SKIP_TLS", false),
		PrometheusTimeout:                 time.Duration(promTimeoutSec) * time.Second,
		PrometheusSkipTLS:                 getEnvBool("PROMETHEUS_SKIP_TLS_VERIFY", false),
		PrometheusBearerToken:             strings.TrimSpace(os.Getenv("PROMETHEUS_BEARER_TOKEN")),
		VCenterURL:                        strings.TrimSpace(getEnv("VCENTER_URL", "")),
		VCenterUser:                       strings.TrimSpace(getEnv("VCENTER_USER", "")),
		VCenterPassword:                   os.Getenv("VCENTER_PASSWORD"),
		VCenterInsecure:                   getEnvBool("VCENTER_INSECURE", false),
		VCenterWmksScriptURL:              strings.TrimSpace(getEnv("VCENTER_WMKS_SCRIPT_URL", "")),
		VCenterWmksCssURL:                 strings.TrimSpace(getEnv("VCENTER_WMKS_CSS_URL", "")),
		VCenterUIBaseURL:                  strings.TrimSpace(getEnv("VCENTER_UI_BASE_URL", "")),
		VCenterConsoleHost:                strings.TrimSpace(getEnv("VCENTER_CONSOLE_HOST", "")),
		VCenterConsoleProxyURL:            strings.TrimSpace(getEnv("VCENTER_CONSOLE_PROXY_URL", "")),
		VCenterUIThumbprint:               strings.TrimSpace(getEnv("VCENTER_UI_THUMBPRINT", "")),
		VCenterVMSshUser:                  strings.TrimSpace(getEnv("VCENTER_VM_SSH_USER", "")),
		VCenterVMSshPrivateKeyPath:        strings.TrimSpace(getEnv("VCENTER_VM_SSH_PRIVATE_KEY_PATH", "")),
		VCenterVMSshPassword:              os.Getenv("VCENTER_VM_SSH_PASSWORD"),
		VCenterVMSshKeyPassphrase:         os.Getenv("VCENTER_VM_SSH_KEY_PASSPHRASE"),
		VCenterVMSshPort:                  sshPort,
		VCenterVMSshInsecureHostKey:       getEnvBool("VCENTER_VM_SSH_INSECURE_HOST_KEY", false),
		VCenterVMSshHostKeyFingerprint:    strings.TrimSpace(getEnv("VCENTER_VM_SSH_HOST_KEY_FINGERPRINT", "")),
		SSHSettingsBackend:                SSHSettingsBackend(strings.ToLower(strings.TrimSpace(getEnv("SSH_SETTINGS_BACKEND", "")))),
		EncryptionKey:                     strings.TrimSpace(os.Getenv("KUBEBT_ENCRYPTION_KEY")),
		TotpIssuer:                        strings.TrimSpace(os.Getenv("KUBEBT_TOTP_ISSUER")),
		RedisAddr:                         strings.TrimSpace(getEnv("REDIS_ADDR", "")),
		RedisPassword:                     os.Getenv("REDIS_PASSWORD"),
		RedisDB:                           getEnvAsInt("REDIS_DB", 0),
		RedisKeyPrefix:                    strings.TrimSpace(getEnv("REDIS_SSH_KEY_PREFIX", "")),
		RedisMode:                         strings.ToLower(strings.TrimSpace(getEnv("REDIS_MODE", "standalone"))),
		RedisHost:                         strings.TrimSpace(getEnv("REDIS_HOST", "")),
		RedisPort:                         getEnvAsInt("REDIS_PORT", 6379),
		RedisSentinelMaster:               strings.TrimSpace(getEnv("REDIS_SENTINEL_MASTER", "")),
		RedisImageRegistry:                strings.TrimSpace(getEnv("REDIS_IMAGE_REGISTRY", "")),
		RedisExporterImageRegistry:        strings.TrimSpace(getEnv("REDIS_EXPORTER_IMAGE_REGISTRY", "")),
		RedisExporterImageFull:            strings.TrimSpace(getEnv("REDIS_EXPORTER_IMAGE", "")),
		RedisEngineImages:                 parseJSONStringMapEnv("REDIS_ENGINE_IMAGES_JSON", os.Getenv("REDIS_ENGINE_IMAGES_JSON")),
		RedisImagePullSecret:              strings.TrimSpace(getEnv("REDIS_IMAGE_PULL_SECRET", "")),
		RedisK8sPersistenceEnabled:        getEnvBool("REDIS_K8S_PERSISTENCE_ENABLED", true),
		RedisK8sStorageSize:               strings.TrimSpace(getEnv("REDIS_K8S_STORAGE_SIZE", "10Gi")),
		RedisK8sStorageClass:              strings.TrimSpace(getEnv("REDIS_K8S_STORAGE_CLASS", "")),
		MySQLDSN:                          strings.TrimSpace(getEnv("MYSQL_DSN", "")),
		MySQLHost:                         strings.TrimSpace(getEnv("MYSQL_HOST", "")),
		MySQLPort:                         getEnvAsInt("MYSQL_PORT", 3306),
		MySQLDatabase:                     strings.TrimSpace(getEnv("MYSQL_DATABASE", "")),
		MySQLUser:                         strings.TrimSpace(getEnv("MYSQL_USER", "")),
		MySQLPassword:                     os.Getenv("MYSQL_PASSWORD"),
		SSHSettingsDir:                    strings.TrimSpace(getEnv("SSH_SETTINGS_DIR", "")),
		PlatformPublicURL:                 strings.TrimSpace(getEnv("PLATFORM_PUBLIC_URL", "")),
		AssetsCDNBaseURL:                  strings.TrimRight(strings.TrimSpace(getEnv("KUBEBT_ASSETS_CDN_BASE", "")), "/"),
		PlatformDisplayName:               strings.TrimSpace(getEnv("PLATFORM_DISPLAY_NAME", "")),
		PlatformLogoURL:                   strings.TrimSpace(getEnv("PLATFORM_LOGO_URL", "")),
		PlatformFaviconURL:                strings.TrimSpace(getEnv("PLATFORM_FAVICON_URL", "")),
		SshTerminalFontFamily:             strings.TrimSpace(getEnv("KUBEBT_SSH_TERMINAL_FONT_FAMILY", "")),
		SshTerminalFontSize:               getEnvAsInt("KUBEBT_SSH_TERMINAL_FONT_SIZE", 0),
		IngressBaotaSyncEnabled:           getEnvBool("INGRESS_BAOTA_SYNC_ENABLED", false),
		IngressNginxManifestURL:           strings.TrimSpace(getEnv("INGRESS_NGINX_MANIFEST_URL", "")),
		IngressNginxHostHTTPPort:          int32(ingHostHTTP),
		IngressNginxHostHTTPSPort:         int32(ingHostHTTPS),
		IngressNginxControllerNodeName:    strings.TrimSpace(getEnv("INGRESS_NGINX_CONTROLLER_NODE", "")),
		K8sAddonsManifestMirror:           strings.TrimSpace(getEnv("KUBEBT_K8S_ADDONS_MANIFEST_MIRROR", "auto")),
		IngressNginxSkipK8sRegistryMirror: getEnvBool("INGRESS_NGINX_SKIP_K8S_REGISTRY_MIRROR", false),
		IngressNginxK8sImageMirrorPrefix:  strings.TrimSpace(getEnv("INGRESS_NGINX_K8S_IMAGE_MIRROR_PREFIX", "")),
		VCenterCacheTTLSec:                getEnvAsInt("VCENTER_CACHE_TTL_SEC", 120),
		VCenterBastionVMListCacheTTLSec:   getEnvAsInt("VCENTER_BASTION_VM_LIST_CACHE_TTL_SEC", 3600),
		CloudHostAutoInstallNodeExporter:  getEnvBool("CLOUD_HOST_AUTO_INSTALL_NODE_EXPORTER", false),
		NodeExporterVersion:               strings.TrimSpace(getEnv("NODE_EXPORTER_VERSION", "1.8.2")),
		RuntimeDualWriteRedis:             getEnvBool("KUBEBT_RUNTIME_DUAL_WRITE_REDIS", false),
		OIDCIssuerURL:                     strings.TrimSpace(getEnv("OIDC_ISSUER_URL", "")),
		OIDCClientID:                      strings.TrimSpace(getEnv("OIDC_CLIENT_ID", "")),
		OIDCClientSecret:                  strings.TrimSpace(os.Getenv("OIDC_CLIENT_SECRET")),
		OIDCRedirectURL:                   strings.TrimSpace(getEnv("OIDC_REDIRECT_URL", "")),
		OIDCScopes:                        strings.TrimSpace(getEnv("OIDC_SCOPES", "openid profile email")),
		OIDCSkipIssuerCheck:               getEnvBool("OIDC_SKIP_ISSUER_CHECK", false),
		OIDCSkipClientIDCheck:             getEnvBool("OIDC_SKIP_CLIENT_ID_CHECK", false),
		OIDCSupportedSigningAlgs:          strings.TrimSpace(getEnv("OIDC_SUPPORTED_SIGNING_ALGS", "")),
		OIDCClockSkewSec:                  clampOIDCClockSkewSec(getEnvAsInt("OIDC_CLOCK_SKEW_SEC", 0)),
		PerformanceMode:                   getEnvBool("KUBEBT_PERFORMANCE_MODE", false),
		NamespacesCacheTTLSec:             getEnvAsInt("KUBEBT_NAMESPACES_CACHE_TTL_SEC", 30),
		EnableBackgroundJobs:              getEnvBool("KUBEBT_ENABLE_BACKGROUND_JOBS", true),
		CosSecretID:                       strings.TrimSpace(getEnv("KUBEBT_COS_SECRET_ID", "")),
		CosSecretKey:                      strings.TrimSpace(os.Getenv("KUBEBT_COS_SECRET_KEY")),
		CosBucket:                         strings.TrimSpace(getEnv("KUBEBT_COS_BUCKET", "")),
		CosRegion:                         strings.TrimSpace(getEnv("KUBEBT_COS_REGION", "")),
		CosPrefix:                         strings.Trim(strings.TrimSpace(getEnv("KUBEBT_COS_PREFIX", "kubebt-docs")), "/"),
		CosPublicBase:                     strings.TrimRight(strings.TrimSpace(getEnv("KUBEBT_COS_PUBLIC_BASE", "")), "/"),
	}
	if cfg.PerformanceMode && cfg.NamespacesCacheTTLSec <= 0 {
		cfg.NamespacesCacheTTLSec = 30
	}
	if strings.TrimSpace(cfg.RedisHost) != "" && cfg.RedisPort <= 0 {
		cfg.RedisPort = 6379
	}
	if strings.TrimSpace(cfg.MySQLHost) != "" && cfg.MySQLPort <= 0 {
		cfg.MySQLPort = 3306
	}
	FinalizeConnectionStrings(&cfg)
	cfg.K8sAddonsManifestMirror = K8sAddonsManifestMirrorCanonical(ParseManifestMirrorMode(cfg.K8sAddonsManifestMirror))
	return cfg
}

func normalizeDashboardListenAddr(addr string) string {
	addr = strings.TrimSpace(addr)
	if addr == "" {
		return ":8080"
	}
	// 若只写端口如 18080，补全为 :18080
	if strings.HasPrefix(addr, ":") {
		return addr
	}
	if _, err := strconv.Atoi(addr); err == nil {
		return ":" + addr
	}
	return addr
}

// loadBaotaSkipTLSVerify 仅在显式设置 BAOTA_SKIP_TLS_VERIFY=true 时跳过校验。
// HTTPS 默认必须校验证书；自签环境应导入可信 CA，临时排障才使用不安全开关。
// 未设置环境变量时默认禁用 keep-alive，减轻跨公网面板陈旧连接导致的超时。
func loadBaotaDisableHTTPKeepAlive() bool {
	_, ok := os.LookupEnv("BAOTA_DISABLE_HTTP_KEEPALIVE")
	if !ok {
		return true
	}
	return getEnvBool("BAOTA_DISABLE_HTTP_KEEPALIVE", true)
}

func loadBaotaSkipTLSVerify(baotaURL string) bool {
	_ = baotaURL
	return getEnvBool("BAOTA_SKIP_TLS_VERIFY", false)
}

func validateBaotaSSLMaterialPaths(pemPath, keyPath string) error {
	pem := strings.TrimSpace(pemPath)
	key := strings.TrimSpace(keyPath)
	if (pem == "") != (key == "") {
		return errors.New("宝塔 HTTPS 证书 PEM/KEY 路径必须同时填写（BAOTA_SSL_PEM_PATH 与 BAOTA_SSL_KEY_PATH）")
	}
	return nil
}

func (c Config) Validate() error {
	tmp := c
	FinalizeConnectionStrings(&tmp)
	if strings.TrimSpace(tmp.MySQLDSN) == "" {
		return errors.New("MySQL 未配置：请填写 MYSQL_DSN / mysqlDsn，或 mysqlHost、端口、库名、用户")
	}
	if strings.TrimSpace(tmp.RedisAddr) == "" {
		return errors.New("Redis 未配置：请填写 REDIS_ADDR / redisAddr，或 redisHost 与端口")
	}
	if strings.TrimSpace(c.PlatformPublicURL) == "" {
		return errors.New("平台对外 URL 不能为空（PLATFORM_PUBLIC_URL / platformPublicUrl）")
	}
	if c.SyncInterval < time.Second {
		return errors.New("SYNC_INTERVAL_SEC 必须 >= 1")
	}
	if c.IngressBaotaSyncEnabled {
		if len(EffectiveBaotaTargets(c)) == 0 {
			return errors.New("已开启 Ingress↔宝塔同步时，需至少配置一个宝塔实例（baotaTargets 或 baotaUrl + baotaApiKey）")
		}
	}
	if err := validateBaotaSSLMaterialPaths(c.BaotaSSLPemPath, c.BaotaSSLKeyPath); err != nil {
		return err
	}
	be := strings.ToLower(string(c.SSHSettingsBackend))
	if be != "" && be != "redis" && be != "mysql" && be != "file" {
		return errors.New("SSH_SETTINGS_BACKEND 须为 file、redis、mysql 之一（或留空）")
	}
	if be != "" && strings.TrimSpace(c.EncryptionKey) == "" {
		return errors.New("启用 SSH 存储（SSH_SETTINGS_BACKEND）时必须设置 KUBEBT_ENCRYPTION_KEY")
	}
	if be == "file" && strings.TrimSpace(c.SSHSettingsDir) == "" {
		return errors.New("SSH_SETTINGS_BACKEND=file 时必须设置 SSH_SETTINGS_DIR（目录）")
	}
	if err := validateOIDCFields(c); err != nil {
		return err
	}
	return nil
}

func validateOIDCFields(c Config) error {
	i := strings.TrimSpace(c.OIDCIssuerURL)
	id := strings.TrimSpace(c.OIDCClientID)
	sec := strings.TrimSpace(c.OIDCClientSecret)
	red := strings.TrimSpace(c.OIDCRedirectURL)
	n := 0
	if i != "" {
		n++
	}
	if id != "" {
		n++
	}
	if sec != "" {
		n++
	}
	if red != "" {
		n++
	}
	if n == 0 || n == 4 {
		return nil
	}
	return errors.New("OIDC 须同时配置 OIDC_ISSUER_URL、OIDC_CLIENT_ID、OIDC_CLIENT_SECRET、OIDC_REDIRECT_URL（或四项均留空）")
}

// RedisAddrConfigured 合并分字段（redisHost:port）后是否填写了 Redis 地址。
func RedisAddrConfigured(cfg Config) bool {
	tmp := cfg
	FinalizeConnectionStrings(&tmp)
	return strings.TrimSpace(tmp.RedisAddr) != ""
}

func clampOIDCClockSkewSec(n int) int {
	if n < 0 {
		return 0
	}
	if n > 3600 {
		return 3600
	}
	return n
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

func getEnvAsInt(key string, fallback int) int {
	if value, exists := os.LookupEnv(key); exists {
		intVal, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil {
			return fallback
		}
		return intVal
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	v, ok := os.LookupEnv(key)
	if !ok {
		return fallback
	}
	s := strings.ToLower(strings.TrimSpace(v))
	switch s {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}
