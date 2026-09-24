package internal

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func registerQiniuCloudAppCenterRoutes(api *gin.RouterGroup, app *ServerApp) {
	g := api.Group("/qiniu-cloud")

	g.GET("/accounts", func(c *gin.Context) { handleQiniuCloudAccountList(c, app) })
	g.POST("/verify-credentials", func(c *gin.Context) { handleQiniuCloudVerifyCredentials(c) })

	// Overview
	g.GET("/overview", func(c *gin.Context) { handleQiniuCloudOverview(c, app) })

	// Kodo
	g.GET("/kodo/buckets", func(c *gin.Context) { handleQiniuCloudKodoBuckets(c, app) })
	g.GET("/kodo/objects", func(c *gin.Context) { handleQiniuCloudKodoObjects(c, app) })

	// CDN
	g.GET("/cdn/domains", func(c *gin.Context) { handleQiniuCloudCDNDomains(c, app) })

	// SSL
	g.GET("/sslcerts", func(c *gin.Context) { handleQiniuCloudSSLCertList(c, app) })
	g.POST("/sslcerts", AdminOnlyMiddleware(app), func(c *gin.Context) { handleQiniuCloudSSLCertUpload(c, app) })
	g.DELETE("/sslcerts/:id", AdminOnlyMiddleware(app), func(c *gin.Context) { handleQiniuCloudSSLCertDelete(c, app) })

	// Stats
	g.GET("/stats", func(c *gin.Context) { handleQiniuCloudStats(c, app) })

	// SSL 绑定 / 存储用量
	g.POST("/cdn/domains/bind-cert", AdminOnlyMiddleware(app), func(c *gin.Context) { handleQiniuCloudCDNBindCert(c, app) })
	g.GET("/kodo/usage", func(c *gin.Context) { handleQiniuCloudKodoUsage(c, app) })
}

func qiniuProviderCheck(provider string) bool {
	return strings.ToLower(provider) == "qiniu"
}

func qiniuCloudAccountFromQueryDNS(c *gin.Context, app *ServerApp) (*DnsAccount, *qiniuCloudClient, bool) {
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
	if !qiniuProviderCheck(acc.Provider) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该账号不是七牛云账号"})
		return nil, nil, false
	}
	var cfg map[string]string
	_ = json.Unmarshal([]byte(acc.ConfigJSON), &cfg)
	ak := cfg["accessKey"]
	sk := cfg["secretKey"]
	if ak == "" || sk == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该七牛云账号缺少 AccessKey 或 SecretKey"})
		return nil, nil, false
	}
	client := newQiniuCloudClient(ak, sk)
	return acc, client, true
}

type qiniuAccountOverview struct {
	AccountID   int    `json:"accountId"`
	AccountName string `json:"accountName"`
	BucketCount int    `json:"bucketCount"`
	DomainCount int    `json:"domainCount"`
}

func handleQiniuCloudOverview(c *gin.Context, app *ServerApp) {
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
		if qiniuProviderCheck(a.Provider) {
			accounts = append(accounts, a)
		}
	}
	if accounts == nil {
		accounts = []DnsAccount{}
	}

	results := make([]qiniuAccountOverview, 0, len(accounts))
	for _, acc := range accounts {
		var cfg map[string]string
		_ = json.Unmarshal([]byte(acc.ConfigJSON), &cfg)
		ak := cfg["accessKey"]
		sk := cfg["secretKey"]
		if ak == "" || sk == "" {
			results = append(results, qiniuAccountOverview{AccountID: acc.ID, AccountName: acc.Name})
			continue
		}
		client := newQiniuCloudClient(ak, sk)
		ov := qiniuAccountOverview{AccountID: acc.ID, AccountName: acc.Name}

		bCtx, bCancel := context.WithTimeout(ctx, 15*time.Second)
		if buckets, err := client.ListBuckets(bCtx); err == nil {
			ov.BucketCount = len(buckets)
		}
		bCancel()

		dCtx, dCancel := context.WithTimeout(ctx, 15*time.Second)
		if domains, err := client.ListCDNDomains(dCtx); err == nil {
			ov.DomainCount = len(domains)
		}
		dCancel()

		results = append(results, ov)
	}

	c.JSON(http.StatusOK, gin.H{"accounts": results})
}

func handleQiniuCloudAccountList(c *gin.Context, app *ServerApp) {
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
		if qiniuProviderCheck(a.Provider) {
			out = append(out, a)
		}
	}
	if out == nil {
		out = []DnsAccount{}
	}
	c.JSON(http.StatusOK, gin.H{"accounts": out})
}

