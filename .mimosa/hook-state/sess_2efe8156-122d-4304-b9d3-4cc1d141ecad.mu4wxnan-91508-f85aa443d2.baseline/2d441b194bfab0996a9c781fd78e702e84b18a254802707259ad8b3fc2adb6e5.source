package internal

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func handleSetupStatus(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		initialized := app.Initialized()
		payload := gin.H{
			"initialized": initialized,
			"dataDir":     app.DataDir(),
			"version":     1,
		}
		if !initialized {
			payload["defaults"] = newSetupEnvironmentDefaults(app.Cfg())
		}
		c.JSON(http.StatusOK, payload)
	}
}

// setupSubmitBody 与 RuntimeSettings 同字段，另附明文密码仅用于首次哈希。
type setupSubmitBody struct {
	RuntimeSettings
	DashboardPasswordPlain      string `json:"dashboardPasswordPlain"`
	UseEnvironmentConnections   bool   `json:"useEnvironmentConnections"`
	UseEnvironmentEncryptionKey bool   `json:"useEnvironmentEncryptionKey"`
}

// setupEnvironmentDefaults 仅返回可安全展示的环境配置与敏感字段存在状态。
// 密码、DSN 和加密密钥绝不通过未登录的 setup status 接口返回。
type setupEnvironmentDefaults struct {
	ConnectionsConfigured   bool   `json:"connectionsConfigured"`
	PlatformPublicURL       string `json:"platformPublicUrl,omitempty"`
	MySQLDSNConfigured      bool   `json:"mysqlDsnConfigured"`
	MySQLHost               string `json:"mysqlHost,omitempty"`
	MySQLPort               int    `json:"mysqlPort,omitempty"`
	MySQLDatabase           string `json:"mysqlDatabase,omitempty"`
	MySQLUser               string `json:"mysqlUser,omitempty"`
	MySQLPasswordConfigured bool   `json:"mysqlPasswordConfigured"`
	RedisAddr               string `json:"redisAddr,omitempty"`
	RedisHost               string `json:"redisHost,omitempty"`
	RedisPort               int    `json:"redisPort,omitempty"`
	RedisMode               string `json:"redisMode,omitempty"`
	RedisSentinelMaster     string `json:"redisSentinelMaster,omitempty"`
	RedisPasswordConfigured bool   `json:"redisPasswordConfigured"`
	EncryptionKeyConfigured bool   `json:"encryptionKeyConfigured"`
	DashboardUser           string `json:"dashboardUser,omitempty"`
}

func newSetupEnvironmentDefaults(cfg Config) setupEnvironmentDefaults {
	effective := cfg
	FinalizeConnectionStrings(&effective)
	return setupEnvironmentDefaults{
		ConnectionsConfigured:   strings.TrimSpace(effective.MySQLDSN) != "" && strings.TrimSpace(effective.RedisAddr) != "",
		PlatformPublicURL:       strings.TrimSpace(cfg.PlatformPublicURL),
		MySQLDSNConfigured:      strings.TrimSpace(cfg.MySQLDSN) != "",
		MySQLHost:               strings.TrimSpace(cfg.MySQLHost),
		MySQLPort:               cfg.MySQLPort,
		MySQLDatabase:           strings.TrimSpace(cfg.MySQLDatabase),
		MySQLUser:               strings.TrimSpace(cfg.MySQLUser),
		MySQLPasswordConfigured: cfg.MySQLPassword != "",
		RedisAddr:               strings.TrimSpace(effective.RedisAddr),
		RedisHost:               strings.TrimSpace(cfg.RedisHost),
		RedisPort:               cfg.RedisPort,
		RedisMode:               strings.TrimSpace(cfg.RedisMode),
		RedisSentinelMaster:     strings.TrimSpace(cfg.RedisSentinelMaster),
		RedisPasswordConfigured: cfg.RedisPassword != "",
		EncryptionKeyConfigured: len(strings.TrimSpace(cfg.EncryptionKey)) >= 16,
		DashboardUser:           strings.TrimSpace(cfg.DashboardUser),
	}
}

