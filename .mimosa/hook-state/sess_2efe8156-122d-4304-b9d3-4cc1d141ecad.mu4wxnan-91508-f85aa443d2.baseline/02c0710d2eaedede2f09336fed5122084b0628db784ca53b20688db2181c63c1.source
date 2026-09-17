package internal

import (
	"context"
	"database/sql"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// ServerApp 进程内配置与依赖（支持 Reload 后热更新）。
type ServerApp struct {
	mu sync.RWMutex

	dataDir string

	cfg             Config
	k8s             *kubernetes.Clientset
	k8sREST         *rest.Config
	sshStore        SSHSettingsStore
	vc              *vCenterClient
	redis           *RedisLight
	redisDialErr    string // 已配置 Redis 地址但拨号失败时的原因（供 /api/config 展示）
	mysqlDB         *sql.DB
	mysqlConnectErr string // 最近一次 Reload 时 DSN 非空但 open 失败的原因（供 /api/auth/status 展示）
	platformKV      PlatformKV
	initialized     bool
	runtime         *RuntimeSettings
}

// DataDirFromEnv 仅数据目录可走环境变量（K8s 挂载 PVC 时常用 KUBEBT_DATA_DIR=/data）。
func DataDirFromEnv() string {
	d := strings.TrimSpace(os.Getenv("KUBEBT_DATA_DIR"))
	if d == "" {
		return "./data"
	}
	return d
}

// NewServerApp 从 dataDir/runtime-config.json 合并配置并初始化 K8s / vCenter / SSH 存储。
func NewServerApp(dataDir string) (*ServerApp, error) {
	if dataDir == "" {
		dataDir = "./data"
	}
	abs, err := filepath.Abs(dataDir)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, 0700); err != nil {
		return nil, err
	}
	s := &ServerApp{dataDir: abs}
	if err := s.Reload(); err != nil {
		return nil, err
	}
	return s, nil
}

// wirePlatformKVRedisDualWrite：RuntimeDualWriteRedis 下本地快照为空时从 Redis 恢复，再镜像当前快照到 Redis。
func wirePlatformKVRedisDualWrite(ctx context.Context, kv PlatformKV, redis *RedisLight, cfg Config, persistKind string) {
	if redis == nil || !cfg.RuntimeDualWriteRedis {
		return
	}
	if len(kv.Snapshot()) == 0 {
		if m, err := LoadPlatformKVFromRedis(ctx, redis, cfg); err != nil {
			log.Printf("Redis 读取 platform_kv 备份: %v", err)
		} else if m != nil && len(m) > 0 {
			log.Printf("持久化: 从 Redis 恢复 platform_kv 到 %s", persistKind)
			for k, v := range m {
				if err := kv.Set(k, v); err != nil {
					log.Printf("警告: 恢复 platform_kv[%s] 失败: %v", k, err)
				}
			}
		}
	}
	if err := MirrorPlatformKVToRedis(ctx, redis, cfg, kv.Snapshot()); err != nil {
		log.Printf("警告: platform_kv 镜像到 Redis 失败: %v", err)
	}
}

