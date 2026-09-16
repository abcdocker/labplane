package internal

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	mysql "github.com/go-sql-driver/mysql"
)

func registerOpenSearchAppCenterRoutes(api *gin.RouterGroup, app *ServerApp) {
	g := api.Group("/app-center/opensearch")
	registerOpenSearchManageRoutes(g, app)
	g.GET("/status", func(c *gin.Context) { handleOpenSearchStatus(c, app) })
	g.GET("/instances", func(c *gin.Context) { handleOpenSearchInstanceList(c, app) })
	g.POST("/k8s-deploy", func(c *gin.Context) { handleOpenSearchK8sDeploy(c, app) })
	g.GET("/templates", func(c *gin.Context) { handleOpenSearchTemplateList(c, app) })
	g.POST("/templates", func(c *gin.Context) { handleOpenSearchTemplateCreate(c, app) })
	g.GET("/templates/:id", func(c *gin.Context) { handleOpenSearchTemplateGet(c, app) })
	g.PUT("/templates/:id", func(c *gin.Context) { handleOpenSearchTemplateUpdate(c, app) })
	g.DELETE("/templates/:id", func(c *gin.Context) { handleOpenSearchTemplateDelete(c, app) })
}

func appOpenSearchRequireWrite(c *gin.Context) bool {
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

func handleOpenSearchStatus(c *gin.Context, app *ServerApp) {
	out := gin.H{
		"mysqlReachable": app.MySQLDB() != nil,
	}
	if app.MySQLDB() == nil && app.MySQLConnectError() != "" {
		out["mysqlConnectError"] = app.MySQLConnectError()
	}
	c.JSON(http.StatusOK, out)
}

func handleOpenSearchInstanceList(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusOK, gin.H{"instances": []interface{}{}, "mysqlRequired": true})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	rows, err := appOpenSearchListFromMySQL(ctx, db)
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

func handleOpenSearchTemplateList(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusOK, gin.H{"templates": []interface{}{}, "mysqlRequired": true})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	rows, err := appOpenSearchTemplateListFromMySQL(ctx, db)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	list := make([]interface{}, 0, len(rows))
	for _, row := range rows {
		pub, err := openSearchTemplateRowToPublic(row)
		if err != nil {
			continue
		}
		list = append(list, pub)
	}
	c.JSON(http.StatusOK, gin.H{"templates": list, "mysqlRequired": false})
}

func handleOpenSearchTemplateGet(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL 未连接"})
		return
	}
	id, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的模版 id"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	row, err := appOpenSearchTemplateGetByID(ctx, db, id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "模版不存在"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	pub, err := openSearchTemplateRowToPublic(*row)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, pub)
}

