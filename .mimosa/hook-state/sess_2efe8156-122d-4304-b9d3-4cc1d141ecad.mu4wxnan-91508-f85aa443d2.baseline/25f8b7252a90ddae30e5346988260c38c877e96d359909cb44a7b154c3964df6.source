package internal

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// mapRedisError 将 Redis 客户端/网络错误映射为 HTTP 状态、中文说明与稳定 code（供前端停止轮询）。
func mapRedisError(err error) (status int, body gin.H) {
	if err == nil {
		return http.StatusOK, nil
	}
	raw := err.Error()
	u := strings.ToUpper(raw)
	low := strings.ToLower(raw)

	if strings.Contains(low, "decrypt") || strings.Contains(low, "cipher") {
		return http.StatusInternalServerError, gin.H{
			"error": "凭据解密失败，请检查 KUBEBT_ENCRYPTION_KEY 是否与保存密码时一致",
			"code":  "decrypt",
		}
	}

	switch {
	// 勿用 401：前端会把任意 401 当作「控制台会话失效」并整页跳转 /login。
	// Redis NOAUTH/WRONGPASS 是「对 Redis 的认证失败」，用 422 表示业务侧不可执行。
	case strings.Contains(u, "NOAUTH"):
		return http.StatusUnprocessableEntity, gin.H{
			"error": "Redis 需要认证：未提供密码、密码未保存或尚未 AUTH",
			"code":  "redis_noauth",
		}
	case strings.Contains(u, "WRONGPASS"):
		return http.StatusUnprocessableEntity, gin.H{
			"error": "Redis 密码错误（WRONGPASS），请核对实例密码或 ACL",
			"code":  "redis_wrongpass",
		}
	case strings.Contains(u, "NOPERM"):
		return http.StatusForbidden, gin.H{
			"error": APIErrorPermissionDenied,
			"code":  "redis_noperm",
		}
	case strings.Contains(u, "OOM") || strings.Contains(u, "OUT OF MEMORY"):
		return http.StatusServiceUnavailable, gin.H{
			"error": "Redis 内存不足（OOM）",
			"code":  "redis_oom",
		}
	case strings.Contains(u, "READONLY"):
		return http.StatusBadRequest, gin.H{
			"error": "当前连接为只读副本，不可写入",
			"code":  "redis_readonly",
		}
	case strings.Contains(u, "CONNECTION REFUSED") || strings.Contains(low, "connection refused"):
		return http.StatusBadGateway, gin.H{
			"error": "无法连接 Redis：目标拒绝连接（地址、端口或安全组）",
			"code":  "redis_unreachable",
		}
	case strings.Contains(u, "NO SUCH HOST") || strings.Contains(u, "NAME OR SERVICE NOT KNOWN"):
		return http.StatusBadGateway, gin.H{
			"error": "无法解析 Redis 主机名，请检查 DNS 或地址拼写",
			"code":  "redis_nohost",
		}
	case strings.Contains(u, "I/O TIMEOUT") || strings.Contains(u, "DEADLINE EXCEEDED") || strings.Contains(low, "context deadline exceeded"):
		return http.StatusGatewayTimeout, gin.H{
			"error": "连接 Redis 超时，请检查网络、防火墙与 Redis 是否监听",
			"code":  "redis_timeout",
		}
	case strings.Contains(u, "EOF") || strings.Contains(u, "RESET BY PEER") || strings.Contains(u, "CONNECTION RESET") ||
		strings.Contains(u, "BROKEN PIPE"):
		return http.StatusBadGateway, gin.H{
			"error": "与 Redis 的连接异常中断",
			"code":  "redis_io",
		}
	case strings.Contains(u, "TLS") || strings.Contains(u, "CERTIFICATE") || strings.Contains(u, "X509"):
		return http.StatusBadGateway, gin.H{
			"error": "与 Redis 的 TLS 握手失败（证书或协议不匹配）",
			"code":  "redis_tls",
		}
	default:
		return http.StatusBadGateway, gin.H{
			"error": "Redis 操作失败：" + raw,
			"code":  "redis_error",
		}
	}
}

func writeRedisOpError(c *gin.Context, err error) {
	status, body := mapRedisError(err)
	c.JSON(status, body)
}
