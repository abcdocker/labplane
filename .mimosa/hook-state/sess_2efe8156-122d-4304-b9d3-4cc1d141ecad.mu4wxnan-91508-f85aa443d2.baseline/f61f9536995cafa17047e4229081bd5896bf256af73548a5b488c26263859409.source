package internal

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/kubernetes"
)

func buildRedisCliInnerShell(st *appRedisStoredConfig) string {
	top := strings.TrimSpace(st.K8sTopology)
	if top == "" {
		top = "standalone"
	}
	extra := ""
	if top == "cluster" {
		extra = " -c"
	}
	// Pod 内已有 REDIS_PASSWORD；用 REDISCLI_AUTH 供 redis-cli 使用，命令行不出现 -a 与明文
	return fmt.Sprintf(`if [ -n "$REDIS_PASSWORD" ]; then export REDISCLI_AUTH="$REDIS_PASSWORD"; fi; exec redis-cli%s`, extra)
}

func resolveRedisCliPodName(ctx context.Context, k8s *kubernetes.Clientset, st *appRedisStoredConfig) (string, error) {
	ns := strings.TrimSpace(st.K8sNamespace)
	base := strings.TrimSpace(st.K8sBaseName)
	top := strings.TrimSpace(st.K8sTopology)
	if top == "" {
		top = "standalone"
	}
	switch top {
	case "cluster":
		return base + "-cluster-0", nil
	case "sentinel":
		sel := labels.Set(sentinelSelector(base, "master")).AsSelector()
		return firstRunningPodName(ctx, k8s, ns, sel)
	default:
		sel := labels.Set(map[string]string{"app": base}).AsSelector()
		return firstRunningPodName(ctx, k8s, ns, sel)
	}
}

func firstRunningPodName(ctx context.Context, k8s *kubernetes.Clientset, ns string, sel labels.Selector) (string, error) {
	list, err := k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{LabelSelector: sel.String()})
	if err != nil {
		return "", err
	}
	for i := range list.Items {
		p := &list.Items[i]
		if p.Status.Phase == corev1.PodRunning {
			return p.Name, nil
		}
	}
	if len(list.Items) > 0 {
		return list.Items[0].Name, nil
	}
	return "", fmt.Errorf("未找到 Pod（请确认工作负载已就绪）")
}

func handleAppRedisRedisCLIExecWS(c *gin.Context, app *ServerApp) {
	k8s := app.K8s()
	restCfg := app.K8sREST()
	if !GuardK8sREST(c, k8s, restCfg) {
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	st, err := loadStoredForIDIfVisible(ctx, c, app, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "未找到实例"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(st.K8sNamespace) == "" || strings.TrimSpace(st.K8sBaseName) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅 Kubernetes 平台部署的实例支持控制台 redis-cli"})
		return
	}

	podName, err := resolveRedisCliPodName(ctx, k8s, st)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ns := strings.TrimSpace(st.K8sNamespace)
	inner := buildRedisCliInnerShell(st)
	cmd := []string{"/bin/sh", "-c", inner}

	conn, err := execUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("redis-cli WebSocket 升级失败: %v", err)
		return
	}
	defer conn.Close()

	if err := StreamK8sPodExecTTY(conn, k8s, restCfg, ns, podName, "redis", cmd, true); err != nil {
		// StreamK8sPodExecTTY 已写入终端
	}
}
