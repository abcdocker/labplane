package internal

import (
	"net/url"
	"strings"
)

// vCenter UI 静态资源根（与 SOAP /sdk 无关）：用于拼接 wmks.min.js 等路径。
func vcenterUIOriginFromURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	u.Path, u.RawQuery, u.Fragment = "", "", ""
	u.User = nil
	return strings.TrimRight(u.String(), "/")
}

// EffectiveVCenterWmksScriptURL 优先环境变量 VCENTER_WMKS_SCRIPT_URL，否则返回首选推导 URL。
func EffectiveVCenterWmksScriptURL(c Config) string {
	if s := strings.TrimSpace(c.VCenterWmksScriptURL); s != "" {
		return s
	}
	cands := VCenterWmksScriptURLCandidates(c)
	if len(cands) == 0 {
		return ""
	}
	return cands[0]
}

// EffectiveVCenterWmksCssURL 优先 VCENTER_WMKS_CSS_URL，否则返回首选推导 CSS。
func EffectiveVCenterWmksCssURL(c Config) string {
	if s := strings.TrimSpace(c.VCenterWmksCssURL); s != "" {
		return s
	}
	cands := VCenterWmksCssURLCandidates(c)
	if len(cands) == 0 {
		return ""
	}
	return cands[0]
}

// VCenterWmksScriptURLCandidates 常见 vSphere/vCenter 部署路径（新→旧），前端可按序尝试加载。
func VCenterWmksScriptURLCandidates(c Config) []string {
	if s := strings.TrimSpace(c.VCenterWmksScriptURL); s != "" {
		return []string{s}
	}
	o := vcenterUIOriginFromURL(c.VCenterURL)
	if o == "" {
		return nil
	}
	return []string{
		o + "/ui/web-console/wmks.min.js",            // vSphere 7/8+ H5 常见
		o + "/vsphere-client/js/wmks.min.js",         // 经典路径（govmomi 社区常用）
		o + "/vsphere-client/web-console/wmks.min.js",
		o + "/ui/resources/wmks/wmks.min.js",
	}
}

// VCenterWmksCssURLCandidates WMKS 配套样式（SDK 中多为 wmks-all.css）。
func VCenterWmksCssURLCandidates(c Config) []string {
	if s := strings.TrimSpace(c.VCenterWmksCssURL); s != "" {
		return []string{s}
	}
	o := vcenterUIOriginFromURL(c.VCenterURL)
	if o == "" {
		return nil
	}
	return []string{
		o + "/ui/web-console/wmks-all.css",
		o + "/vsphere-client/web-console/wmks-all.css",
		o + "/ui/resources/wmks/wmks-all.css",
	}
}
