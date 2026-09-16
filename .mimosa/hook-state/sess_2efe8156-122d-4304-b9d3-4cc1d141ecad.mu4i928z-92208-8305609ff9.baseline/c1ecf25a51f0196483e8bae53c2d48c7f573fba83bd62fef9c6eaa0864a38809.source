package internal

import (
	"database/sql"
	"log"
	"strings"
)

// mysqlApplyBootstrapDDLs 启动时对 kubebt_* 逐张 CREATE TABLE IF NOT EXISTS。
// 单表失败只记录日志，不返回错误，其余表与后续 migrate（补列、补索引）仍会继续执行。
func mysqlApplyBootstrapDDLs(db *sql.DB) error {
	var failed []string
	for _, d := range mysqlBootstrapTableDDLs {
		if _, err := db.Exec(d.SQL); err != nil {
			log.Printf("MySQL 启动核对-建表 %s: %v", d.Label, err)
			failed = append(failed, d.Label)
		}
	}
	if len(failed) > 0 {
		log.Printf("MySQL 启动核对: %d 张表 ensure 未成功（将继续 migrate 补全）: %s", len(failed), strings.Join(failed, ", "))
	} else {
		log.Printf("MySQL 启动核对: 已校验/创建 %d 张 kubebt 业务表", len(mysqlBootstrapTableDDLs))
	}
	return nil
}

