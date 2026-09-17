package internal

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
)

// AppMySQLSchemaVersion 应用期望的平台表结构版本（仅用于日志与 meta 表；每次增表/增列请递增）。
const AppMySQLSchemaVersion = 23

// mysqlMigrateSchema 在 CREATE TABLE 之后执行：补列、补索引，并在最后再次尝试创建仍缺失的表。
func mysqlMigrateSchema(db *sql.DB) error {
	if err := mysqlEnsureMetaTable(db); err != nil {
		return err
	}
	var alters []string
	if a, err := mysqlMigrateDashboardUsers(db); err != nil {
		return err
	} else {
		alters = append(alters, a...)
	}
	if err := mysqlEnsureDashboardUsersOidcUniqueIndex(db); err != nil {
		return err
	}
	if a, err := mysqlMigratePlatformKV(db); err != nil {
		return err
	} else {
		alters = append(alters, a...)
	}
	if a, err := mysqlMigrateKubebtDocs(db); err != nil {
		return err
	} else {
		alters = append(alters, a...)
	}
	if a, err := mysqlReconcileOpenclawSecretsColumns(db); err != nil {
		return err
	} else {
		alters = append(alters, a...)
	}
	mysqlBootstrapMissingTablesOnly(db)
	if a, err := mysqlMigrateDnsModule(db); err != nil {
		return err
	} else {
		alters = append(alters, a...)
	}
	if err := mysqlEnsureK8sObjectRevisionsIndex(db); err != nil {
		return err
	}
	if err := mysqlEnsureAuditLogIndexes(db); err != nil {
		return err
	}
	if len(alters) > 0 {
		log.Printf("MySQL 启动核对-迁移: 已补齐 %d 项: %s", len(alters), strings.Join(alters, "; "))
	} else {
		log.Printf("MySQL 启动核对-迁移: 列/索引已与 schema_version=%d 对齐（无新增 ALTER）", AppMySQLSchemaVersion)
	}
	if err := mysqlUpsertSchemaMeta(db, "app_schema_version", fmt.Sprintf("%d", AppMySQLSchemaVersion)); err != nil {
		log.Printf("MySQL: 写入 kubebt_schema_meta app_schema_version=%d 失败: %v", AppMySQLSchemaVersion, err)
	}
	return nil
}

func mysqlEnsureMetaTable(db *sql.DB) error {
	_, err := db.Exec(`
CREATE TABLE IF NOT EXISTS kubebt_schema_meta (
  k VARCHAR(64) NOT NULL PRIMARY KEY,
  v VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
	return err
}

func mysqlUpsertSchemaMeta(db *sql.DB, k, v string) error {
	_, err := db.Exec(
		`INSERT INTO kubebt_schema_meta (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)`,
		k, v,
	)
	return err
}

func mysqlTableColumns(db *sql.DB, table string) (map[string]struct{}, error) {
	rows, err := db.Query(
		`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
		table,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]struct{})
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out[strings.ToLower(name)] = struct{}{}
	}
	return out, rows.Err()
}

func mysqlMigrateDashboardUsers(db *sql.DB) ([]string, error) {
	cols, err := mysqlTableColumns(db, "kubebt_dashboard_users")
	if err != nil {
		return nil, err
	}
	if len(cols) == 0 {
		return nil, nil
	}
	// 与 mysqlEnsureSchema 中 CREATE 对齐；旧库可能缺后续加的列
	type addCol struct {
		name string
		ddl  string
	}
	additions := []addCol{
		{"email", "ADD COLUMN email VARCHAR(255) NOT NULL DEFAULT ''"},
		{"password_hash", "ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT ''"},
		{"role", "ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'viewer'"},
		{"disabled", "ADD COLUMN disabled TINYINT(1) NOT NULL DEFAULT 0"},
		{"created_at", "ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"},
		{"updated_at", "ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"},
		{"permissions_json", "ADD COLUMN permissions_json MEDIUMTEXT NULL"},
		{"totp_enabled", "ADD COLUMN totp_enabled TINYINT(1) NOT NULL DEFAULT 0"},
		{"totp_secret_enc", "ADD COLUMN totp_secret_enc MEDIUMTEXT NULL"},
		{"allow_multi_ip_login", "ADD COLUMN allow_multi_ip_login TINYINT(1) NOT NULL DEFAULT 0"},
		{"allowed_login_ips", "ADD COLUMN allowed_login_ips TEXT NULL"},
		{"oidc_issuer", "ADD COLUMN oidc_issuer VARCHAR(512) NULL DEFAULT NULL"},
		{"oidc_sub", "ADD COLUMN oidc_sub VARCHAR(768) NULL DEFAULT NULL"},
		{"avatar_url", "ADD COLUMN avatar_url VARCHAR(512) NOT NULL DEFAULT ''"},
	}
	var done []string
	for _, a := range additions {
		if _, ok := cols[a.name]; ok {
			continue
		}
		q := "ALTER TABLE kubebt_dashboard_users " + a.ddl
		if _, err := db.Exec(q); err != nil {
			return done, fmt.Errorf("kubebt_dashboard_users %s: %w", a.name, err)
		}
		done = append(done, "kubebt_dashboard_users."+a.name)
	}
	return done, nil
}

