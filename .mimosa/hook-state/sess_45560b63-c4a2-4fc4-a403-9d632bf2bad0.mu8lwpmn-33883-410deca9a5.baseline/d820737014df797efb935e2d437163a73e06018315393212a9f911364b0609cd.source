package internal

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

func respondK8sUnavailable(c *gin.Context) {
	c.JSON(http.StatusServiceUnavailable, gin.H{
		"error": "K8s 未连接：请先在 /setup 完成初始化，或检查集群连接",
	})
}

// GuardK8s 在 handler 入口使用；k8s 为 nil 时返回 false 并已写入响应。
func GuardK8s(c *gin.Context, k8s *kubernetes.Clientset) bool {
	if k8s == nil {
		respondK8sUnavailable(c)
		return false
	}
	return true
}

// GuardK8sREST 用于需要 rest.Config 的 WebSocket 等。
func GuardK8sREST(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) bool {
	if k8s == nil || rc == nil {
		respondK8sUnavailable(c)
		return false
	}
	return true
}
