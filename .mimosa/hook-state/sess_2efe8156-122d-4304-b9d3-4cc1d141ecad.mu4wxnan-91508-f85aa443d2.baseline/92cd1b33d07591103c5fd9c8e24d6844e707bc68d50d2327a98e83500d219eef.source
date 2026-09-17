package internal

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// auditRetentionDays 平台审计 JSONL 保留天数；GET 与定时清理均按此截断。
const auditRetentionDays = 30

// AuditRecord 持久化操作审计（JSON Lines，一行一条）。
type AuditRecord struct {
	Ts         string `json:"ts"` // RFC3339Nano UTC
	Action     string `json:"action"`
	IP         string `json:"ip"`
	User       string `json:"user,omitempty"`
	Method     string `json:"method,omitempty"`
	Path       string `json:"path,omitempty"`
	Status     int    `json:"status,omitempty"`
	DurationMs int64  `json:"durationMs,omitempty"`
	Detail     string `json:"detail,omitempty"`
}

const auditFileName = "audit.jsonl"

var auditMu sync.Mutex

func auditFilePath(dataDir string) string {
	return filepath.Join(dataDir, auditFileName)
}

func appendAuditToLocalFile(dataDir string, rec AuditRecord) {
	if strings.TrimSpace(dataDir) == "" {
		return
	}
	if rec.Ts == "" {
		rec.Ts = time.Now().UTC().Format(time.RFC3339Nano)
	}
	b, err := json.Marshal(rec)
	if err != nil {
		return
	}
	auditMu.Lock()
	defer auditMu.Unlock()
	path := auditFilePath(dataDir)
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return
	}
	defer f.Close()
	_, _ = f.Write(append(b, '\n'))
}

// AppendAuditRecord 写入本地 audit.jsonl；若已连接 MySQL 则同时写入 kubebt_audit_log，供多副本下审计列表一致。
func AppendAuditRecord(app *ServerApp, rec AuditRecord) {
	if app == nil {
		return
	}
	dataDir := app.DataDir()
	if rec.Ts == "" {
		rec.Ts = time.Now().UTC().Format(time.RFC3339Nano)
	}
	appendAuditToLocalFile(dataDir, rec)
	if db := app.MySQLDB(); db != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		err := mysqlInsertAuditLog(ctx, db, rec)
		cancel()
		if err != nil {
			log.Printf("audit mysql insert: %v", err)
		}
	}
}

func filterAuditRecordsForUILimit(rows []AuditRecord, limit int) []AuditRecord {
	cutoff := auditRetentionCutoff()
	out := make([]AuditRecord, 0, limit)
	for _, r := range rows {
		if !auditRecordWithinRetention(r, cutoff) {
			continue
		}
		if !auditRecordKeepForUI(r) {
			continue
		}
		out = append(out, r)
		if len(out) >= limit {
			break
		}
	}
	return out
}

func handleGetAuditLogs(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 200
		if q := c.Query("limit"); q != "" {
			if n, err := parsePositiveInt(q, 100000); err == nil && n > 0 {
				limit = n
			}
		}
		path := auditFilePath(app.DataDir())
		if db := app.MySQLDB(); db != nil {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 25*time.Second)
			raw, err := mysqlSelectAuditLogsRecent(ctx, db, maxInt(limit*50, 2000))
			cancel()
			if err != nil {
				RespondAPIError500(c, err.Error())
				return
			}
			out := filterAuditRecordsForUILimit(raw, limit)
			c.JSON(http.StatusOK, gin.H{
				"logs":          out,
				"path":          path,
				"retentionDays": auditRetentionDays,
				"source":        "mysql",
			})
			return
		}
		f, err := os.Open(path)
		if err != nil {
			if os.IsNotExist(err) {
				c.JSON(http.StatusOK, gin.H{"logs": []AuditRecord{}, "path": path, "source": "file"})
				return
			}
			RespondAPIError500(c, err.Error())
			return
		}
		defer f.Close()
		lines, err := tailJSONLines(f, limit)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		cutoff := auditRetentionCutoff()
		out := make([]AuditRecord, 0, len(lines))
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			var r AuditRecord
			if err := json.Unmarshal([]byte(line), &r); err != nil {
				continue
			}
			if !auditRecordWithinRetention(r, cutoff) {
				continue
			}
			if !auditRecordKeepForUI(r) {
				continue
			}
			out = append(out, r)
		}
		c.JSON(http.StatusOK, gin.H{
			"logs":          out,
			"path":          path,
			"retentionDays": auditRetentionDays,
			"source":        "file",
		})
	}
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// auditRecordKeepForUI 与 shouldPersistAPIAudit 对齐：列表中不展示历史里「仅 GET 的 api」行，避免满屏查询日志。
func auditRecordKeepForUI(r AuditRecord) bool {
	switch strings.TrimSpace(r.Action) {
	case "login_ok", "login_fail", "logout", "security_ip_ban", "security_probe":
		return true
	case "api":
		if isPrometheusQueryAuditPath(strings.TrimSpace(r.Path)) {
			return false
		}
		m := strings.ToUpper(strings.TrimSpace(r.Method))
		return m == http.MethodPost || m == http.MethodPut || m == http.MethodPatch || http.MethodDelete == m
	default:
		return true
	}
}

