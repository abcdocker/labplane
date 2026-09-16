package internal

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const runtimeConfigFileName = "runtime-config.json"

// RuntimeK8s 持久化 K8s 连接方式（Pod 内用 incluster；外部集群粘贴 kubeconfig 全文）。
type RuntimeK8s struct {
	Mode           string `json:"mode"` // incluster | kubeconfig
	KubeconfigYAML string `json:"kubeconfigYaml,omitempty"`
}

type RuntimeK8sSidebarMenuItem struct {
	Key    string `json:"key"`
	Label  string `json:"label,omitempty"`
	Hidden bool   `json:"hidden,omitempty"`
	Order  int    `json:"order,omitempty"`
}

var defaultRuntimeK8sSidebarMenu = []RuntimeK8sSidebarMenuItem{
	{Key: "pods", Label: "Pods", Order: 10},
	{Key: "namespaces", Label: "NameSpace", Order: 20},
	{Key: "nodes", Label: "Nodes", Order: 30},
	{Key: "etcd", Label: "etcd", Order: 35},
	{Key: "rbac", Label: "RBAC", Order: 40},
	{Key: "harbor", Label: "Harbor 仓库", Order: 50},
	{Key: "customResources", Label: "自定义资源", Order: 60},
}

// RuntimeSettings 写入 dataDir/runtime-config.json；Initialized=true 后与 LoadConfig() 合并为进程配置。
type RuntimeSettings struct {
	Version     int  `json:"version"`
	Initialized bool `json:"initialized"`

	BaotaURL    string `json:"baotaUrl"`
	BaotaAPIKey string `json:"baotaApiKey"`
	// BaotaTargets 多宝塔实例（企业版多节点等）；非空时同步与面板以列表为准，顶层 baotaUrl/baotaApiKey 在保存时与「默认」行同步。
	BaotaTargets              []RuntimeBaotaTarget `json:"baotaTargets,omitempty"`
	BaotaSkipTLSVerify        *bool                `json:"baotaSkipTlsVerify,omitempty"`
	BaotaDisableHTTPKeepAlive *bool                `json:"baotaDisableHttpKeepalive,omitempty"`
	BaotaHTTPTimeoutSec       int                  `json:"baotaHttpTimeoutSec"`
	BaotaTCPProbeTimeoutSec   int                  `json:"baotaTcpProbeTimeoutSec"`
	BaotaCheckMinIntervalSec  int                  `json:"baotaCheckMinIntervalSec"`
	DDNSHost                  string               `json:"ddnsHost"`
	DefaultPort               string               `json:"defaultPort"`
	BaotaUpstreamHost         string               `json:"baotaUpstreamHost,omitempty"`
	BaotaUpstreamPort         string               `json:"baotaUpstreamPort,omitempty"`
	BaotaUpstreamScheme       string               `json:"baotaUpstreamScheme,omitempty"`
	BaotaSSLCertName          string               `json:"baotaSslCertName"`
	BaotaSSLPemPath           string               `json:"baotaSslPemPath,omitempty"`
	BaotaSSLKeyPath           string               `json:"baotaSslKeyPath,omitempty"`
	BaotaSSLPemContent        string               `json:"baotaSslPemContent,omitempty"`
	BaotaSSLKeyContent        string               `json:"baotaSslKeyContent,omitempty"`
	ClearBaotaSSLMaterial     bool                 `json:"clearBaotaSslMaterial,omitempty"`
	HasBaotaSSLMaterial       *bool                `json:"hasBaotaSslMaterial,omitempty"`
	SyncIntervalSec           int                  `json:"syncIntervalSec"`

	DashboardUser          string `json:"dashboardUser"`
	DashboardPassword      string `json:"dashboardPassword,omitempty"` // bcrypt，由 POST /api/setup 写入
	DashboardSessionSecret string `json:"dashboardSessionSecret,omitempty"`
	DashboardSessionDays   int    `json:"dashboardSessionDays"`
	DashboardCookieSecure  bool   `json:"dashboardCookieSecure"`
	DashboardListenAddr    string `json:"dashboardListenAddr"`

	OIDCIssuerURL    string `json:"oidcIssuerUrl,omitempty"`
	OIDCClientID     string `json:"oidcClientId,omitempty"`
	OIDCClientSecret string `json:"oidcClientSecret,omitempty"`
	OIDCRedirectURL  string `json:"oidcRedirectUrl,omitempty"`
	OIDCScopes       string `json:"oidcScopes,omitempty"`
	// 以下可选；nil 表示沿用环境变量/合并前的值
	OIDCSkipIssuerCheck      *bool  `json:"oidcSkipIssuerCheck,omitempty"`
	OIDCSkipClientIDCheck    *bool  `json:"oidcSkipClientIdCheck,omitempty"`
	OIDCSupportedSigningAlgs string `json:"oidcSupportedSigningAlgs,omitempty"`
	OIDCClockSkewSec         *int   `json:"oidcClockSkewSec,omitempty"`

	PrometheusURL         string `json:"prometheusUrl"`
	PrometheusURLK8s      string `json:"prometheusUrlK8s,omitempty"`
	PrometheusURLVCenter  string `json:"prometheusUrlVcenter,omitempty"`
	PrometheusURLCloud    string `json:"prometheusUrlCloud,omitempty"`
	PrometheusTimeoutSec  int    `json:"prometheusTimeoutSec"`
	PrometheusSkipTLS     bool   `json:"prometheusSkipTls"`
	PrometheusBearerToken string `json:"prometheusBearerToken,omitempty"`
	// VictoriaMetrics vmselect 根 URL（可选）；填写后对应 scope 监控查询优先于此地址
	VMSelectURLK8s     string `json:"vmSelectUrlK8s,omitempty"`
	VMSelectURLVCenter string `json:"vmSelectUrlVcenter,omitempty"`
	VMSelectURLCloud   string `json:"vmSelectUrlCloud,omitempty"`
	// VictoriaLogs 根 URL（LogsQL /select/logsql/query），如 http://victoria-logs.monitoring.svc:9428
	VictoriaLogsURL string `json:"victoriaLogsUrl,omitempty"`
	// VMLogVectorDownloadBaseURL：虚拟机/宝塔日志采集助手下载 Vector 的自定义基址（无尾斜杠）。
	VMLogVectorDownloadBaseURL string `json:"vmLogVectorDownloadBaseUrl,omitempty"`
	// VictoriaLogsRetentionDays 目标保留天数（平台用于日志查询时间窗上限与文档对齐；默认 180）；须在 VL 侧 Helm 等配置实际 retention
	VictoriaLogsRetentionDays int `json:"victoriaLogsRetentionDays,omitempty"`
	// GeoLite2CountryMMDB：MaxMind GeoLite2-Country.mmdb 路径（可选），用于 Nginx 访问统计按国家/地区聚合
	GeoLite2CountryMMDB string `json:"geoLite2CountryMmdb,omitempty"`
	// Harbor：控制台「Harbor 仓库」浏览项目/镜像/制品；填写与浏览器访问一致的根 URL（https://harbor.example.com，无尾斜杠）
	HarborBaseURL  string `json:"harborBaseUrl,omitempty"`
	HarborUsername string `json:"harborUsername,omitempty"`
	HarborPassword string `json:"harborPassword,omitempty"`
	HarborSkipTLS  bool   `json:"harborSkipTls,omitempty"`

	VCenterURL           string `json:"vcenterUrl"`
	VCenterUser          string `json:"vcenterUser"`
	VCenterPassword      string `json:"vcenterPassword,omitempty"`
	VCenterInsecure      bool   `json:"vcenterInsecure"`
	VCenterWmksScriptURL string `json:"vcenterWmksScriptUrl"`
	VCenterWmksCssURL    string `json:"vcenterWmksCssUrl"`
	VCenterUIBaseURL     string `json:"vcenterUiBaseUrl"`
	// VCenterConsoleHost 覆盖 WebMKS 票据 URL 中的 ESXi 地址，不改变路径和一次性票据。
	VCenterConsoleHost string `json:"vcenterConsoleHost"`
	// VCenterConsoleProxyURL 已废弃，仅保留旧配置兼容；控制台始终直连 ESXi WebMKS。
	VCenterConsoleProxyURL         string `json:"vcenterConsoleProxyUrl"`
	VCenterUIThumbprint            string `json:"vcenterUiThumbprint"`
	VCenterVMSshUser               string `json:"vcenterVmSshUser"`
	VCenterVMSshPrivateKeyPath     string `json:"vcenterVmSshPrivateKeyPath"`
	VCenterVMSshPassword           string `json:"vcenterVmSshPassword,omitempty"`
	VCenterVMSshKeyPassphrase      string `json:"vcenterVmSshKeyPassphrase,omitempty"`
	VCenterVMSshPort               int    `json:"vcenterVmSshPort"`
	VCenterVMSshInsecureHostKey    bool   `json:"vcenterVmSshInsecureHostKey"`
	VCenterVMSshHostKeyFingerprint string `json:"vcenterVmSshHostKeyFingerprint,omitempty"`

	SSHSettingsBackend string `json:"sshSettingsBackend"`
	EncryptionKey      string `json:"encryptionKey,omitempty"`
	RedisAddr          string `json:"redisAddr,omitempty"`
	RedisPassword      string `json:"redisPassword,omitempty"`
	RedisDB            int    `json:"redisDb"`
	RedisKeyPrefix     string `json:"redisKeyPrefix"`
	// RedisMode：standalone | sentinel | cluster（轻量客户端仅连接 redisHost:redisPort）
	RedisMode           string `json:"redisMode,omitempty"`
	RedisHost           string `json:"redisHost,omitempty"`
	RedisPort           int    `json:"redisPort,omitempty"`
	RedisSentinelMaster string `json:"redisSentinelMaster,omitempty"`
	// 应用中心 Redis 镜像：Harbor 前缀（无协议、无尾斜杠），如 harbor.example.com/prod
	RedisImageRegistry string `json:"redisImageRegistry,omitempty"`
	// 可选；exporter 镜像若与 redis 不同路径，可单独前缀；空则与 RedisImageRegistry 相同
	RedisExporterImageRegistry string `json:"redisExporterImageRegistry,omitempty"`
	// 可选；K8s 拉取私网镜像用的 Secret 名（各命名空间需自行创建）
	RedisImagePullSecret string `json:"redisImagePullSecret,omitempty"`
	// 可选；主版本键 "4"～"7" → 完整 Redis 服务端镜像（与 REDIS_ENGINE_IMAGES_JSON 等价，写入 runtime 后优先生效）
	RedisEngineImages map[string]string `json:"redisEngineImages,omitempty"`
	// 可选；完整 redis_exporter 镜像，覆盖前缀 + 默认 tag
	RedisExporterImage string `json:"redisExporterImage,omitempty"`
	// 应用中心 Redis K8s：是否持久化（nil 表示沿用环境变量默认）
	RedisK8sPersistence  *bool  `json:"redisK8sPersistence,omitempty"`
	RedisK8sStorageSize  string `json:"redisK8sStorageSize,omitempty"`
	RedisK8sStorageClass string `json:"redisK8sStorageClass,omitempty"`
	MySQLDSN             string `json:"mysqlDsn,omitempty"`
	MySQLHost            string `json:"mysqlHost,omitempty"`
	MySQLPort            int    `json:"mysqlPort,omitempty"`
	MySQLDatabase        string `json:"mysqlDatabase,omitempty"`
	MySQLUser            string `json:"mysqlUser,omitempty"`
	MySQLPassword        string `json:"mysqlPassword,omitempty"`
	SSHSettingsDir       string `json:"sshSettingsDir"`

	// 平台对外 URL（必填项之一）
	PlatformPublicURL string `json:"platformPublicUrl"`
	// 控制台展示名称、Logo、favicon（HTTPS 绝对 URL 或站内路径如 /assets/logo.png）
	PlatformDisplayName string `json:"platformDisplayName,omitempty"`
	PlatformLogoURL     string `json:"platformLogoUrl,omitempty"`
	PlatformFaviconURL  string `json:"platformFaviconUrl,omitempty"`
	// 静态资源 CDN 根（无尾斜杠），如 https://your.cdn.com/cmdb，与导出脚本 cmdb/ 目录结构一致；空则使用内置默认外链
	AssetsCDNBaseURL string `json:"assetsCdnBaseUrl,omitempty"`
	// SSH 终端字体（xterm）：空则沿用内置或环境变量
	SshTerminalFontFamily string `json:"sshTerminalFontFamily,omitempty"`
	SshTerminalFontSize   int    `json:"sshTerminalFontSize,omitempty"`
	// Ingress↔宝塔同步开关（默认 false，后台可开）
	IngressBaotaSyncEnabled bool `json:"ingressBaotaSyncEnabled"`
	// 官方 baremetal 清单 URL；空则使用内置默认 controller 版本链接
	IngressNginxManifestURL string `json:"ingressNginxManifestUrl,omitempty"`
	// hostNetwork 模式下 HTTP 端口（1–65535）；0 表示沿用环境变量/合并默认 80
	IngressNginxHostHTTPPort int `json:"ingressNginxHostHttpPort,omitempty"`
	// hostNetwork 模式下 HTTPS 端口；0 表示默认 443
	IngressNginxHostHTTPSPort int `json:"ingressNginxHostHttpsPort,omitempty"`
	// 控制器固定调度到的 Node 名称（kubectl get nodes 的 NAME）；空表示安装时不默认固定（仍可页面上指定）
	IngressNginxControllerNodeName string `json:"ingressNginxControllerNodeName,omitempty"`
	// 一键安装拉取 YAML：auto | ghproxy_preferred | direct | ghproxy_only（国内建议 ghproxy_preferred）
	K8sAddonsManifestMirror string `json:"k8sAddonsManifestMirror,omitempty"`
	// vCenter 虚拟机列表 Redis 缓存 TTL（秒）
	VCenterCacheTTLSec int `json:"vcenterCacheTtlSec"`
	// iDRAC 带外（单台 ESXi 场景）：IP 或主机名（自动补 https://），Redfish 账号；自签证书时 idracInsecure=true
	IdracHost         string `json:"idracHost,omitempty"`
	IdracUser         string `json:"idracUser,omitempty"`
	IdracPassword     string `json:"idracPassword,omitempty"`
	IdracInsecure     bool   `json:"idracInsecure,omitempty"`
	// iDRAC VNC 控制台（需先在 iDRAC 设置中启用 VNC Server）
	IdracVncPort     int    `json:"idracVncPort,omitempty"`
	IdracVncPassword string `json:"idracVncPassword,omitempty"`
	// 控制桌面端 Kubernetes 顶层侧栏菜单：重命名 / 排序 / 隐藏（全局生效）
	K8sSidebarMenu []RuntimeK8sSidebarMenuItem `json:"k8sSidebarMenu,omitempty"`

	K8s *RuntimeK8s `json:"k8s"`
}

