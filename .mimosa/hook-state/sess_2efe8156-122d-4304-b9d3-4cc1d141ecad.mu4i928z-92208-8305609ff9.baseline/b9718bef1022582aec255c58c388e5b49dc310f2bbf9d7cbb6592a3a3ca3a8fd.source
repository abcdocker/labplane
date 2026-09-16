package internal

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const appRedisMirrorRedisKeySuffix = "app-redis-instances"

func redisAppRedisInstancesKey(cfg Config) string {
	p := strings.TrimSpace(cfg.RedisKeyPrefix)
	if p == "" {
		p = "kubebt:"
	} else if !strings.HasSuffix(p, ":") {
		p += ":"
	}
	return p + appRedisMirrorRedisKeySuffix
}

// AppRedisMode 应用中心纳管的 Redis 拓扑。
type AppRedisMode string

const (
	AppRedisStandalone  AppRedisMode = "standalone"
	AppRedisSentinel    AppRedisMode = "sentinel"
	AppRedisReplication AppRedisMode = "replication"
	// AppRedisCluster Redis Cluster 协议（多分片；K8s 部署常填集群内 DNS）
	AppRedisCluster AppRedisMode = "cluster"
)

// appRedisStoredConfig 写入 MySQL config_json（passwordEnc 为加密字段）。
type appRedisStoredConfig struct {
	Mode          AppRedisMode `json:"mode"`
	DB            int          `json:"db"`
	PasswordEnc   string       `json:"passwordEnc,omitempty"`
	Addr          string       `json:"addr,omitempty"`
	SentinelAddrs []string     `json:"sentinelAddrs,omitempty"`
	MasterName    string       `json:"masterName,omitempty"`
	MasterAddr    string       `json:"masterAddr,omitempty"`
	ReplicaAddr   string       `json:"replicaAddr,omitempty"`
	ClusterAddrs  []string     `json:"clusterAddrs,omitempty"`
	// K8s 一键部署回填（用于实例列表展示与就绪状态查询）
	K8sNamespace string `json:"k8sNamespace,omitempty"`
	K8sBaseName  string `json:"k8sBaseName,omitempty"`
	K8sTopology  string `json:"k8sTopology,omitempty"` // standalone | sentinel | cluster
	K8sSvcPort   int32  `json:"k8sSvcPort,omitempty"`
	/** K8s Service 网络模式：clusterip | nodeport | loadbalancer */
	K8sServiceType string `json:"k8sServiceType,omitempty"`
	// 以下为 K8s 一键部署时的规格快照（详情页展示；旧数据可能为空）
	K8sEngineLine            string `json:"k8sEngineLine,omitempty"`
	K8sMaxmemory             string `json:"k8sMaxmemory,omitempty"`
	K8sMaxmemoryPolicy       string `json:"k8sMaxmemoryPolicy,omitempty"`
	K8sAppendonly            bool   `json:"k8sAppendonly,omitempty"`
	K8sRedisImageResolved    string `json:"k8sRedisImageResolved,omitempty"`
	K8sExporterEnabled       bool   `json:"k8sExporterEnabled,omitempty"`
	K8sExporterImageResolved string `json:"k8sExporterImageResolved,omitempty"`
	K8sRedisCPURequest       string `json:"k8sRedisCpuRequest,omitempty"`
	K8sRedisCPULimit         string `json:"k8sRedisCpuLimit,omitempty"`
	K8sRedisMemoryRequest    string `json:"k8sRedisMemoryRequest,omitempty"`
	K8sRedisMemoryLimit      string `json:"k8sRedisMemoryLimit,omitempty"`
	K8sPersistenceEnabled    bool   `json:"k8sPersistenceEnabled,omitempty"`
	K8sStorageSize           string `json:"k8sStorageSize,omitempty"`
	K8sStorageClass          string `json:"k8sStorageClass,omitempty"`
	K8sTemplateID            int64  `json:"k8sTemplateId,omitempty"`
	K8sTemplateName          string `json:"k8sTemplateName,omitempty"`
	K8sHostNetwork           bool   `json:"k8sHostNetwork,omitempty"`
}

type appRedisRow struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Mode       string `json:"mode"`
	ConfigJSON string `json:"-"`
	CreatedAt  string `json:"createdAt,omitempty"`
	UpdatedAt  string `json:"updatedAt,omitempty"`
	CreatedBy  string `json:"createdBy,omitempty"`
}

