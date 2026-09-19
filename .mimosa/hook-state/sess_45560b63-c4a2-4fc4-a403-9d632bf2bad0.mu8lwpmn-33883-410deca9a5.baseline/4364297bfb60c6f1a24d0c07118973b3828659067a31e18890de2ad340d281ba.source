package internal

// 云厂商凭证引导对接：用户粘贴 API Key → 平台自动验证 → 自动发现可用服务和资源。
// 每家厂商提供操作指引链接和具体的密钥创建步骤。

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type vendorGuide struct {
	Vendor    string   `json:"vendor"`
	Name      string   `json:"name"`
	Steps     []string `json:"steps"`
	KeyPage   string   `json:"keyPage"`
	DocsPage  string   `json:"docsPage"`
	EnvFields []string `json:"envFields"`
}

var vendorGuides = map[string]vendorGuide{
	"tencent": {
		Vendor: "tencent", Name: "腾讯云",
		Steps:     []string{"登录 console.cloud.tencent.com", "右上角头像 → 访问管理 → API 密钥管理", "点击「新建密钥」，保存 SecretId 和 SecretKey", "确认密钥已启用（状态 = Active）"},
		KeyPage:   "https://console.cloud.tencent.com/cam/capi",
		DocsPage:  "https://cloud.tencent.com/document/product/598/40488",
		EnvFields: []string{"secretId", "secretKey"},
	},
	"qiniu": {
		Vendor: "qiniu", Name: "七牛云",
		Steps:     []string{"登录 portal.qiniu.com", "右上角头像 → 个人中心 → 密钥管理", "复制 AK 和 SK"},
		KeyPage:   "https://portal.qiniu.com/user/key",
		DocsPage:  "https://developer.qiniu.com/kodo/manual/1208/access-key",
		EnvFields: []string{"accessKey", "secretKey"},
	},
	"upyun": {
		Vendor: "upyun", Name: "又拍云",
		Steps:     []string{"登录 console.upyun.com", "选择已有服务（或创建）", "操作员 → 创建操作员（赋予 API 权限）", "保存操作员名和密码"},
		KeyPage:   "https://console.upyun.com/accounts/operators/",
		DocsPage:  "https://help.upyun.com/knowledge-base/object_storage_authorization/",
		EnvFields: []string{"serviceName", "operator", "password"},
	},
}

type aiDiscoveredSvc struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Detail string `json:"detail,omitempty"`
	Count  int    `json:"count,omitempty"`
}

func svcOk(name string, count int) aiDiscoveredSvc {
	return aiDiscoveredSvc{Name: name, Status: "ok", Count: count}
}
func svcErr(name string, err error) aiDiscoveredSvc {
	return aiDiscoveredSvc{Name: name, Status: "error", Detail: err.Error()}
}

// handleVendorGuideList 返回所有厂商的接入指引。
func handleVendorGuideList(c *gin.Context) {
	keys := []string{"tencent", "qiniu", "upyun"}
	out := make([]vendorGuide, 0, len(keys))
	for _, k := range keys {
		if g, ok := vendorGuides[k]; ok {
			out = append(out, g)
		}
	}
	c.JSON(http.StatusOK, gin.H{"guides": out})
}