func applySetupEnvironmentDefaults(body *setupSubmitBody, env Config) error {
	if body == nil {
		return errors.New("配置为空")
	}
	rs := &body.RuntimeSettings
	if body.UseEnvironmentConnections {
		effective := env
		FinalizeConnectionStrings(&effective)
		if strings.TrimSpace(effective.MySQLDSN) == "" || strings.TrimSpace(effective.RedisAddr) == "" {
			return errors.New("运行环境未完整配置 MySQL 与 Redis，无法自动采用")
		}
		rs.MySQLDSN = strings.TrimSpace(env.MySQLDSN)
		rs.MySQLHost = strings.TrimSpace(env.MySQLHost)
		rs.MySQLPort = env.MySQLPort
		rs.MySQLDatabase = strings.TrimSpace(env.MySQLDatabase)
		rs.MySQLUser = strings.TrimSpace(env.MySQLUser)
		rs.MySQLPassword = env.MySQLPassword
		rs.RedisAddr = strings.TrimSpace(effective.RedisAddr)
		rs.RedisHost = strings.TrimSpace(env.RedisHost)
		rs.RedisPort = env.RedisPort
		rs.RedisMode = strings.TrimSpace(env.RedisMode)
		rs.RedisSentinelMaster = strings.TrimSpace(env.RedisSentinelMaster)
		rs.RedisPassword = env.RedisPassword
		rs.RedisDB = env.RedisDB
		rs.RedisKeyPrefix = env.RedisKeyPrefix
	}
	if body.UseEnvironmentEncryptionKey {
		key := strings.TrimSpace(env.EncryptionKey)
		if len(key) < 16 {
			return errors.New("运行环境中的 KUBEBT_ENCRYPTION_KEY 长度不足 16 位")
		}
		rs.EncryptionKey = key
	}
	return nil
}

func handleSetupSave(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		if app.Initialized() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "已完成初始化，请勿重复提交；如需改配置请编辑数据目录下 runtime-config.json 后重启进程"})
			return
		}
		var body setupSubmitBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 无效: " + err.Error()})
			return
		}
		env := LoadConfig()
		if err := applySetupEnvironmentDefaults(&body, env); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		rs := &body.RuntimeSettings
		if err := validateSetupPayload(rs, body.DashboardPasswordPlain); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := validateBaotaSSLMaterialContent(rs.BaotaSSLPemContent, rs.BaotaSSLKeyContent); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		incomingBaotaSSLPemContent := strings.TrimSpace(rs.BaotaSSLPemContent)
		incomingBaotaSSLKeyContent := strings.TrimSpace(rs.BaotaSSLKeyContent)
		rs.Version = 1
		rs.Initialized = true

		hash, err := bcrypt.GenerateFromPassword([]byte(body.DashboardPasswordPlain), bcrypt.DefaultCost)
		if err != nil {
			RespondAPIError500(c, "密码哈希失败")
			return
		}
		rs.DashboardPassword = string(hash)

		if strings.TrimSpace(rs.DashboardSessionSecret) == "" {
			b := make([]byte, 32)
			if _, err := rand.Read(b); err != nil {
				RespondAPIError500(c, "生成会话密钥失败")
				return
			}
			rs.DashboardSessionSecret = hex.EncodeToString(b)
		}

		path := filepath.Join(app.DataDir(), runtimeConfigFileName)
		tmpCfg := MergeRuntimeConfig(env, rs, app.DataDir())
		tmpCfg = PrepareDashboardAuth(tmpCfg)
		if err := tmpCfg.Validate(); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var mysqlWrite *sql.DB
		if dsn := strings.TrimSpace(tmpCfg.MySQLDSN); dsn != "" {
			d, err := OpenMySQLPoolForRuntimeWrite(dsn)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "MySQL 连接或表结构初始化失败: " + err.Error()})
				return
			}
			if d != nil {
				defer d.Close()
				mysqlWrite = d
			}
		}
		// setup 时若 redisAddr 包含多地址（集群/哨兵），仅测试第一个节点的连通性
		testCfg := tmpCfg
		testAddr := strings.TrimSpace(tmpCfg.RedisAddr)
		if idx := strings.Index(testAddr, ","); idx > 0 {
			testAddr = strings.TrimSpace(testAddr[:idx])
		}
		testCfg.RedisAddr = testAddr
		if _, err := dialRedisLight(testCfg); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Redis 连接失败，请检查地址、密码与网络: " + err.Error()})
			return
		}
		rs.BaotaSSLPemContent = ""
		rs.BaotaSSLKeyContent = ""
		if err := SaveRuntimeSettingsUnified(path, mysqlWrite, rs); err != nil {
			RespondAPIError500(c, "写入配置失败: "+err.Error())
			return
		}
		if incomingBaotaSSLPemContent != "" || incomingBaotaSSLKeyContent != "" {
			if err := saveStoredBaotaSSLMaterial(app, tmpCfg, incomingBaotaSSLPemContent, incomingBaotaSSLKeyContent); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "保存宝塔 HTTPS 证书失败: " + err.Error()})
				return
			}
		}
		if err := app.Reload(); err != nil {
			RespondAPIError500(c, "重载配置失败: "+err.Error())
			return
		}
		InvalidateRuntimeStatusCache(context.Background(), app)
		InvalidateVCenterPrometheusCache(context.Background(), app)
		c.JSON(http.StatusOK, gin.H{"ok": true, "message": "初始化完成"})
	}
}

