package internal

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// APIErrorPermissionDenied 与前端约定：403 权限类错误统一展示该文案，不在 JSON 中泄露具体策略细节。
const APIErrorPermissionDenied = "权限错误"

// RespondAPIPermissionDenied 返回 403 {"error": APIErrorPermissionDenied}（非 Abort 场景）。
func RespondAPIPermissionDenied(c *gin.Context) {
	RespondAPIError(c, http.StatusForbidden, APIErrorPermissionDenied)
}

// AbortAPIPermissionDenied 中止中间件链并返回 403 权限错误。
func AbortAPIPermissionDenied(c *gin.Context) {
	AbortAPIError(c, http.StatusForbidden, APIErrorPermissionDenied)
}

// RespondAPIError 统一 JSON 错误体 {"error": msg}（与前端 ApiHttpError 约定一致）。
func RespondAPIError(c *gin.Context, status int, msg string) {
	c.JSON(status, gin.H{"error": msg})
}

// RespondAPIError500 等价于 RespondAPIError(c, http.StatusInternalServerError, msg)。
func RespondAPIError500(c *gin.Context, msg string) {
	RespondAPIError(c, http.StatusInternalServerError, msg)
}

// AbortAPIError 中止中间件链并返回统一错误 JSON（用于 DashboardAuthMiddleware 等）。
func AbortAPIError(c *gin.Context, status int, msg string) {
	c.AbortWithStatusJSON(status, gin.H{"error": msg})
}

// RespondAPIErrorMerged 先写入 "error": msg，再合并 extra 中的其它键（extra 中的 "error" 会被忽略）。
func RespondAPIErrorMerged(c *gin.Context, status int, msg string, extra gin.H) {
	h := gin.H{"error": msg}
	for k, v := range extra {
		if k == "error" {
			continue
		}
		h[k] = v
	}
	c.JSON(status, h)
}
