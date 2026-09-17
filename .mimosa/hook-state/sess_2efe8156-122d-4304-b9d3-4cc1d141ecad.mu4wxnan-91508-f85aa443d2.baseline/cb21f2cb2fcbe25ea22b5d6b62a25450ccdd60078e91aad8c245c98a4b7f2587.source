package internal

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

var errKafkaNoBootstrap = errors.New("实例未配置 bootstrapBrokers")

func registerKafkaAppCenterRoutes(api *gin.RouterGroup, app *ServerApp) {
	g := api.Group("/app-center/kafka")
	g.GET("/status", func(c *gin.Context) { handleKafkaStatus(c, app) })
	g.GET("/instances", func(c *gin.Context) { handleKafkaInstanceList(c, app) })
	g.POST("/k8s-deploy", func(c *gin.Context) { handleKafkaK8sDeploy(c, app) })
	g.GET("/templates", func(c *gin.Context) { handleKafkaTemplateList(c, app) })
	g.POST("/templates", func(c *gin.Context) { handleKafkaTemplateCreate(c, app) })
	g.GET("/templates/:id", func(c *gin.Context) { handleKafkaTemplateGet(c, app) })
	g.PUT("/templates/:id", func(c *gin.Context) { handleKafkaTemplateUpdate(c, app) })
	g.DELETE("/templates/:id", func(c *gin.Context) { handleKafkaTemplateDelete(c, app) })

	g.DELETE("/instances/:id", func(c *gin.Context) { handleKafkaInstanceDelete(c, app) })
	g.GET("/instances/:id/exposure", func(c *gin.Context) { handleKafkaInstanceExposureGet(c, app) })
	g.PUT("/instances/:id/exposure", func(c *gin.Context) { handleKafkaInstanceExposurePut(c, app) })
	g.GET("/instances/:id/rollout", func(c *gin.Context) { handleKafkaInstanceRollout(c, app) })
	g.GET("/instances/:id/cluster", func(c *gin.Context) { handleKafkaClusterMetadata(c, app) })
	g.GET("/instances/:id/consumer-group-lag", func(c *gin.Context) { handleKafkaConsumerGroupLag(c, app) })
	g.GET("/instances/:id/topics/:topic/configs", func(c *gin.Context) { handleKafkaTopicConfigsGet(c, app) })
	g.POST("/instances/:id/topics/:topic/configs", func(c *gin.Context) { handleKafkaTopicConfigsPost(c, app) })
	g.POST("/instances/:id/topics/:topic/messages", func(c *gin.Context) { handleKafkaTopicProduce(c, app) })
	g.GET("/instances/:id/topics/:topic/messages", func(c *gin.Context) { handleKafkaTopicMessagesGet(c, app) })
	g.GET("/instances/:id/consumer-groups", func(c *gin.Context) { handleKafkaConsumerGroups(c, app) })
	g.GET("/instances/:id/topics", func(c *gin.Context) { handleKafkaTopicsList(c, app) })
	g.POST("/instances/:id/topics", func(c *gin.Context) { handleKafkaTopicCreate(c, app) })
	g.DELETE("/instances/:id/topics/*topic", func(c *gin.Context) { handleKafkaTopicDelete(c, app) })
	g.GET("/instances/:id/acls", func(c *gin.Context) { handleKafkaACLList(c, app) })
	g.POST("/instances/:id/acls", func(c *gin.Context) { handleKafkaACLCreate(c, app) })
	g.POST("/instances/:id/acls/delete", func(c *gin.Context) { handleKafkaACLDelete(c, app) })
	g.POST("/instances/:id/scram-users", func(c *gin.Context) { handleKafkaScramUserCreate(c, app) })
	g.DELETE("/instances/:id/scram-users/*user", func(c *gin.Context) { handleKafkaScramUserDelete(c, app) })

	// 限速（带宽）管理
	g.GET("/instances/:id/quotas", func(c *gin.Context) { handleKafkaClientQuotaList(c, app) })
	g.PUT("/instances/:id/quotas", func(c *gin.Context) { handleKafkaClientQuotaSet(c, app) })
	g.GET("/instances/:id/topics/:topic/throttle", func(c *gin.Context) { handleKafkaTopicThrottleGet(c, app) })
	g.PUT("/instances/:id/topics/:topic/throttle", func(c *gin.Context) { handleKafkaTopicThrottlePut(c, app) })

	// 压测
	g.GET("/instances/:id/perf-tests", func(c *gin.Context) { handleKafkaPerfTestList(c, app) })
	g.POST("/instances/:id/perf-test/validate", func(c *gin.Context) { handleKafkaPerfTestValidate(c, app) })
	g.POST("/instances/:id/perf-test", func(c *gin.Context) { handleKafkaPerfTestStart(c, app) })
	g.GET("/instances/:id/perf-test/:name", func(c *gin.Context) { handleKafkaPerfTestReport(c, app) })
	g.DELETE("/instances/:id/perf-test/:name", func(c *gin.Context) { handleKafkaPerfTestDelete(c, app) })
}