func mirrorAppRedisInstancesToRedis(ctx context.Context, r *RedisLight, cfg Config, payload []byte) error {
	if r == nil || len(payload) == 0 {
		return nil
	}
	return r.SetPersist(ctx, redisAppRedisInstancesKey(cfg), payload)
}

func loadAppRedisMirrorFromRedis(ctx context.Context, r *RedisLight, cfg Config) ([]byte, error) {
	if r == nil {
		return nil, errors.New("redis 未连接")
	}
	s, err := r.Get(ctx, redisAppRedisInstancesKey(cfg))
	if err != nil {
		return nil, err
	}
	return []byte(s), nil
}

func appRedisListFromMySQL(ctx context.Context, db *sql.DB) ([]appRedisRow, error) {
	if db == nil {
		return nil, nil
	}
	rows, err := db.QueryContext(ctx,
		`SELECT id, name, mode, config_json, created_at, updated_at, created_by FROM kubebt_app_redis_instances ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []appRedisRow
	for rows.Next() {
		var r appRedisRow
		var created, updated sql.NullTime
		if err := rows.Scan(&r.ID, &r.Name, &r.Mode, &r.ConfigJSON, &created, &updated, &r.CreatedBy); err != nil {
			return nil, err
		}
		if created.Valid {
			r.CreatedAt = created.Time.UTC().Format(time.RFC3339)
		}
		if updated.Valid {
			r.UpdatedAt = updated.Time.UTC().Format(time.RFC3339)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func appRedisMirrorJSON(rows []appRedisRow) ([]byte, error) {
	return json.MarshalIndent(rows, "", "  ")
}

func appRedisUpsertMirror(ctx context.Context, app *ServerApp, rows []appRedisRow) {
	cfg := app.Cfg()
	b, err := appRedisMirrorJSON(rows)
	if err != nil {
		return
	}
	if r := app.Redis(); r != nil && cfg.RuntimeDualWriteRedis {
		_ = mirrorAppRedisInstancesToRedis(ctx, r, cfg, b)
	}
}

func appRedisGetByID(ctx context.Context, db *sql.DB, id int64) (*appRedisRow, error) {
	var r appRedisRow
	var created, updated sql.NullTime
	err := db.QueryRowContext(ctx,
		`SELECT id, name, mode, config_json, created_at, updated_at, created_by FROM kubebt_app_redis_instances WHERE id=?`,
		id,
	).Scan(&r.ID, &r.Name, &r.Mode, &r.ConfigJSON, &created, &updated, &r.CreatedBy)
	if err != nil {
		return nil, err
	}
	if created.Valid {
		r.CreatedAt = created.Time.UTC().Format(time.RFC3339)
	}
	if updated.Valid {
		r.UpdatedAt = updated.Time.UTC().Format(time.RFC3339)
	}
	return &r, nil
}

func appRedisDelete(ctx context.Context, db *sql.DB, id int64) error {
	_, err := db.ExecContext(ctx, `DELETE FROM kubebt_app_redis_instances WHERE id=?`, id)
	return err
}

func appRedisInsert(ctx context.Context, db *sql.DB, name, mode, configJSON, createdBy string) (int64, error) {
	res, err := db.ExecContext(ctx,
		`INSERT INTO kubebt_app_redis_instances (name, mode, config_json, created_by) VALUES (?,?,?,?)`,
		name, mode, configJSON, createdBy)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	return id, err
}

func appRedisUpdate(ctx context.Context, db *sql.DB, id int64, name, mode, configJSON string) error {
	_, err := db.ExecContext(ctx,
		`UPDATE kubebt_app_redis_instances SET name=?, mode=?, config_json=? WHERE id=?`,
		name, mode, configJSON, id)
	return err
}

func parseStoredConfig(cfg appRedisStoredConfig) (*appRedisStoredConfig, error) {
	switch cfg.Mode {
	case AppRedisStandalone:
		if strings.TrimSpace(cfg.Addr) == "" {
			return nil, errors.New("单机模式需要 addr（host:port）")
		}
	case AppRedisSentinel:
		if len(cfg.SentinelAddrs) == 0 || strings.TrimSpace(cfg.MasterName) == "" {
			return nil, errors.New("哨兵模式需要 sentinelAddrs 与 masterName")
		}
	case AppRedisReplication:
		if strings.TrimSpace(cfg.MasterAddr) == "" {
			return nil, errors.New("主从模式需要 masterAddr")
		}
	case AppRedisCluster:
		if len(cfg.ClusterAddrs) == 0 {
			return nil, errors.New("cluster 模式需要 clusterAddrs")
		}
	default:
		return nil, errors.New("mode 须为 standalone、sentinel、replication 或 cluster")
	}
	if cfg.DB < 0 || cfg.DB > 65535 {
		return nil, errors.New("db 非法")
	}
	return &cfg, nil
}

func decryptAppRedisPassword(cfg Config, enc string) (string, error) {
	key, err := sshEncryptionKey(cfg)
	if err != nil {
		return "", err
	}
	return decryptSecret(key, enc)
}

func buildStoredConfigFromRequest(cfg Config, body map[string]interface{}) (*appRedisStoredConfig, error) {
	modeStr, _ := body["mode"].(string)
	mode := AppRedisMode(strings.TrimSpace(strings.ToLower(modeStr)))
	st := &appRedisStoredConfig{Mode: mode}
	if v, ok := body["db"].(float64); ok {
		st.DB = int(v)
	}
	pass, _ := body["password"].(string)
	key, encErr := sshEncryptionKey(cfg)
	if encErr != nil && strings.TrimSpace(pass) != "" {
		return nil, encErr
	}
	if encErr == nil && strings.TrimSpace(pass) != "" {
		enc, err := encryptSecret(key, pass)
		if err != nil {
			return nil, err
		}
		st.PasswordEnc = enc
	}
	switch mode {
	case AppRedisStandalone:
		st.Addr, _ = body["addr"].(string)
		st.Addr = strings.TrimSpace(st.Addr)
	case AppRedisSentinel:
		if arr, ok := body["sentinelAddrs"].([]interface{}); ok {
			for _, x := range arr {
				if s, ok := x.(string); ok && strings.TrimSpace(s) != "" {
					st.SentinelAddrs = append(st.SentinelAddrs, strings.TrimSpace(s))
				}
			}
		}
		st.MasterName, _ = body["masterName"].(string)
		st.MasterName = strings.TrimSpace(st.MasterName)
	case AppRedisReplication:
		st.MasterAddr, _ = body["masterAddr"].(string)
		st.MasterAddr = strings.TrimSpace(st.MasterAddr)
		st.ReplicaAddr, _ = body["replicaAddr"].(string)
		st.ReplicaAddr = strings.TrimSpace(st.ReplicaAddr)
	case AppRedisCluster:
		if arr, ok := body["clusterAddrs"].([]interface{}); ok {
			for _, x := range arr {
				if s, ok := x.(string); ok && strings.TrimSpace(s) != "" {
					st.ClusterAddrs = append(st.ClusterAddrs, strings.TrimSpace(s))
				}
			}
		}
	default:
		return nil, errors.New("mode 须为 standalone、sentinel、replication 或 cluster")
	}
	return parseStoredConfig(*st)
}

func mergePasswordOnUpdate(cfg Config, prev *appRedisStoredConfig, body map[string]interface{}) (*appRedisStoredConfig, error) {
	b, err := json.Marshal(prev)
	if err != nil {
		return nil, err
	}
	var next appRedisStoredConfig
	if err := json.Unmarshal(b, &next); err != nil {
		return nil, err
	}
	if v, ok := body["db"].(float64); ok {
		next.DB = int(v)
	}
	pass, hasPass := body["password"].(string)
	if hasPass && strings.TrimSpace(pass) != "" {
		key, err := sshEncryptionKey(cfg)
		if err != nil {
			return nil, err
		}
		enc, err := encryptSecret(key, pass)
		if err != nil {
			return nil, err
		}
		next.PasswordEnc = enc
	}
	switch next.Mode {
	case AppRedisStandalone:
		if a, ok := body["addr"].(string); ok && strings.TrimSpace(a) != "" {
			next.Addr = strings.TrimSpace(a)
		}
	case AppRedisSentinel:
		if arr, ok := body["sentinelAddrs"].([]interface{}); ok && len(arr) > 0 {
			next.SentinelAddrs = nil
			for _, x := range arr {
				if s, ok := x.(string); ok && strings.TrimSpace(s) != "" {
					next.SentinelAddrs = append(next.SentinelAddrs, strings.TrimSpace(s))
				}
			}
		}
		if m, ok := body["masterName"].(string); ok && strings.TrimSpace(m) != "" {
			next.MasterName = strings.TrimSpace(m)
		}
	case AppRedisReplication:
		if a, ok := body["masterAddr"].(string); ok && strings.TrimSpace(a) != "" {
			next.MasterAddr = strings.TrimSpace(a)
		}
		if a, ok := body["replicaAddr"].(string); ok {
			next.ReplicaAddr = strings.TrimSpace(a)
		}
	case AppRedisCluster:
		if arr, ok := body["clusterAddrs"].([]interface{}); ok && len(arr) > 0 {
			next.ClusterAddrs = nil
			for _, x := range arr {
				if s, ok := x.(string); ok && strings.TrimSpace(s) != "" {
					next.ClusterAddrs = append(next.ClusterAddrs, strings.TrimSpace(s))
				}
			}
		}
	}
	return parseStoredConfig(next)
}

// openAppRedisClient 连接用户纳管的 Redis（用完需 Close）。
func openAppRedisClient(ctx context.Context, cfg Config, st *appRedisStoredConfig) (redis.Cmdable, func(), error) {
	pass, err := decryptAppRedisPassword(cfg, st.PasswordEnc)
	if err != nil {
		return nil, nil, err
	}
	_ = ctx // 使用带超时的 context 由调用方处理

	sharedOpts := func(addr string, db int) *redis.Options {
		return &redis.Options{
			Addr:            addr,
			Password:        pass,
			DB:              db,
			DialTimeout:     10 * time.Second,
			ReadTimeout:       30 * time.Second,
			WriteTimeout:      30 * time.Second,
			PoolSize:          10,
			MaxRetries:        3,
			MinRetryBackoff:   100 * time.Millisecond,
			MaxRetryBackoff:   2 * time.Second,
			ConnMaxIdleTime:   5 * time.Minute,
			PoolFIFO:          true,
		}
	}
	switch st.Mode {
	case AppRedisStandalone:
		rdb := redis.NewClient(sharedOpts(st.Addr, st.DB))
		return rdb, func() { _ = rdb.Close() }, nil
	case AppRedisReplication:
		rdb := redis.NewClient(sharedOpts(st.MasterAddr, st.DB))
		return rdb, func() { _ = rdb.Close() }, nil
	case AppRedisSentinel:
		if len(st.SentinelAddrs) == 0 {
			return nil, nil, errors.New("哨兵地址为空")
		}
		rdb := redis.NewFailoverClient(&redis.FailoverOptions{
			MasterName:       st.MasterName,
			SentinelAddrs:    st.SentinelAddrs,
			Password:         pass,
			DB:               st.DB,
			DialTimeout:      10 * time.Second,
			ReadTimeout:      30 * time.Second,
			WriteTimeout:     30 * time.Second,
			PoolSize:         10,
			MaxRetries:       3,
			MinRetryBackoff:  100 * time.Millisecond,
			MaxRetryBackoff:  2 * time.Second,
			ConnMaxIdleTime:  5 * time.Minute,
		})
		return rdb, func() { _ = rdb.Close() }, nil
	case AppRedisCluster:
		if len(st.ClusterAddrs) == 0 {
			return nil, nil, errors.New("cluster 地址为空")
		}
		rdb := redis.NewClusterClient(&redis.ClusterOptions{
			Addrs:           st.ClusterAddrs,
			Password:        pass,
			DialTimeout:     10 * time.Second,
			ReadTimeout:     30 * time.Second,
			WriteTimeout:    30 * time.Second,
			PoolSize:        10,
			MaxRetries:      3,
			MinRetryBackoff: 100 * time.Millisecond,
			MaxRetryBackoff: 2 * time.Second,
			ConnMaxIdleTime: 5 * time.Minute,
		})
		return rdb, func() { _ = rdb.Close() }, nil
	default:
		return nil, nil, errors.New("未知模式")
	}
}

// parseRedisInfoLines 解析 INFO 单行键值（忽略 # 注释行）。
func parseRedisInfoLines(s string) map[string]string {
	m := make(map[string]string)
	for _, line := range strings.Split(s, "\r\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		i := strings.IndexByte(line, ':')
		if i <= 0 {
			continue
		}
		m[line[:i]] = strings.TrimSpace(line[i+1:])
	}
	return m
}

// AppRedisRuntimeSnapshot 供 /runtime API 返回：INFO 分节、DBSIZE、部分 CONFIG。
func AppRedisRuntimeSnapshot(ctx context.Context, rdb redis.Cmdable) (map[string]interface{}, error) {
	t0 := time.Now()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, err
	}
	latencyMs := time.Since(t0).Milliseconds()

	sectionNames := []string{"server", "memory", "stats", "replication", "clients", "cpu", "keyspace"}
	sections := make(map[string]map[string]string)
	for _, name := range sectionNames {
		raw, err := rdb.Info(ctx, name).Result()
		if err != nil {
			sections[name] = map[string]string{"_error": err.Error()}
			continue
		}
		sections[name] = parseRedisInfoLines(raw)
	}

	dbsize, err := rdb.DBSize(ctx).Result()
	if err != nil {
		return nil, err
	}

	cfg := make(map[string]string)
	for _, k := range []string{
		"maxmemory", "maxmemory-policy", "appendonly", "save", "tcp-keepalive", "timeout", "databases", "hz",
	} {
		m, err := rdb.ConfigGet(ctx, k).Result()
		if err != nil {
			continue
		}
		for ck, cv := range m {
			cfg[ck] = cv
		}
	}

	return map[string]interface{}{
		"capturedAt": time.Now().UTC().Format(time.RFC3339),
		"latencyMs":  latencyMs,
		"dbsize":     dbsize,
		"sections":   sections,
		"config":     cfg,
	}, nil
}

func appRedisPublicSummary(st *appRedisStoredConfig, hasPassword bool) map[string]interface{} {
	m := map[string]interface{}{
		"mode":      string(st.Mode),
		"db":        st.DB,
		"hasPassword": hasPassword,
	}
	switch st.Mode {
	case AppRedisStandalone:
		m["addr"] = st.Addr
	case AppRedisSentinel:
		m["sentinelAddrs"] = st.SentinelAddrs
		m["masterName"] = st.MasterName
	case AppRedisReplication:
		m["masterAddr"] = st.MasterAddr
		m["replicaAddr"] = st.ReplicaAddr
	case AppRedisCluster:
		m["clusterAddrs"] = st.ClusterAddrs
	}
	if strings.TrimSpace(st.K8sNamespace) != "" {
		m["k8sNamespace"] = st.K8sNamespace
		m["k8sBaseName"] = st.K8sBaseName
		m["k8sTopology"] = st.K8sTopology
		if st.K8sSvcPort > 0 {
			m["k8sSvcPort"] = st.K8sSvcPort
		}
		if strings.TrimSpace(st.K8sServiceType) != "" {
			m["k8sServiceType"] = st.K8sServiceType
		}
		if strings.TrimSpace(st.K8sEngineLine) != "" {
			m["k8sEngineLine"] = st.K8sEngineLine
		}
		if strings.TrimSpace(st.K8sMaxmemory) != "" {
			m["k8sMaxmemory"] = st.K8sMaxmemory
		}
		if strings.TrimSpace(st.K8sMaxmemoryPolicy) != "" {
			m["k8sMaxmemoryPolicy"] = st.K8sMaxmemoryPolicy
		}
		m["k8sAppendonly"] = st.K8sAppendonly
		if strings.TrimSpace(st.K8sRedisImageResolved) != "" {
			m["k8sRedisImageResolved"] = st.K8sRedisImageResolved
		}
		m["k8sExporterEnabled"] = st.K8sExporterEnabled
		if st.K8sExporterEnabled && strings.TrimSpace(st.K8sExporterImageResolved) != "" {
			m["k8sExporterImageResolved"] = st.K8sExporterImageResolved
		}
		if strings.TrimSpace(st.K8sRedisCPURequest) != "" {
			m["k8sRedisCpuRequest"] = st.K8sRedisCPURequest
		}
		if strings.TrimSpace(st.K8sRedisCPULimit) != "" {
			m["k8sRedisCpuLimit"] = st.K8sRedisCPULimit
		}
		if strings.TrimSpace(st.K8sRedisMemoryRequest) != "" {
			m["k8sRedisMemoryRequest"] = st.K8sRedisMemoryRequest
		}
		if strings.TrimSpace(st.K8sRedisMemoryLimit) != "" {
			m["k8sRedisMemoryLimit"] = st.K8sRedisMemoryLimit
		}
		m["k8sPersistenceEnabled"] = st.K8sPersistenceEnabled
		if strings.TrimSpace(st.K8sStorageSize) != "" {
			m["k8sStorageSize"] = st.K8sStorageSize
		}
		if strings.TrimSpace(st.K8sStorageClass) != "" {
			m["k8sStorageClass"] = st.K8sStorageClass
		}
	}
	return m
}

func appRedisStoredIsPlatformK8s(st *appRedisStoredConfig) bool {
	return st != nil && strings.TrimSpace(st.K8sNamespace) != ""
}

func appRedisPublicSummaryMasked(st *appRedisStoredConfig, hasPassword bool) map[string]interface{} {
	m := map[string]interface{}{
		"mode":        string(st.Mode),
		"db":          st.DB,
		"hasPassword": hasPassword,
	}
	if appRedisStoredIsPlatformK8s(st) {
		m["k8sManaged"] = true
		if strings.TrimSpace(st.K8sTopology) != "" {
			m["k8sTopology"] = st.K8sTopology
		}
		if strings.TrimSpace(st.K8sEngineLine) != "" {
			m["k8sEngineLine"] = st.K8sEngineLine
		}
		if strings.TrimSpace(st.K8sMaxmemory) != "" {
			m["k8sMaxmemory"] = st.K8sMaxmemory
		}
		if strings.TrimSpace(st.K8sMaxmemoryPolicy) != "" {
			m["k8sMaxmemoryPolicy"] = st.K8sMaxmemoryPolicy
		}
		m["k8sAppendonly"] = st.K8sAppendonly
		m["k8sExporterEnabled"] = st.K8sExporterEnabled
		if strings.TrimSpace(st.K8sRedisCPURequest) != "" {
			m["k8sRedisCpuRequest"] = st.K8sRedisCPURequest
		}
		if strings.TrimSpace(st.K8sRedisCPULimit) != "" {
			m["k8sRedisCpuLimit"] = st.K8sRedisCPULimit
		}
		if strings.TrimSpace(st.K8sRedisMemoryRequest) != "" {
			m["k8sRedisMemoryRequest"] = st.K8sRedisMemoryRequest
		}
		if strings.TrimSpace(st.K8sRedisMemoryLimit) != "" {
			m["k8sRedisMemoryLimit"] = st.K8sRedisMemoryLimit
		}
		m["k8sPersistenceEnabled"] = st.K8sPersistenceEnabled
		if strings.TrimSpace(st.K8sStorageSize) != "" {
			m["k8sStorageSize"] = st.K8sStorageSize
		}
		if st.K8sTemplateID > 0 {
			m["k8sTemplateId"] = st.K8sTemplateID
		}
		if strings.TrimSpace(st.K8sTemplateName) != "" {
			m["k8sTemplateName"] = st.K8sTemplateName
		}
	} else {
		m["externalManaged"] = true
	}
	return m
}

func rowToPublicList(_ Config, row appRedisRow, mask bool) (map[string]interface{}, error) {
	var st appRedisStoredConfig
	if err := json.Unmarshal([]byte(row.ConfigJSON), &st); err != nil {
		return nil, err
	}
	hasPassword := strings.TrimSpace(st.PasswordEnc) != ""
	summary := appRedisPublicSummary(&st, hasPassword)
	if mask {
		summary = appRedisPublicSummaryMasked(&st, hasPassword)
	}
	return map[string]interface{}{
		"id":        row.ID,
		"name":      row.Name,
		"mode":      row.Mode,
		"summary":   summary,
		"createdAt": row.CreatedAt,
		"updatedAt": row.UpdatedAt,
		"createdBy": row.CreatedBy,
	}, nil
}

type bigKeyEntry struct {
	Key   string `json:"key"`
	Bytes int64  `json:"bytes"`
}

func appRedisScanBigKeys(ctx context.Context, rdb redis.Cmdable, sampleLimit int) ([]bigKeyEntry, error) {
	if sampleLimit <= 0 {
		sampleLimit = 300
	}
	var cursor uint64
	var candidates []string
	for len(candidates) < sampleLimit {
		keys, next, err := rdb.Scan(ctx, cursor, "*", 80).Result()
		if err != nil {
			return nil, err
		}
		candidates = append(candidates, keys...)
		cursor = next
		if cursor == 0 {
			break
		}
	}
	out := make([]bigKeyEntry, 0, len(candidates))
	for _, k := range candidates {
		n, err := rdb.MemoryUsage(ctx, k, 5).Result()
		if err != nil {
			continue
		}
		out = append(out, bigKeyEntry{Key: k, Bytes: n})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Bytes > out[j].Bytes })
	if len(out) > 80 {
		out = out[:80]
	}
	return out, nil
}

func parseClientListIPs(clientList string) []string {
	seen := map[string]struct{}{}
	var ips []string
	for _, line := range strings.Split(clientList, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// addr=1.2.3.4:port 或 addr=unix:...
		for _, part := range strings.Fields(line) {
			if !strings.HasPrefix(part, "addr=") {
				continue
			}
			addr := strings.TrimPrefix(part, "addr=")
			host, _, err := net.SplitHostPort(addr)
			if err != nil {
				if ip := net.ParseIP(addr); ip != nil {
					host = ip.String()
				} else {
					continue
				}
			}
			if host == "" || ipNetLocal(host) {
				continue
			}
			if _, ok := seen[host]; !ok {
				seen[host] = struct{}{}
				ips = append(ips, host)
			}
		}
	}
	sort.Strings(ips)
	return ips
}

func ipNetLocal(host string) bool {
	if host == "127.0.0.1" || host == "::1" {
		return true
	}
	return false
}

// shellSingleQuote 用于在 shell 单引号内安全嵌入字符串。
func shellSingleQuote(s string) string {
	return `'` + strings.ReplaceAll(s, `'`, `'\''`) + `'`
}

// BuildRedisInstallScript 生成 Docker 安装 Redis 的 shell 片段（供 API 返回）。
func BuildRedisInstallScript(version string, maxmemory string, maxmemoryPolicy string, appendonly bool, port int, password string) string {
	if port <= 0 {
		port = 6379
	}
	if strings.TrimSpace(version) == "" {
		version = "7.2"
	}
	ver := strings.TrimSpace(version)
	pol := strings.TrimSpace(maxmemPolicyOrDefault(maxmemoryPolicy))
	mem := strings.TrimSpace(maxmemory)
	if mem == "" {
		mem = "256mb"
	}
	aof := "no"
	if appendonly {
		aof = "yes"
	}
	pw := strings.TrimSpace(password)
	req := ""
	if pw != "" {
		req = " \\\n  --requirepass " + shellSingleQuote(pw)
	}
	return fmt.Sprintf(`#!/usr/bin/env bash
set -euo pipefail
# 由 kube-bt-sync 应用中心生成 — 请审阅后再执行
# Redis %s · 端口 %d
docker run -d --name redis-appcenter-%s --restart unless-stopped \
  -p %d:6379 \
  redis:%s \
  redis-server \
  --maxmemory %s \
  --maxmemory-policy %s \
  --appendonly %s \
  --tcp-backlog 511 \
  --tcp-keepalive 60%s
echo "已启动容器 redis-appcenter-%s，请按需挂载 -v 持久化数据"
`, ver, port, ver, port, ver, mem, pol, aof, req, ver)
}

func maxmemPolicyOrDefault(p string) string {
	p = strings.TrimSpace(strings.ToLower(p))
	switch p {
	case "noeviction", "allkeys-lru", "volatile-lru", "allkeys-lfu", "volatile-lfu", "allkeys-random", "volatile-random", "volatile-ttl":
		return p
	default:
		return "allkeys-lru"
	}
}

var k8sDNSLabelRe = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`)

// ValidateK8sNamespaceName 校验 Namespace 等 DNS 标签名。
func ValidateK8sNamespaceName(ns string) error {
	ns = strings.TrimSpace(ns)
	if ns == "" {
		return errors.New("命名空间不能为空")
	}
	if len(ns) > 63 {
		return errors.New("命名空间名称长度不能超过 63")
	}
	if !k8sDNSLabelRe.MatchString(ns) {
		return errors.New("命名空间格式无效（须为小写字母、数字与连字符组成的 DNS 标签）")
	}
	return nil
}

func sanitizeRedisImageTag(version string) string {
	v := strings.TrimSpace(version)
	if v == "" {
		return "7.2"
	}
	var b strings.Builder
	for _, r := range v {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '.' || r == '-' {
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "7.2"
	}
	return b.String()
}