// Reload 重新读盘并替换内存态（POST /api/setup 成功后调用）。
func (s *ServerApp) Reload() error {
	path := filepath.Join(s.dataDir, runtimeConfigFileName)
	rs, err := LoadRuntimeSettings(path)
	if err != nil {
		return err
	}
	env := LoadConfig()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	preMerge := MergeRuntimeConfig(env, rs, s.dataDir)
	if (rs == nil || !rs.Initialized) && preMerge.RuntimeDualWriteRedis && strings.TrimSpace(preMerge.RedisAddr) != "" {
		if rdb, err := dialRedisLightWithRetry(preMerge); err == nil && rdb != nil {
			if rs2, err := LoadRuntimeSettingsFromRedis(ctx, rdb, preMerge); err != nil {
				log.Printf("Redis 读取 runtime-config 备份: %v", err)
			} else if rs2 != nil && rs2.Initialized {
				log.Printf("持久化: 从 Redis 恢复 runtime-config 到本地文件")
				rs = rs2
				if err := SaveRuntimeSettingsUnified(path, nil, rs); err != nil {
					log.Printf("警告: 将 Redis 配置写回文件失败: %v", err)
				}
			}
			_ = rdb.Close()
		}
	}

	cfgPre := MergeRuntimeConfig(env, rs, s.dataDir)
	var mysqlDB *sql.DB
	mysqlConnectErr := ""
	if dsn := strings.TrimSpace(cfgPre.MySQLDSN); dsn != "" {
		db, err := openMySQLPoolWithRetry(dsn)
		if err != nil {
			log.Printf("MySQL: %v", err)
			mysqlConnectErr = truncateErrMessage(err.Error(), 400)
			s.mu.RLock()
			oldCfg, oldDB := s.cfg, s.mysqlDB
			s.mu.RUnlock()
			if oldDB != nil && strings.TrimSpace(oldCfg.MySQLDSN) == dsn {
				mysqlDB = oldDB
				log.Printf("MySQL: 新连接失败，继续使用当前健康连接")
			}
		} else {
			mysqlDB = db
			// ensure 逐张建表，单表失败不 return；migrate 补列/补索引后再补建仍缺失的表，最后写 app_schema_version。
			if err := mysqlEnsureSchema(db); err != nil {
				log.Printf("MySQL 表结构 (ensure): %v", err)
			}
			if err := mysqlMigrateSchema(db); err != nil {
				log.Printf("MySQL 结构迁移失败: %v", err)
			}
			if err := migratePlatformKVFromFileIfMySQLEmpty(db, s.dataDir); err != nil {
				log.Printf("MySQL 导入 platform_kv: %v", err)
			}
			if err := migrateRuntimeFromFileIfMySQLEmpty(db, path); err != nil {
				log.Printf("MySQL 导入 runtime: %v", err)
			}
			if rs2, err := loadRuntimeFromMySQL(db); err != nil {
				log.Printf("MySQL 读取 runtime: %v", err)
			} else if rs2 != nil && rs2.Initialized {
				rs = rs2
				if err := SaveRuntimeSettings(path, rs); err != nil {
					log.Printf("警告: MySQL runtime 同步到本地文件失败: %v", err)
				}
			}
		}
	}

	cfg := MergeRuntimeConfig(env, rs, s.dataDir)
	cfg = PrepareDashboardAuth(cfg)

	k8s, k8sREST, err := InitK8sForApp(rs)
	if err != nil {
		log.Printf("K8s 初始化: %v", err)
		k8s, k8sREST = nil, nil
	}
	if k8s == nil && rs != nil && rs.Initialized && K8sRuntimeSkipped(rs) {
		if cs, cfg2, err2 := TryK8sFromEnv(); err2 == nil {
			k8s, k8sREST = cs, cfg2
			log.Println("K8s: 已使用进程环境连接（KUBECONFIG / in-cluster），runtime 未配置集群")
		}
	}

	sshStore, errSSH := OpenSSHSettingsStore(cfg)
	if errSSH != nil {
		log.Printf("警告: SSH 凭据存储初始化失败: %v", errSSH)
		sshStore = nil
	}

	vc := newVCenterClient(cfg)

	var redis *RedisLight
	redisDialErr := ""
	if rdb, err := dialRedisLightWithRetry(cfg); err != nil {
		log.Printf("Redis 连接: %v", err)
		redisDialErr = truncateErrMessage(err.Error(), 400)
		s.mu.RLock()
		oldCfg, oldRedis := s.cfg, s.redis
		s.mu.RUnlock()
		if oldRedis != nil && strings.TrimSpace(oldCfg.RedisAddr) == strings.TrimSpace(cfg.RedisAddr) {
			redis = oldRedis
			log.Printf("Redis: 新连接失败，继续使用当前健康连接")
		}
	} else if rdb != nil {
		redis = rdb
	}

	var platformKV PlatformKV
	if mysqlDB != nil {
		if kv, err := newPlatformKVMySQL(mysqlDB); err != nil {
			log.Printf("MySQL platform_kv: %v", err)
		} else {
			platformKV = kv
			wirePlatformKVRedisDualWrite(ctx, kv, redis, cfg, "MySQL")
		}
	}
	if platformKV == nil {
		if kv, err := newPlatformKVFile(s.dataDir); err != nil {
			log.Printf("平台 KV 文件: %v", err)
		} else {
			platformKV = kv
			wirePlatformKVRedisDualWrite(ctx, kv, redis, cfg, "本地文件")
		}
	}

	if platformKV != nil && redis != nil {
		platformKV = wrapPlatformKVRedisHot(platformKV, redis, cfg)
	}

	if redis != nil && cfg.RuntimeDualWriteRedis && rs != nil && rs.Initialized {
		if err := MirrorRuntimeSettingsToRedis(ctx, redis, cfg, rs); err != nil {
			log.Printf("警告: runtime-config 镜像到 Redis 失败: %v", err)
		}
	}

	// 网络连接、迁移和存储初始化全部在锁外完成；这里只做一次短暂原子切换。
	s.mu.Lock()
	oldMySQL, oldRedis := s.mysqlDB, s.redis
	s.cfg = cfg
	s.k8s = k8s
	s.k8sREST = k8sREST
	s.sshStore = sshStore
	s.vc = vc
	s.redis = redis
	s.redisDialErr = redisDialErr
	s.mysqlDB = mysqlDB
	s.mysqlConnectErr = mysqlConnectErr
	s.platformKV = platformKV
	s.runtime = rs
	s.initialized = rs != nil && rs.Initialized
	s.mu.Unlock()

	// 给已经取得旧指针的请求留出收尾时间，避免 Reload 瞬间打断在途 SQL/Redis 操作。
	if oldMySQL != nil && oldMySQL != mysqlDB {
		go func(db *sql.DB) {
			time.Sleep(30 * time.Second)
			_ = db.Close()
		}(oldMySQL)
	}
	if oldRedis != nil && oldRedis != redis {
		go func(r *RedisLight) {
			time.Sleep(30 * time.Second)
			_ = r.Close()
		}(oldRedis)
	}
	return nil
}