func appKafkaRequireWrite(c *gin.Context) bool {
	if getDashboardRoleFromGin(c) == DashboardRoleAdmin {
		return true
	}
	eff := getEffectiveDashboardPermissionsFromGin(c)
	if eff.LegacyViewer {
		return false
	}
	if eff.AppCenter == ModuleAccessNone || eff.AppCenter == ModuleAccessRO {
		RespondAPIPermissionDenied(c)
		return false
	}
	cs := eff.AppCenterCloudVm
	if cs == "" {
		cs = eff.AppCenterRedis
	}
	if cs == AppCenterRedisScopeReadonly {
		RespondAPIPermissionDenied(c)
		return false
	}
	if cs == AppCenterRedisScopeManagedOnly {
		RespondAPIPermissionDenied(c)
		return false
	}
	return true
}

type appKafkaInstanceStored struct {
	Kind             string `json:"kind"`
	Namespace        string `json:"namespace"`
	BaseName         string `json:"baseName"`
	BootstrapBrokers string `json:"bootstrapBrokers"`
	SaslUsername     string `json:"saslUsername"`
	SaslPassword     string `json:"saslPassword,omitempty"`
	// SaslMechanism 与部署时 KAFKA_CFG_SASL_ENABLED_MECHANISMS 一致：PLAIN、SCRAM-SHA-256、SCRAM-SHA-512
	SaslMechanism string `json:"saslMechanism,omitempty"`
	ZkReplicas    int    `json:"zkReplicas,omitempty"`
	KafkaReplicas int    `json:"kafkaReplicas,omitempty"`
	TemplateID    int64  `json:"templateId,omitempty"`
	TemplateName  string `json:"templateName,omitempty"`
	// ExternalExposure: "" | "internal" | "nodeport"（nodeport 时每副本独立 NodePort → 容器 9094 EXTERNAL 监听）
	ExternalExposure    string `json:"externalExposure,omitempty"`
	ExternalAdvertiseHost string `json:"externalAdvertiseHost,omitempty"`
	ExternalNodePorts     []int  `json:"externalNodePorts,omitempty"`
}

func (s *appKafkaInstanceStored) effectiveSaslMechanism() string {
	m := strings.ToUpper(strings.TrimSpace(s.SaslMechanism))
	if m == "" {
		return "SCRAM-SHA-512"
	}
	return m
}

func parseKafkaInstanceStored(raw string) (*appKafkaInstanceStored, error) {
	var s appKafkaInstanceStored
	if err := json.Unmarshal([]byte(raw), &s); err != nil {
		return nil, err
	}
	if strings.TrimSpace(s.BootstrapBrokers) == "" {
		return nil, errKafkaNoBootstrap
	}
	return &s, nil
}

// kafkaInstanceK8sNamesFromConfigJSON 仅从 config_json 取命名空间与 baseName（删除实例时即使 bootstrap 缺失也可尝试清理 K8s）。
func kafkaInstanceK8sNamesFromConfigJSON(raw string) (namespace, baseName string) {
	var s struct {
		Namespace string `json:"namespace"`
		BaseName  string `json:"baseName"`
	}
	_ = json.Unmarshal([]byte(raw), &s)
	return strings.TrimSpace(s.Namespace), strings.TrimSpace(s.BaseName)
}

func randomKafkaPassword() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func kafkaParseInstanceID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的实例 id"})
		return 0, false
	}
	return id, true
}

func kafkaLoadInstanceClient(c *gin.Context, app *ServerApp) (*appKafkaInstanceStored, *appKafkaFranzClientClose) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL 未连接"})
		return nil, nil
	}
	id, ok := kafkaParseInstanceID(c)
	if !ok {
		return nil, nil
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	row, err := appKafkaGetByID(ctx, db, id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return nil, nil
		}
		RespondAPIError500(c, err.Error())
		return nil, nil
	}
	st, err := parseKafkaInstanceStored(row.ConfigJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "实例配置无效: " + err.Error()})
		return nil, nil
	}
	k8s := app.K8s()
	if k8s == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Kubernetes 未连接，无法校验部署状态"})
		return nil, nil
	}
	ctxR, cancelR := context.WithTimeout(c.Request.Context(), 18*time.Second)
	defer cancelR()
	rollOk, rollDetail, rerr := AppKafkaRolloutReady(ctxR, k8s, st.Namespace, st.BaseName)
	if rerr != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": rerr.Error()})
		return nil, nil
	}
	if !rollOk {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":   "Kafka/ZooKeeper 尚未就绪，请稍后在「进度与监控」中查看",
			"code":    "kafka_not_ready",
			"rollout": rollDetail,
		})
		return nil, nil
	}
	brokers := strings.Split(st.BootstrapBrokers, ",")
	ctx2, cancel2 := context.WithTimeout(c.Request.Context(), 45*time.Second)
	defer cancel2()
	cl, err := appKafkaFranzClient(ctx2, brokers, st.SaslUsername, st.SaslPassword, st.effectiveSaslMechanism())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return nil, nil
	}
	return st, &appKafkaFranzClientClose{Client: cl}
}