func handleOpenSearchTemplateCreate(c *gin.Context, app *ServerApp) {
	if !appOpenSearchRequireWrite(c) {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未连接 MySQL"})
		return
	}
	var body struct {
		Name        string                    `json:"name"`
		Description string                    `json:"description"`
		Config      AppOpenSearchTemplateConfig `json:"config"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name 不能为空"})
		return
	}
	if err := validateAppOpenSearchTemplateConfig(&body.Config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	b, err := json.Marshal(body.Config)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user := dashboardUsernameFromGin(c)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	id, err := appOpenSearchTemplateInsert(ctx, db, name, body.Description, string(b), user)
	if err != nil {
		var me *mysql.MySQLError
		if errors.As(err, &me) && me.Number == 1062 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "模版名称已存在"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id})
}

func handleOpenSearchTemplateUpdate(c *gin.Context, app *ServerApp) {
	if !appOpenSearchRequireWrite(c) {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未连接 MySQL"})
		return
	}
	id, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的模版 id"})
		return
	}
	var body struct {
		Name        string                    `json:"name"`
		Description string                    `json:"description"`
		Config      AppOpenSearchTemplateConfig `json:"config"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name 不能为空"})
		return
	}
	if err := validateAppOpenSearchTemplateConfig(&body.Config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	b, err := json.Marshal(body.Config)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	if err := appOpenSearchTemplateUpdate(ctx, db, id, name, body.Description, string(b)); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleOpenSearchTemplateDelete(c *gin.Context, app *ServerApp) {
	if !appOpenSearchRequireWrite(c) {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未连接 MySQL"})
		return
	}
	id, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的模版 id"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	if err := appOpenSearchTemplateDelete(ctx, db, id); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type openSearchK8sDeployBody struct {
	Namespace          string `json:"namespace"`
	DeploymentName     string `json:"deploymentName"`
	TemplateID         int64  `json:"templateId"`
	ImagePullSecret    string `json:"imagePullSecret,omitempty"`
	ClusterName        string `json:"clusterName,omitempty"`
	ServiceType        string `json:"serviceType,omitempty"`
	NodePortHTTP       int32  `json:"nodePortHttp,omitempty"`
	NodePortDashboards int32  `json:"nodePortDashboards,omitempty"`
	JavaOptsMaster     string `json:"javaOptsMaster,omitempty"`
	JavaOptsData       string `json:"javaOptsData,omitempty"`
	ExtraOpensearchYml string `json:"extraOpensearchYml,omitempty"`
	IndexTemplateJSON  string `json:"indexTemplateJSON,omitempty"`
	MasterStorageSize  string `json:"masterStorageSize,omitempty"`
	DataStorageSize    string `json:"dataStorageSize,omitempty"`
	StorageClassName   string `json:"storageClassName,omitempty"`
	MasterReplicas     int32  `json:"masterReplicas,omitempty"`
	DataReplicas       int32  `json:"dataReplicas,omitempty"`
}

func handleOpenSearchK8sDeploy(c *gin.Context, app *ServerApp) {
	if !appOpenSearchRequireWrite(c) {
		return
	}
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	var body openSearchK8sDeployBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := ValidateOptionalK8sNodePort("OpenSearch HTTP NodePort", body.NodePortHTTP); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := ValidateOptionalK8sNodePort("OpenSearch Dashboards NodePort", body.NodePortDashboards); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ns := strings.TrimSpace(body.Namespace)
	base := strings.TrimSpace(body.DeploymentName)
	if err := ValidateK8sNamespaceName(ns); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := ValidateK8sDeploymentName(base); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	db := app.MySQLDB()
	opts := OpenSearchK8sDeployOpts{
		Namespace:       ns,
		BaseName:        base,
		ClusterName:     strings.TrimSpace(body.ClusterName),
		ServiceType:     strings.TrimSpace(body.ServiceType),
		NodePortHTTP:    body.NodePortHTTP,
		NodePortDash:    body.NodePortDashboards,
		JavaOptsMaster:  strings.TrimSpace(body.JavaOptsMaster),
		JavaOptsData:    strings.TrimSpace(body.JavaOptsData),
		ExtraYml:        strings.TrimSpace(body.ExtraOpensearchYml),
		IndexTemplateJSON: strings.TrimSpace(body.IndexTemplateJSON),
		MasterStorageSize: strings.TrimSpace(body.MasterStorageSize),
		DataStorageSize:   strings.TrimSpace(body.DataStorageSize),
		StorageClassName:  strings.TrimSpace(body.StorageClassName),
		MasterReplicas:    body.MasterReplicas,
		DataReplicas:      body.DataReplicas,
	}

	if db != nil {
		if body.TemplateID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请选择 OpenSearch 部署模版"})
			return
		}
		ctxTpl, cancelTpl := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancelTpl()
		tplRow, err := appOpenSearchTemplateGetByID(ctxTpl, db, body.TemplateID)
		if err != nil {
			if err == sql.ErrNoRows {
				c.JSON(http.StatusBadRequest, gin.H{"error": "模版不存在"})
				return
			}
			RespondAPIError500(c, err.Error())
			return
		}
		tplCfg, err := parseAppOpenSearchTemplateConfig(tplRow.ConfigJSON)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "模版配置无效: " + err.Error()})
			return
		}
		if err := validateAppOpenSearchTemplateConfig(tplCfg); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		opts.OpenSearchImage = strings.TrimSpace(tplCfg.OpenSearchImage)
		opts.DashboardsImage = strings.TrimSpace(tplCfg.DashboardsImage)
		opts.ImagePullSecret = strings.TrimSpace(tplCfg.ImagePullSecret)
		if opts.JavaOptsMaster == "" {
			opts.JavaOptsMaster = strings.TrimSpace(tplCfg.DefaultJavaOptsMaster)
		}
		if opts.JavaOptsData == "" {
			opts.JavaOptsData = strings.TrimSpace(tplCfg.DefaultJavaOptsData)
		}
		if opts.ExtraYml == "" {
			opts.ExtraYml = strings.TrimSpace(tplCfg.ExtraOpensearchYml)
		}
		if opts.IndexTemplateJSON == "" {
			opts.IndexTemplateJSON = strings.TrimSpace(tplCfg.IndexTemplateJSON)
		}
		opts.TemplateID = tplRow.ID
		opts.TemplateName = tplRow.Name
	} else {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未连接 MySQL，无法按模版部署（请配置 MYSQL_DSN）"})
		return
	}

	ctxD, cancelD := context.WithTimeout(c.Request.Context(), 8*time.Minute)
	defer cancelD()
	if err := EnsureOpenSearchK8sNoNameConflict(ctxD, k8s, opts); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := ApplyOpenSearchK8sDeploy(ctxD, k8s, opts); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dataSvc := openSearchDataSvcName(base)
	dashSvc := openSearchDashSvcName(base)
	internalHTTP := fmt.Sprintf("http://%s.%s.svc.cluster.local:9200", dataSvc, ns)
	internalDash := fmt.Sprintf("http://%s.%s.svc.cluster.local:5601", dashSvc, ns)

	stored := map[string]interface{}{
		"kind":              "opensearch-k8s",
		"namespace":         ns,
		"baseName":          base,
		"clusterName":       firstNonEmpty(strings.TrimSpace(opts.ClusterName), base),
		"templateId":        opts.TemplateID,
		"templateName":      opts.TemplateName,
		"serviceType":       strings.TrimSpace(opts.ServiceType),
		"httpService":       dataSvc,
		"dashboardsService": dashSvc,
		"internalHttp":      internalHTTP,
		"internalDashboards": internalDash,
		"vectorOpenSearchUrl": internalHTTP,
	}
	snap, _ := json.Marshal(stored)

	var instanceID int64
	var instanceErr string
	if db != nil {
		user := dashboardUsernameFromGin(c)
		ctx2, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
		defer cancel()
		iname := openSearchInstanceName(ns, base)
		var existing int64
		qerr := db.QueryRowContext(ctx2, `SELECT id FROM kubebt_app_opensearch_instances WHERE name=?`, iname).Scan(&existing)
		if qerr == sql.ErrNoRows {
			id, ierr := appOpenSearchInsert(ctx2, db, iname, string(snap), user)
			if ierr != nil {
				instanceErr = ierr.Error()
			} else {
				instanceID = id
			}
		} else if qerr == nil {
			if err := appOpenSearchUpdate(ctx2, db, existing, iname, string(snap)); err != nil {
				instanceErr = err.Error()
			} else {
				instanceID = existing
			}
		} else {
			instanceErr = qerr.Error()
		}
	} else {
		instanceErr = "MySQL 未连接，未写入实例列表"
	}

	SetAuditDetail(c, fmt.Sprintf("应用中心 OpenSearch 已部署至 %s/%s", ns, base))
	c.JSON(http.StatusOK, gin.H{
		"message":              "已部署到 Kubernetes",
		"namespace":            ns,
		"deploymentName":       base,
		"httpService":          dataSvc,
		"dashboardsService":    dashSvc,
		"internalHttp":         internalHTTP,
		"internalDashboards":   internalDash,
		"vectorOpenSearchUrl":  internalHTTP,
		"instanceId":           instanceID,
		"instancePersistError": nullIfEmptyStr(instanceErr),
		"hints": []string{
			"集群内应用与 Vector 采集请使用 internalHttp（ClusterIP）；虚拟机侧采集需 NodePort 或 Ingress 等可路由地址。",
			"若配置了 indexTemplateJSON，将创建 Job 在集群就绪后注册 composable index template（名称 kubebt-<deploymentName>）。",
		},
	})
}

func nullIfEmptyStr(s string) interface{} {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return s
}
