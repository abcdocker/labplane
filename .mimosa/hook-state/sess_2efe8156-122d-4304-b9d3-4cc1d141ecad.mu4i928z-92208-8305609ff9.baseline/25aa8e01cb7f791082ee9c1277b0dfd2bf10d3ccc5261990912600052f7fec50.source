package internal

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const (
	restartAIKindPodAnalysis        = "pod_analysis"
	restartAIKindHourlyCorrelation  = "hourly_correlation"
	restartAIKindRollupStat         = "rollup_stat"
	restartAIKindWorkloadAdvisoryAI = "workload_advisory_ai"

	redisKeyRestartCorrelationLatest = "kubebt:k8s:restart_corr:latest"
	redisKeyRestartAIRollupLatest    = "kubebt:k8s:restart_ai:rollup:latest"
)

// RestartAIReportRow MySQL 行（列表 API 用）。
type RestartAIReportRow struct {
	ID         int64  `json:"id"`
	Kind       string `json:"kind"`
	Subject    string `json:"subject"`
	Title      string `json:"title"`
	Body       string `json:"body"`
	ChunksJSON string `json:"chunksJson,omitempty"`
	MetaJSON   string `json:"metaJson,omitempty"`
	CreatedBy  string `json:"createdBy,omitempty"`
	CreatedAt  string `json:"createdAt"`
}

type restartCorrelationRedisDoc struct {
	Title    string         `json:"title"`
	Body     string         `json:"body"`
	Meta     map[string]any `json:"meta,omitempty"`
	Created  string         `json:"createdAt"`
	SourceDB bool           `json:"fromDb,omitempty"`
}