// mysqlEnsureDashboardUsersOidcUniqueIndex 同一 IdP issuer + sub 仅能绑定一个平台用户。
func mysqlEnsureDashboardUsersOidcUniqueIndex(db *sql.DB) error {
	var name sql.NullString
	err := db.QueryRow(`
		SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kubebt_dashboard_users' AND INDEX_NAME = 'uniq_oidc_issuer_sub' LIMIT 1`).Scan(&name)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if name.Valid && name.String != "" {
		return nil
	}
	_, err = db.Exec(`CREATE UNIQUE INDEX uniq_oidc_issuer_sub ON kubebt_dashboard_users (oidc_issuer(255), oidc_sub(255))`)
	if err == nil {
		return nil
	}
	es := strings.ToLower(err.Error())
	// 并发/重复建索引、或表中已有重复 (issuer,sub) 时，不因索引失败阻塞整库迁移（否则 app_schema_version 停在旧值）
	if strings.Contains(es, "duplicate key name") || strings.Contains(es, "already exists") {
		return nil
	}
	if strings.Contains(es, "duplicate entry") {
		log.Printf("MySQL: OIDC 唯一索引未创建（kubebt_dashboard_users 存在重复 oidc_issuer+oidc_sub），请清理后手工建索引 uniq_oidc_issuer_sub: %v", err)
		return nil
	}
	return err
}

func mysqlIndexExists(db *sql.DB, table, indexName string) (bool, error) {
	var n int
	err := db.QueryRow(`
		SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
		table, indexName).Scan(&n)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

func mysqlReconcileOpenclawSecretsColumns(db *sql.DB) ([]string, error) {
	cols, err := mysqlTableColumns(db, "kubebt_openclaw_instance_secrets")
	if err != nil {
		return nil, err
	}
	if len(cols) == 0 {
		return nil, nil
	}
	type addCol struct {
		name string
		ddl  string
	}
	additions := []addCol{
		{"telegram_bot_token_enc", "ADD COLUMN telegram_bot_token_enc MEDIUMTEXT NULL"},
		{"telegram_enabled", "ADD COLUMN telegram_enabled TINYINT(1) NOT NULL DEFAULT 0"},
		{"google_ok", "ADD COLUMN google_ok TINYINT(1) NOT NULL DEFAULT 0"},
		{"google_checked_at", "ADD COLUMN google_checked_at VARCHAR(64) NOT NULL DEFAULT ''"},
		{"updated_at", "ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"},
	}
	var done []string
	for _, a := range additions {
		if _, ok := cols[a.name]; ok {
			continue
		}
		q := "ALTER TABLE kubebt_openclaw_instance_secrets " + a.ddl
		if _, err := db.Exec(q); err != nil {
			return done, fmt.Errorf("kubebt_openclaw_instance_secrets %s: %w", a.name, err)
		}
		done = append(done, "kubebt_openclaw_instance_secrets."+a.name)
		cols[a.name] = struct{}{}
	}
	return done, nil
}

func mysqlEnsureK8sObjectRevisionsIndex(db *sql.DB) error {
	var tn int
	if err := db.QueryRow(`
		SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kubebt_k8s_object_revisions'`).Scan(&tn); err != nil || tn == 0 {
		return err
	}
	ok, err := mysqlIndexExists(db, "kubebt_k8s_object_revisions", "idx_k8s_obj_rev_resource")
	if err != nil || ok {
		return err
	}
	_, err = db.Exec(`CREATE INDEX idx_k8s_obj_rev_resource ON kubebt_k8s_object_revisions (namespace(128), kind(64), res_name(128), id)`)
	if err != nil {
		es := strings.ToLower(err.Error())
		if strings.Contains(es, "duplicate") {
			return nil
		}
		return err
	}
	log.Printf("MySQL: 已补建索引 kubebt_k8s_object_revisions.idx_k8s_obj_rev_resource")
	return nil
}

func mysqlEnsureAuditLogIndexes(db *sql.DB) error {
	var tn int
	if err := db.QueryRow(`
		SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kubebt_audit_log'`).Scan(&tn); err != nil || tn == 0 {
		return err
	}
	if err := mysqlEnsureNamedIndex(db, "kubebt_audit_log", "idx_audit_created",
		`CREATE INDEX idx_audit_created ON kubebt_audit_log (created_at)`); err != nil {
		return err
	}
	return mysqlEnsureNamedIndex(db, "kubebt_audit_log", "idx_audit_action",
		`CREATE INDEX idx_audit_action ON kubebt_audit_log (action)`)
}

func mysqlEnsureNamedIndex(db *sql.DB, table, indexName, createSQL string) error {
	ok, err := mysqlIndexExists(db, table, indexName)
	if err != nil || ok {
		return err
	}
	_, err = db.Exec(createSQL)
	if err != nil {
		es := strings.ToLower(err.Error())
		if strings.Contains(es, "duplicate") {
			return nil
		}
		return fmt.Errorf("%s.%s: %w", table, indexName, err)
	}
	log.Printf("MySQL: 已补建索引 %s.%s", table, indexName)
	return nil
}