// handleVendorDiscoverServices 验证凭证后自动发现可用服务和资源。
func handleVendorDiscoverServices(c *gin.Context, app *ServerApp) {
	var body struct {
		Vendor string            `json:"vendor"`
		Creds  map[string]string `json:"creds"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Vendor == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效：需要 vendor"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	var services []aiDiscoveredSvc
	vendor := strings.ToLower(strings.TrimSpace(body.Vendor))

	switch vendor {
	case "tencent":
		ak, sk := body.Creds["secretId"], body.Creds["secretKey"]
		if ak == "" || sk == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "需要 secretId 和 secretKey"})
			return
		}
		client := newTencentCloudClient(ak, sk)
		appID, err := client.GetUserAppId(ctx)
		if err != nil {
			services = append(services, aiDiscoveredSvc{Name: "CAM 账号", Status: "error", Detail: err.Error()})
		} else {
			services = append(services, aiDiscoveredSvc{Name: "CAM 账号", Status: "ok", Detail: "APPID: " + appID})
		}
		keys, err := client.ListCAMAccessKeys(ctx)
		if err != nil {
			services = append(services, aiDiscoveredSvc{Name: "CAM 密钥", Status: "error", Detail: err.Error()})
		} else {
			services = append(services, svcOk("CAM 密钥", len(keys)))
		}
		lh, err := client.ListLighthouseInstances(ctx)
		if err != nil {
			services = append(services, aiDiscoveredSvc{Name: "轻量云服务器", Status: "error", Detail: err.Error()})
		} else {
			services = append(services, svcOk("轻量云服务器", len(lh)))
		}
		cvm, err := client.ListCVMInstances(ctx)
		if err != nil {
			services = append(services, aiDiscoveredSvc{Name: "CVM 云服务器", Status: "error", Detail: err.Error()})
		} else {
			services = append(services, svcOk("CVM 云服务器", len(cvm)))
		}
		cdn, err := client.ListCDNDomains(ctx)
		if err != nil {
			services = append(services, aiDiscoveredSvc{Name: "CDN 域名", Status: "error", Detail: err.Error()})
		} else {
			services = append(services, svcOk("CDN 域名", len(cdn)))
		}
		certs, _, err := client.ListSSLCertificates(ctx)
		if err != nil {
			services = append(services, aiDiscoveredSvc{Name: "SSL 证书", Status: "error", Detail: err.Error()})
		} else {
			services = append(services, svcOk("SSL 证书", len(certs)))
		}

	case "qiniu":
		client := newQiniuCloudClient(body.Creds["accessKey"], body.Creds["secretKey"])
		if err := client.VerifyCredentials(ctx); err != nil {
			services = append(services, aiDiscoveredSvc{Name: "凭证验证", Status: "error", Detail: err.Error()})
		} else {
			services = append(services, aiDiscoveredSvc{Name: "凭证验证", Status: "ok"})
		}
		buckets, err := client.ListBuckets(ctx)
		if err != nil {
			services = append(services, aiDiscoveredSvc{Name: "Kodo 存储桶", Status: "error", Detail: err.Error()})
		} else {
			services = append(services, svcOk("Kodo 存储桶", len(buckets)))
		}
		domains, err := client.ListCDNDomains(ctx)
		if err != nil {
			services = append(services, aiDiscoveredSvc{Name: "CDN 域名", Status: "error", Detail: err.Error()})
		} else {
			services = append(services, svcOk("CDN 域名", len(domains)))
		}
		certs, err := client.ListSSLCerts(ctx)
		if err != nil {
			services = append(services, aiDiscoveredSvc{Name: "SSL 证书", Status: "error", Detail: err.Error()})
		} else {
			services = append(services, svcOk("SSL 证书", len(certs)))
		}

	case "upyun":
		client := newUpyunCloudClient(body.Creds["serviceName"], body.Creds["operator"], body.Creds["password"])
		if err := client.VerifyCredentials(ctx); err != nil {
			services = append(services, aiDiscoveredSvc{Name: "凭证验证", Status: "error", Detail: err.Error()})
		} else {
			services = append(services, aiDiscoveredSvc{Name: "凭证验证", Status: "ok"})
		}
		info, err := client.GetServiceInfo(ctx)
		if err != nil {
			services = append(services, aiDiscoveredSvc{Name: "USS 服务", Status: "error", Detail: err.Error()})
		} else if info != nil {
			svc := aiDiscoveredSvc{Name: "USS 服务", Status: "ok", Detail: fmt.Sprintf("已用 %d MB", info.UsageBytes/(1024*1024))}
			services = append(services, svc)
		}

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的厂商: " + vendor})
		return
	}

	c.JSON(http.StatusOK, gin.H{"vendor": vendor, "services": services})
}
