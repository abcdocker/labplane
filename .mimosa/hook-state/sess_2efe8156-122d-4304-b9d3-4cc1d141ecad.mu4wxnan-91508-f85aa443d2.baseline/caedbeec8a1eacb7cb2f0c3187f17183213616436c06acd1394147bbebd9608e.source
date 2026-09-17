package internal

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// ghProxyMirrorPrefixes 多个 ghproxy 类前缀（国内不同线路可用性差异大，依次尝试）。
var ghProxyMirrorPrefixes = []string{
	"https://ghproxy.net/",
	"https://mirror.ghproxy.com/",
	"https://ghproxy.com/",
}

// manifestURLAttemptTimeout 单条 URL 超时，便于快速换线下一条（总耗时可由上层 install ctx 限制）。
const manifestURLAttemptTimeout = 90 * time.Second

// ManifestMirrorMode 控制一键安装时拉取 YAML 的方式。
type ManifestMirrorMode int

const (
	// ManifestMirrorAuto 先直连，再 jsDelivr，再多个 ghproxy 前缀。
	ManifestMirrorAuto ManifestMirrorMode = iota
	// ManifestMirrorGhProxyPreferred 先 jsDelivr，再 ghproxy 各线，最后直连（国内推荐）。
	ManifestMirrorGhProxyPreferred
	// ManifestMirrorDirect 仅直连。
	ManifestMirrorDirect
	// ManifestMirrorGhProxyOnly 仅镜像线：jsDelivr + ghproxy（不含直连 GitHub）。
	ManifestMirrorGhProxyOnly
)

// ParseManifestMirrorMode 解析 runtime / 环境变量 / API 入参；无法识别时返回 Auto。
func ParseManifestMirrorMode(s string) ManifestMirrorMode {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "ghproxy_preferred", "china", "cn", "ghproxy-first", "ghproxyfirst":
		return ManifestMirrorGhProxyPreferred
	case "direct", "origin", "off", "false", "0":
		return ManifestMirrorDirect
	case "ghproxy", "ghproxy_only", "proxy_only":
		return ManifestMirrorGhProxyOnly
	default:
		return ManifestMirrorAuto
	}
}

// K8sAddonsManifestMirrorCanonical 供 API / 配置展示的稳定枚举值。
func K8sAddonsManifestMirrorCanonical(m ManifestMirrorMode) string {
	switch m {
	case ManifestMirrorGhProxyPreferred:
		return "ghproxy_preferred"
	case ManifestMirrorDirect:
		return "direct"
	case ManifestMirrorGhProxyOnly:
		return "ghproxy_only"
	default:
		return "auto"
	}
}

// githubRawToJsdelivrURL 将 raw.githubusercontent.com 转为 cdn.jsdelivr.net/gh（国内常比 ghproxy 稳定）。
// 格式: https://raw.githubusercontent.com/OWNER/REPO/REF/path/to/file
func githubRawToJsdelivrURL(rawURL string) (string, bool) {
	rawURL = strings.TrimSpace(rawURL)
	if i := strings.IndexByte(rawURL, '?'); i >= 0 {
		rawURL = rawURL[:i]
	}
	const prefix = "https://raw.githubusercontent.com/"
	if !strings.HasPrefix(strings.ToLower(rawURL), prefix) {
		return "", false
	}
	rest := rawURL[len(prefix):]
	parts := strings.SplitN(rest, "/", 4)
	if len(parts) < 4 {
		return "", false
	}
	owner, repo, ref, path := parts[0], parts[1], parts[2], parts[3]
	if owner == "" || repo == "" || ref == "" || path == "" {
		return "", false
	}
	return fmt.Sprintf("https://cdn.jsdelivr.net/gh/%s/%s@%s/%s", owner, repo, ref, path), true
}

func stripKnownManifestProxyPrefix(u string) string {
	u = strings.TrimSpace(u)
	low := strings.ToLower(u)
	for _, p := range ghProxyMirrorPrefixes {
		pl := strings.ToLower(p)
		if strings.HasPrefix(low, pl) {
			return strings.TrimSpace(u[len(p):])
		}
	}
	return u
}

func manifestDownloadCandidates(original string, mode ManifestMirrorMode) []string {
	base := stripKnownManifestProxyPrefix(original)
	var out []string
	seen := map[string]struct{}{}
	add := func(u string) {
		u = strings.TrimSpace(u)
		if u == "" {
			return
		}
		if _, ok := seen[u]; ok {
			return
		}
		seen[u] = struct{}{}
		out = append(out, u)
	}

	js, jsOK := githubRawToJsdelivrURL(base)

	switch mode {
	case ManifestMirrorDirect:
		add(base)
		return out
	case ManifestMirrorGhProxyPreferred:
		if jsOK {
			add(js)
		}
		for _, p := range ghProxyMirrorPrefixes {
			add(p + base)
		}
		add(base)
		return out
	case ManifestMirrorGhProxyOnly:
		if jsOK {
			add(js)
		}
		for _, p := range ghProxyMirrorPrefixes {
			add(p + base)
		}
		return out
	default: // Auto
		add(base)
		if jsOK {
			add(js)
		}
		for _, p := range ghProxyMirrorPrefixes {
			add(p + base)
		}
		return out
	}
}

func manifestErrSnippet(err error, max int) string {
	if err == nil {
		return ""
	}
	s := err.Error()
	if max > 0 && len(s) > max {
		return s[:max] + "…"
	}
	return s
}

// httpGetManifestBytes 按模式下载清单 YAML（ingress-nginx 等）。会多线路依次尝试；仅影响 YAML 下载；节点拉取容器镜像见 RewriteIngressManifestK8sRegistryImages。
func httpGetManifestBytes(ctx context.Context, url string, mode ManifestMirrorMode) ([]byte, error) {
	url = strings.TrimSpace(url)
	if url == "" {
		return nil, fmt.Errorf("清单 URL 为空")
	}
	candidates := manifestDownloadCandidates(url, mode)
	if len(candidates) == 0 {
		return nil, fmt.Errorf("无可用下载地址")
	}
	var lastErr error
	var parts []string
	for _, u := range candidates {
		attemptCtx, cancel := context.WithTimeout(ctx, manifestURLAttemptTimeout)
		b, err := httpGetBody(attemptCtx, u)
		cancel()
		if err == nil {
			return b, nil
		}
		lastErr = err
		label := u
		if len(label) > 96 {
			label = label[:96] + "…"
		}
		parts = append(parts, fmt.Sprintf("[%s] %s", label, manifestErrSnippet(err, 140)))
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("未知错误")
	}
	return nil, fmt.Errorf("已尝试 %d 条线路均失败，最后: %v；明细: %s",
		len(candidates), lastErr, strings.Join(parts, " || "))
}
