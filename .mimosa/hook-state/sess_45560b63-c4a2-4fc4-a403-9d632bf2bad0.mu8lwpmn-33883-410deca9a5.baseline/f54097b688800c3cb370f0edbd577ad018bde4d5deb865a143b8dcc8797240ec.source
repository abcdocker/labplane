// Deployment 与 kubectl rollout restart 等价：为 Pod 模板打 kubectl.kubernetes.io/restartedAt 以触发重建。
package internal

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// k8sAnnotationDeploymentRestartedAt 与官方 kubectl 一致，修改即触发新 ReplicaSet / Pod 重建。
const k8sAnnotationDeploymentRestartedAt = "kubectl.kubernetes.io/restartedAt"

// handleK8sDeploymentRolloutRestart POST /api/k8s/deployments/:namespace/:name/restart
func handleK8sDeploymentRolloutRestart(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ns := strings.TrimSpace(c.Param("namespace"))
	name := strings.TrimSpace(c.Param("name"))
	if ns == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要 path: namespace, name"})
		return
	}
	ctx := c.Request.Context()
	dep, err := k8s.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Deployment 不存在"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	if dep.Spec.Template.Annotations == nil {
		dep.Spec.Template.Annotations = make(map[string]string, 1)
	}
	now := time.Now().Format(time.RFC3339)
	dep.Spec.Template.Annotations[k8sAnnotationDeploymentRestartedAt] = now
	_, err = k8s.AppsV1().Deployments(ns).Update(ctx, dep, metav1.UpdateOptions{})
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, fmt.Sprintf("Deployment 重建 Pod(rollout restart) %s/%s", ns, name))
	c.JSON(http.StatusOK, gin.H{
		"message":     "已触发滚动更新，Pod 将按策略重建",
		"restartedAt": now,
	})
}
