#!/usr/bin/env bash
# =============================================================================
# DNS 迁移脚本：dnsmgr → kube-bt-sync 平台
#
# 源库真实表结构（已实测）：
#   dnsmgr_account:    id, type, ak, sk, ext, proxy, remark, addtime
#   dnsmgr_domain:     id, aid, name, expiretime, remark, addtime
#   dnsmgr_dmtask:     id, did, rr, recordid, type, main_value, backup_value,
#                      checktype, checkurl, tcpport, frequency, cycle, timeout,
#                      remark, errcount, status, active, addtime
#   dnsmgr_dmlog:      id, taskid, action, errmsg, date
#   dnsmgr_cert_order: id, aid, fullchain, privatekey, issuetime, expiretime, status
#   dnsmgr_cert_account: id, type, name, config, ext, remark, addtime
#
# 注意：dnsmgr 不在本地存解析记录（存在云厂商侧），故无法迁移 dns_records。
#
# 用法：
#   chmod +x dns_migrate_from_dnsmgr.sh
#   ./dns_migrate_from_dnsmgr.sh
# =============================================================================
set -euo pipefail

# ──────────────────────────── 配置区（按实际修改） ────────────────────────────

# dnsmgr 数据库（源）
SRC_HOST="127.0.0.1"
SRC_PORT="3306"
SRC_USER="dnsmgr"
SRC_PASS="请替换为源库密码"
SRC_DB="dnsmgr"

# 目标平台数据库
DST_HOST="127.0.0.1"
DST_PORT="3306"
DST_USER="cmdb"
DST_PASS="请替换为目标库密码"
DST_DB="cmdb"

# 迁移时默认填入的 created_by
DEFAULT_CREATED_BY="migrated"

# ─────────────────────────────────────────────────────────────────────────────

SRC="mysql -h${SRC_HOST} -P${SRC_PORT} -u${SRC_USER} -p${SRC_PASS} ${SRC_DB} -N -s"
DST="mysql -h${DST_HOST} -P${DST_PORT} -u${DST_USER} -p${DST_PASS} ${DST_DB}"

# ─────────────────────────────────────────────────────────────────────────────
echo "=== [1/4] 在目标库创建 DNS 表（IF NOT EXISTS，幂等）==="
$DST <<'SQL'
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dns_records (
    id VARCHAR(200) NOT NULL,
    domain_id INT NOT NULL,
    record_type VARCHAR(20) NOT NULL DEFAULT 'A',
    host VARCHAR(255) NOT NULL DEFAULT '@',
    value TEXT NOT NULL,
    ttl INT NOT NULL DEFAULT 600,
    mx_priority INT NOT NULL DEFAULT 0,
    status TINYINT NOT NULL DEFAULT 1,
    remark VARCHAR(255) NOT NULL DEFAULT '',
    synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id, domain_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dns_failover_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_value TEXT NOT NULL,
    new_value TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dns_failover_logs_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
    created_by VARCHAR(100) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SQL
echo "    ✓ 建表完成"

# ─────────────────────────────────────────────────────────────────────────────
# [2/4] 迁移 DNS 服务商账号
#
# dnsmgr_account 字段：id, type(provider), ak, sk, ext, remark, addtime
# 凭据拆成 ak/sk/ext 三列，合并为 JSON 写入 config_json。
# 账号 name 用 "{type}-{id}" 生成，可在平台页面重命名。
# ─────────────────────────────────────────────────────────────────────────────
echo "=== [2/4] 迁移 DNS 服务商账号（dnsmgr_account → dns_accounts）==="

$SRC <<'QUERY' | while IFS=$'\t' read -r id type ak sk ext remark addtime; do
SELECT id,
       type,
       COALESCE(ak, ''),
       COALESCE(sk, ''),
       COALESCE(ext, ''),
       COALESCE(remark, ''),
       COALESCE(addtime, NOW())
FROM dnsmgr_account
ORDER BY id;
QUERY
  # provider 名映射
  provider="$type"
  case "$type" in
    qcloud|dnspod)       provider="dnspod" ;;
    aliyun|alidns)       provider="alidns" ;;
    cloudflare)          provider="cloudflare" ;;
    huaweidns)           provider="huaweidns" ;;
    namesilo)            provider="namesilo" ;;
    godaddy)             provider="godaddy" ;;
    namedotcom|name.com) provider="namedotcom" ;;
  esac

  # 生成账号名：{provider}-{id}（平台要求唯一，页面可改）
  acct_name="${provider}-${id}"

  # 按平台期望的字段名生成 config_json
  ak_esc="${ak//\"/\\\"}"
  sk_esc="${sk//\"/\\\"}"
  ext_esc="${ext//\"/\\\"}"
  case "$provider" in
    dnspod|tencent|tencentcloud)
      config_json="{\"secretId\":\"${ak_esc}\",\"secretKey\":\"${sk_esc}\"}" ;;
    alidns|aliyun|alibaba)
      config_json="{\"accessKeyId\":\"${ak_esc}\",\"accessKeySecret\":\"${sk_esc}\"}" ;;
    cloudflare)
      config_json="{\"apiToken\":\"${ak_esc}\"}" ;;
    *)
      config_json="{\"ak\":\"${ak_esc}\",\"sk\":\"${sk_esc}\",\"ext\":\"${ext_esc}\"}" ;;
  esac

  # 转义 SQL 单引号
  acct_name_esc="${acct_name//\'/\'\'}"
  remark_esc="${remark//\'/\'\'}"
  config_json_esc="${config_json//\'/\'\'}"

  $DST -e "INSERT IGNORE INTO dns_accounts (name, provider, config_json, remark, created_by, created_at)
           VALUES ('${acct_name_esc}', '${provider}', '${config_json_esc}', '${remark_esc}', '${DEFAULT_CREATED_BY}', '${addtime}');"
  echo "    账号: ${acct_name} (${provider})  ak=${ak:0:8}***"