type appKafkaFranzClientClose struct {
	Client *kgo.Client
}

func (x *appKafkaFranzClientClose) Close() {
	if x != nil && x.Client != nil {
		x.Client.Close()
	}
}

func handleKafkaStatus(c *gin.Context, app *ServerApp) {
	out := gin.H{"mysqlReachable": app.MySQLDB() != nil}
	if app.MySQLDB() == nil && app.MySQLConnectError() != "" {
		out["mysqlConnectError"] = app.MySQLConnectError()
	}
	c.JSON(http.StatusOK, out)
}

func handleKafkaInstanceList(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusOK, gin.H{"instances": []interface{}{}, "mysqlRequired": true})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 25*time.Second)
	defer cancel()
	rows, err := appKafkaListFromMySQL(ctx, db)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	list := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		var meta map[string]interface{}
		_ = json.Unmarshal([]byte(r.ConfigJSON), &meta)
		list = append(list, gin.H{
			"id": r.ID, "name": r.Name, "config": meta,
			"createdAt": r.CreatedAt, "updatedAt": r.UpdatedAt, "createdBy": r.CreatedBy,
		})
	}
	c.JSON(http.StatusOK, gin.H{"instances": list, "mysqlRequired": false})
}

func handleKafkaTemplateList(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusOK, gin.H{"templates": []interface{}{}, "mysqlRequired": true})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	rows, err := appKafkaTemplateListFromMySQL(ctx, db)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	out := make([]map[string]interface{}, 0, len(rows))
	for _, r := range rows {
		pub, err := appKafkaTemplateRowToPublic(r)
		if err != nil {
			continue
		}
		out = append(out, pub)
	}
	c.JSON(http.StatusOK, gin.H{"templates": out, "mysqlRequired": false})
}

func handleKafkaTemplateGet(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL 未连接"})
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	row, err := appKafkaTemplateGetByID(ctx, db, id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "模版不存在"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	pub, err := appKafkaTemplateRowToPublic(*row)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, pub)
}

