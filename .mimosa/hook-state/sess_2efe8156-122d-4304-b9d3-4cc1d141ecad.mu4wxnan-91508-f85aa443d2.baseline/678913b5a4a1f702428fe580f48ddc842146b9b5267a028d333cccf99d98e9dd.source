package internal

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

func mysqlInsertAuditLog(ctx context.Context, db *sql.DB, rec AuditRecord) error {
	if db == nil {
		return nil
	}
	if strings.TrimSpace(rec.Ts) == "" {
		rec.Ts = time.Now().UTC().Format(time.RFC3339Nano)
	}
	detail := rec.Detail
	if len(detail) > 655350 {
		detail = detail[:655350] + "…"
	}
	_, err := db.ExecContext(ctx,
		`INSERT INTO kubebt_audit_log (ts, action, ip, user, method, path, status, duration_ms, detail) VALUES (?,?,?,?,?,?,?,?,?)`,
		rec.Ts, rec.Action, rec.IP, rec.User, rec.Method, rec.Path, rec.Status, rec.DurationMs, detail,
	)
	return err
}

func mysqlSelectAuditLogsRecent(ctx context.Context, db *sql.DB, fetchCap int) ([]AuditRecord, error) {
	if db == nil {
		return nil, nil
	}
	if fetchCap <= 0 {
		fetchCap = 2000
	}
	if fetchCap > 10000 {
		fetchCap = 10000
	}
	rows, err := db.QueryContext(ctx,
		`SELECT ts, action, ip, user, method, path, status, duration_ms, detail FROM kubebt_audit_log ORDER BY id DESC LIMIT ?`,
		fetchCap,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AuditRecord
	for rows.Next() {
		var r AuditRecord
		var detail sql.NullString
		if err := rows.Scan(&r.Ts, &r.Action, &r.IP, &r.User, &r.Method, &r.Path, &r.Status, &r.DurationMs, &detail); err != nil {
			continue
		}
		if detail.Valid {
			r.Detail = detail.String
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func mysqlPruneAuditLogOlderThan(ctx context.Context, db *sql.DB, cutoff time.Time) (int64, error) {
	if db == nil {
		return 0, nil
	}
	res, err := db.ExecContext(ctx, `DELETE FROM kubebt_audit_log WHERE created_at < ?`, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func mysqlAuditLogRowCount(ctx context.Context, db *sql.DB) (int64, error) {
	if db == nil {
		return 0, nil
	}
	var n int64
	err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM kubebt_audit_log`).Scan(&n)
	return n, err
}

func auditRecordToJSONLine(rec AuditRecord) string {
	b, err := json.Marshal(rec)
	if err != nil {
		return ""
	}
	return string(b)
}
