package internal

import (
	"strings"

	"github.com/gin-gonic/gin"
)

// ginAuditDetailKey 由业务 Handler 在成功响应前设置，access 中间件写入 audit.jsonl 的 Detail 字段。
const ginAuditDetailKey = "kubebt_audit_detail"

// SetAuditDetail 设置本条请求在审计中的补充说明（如「更新了哪些字段」）。仅应在 2xx 成功路径调用。
func SetAuditDetail(c *gin.Context, detail string) {
	if c == nil {
		return
	}
	s := strings.TrimSpace(detail)
	if s == "" {
		return
	}
	c.Set(ginAuditDetailKey, s)
}