func handleKafkaTemplateCreate(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		RespondAPIPermissionDenied(c)
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL 未连接"})
		return
	}
	var body struct {
		Name        string                 `json:"name"`
		Description string                 `json:"description,omitempty"`
		Config      AppKafkaTemplateConfig `json:"config"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	appKafkaTemplateDefaults(&body.Config)
	if err := validateAppKafkaTemplateConfig(&body.Config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	b, _ := json.Marshal(body.Config)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	id, err := appKafkaTemplateInsert(ctx, db, strings.TrimSpace(body.Name), body.Description, string(b), dashboardUsernameFromGin(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "创建 Kafka 部署模版 "+body.Name)
	c.JSON(http.StatusOK, gin.H{"id": id})
}

func handleKafkaTemplateUpdate(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		RespondAPIPermissionDenied(c)
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL 未连接"})
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	var body struct {
		Name        string                 `json:"name"`
		Description string                 `json:"description,omitempty"`
		Config      AppKafkaTemplateConfig `json:"config"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	appKafkaTemplateDefaults(&body.Config)
	if err := validateAppKafkaTemplateConfig(&body.Config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	b, _ := json.Marshal(body.Config)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	if err := appKafkaTemplateUpdate(ctx, db, id, strings.TrimSpace(body.Name), body.Description, string(b)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "更新 Kafka 模版 id="+strconv.FormatInt(id, 10))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleKafkaTemplateDelete(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		RespondAPIPermissionDenied(c)
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL 未连接"})
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	if err := appKafkaTemplateDelete(ctx, db, id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "删除 Kafka 模版 id="+strconv.FormatInt(id, 10))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type kafkaK8sDeployBody struct {
	Namespace          string   `json:"namespace"`
	BaseName           string   `json:"baseName"`
	TemplateID         int64    `json:"templateId"`
	ImagePullSecret    string   `json:"imagePullSecret,omitempty"`
	StorageClassName   string   `json:"storageClassName,omitempty"`
	ZkReplicas         int32    `json:"zkReplicas,omitempty"`
	KafkaReplicas      int32    `json:"kafkaReplicas,omitempty"`
	ZkStorageSize      string   `json:"zkStorageSize,omitempty"`
	KafkaStorageSize   string   `json:"kafkaStorageSize,omitempty"`
	SaslUsername       string   `json:"saslUsername,omitempty"`
	SaslPassword       string   `json:"saslPassword,omitempty"`
	SaslMechanism      string   `json:"saslMechanism,omitempty"`
	ExtraKafkaCfgLines []string `json:"extraKafkaCfgLines,omitempty"`
}

func normalizeKafkaDeploySaslMechanism(s string) string {
	m := strings.ToUpper(strings.TrimSpace(s))
	if m == "" {
		return "SCRAM-SHA-512"
	}
	return m
}

func validateKafkaSaslMechanism(m string) error {
	switch strings.ToUpper(strings.TrimSpace(m)) {
	case "PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512":
		return nil
	default:
		return fmt.Errorf("saslMechanism 无效，可选: SCRAM-SHA-512、SCRAM-SHA-256、PLAIN")
	}
}

func handleKafkaK8sDeploy(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		return
	}
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	var body kafkaK8sDeployBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ns := strings.TrimSpace(body.Namespace)
	base := strings.TrimSpace(body.BaseName)
	if err := ValidateK8sNamespaceName(ns); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := ValidateK8sDeploymentName(base); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未连接 MySQL，无法按模版部署"})
		return
	}
	if body.TemplateID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择 Kafka 部署模版"})
		return
	}
	saslMech := normalizeKafkaDeploySaslMechanism(body.SaslMechanism)
	if err := validateKafkaSaslMechanism(saslMech); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctxTpl, cancelTpl := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancelTpl()
	tplRow, err := appKafkaTemplateGetByID(ctxTpl, db, body.TemplateID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusBadRequest, gin.H{"error": "模版不存在"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	tplCfg, err := parseAppKafkaTemplateConfig(tplRow.ConfigJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "模版配置无效: " + err.Error()})
		return
	}
	appKafkaTemplateDefaults(tplCfg)
	if err := validateAppKafkaTemplateConfig(tplCfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	zr := body.ZkReplicas
	kr := body.KafkaReplicas
	if zr <= 0 {
		zr = int32(tplCfg.ZkReplicas)
	}
	if kr <= 0 {
		kr = int32(tplCfg.KafkaReplicas)
	}
	saslUser := firstNonEmpty(strings.TrimSpace(body.SaslUsername), tplCfg.DefaultSaslUsername)
	saslPass := strings.TrimSpace(body.SaslPassword)
	if saslPass == "" {
		saslPass = strings.TrimSpace(tplCfg.DefaultSaslPassword)
	}
	if saslPass == "" {
		saslPass = randomKafkaPassword()
	}
	pull := firstNonEmpty(strings.TrimSpace(body.ImagePullSecret), tplCfg.ImagePullSecret)
	extraLines := tplCfg.ExtraKafkaCfgLines
	if len(body.ExtraKafkaCfgLines) > 0 {
		extraLines = body.ExtraKafkaCfgLines
	}
	extraEnv := kafkaExtraEnvFromTemplateLines(extraLines)

	opts := KafkaK8sDeployOpts{
		Namespace:        ns,
		BaseName:         base,
		ZookeeperImage:   tplCfg.ZookeeperImage,
		KafkaImage:       tplCfg.KafkaImage,
		BusyboxImage:     tplCfg.BusyboxImage,
		ImagePullSecret:  pull,
		ZkReplicas:       zr,
		KafkaReplicas:    kr,
		ZkStorageSize:    firstNonEmpty(strings.TrimSpace(body.ZkStorageSize), tplCfg.ZkStorageSize),
		KafkaStorageSize: firstNonEmpty(strings.TrimSpace(body.KafkaStorageSize), tplCfg.KafkaStorageSize),
		StorageClassName: firstNonEmpty(strings.TrimSpace(body.StorageClassName), ""),
		SaslUsername:     saslUser,
		SaslPassword:     saslPass,
		SaslMechanism:    saslMech,
		ExtraKafkaEnv:    extraEnv,
		TemplateID:       tplRow.ID,
		TemplateName:     tplRow.Name,
	}

	ctxD, cancelD := context.WithTimeout(c.Request.Context(), 12*time.Minute)
	defer cancelD()
	if err := EnsureKafkaK8sNoNameConflict(ctxD, k8s, opts); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := ApplyKafkaK8sDeploy(ctxD, k8s, opts); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	bootstrap := kafkaBootstrapBrokersCSV(ns, base, kr)
	stored := appKafkaInstanceStored{
		Kind:             "kafka-k8s",
		Namespace:        ns,
		BaseName:         base,
		BootstrapBrokers: bootstrap,
		SaslUsername:     saslUser,
		SaslPassword:     saslPass,
		SaslMechanism:    saslMech,
		ZkReplicas:       int(zr),
		KafkaReplicas:    int(kr),
		TemplateID:       tplRow.ID,
		TemplateName:     tplRow.Name,
	}
	snap, _ := json.Marshal(stored)

	var instanceID int64
	var instanceErr string
	user := dashboardUsernameFromGin(c)
	ctx2, cancel2 := context.WithTimeout(c.Request.Context(), 25*time.Second)
	defer cancel2()
	iname := kafkaInstanceName(ns, base)
	var existing int64
	qerr := db.QueryRowContext(ctx2, `SELECT id FROM kubebt_app_kafka_instances WHERE name=?`, iname).Scan(&existing)
	if qerr == sql.ErrNoRows {
		id, ierr := appKafkaInsert(ctx2, db, iname, string(snap), user)
		if ierr != nil {
			instanceErr = ierr.Error()
		} else {
			instanceID = id
		}
	} else if qerr == nil {
		if err := appKafkaUpdate(ctx2, db, existing, iname, string(snap)); err != nil {
			instanceErr = err.Error()
		} else {
			instanceID = existing
		}
	} else {
		instanceErr = qerr.Error()
	}

	SetAuditDetail(c, fmt.Sprintf("应用中心 Kafka+ZK 已部署至 %s/%s", ns, base))
	c.JSON(http.StatusOK, gin.H{
		"message":                "已部署到 Kubernetes（独立 ZooKeeper + Kafka，SASL 按所选机制）",
		"namespace":              ns,
		"baseName":               base,
		"bootstrapBrokers":       bootstrap,
		"saslUsername":           saslUser,
		"saslPassword":           saslPass,
		"saslMechanism":          saslMech,
		"zkStatefulSet":          kafkaZkSTSName(base),
		"kafkaStatefulSet":       kafkaKafkaSTSName(base),
		"instanceId":             instanceID,
		"instancePersistError":   nullIfEmptyStr(instanceErr),
		"hints": []string{
			"控制台与 kube-bt-sync 须能访问 bootstrapBrokers（通常在集群内或通过 NodePort/Ingress 暴露 9092）。",
			"模版镜像建议：ZooKeeper 使用官方 zookeeper:3.9.x；Kafka 使用 bitnamilegacy/kafka:3.7.x（Docker Hub 上 bitnami/kafka 已无公开 tag，须为 ZooKeeper 模式）。",
			"已启用 AclAuthorizer 且 allow.everyone.if.no.acl.found=true，便于起步；生产请收紧 ACL 并改为 false。",
		},
	})
}

func handleKafkaInstanceExposureGet(c *gin.Context, app *ServerApp) {
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL 未连接"})
		return
	}
	id, ok := kafkaParseInstanceID(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 35*time.Second)
	defer cancel()
	row, err := appKafkaGetByID(ctx, db, id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	st, err := parseKafkaInstanceStored(row.ConfigJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "实例配置无效: " + err.Error()})
		return
	}
	rep := st.KafkaReplicas
	if rep <= 0 {
		rep = 3
	}
	mode := strings.TrimSpace(st.ExternalExposure)
	if mode == "" {
		mode = "internal"
	}
	svcs := DescribeKafkaNodePortServices(ctx, k8s, st.Namespace, st.BaseName, rep)
	ext := KafkaExternalBootstrapCSV(st.ExternalAdvertiseHost, st.ExternalNodePorts)
	host := strings.TrimSpace(st.ExternalAdvertiseHost)
	var accessEndpoints []gin.H
	if mode == "nodeport" && host != "" && len(st.ExternalNodePorts) > 0 {
		for i, p := range st.ExternalNodePorts {
			if i >= rep {
				break
			}
			accessEndpoints = append(accessEndpoints, gin.H{
				"broker": i, "host": host, "nodePort": p,
			})
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"externalExposure":      mode,
		"externalAdvertiseHost": st.ExternalAdvertiseHost,
		"externalNodePorts":     st.ExternalNodePorts,
		"kafkaReplicas":         st.KafkaReplicas,
		"services":              svcs,
		"externalBootstrap":     ext,
		"externalListenerPort":  9094,
		"accessEndpoints":       accessEndpoints,
	})
}