func handleQiniuCloudKodoBuckets(c *gin.Context, app *ServerApp) {
	_, client, ok := qiniuCloudAccountFromQueryDNS(c, app)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	buckets, err := client.ListBuckets(ctx)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"buckets": buckets})
}

func handleQiniuCloudKodoObjects(c *gin.Context, app *ServerApp) {
	_, client, ok := qiniuCloudAccountFromQueryDNS(c, app)
	if !ok {
		return
	}
	bucket := c.Query("bucket")
	prefix := c.Query("prefix")
	marker := c.Query("marker")
	if bucket == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bucket 必填"})
		return
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	result, err := client.ListObjects(ctx, bucket, prefix, marker, limit)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"marker":         result.Marker,
		"commonPrefixes": result.CommonPrefixes,
		"contents":       result.Items,
	})
}

func handleQiniuCloudCDNDomains(c *gin.Context, app *ServerApp) {
	_, client, ok := qiniuCloudAccountFromQueryDNS(c, app)
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

func handleQiniuCloudStats(c *gin.Context, app *ServerApp) {
	_, client, ok := qiniuCloudAccountFromQueryDNS(c, app)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	stats, err := client.GetStats(ctx)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"stats": stats})
}

func handleQiniuCloudVerifyCredentials(c *gin.Context) {
	var body struct {
		AccessKey string `json:"accessKey" binding:"required"`
		SecretKey string `json:"secretKey" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	client := newQiniuCloudClient(body.AccessKey, body.SecretKey)
	if err := client.VerifyCredentials(ctx); err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "凭证验证通过"})
}

// testQiniuCredentials 验证七牛云 AccessKey/SecretKey 是否可用
func testQiniuCredentials(ctx context.Context, accessKey, secretKey string) error {
	client := newQiniuCloudClient(accessKey, secretKey)
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	return client.VerifyCredentials(ctx)
}

// ─── SSL 证书 ───

func handleQiniuCloudSSLCertList(c *gin.Context, app *ServerApp) {
	_, client, ok := qiniuCloudAccountFromQueryDNS(c, app)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	certs, err := client.ListSSLCerts(ctx)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"certificates": certs})
}

func handleQiniuCloudSSLCertUpload(c *gin.Context, app *ServerApp) {
	var body struct {
		Name       string `json:"name"`
		CommonName string `json:"commonName"`
		Cert       string `json:"cert"`
		Key        string `json:"key"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Cert) == "" || strings.TrimSpace(body.Key) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效：需要 cert 与 key"})
		return
	}
	_, client, ok := qiniuCloudAccountFromQueryDNS(c, app)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	if err := client.UploadSSLCert(ctx, body.Name, body.CommonName, body.Cert, body.Key); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, fmt.Sprintf("七牛云 SSL：已上传证书 name=%s commonName=%s", body.Name, body.CommonName))
	c.JSON(http.StatusOK, gin.H{"message": "已上传（CDN 域名可在域名 HTTPS 配置中绑定；对象存储绑定请到控制台）"})
}

func handleQiniuCloudSSLCertDelete(c *gin.Context, app *ServerApp) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少证书 ID"})
		return
	}
	_, client, ok := qiniuCloudAccountFromQueryDNS(c, app)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	if err := client.DeleteSSLCert(ctx, id); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, "七牛云 SSL：已删除证书 "+id)
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// ─── SSL 绑定 / 存储用量 ───

func handleQiniuCloudCDNBindCert(c *gin.Context, app *ServerApp) {
	var body struct {
		Domain     string `json:"domain"`
		CertID     int64  `json:"certId"`
		ForceHTTPS bool   `json:"forceHttps"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Domain) == "" || body.CertID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效：需要 domain 与 certId"})
		return
	}
	_, client, ok := qiniuCloudAccountFromQueryDNS(c, app)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	if err := client.BindCDNCertHTTPS(ctx, strings.TrimSpace(body.Domain), body.CertID, body.ForceHTTPS); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, fmt.Sprintf("七牛云 CDN：域名 %s 已绑定证书 %d（forceHttps=%v）", body.Domain, body.CertID, body.ForceHTTPS))
	c.JSON(http.StatusOK, gin.H{"message": "证书绑定已提交，CDN 配置生效约需几分钟"})
}

func handleQiniuCloudKodoUsage(c *gin.Context, app *ServerApp) {
	bucket := strings.TrimSpace(c.Query("bucket"))
	if bucket == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 bucket 参数"})
		return
	}
	days, _ := strconv.Atoi(c.Query("days"))
	_, client, ok := qiniuCloudAccountFromQueryDNS(c, app)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	points, err := client.GetBucketSpaceUsage(ctx, bucket, days)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"bucket": bucket, "days": days, "points": points})
}