func (s *ServerApp) Cfg() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg
}

func (s *ServerApp) K8s() *kubernetes.Clientset {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.k8s
}

func (s *ServerApp) K8sREST() *rest.Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.k8sREST
}

func (s *ServerApp) SSHStore() SSHSettingsStore {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.sshStore
}

func (s *ServerApp) VCenter() *vCenterClient {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.vc
}

func (s *ServerApp) Initialized() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.initialized
}

func (s *ServerApp) DataDir() string {
	return s.dataDir
}

func (s *ServerApp) Runtime() *RuntimeSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.runtime
}

func (s *ServerApp) Redis() *RedisLight {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.redis
}

// RedisDialError 已配置 Redis 地址但当前进程未连上时返回最近一次拨号错误摘要；否则为空。
func (s *ServerApp) RedisDialError() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.redisDialErr
}

// MySQLDB 在配置了 MYSQL_DSN / runtime 中 mysqlDsn 且连接成功时非 nil，用于与 SaveRuntimeSettingsUnified 双写。
func (s *ServerApp) MySQLDB() *sql.DB {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.mysqlDB
}

// MySQLConnectError 最近一次 Reload 时 DSN 非空但连接失败的原因摘要（供前端区分「未配置」与「连不上」）。
func (s *ServerApp) MySQLConnectError() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.mysqlConnectErr
}

func (s *ServerApp) PlatformKV() PlatformKV {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.platformKV
}

func truncateErrMessage(s string, max int) string {
	if max <= 0 || len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
