package internal

import (
	"strings"
)

// EffectiveVCenterUIBaseURL 浏览器访问 vSphere UI 的根（Nginx 对外地址）；未设 VCENTER_UI_BASE_URL 时由 VCENTER_URL 推导。
func EffectiveVCenterUIBaseURL(c Config) string {
	if s := strings.TrimSpace(c.VCenterUIBaseURL); s != "" {
		return strings.TrimRight(s, "/")
	}
	return vcenterUIOriginFromURL(c.VCenterURL)
}

// vcenterUiLoginURL 典型 vSphere Client 入口（先登录 SSO 再开控制台，用于另开标签）。
func vcenterUiLoginURL(c Config) string {
	b := EffectiveVCenterUIBaseURL(c)
	if b == "" {
		return ""
	}
	return strings.TrimRight(b, "/") + "/ui"
}