func handleKafkaInstanceExposurePut(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		return
	}
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL 未连接"})
		return
	}
	id, ok := kafkaParseInstanceID(c)
	if !ok {
		return
	}
	var body struct {
		Mode          string `json:"mode"`
		AdvertiseHost string `json:"advertiseHost"`
		NodePorts     []int  `json:"nodePorts"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体须为 JSON"})
		return
	}
	mode := strings.ToLower(strings.TrimSpace(body.Mode))
	if mode != "internal" && mode != "nodeport" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "mode 须为 internal 或 nodeport"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 4*time.Minute)
	defer cancel()
	row, err := appKafkaGetByID(ctx, db, id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	st, err := parseKafkaInstanceStored(row.ConfigJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "实例配置无效: " + err.Error()})
		return
	}
	if mode == "internal" {
		st.ExternalExposure = "internal"
		st.ExternalAdvertiseHost = ""
		st.ExternalNodePorts = nil
	} else {
		st.ExternalExposure = "nodeport"
		st.ExternalAdvertiseHost = strings.TrimSpace(body.AdvertiseHost)
		st.ExternalNodePorts = append([]int(nil), body.NodePorts...)
	}
	if err := ApplyKafkaInstanceExposure(ctx, k8s, st); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	snap, mErr := json.Marshal(st)
	if mErr != nil {
		RespondAPIError500(c, mErr.Error())
		return
	}
	if err := appKafkaUpdate(ctx, db, id, row.Name, string(snap)); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, fmt.Sprintf("Kafka 实例 id=%d 对外访问已设为 %s", id, mode))
	c.JSON(http.StatusOK, gin.H{
		"ok":                    true,
		"message":               "已应用；Kafka Pod 将滚动重启以更新 advertised.listeners",
		"externalExposure":      st.ExternalExposure,
		"externalAdvertiseHost": st.ExternalAdvertiseHost,
		"externalNodePorts":     st.ExternalNodePorts,
	})
}

func handleKafkaInstanceRollout(c *gin.Context, app *ServerApp) {
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL 未连接"})
		return
	}
	id, ok := kafkaParseInstanceID(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 25*time.Second)
	defer cancel()
	row, err := appKafkaGetByID(ctx, db, id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	st, err := parseKafkaInstanceStored(row.ConfigJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "实例配置无效: " + err.Error()})
		return
	}
	ctx2, cancel2 := context.WithTimeout(c.Request.Context(), 22*time.Second)
	defer cancel2()
	out, err := AppKafkaRolloutWithUsage(ctx2, k8s, app.Cfg(), st.Namespace, st.BaseName)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	out["saslMechanism"] = st.effectiveSaslMechanism()
	c.JSON(http.StatusOK, out)
}

func handleKafkaConsumerGroups(c *gin.Context, app *ServerApp) {
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	groups, err := appKafkaListConsumerGroups(c.Request.Context(), x.Client)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"groups": groups})
}

func handleKafkaTopicsList(c *gin.Context, app *ServerApp) {
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	topics, err := appKafkaListTopics(c.Request.Context(), x.Client)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"topics": topics})
}

func handleKafkaTopicCreate(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		return
	}
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	var body struct {
		Topic      string `json:"topic"`
		Partitions int32  `json:"partitions"`
		RF         int16  `json:"replicationFactor"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Partitions <= 0 {
		body.Partitions = 3
	}
	if body.RF <= 0 {
		body.RF = 3
	}
	if err := appKafkaCreateTopic(c.Request.Context(), x.Client, strings.TrimSpace(body.Topic), body.Partitions, body.RF); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "Kafka 创建主题 "+body.Topic)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleKafkaTopicDelete(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		return
	}
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	topic := strings.TrimPrefix(c.Param("topic"), "/")
	topic = strings.TrimSpace(topic)
	if topic == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "topic 不能为空"})
		return
	}
	if err := appKafkaDeleteTopic(c.Request.Context(), x.Client, topic); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "Kafka 删除主题 "+topic)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleKafkaACLList(c *gin.Context, app *ServerApp) {
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	acls, err := appKafkaDescribeACLs(c.Request.Context(), x.Client)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"acls": acls})
}

