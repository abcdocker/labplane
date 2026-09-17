package internal

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// handleLoginPublicStatus GET /api/login/public-status — 无需登录；供登录页展示探活摘要（不返回宝塔面板 URL，避免泄露域名/端口）。
func handleLoginPublicStatus(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		out := buildSystemCheckResponse(ctx, app, DashboardRoleAdmin)
		if b, ok := out["baota"].(gin.H); ok {
			b["url"] = ""
			b["urlHidden"] = true
			out["baota"] = b
		}
		if d, ok := out["ddns"].(gin.H); ok {
			d["host"] = ""
			d["ips"] = []string{}
			d["hostHidden"] = true
			out["ddns"] = d
		}
		if k, ok := out["k8s"].(gin.H); ok {
			k["nodeIP"] = ""
			k["nodeHidden"] = true
			out["k8s"] = k
		}
		c.JSON(http.StatusOK, gin.H{"systemCheck": out})
	}
}

func handleLiveness(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"ok":           true,
		"service":      "kube-bt-sync",
		"buildVersion": sessionBuildVersionSegment(),
	})
}

func readinessPayload(ctx context.Context, app *ServerApp) (gin.H, bool) {
	cfg := app.Cfg()
	mysql := GinHMySQLSchemaStatus(ctx, app)
	reasons := make([]string, 0, 3)
	if cfg.MySQLDSN != "" {
		if reachable, _ := mysql["reachable"].(bool); !reachable {
			reasons = append(reasons, "MySQL 不可达")
		} else if aligned, _ := mysql["schemaAligned"].(bool); !aligned {
			reasons = append(reasons, "MySQL schema 未对齐")
		}
	}
	if K8sRuntimeConfigured(app.Runtime()) && app.K8s() == nil {
		reasons = append(reasons, "Kubernetes 客户端未就绪")
	}
	ready := len(reasons) == 0
	return gin.H{
		"ok":                         ready,
		"ready":                      ready,
		"service":                    "kube-bt-sync",
		"buildVersion":               sessionBuildVersionSegment(),
		"mysqlSchemaVersionExpected": AppMySQLSchemaVersion,
		"mysql":                      mysql,
		"reasons":                    reasons,
	}, ready
}

func handleReadiness(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		out, ready := readinessPayload(ctx, app)
		status := http.StatusOK
		if !ready {
			status = http.StatusServiceUnavailable
		}
		c.JSON(status, out)
	}
}

// handleHealth 保留历史路径，语义与 readiness 一致。
func handleHealth(app *ServerApp) gin.HandlerFunc { return handleReadiness(app) }