done
echo "    ✓ 账号迁移完成"

# ─────────────────────────────────────────────────────────────────────────────
# [3/4] 迁移域名
#
# dnsmgr_domain 字段：id, aid(→account), name(域名), expiretime, remark, addtime
# account 按 "{provider}-{aid}" 名称在目标库中查找。
# ─────────────────────────────────────────────────────────────────────────────
echo "=== [3/4] 迁移域名（dnsmgr_domain → dns_domains）==="

$SRC <<'QUERY' | while IFS=$'\t' read -r domain_name aid acct_type expiretime remark addtime; do
SELECT d.name,
       d.aid,
       COALESCE(a.type, ''),
       COALESCE(DATE(d.expiretime), ''),
       COALESCE(d.remark, ''),
       COALESCE(d.addtime, NOW())
FROM dnsmgr_domain d
LEFT JOIN dnsmgr_account a ON a.id = d.aid
ORDER BY d.id;
QUERY
  # 还原 provider 名以匹配账号 name
  provider="$acct_type"
  case "$acct_type" in
    qcloud|dnspod)       provider="dnspod" ;;
    aliyun|alidns)       provider="alidns" ;;
    cloudflare)          provider="cloudflare" ;;
    huaweidns)           provider="huaweidns" ;;
    namesilo)            provider="namesilo" ;;
    godaddy)             provider="godaddy" ;;
    namedotcom|name.com) provider="namedotcom" ;;
  esac
  acct_name="${provider}-${aid}"

  domain_esc="${domain_name//\'/\'\'}"
  remark_esc="${remark//\'/\'\'}"
  acct_name_esc="${acct_name//\'/\'\'}"

  # expire_at 为空时传 NULL
  if [[ -z "$expiretime" ]]; then
    expire_sql="NULL"
  else
    expire_sql="'${expiretime}'"
  fi

  $DST -e "
    SET @aid = (SELECT id FROM dns_accounts WHERE name='${acct_name_esc}' LIMIT 1);
    SET @aid = COALESCE(@aid, 0);
    INSERT IGNORE INTO dns_domains (name, account_id, expire_at, remark, created_by, created_at)
    VALUES ('${domain_esc}', @aid, ${expire_sql}, '${remark_esc}', '${DEFAULT_CREATED_BY}', '${addtime}');
  "
  echo "    域名: ${domain_name} → 账号: ${acct_name}  到期: ${expiretime:-未知}"
done
echo "    ✓ 域名迁移完成"