func normalizeRuntimeK8sSidebarMenu(items []RuntimeK8sSidebarMenuItem) ([]RuntimeK8sSidebarMenuItem, error) {
	defaults := make(map[string]RuntimeK8sSidebarMenuItem, len(defaultRuntimeK8sSidebarMenu))
	for _, it := range defaultRuntimeK8sSidebarMenu {
		defaults[it.Key] = it
	}
	seen := make(map[string]struct{}, len(defaultRuntimeK8sSidebarMenu))
	custom := make(map[string]RuntimeK8sSidebarMenuItem, len(defaultRuntimeK8sSidebarMenu))
	for _, raw := range items {
		key := strings.TrimSpace(raw.Key)
		if key == "" {
			return nil, errors.New("k8sSidebarMenu.key 不能为空")
		}
		base, ok := defaults[key]
		if !ok {
			return nil, fmt.Errorf("k8sSidebarMenu.key 不支持: %s", key)
		}
		if _, dup := seen[key]; dup {
			return nil, fmt.Errorf("k8sSidebarMenu.key 重复: %s", key)
		}
		seen[key] = struct{}{}
		label := strings.TrimSpace(raw.Label)
		if label == "" {
			label = base.Label
		}
		custom[key] = RuntimeK8sSidebarMenuItem{
			Key:    key,
			Label:  label,
			Hidden: raw.Hidden,
			Order:  raw.Order,
		}
	}
	out := make([]RuntimeK8sSidebarMenuItem, 0, len(defaultRuntimeK8sSidebarMenu))
	for _, base := range defaultRuntimeK8sSidebarMenu {
		if got, ok := custom[base.Key]; ok {
			out = append(out, got)
			continue
		}
		out = append(out, base)
	}
	sort.SliceStable(out, func(i, j int) bool {
		ai, aj := out[i].Order, out[j].Order
		if ai <= 0 {
			ai = defaults[out[i].Key].Order
		}
		if aj <= 0 {
			aj = defaults[out[j].Key].Order
		}
		if ai == aj {
			return defaults[out[i].Key].Order < defaults[out[j].Key].Order
		}
		return ai < aj
	})
	for i := range out {
		base := defaults[out[i].Key]
		if strings.TrimSpace(out[i].Label) == "" {
			out[i].Label = base.Label
		}
		out[i].Order = (i + 1) * 10
	}
	return out, nil
}