// mysqlBootstrapMissingTablesOnly 在 migrate 修正索引等问题后调用：仅为当前库中不存在的 kubebt 表执行 CREATE。
func mysqlBootstrapMissingTablesOnly(db *sql.DB) {
	for _, d := range mysqlBootstrapTableDDLs {
		var n int
		if err := db.QueryRow(`
			SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
			WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, d.Label).Scan(&n); err != nil {
			log.Printf("MySQL 补建表-探测 %s: %v", d.Label, err)
			continue
		}
		if n > 0 {
			continue
		}
		if _, err := db.Exec(d.SQL); err != nil {
			log.Printf("MySQL 补建表 %s: %v", d.Label, err)
		} else {
			log.Printf("MySQL 启动核对: 已补建缺失表 %s", d.Label)
		}
	}
}

// mysqlBootstrapTableDDLs 与 mysql_platform 当前期望结构一致；新增表时在此追加并在 migrate 中补列/索引。
var mysqlBootstrapTableDDLs = []struct {
	Label string
	SQL   string
}{
	{"kubebt_platform_kv", `
CREATE TABLE IF NOT EXISTS kubebt_platform_kv (
  k VARCHAR(512) NOT NULL PRIMARY KEY,
  v MEDIUMTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_dashboard_users", `
CREATE TABLE IF NOT EXISTS kubebt_dashboard_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'viewer',
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_app_redis_instances", `
CREATE TABLE IF NOT EXISTS kubebt_app_redis_instances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  mode VARCHAR(32) NOT NULL,
  config_json MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE KEY uniq_app_redis_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_app_redis_templates", `
CREATE TABLE IF NOT EXISTS kubebt_app_redis_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(512) NULL,
  config_json MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE KEY uniq_app_redis_tpl_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_app_opensearch_templates", `
CREATE TABLE IF NOT EXISTS kubebt_app_opensearch_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(512) NULL,
  config_json MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE KEY uniq_app_opensearch_tpl_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_app_opensearch_instances", `
CREATE TABLE IF NOT EXISTS kubebt_app_opensearch_instances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  config_json MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE KEY uniq_app_opensearch_inst_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_app_kafka_templates", `
CREATE TABLE IF NOT EXISTS kubebt_app_kafka_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(512) NULL,
  config_json MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE KEY uniq_app_kafka_tpl_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_app_kafka_instances", `
CREATE TABLE IF NOT EXISTS kubebt_app_kafka_instances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  config_json MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE KEY uniq_app_kafka_inst_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_app_cloud_vm_instances", `
CREATE TABLE IF NOT EXISTS kubebt_app_cloud_vm_instances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  namespace VARCHAR(253) NOT NULL,
  config_json MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(64) NOT NULL DEFAULT '',
  UNIQUE KEY uniq_cloud_vm_ns_name (namespace, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_k8s_object_revisions", `
CREATE TABLE IF NOT EXISTS kubebt_k8s_object_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  namespace VARCHAR(253) NOT NULL,
  kind VARCHAR(128) NOT NULL,
  res_name VARCHAR(253) NOT NULL,
  ts TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  user VARCHAR(255) NOT NULL DEFAULT '',
  source VARCHAR(32) NOT NULL DEFAULT '',
  yaml MEDIUMTEXT NOT NULL,
  INDEX idx_k8s_obj_rev_resource (namespace(128), kind(64), res_name(128), id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_openclaw_instance_secrets", `
CREATE TABLE IF NOT EXISTS kubebt_openclaw_instance_secrets (
  openclaw_instance_id VARCHAR(64) NOT NULL PRIMARY KEY,
  telegram_bot_token_enc MEDIUMTEXT NULL,
  telegram_enabled TINYINT(1) NOT NULL DEFAULT 0,
  google_ok TINYINT(1) NOT NULL DEFAULT 0,
  google_checked_at VARCHAR(64) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_audit_log", `
CREATE TABLE IF NOT EXISTS kubebt_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  ts VARCHAR(64) NOT NULL,
  action VARCHAR(128) NOT NULL,
  ip VARCHAR(128) NOT NULL DEFAULT '',
  user VARCHAR(128) NOT NULL DEFAULT '',
  method VARCHAR(16) NOT NULL DEFAULT '',
  path VARCHAR(768) NOT NULL DEFAULT '',
  status INT NOT NULL DEFAULT 0,
  duration_ms BIGINT NOT NULL DEFAULT 0,
  detail MEDIUMTEXT,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_doc_categories", `
CREATE TABLE IF NOT EXISTS kubebt_doc_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doc_cat_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_doc_tags", `
CREATE TABLE IF NOT EXISTS kubebt_doc_tags (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doc_tag_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_docs", `
CREATE TABLE IF NOT EXISTS kubebt_docs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(512) NOT NULL DEFAULT '',
  body_markdown MEDIUMTEXT NOT NULL,
  content_kind VARCHAR(16) NOT NULL DEFAULT 'markdown',
  category_id BIGINT UNSIGNED NULL,
  author VARCHAR(128) NOT NULL DEFAULT '',
  published TINYINT(1) NOT NULL DEFAULT 0,
  share_password_hash VARCHAR(255) NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_docs_cat (category_id),
  INDEX idx_docs_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_doc_tag_map", `
CREATE TABLE IF NOT EXISTS kubebt_doc_tag_map (
  doc_id BIGINT UNSIGNED NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (doc_id, tag_id),
  INDEX idx_doc_tag_tag (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_doc_versions", `
CREATE TABLE IF NOT EXISTS kubebt_doc_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  doc_id BIGINT UNSIGNED NOT NULL,
  version_no INT NOT NULL,
  title VARCHAR(512) NOT NULL DEFAULT '',
  body_markdown MEDIUMTEXT NOT NULL,
  content_kind VARCHAR(16) NOT NULL DEFAULT 'markdown',
  created_by VARCHAR(128) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doc_ver (doc_id, version_no),
  INDEX idx_doc_versions_doc (doc_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
	{"kubebt_doc_media", `
CREATE TABLE IF NOT EXISTS kubebt_doc_media (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  doc_id BIGINT UNSIGNED NULL,
  kind VARCHAR(16) NOT NULL DEFAULT 'image',
  orig_name VARCHAR(512) NOT NULL DEFAULT '',
  mime VARCHAR(128) NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  storage VARCHAR(16) NOT NULL DEFAULT 'local',
  storage_key VARCHAR(1024) NOT NULL DEFAULT '',
  public_token CHAR(36) NOT NULL,
  public_url VARCHAR(2048) NOT NULL,
  created_by VARCHAR(128) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doc_media_token (public_token),
  INDEX idx_media_doc (doc_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},

	// ── DNS 管理模块 ──────────────────────────────────────────────────────────
	{"dns_accounts", `
CREATE TABLE IF NOT EXISTS dns_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  config_json TEXT NOT NULL,
  remark VARCHAR(255) NOT NULL DEFAULT '',
  created_by VARCHAR(100) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dns_account_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`},

	{"dns_domains", `
CREATE TABLE IF NOT EXISTS dns_domains (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  account_id INT NOT NULL,
  icp_beian VARCHAR(100) NOT NULL DEFAULT '',
  expire_at DATE,
  remark VARCHAR(255) NOT NULL DEFAULT '',
  created_by VARCHAR(100) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dns_domain_account (name, account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`},

	{"dns_records", `
CREATE TABLE IF NOT EXISTS dns_records (
  id VARCHAR(200) NOT NULL,
  domain_id INT NOT NULL,
  record_type VARCHAR(20) NOT NULL DEFAULT 'A',
  host VARCHAR(255) NOT NULL DEFAULT '@',
  record_line VARCHAR(64) NOT NULL DEFAULT '',
  value TEXT NOT NULL,
  ttl INT NOT NULL DEFAULT 600,
  mx_priority INT NOT NULL DEFAULT 0,
  status TINYINT NOT NULL DEFAULT 1,
  remark VARCHAR(255) NOT NULL DEFAULT '',
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  verify_status VARCHAR(32) NOT NULL DEFAULT '',
  verify_msg VARCHAR(512) NOT NULL DEFAULT '',
  verify_at DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (id, domain_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`},

	{"dns_failover_tasks", `
CREATE TABLE IF NOT EXISTS dns_failover_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  domain_id INT NOT NULL,
  record_id VARCHAR(200) NOT NULL DEFAULT '',
  check_type VARCHAR(20) NOT NULL DEFAULT 'http',
  check_target VARCHAR(255) NOT NULL,
  check_port INT NOT NULL DEFAULT 80,
  check_path VARCHAR(255) NOT NULL DEFAULT '/',
  check_interval INT NOT NULL DEFAULT 60,
  check_timeout INT NOT NULL DEFAULT 10,
  max_errors INT NOT NULL DEFAULT 3,
  failover_value TEXT NOT NULL,
  original_value TEXT NOT NULL,
  status TINYINT NOT NULL DEFAULT 1,
  error_count INT NOT NULL DEFAULT 0,
  last_check_at DATETIME,
  last_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
  created_by VARCHAR(100) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`},

	{"dns_failover_logs", `
CREATE TABLE IF NOT EXISTS dns_failover_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dns_failover_logs_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`},

	{"dns_scheduled_tasks", `
CREATE TABLE IF NOT EXISTS dns_scheduled_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  domain_id INT NOT NULL,
  record_id VARCHAR(200) NOT NULL DEFAULT '',
  action VARCHAR(20) NOT NULL DEFAULT 'modify',
  new_value TEXT NOT NULL,
  scheduled_at DATETIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  executed_at DATETIME,
  message TEXT NOT NULL,
  created_by VARCHAR(100) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`},

	{"dns_cert_orders", `
CREATE TABLE IF NOT EXISTS dns_cert_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  account_id INT NOT NULL DEFAULT 0,
  domains TEXT NOT NULL,
  email VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  cert_pem MEDIUMTEXT NOT NULL,
  key_pem MEDIUMTEXT NOT NULL,
  issued_at DATETIME,
  expire_at DATETIME,
  auto_renew TINYINT NOT NULL DEFAULT 1,
  baota_site_name VARCHAR(255) NOT NULL DEFAULT '',
  auto_push_baota TINYINT NOT NULL DEFAULT 0,
  created_by VARCHAR(100) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`},

	{"kubebt_k8s_restart_ai_reports", `
CREATE TABLE IF NOT EXISTS kubebt_k8s_restart_ai_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(48) NOT NULL,
  subject VARCHAR(512) NOT NULL DEFAULT '',
  title VARCHAR(256) NOT NULL DEFAULT '',
  body MEDIUMTEXT NOT NULL,
  chunks_json MEDIUMTEXT NULL,
  meta_json MEDIUMTEXT NULL,
  created_by VARCHAR(128) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_k8s_restart_ai_kind_created (kind, created_at),
  INDEX idx_k8s_restart_ai_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`},
}
