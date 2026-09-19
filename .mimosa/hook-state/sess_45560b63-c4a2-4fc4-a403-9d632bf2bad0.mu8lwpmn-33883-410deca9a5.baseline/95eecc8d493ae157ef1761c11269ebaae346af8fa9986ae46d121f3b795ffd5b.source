package internal

import (
	"database/sql"
	"fmt"
	"time"
)

const schemaMetaKeyRuntimeRevision = "runtime_config_revision"

func mysqlGetSchemaMeta(db *sql.DB, k string) (string, error) {
	if db == nil {
		return "", sql.ErrNoRows
	}
	var v sql.NullString
	err := db.QueryRow(`SELECT v FROM kubebt_schema_meta WHERE k=? LIMIT 1`, k).Scan(&v)
	if err != nil {
		return "", err
	}
	if !v.Valid {
		return "", nil
	}
	return v.String, nil
}

// mysqlBumpRuntimeConfigRevision 在 runtime 写入 MySQL 成功后调用，使其它副本可通过轮询检测到并 Reload。
func mysqlBumpRuntimeConfigRevision(db *sql.DB) {
	if db == nil {
		return
	}
	v := fmt.Sprintf("%d", time.Now().UnixNano())
	_ = mysqlUpsertSchemaMeta(db, schemaMetaKeyRuntimeRevision, v)
}
