package internal

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// GET /api/k8s/pod-restart-ai/reports?limit=20&offset=0&kind=pod|workload|cluster
// 未传 offset/limit 时保持旧行为：仅 limit（默认 80）截断全表。
func handleK8sPodRestartAIReportsList(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未配置 MySQL，无法列出报告"})
		return
	}
	kindFilter := strings.TrimSpace(c.Query("kind"))
	offset := -1
	limit := 80
	if v := strings.TrimSpace(c.Query("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	if v := strings.TrimSpace(c.Query("offset")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	if offset >= 0 {
		if limit > 200 {
			limit = 200
		}
		if limit <= 0 {
			limit = 20
		}
		total, err := MysqlCountRestartAIReportsFiltered(ctx, db, kindFilter)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		rows, err := MysqlListRestartAIReportsPaged(ctx, db, kindFilter, offset, limit)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "items": rows, "total": total, "offset": offset, "limit": limit, "kind": kindFilter})
		return
	}
	rows, err := MysqlListRestartAIReports(ctx, db, limit)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "items": rows})
}

// DELETE /api/k8s/pod-restart-ai/reports/:id
func handleK8sPodRestartAIReportDelete(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未配置 MySQL"})
		return
	}
	id, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	n, err := MysqlDeleteRestartAIReport(ctx, db, id)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
		return
	}
	SetAuditDetail(c, "删除重启 AI 报告 id="+strconv.FormatInt(id, 10))
	c.JSON(http.StatusOK, gin.H{"ok": true, "deleted": n})
}

type k8sRestartAISaveBody struct {
	Kind       string                      `json:"kind"`
	Namespace  string                      `json:"namespace"`
	Pod        string                      `json:"pod"`
	Title      string                      `json:"title"`
	Body       string                      `json:"body"`
	Paragraphs []k8sRestartAIParagraphSave `json:"paragraphs"`
	Meta       map[string]any              `json:"meta"`
}

type k8sRestartAIParagraphSave struct {
	Heading string `json:"heading"`
	Text    string `json:"text"`
}

// POST /api/k8s/pod-restart-ai/reports — 保存段落化分析（Pod 页 AI 完成后调用）。
func handleK8sPodRestartAIReportSave(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未配置 MySQL，无法持久化报告"})
		return
	}
	var body k8sRestartAISaveBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	kind := strings.TrimSpace(body.Kind)
	if kind == "" {
		kind = restartAIKindPodAnalysis
	}
	ns := strings.TrimSpace(body.Namespace)
	pod := strings.TrimSpace(body.Pod)
	if (kind == restartAIKindPodAnalysis || kind == restartAIKindWorkloadAdvisoryAI) && (ns == "" || pod == "") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "namespace 与 pod 必填"})
		return
	}
	if strings.TrimSpace(body.Body) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "body 为空"})
		return
	}
	subject := ns + "/" + pod
	if subject == "/" {
		subject = strings.TrimSpace(body.Title)
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		title = "重启分析 " + subject
	}
	var chunksJSON string
	if len(body.Paragraphs) > 0 {
		b, err := json.Marshal(body.Paragraphs)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		chunksJSON = string(b)
	}
	var metaJSON string
	if body.Meta != nil {
		b, err := json.Marshal(body.Meta)
		if err == nil {
			metaJSON = string(b)
		}
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	user := dashboardUsernameFromGin(c)
	id, err := MysqlInsertRestartAIReport(ctx, db, kind, subject, title, body.Body, chunksJSON, metaJSON, user)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	// 刷新 Redis 中的统计整合摘要（不调用 OpenClaw）
	if md, meta, err := BuildRollupMarkdownFromRecentPodReports(ctx, db, 24); err == nil && app.Redis() != nil {
		_ = RedisSetRestartAIRollupLatest(ctx, app.Redis(), md, meta)
	}
	SetAuditDetail(c, "保存重启 AI 报告 "+subject)
	c.JSON(http.StatusOK, gin.H{"ok": true, "id": id})
}

// GET /api/k8s/pod-restart-ai/correlation-latest
func handleK8sPodRestartAICorrelationLatest(c *gin.Context, app *ServerApp) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
	defer cancel()
	if doc, ok, err := RedisGetRestartCorrelationLatest(ctx, app.Redis()); err == nil && ok {
		c.JSON(http.StatusOK, gin.H{"ok": true, "source": "redis", "doc": doc})
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusOK, gin.H{"ok": true, "source": "none", "message": "无缓存且无 MySQL"})
		return
	}
	row, ok, err := MysqlSelectLatestRestartCorrelation(ctx, db)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if !ok {
		c.JSON(http.StatusOK, gin.H{"ok": true, "source": "none"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "source": "mysql", "report": row})
}

// GET /api/k8s/pod-restart-ai/rollup-summary
func handleK8sPodRestartAIRollupSummary(c *gin.Context, app *ServerApp) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	rdb := app.Redis()
	if rdb != nil {
		if s, err := rdb.Get(ctx, redisKeyRestartAIRollupLatest); err == nil && strings.TrimSpace(s) != "" {
			var wrap map[string]any
			if json.Unmarshal([]byte(s), &wrap) == nil {
				c.JSON(http.StatusOK, gin.H{"ok": true, "source": "redis", "data": wrap})
				return
			}
		}
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "需要 MySQL 或 Redis 缓存"})
		return
	}
	md, meta, err := BuildRollupMarkdownFromRecentPodReports(ctx, db, 24)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if rdb != nil {
		_ = RedisSetRestartAIRollupLatest(ctx, rdb, md, meta)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "source": "mysql", "markdown": md, "meta": meta})
}
