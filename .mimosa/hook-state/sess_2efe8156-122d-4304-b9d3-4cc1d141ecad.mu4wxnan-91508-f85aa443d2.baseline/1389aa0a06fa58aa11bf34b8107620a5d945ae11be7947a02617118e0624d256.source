package internal

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func appOpenSearchCanAccess(c *gin.Context) bool {
	if getDashboardRoleFromGin(c) == DashboardRoleAdmin {
		return true
	}
	eff := getEffectiveDashboardPermissionsFromGin(c)
	if eff.LegacyViewer {
		RespondAPIPermissionDenied(c)
		return false
	}
	if eff.AppCenter == ModuleAccessNone {
		RespondAPIPermissionDenied(c)
		return false
	}
	return true
}

func registerOpenSearchManageRoutes(g *gin.RouterGroup, app *ServerApp) {
	g.GET("/instances/:id/cluster/health", func(c *gin.Context) { handleOpenSearchClusterHealth(c, app) })
	g.GET("/instances/:id/indices", func(c *gin.Context) { handleOpenSearchIndicesList(c, app) })
	g.GET("/instances/:id/index/detail", func(c *gin.Context) { handleOpenSearchIndexDetail(c, app) })
	g.DELETE("/instances/:id/index", func(c *gin.Context) { handleOpenSearchIndexDelete(c, app) })
	g.PUT("/instances/:id/index/settings", func(c *gin.Context) { handleOpenSearchIndexSettings(c, app) })
	g.POST("/instances/:id/indices/prune", func(c *gin.Context) { handleOpenSearchIndicesPrune(c, app) })
}

func openSearchInstanceID(c *gin.Context) (int64, error) {
	return strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
}

func openSearchLoadInstanceBase(ctx context.Context, app *ServerApp, id int64) (string, error) {
	db := app.MySQLDB()
	if db == nil {
		return "", errors.New("MySQL 未连接")
	}
	row, err := appOpenSearchGetByID(ctx, db, id)
	if err != nil {
		return "", err
	}
	return openSearchBaseURLFromInstanceConfigJSON(row.ConfigJSON)
}

func writeOpenSearchManageError(c *gin.Context, err error) {
	if err == nil {
		return
	}
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
		return
	}
	if errors.Is(err, errOpenSearchNoBaseURL) {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	RespondAPIError500(c, err.Error())
}

func handleOpenSearchClusterHealth(c *gin.Context, app *ServerApp) {
	if !appOpenSearchCanAccess(c) {
		return
	}
	id, err := openSearchInstanceID(c)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的实例 id"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), openSearchHTTPTimeout)
	defer cancel()
	base, err := openSearchLoadInstanceBase(ctx, app, id)
	if err != nil {
		writeOpenSearchManageError(c, err)
		return
	}
	code, b, _, err := openSearchDo(ctx, base, http.MethodGet, "/_cluster/health?wait_for_status=yellow&timeout=5s", nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.Data(code, "application/json", b)
}

func handleOpenSearchIndicesList(c *gin.Context, app *ServerApp) {
	if !appOpenSearchCanAccess(c) {
		return
	}
	id, err := openSearchInstanceID(c)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的实例 id"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), openSearchHTTPTimeout)
	defer cancel()
	base, err := openSearchLoadInstanceBase(ctx, app, id)
	if err != nil {
		writeOpenSearchManageError(c, err)
		return
	}
	rows, err := openSearchCatIndices(ctx, base)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"indices": rows})
}

func handleOpenSearchIndexDetail(c *gin.Context, app *ServerApp) {
	if !appOpenSearchCanAccess(c) {
		return
	}
	id, err := openSearchInstanceID(c)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的实例 id"})
		return
	}
	index := strings.TrimSpace(c.Query("index"))
	if index == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 query index"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), openSearchHTTPTimeout)
	defer cancel()
	base, err := openSearchLoadInstanceBase(ctx, app, id)
	if err != nil {
		writeOpenSearchManageError(c, err)
		return
	}
	seg := openSearchIndexPathSegment(index)
	settingsPath := "/" + seg + "/_settings?flat_settings=true&include_defaults=true"
	statsPath := "/" + seg + "/_stats?filter_path=indices.*.primaries.docs,indices.*.primaries.store,indices.*.total.docs,indices.*.total.store"

	code1, b1, _, err := openSearchDo(ctx, base, http.MethodGet, settingsPath, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	code2, b2, _, err := openSearchDo(ctx, base, http.MethodGet, statsPath, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	var settingsObj, statsObj interface{}
	_ = json.Unmarshal(b1, &settingsObj)
	_ = json.Unmarshal(b2, &statsObj)
	c.JSON(http.StatusOK, gin.H{
		"index":          index,
		"settingsStatus": code1,
		"statsStatus":    code2,
		"settings":       settingsObj,
		"stats":          statsObj,
	})
}

func handleOpenSearchIndexDelete(c *gin.Context, app *ServerApp) {
	if !appOpenSearchRequireWrite(c) {
		return
	}
	id, err := openSearchInstanceID(c)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的实例 id"})
		return
	}
	index := strings.TrimSpace(c.Query("index"))
	if index == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 query index"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), openSearchHTTPTimeout)
	defer cancel()
	base, err := openSearchLoadInstanceBase(ctx, app, id)
	if err != nil {
		writeOpenSearchManageError(c, err)
		return
	}
	delPath := "/" + openSearchIndexPathSegment(index)
	code, b, _, err := openSearchDo(ctx, base, http.MethodDelete, delPath, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "OpenSearch 删除索引 "+index)
	if code < 200 || code >= 300 {
		c.JSON(http.StatusBadGateway, gin.H{"error": string(b), "httpStatus": code})
		return
	}
	c.Data(code, "application/json", b)
}

func handleOpenSearchIndexSettings(c *gin.Context, app *ServerApp) {
	if !appOpenSearchRequireWrite(c) {
		return
	}
	id, err := openSearchInstanceID(c)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的实例 id"})
		return
	}
	index := strings.TrimSpace(c.Query("index"))
	if index == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 query index"})
		return
	}
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求体不能为空（须为 OpenSearch PUT _settings 的 JSON，如 {\"index\":{\"refresh_interval\":\"30s\"}}）"})
		return
	}
	var probe interface{}
	if err := json.Unmarshal(body, &probe); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "body 须为合法 JSON"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), openSearchHTTPTimeout)
	defer cancel()
	base, err := openSearchLoadInstanceBase(ctx, app, id)
	if err != nil {
		writeOpenSearchManageError(c, err)
		return
	}
	path := "/" + openSearchIndexPathSegment(index) + "/_settings"
	code, respBody, _, err := openSearchDo(ctx, base, http.MethodPut, path, body)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "OpenSearch 更新索引设置 "+index)
	if code < 200 || code >= 300 {
		c.JSON(http.StatusBadGateway, gin.H{"error": string(respBody), "httpStatus": code})
		return
	}
	c.Data(code, "application/json", respBody)
}

func handleOpenSearchIndicesPrune(c *gin.Context, app *ServerApp) {
	if !appOpenSearchRequireWrite(c) {
		return
	}
	id, err := openSearchInstanceID(c)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的实例 id"})
		return
	}
	var in openSearchPruneInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Minute)
	defer cancel()
	base, err := openSearchLoadInstanceBase(ctx, app, id)
	if err != nil {
		writeOpenSearchManageError(c, err)
		return
	}
	out, err := openSearchPruneIndices(ctx, base, in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "OpenSearch 按创建时间清理索引 pattern="+in.Pattern+" dryRun="+strconv.FormatBool(in.DryRun))
	c.JSON(http.StatusOK, out)
}