func validateSetupPayload(rs *RuntimeSettings, plainPwd string) error {
	if rs == nil {
		return errors.New("配置为空")
	}
	if strings.TrimSpace(rs.PlatformPublicURL) == "" {
		return errors.New("platformPublicUrl 不能为空（平台对外访问地址）")
	}
	var tmp Config
	tmp.MySQLDSN = strings.TrimSpace(rs.MySQLDSN)
	tmp.MySQLHost = strings.TrimSpace(rs.MySQLHost)
	tmp.MySQLPort = rs.MySQLPort
	tmp.MySQLDatabase = strings.TrimSpace(rs.MySQLDatabase)
	tmp.MySQLUser = strings.TrimSpace(rs.MySQLUser)
	tmp.MySQLPassword = rs.MySQLPassword
	tmp.RedisAddr = strings.TrimSpace(rs.RedisAddr)
	tmp.RedisHost = strings.TrimSpace(rs.RedisHost)
	tmp.RedisPort = rs.RedisPort
	if tmp.RedisHost != "" && tmp.RedisPort <= 0 {
		tmp.RedisPort = 6379
	}
	if tmp.MySQLHost != "" && tmp.MySQLPort <= 0 {
		tmp.MySQLPort = 3306
	}
	FinalizeConnectionStrings(&tmp)
	if strings.TrimSpace(tmp.MySQLDSN) == "" {
		return errors.New("MySQL 未配置：请填写库名、用户、密码，或展开高级选项填写 host 与端口")
	}
	if strings.TrimSpace(tmp.RedisAddr) == "" {
		return errors.New("Redis 未配置：请填写地址与端口")
	}
	if len(strings.TrimSpace(rs.EncryptionKey)) < 16 {
		return errors.New("encryptionKey 长度至少 16（用于加密敏感数据）")
	}
	if rs.SyncIntervalSec < 1 {
		rs.SyncIntervalSec = 30
	}
	if strings.TrimSpace(rs.DashboardUser) == "" {
		return errors.New("dashboardUser 不能为空")
	}
	if len(plainPwd) < 8 {
		return errors.New("dashboardPasswordPlain 长度至少 8 位")
	}
	if rs.IngressBaotaSyncEnabled {
		ok := strings.TrimSpace(rs.BaotaURL) != "" && strings.TrimSpace(rs.BaotaAPIKey) != ""
		if len(rs.BaotaTargets) > 0 {
			ok = false
			for _, t := range rs.BaotaTargets {
				if strings.TrimSpace(t.URL) != "" && strings.TrimSpace(t.ApiKey) != "" {
					ok = true
					break
				}
			}
		}
		if !ok {
			return errors.New("开启 ingressBaotaSyncEnabled 时需填写 baotaUrl 与 baotaApiKey，或在 baotaTargets 中至少配置一条含 url 与 apiKey 的实例")
		}
	}
	if err := validateBaotaSSLMaterialContent(rs.BaotaSSLPemContent, rs.BaotaSSLKeyContent); err != nil {
		return err
	}
	if err := validateBaotaSSLMaterialPaths(rs.BaotaSSLPemPath, rs.BaotaSSLKeyPath); err != nil {
		return err
	}
	if rs.K8s != nil {
		mode := strings.ToLower(strings.TrimSpace(rs.K8s.Mode))
		if mode == "" {
			// 未选 K8s 时视为不连接集群
		} else if mode == "kubeconfig" {
			if strings.TrimSpace(rs.K8s.KubeconfigYAML) == "" {
				return errors.New("k8s.mode=kubeconfig 时 kubeconfigYaml 不能为空")
			}
		} else if mode != "none" && mode != "incluster" && mode != "disabled" {
			return errors.New("k8s.mode 须为 none、incluster 或 kubeconfig")
		}
	}
	be := strings.ToLower(strings.TrimSpace(rs.SSHSettingsBackend))
	if be == "file" || be == "redis" || be == "mysql" {
		if strings.TrimSpace(rs.EncryptionKey) == "" {
			return errors.New("启用 SSH 持久化时 encryptionKey 不能为空")
		}
	}
	return nil
}
