package internal

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// ─────────────────────────── types ───────────────────────────

type DnsAccount struct {
	ID         int       `json:"id"`
	Name       string    `json:"name"`
	Provider   string    `json:"provider"`
	ConfigJSON string    `json:"-"`
	Remark     string    `json:"remark"`
	CreatedBy  string    `json:"createdBy"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type DnsDomain struct {
	ID          int        `json:"id"`
	Name        string     `json:"name"`
	AccountID   int        `json:"accountId"`
	AccountName string     `json:"accountName"`
	Provider    string     `json:"provider"`
	IcpBeian    string     `json:"icpBeian"`
	ExpireAt    *time.Time `json:"expireAt"`
	Remark      string     `json:"remark"`
	CreatedBy   string     `json:"createdBy"`
	CreatedAt   time.Time  `json:"createdAt"`
}

type DnsRecord struct {
	ID         string    `json:"id"`
	DomainID   int       `json:"domainId"`
	RecordType string    `json:"recordType"`
	Host       string    `json:"host"`
	Line       string    `json:"line"` // 解析线路（DNSPod/腾讯云等），空表示默认
	Value      string    `json:"value"`
	TTL        int       `json:"ttl"`
	MxPriority int       `json:"mxPriority"`
	Status     int       `json:"status"` // 1=enabled 0=disabled
	Remark     string    `json:"remark"`
	SyncedAt   time.Time `json:"syncedAt"`
}

type DnsFailoverTask struct {
	ID             int        `json:"id"`
	Name           string     `json:"name"`
	DomainID       int        `json:"domainId"`
	DomainName     string     `json:"domainName"`
	RecordID       string     `json:"recordId"`
	CheckType      string     `json:"checkType"` // ping, tcp, http
	CheckTarget    string     `json:"checkTarget"`
	CheckPort      int        `json:"checkPort"`
	CheckPath      string     `json:"checkPath"`
	CheckInterval  int        `json:"checkInterval"`
	CheckTimeout   int        `json:"checkTimeout"`
	MaxErrors      int        `json:"maxErrors"`
	FailoverValue  string     `json:"failoverValue"`
	OriginalValue  string     `json:"originalValue"`
	Status         int        `json:"status"` // 1=enabled 0=disabled
	ErrorCount     int        `json:"errorCount"`
	LastCheckAt    *time.Time `json:"lastCheckAt"`
	LastStatus     string     `json:"lastStatus"` // ok, error, unknown
	CreatedBy      string     `json:"createdBy"`
	CreatedAt      time.Time  `json:"createdAt"`
}

type DnsFailoverLog struct {
	ID        int       `json:"id"`
	TaskID    int       `json:"taskId"`
	Action    string    `json:"action"`
	OldValue  string    `json:"oldValue"`
	NewValue  string    `json:"newValue"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"createdAt"`
}

type DnsScheduledTask struct {
	ID          int        `json:"id"`
	Name        string     `json:"name"`
	DomainID    int        `json:"domainId"`
	DomainName  string     `json:"domainName"`
	RecordID    string     `json:"recordId"`
	Action      string     `json:"action"` // pause, enable, modify, delete
	NewValue    string     `json:"newValue"`
	ScheduledAt time.Time  `json:"scheduledAt"`
	Status      string     `json:"status"` // pending, done, error
	ExecutedAt  *time.Time `json:"executedAt"`
	Message     string     `json:"message"`
	CreatedBy   string     `json:"createdBy"`
	CreatedAt   time.Time  `json:"createdAt"`
}

type DnsCertOrder struct {
	ID         int        `json:"id"`
	Name       string     `json:"name"`
	AccountID  int        `json:"accountId"`
	Domains    string     `json:"domains"` // JSON array
	Email      string     `json:"email"`
	Status     string     `json:"status"` // pending, issued, failed, expired
	CertPEM    string     `json:"certPem,omitempty"`
	KeyPEM     string     `json:"keyPem,omitempty"`
	IssuedAt   *time.Time `json:"issuedAt"`
	ExpireAt   *time.Time `json:"expireAt"`
	AutoRenew  bool       `json:"autoRenew"`
	// BaotaSiteName 为宝塔「网站名」（通常与主域名一致）；证书签发后可通过 DNS 管理一键部署到该站点。
	BaotaSiteName string `json:"baotaSiteName"`
	AutoPushBaota bool   `json:"autoPushBaota"`
	CreatedBy  string     `json:"createdBy"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

// ─────────────────────────── accounts ───────────────────────────

func dnsAccountList(ctx context.Context, db *sql.DB) ([]DnsAccount, error) {
	rows, err := db.QueryContext(ctx, `SELECT id, name, provider, remark, created_by, created_at, updated_at FROM dns_accounts ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DnsAccount
	for rows.Next() {
		var a DnsAccount
		if err := rows.Scan(&a.ID, &a.Name, &a.Provider, &a.Remark, &a.CreatedBy, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func dnsAccountGet(ctx context.Context, db *sql.DB, id int) (*DnsAccount, error) {
	var a DnsAccount
	err := db.QueryRowContext(ctx, `SELECT id, name, provider, config_json, remark, created_by, created_at, updated_at FROM dns_accounts WHERE id=?`, id).
		Scan(&a.ID, &a.Name, &a.Provider, &a.ConfigJSON, &a.Remark, &a.CreatedBy, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func dnsAccountInsert(ctx context.Context, db *sql.DB, name, provider, configJSON, remark, createdBy string) (int64, error) {
	res, err := db.ExecContext(ctx,
		`INSERT INTO dns_accounts (name, provider, config_json, remark, created_by) VALUES (?,?,?,?,?)`,
		name, provider, configJSON, remark, createdBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func dnsAccountUpdate(ctx context.Context, db *sql.DB, id int, name, provider, configJSON, remark string) error {
	_, err := db.ExecContext(ctx,
		`UPDATE dns_accounts SET name=?, provider=?, config_json=?, remark=?, updated_at=NOW() WHERE id=?`,
		name, provider, configJSON, remark, id)
	return err
}

func dnsAccountDelete(ctx context.Context, db *sql.DB, id int) error {
	_, err := db.ExecContext(ctx, `DELETE FROM dns_accounts WHERE id=?`, id)
	return err
}

// ─────────────────────────── domains ───────────────────────────

func dnsDomainExpireFromSQL(raw sql.NullString) *time.Time {
	if !raw.Valid {
		return nil
	}
	s := strings.TrimSpace(raw.String)
	if s == "" || strings.HasPrefix(s, "0000-00-00") {
		return nil
	}
	if len(s) >= 10 {
		s = s[:10]
	}
	t, err := time.ParseInLocation("2006-01-02", s, time.Local)
	if err != nil {
		return nil
	}
	if t.Year() < 1972 {
		return nil
	}
	return &t
}

func dnsRealCertExpiry(ea sql.NullTime) *time.Time {
	if !ea.Valid {
		return nil
	}
	t := ea.Time
	if t.IsZero() || t.Year() < 1972 {
		return nil
	}
	return &t
}

func dnsDomainList(ctx context.Context, db *sql.DB) ([]DnsDomain, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT d.id, d.name, d.account_id, COALESCE(a.name,''), COALESCE(a.provider,''),
		       d.icp_beian, d.expire_at, d.remark, d.created_by, d.created_at
		FROM dns_domains d
		LEFT JOIN dns_accounts a ON a.id = d.account_id
		ORDER BY d.id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DnsDomain
	for rows.Next() {
		var d DnsDomain
		var expStr sql.NullString
		if err := rows.Scan(&d.ID, &d.Name, &d.AccountID, &d.AccountName, &d.Provider,
			&d.IcpBeian, &expStr, &d.Remark, &d.CreatedBy, &d.CreatedAt); err != nil {
			return nil, err
		}
		d.ExpireAt = dnsDomainExpireFromSQL(expStr)
		out = append(out, d)
	}
	return out, rows.Err()
}

func dnsDomainGet(ctx context.Context, db *sql.DB, id int) (*DnsDomain, error) {
	var d DnsDomain
	var expStr sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT d.id, d.name, d.account_id, COALESCE(a.name,''), COALESCE(a.provider,''),
		       d.icp_beian, d.expire_at, d.remark, d.created_by, d.created_at
		FROM dns_domains d
		LEFT JOIN dns_accounts a ON a.id = d.account_id
		WHERE d.id=?`, id).
		Scan(&d.ID, &d.Name, &d.AccountID, &d.AccountName, &d.Provider,
			&d.IcpBeian, &expStr, &d.Remark, &d.CreatedBy, &d.CreatedAt)
	if err != nil {
		return nil, err
	}
	d.ExpireAt = dnsDomainExpireFromSQL(expStr)
	return &d, nil
}

func dnsDomainInsert(ctx context.Context, db *sql.DB, name string, accountID int, icpBeian, expireAt, remark, createdBy string) (int64, error) {
	var exp sql.NullString
	if strings.TrimSpace(expireAt) != "" {
		exp = sql.NullString{String: strings.TrimSpace(expireAt), Valid: true}
	}
	res, err := db.ExecContext(ctx,
		`INSERT INTO dns_domains (name, account_id, icp_beian, expire_at, remark, created_by) VALUES (?,?,?,?,?,?)`,
		name, accountID, icpBeian, exp, remark, createdBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func dnsDomainUpdate(ctx context.Context, db *sql.DB, id int, name string, accountID int, icpBeian, expireAt, remark string) error {
	var exp sql.NullString
	if strings.TrimSpace(expireAt) != "" {
		exp = sql.NullString{String: strings.TrimSpace(expireAt), Valid: true}
	}
	_, err := db.ExecContext(ctx,
		`UPDATE dns_domains SET name=?, account_id=?, icp_beian=?, expire_at=?, remark=?, updated_at=NOW() WHERE id=?`,
		name, accountID, icpBeian, exp, remark, id)
	return err
}

func dnsDomainDelete(ctx context.Context, db *sql.DB, id int) error {
	_, err := db.ExecContext(ctx, `DELETE FROM dns_domains WHERE id=?`, id)
	return err
}

// dnsDomainUpsertFromProvider inserts a domain if it does not yet exist for the given
// account, or leaves existing rows untouched (preserves manually entered expire_at,
// icp_beian and remark). Returns the domain id and whether it was newly inserted.
func dnsDomainUpsertFromProvider(ctx context.Context, db *sql.DB, name string, accountID int, createdBy string) (id int64, inserted bool, err error) {
	// Check if already exists
	var existingID int
	err = db.QueryRowContext(ctx,
		`SELECT id FROM dns_domains WHERE name=? AND account_id=?`, name, accountID).
		Scan(&existingID)
	if err == nil {
		return int64(existingID), false, nil
	}
	if err != sql.ErrNoRows {
		return 0, false, err
	}
	// Insert new domain
	res, err := db.ExecContext(ctx,
		`INSERT INTO dns_domains (name, account_id, icp_beian, expire_at, remark, created_by) VALUES (?,?,?,NULL,?,?)`,
		name, accountID, "", "auto-sync", createdBy)
	if err != nil {
		return 0, false, err
	}
	lid, _ := res.LastInsertId()
	return lid, true, nil
}

// ─────────────────────────── records ───────────────────────────

func dnsRecordListByDomain(ctx context.Context, db *sql.DB, domainID int) ([]DnsRecord, error) {
	rows, err := db.QueryContext(ctx,
		`SELECT id, domain_id, record_type, host, COALESCE(record_line,''), value, ttl, mx_priority, status, remark, synced_at
		 FROM dns_records WHERE domain_id=? ORDER BY record_type, host`, domainID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DnsRecord
	for rows.Next() {
		var r DnsRecord
		if err := rows.Scan(&r.ID, &r.DomainID, &r.RecordType, &r.Host, &r.Line, &r.Value,
			&r.TTL, &r.MxPriority, &r.Status, &r.Remark, &r.SyncedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func dnsRecordUpsert(ctx context.Context, db *sql.DB, r DnsRecord) error {
	_, err := db.ExecContext(ctx, `
		INSERT INTO dns_records (id, domain_id, record_type, host, record_line, value, ttl, mx_priority, status, remark, synced_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,NOW())
		ON DUPLICATE KEY UPDATE record_type=VALUES(record_type), host=VALUES(host), record_line=VALUES(record_line), value=VALUES(value),
			ttl=VALUES(ttl), mx_priority=VALUES(mx_priority), status=VALUES(status), synced_at=NOW()`,
		r.ID, r.DomainID, r.RecordType, r.Host, r.Line, r.Value, r.TTL, r.MxPriority, r.Status, r.Remark)
	return err
}

func dnsRecordDelete(ctx context.Context, db *sql.DB, recordID string, domainID int) error {
	_, err := db.ExecContext(ctx, `DELETE FROM dns_records WHERE id=? AND domain_id=?`, recordID, domainID)
	return err
}

func dnsRecordDeleteAllByDomain(ctx context.Context, db *sql.DB, domainID int) error {
	_, err := db.ExecContext(ctx, `DELETE FROM dns_records WHERE domain_id=?`, domainID)
	return err
}

// ─────────────────────────── failover ───────────────────────────

func dnsFailoverList(ctx context.Context, db *sql.DB) ([]DnsFailoverTask, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT t.id, t.name, t.domain_id, COALESCE(d.name,''), t.record_id,
		       t.check_type, t.check_target, t.check_port, t.check_path,
		       t.check_interval, t.check_timeout, t.max_errors,
		       t.failover_value, t.original_value, t.status, t.error_count,
		       t.last_check_at, t.last_status, t.created_by, t.created_at
		FROM dns_failover_tasks t
		LEFT JOIN dns_domains d ON d.id = t.domain_id
		ORDER BY t.id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DnsFailoverTask
	for rows.Next() {
		var t DnsFailoverTask
		var lca sql.NullTime
		if err := rows.Scan(&t.ID, &t.Name, &t.DomainID, &t.DomainName, &t.RecordID,
			&t.CheckType, &t.CheckTarget, &t.CheckPort, &t.CheckPath,
			&t.CheckInterval, &t.CheckTimeout, &t.MaxErrors,
			&t.FailoverValue, &t.OriginalValue, &t.Status, &t.ErrorCount,
			&lca, &t.LastStatus, &t.CreatedBy, &t.CreatedAt); err != nil {
			return nil, err
		}
		if lca.Valid {
			t.LastCheckAt = &lca.Time
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func dnsFailoverInsert(ctx context.Context, db *sql.DB, t DnsFailoverTask) (int64, error) {
	res, err := db.ExecContext(ctx, `
		INSERT INTO dns_failover_tasks
			(name, domain_id, record_id, check_type, check_target, check_port, check_path,
			 check_interval, check_timeout, max_errors, failover_value, original_value, created_by)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		t.Name, t.DomainID, t.RecordID, t.CheckType, t.CheckTarget, t.CheckPort, t.CheckPath,
		t.CheckInterval, t.CheckTimeout, t.MaxErrors, t.FailoverValue, t.OriginalValue, t.CreatedBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func dnsFailoverUpdate(ctx context.Context, db *sql.DB, t DnsFailoverTask) error {
	_, err := db.ExecContext(ctx, `
		UPDATE dns_failover_tasks SET
			name=?, domain_id=?, record_id=?, check_type=?, check_target=?, check_port=?,
			check_path=?, check_interval=?, check_timeout=?, max_errors=?,
			failover_value=?, original_value=?, status=?, updated_at=NOW()
		WHERE id=?`,
		t.Name, t.DomainID, t.RecordID, t.CheckType, t.CheckTarget, t.CheckPort,
		t.CheckPath, t.CheckInterval, t.CheckTimeout, t.MaxErrors,
		t.FailoverValue, t.OriginalValue, t.Status, t.ID)
	return err
}

func dnsFailoverDelete(ctx context.Context, db *sql.DB, id int) error {
	_, err := db.ExecContext(ctx, `DELETE FROM dns_failover_tasks WHERE id=?`, id)
	return err
}

func dnsFailoverLogList(ctx context.Context, db *sql.DB, taskID int) ([]DnsFailoverLog, error) {
	rows, err := db.QueryContext(ctx,
		`SELECT id, task_id, action, old_value, new_value, message, created_at FROM dns_failover_logs WHERE task_id=? ORDER BY id DESC LIMIT 100`,
		taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DnsFailoverLog
	for rows.Next() {
		var l DnsFailoverLog
		if err := rows.Scan(&l.ID, &l.TaskID, &l.Action, &l.OldValue, &l.NewValue, &l.Message, &l.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func dnsFailoverLogInsert(ctx context.Context, db *sql.DB, taskID int, action, oldVal, newVal, msg string) error {
	_, err := db.ExecContext(ctx,
		`INSERT INTO dns_failover_logs (task_id, action, old_value, new_value, message) VALUES (?,?,?,?,?)`,
		taskID, action, oldVal, newVal, msg)
	return err
}

// ─────────────────────────── scheduled ───────────────────────────

func dnsScheduledList(ctx context.Context, db *sql.DB) ([]DnsScheduledTask, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT t.id, t.name, t.domain_id, COALESCE(d.name,''), t.record_id,
		       t.action, t.new_value, t.scheduled_at, t.status, t.executed_at,
		       t.message, t.created_by, t.created_at
		FROM dns_scheduled_tasks t
		LEFT JOIN dns_domains d ON d.id = t.domain_id
		ORDER BY t.scheduled_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DnsScheduledTask
	for rows.Next() {
		var t DnsScheduledTask
		var ea sql.NullTime
		if err := rows.Scan(&t.ID, &t.Name, &t.DomainID, &t.DomainName, &t.RecordID,
			&t.Action, &t.NewValue, &t.ScheduledAt, &t.Status, &ea,
			&t.Message, &t.CreatedBy, &t.CreatedAt); err != nil {
			return nil, err
		}
		if ea.Valid {
			t.ExecutedAt = &ea.Time
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func dnsScheduledInsert(ctx context.Context, db *sql.DB, t DnsScheduledTask) (int64, error) {
	res, err := db.ExecContext(ctx, `
		INSERT INTO dns_scheduled_tasks (name, domain_id, record_id, action, new_value, scheduled_at, created_by)
		VALUES (?,?,?,?,?,?,?)`,
		t.Name, t.DomainID, t.RecordID, t.Action, t.NewValue, t.ScheduledAt.Format("2006-01-02 15:04:05"), t.CreatedBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func dnsScheduledDelete(ctx context.Context, db *sql.DB, id int) error {
	_, err := db.ExecContext(ctx, `DELETE FROM dns_scheduled_tasks WHERE id=?`, id)
	return err
}

// ─────────────────────────── certs ───────────────────────────

func dnsCertOrderList(ctx context.Context, db *sql.DB) ([]DnsCertOrder, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, name, account_id, domains, email, status, issued_at, expire_at, auto_renew,
		       COALESCE(baota_site_name,''), COALESCE(auto_push_baota,0), created_by, created_at, updated_at
		FROM dns_cert_orders ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DnsCertOrder
	for rows.Next() {
		var o DnsCertOrder
		var ia, ea sql.NullTime
		var push int
		if err := rows.Scan(&o.ID, &o.Name, &o.AccountID, &o.Domains, &o.Email, &o.Status,
			&ia, &ea, &o.AutoRenew, &o.BaotaSiteName, &push, &o.CreatedBy, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		if ia.Valid {
			o.IssuedAt = &ia.Time
		}
		o.ExpireAt = dnsRealCertExpiry(ea)
		o.AutoPushBaota = push != 0
		out = append(out, o)
	}
	return out, rows.Err()
}

func dnsCertOrderGet(ctx context.Context, db *sql.DB, id int) (*DnsCertOrder, error) {
	var o DnsCertOrder
	var ia, ea sql.NullTime
	var push int
	err := db.QueryRowContext(ctx, `
		SELECT id, name, account_id, domains, email, status, cert_pem, key_pem,
		       issued_at, expire_at, auto_renew, COALESCE(baota_site_name,''), COALESCE(auto_push_baota,0),
		       created_by, created_at, updated_at
		FROM dns_cert_orders WHERE id=?`, id).
		Scan(&o.ID, &o.Name, &o.AccountID, &o.Domains, &o.Email, &o.Status, &o.CertPEM, &o.KeyPEM,
			&ia, &ea, &o.AutoRenew, &o.BaotaSiteName, &push, &o.CreatedBy, &o.CreatedAt, &o.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if ia.Valid {
		o.IssuedAt = &ia.Time
	}
	o.ExpireAt = dnsRealCertExpiry(ea)
	o.AutoPushBaota = push != 0
	return &o, nil
}

func dnsCertOrderInsert(ctx context.Context, db *sql.DB, o DnsCertOrder) (int64, error) {
	domainsJSON := strings.TrimSpace(o.Domains)
	if domainsJSON == "" {
		domainsJSON = "[]"
	}
	push := 0
	if o.AutoPushBaota {
		push = 1
	}
	res, err := db.ExecContext(ctx, `
		INSERT INTO dns_cert_orders (name, account_id, domains, email, auto_renew, baota_site_name, auto_push_baota, created_by)
		VALUES (?,?,?,?,?,?,?,?)`,
		o.Name, o.AccountID, domainsJSON, o.Email, o.AutoRenew, strings.TrimSpace(o.BaotaSiteName), push, o.CreatedBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func dnsCertOrderUpdateBaota(ctx context.Context, db *sql.DB, id int, siteName string, autoPush bool) error {
	push := 0
	if autoPush {
		push = 1
	}
	_, err := db.ExecContext(ctx, `
		UPDATE dns_cert_orders SET baota_site_name=?, auto_push_baota=?, updated_at=NOW() WHERE id=?`,
		strings.TrimSpace(siteName), push, id)
	return err
}

func dnsCertOrderUpdateStatus(ctx context.Context, db *sql.DB, id int, status, certPEM, keyPEM string, issuedAt, expireAt *time.Time) error {
	var ia, ea interface{}
	if issuedAt != nil {
		ia = issuedAt.Format("2006-01-02 15:04:05")
	}
	if expireAt != nil {
		ea = expireAt.Format("2006-01-02 15:04:05")
	}
	_, err := db.ExecContext(ctx, `
		UPDATE dns_cert_orders SET status=?, cert_pem=?, key_pem=?, issued_at=?, expire_at=?, updated_at=NOW()
		WHERE id=?`,
		status, certPEM, keyPEM, ia, ea, id)
	return err
}

func dnsCertOrderDelete(ctx context.Context, db *sql.DB, id int) error {
	_, err := db.ExecContext(ctx, `DELETE FROM dns_cert_orders WHERE id=?`, id)
	return err
}

// ─────────────────────────── stats ───────────────────────────

type DnsStats struct {
	AccountCount   int `json:"accountCount"`
	DomainCount    int `json:"domainCount"`
	RecordCount    int `json:"recordCount"`
	FailoverCount  int `json:"failoverCount"`
	ScheduledCount int `json:"scheduledCount"`
	CertCount      int `json:"certCount"`
	MysqlReachable bool `json:"mysqlReachable"`
}

func dnsGetStats(ctx context.Context, db *sql.DB) DnsStats {
	var s DnsStats
	s.MysqlReachable = db != nil
	if db == nil {
		return s
	}
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM dns_accounts`).Scan(&s.AccountCount)
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM dns_domains`).Scan(&s.DomainCount)
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM dns_records`).Scan(&s.RecordCount)
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM dns_failover_tasks`).Scan(&s.FailoverCount)
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM dns_scheduled_tasks WHERE status='pending'`).Scan(&s.ScheduledCount)
	_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM dns_cert_orders`).Scan(&s.CertCount)
	return s
}

// dnsCountDomainsByAccount 返回各 provider 的域名数量分布
func dnsCountDomainsByProvider(ctx context.Context, db *sql.DB) []map[string]interface{} {
	rows, err := db.QueryContext(ctx, `
		SELECT a.provider, COUNT(d.id) as cnt
		FROM dns_accounts a
		LEFT JOIN dns_domains d ON d.account_id = a.id
		GROUP BY a.provider`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []map[string]interface{}
	for rows.Next() {
		var provider string
		var cnt int
		if err := rows.Scan(&provider, &cnt); err != nil {
			continue
		}
		out = append(out, map[string]interface{}{"provider": provider, "count": cnt})
	}
	return out
}

func dnsIDFromPath(c interface{ Param(string) string }, key string) (int, error) {
	s := c.Param(key)
	var id int
	_, err := fmt.Sscanf(s, "%d", &id)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("invalid id: %s", s)
	}
	return id, nil
}
