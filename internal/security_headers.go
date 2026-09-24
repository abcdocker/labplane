package internal

import (
	"github.com/gin-gonic/gin"
)

// 内容安全策略：
//   - script/style 允许 jsdelivr 与 cdnjs（文档中心高亮/公式/Edge 降级页静态资源，见 assets_cdn.go）；
//     templates/ 降级页含少量内联脚本，React 构建页无内联脚本，保留 'unsafe-inline' 以兼容降级页。
//   - connect-src 允许 ws/wss：同源 WebSocket 终端（Pod exec、SSH、Redis CLI 等）。
//   - img/font 允许 data:/blob:：图表占位、Mermaid 导出、图标字体等运行时产物。
//   - frame-ancestors 'self'：禁止被第三方站点 iframe 嵌套（配合 X-Frame-Options 双保险）。
const securityHeadersCSP = "default-src 'self'; " +
	"script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
	"style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
	"img-src 'self' data: blob: https:; " +
	"font-src 'self' data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
	"connect-src 'self' ws: wss:; " +
	"worker-src 'self' blob:; " +
	"frame-src 'self'; " +
	"object-src 'none'; " +
	"base-uri 'self'; " +
	"form-action 'self'; " +
	"frame-ancestors 'self'"

// securityHeadersMiddleware 为所有响应追加安全响应头。
// 降级模板页（无 React dist 时）与 API 响应同样生效；CSP 对 JSON API 无副作用。
func securityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "SAMEORIGIN")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Content-Security-Policy", securityHeadersCSP)
		c.Next()
	}
}
