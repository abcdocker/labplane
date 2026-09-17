package internal

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// GinHMySQLSchemaStatus 与 GET /api/health 中 mysql 字段结构一致，供运行态诊断与缓存覆盖使用。
func GinHMySQLSchemaStatus(ctx context.Context, app *ServerApp) gin.H {
	out := gin.H{
		"configured":            false,
		"reachable":             false,
		"schemaVersionExpected": AppMySQLSchemaVersion,
		"schemaVersionRecorded": nil,
		"schemaMetaPresent":     false,
		"schemaAligned":         false,
	}
	db := app.MySQLDB()
	if db == nil {
		return out
	}
	out["configured"] = true

	ctx2, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := db.PingContext(ctx2); err != nil {
		out["reachable"] = false
		out["pingError"] = err.Error()
		return out
	}
	out["reachable"] = true

	var recorded sql.NullString
	err := db.QueryRowContext(ctx2,
		`SELECT v FROM kubebt_schema_meta WHERE k = ? LIMIT 1`,
		"app_schema_version",
	).Scan(&recorded)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		out["schemaMetaPresent"] = false
	case err != nil:
		out["schemaMetaError"] = err.Error()
	default:
		out["schemaMetaPresent"] = true
		if recorded.Valid && recorded.String != "" {
			out["schemaVersionRecorded"] = recorded.String
			if n, convErr := strconv.Atoi(recorded.String); convErr == nil {
				out["schemaAligned"] = n == AppMySQLSchemaVersion
			}
		}
	}
	return out
}

// MergeRuntimeStatusFreshDiagnostics 在 Redis 命中缓存时覆盖 buildVersion、mysqlSchema，避免发版后短时读到旧快照中的版本字段。
func MergeRuntimeStatusFreshDiagnostics(ctx context.Context, app *ServerApp, cachedJSON []byte) ([]byte, error) {
	var m map[string]interface{}
	if err := json.Unmarshal(cachedJSON, &m); err != nil {
		return cachedJSON, err
	}
	m["buildVersion"] = sessionBuildVersionSegment()
	m["mysqlSchema"] = GinHMySQLSchemaStatus(ctx, app)
	b, err := json.Marshal(m)
	if err != nil {
		return cachedJSON, err
	}
	return b, nil
}
