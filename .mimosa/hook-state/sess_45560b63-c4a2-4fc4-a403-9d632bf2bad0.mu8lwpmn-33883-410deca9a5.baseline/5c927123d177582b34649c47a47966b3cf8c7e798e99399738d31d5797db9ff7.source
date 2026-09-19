package internal

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

func mysqlPoolMaxOpen() int {
	return clampMySQLPoolInt(os.Getenv("KUBEBT_MYSQL_MAX_OPEN_CONNS"), 32, 1, 256)
}

func mysqlPoolMaxIdle() int {
	return clampMySQLPoolInt(os.Getenv("KUBEBT_MYSQL_MAX_IDLE_CONNS"), 16, 0, 128)
}

func clampMySQLPoolInt(s string, def, min, max int) int {
	s = strings.TrimSpace(s)
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}

// mysqlPingTimeout 单次 Ping 超时；过小易导致云库/跨区「context deadline exceeded」。可用 KUBEBT_MYSQL_PING_TIMEOUT_SEC（5～180，默认 30）。
func mysqlPingTimeout() time.Duration {
	sec := 30
	if s := strings.TrimSpace(os.Getenv("KUBEBT_MYSQL_PING_TIMEOUT_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 5 && n <= 180 {
			sec = n
		}
	}
	return time.Duration(sec) * time.Second
}

const runtimeConfigKVKey = "runtime_config_v1"

func openMySQLPool(dsn string) (*sql.DB, error) {
	return openMySQLPoolInternal(dsn, true)
}

func openMySQLPoolInternal(dsn string, tryAutoCreateDB bool) (*sql.DB, error) {
	dsn = strings.TrimSpace(dsn)
	if dsn == "" {
		return nil, errors.New("MySQL DSN 为空")
	}
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	maxOpen := mysqlPoolMaxOpen()
	maxIdle := mysqlPoolMaxIdle()
	if maxIdle > maxOpen {
		maxIdle = maxOpen
	}
	db.SetMaxOpenConns(maxOpen)
	db.SetMaxIdleConns(maxIdle)
	db.SetConnMaxLifetime(5 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), mysqlPingTimeout())
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		if tryAutoCreateDB && mysqlAutoCreateDatabaseEnabled() && mysqlIsUnknownDatabaseErr(err) {
			if cre := mysqlEnsureDatabaseExists(dsn); cre != nil {
				return nil, fmt.Errorf("%w（自动建库失败: %v）", err, cre)
			}
			return openMySQLPoolInternal(dsn, false)
		}
		return nil, err
	}
	return db, nil
}