func RuntimeK8sSidebarMenuEffective(rs *RuntimeSettings) []RuntimeK8sSidebarMenuItem {
	if rs == nil {
		out, _ := normalizeRuntimeK8sSidebarMenu(nil)
		return out
	}
	out, err := normalizeRuntimeK8sSidebarMenu(rs.K8sSidebarMenu)
	if err != nil {
		fallback, _ := normalizeRuntimeK8sSidebarMenu(nil)
		return fallback
	}
	return out
}

// LoadRuntimeSettings 读取本地 JSON；不存在则返回未初始化空配置。
func LoadRuntimeSettings(path string) (*RuntimeSettings, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &RuntimeSettings{Version: 1}, nil
		}
		return nil, err
	}
	var rs RuntimeSettings
	if err := json.Unmarshal(b, &rs); err != nil {
		return nil, err
	}
	if rs.Version < 1 {
		rs.Version = 1
	}
	return &rs, nil
}

// SaveRuntimeSettings 原子写入（0600）。
func SaveRuntimeSettings(path string, rs *RuntimeSettings) error {
	if rs == nil {
		return errors.New("runtime settings 为空")
	}
	if rs.Version < 1 {
		rs.Version = 1
	}
	b, err := json.MarshalIndent(rs, "", "  ")
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// applySSHStoreDefaults 未配置 SSH_SETTINGS_BACKEND 时，若已有加密密钥与数据目录，则默认 file 后端（dataDir/ssh-vm），
// 以便公有云 / 虚拟机 SSH 凭据可持久化，无需在 runtime 中手填 sshSettingsBackend。
func applySSHStoreDefaults(cfg *Config, dataDir string) {
	if cfg == nil {
		return
	}
	if cfg.SSHSettingsBackend != SSHBackendNone {
		return
	}
	if strings.TrimSpace(cfg.EncryptionKey) == "" || dataDir == "" {
		return
	}
	cfg.SSHSettingsBackend = SSHBackendFile
	if strings.TrimSpace(cfg.SSHSettingsDir) == "" {
		cfg.SSHSettingsDir = filepath.Join(dataDir, "ssh-vm")
	}
}

// MergeRuntimeConfig 将 env 加载的 Config 与持久化层合并；未初始化时仅返回 env。
func MergeRuntimeConfig(env Config, rs *RuntimeSettings, dataDir string) Config {
	if rs == nil || !rs.Initialized {
		out := env
		applySSHStoreDefaults(&out, dataDir)
		return out
	}
	out := env

	out.BaotaURL = rs.BaotaURL
	out.BaotaAPIKey = rs.BaotaAPIKey
	if rs.BaotaSkipTLSVerify != nil {
		out.BaotaSkipTLSVerify = *rs.BaotaSkipTLSVerify
	} else if strings.TrimSpace(rs.BaotaURL) != "" {
		out.BaotaSkipTLSVerify = loadBaotaSkipTLSVerify(rs.BaotaURL)
	}
	if rs.BaotaDisableHTTPKeepAlive != nil {
		out.BaotaDisableHTTPKeepAlive = *rs.BaotaDisableHTTPKeepAlive
	}
	if rs.BaotaHTTPTimeoutSec > 0 {
		out.BaotaHTTPTimeout = time.Duration(rs.BaotaHTTPTimeoutSec) * time.Second
	}
	if rs.BaotaTCPProbeTimeoutSec > 0 {
		out.BaotaTCPProbeTimeout = time.Duration(rs.BaotaTCPProbeTimeoutSec) * time.Second
	}
	if rs.BaotaCheckMinIntervalSec >= 0 {
		out.BaotaCheckMinInterval = time.Duration(rs.BaotaCheckMinIntervalSec) * time.Second
	}
	mergeRuntimeBaotaTargetsIntoConfig(rs, &out)
	if rs.DDNSHost != "" {
		out.DDNSHost = rs.DDNSHost
	}
	if rs.DefaultPort != "" {
		out.DefaultPort = rs.DefaultPort
	}
	if strings.TrimSpace(rs.BaotaUpstreamHost) != "" {
		out.BaotaUpstreamHost = strings.TrimSpace(rs.BaotaUpstreamHost)
	}
	if strings.TrimSpace(rs.BaotaUpstreamPort) != "" {
		out.BaotaUpstreamPort = strings.TrimSpace(rs.BaotaUpstreamPort)
	}
	if strings.TrimSpace(rs.BaotaUpstreamScheme) != "" {
		out.BaotaUpstreamScheme = normalizeBaotaUpstreamScheme(rs.BaotaUpstreamScheme)
	}
	if rs.BaotaSSLCertName != "" {
		out.BaotaSSLCertName = rs.BaotaSSLCertName
	}
	if strings.TrimSpace(rs.BaotaSSLPemPath) != "" {
		out.BaotaSSLPemPath = strings.TrimSpace(rs.BaotaSSLPemPath)
	}
	if strings.TrimSpace(rs.BaotaSSLKeyPath) != "" {
		out.BaotaSSLKeyPath = strings.TrimSpace(rs.BaotaSSLKeyPath)
	}
	if rs.ClearBaotaSSLMaterial {
		out.BaotaSSLPemPath = ""
		out.BaotaSSLKeyPath = ""
	}
	if rs.SyncIntervalSec > 0 {
		out.SyncInterval = time.Duration(rs.SyncIntervalSec) * time.Second
	}

	if rs.DashboardUser != "" {
		out.DashboardUser = rs.DashboardUser
	}
	if rs.DashboardPassword != "" {
		out.DashboardPassword = rs.DashboardPassword
	}
	if rs.DashboardSessionSecret != "" {
		out.DashboardSessionSecret = rs.DashboardSessionSecret
	}
	if rs.DashboardSessionDays > 0 {
		out.DashboardSessionDays = rs.DashboardSessionDays
	}
	out.DashboardCookieSecure = rs.DashboardCookieSecure
	if strings.TrimSpace(rs.DashboardListenAddr) != "" {
		out.DashboardListenAddr = normalizeDashboardListenAddr(rs.DashboardListenAddr)
	}
	if strings.TrimSpace(rs.OIDCIssuerURL) != "" {
		out.OIDCIssuerURL = strings.TrimSpace(rs.OIDCIssuerURL)
	}
	if strings.TrimSpace(rs.OIDCClientID) != "" {
		out.OIDCClientID = strings.TrimSpace(rs.OIDCClientID)
	}
	if strings.TrimSpace(rs.OIDCClientSecret) != "" {
		out.OIDCClientSecret = rs.OIDCClientSecret
	}
	if strings.TrimSpace(rs.OIDCRedirectURL) != "" {
		out.OIDCRedirectURL = strings.TrimSpace(rs.OIDCRedirectURL)
	}
	if strings.TrimSpace(rs.OIDCScopes) != "" {
		out.OIDCScopes = strings.TrimSpace(rs.OIDCScopes)
	}
	if rs.OIDCSkipIssuerCheck != nil {
		out.OIDCSkipIssuerCheck = *rs.OIDCSkipIssuerCheck
	}
	if rs.OIDCSkipClientIDCheck != nil {
		out.OIDCSkipClientIDCheck = *rs.OIDCSkipClientIDCheck
	}
	if strings.TrimSpace(rs.OIDCSupportedSigningAlgs) != "" {
		out.OIDCSupportedSigningAlgs = strings.TrimSpace(rs.OIDCSupportedSigningAlgs)
	}
	if rs.OIDCClockSkewSec != nil {
		out.OIDCClockSkewSec = clampOIDCClockSkewSec(*rs.OIDCClockSkewSec)
	}

	if rs.PrometheusURL != "" {
		out.PrometheusURL = rs.PrometheusURL
	}
	if strings.TrimSpace(rs.PrometheusURLK8s) != "" {
		out.PrometheusURLK8s = strings.TrimSpace(rs.PrometheusURLK8s)
	}
	if strings.TrimSpace(rs.PrometheusURLVCenter) != "" {
		out.PrometheusURLVCenter = strings.TrimSpace(rs.PrometheusURLVCenter)
	}
	if strings.TrimSpace(rs.PrometheusURLCloud) != "" {
		out.PrometheusURLCloud = strings.TrimSpace(rs.PrometheusURLCloud)
	}
	if strings.TrimSpace(rs.VMSelectURLK8s) != "" {
		out.VMSelectURLK8s = strings.TrimSpace(rs.VMSelectURLK8s)
	}
	if strings.TrimSpace(rs.VMSelectURLVCenter) != "" {
		out.VMSelectURLVCenter = strings.TrimSpace(rs.VMSelectURLVCenter)
	}
	if strings.TrimSpace(rs.VMSelectURLCloud) != "" {
		out.VMSelectURLCloud = strings.TrimSpace(rs.VMSelectURLCloud)
	}
	if strings.TrimSpace(rs.VictoriaLogsURL) != "" {
		out.VictoriaLogsURL = strings.TrimSpace(rs.VictoriaLogsURL)
	}
	if strings.TrimSpace(rs.GeoLite2CountryMMDB) != "" {
		out.GeoLite2CountryMMDB = strings.TrimSpace(rs.GeoLite2CountryMMDB)
	}
	if strings.TrimSpace(rs.HarborBaseURL) != "" {
		out.HarborBaseURL = strings.TrimSuffix(strings.TrimSpace(rs.HarborBaseURL), "/")
	}
	if strings.TrimSpace(rs.HarborUsername) != "" {
		out.HarborUsername = strings.TrimSpace(rs.HarborUsername)
	}
	if rs.HarborPassword != "" {
		out.HarborPassword = rs.HarborPassword
	}
	out.HarborSkipTLS = rs.HarborSkipTLS
	if strings.TrimSpace(rs.VMLogVectorDownloadBaseURL) != "" {
		out.VMLogVectorDownloadBaseURL = strings.TrimRight(strings.TrimSpace(rs.VMLogVectorDownloadBaseURL), "/")
	}
	if rs.PrometheusTimeoutSec > 0 {
		out.PrometheusTimeout = time.Duration(rs.PrometheusTimeoutSec) * time.Second
	}
	out.PrometheusSkipTLS = rs.PrometheusSkipTLS
	if rs.PrometheusBearerToken != "" {
		out.PrometheusBearerToken = rs.PrometheusBearerToken
	}

	if rs.VCenterURL != "" {
		out.VCenterURL = rs.VCenterURL
	}
	if rs.VCenterUser != "" {
		out.VCenterUser = rs.VCenterUser
	}
	if rs.VCenterPassword != "" {
		out.VCenterPassword = rs.VCenterPassword
	}
	out.VCenterInsecure = rs.VCenterInsecure
	if rs.VCenterWmksScriptURL != "" {
		out.VCenterWmksScriptURL = rs.VCenterWmksScriptURL
	}
	if rs.VCenterWmksCssURL != "" {
		out.VCenterWmksCssURL = rs.VCenterWmksCssURL
	}
	if rs.VCenterUIBaseURL != "" {
		out.VCenterUIBaseURL = rs.VCenterUIBaseURL
	}
	if rs.VCenterConsoleHost != "" {
		out.VCenterConsoleHost = rs.VCenterConsoleHost
	}
	if rs.VCenterConsoleProxyURL != "" {
		out.VCenterConsoleProxyURL = rs.VCenterConsoleProxyURL
	}
	if rs.VCenterUIThumbprint != "" {
		out.VCenterUIThumbprint = rs.VCenterUIThumbprint
	}
	if rs.VCenterVMSshUser != "" {
		out.VCenterVMSshUser = rs.VCenterVMSshUser
	}
	if rs.VCenterVMSshPrivateKeyPath != "" {
		out.VCenterVMSshPrivateKeyPath = rs.VCenterVMSshPrivateKeyPath
	}
	if rs.VCenterVMSshPassword != "" {
		out.VCenterVMSshPassword = rs.VCenterVMSshPassword
	}
	if rs.VCenterVMSshKeyPassphrase != "" {
		out.VCenterVMSshKeyPassphrase = rs.VCenterVMSshKeyPassphrase
	}
	if rs.VCenterVMSshPort > 0 {
		out.VCenterVMSshPort = rs.VCenterVMSshPort
	}
	out.VCenterVMSshInsecureHostKey = rs.VCenterVMSshInsecureHostKey
	if strings.TrimSpace(rs.VCenterVMSshHostKeyFingerprint) != "" {
		out.VCenterVMSshHostKeyFingerprint = strings.TrimSpace(rs.VCenterVMSshHostKeyFingerprint)
	}

	// 已初始化：与 SSH/Redis/MySQL 相关字段以文件为准（含空值，避免仍被宿主机环境变量覆盖）
	out.SSHSettingsBackend = SSHSettingsBackend(strings.ToLower(strings.TrimSpace(rs.SSHSettingsBackend)))
	out.EncryptionKey = rs.EncryptionKey
	if strings.TrimSpace(rs.RedisMode) != "" {
		out.RedisMode = strings.ToLower(strings.TrimSpace(rs.RedisMode))
	}
	out.RedisHost = strings.TrimSpace(rs.RedisHost)
	if rs.RedisPort > 0 {
		out.RedisPort = rs.RedisPort
	}
	out.RedisSentinelMaster = strings.TrimSpace(rs.RedisSentinelMaster)
	if strings.TrimSpace(rs.RedisImageRegistry) != "" {
		out.RedisImageRegistry = strings.TrimSpace(rs.RedisImageRegistry)
	}
	if strings.TrimSpace(rs.RedisExporterImageRegistry) != "" {
		out.RedisExporterImageRegistry = strings.TrimSpace(rs.RedisExporterImageRegistry)
	}
	if strings.TrimSpace(rs.RedisImagePullSecret) != "" {
		out.RedisImagePullSecret = strings.TrimSpace(rs.RedisImagePullSecret)
	}
	if len(rs.RedisEngineImages) > 0 {
		out.RedisEngineImages = make(map[string]string, len(rs.RedisEngineImages))
		for k, v := range rs.RedisEngineImages {
			kk, vv := strings.TrimSpace(k), strings.TrimSpace(v)
			if kk != "" && vv != "" {
				out.RedisEngineImages[kk] = vv
			}
		}
	}
	if strings.TrimSpace(rs.RedisExporterImage) != "" {
		out.RedisExporterImageFull = strings.TrimSpace(rs.RedisExporterImage)
	}
	if rs.RedisK8sPersistence != nil {
		out.RedisK8sPersistenceEnabled = *rs.RedisK8sPersistence
	}
	if strings.TrimSpace(rs.RedisK8sStorageSize) != "" {
		out.RedisK8sStorageSize = strings.TrimSpace(rs.RedisK8sStorageSize)
	}
	if strings.TrimSpace(rs.RedisK8sStorageClass) != "" {
		out.RedisK8sStorageClass = strings.TrimSpace(rs.RedisK8sStorageClass)
	}
	out.RedisAddr = rs.RedisAddr
	out.RedisPassword = rs.RedisPassword
	out.RedisDB = rs.RedisDB
	out.RedisKeyPrefix = rs.RedisKeyPrefix

	out.MySQLHost = strings.TrimSpace(rs.MySQLHost)
	if rs.MySQLPort > 0 {
		out.MySQLPort = rs.MySQLPort
	}
	out.MySQLDatabase = strings.TrimSpace(rs.MySQLDatabase)
	out.MySQLUser = strings.TrimSpace(rs.MySQLUser)
	out.MySQLPassword = rs.MySQLPassword
	out.MySQLDSN = strings.TrimSpace(rs.MySQLDSN)
	out.SSHSettingsDir = rs.SSHSettingsDir

	if strings.TrimSpace(out.RedisHost) != "" && out.RedisPort <= 0 {
		out.RedisPort = 6379
	}
	if strings.TrimSpace(out.MySQLHost) != "" && out.MySQLPort <= 0 {
		out.MySQLPort = 3306
	}
	FinalizeConnectionStrings(&out)

	applySSHStoreDefaults(&out, dataDir)

	out.PlatformPublicURL = rs.PlatformPublicURL
	if strings.TrimSpace(rs.PlatformDisplayName) != "" {
		out.PlatformDisplayName = strings.TrimSpace(rs.PlatformDisplayName)
	}
	if strings.TrimSpace(rs.PlatformLogoURL) != "" {
		out.PlatformLogoURL = strings.TrimSpace(rs.PlatformLogoURL)
	}
	if strings.TrimSpace(rs.PlatformFaviconURL) != "" {
		out.PlatformFaviconURL = strings.TrimSpace(rs.PlatformFaviconURL)
	}
	if strings.TrimSpace(rs.AssetsCDNBaseURL) != "" {
		out.AssetsCDNBaseURL = strings.TrimRight(strings.TrimSpace(rs.AssetsCDNBaseURL), "/")
	}
	if strings.TrimSpace(rs.SshTerminalFontFamily) != "" {
		out.SshTerminalFontFamily = strings.TrimSpace(rs.SshTerminalFontFamily)
	}
	if rs.SshTerminalFontSize > 0 && rs.SshTerminalFontSize <= 48 {
		out.SshTerminalFontSize = rs.SshTerminalFontSize
	}
	out.IngressBaotaSyncEnabled = rs.IngressBaotaSyncEnabled
	out.BaotaUpstreamHost = strings.TrimSpace(rs.BaotaUpstreamHost)
	out.BaotaUpstreamPort = strings.TrimSpace(rs.BaotaUpstreamPort)
	out.BaotaUpstreamScheme = normalizeBaotaUpstreamScheme(rs.BaotaUpstreamScheme)
	if rs.IngressNginxHostHTTPPort > 0 && rs.IngressNginxHostHTTPPort <= 65535 {
		out.IngressNginxHostHTTPPort = int32(rs.IngressNginxHostHTTPPort)
	}
	if rs.IngressNginxHostHTTPSPort > 0 && rs.IngressNginxHostHTTPSPort <= 65535 {
		out.IngressNginxHostHTTPSPort = int32(rs.IngressNginxHostHTTPSPort)
	}
	if strings.TrimSpace(rs.IngressNginxManifestURL) != "" {
		out.IngressNginxManifestURL = strings.TrimSpace(rs.IngressNginxManifestURL)
	}
	out.IngressNginxControllerNodeName = strings.TrimSpace(rs.IngressNginxControllerNodeName)
	if strings.TrimSpace(rs.K8sAddonsManifestMirror) != "" {
		out.K8sAddonsManifestMirror = K8sAddonsManifestMirrorCanonical(
			ParseManifestMirrorMode(strings.TrimSpace(rs.K8sAddonsManifestMirror)))
	}
	if rs.VCenterCacheTTLSec > 0 {
		out.VCenterCacheTTLSec = rs.VCenterCacheTTLSec
	}
	out.IdracHost = strings.TrimSpace(rs.IdracHost)
	out.IdracUser = strings.TrimSpace(rs.IdracUser)
	out.IdracPassword = rs.IdracPassword
	out.IdracInsecure = rs.IdracInsecure
	if rs.IdracVncPort > 0 {
		out.IdracVncPort = rs.IdracVncPort
	}
	out.IdracVncPassword = rs.IdracVncPassword

	return out
}