// MysqlInsertRestartAIReport 写入一条报告；返回新 id。
func MysqlInsertRestartAIReport(ctx context.Context, db *sql.DB, kind, subject, title, body, chunksJSON, metaJSON, createdBy string) (int64, error) {
	if db == nil {
		return 0, fmt.Errorf("MySQL 未配置")
	}
	kind = strings.TrimSpace(kind)
	if kind == "" {
		return 0, fmt.Errorf("kind 为空")
	}
	res, err := db.ExecContext(ctx, `
INSERT INTO kubebt_k8s_restart_ai_reports (kind, subject, title, body, chunks_json, meta_json, created_by)
VALUES (?, ?, ?, ?, ?, ?, ?)`,
		kind, strings.TrimSpace(subject), strings.TrimSpace(title), body, restartAINullIfEmpty(chunksJSON), restartAINullIfEmpty(metaJSON), strings.TrimSpace(createdBy))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func restartAINullIfEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

// MysqlListRestartAIReports 列出最近记录（默认仅保留策略由定时清理实现，列表可按需截断）。
func MysqlListRestartAIReports(ctx context.Context, db *sql.DB, limit int) ([]RestartAIReportRow, error) {
	if db == nil {
		return nil, fmt.Errorf("MySQL 未配置")
	}
	if limit <= 0 || limit > 200 {
		limit = 80
	}
	rows, err := db.QueryContext(ctx, `
SELECT id, kind, subject, title, body, IFNULL(chunks_json,''), IFNULL(meta_json,''), IFNULL(created_by,''), created_at
FROM kubebt_k8s_restart_ai_reports
ORDER BY id DESC
LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RestartAIReportRow
	for rows.Next() {
		var r RestartAIReportRow
		var createdAt any
		if err := rows.Scan(&r.ID, &r.Kind, &r.Subject, &r.Title, &r.Body, &r.ChunksJSON, &r.MetaJSON, &r.CreatedBy, &createdAt); err != nil {
			return nil, err
		}
		r.CreatedAt = fmt.Sprint(createdAt)
		out = append(out, r)
	}
	return out, rows.Err()
}

func restartAIReportsWhere(kindFilter string) (suffix string, args []any) {
	switch strings.ToLower(strings.TrimSpace(kindFilter)) {
	case "pod":
		return "WHERE (kind = ? OR IFNULL(TRIM(kind),'') = '')", []any{restartAIKindPodAnalysis}
	case "workload":
		return "WHERE kind = ?", []any{restartAIKindWorkloadAdvisoryAI}
	case "cluster":
		return "WHERE kind IN (?, ?)", []any{restartAIKindHourlyCorrelation, restartAIKindRollupStat}
	default:
		return "", nil
	}
}

// MysqlCountRestartAIReportsFiltered 按 kind 分类计数（空 filter 表示全部）。
func MysqlCountRestartAIReportsFiltered(ctx context.Context, db *sql.DB, kindFilter string) (int64, error) {
	if db == nil {
		return 0, fmt.Errorf("MySQL 未配置")
	}
	suf, a := restartAIReportsWhere(kindFilter)
	q := "SELECT COUNT(*) FROM kubebt_k8s_restart_ai_reports " + suf
	row := db.QueryRowContext(ctx, q, a...)
	var n int64
	if err := row.Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

// MysqlListRestartAIReportsPaged 分页列表；kindFilter 取值 pod | workload | cluster 或空（全部）。
func MysqlListRestartAIReportsPaged(ctx context.Context, db *sql.DB, kindFilter string, offset, limit int) ([]RestartAIReportRow, error) {
	if db == nil {
		return nil, fmt.Errorf("MySQL 未配置")
	}
	if limit <= 0 || limit > 200 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	suf, a := restartAIReportsWhere(kindFilter)
	q := `SELECT id, kind, subject, title, body, IFNULL(chunks_json,''), IFNULL(meta_json,''), IFNULL(created_by,''), created_at
FROM kubebt_k8s_restart_ai_reports ` + suf + ` ORDER BY id DESC LIMIT ? OFFSET ?`
	args := append(append([]any{}, a...), limit, offset)
	rows, err := db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RestartAIReportRow
	for rows.Next() {
		var r RestartAIReportRow
		var createdAt any
		if err := rows.Scan(&r.ID, &r.Kind, &r.Subject, &r.Title, &r.Body, &r.ChunksJSON, &r.MetaJSON, &r.CreatedBy, &createdAt); err != nil {
			return nil, err
		}
		r.CreatedAt = fmt.Sprint(createdAt)
		out = append(out, r)
	}
	return out, rows.Err()
}

// MysqlDeleteRestartAIReport 按 id 删除单条。
func MysqlDeleteRestartAIReport(ctx context.Context, db *sql.DB, id int64) (int64, error) {
	if db == nil {
		return 0, fmt.Errorf("MySQL 未配置")
	}
	res, err := db.ExecContext(ctx, `DELETE FROM kubebt_k8s_restart_ai_reports WHERE id = ?`, id)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// MysqlPurgeRestartAIReportsOlderThan 删除早于 cutoff 的记录（7 天保留）。
func MysqlPurgeRestartAIReportsOlderThan(ctx context.Context, db *sql.DB, cutoff time.Time) (int64, error) {
	if db == nil {
		return 0, nil
	}
	res, err := db.ExecContext(ctx, `DELETE FROM kubebt_k8s_restart_ai_reports WHERE created_at < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// MysqlSelectLatestRestartCorrelation 取最新一条整点关联分析。
func MysqlSelectLatestRestartCorrelation(ctx context.Context, db *sql.DB) (RestartAIReportRow, bool, error) {
	var zero RestartAIReportRow
	if db == nil {
		return zero, false, nil
	}
	var r RestartAIReportRow
	var createdAt any
	err := db.QueryRowContext(ctx, `
SELECT id, kind, subject, title, body, IFNULL(chunks_json,''), IFNULL(meta_json,''), IFNULL(created_by,''), created_at
FROM kubebt_k8s_restart_ai_reports
WHERE kind = ?
ORDER BY id DESC LIMIT 1`, restartAIKindHourlyCorrelation).Scan(
		&r.ID, &r.Kind, &r.Subject, &r.Title, &r.Body, &r.ChunksJSON, &r.MetaJSON, &r.CreatedBy, &createdAt)
	if err == sql.ErrNoRows {
		return zero, false, nil
	}
	if err != nil {
		return zero, false, err
	}
	r.CreatedAt = fmt.Sprint(createdAt)
	return r, true, nil
}

// RedisSetRestartCorrelationLatest 缓存整点关联摘要。
func RedisSetRestartCorrelationLatest(ctx context.Context, r *RedisLight, title, body string, meta map[string]any) error {
	if r == nil {
		return nil
	}
	doc := restartCorrelationRedisDoc{
		Title:   title,
		Body:    body,
		Meta:    meta,
		Created: time.Now().UTC().Format(time.RFC3339),
	}
	b, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	return r.Set(ctx, redisKeyRestartCorrelationLatest, b, 26*time.Hour)
}

// RedisGetRestartCorrelationLatest 读取缓存。
func RedisGetRestartCorrelationLatest(ctx context.Context, r *RedisLight) (restartCorrelationRedisDoc, bool, error) {
	var zero restartCorrelationRedisDoc
	if r == nil {
		return zero, false, nil
	}
	s, err := r.Get(ctx, redisKeyRestartCorrelationLatest)
	if err != nil || strings.TrimSpace(s) == "" {
		return zero, false, err
	}
	var doc restartCorrelationRedisDoc
	if err := json.Unmarshal([]byte(s), &doc); err != nil {
		return zero, false, err
	}
	return doc, true, nil
}

// RedisSetRestartAIRollupLatest 将段落级样本的统计整合摘要写入 Redis（非 OpenClaw，减轻网关压力）。
func RedisSetRestartAIRollupLatest(ctx context.Context, r *RedisLight, markdown string, meta map[string]any) error {
	if r == nil {
		return nil
	}
	doc := map[string]any{
		"markdown":  markdown,
		"meta":      meta,
		"createdAt": time.Now().UTC().Format(time.RFC3339),
	}
	b, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	return r.Set(ctx, redisKeyRestartAIRollupLatest, b, 48*time.Hour)
}

// BuildRollupMarkdownFromRecentPodReports 从最近 pod_analysis 报告生成纯文本/Markdown 汇总（不调用大模型）。
func BuildRollupMarkdownFromRecentPodReports(ctx context.Context, db *sql.DB, maxReports int) (md string, meta map[string]any, err error) {
	meta = map[string]any{}
	if db == nil {
		return "", meta, fmt.Errorf("MySQL 未配置")
	}
	if maxReports <= 0 || maxReports > 50 {
		maxReports = 20
	}
	rows, err := db.QueryContext(ctx, `
SELECT subject, title, LEFT(body, 1200) AS excerpt, created_at
FROM kubebt_k8s_restart_ai_reports
WHERE kind = ?
ORDER BY id DESC
LIMIT ?`, restartAIKindPodAnalysis, maxReports)
	if err != nil {
		return "", meta, err
	}
	defer rows.Close()
	var b strings.Builder
	b.WriteString("### 近期 Pod 重启 AI 报告摘录（MySQL 聚合，未调用 OpenClaw）\n\n")
	n := 0
	for rows.Next() {
		var subj, title, excerpt, cat any
		if err := rows.Scan(&subj, &title, &excerpt, &cat); err != nil {
			return "", meta, err
		}
		n++
		b.WriteString(fmt.Sprintf("- **%v** · %v · _%v_\n", subj, title, cat))
		if s := strings.TrimSpace(fmt.Sprint(excerpt)); s != "" {
			oneLine := strings.ReplaceAll(s, "\n", " ")
			if len([]rune(oneLine)) > 220 {
				oneLine = string([]rune(oneLine)[:220]) + "…"
			}
			b.WriteString(fmt.Sprintf("  - 摘录：%s\n", oneLine))
		}
	}
	if err := rows.Err(); err != nil {
		return "", meta, err
	}
	if n == 0 {
		b.WriteString("_当前无已落库的 pod_analysis 记录（完成一次 Pod 页「AI 分析重启原因」并保存后可见）。_\n")
	}
	meta["podAnalysisSamples"] = n
	return b.String(), meta, nil
}