# ─────────────────────────────────────────────────────────────────────────────
# [4/4] 迁移 Failover 任务
#
# dnsmgr_dmtask 字段：id, did(domain_id), rr(host), recordid, type(0=http/1=tcp),
#   main_value, backup_value, checktype, checkurl, tcpport, frequency(间隔分钟),
#   cycle(连续错误次数), timeout, remark, errcount, status, active, addtime
#
# 映射规则：
#   check_type:     checktype=0 → http, checktype=1 → tcp
#   check_target:   http 时用 checkurl，tcp 时用 main_value
#   check_port:     tcpport（tcp 模式）
#   check_interval: frequency * 60（分钟→秒）
#   check_timeout:  timeout（秒）
#   max_errors:     cycle
#   failover_value: backup_value
#   original_value: main_value
#   status:         active（0=停用, 1=启用）
# ─────────────────────────────────────────────────────────────────────────────
echo "=== [4/4] 迁移 Failover 任务（dnsmgr_dmtask → dns_failover_tasks）==="

$SRC <<'QUERY' | while IFS=$'\t' read -r task_id domain_name rr recordid checktype checkurl tcpport main_value backup_value frequency cycle timeout remark errcount active addtime; do
SELECT t.id,
       d.name,
       t.rr,
       COALESCE(t.recordid, ''),
       t.checktype,
       COALESCE(t.checkurl, ''),
       COALESCE(t.tcpport, 80),
       COALESCE(t.main_value, ''),
       COALESCE(t.backup_value, ''),
       t.frequency,
       t.cycle,
       t.timeout,
       COALESCE(t.remark, ''),
       t.errcount,
       t.active,
       FROM_UNIXTIME(t.addtime)
FROM dnsmgr_dmtask t
JOIN dnsmgr_domain d ON d.id = t.did
ORDER BY t.id;
QUERY
  # check_type 映射
  if [[ "$checktype" == "1" ]]; then
    check_type_str="tcp"
    check_target="$main_value"
  else
    check_type_str="http"
    check_target="$checkurl"
  fi

  # 间隔：frequency 单位是分钟，目标是秒
  check_interval=$(( frequency * 60 ))
  [[ "$check_interval" -lt 30 ]] && check_interval=30

  # 任务名：{domain}-{rr}-{task_id}
  task_name="${domain_name}-${rr}-${task_id}"

  # 转义
  task_name_esc="${task_name//\'/\'\'}"
  domain_esc="${domain_name//\'/\'\'}"
  rr_esc="${rr//\'/\'\'}"
  recordid_esc="${recordid//\'/\'\'}"
  check_target_esc="${check_target//\'/\'\'}"
  main_value_esc="${main_value//\'/\'\'}"
  backup_value_esc="${backup_value//\'/\'\'}"
  remark_esc="${remark//\'/\'\'}"

  $DST -e "
    SET @did = (SELECT id FROM dns_domains WHERE name='${domain_esc}' LIMIT 1);
    INSERT IGNORE INTO dns_failover_tasks
      (name, domain_id, record_id, check_type, check_target, check_port,
       check_interval, check_timeout, max_errors, failover_value, original_value,
       status, error_count, created_by, created_at)
    SELECT
      '${task_name_esc}', @did, '${recordid_esc}', '${check_type_str}', '${check_target_esc}',
      ${tcpport}, ${check_interval}, ${timeout}, ${cycle},
      '${backup_value_esc}', '${main_value_esc}',
      ${active}, ${errcount}, '${DEFAULT_CREATED_BY}', '${addtime}'
    WHERE @did IS NOT NULL;
  "
  echo "    Failover: ${task_name} (${check_type_str}) ${main_value} → ${backup_value}"
done
echo "    ✓ Failover 任务迁移完成"

echo ""
echo "=== 迁移完成 ==="
echo ""
echo "  已迁移："
echo "    ✓ DNS 服务商账号（dns_accounts）"
echo "    ✓ 域名列表（dns_domains）"
echo "    ✓ Failover 任务（dns_failover_tasks）"
echo ""
echo "  注意事项："
echo "    1. 账号凭据已按 {ak, sk, ext} 格式写入 config_json，"
echo "       请在平台「DNS → 服务商账号」页面逐一验证凭据是否可用。"
echo "    2. dnsmgr 不在本地存解析记录，dns_records 表无法从源库迁移。"
echo "       如需同步解析记录，请在平台页面对每个域名手动触发「同步」。"
echo "    3. 账号名格式为 {provider}-{原始id}，可在平台页面重命名。"
echo ""
echo "  支持的 provider 值："
echo "    dnspod / alidns / cloudflare / huaweidns / namesilo / godaddy / namedotcom"