func handleKafkaACLCreate(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		return
	}
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	var body struct {
		ResourceType        string `json:"resourceType"`
		ResourceName        string `json:"resourceName"`
		ResourcePatternType string `json:"resourcePatternType"`
		Principal           string `json:"principal"`
		Host                string `json:"host"`
		Operation           string `json:"operation"`
		PermissionType      string `json:"permissionType"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rt, err := kmsg.ParseACLResourceType(body.ResourceType)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pt, err := kmsg.ParseACLResourcePatternType(body.ResourcePatternType)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	op, err := kmsg.ParseACLOperation(body.Operation)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	perm, err := kmsg.ParseACLPermissionType(body.PermissionType)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := appKafkaCreateACL(c.Request.Context(), x.Client, rt, body.ResourceName, pt, body.Principal, body.Host, op, perm); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "Kafka 创建 ACL")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleKafkaACLDelete(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		return
	}
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	var body struct {
		ResourceType        string  `json:"resourceType"`
		ResourceName        *string `json:"resourceName"`
		ResourcePatternType string  `json:"resourcePatternType"`
		Principal           *string `json:"principal"`
		Host                *string `json:"host"`
		Operation           string  `json:"operation"`
		PermissionType      string  `json:"permissionType"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rt, err := kmsg.ParseACLResourceType(body.ResourceType)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	pt, err := kmsg.ParseACLResourcePatternType(body.ResourcePatternType)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	op, err := kmsg.ParseACLOperation(body.Operation)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	perm, err := kmsg.ParseACLPermissionType(body.PermissionType)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	f := kmsg.NewDeleteACLsRequestFilter()
	f.ResourceType = rt
	f.ResourceName = body.ResourceName
	f.ResourcePatternType = pt
	f.Principal = body.Principal
	f.Host = body.Host
	f.Operation = op
	f.PermissionType = perm
	if err := appKafkaDeleteACLs(c.Request.Context(), x.Client, []kmsg.DeleteACLsRequestFilter{f}); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "Kafka 删除 ACL")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleKafkaScramUserCreate(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		return
	}
	st, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := appKafkaAlterScramUser(c.Request.Context(), x.Client, body.Username, body.Password, st.effectiveSaslMechanism()); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "Kafka SCRAM 用户 "+body.Username)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleKafkaScramUserDelete(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		return
	}
	st, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	u := strings.TrimPrefix(c.Param("user"), "/")
	u = strings.TrimSpace(u)
	if u == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user 不能为空"})
		return
	}
	if err := appKafkaDeleteScramUser(c.Request.Context(), x.Client, u, st.effectiveSaslMechanism()); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "Kafka 删除 SCRAM 用户 "+u)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleKafkaInstanceDelete(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL 未连接"})
		return
	}
	id, ok := kafkaParseInstanceID(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 4*time.Minute)
	defer cancel()
	row, err := appKafkaGetByID(ctx, db, id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	ns, bn := kafkaInstanceK8sNamesFromConfigJSON(row.ConfigJSON)
	if st, perr := parseKafkaInstanceStored(row.ConfigJSON); perr == nil {
		ns = strings.TrimSpace(st.Namespace)
		bn = strings.TrimSpace(st.BaseName)
	}
	var k8sWarnings []string
	if app.K8s() == nil {
		k8sWarnings = append(k8sWarnings, "K8s 未连接，未删除集群内 ZooKeeper/Kafka")
	} else if ns != "" && bn != "" {
		k8sWarnings = DeleteKafkaK8sResources(ctx, app.K8s(), ns, bn)
	} else {
		k8sWarnings = append(k8sWarnings, "配置中缺少 namespace/baseName，已跳过集群资源删除")
	}
	if err := appKafkaDeleteByID(ctx, db, id); err != nil {
		RespondAPIErrorMerged(c, http.StatusInternalServerError, err.Error(), gin.H{"k8sWarnings": k8sWarnings})
		return
	}
	SetAuditDetail(c, fmt.Sprintf("删除 Kafka 实例 id=%d %s/%s", id, ns, bn))
	c.JSON(http.StatusOK, gin.H{"ok": true, "k8sWarnings": k8sWarnings})
}

