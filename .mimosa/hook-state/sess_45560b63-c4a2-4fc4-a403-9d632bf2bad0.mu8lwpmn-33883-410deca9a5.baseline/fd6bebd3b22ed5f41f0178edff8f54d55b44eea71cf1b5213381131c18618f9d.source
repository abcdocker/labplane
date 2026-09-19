package internal

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func registerUpyunCloudAppCenterRoutes(api *gin.RouterGroup, app *ServerApp) {
	g := api.Group("/upyun-cloud")

	g.GET("/accounts", func(c *gin.Context) { handleUpyunCloudAccountList(c, app) })
	g.POST("/verify-credentials", func(c *gin.Context) { handleUpyunCloudVerifyCredentials(c) })

	// Overview
	g.GET("/overview", func(c *gin.Context) { handleUpyunCloudOverview(c, app) })

	// USS
	g.GET("/uss/files", func(c *gin.Context) { handleUpyunCloudUSSFiles(c, app) })
	g.GET("/uss/info", func(c *gin.Context) { handleUpyunCloudUSSInfo(c, app) })

	// CDN
	g.GET("/cdn/domains", func(c *gin.Context) { handleUpyunCloudCDNDomains(c, app) })
}

func upyunProviderCheck(provider string) bool {
	return strings.ToLower(provider) == "upyun"
}

func upyunCloudAccountFromQueryDNS(c *gin.Context, app *ServerApp) (*DnsAccount, *upyunCloudClient, bool) {
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return nil, nil, false
	}
	s := c.Query("account_id")
	id, err := strconv.Atoi(s)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 account_id"})
		return nil, nil, false
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	acc, err := dnsAccountGet(ctx, db, id)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "账号不存在"})
		return nil, nil, false
	}
	if err != nil {
		RespondAPIError500(c, err.Error())
		return nil, nil, false
	}
	if !upyunProviderCheck(acc.Provider) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该账号不是又拍云账号"})
		return nil, nil, false
	}
	var cfg map[string]string
	_ = json.Unmarshal([]byte(acc.ConfigJSON), &cfg)
	serviceName := cfg["serviceName"]
	operator := cfg["operator"]
	password := cfg["password"]
	if serviceName == "" || operator == "" || password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该又拍云账号缺少服务名、操作员或密码"})
		return nil, nil, false
	}
	client := newUpyunCloudClient(serviceName, operator, password)
	return acc, client, true
}

type upyunAccountOverview struct {
	AccountID   int    `json:"accountId"`
	AccountName string `json:"accountName"`
	ServiceName string `json:"serviceName"`
	DomainCount int    `json:"domainCount"`
}

func handleUpyunCloudOverview(c *gin.Context, app *ServerApp) {
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	list, err := dnsAccountList(ctx, db)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	var accounts []DnsAccount
	for _, a := range list {
		if upyunProviderCheck(a.Provider) {
			accounts = append(accounts, a)
		}
	}
	if accounts == nil {
		accounts = []DnsAccount{}
	}

	results := make([]upyunAccountOverview, 0, len(accounts))
	for _, acc := range accounts {
		var cfg map[string]string
		_ = json.Unmarshal([]byte(acc.ConfigJSON), &cfg)
		serviceName := cfg["serviceName"]
		operator := cfg["operator"]
		password := cfg["password"]
		ov := upyunAccountOverview{AccountID: acc.ID, AccountName: acc.Name, ServiceName: serviceName}
		if serviceName != "" && operator != "" && password != "" {
			client := newUpyunCloudClient(serviceName, operator, password)
			dCtx, dCancel := context.WithTimeout(ctx, 15*time.Second)
			if domains, err := client.ListCDNDomains(dCtx); err == nil {
				ov.DomainCount = len(domains)
			}
			dCancel()
		}
		results = append(results, ov)
	}

	c.JSON(http.StatusOK, gin.H{"accounts": results})
}

func handleUpyunCloudAccountList(c *gin.Context, app *ServerApp) {
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	list, err := dnsAccountList(ctx, db)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	var out []DnsAccount
	for _, a := range list {
		if upyunProviderCheck(a.Provider) {
			out = append(out, a)
		}
	}
	if out == nil {
		out = []DnsAccount{}
	}
	c.JSON(http.StatusOK, gin.H{"accounts": out})
}

func handleUpyunCloudUSSFiles(c *gin.Context, app *ServerApp) {
	_, client, ok := upyunCloudAccountFromQueryDNS(c, app)
	if !ok {
		return
	}
	path := c.Query("path")
	if path == "" {
		path = "/"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	result, err := client.ListFiles(ctx, path, limit)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items":    result.Items,
		"nextIter": result.NextIter,
	})
}

func handleUpyunCloudUSSInfo(c *gin.Context, app *ServerApp) {
	_, client, ok := upyunCloudAccountFromQueryDNS(c, app)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	info, err := client.GetServiceInfo(ctx)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, info)
}

func handleUpyunCloudCDNDomains(c *gin.Context, app *ServerApp) {
	_, client, ok := upyunCloudAccountFromQueryDNS(c, app)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	domains, err := client.ListCDNDomains(ctx)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"domains": domains})
}

func handleUpyunCloudVerifyCredentials(c *gin.Context) {
	var body struct {
		ServiceName string `json:"serviceName" binding:"required"`
		Operator    string `json:"operator" binding:"required"`
		Password    string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	client := newUpyunCloudClient(body.ServiceName, body.Operator, body.Password)
	if err := client.VerifyCredentials(ctx); err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "凭证验证通过"})
}

// testUpyunCredentials 验证又拍云凭证是否可用
func testUpyunCredentials(ctx context.Context, serviceName, operator, password string) error {
	client := newUpyunCloudClient(serviceName, operator, password)
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	return client.VerifyCredentials(ctx)
}
