package internal

// 全局 API 限流中间件 + 审计日志导出。
// 限流：基于 IP 的滑动窗口令牌桶，可配置 QPS 上限和突发容量。
// 导出：支持 JSON 和 CSV 格式，管理员可用。

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type auditExportRow struct {
	TS     string `json:"ts"`
	User   string `json:"user"`
	IP     string `json:"ip"`
	Action string `json:"action"`
	Method string `json:"method"`
	Path   string `json:"path"`
	Status int    `json:"status"`
	Detail string `json:"detail"`
}

func auditToCSV(rows []auditExportRow) string {
	var sb strings.Builder
	sb.WriteString("ts,user,ip,action,method,path,status,detail\r\n")
	for _, r := range rows {
		sb.WriteString(csvEsc(r.TS) + "," + csvEsc(r.User) + "," + csvEsc(r.IP) + "," +
			csvEsc(r.Action) + "," + csvEsc(r.Method) + "," + csvEsc(r.Path) + "," +
			strconv.Itoa(r.Status) + "," + csvEsc(r.Detail) + "\r\n")
	}
	return sb.String()
}

func csvEsc(s string) string {
	if !strings.ContainsAny(s, ",\"\n\r") {
		return s
	}
	return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
}

// ─── 钉钉/飞书告警通知 ───

// PostDingTalkWebhook 发送钉钉群机器人通知（text 类型）。
func PostDingTalkWebhook(ctx context.Context, webhookURL, message string) error {
	if !strings.HasPrefix(webhookURL, "https://oapi.dingtalk.com/robot/send") {
		return fmt.Errorf("钉钉 webhook URL 无效")
	}
	payload := map[string]any{
		"msgtype": "text",
		"text":    map[string]string{"content": message},
	}
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, strings.NewReader(string(b)))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("钉钉 webhook HTTP %d", resp.StatusCode)
	}
	return nil
}

// PostFeishuWebhook 发送飞书群机器人通知（text 类型）。
func PostFeishuWebhook(ctx context.Context, webhookURL, message string) error {
	if !strings.HasPrefix(webhookURL, "https://open.feishu.cn/open-apis/bot") {
		return fmt.Errorf("飞书 webhook URL 无效")
	}
	payload := map[string]any{
		"msg_type": "text",
		"content":  map[string]string{"text": message},
	}
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, strings.NewReader(string(b)))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("飞书 webhook HTTP %d", resp.StatusCode)
	}
	return nil
}

// ─── 全局限流 ───

type rateLimitEntry struct {
	tokens   float64
	lastTime time.Time
}

type rateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*rateLimitEntry
	rate     float64 // tokens per second
	burst    int
}

var globalLimiter = &rateLimiter{
	visitors: make(map[string]*rateLimitEntry),
	rate:     10.0,
	burst:    20,
}

func initRateLimiter(ratePerSec float64, burst int) {
	globalLimiter.mu.Lock()
	defer globalLimiter.mu.Unlock()
	if ratePerSec > 0 {
		globalLimiter.rate = ratePerSec
	}
	if burst > 0 {
		globalLimiter.burst = burst
	}
}

func allowRequest(ip string) bool {
	globalLimiter.mu.Lock()
	defer globalLimiter.mu.Unlock()
	entry, ok := globalLimiter.visitors[ip]
	if !ok {
		globalLimiter.visitors[ip] = &rateLimitEntry{tokens: float64(globalLimiter.burst), lastTime: time.Now()}
		entry = globalLimiter.visitors[ip]
	}
	elapsed := time.Since(entry.lastTime).Seconds()
	entry.tokens += elapsed * globalLimiter.rate
	if entry.tokens > float64(globalLimiter.burst) {
		entry.tokens = float64(globalLimiter.burst)
	}
	entry.lastTime = time.Now()
	if entry.tokens < 1 {
		return false
	}
	entry.tokens--
	return true
}

// RateLimitMiddleware 全局 API 限流中间件。
func RateLimitMiddleware(ratePerSec float64, burst int) gin.HandlerFunc {
	initRateLimiter(ratePerSec, burst)
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !allowRequest(ip) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "请求过于频繁，请稍后重试"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// ─── 审计日志导出 ───

func handleAuditExport(c *gin.Context, app *ServerApp) {
	format := strings.ToLower(c.DefaultQuery("format", "json"))
	limit := 1000
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 10000 {
			limit = n
		}
	}
	dataDir := app.DataDir()
	logs := readAuditExportRows(dataDir, limit)
	switch format {
	case "csv":
		c.Header("Content-Disposition", `attachment; filename="audit_export_`+time.Now().Format("20060102_150405")+`.csv"`)
		c.Data(http.StatusOK, "text/csv; charset=utf-8", []byte(auditToCSV(logs)))
	default:
		c.Header("Content-Disposition", `attachment; filename="audit_export_`+time.Now().Format("20060102_150405")+`.json"`)
		c.JSON(http.StatusOK, gin.H{"logs": logs, "total": len(logs)})
	}
}

func readAuditExportRows(dataDir string, limit int) []auditExportRow {
	data, err := os.ReadFile(filepath.Join(dataDir, "audit.jsonl"))
	if err != nil {
		return nil
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) > limit {
		lines = lines[len(lines)-limit:]
	}
	rows := make([]auditExportRow, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var rec AuditRecord
		if json.Unmarshal([]byte(line), &rec) == nil {
			rows = append(rows, auditExportRow{
				TS: rec.Ts, User: rec.User, IP: rec.IP, Action: rec.Action,
				Method: rec.Method, Path: rec.Path, Status: rec.Status, Detail: rec.Detail,
			})
		}
	}
	return rows
}