func handleKafkaClusterMetadata(c *gin.Context, app *ServerApp) {
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	meta, err := appKafkaClusterMetadata(c.Request.Context(), x.Client)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, meta)
}

func handleKafkaConsumerGroupLag(c *gin.Context, app *ServerApp) {
	group := strings.TrimSpace(c.Query("group"))
	if group == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 query 参数 group"})
		return
	}
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	out, err := appKafkaConsumerGroupLag(c.Request.Context(), x.Client, group)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, out)
}

func kafkaTopicNameFromParam(c *gin.Context) string {
	return strings.TrimSpace(c.Param("topic"))
}

func handleKafkaTopicConfigsGet(c *gin.Context, app *ServerApp) {
	topic := kafkaTopicNameFromParam(c)
	if topic == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "topic 不能为空"})
		return
	}
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	cfg, err := appKafkaDescribeTopicConfigs(c.Request.Context(), x.Client, topic)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"configs": cfg})
}

func handleKafkaTopicConfigsPost(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		return
	}
	topic := kafkaTopicNameFromParam(c)
	if topic == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "topic 不能为空"})
		return
	}
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	var body struct {
		Entries map[string]string `json:"entries"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := appKafkaIncrementalAlterTopicConfigs(c.Request.Context(), x.Client, topic, body.Entries); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "Kafka 修改主题配置 "+topic)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleKafkaTopicProduce(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		return
	}
	topic := kafkaTopicNameFromParam(c)
	if topic == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "topic 不能为空"})
		return
	}
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	var body struct {
		Key       *string `json:"key"`
		Value     string  `json:"value"`
		Partition *int32  `json:"partition"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var key []byte
	if body.Key != nil {
		key = []byte(*body.Key)
	}
	part, off, err := appKafkaProduceOne(c.Request.Context(), x.Client, topic, body.Partition, key, []byte(body.Value))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, fmt.Sprintf("Kafka 生产消息 topic=%s partition=%d", topic, part))
	c.JSON(http.StatusOK, gin.H{"partition": part, "offset": off})
}

func handleKafkaTopicMessagesGet(c *gin.Context, app *ServerApp) {
	st, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	topic := kafkaTopicNameFromParam(c)
	if topic == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "topic 不能为空"})
		return
	}
	partition, err := strconv.ParseInt(strings.TrimSpace(c.Query("partition")), 10, 32)
	if err != nil || partition < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "query partition 无效"})
		return
	}
	limit, _ := strconv.Atoi(strings.TrimSpace(c.DefaultQuery("limit", "50")))
	offsetStr := strings.TrimSpace(c.Query("offset"))
	ctx := c.Request.Context()
	var start int64
	if offsetStr == "" {
		latest, err := appKafkaListOffsetAt(ctx, x.Client, topic, int32(partition), -1)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		if limit <= 0 {
			limit = 50
		}
		start = latest - int64(limit)
		if start < 0 {
			start = 0
		}
	} else {
		start, err = strconv.ParseInt(offsetStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "offset 无效"})
			return
		}
	}
	brokers := strings.Split(st.BootstrapBrokers, ",")
	msgs, err := appKafkaBrowseMessages(ctx, brokers, st.SaslUsername, st.SaslPassword, st.effectiveSaslMechanism(), topic, int32(partition), start, limit)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"messages": msgs, "startOffset": start})
}

// handleKafkaClientQuotaList 列出所有用户的生产/消费限速配置。
func handleKafkaClientQuotaList(c *gin.Context, app *ServerApp) {
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	quotas, err := appKafkaListClientQuotas(c.Request.Context(), x.Client)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	if quotas == nil {
		quotas = []KafkaClientQuotaConfig{}
	}
	c.JSON(http.StatusOK, gin.H{"quotas": quotas})
}