func auditRetentionCutoff() time.Time {
	return time.Now().UTC().AddDate(0, 0, -auditRetentionDays)
}

func auditRecordWithinRetention(r AuditRecord, cutoff time.Time) bool {
	ts := strings.TrimSpace(r.Ts)
	if ts == "" {
		return true
	}
	t, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		t, err = time.Parse(time.RFC3339, ts)
	}
	if err != nil {
		return true
	}
	return !t.UTC().Before(cutoff)
}

func pruneAuditMySQLToRetention(db *sql.DB) error {
	if db == nil {
		return nil
	}
	cutoff := auditRetentionCutoff()
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	_, err := mysqlPruneAuditLogOlderThan(ctx, db, cutoff)
	return err
}

// PruneAuditLogToRetention 删除 audit.jsonl 中早于保留期的行（整文件重写）。
func PruneAuditLogToRetention(dataDir string) error {
	if strings.TrimSpace(dataDir) == "" {
		return nil
	}
	path := auditFilePath(dataDir)
	fi, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if fi.Size() == 0 {
		return nil
	}
	cutoff := auditRetentionCutoff()
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	const maxScan = 1024 * 1024
	buf := make([]byte, 0, 64*1024)
	sc.Buffer(buf, maxScan)
	var kept []string
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var r AuditRecord
		if json.Unmarshal([]byte(line), &r) != nil {
			kept = append(kept, line)
			continue
		}
		if auditRecordWithinRetention(r, cutoff) {
			kept = append(kept, line)
		}
	}
	if err := sc.Err(); err != nil {
		return err
	}
	if len(kept) == 0 {
		_ = os.Remove(path)
		return nil
	}
	tmp := path + ".tmp"
	tf, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	for _, line := range kept {
		if _, err := tf.WriteString(line + "\n"); err != nil {
			_ = tf.Close()
			_ = os.Remove(tmp)
			return err
		}
	}
	if err := tf.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}

// StartAuditRetentionPruner 后台按日裁剪审计（本地 JSONL + MySQL 表）。
func StartAuditRetentionPruner(app *ServerApp) {
	if app == nil {
		return
	}
	dataDir := app.DataDir()
	if strings.TrimSpace(dataDir) == "" {
		return
	}
	go func() {
		time.Sleep(15 * time.Second)
		for {
			if err := PruneAuditLogToRetention(dataDir); err != nil {
				log.Printf("audit retention prune file: %v", err)
			}
			if err := pruneAuditMySQLToRetention(app.MySQLDB()); err != nil {
				log.Printf("audit retention prune mysql: %v", err)
			}
			time.Sleep(24 * time.Hour)
		}
	}()
}

func parsePositiveInt(s string, max int) (int, error) {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil || n <= 0 {
		return 0, errors.New("invalid")
	}
	if n > max {
		n = max
	}
	return n, nil
}

// tailJSONLines 读取文件末尾若干行（简单实现：逐行缓冲，保留最后 limit 行）。
func tailJSONLines(f *os.File, limit int) ([]string, error) {
	if limit <= 0 {
		limit = 200
	}
	sc := bufio.NewScanner(f)
	const maxScan = 1024 * 1024
	buf := make([]byte, 0, 64*1024)
	sc.Buffer(buf, maxScan)

	var ring []string
	for sc.Scan() {
		line := sc.Text()
		if len(ring) < limit {
			ring = append(ring, line)
		} else {
			copy(ring, ring[1:])
			ring[limit-1] = line
		}
	}
	if err := sc.Err(); err != nil && !errors.Is(err, io.EOF) {
		return nil, err
	}
	return ring, nil
}
