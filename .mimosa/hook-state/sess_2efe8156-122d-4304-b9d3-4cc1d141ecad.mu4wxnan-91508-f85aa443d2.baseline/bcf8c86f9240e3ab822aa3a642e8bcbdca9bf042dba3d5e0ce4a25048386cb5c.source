package internal

import (
	"strconv"
	"strings"
)

// IsManagedIngress 与 Web /status 筛选逻辑一致。
func IsManagedIngress(annotations map[string]string) bool {
	if annotations == nil {
		return false
	}
	return annotations["kube-bt-sync.io/baota-sync"] == "true"
}

type BaotaHTTPSConfig struct {
	Enable   bool
	CertName string
	PemPath  string
	KeyPath  string
}

func baotaAnnotationValue(annotations map[string]string, key string) string {
	if annotations == nil {
		return ""
	}
	return strings.TrimSpace(annotations[key])
}

// BaotaHTTPSFromAnnotations 是否为本站开启宝塔 HTTPS；证书来源按注解优先级返回，实际全局回退在 EnsureBaotaHTTPS 中处理。
func BaotaHTTPSFromAnnotations(annotations map[string]string) BaotaHTTPSConfig {
	cfg := BaotaHTTPSConfig{}
	if annotations == nil {
		return cfg
	}
	cfg.Enable = annotations["kube-bt-sync.io/baota-https"] == "true"
	cfg.CertName = baotaAnnotationValue(annotations, "kube-bt-sync.io/baota-ssl-cert-name")
	cfg.PemPath = baotaAnnotationValue(annotations, "kube-bt-sync.io/baota-ssl-pem-path")
	cfg.KeyPath = baotaAnnotationValue(annotations, "kube-bt-sync.io/baota-ssl-key-path")
	return cfg
}

func normalizeBaotaUpstreamScheme(s string) string {
	if strings.EqualFold(strings.TrimSpace(s), "https") {
		return "https"
	}
	return "http"
}

func baotaOriginDefaultPortForScheme(cfg Config, scheme string) string {
	if custom := strings.TrimSpace(cfg.BaotaUpstreamPort); custom != "" {
		return custom
	}
	if normalizeBaotaUpstreamScheme(scheme) == "https" {
		if cfg.IngressNginxHostHTTPSPort > 0 {
			return strconv.Itoa(int(cfg.IngressNginxHostHTTPSPort))
		}
		return envOrDefault("HTTPS_PORT", "443")
	}
	if p := strings.TrimSpace(cfg.DefaultPort); p != "" {
		return p
	}
	return "80"
}

// BaotaOriginTarget 返回宝塔反向代理实际使用的回源 host / scheme / port。
// 默认取全局设置；若 Ingress 带 ddns-scheme / ddns-port 注解，则按注解覆盖。
// 若未显式声明 ddns-scheme，但已开启 baota-https，则默认切到 https 回源端口。
func BaotaOriginTarget(cfg Config, annotations map[string]string) (host string, scheme string, port string) {
	host = strings.TrimSpace(cfg.BaotaUpstreamHost)
	if host == "" {
		host = strings.TrimSpace(cfg.DDNSHost)
	}
	scheme = normalizeBaotaUpstreamScheme(cfg.BaotaUpstreamScheme)
	port = baotaOriginDefaultPortForScheme(cfg, scheme)
	if annotations == nil {
		return host, scheme, port
	}
	overrideScheme := strings.ToLower(strings.TrimSpace(annotations["kube-bt-sync.io/ddns-scheme"]))
	if overrideScheme == "http" || overrideScheme == "https" {
		scheme = overrideScheme
		port = baotaOriginDefaultPortForScheme(cfg, scheme)
	} else if BaotaHTTPSFromAnnotations(annotations).Enable {
		scheme = "https"
		port = baotaOriginDefaultPortForScheme(cfg, scheme)
	}
	overridePort := strings.TrimSpace(annotations["kube-bt-sync.io/ddns-port"])
	if overridePort != "" {
		port = overridePort
	}
	return host, scheme, port
}

// BaotaDDNSTargetFromAnnotations 返回宝塔回源到 DDNS / 本地 Ingress 时使用的协议与端口。
// 默认走 http + DEFAULT_PORT；若注解声明 ddns-scheme=https，则默认切到 https + HTTPS_PORT。
func BaotaDDNSTargetFromAnnotations(annotations map[string]string, defaultHTTPPort, defaultHTTPSPort string) (scheme string, port string) {
	scheme = "http"
	port = strings.TrimSpace(defaultHTTPPort)
	if annotations == nil {
		if port == "" {
			port = "80"
		}
		return scheme, port
	}
	rawScheme := strings.ToLower(strings.TrimSpace(annotations["kube-bt-sync.io/ddns-scheme"]))
	if rawScheme == "https" {
		scheme = "https"
		port = strings.TrimSpace(defaultHTTPSPort)
	}
	customPort := strings.TrimSpace(annotations["kube-bt-sync.io/ddns-port"])
	if customPort != "" {
		port = customPort
	}
	if port == "" {
		if scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	return scheme, port
}