// handleKafkaClientQuotaSet 设置用户的生产/消费限速（-1 表示删除限速）。
func handleKafkaClientQuotaSet(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		return
	}
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	var body KafkaClientQuotaConfig
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := appKafkaAlterClientQuota(c.Request.Context(), x.Client, &body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, fmt.Sprintf("Kafka 设置用户限速 user=%s producer=%d consumer=%d", body.User, body.ProducerByteRate, body.ConsumerByteRate))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// handleKafkaTopicThrottleGet 查询 topic 的复制限速配置。
func handleKafkaTopicThrottleGet(c *gin.Context, app *ServerApp) {
	topic := kafkaTopicNameFromParam(c)
	if topic == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "topic 不能为空"})
		return
	}
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	cfg, err := appKafkaGetTopicThrottle(c.Request.Context(), x.Client, topic)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"throttle": cfg})
}

// handleKafkaTopicThrottlePut 设置 topic 的复制限速（-1 表示删除限速恢复默认）。
func handleKafkaTopicThrottlePut(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		return
	}
	topic := kafkaTopicNameFromParam(c)
	if topic == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "topic 不能为空"})
		return
	}
	_, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	var body KafkaTopicThrottleConfig
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := appKafkaSetTopicThrottle(c.Request.Context(), x.Client, topic, &body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, fmt.Sprintf("Kafka 设置主题复制限速 topic=%s leader=%d follower=%d", topic, body.LeaderReplicationThrottledRate, body.FollowerReplicationThrottledRate))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleKafkaPerfTestStart(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		return
	}
	st, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	k8s := app.K8s()
	if k8s == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Kubernetes 未连接"})
		return
	}
	var req KafkaPerfTestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := appKafkaPerfDefaults(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	vctx, vcancel := context.WithTimeout(c.Request.Context(), 45*time.Second)
	checks := kafkaPerfRunValidation(vctx, st, x.Client, &req)
	vcancel()
	if !kafkaPerfChecksAllOK(checks) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  "压测前置校验未通过，请修正后重试",
			"checks": checks,
		})
		return
	}
	id, ok := kafkaParseInstanceID(c)
	if !ok {
		return
	}
	jobName := appKafkaPerfJobName(id)
	suffix := jobName
	if i := strings.LastIndex(jobName, "-"); i >= 0 {
		suffix = jobName[i+1:]
	}
	image, pullSecret := appKafkaPerfGetImageAndPullSecret(c.Request.Context(), k8s, st.Namespace, st.BaseName)
	script := appKafkaBuildPerfScript(&req, st, suffix)
	ann, err := appKafkaPerfJobAnnotations(&req, st)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	if err := appKafkaCreatePerfJob(ctx, k8s, st.Namespace, jobName, image, pullSecret, script, ann); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, fmt.Sprintf("Kafka 压测 job=%s topic=%s", jobName, req.Topic))
	c.JSON(http.StatusOK, gin.H{"jobName": jobName, "namespace": st.Namespace})
}

func handleKafkaPerfTestReport(c *gin.Context, app *ServerApp) {
	st, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	k8s := app.K8s()
	if k8s == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Kubernetes 未连接"})
		return
	}
	jobName := strings.TrimSpace(c.Param("name"))
	if jobName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "job 名称无效"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 45*time.Second)
	defer cancel()
	report, err := appKafkaPerfJobReport(ctx, k8s, st.Namespace, jobName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, report)
}

func handleKafkaPerfTestDelete(c *gin.Context, app *ServerApp) {
	if !appKafkaRequireWrite(c) {
		return
	}
	st, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	k8s := app.K8s()
	if k8s == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Kubernetes 未连接"})
		return
	}
	jobName := strings.TrimSpace(c.Param("name"))
	if jobName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "job 名称无效"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	job, err := k8s.BatchV1().Jobs(st.Namespace).Get(ctx, jobName, metav1.GetOptions{})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	if job.Labels == nil || job.Labels[kafkaPerfLabel] != "true" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不是平台压测 Job，拒绝删除"})
		return
	}
	prop := metav1.DeletePropagationForeground
	err = k8s.BatchV1().Jobs(st.Namespace).Delete(ctx, jobName, metav1.DeleteOptions{PropagationPolicy: &prop})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, fmt.Sprintf("Kafka 删除压测 Job %s", jobName))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleKafkaPerfTestList(c *gin.Context, app *ServerApp) {
	st, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	k8s := app.K8s()
	if k8s == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Kubernetes 未连接"})
		return
	}
	id, ok := kafkaParseInstanceID(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	items, err := appKafkaListPerfJobs(ctx, k8s, st.Namespace, id)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"jobs": items})
}

func handleKafkaPerfTestValidate(c *gin.Context, app *ServerApp) {
	st, x := kafkaLoadInstanceClient(c, app)
	if x == nil {
		return
	}
	defer x.Close()
	var req KafkaPerfTestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := appKafkaPerfDefaults(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 45*time.Second)
	defer cancel()
	checks := kafkaPerfRunValidation(ctx, st, x.Client, &req)
	c.JSON(http.StatusOK, gin.H{
		"ok":     kafkaPerfChecksAllOK(checks),
		"checks": checks,
	})
}