func mysqlMigratePlatformKV(db *sql.DB) ([]string, error) {
	cols, err := mysqlTableColumns(db, "kubebt_platform_kv")
	if err != nil {
		return nil, err
	}
	if len(cols) == 0 {
		return nil, nil
	}
	var done []string
	if _, ok := cols["v"]; !ok {
		if _, err := db.Exec(`ALTER TABLE kubebt_platform_kv ADD COLUMN v MEDIUMTEXT`); err != nil {
			return done, fmt.Errorf("kubebt_platform_kv.v: %w", err)
		}
		done = append(done, "kubebt_platform_kv.v")
	}
	// 将过小的文本列升级为 MEDIUMTEXT，避免长 JSON 被截断
	var dataType, colType string
	err = db.QueryRow(`
SELECT DATA_TYPE, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kubebt_platform_kv' AND COLUMN_NAME = 'v'`).Scan(&dataType, &colType)
	if err != nil {
		return done, err
	}
	dt := strings.ToLower(dataType)
	if dt == "mediumtext" || dt == "longtext" {
		return done, nil
	}
	if _, err := db.Exec(`ALTER TABLE kubebt_platform_kv MODIFY COLUMN v MEDIUMTEXT`); err != nil {
		return done, fmt.Errorf("kubebt_platform_kv MODIFY v: %w", err)
	}
	done = append(done, "kubebt_platform_kv.v→MEDIUMTEXT(was "+colType+")")
	return done, nil
}

func mysqlMigrateKubebtDocs(db *sql.DB) ([]string, error) {
	cols, err := mysqlTableColumns(db, "kubebt_docs")
	if err != nil {
		return nil, err
	}
	if len(cols) == 0 {
		return nil, nil
	}
	var done []string
	if _, ok := cols["share_password_hash"]; !ok {
		if _, err := db.Exec(`ALTER TABLE kubebt_docs ADD COLUMN share_password_hash VARCHAR(255) NULL DEFAULT NULL`); err != nil {
			return done, fmt.Errorf("kubebt_docs.share_password_hash: %w", err)
		}
		done = append(done, "kubebt_docs.share_password_hash")
	}
	if _, ok := cols["content_kind"]; !ok {
		if _, err := db.Exec(`ALTER TABLE kubebt_docs ADD COLUMN content_kind VARCHAR(16) NOT NULL DEFAULT 'markdown'`); err != nil {
			return done, fmt.Errorf("kubebt_docs.content_kind: %w", err)
		}
		done = append(done, "kubebt_docs.content_kind")
	}
	verCols, err := mysqlTableColumns(db, "kubebt_doc_versions")
	if err != nil {
		return done, err
	}
	if len(verCols) > 0 {
		if _, ok := verCols["content_kind"]; !ok {
			if _, err := db.Exec(`ALTER TABLE kubebt_doc_versions ADD COLUMN content_kind VARCHAR(16) NOT NULL DEFAULT 'markdown'`); err != nil {
				return done, fmt.Errorf("kubebt_doc_versions.content_kind: %w", err)
			}
			done = append(done, "kubebt_doc_versions.content_kind")
		}
	}
	return done, nil
}

// mysqlMigrateDnsModule 补齐 DNS 管理相关列（dns_* 表由 mysqlBootstrapMissingTablesOnly 先创建）。
func mysqlMigrateDnsModule(db *sql.DB) ([]string, error) {
	var done []string
	recCols, err := mysqlTableColumns(db, "dns_records")
	if err != nil {
		return done, err
	}
	if len(recCols) > 0 {
		if _, ok := recCols["record_line"]; !ok {
			if _, err := db.Exec(`ALTER TABLE dns_records ADD COLUMN record_line VARCHAR(64) NOT NULL DEFAULT '' AFTER host`); err != nil {
				return done, fmt.Errorf("dns_records.record_line: %w", err)
			}
			done = append(done, "dns_records.record_line")
		}
	}
	certCols, err := mysqlTableColumns(db, "dns_cert_orders")
	if err != nil {
		return done, err
	}
	if len(certCols) > 0 {
		if _, ok := certCols["baota_site_name"]; !ok {
			if _, err := db.Exec(`ALTER TABLE dns_cert_orders ADD COLUMN baota_site_name VARCHAR(255) NOT NULL DEFAULT '' AFTER auto_renew`); err != nil {
				return done, fmt.Errorf("dns_cert_orders.baota_site_name: %w", err)
			}
			done = append(done, "dns_cert_orders.baota_site_name")
		}
		if _, ok := certCols["auto_push_baota"]; !ok {
			if _, err := db.Exec(`ALTER TABLE dns_cert_orders ADD COLUMN auto_push_baota TINYINT NOT NULL DEFAULT 0 AFTER baota_site_name`); err != nil {
				return done, fmt.Errorf("dns_cert_orders.auto_push_baota: %w", err)
			}
			done = append(done, "dns_cert_orders.auto_push_baota")
		}
	}
	return done, nil
}