// OpenMySQLPoolForRuntimeWrite 打开连接并创建/迁移 kubebt_* 表。保存 runtime 写入 platform_kv 前必须调用，否则会出现表不存在（如 1146）。
func OpenMySQLPoolForRuntimeWrite(dsn string) (*sql.DB, error) {
	dsn = strings.TrimSpace(dsn)
	if dsn == "" {
		return nil, nil
	}
	db, err := openMySQLPool(dsn)
	if err != nil {
		return nil, err
	}
	if err := mysqlEnsureSchema(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := mysqlMigrateSchema(db); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

// mysqlEnsureSchema 启动时逐张校验/创建 kubebt_* 表（见 mysql_bootstrap.go）；单表失败不阻断，由 migrate 补列与索引。
func mysqlEnsureSchema(db *sql.DB) error {
	return mysqlApplyBootstrapDDLs(db)
}

// migratePlatformKVFromFileIfMySQLEmpty 若 MySQL 中无键值，则从本地 platform_kv.json 导入。
func migratePlatformKVFromFileIfMySQLEmpty(db *sql.DB, dataDir string) error {
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM kubebt_platform_kv`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	fkv, err := newPlatformKVFile(dataDir)
	if err != nil {
		return err
	}
	for k, v := range fkv.Snapshot() {
		if err := mysqlUpsertKV(db, k, v); err != nil {
			return err
		}
	}
	if n == 0 && len(fkv.Snapshot()) > 0 {
		log.Printf("持久化: 已将 platform_kv.json 导入 MySQL（%d 条键）", len(fkv.Snapshot()))
	}
	return nil
}

func migrateRuntimeFromFileIfMySQLEmpty(db *sql.DB, path string) error {
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM kubebt_platform_kv WHERE k = ?`, runtimeConfigKVKey).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	rs, err := LoadRuntimeSettings(path)
	if err != nil || rs == nil || !rs.Initialized {
		return nil
	}
	b, err := json.Marshal(rs)
	if err != nil {
		return err
	}
	if err := mysqlUpsertKV(db, runtimeConfigKVKey, string(b)); err != nil {
		return err
	}
	log.Println("持久化: 已将 runtime-config.json 导入 MySQL")
	return nil
}

func mysqlUpsertKV(db *sql.DB, k, v string) error {
	_, err := db.Exec(
		`INSERT INTO kubebt_platform_kv (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)`,
		k, v,
	)
	return err
}

func loadRuntimeFromMySQL(db *sql.DB) (*RuntimeSettings, error) {
	var s sql.NullString
	err := db.QueryRow(`SELECT v FROM kubebt_platform_kv WHERE k=?`, runtimeConfigKVKey).Scan(&s)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	if !s.Valid || strings.TrimSpace(s.String) == "" {
		return nil, nil
	}
	var rs RuntimeSettings
	if err := json.Unmarshal([]byte(s.String), &rs); err != nil {
		return nil, err
	}
	return &rs, nil
}

// SaveRuntimeSettingsUnified 写入本地文件，并在 db 非空时写入 MySQL。
func SaveRuntimeSettingsUnified(path string, db *sql.DB, rs *RuntimeSettings) error {
	if err := SaveRuntimeSettings(path, rs); err != nil {
		return err
	}
	if db == nil {
		return nil
	}
	b, err := json.Marshal(rs)
	if err != nil {
		return err
	}
	if err := mysqlUpsertKV(db, runtimeConfigKVKey, string(b)); err != nil {
		return err
	}
	mysqlBumpRuntimeConfigRevision(db)
	return nil
}

// PlatformKVMySQL 基于 MySQL 的 platform_kv。
type PlatformKVMySQL struct {
	mu sync.Mutex
	db *sql.DB
}

func newPlatformKVMySQL(db *sql.DB) (*PlatformKVMySQL, error) {
	if db == nil {
		return nil, errors.New("mysql db nil")
	}
	return &PlatformKVMySQL{db: db}, nil
}

func (p *PlatformKVMySQL) Get(k string) (string, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	var v sql.NullString
	err := p.db.QueryRow(`SELECT v FROM kubebt_platform_kv WHERE k=?`, k).Scan(&v)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", false
		}
		return "", false
	}
	if !v.Valid {
		return "", false
	}
	return v.String, true
}

func (p *PlatformKVMySQL) Set(k, v string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	return mysqlUpsertKV(p.db, k, v)
}

func (p *PlatformKVMySQL) Snapshot() map[string]string {
	p.mu.Lock()
	defer p.mu.Unlock()
	rows, err := p.db.Query(`SELECT k,v FROM kubebt_platform_kv`)
	if err != nil {
		return map[string]string{}
	}
	defer rows.Close()
	out := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			continue
		}
		out[k] = v
	}
	return out
}

var _ PlatformKV = (*PlatformKVMySQL)(nil)

// LoadRuntimeSettingsForReload 优先从 MySQL 读 runtime（若已初始化），否则读本地文件。
func LoadRuntimeSettingsForReload(path string, db *sql.DB) (*RuntimeSettings, error) {
	if db != nil {
		if rs, err := loadRuntimeFromMySQL(db); err == nil && rs != nil && rs.Initialized {
			return rs, nil
		}
	}
	return LoadRuntimeSettings(path)
}
