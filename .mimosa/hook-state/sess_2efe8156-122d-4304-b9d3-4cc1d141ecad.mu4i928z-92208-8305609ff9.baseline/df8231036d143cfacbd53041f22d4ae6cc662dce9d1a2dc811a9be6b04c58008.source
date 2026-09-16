package internal

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// ─── TC3 通用客户端 ───

type tencentCloudClient struct {
	secretID  string
	secretKey string
}

func newTencentCloudClient(secretID, secretKey string) *tencentCloudClient {
	return &tencentCloudClient{secretID: secretID, secretKey: secretKey}
}

func (c *tencentCloudClient) tcRequest(ctx context.Context, service, host, version, action string, payload interface{}) ([]byte, error) {
	bodyBytes, _ := json.Marshal(payload)
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	date := time.Now().UTC().Format("2006-01-02")
	algorithm := "TC3-HMAC-SHA256"

	hashedPayload := sha256Hex(bodyBytes)
	canonicalRequest := "POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:" + host + "\n\ncontent-type;host\n" + hashedPayload

	credentialScope := date + "/" + service + "/tc3_request"
	hashedCR := sha256Hex([]byte(canonicalRequest))
	stringToSign := algorithm + "\n" + timestamp + "\n" + credentialScope + "\n" + hashedCR

	secretDate := hmacSHA256Raw([]byte("TC3"+c.secretKey), []byte(date))
	secretService := hmacSHA256Raw(secretDate, []byte(service))
	secretSigning := hmacSHA256Raw(secretService, []byte("tc3_request"))
	signature := hexEncode(hmacSHA256Raw(secretSigning, []byte(stringToSign)))

	authorization := fmt.Sprintf(
		"%s Credential=%s/%s, SignedHeaders=content-type;host, Signature=%s",
		algorithm, c.secretID, credentialScope, signature)

	req, err := http.NewRequestWithContext(ctx, "POST", "https://"+host, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("Host", host)
	req.Header.Set("X-TC-Action", action)
	req.Header.Set("X-TC-Timestamp", timestamp)
	req.Header.Set("X-TC-Version", version)
	req.Header.Set("X-TC-Region", "ap-guangzhou")
	req.Header.Set("Authorization", authorization)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	var errCheck struct {
		Response struct {
			Error *struct{ Code, Message string } `json:"Error"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(data, &errCheck); err == nil && errCheck.Response.Error != nil {
		return nil, fmt.Errorf("tencent API error %s: %s", errCheck.Response.Error.Code, errCheck.Response.Error.Message)
	}
	return data, nil
}

func hexEncode(b []byte) string {
	out := make([]byte, len(b)*2)
	for i, v := range b {
		out[i*2] = "0123456789abcdef"[v>>4]
		out[i*2+1] = "0123456789abcdef"[v&0x0f]
	}
	return string(out)
}

// ─── Lighthouse 轻量云 ───

// LighthouseInstance 轻量云实例
type LighthouseInstance struct {
	InstanceID    string   `json:"InstanceId"`
	InstanceName  string   `json:"InstanceName"`
	PublicIP      []string `json:"PublicAddresses,omitempty"`
	PrivateIP     []string `json:"PrivateAddresses,omitempty"`
	Zone          string   `json:"Zone"`
	OSName        string   `json:"OsName"`
	CPU           int64    `json:"CPU"`
	Memory        int64    `json:"Memory"`
	InstanceState string   `json:"InstanceState"`
	CreatedTime   string   `json:"CreatedTime"`
	ExpiredTime   string   `json:"ExpiredTime"`
}

func (c *tencentCloudClient) ListLighthouseInstances(ctx context.Context) ([]LighthouseInstance, error) {
	data, err := c.tcRequest(ctx, "lighthouse", "lighthouse.tencentcloudapi.com", "2020-03-24", "DescribeInstances", map[string]interface{}{"Limit": 100})
	if err != nil {
		return nil, err
	}
	var resp struct {
		Response struct {
			InstanceSet []LighthouseInstance `json:"InstanceSet"`
			TotalCount  int                  `json:"TotalCount"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return resp.Response.InstanceSet, nil
}

// ─── CDN ───

// CDNMetricData CDN指标数据
type CDNMetricData struct {
	Metric string `json:"Metric"`
	Detail []struct {
		Time  string  `json:"Time"`
		Value float64 `json:"Value"`
	} `json:"Detail"`
}

func toISOTime(t string) string {
	// 将前端传过来的 "2026-06-06 20:14:00" 转换为腾讯云要求的 ISO 8601 格式
	if strings.Contains(t, "T") {
		return t
	}
	t = strings.Replace(t, " ", "T", 1)
	if !strings.Contains(t, "+") && !strings.HasSuffix(t, "Z") {
		t = t + "+08:00"
	}
	return t
}

func alignCDNTime(t string, interval int) string {
	// 腾讯云 CDN 要求 StartTime/EndTime 必须与 Interval 对齐
	layout := "2006-01-02 15:04:05"
	tm, err := time.Parse(layout, t)
	if err != nil {
		return t
	}
	switch interval {
	case 300:
		// 对齐到 5 分钟边界
		m := (tm.Minute() / 5) * 5
		tm = time.Date(tm.Year(), tm.Month(), tm.Day(), tm.Hour(), m, 0, 0, tm.Location())
	case 3600:
		// 对齐到小时边界
		tm = time.Date(tm.Year(), tm.Month(), tm.Day(), tm.Hour(), 0, 0, 0, tm.Location())
	case 86400:
		// 对齐到天边界
		tm = time.Date(tm.Year(), tm.Month(), tm.Day(), 0, 0, 0, 0, tm.Location())
	}
	return tm.Format(layout)
}

func (c *tencentCloudClient) GetCDNMetrics(ctx context.Context, startTime, endTime, domain string) (map[string]interface{}, error) {
	// 腾讯云 CDN DescribeCdnData 要求时间格式为 "YYYY-MM-DD HH:mm:ss"
	start := strings.Replace(startTime, "T", " ", 1)
	if idx := strings.Index(start, "+"); idx > 0 {
		start = start[:idx]
	}
	end := strings.Replace(endTime, "T", " ", 1)
	if idx := strings.Index(end, "+"); idx > 0 {
		end = end[:idx]
	}
	// 对齐到 5 分钟边界
	start = alignCDNTime(start, 300)
	end = alignCDNTime(end, 300)

	// 先尝试不传 Interval，让腾讯云自动选择
	payloadNoInterval := map[string]interface{}{
		"StartTime": start,
		"EndTime":   end,
		"Metric":    "flux",
	}
	if domain != "" {
		payloadNoInterval["Domains"] = []string{domain}
	}
	fmt.Printf("[CDN v5] no-interval payload=%+v\n", payloadNoInterval)
	data, err := c.tcRequest(ctx, "cdn", "cdn.tencentcloudapi.com", "2018-06-06", "DescribeCdnData", payloadNoInterval)
	if err != nil {
		fmt.Printf("[CDN v5] no-interval error: %v | raw=%s\n", err, string(data))
		// fallback: 尝试传 Interval="300"
		payloadWithInterval := map[string]interface{}{
			"StartTime": start,
			"EndTime":   end,
			"Metric":    "flux",
			"Interval":  "300",
		}
		if domain != "" {
			payloadWithInterval["Domains"] = []string{domain}
		}
		fmt.Printf("[CDN v5] with-interval payload=%+v\n", payloadWithInterval)
		data, err = c.tcRequest(ctx, "cdn", "cdn.tencentcloudapi.com", "2018-06-06", "DescribeCdnData", payloadWithInterval)
		if err != nil {
			fmt.Printf("[CDN v5] with-interval error: %v | raw=%s\n", err, string(data))
			return nil, err
		}
	}
	fmt.Printf("[CDN v5] flux raw=%s\n", string(data))
	var resp struct {
		Response struct {
			Data []CDNMetricData `json:"Data"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}

	payload2 := map[string]interface{}{
		"StartTime": start,
		"EndTime":   end,
		"Metric":    "bandwidth",
	}
	if domain != "" {
		payload2["Domains"] = []string{domain}
	}
	data2, err := c.tcRequest(ctx, "cdn", "cdn.tencentcloudapi.com", "2018-06-06", "DescribeCdnData", payload2)
	fmt.Printf("[CDN v5] bandwidth raw=%s\n", string(data2))
	var bandwidth []CDNMetricData
	if err == nil {
		var resp2 struct {
			Response struct {
				Data []CDNMetricData `json:"Data"`
			} `json:"Response"`
		}
		_ = json.Unmarshal(data2, &resp2)
		bandwidth = resp2.Response.Data
	} else {
		fmt.Printf("[CDN v5] bandwidth error: %v\n", err)
	}

	return map[string]interface{}{
		"flux":      resp.Response.Data,
		"bandwidth": bandwidth,
	}, nil
}

// CDNDomain CDN域名
type CDNDomain struct {
	Domain      string `json:"Domain"`
	Status      string `json:"Status"`
	Cname       string `json:"Cname"`
	Area        string `json:"Area"`
	ServiceType string `json:"ServiceType"`
}

func (c *tencentCloudClient) ListCDNDomains(ctx context.Context) ([]CDNDomain, error) {
	data, err := c.tcRequest(ctx, "cdn", "cdn.tencentcloudapi.com", "2018-06-06", "DescribeDomainsConfig", map[string]interface{}{"Limit": 100})
	if err != nil {
		return nil, err
	}
	var resp struct {
		Response struct {
			Domains []struct {
				Domain      string `json:"Domain"`
				Status      string `json:"Status"`
				Cname       string `json:"Cname"`
				Area        string `json:"Area"`
				ServiceType string `json:"ServiceType"`
			} `json:"Domains"`
			TotalNumber int `json:"TotalNumber"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	var result []CDNDomain
	for _, d := range resp.Response.Domains {
		result = append(result, CDNDomain{
			Domain:      d.Domain,
			Status:      d.Status,
			Cname:       d.Cname,
			Area:        d.Area,
			ServiceType: d.ServiceType,
		})
	}
	return result, nil
}

// ─── COS ───

// COSBucket 存储桶
type COSBucket struct {
	Name       string `xml:"Name"`
	Location   string `xml:"Location"`
	CreateTime string `xml:"CreationDate"`
}

// COSListBucketsResult 存储桶列表
type COSListBucketsResult struct {
	XMLName xml.Name    `xml:"ListAllMyBucketsResult"`
	Buckets []COSBucket `xml:"Buckets>Bucket"`
}

// COSObject 对象
type COSObject struct {
	Key          string `xml:"Key"`
	LastModified string `xml:"LastModified"`
	Size         int64  `xml:"Size"`
	ETag         string `xml:"ETag"`
}

// COSListResult 对象列表
type COSListResult struct {
	XMLName               xml.Name    `xml:"ListBucketResult"`
	Name                  string      `xml:"Name"`
	Prefix                string      `xml:"Prefix"`
	MaxKeys               int         `xml:"MaxKeys"`
	IsTruncated           bool        `xml:"IsTruncated"`
	NextContinuationToken string      `xml:"NextContinuationToken"`
	Contents              []COSObject `xml:"Contents"`
}

func (c *tencentCloudClient) COSListBuckets(ctx context.Context) (*COSListBucketsResult, error) {
	host := "service.cos.myqcloud.com"
	canonicalURI := "/"
	amzNow := time.Now().UTC()
	amzDate := amzNow.Format("20060102T150405Z")
	dateStamp := amzNow.Format("20060102")
	payloadHash := sha256Hex(nil)

	canonicalHeaders := fmt.Sprintf("host:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n", host, payloadHash, amzDate)
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalRequest := fmt.Sprintf("GET\n%s\n\n%s\n%s\n%s", canonicalURI, canonicalHeaders, signedHeaders, payloadHash)

	credentialScope := fmt.Sprintf("%s/%s/cos/aws4_request", dateStamp, "ap-guangzhou")
	stringToSign := fmt.Sprintf("AWS4-HMAC-SHA256\n%s\n%s\n%s", amzDate, credentialScope, sha256Hex([]byte(canonicalRequest)))

	sig := cosSigV4Sign(c.secretKey, dateStamp, "ap-guangzhou", "cos", stringToSign)
	auth := fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s", c.secretID, credentialScope, signedHeaders, sig)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://"+host+canonicalURI, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Host", host)
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	req.Header.Set("Authorization", auth)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("COS ListBuckets %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var result COSListBucketsResult
	if err := xml.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *tencentCloudClient) COSListObjects(ctx context.Context, bucketHost, region, prefix, continuationToken string, maxKeys int) (*COSListResult, error) {
	if maxKeys <= 0 || maxKeys > 1000 {
		maxKeys = 1000
	}
	q := url.Values{}
	q.Set("list-type", "2")
	if prefix != "" {
		q.Set("prefix", prefix)
	}
	if continuationToken != "" {
		q.Set("continuation-token", continuationToken)
	}
	q.Set("max-keys", strconv.Itoa(maxKeys))
	canonicalURI := "/"
	canonicalQueryString := q.Encode()

	amzNow := time.Now().UTC()
	amzDate := amzNow.Format("20060102T150405Z")
	dateStamp := amzNow.Format("20060102")
	payloadHash := sha256Hex(nil)

	canonicalHeaders := fmt.Sprintf("host:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n", bucketHost, payloadHash, amzDate)
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalRequest := fmt.Sprintf("GET\n%s\n%s\n%s\n%s\n%s", canonicalURI, canonicalQueryString, canonicalHeaders, signedHeaders, payloadHash)

	credentialScope := fmt.Sprintf("%s/%s/cos/aws4_request", dateStamp, region)
	stringToSign := fmt.Sprintf("AWS4-HMAC-SHA256\n%s\n%s\n%s", amzDate, credentialScope, sha256Hex([]byte(canonicalRequest)))

	sig := cosSigV4Sign(c.secretKey, dateStamp, region, "cos", stringToSign)
	auth := fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s", c.secretID, credentialScope, signedHeaders, sig)

	u := &url.URL{Scheme: "https", Host: bucketHost, Path: canonicalURI, RawQuery: canonicalQueryString}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Host", bucketHost)
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	req.Header.Set("Authorization", auth)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("COS LIST %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	var result COSListResult
	if err := xml.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *tencentCloudClient) COSGetObject(ctx context.Context, bucketHost, region, objectKey string) ([]byte, error) {
	objectKey = strings.Trim(strings.TrimSpace(objectKey), "/")
	canonicalURI := "/" + cosEncodeObjectKey(objectKey)

	amzNow := time.Now().UTC()
	amzDate := amzNow.Format("20060102T150405Z")
	dateStamp := amzNow.Format("20060102")
	payloadHash := sha256Hex(nil)

	canonicalHeaders := fmt.Sprintf("host:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n", bucketHost, payloadHash, amzDate)
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalRequest := fmt.Sprintf("GET\n%s\n\n%s\n%s\n%s", canonicalURI, canonicalHeaders, signedHeaders, payloadHash)

	credentialScope := fmt.Sprintf("%s/%s/cos/aws4_request", dateStamp, region)
	stringToSign := fmt.Sprintf("AWS4-HMAC-SHA256\n%s\n%s\n%s", amzDate, credentialScope, sha256Hex([]byte(canonicalRequest)))

	sig := cosSigV4Sign(c.secretKey, dateStamp, region, "cos", stringToSign)
	auth := fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s", c.secretID, credentialScope, signedHeaders, sig)

	u := &url.URL{Scheme: "https", Host: bucketHost, Path: canonicalURI}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Host", bucketHost)
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	req.Header.Set("Authorization", auth)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("COS GET %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}
	return io.ReadAll(resp.Body)
}

func (c *tencentCloudClient) COSPresignedGetURL(bucketHost, region, objectKey string, expiry time.Duration) string {
	objectKey = strings.Trim(strings.TrimSpace(objectKey), "/")
	canonicalURI := "/" + cosEncodeObjectKey(objectKey)

	amzNow := time.Now().UTC()
	amzDate := amzNow.Format("20060102T150405Z")
	dateStamp := amzNow.Format("20060102")
	payloadHash := sha256Hex(nil)

	canonicalHeaders := fmt.Sprintf("host:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n", bucketHost, payloadHash, amzDate)
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalRequest := fmt.Sprintf("GET\n%s\n\n%s\n%s\n%s", canonicalURI, canonicalHeaders, signedHeaders, payloadHash)

	credentialScope := fmt.Sprintf("%s/%s/cos/aws4_request", dateStamp, region)
	stringToSign := fmt.Sprintf("AWS4-HMAC-SHA256\n%s\n%s\n%s", amzDate, credentialScope, sha256Hex([]byte(canonicalRequest)))

	sig := cosSigV4Sign(c.secretKey, dateStamp, region, "cos", stringToSign)

	u := &url.URL{
		Scheme: "https",
		Host:   bucketHost,
		Path:   canonicalURI,
		RawQuery: url.Values{
			"X-Amz-Algorithm":     []string{"AWS4-HMAC-SHA256"},
			"X-Amz-Credential":    []string{fmt.Sprintf("%s/%s", c.secretID, credentialScope)},
			"X-Amz-Date":          []string{amzDate},
			"X-Amz-Expires":       []string{strconv.Itoa(int(expiry.Seconds()))},
			"X-Amz-SignedHeaders": []string{signedHeaders},
			"X-Amz-Signature":     []string{sig},
		}.Encode(),
	}
	return u.String()
}

// COSPutObject 上传对象（复用现有 sigv4 逻辑，新增包装便于使用）
func (c *tencentCloudClient) COSPutObject(bucketHost, region, objectKey string, body []byte, contentType string) error {
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return cosSigV4PutObject(bucketHost, region, c.secretID, c.secretKey, objectKey, body, contentType)
}

// COSDeleteObject 删除对象
func (c *tencentCloudClient) COSDeleteObject(bucketHost, region, objectKey string) error {
	return cosSigV4DeleteObject(bucketHost, region, c.secretID, c.secretKey, objectKey)
}

// ─── CVM 云服务器 ───

// CVMInstance 云服务器实例
type CVMInstance struct {
	InstanceID    string   `json:"InstanceId"`
	InstanceName  string   `json:"InstanceName"`
	InstanceType  string   `json:"InstanceType"`
	InstanceState string   `json:"InstanceState"`
	CPU           int64    `json:"CPU"`
	Memory        int64    `json:"Memory"`
	PublicIP      []string `json:"PublicIpAddresses,omitempty"`
	PrivateIP     []string `json:"PrivateIpAddresses,omitempty"`
	Zone          string   `json:"Zone"`
	ImageName     string   `json:"ImageName"`
	CreatedTime   string   `json:"CreatedTime"`
	ExpiredTime   string   `json:"ExpiredTime"`
	VPCID         string   `json:"VpcId"`
	SubnetID      string   `json:"SubnetId"`
}

func (i *CVMInstance) UnmarshalJSON(data []byte) error {
	type alias CVMInstance
	var wire struct {
		*alias
		Placement *struct {
			Zone string `json:"Zone"`
		} `json:"Placement"`
		VirtualPrivateCloud *struct {
			VPCID    string `json:"VpcId"`
			SubnetID string `json:"SubnetId"`
		} `json:"VirtualPrivateCloud"`
	}
	wire.alias = (*alias)(i)
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	if wire.Placement != nil {
		i.Zone = wire.Placement.Zone
	}
	if wire.VirtualPrivateCloud != nil {
		i.VPCID = wire.VirtualPrivateCloud.VPCID
		i.SubnetID = wire.VirtualPrivateCloud.SubnetID
	}
	return nil
}

func (c *tencentCloudClient) ListCVMInstances(ctx context.Context) ([]CVMInstance, error) {
	data, err := c.tcRequest(ctx, "cvm", "cvm.tencentcloudapi.com", "2017-03-12", "DescribeInstances", map[string]interface{}{"Limit": 100, "Offset": 0})
	if err != nil {
		return nil, err
	}
	var resp struct {
		Response struct {
			InstanceSet []CVMInstance `json:"InstanceSet"`
			TotalCount  int           `json:"TotalCount"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return resp.Response.InstanceSet, nil
}

// ─── CAM 访问密钥 ───

// CAMAccessKey 访问密钥
type CAMAccessKey struct {
	AccessKeyID string `json:"AccessKeyId"`
	CreateTime  string `json:"CreateTime"`
	Status      string `json:"Status"` // Active / Inactive
}

func (c *tencentCloudClient) ListCAMAccessKeys(ctx context.Context) ([]CAMAccessKey, error) {
	data, err := c.tcRequest(ctx, "cam", "cam.tencentcloudapi.com", "2019-01-16", "ListAccessKeys", map[string]interface{}{})
	if err != nil {
		return nil, err
	}
	var resp struct {
		Response struct {
			AccessKeys []CAMAccessKey `json:"AccessKeys"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return resp.Response.AccessKeys, nil
}

// GetUserAppId 获取当前账号 APPID (UIN)
func (c *tencentCloudClient) GetUserAppId(ctx context.Context) (string, error) {
	data, err := c.tcRequest(ctx, "sts", "sts.tencentcloudapi.com", "2018-08-13", "GetCallerIdentity", map[string]interface{}{})
	if err != nil {
		return "", err
	}
	var resp struct {
		Response struct {
			Uin     string `json:"Uin"`
			AppID   string `json:"AppId"`
			Account string `json:"Account"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return "", err
	}
	if resp.Response.AppID != "" {
		return resp.Response.AppID, nil
	}
	return resp.Response.Uin, nil
}

// ─── SSL 证书（ssl 2019-12-05）───

// SSLCertificate SSL 证书条目
type SSLCertificate struct {
	CertID        string   `json:"CertificateId"`
	Alias         string   `json:"Alias"`
	CertType      string   `json:"CertificateType"` // CA=上传 SVR=域名型
	ProductZhName string   `json:"ProductZhName"`
	Domain        string   `json:"Domain"`
	AltDomains    []string `json:"SubjectAltName"`
	Status        int      `json:"Status"` // 1已颁发 0审核中 2审核失败 3已过期 4已添加DNS 5吊销中 6已吊销 7已重颁发
	NotBefore     string   `json:"CertBeginTime"`
	NotAfter      string   `json:"CertEndTime"`
	InsertTime    string   `json:"InsertTime"`
	Deployed      string   `json:"IsDeployed"`
}

// ListSSLCertificates 列出 SSL 证书
func (c *tencentCloudClient) ListSSLCertificates(ctx context.Context) ([]SSLCertificate, int64, error) {
	data, err := c.tcRequest(ctx, "ssl", "ssl.tencentcloudapi.com", "2019-12-05", "DescribeCertificates", map[string]interface{}{"Limit": 100, "Offset": 0})
	if err != nil {
		return nil, 0, err
	}
	var resp struct {
		Response struct {
			Certificates []SSLCertificate `json:"Certificates"`
			TotalCount   int64            `json:"TotalCount"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, 0, err
	}
	return resp.Response.Certificates, resp.Response.TotalCount, nil
}

// DescribeSSLCertificateDetail 证书详情（含 DV 验证信息）
func (c *tencentCloudClient) DescribeSSLCertificateDetail(ctx context.Context, certID string) (map[string]any, error) {
	data, err := c.tcRequest(ctx, "ssl", "ssl.tencentcloudapi.com", "2019-12-05", "DescribeCertificateDetail", map[string]interface{}{"CertificateId": certID})
	if err != nil {
		return nil, err
	}
	var resp struct {
		Response map[string]any `json:"Response"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return resp.Response, nil
}

// ApplySSLCertificate 申请免费 DV 证书（TrustAsia DV；dvAuthMethod: DNS_AUTO|DNS|FILE）
func (c *tencentCloudClient) ApplySSLCertificate(ctx context.Context, domain, dvAuthMethod, alias string) (string, error) {
	payload := map[string]interface{}{
		"DomainName":   domain,
		"DvAuthMethod": dvAuthMethod,
		"PackageType":  "2", // TrustAsia DV 免费版
	}
	if alias != "" {
		payload["Alias"] = alias
	}
	data, err := c.tcRequest(ctx, "ssl", "ssl.tencentcloudapi.com", "2019-12-05", "ApplyCertificate", payload)
	if err != nil {
		return "", err
	}
	var resp struct {
		Response struct {
			CertificateID string `json:"CertificateId"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return "", err
	}
	return resp.Response.CertificateID, nil
}

// CancelSSLCertificate 取消审核中的证书申请
func (c *tencentCloudClient) CancelSSLCertificate(ctx context.Context, certID string) error {
	_, err := c.tcRequest(ctx, "ssl", "ssl.tencentcloudapi.com", "2019-12-05", "CancelCertificate", map[string]interface{}{"CertificateId": certID})
	return err
}

// DeleteSSLCertificate 删除证书
func (c *tencentCloudClient) DeleteSSLCertificate(ctx context.Context, certID string) error {
	_, err := c.tcRequest(ctx, "ssl", "ssl.tencentcloudapi.com", "2019-12-05", "DeleteCertificate", map[string]interface{}{"CertificateIds": []string{certID}})
	return err
}

// UploadSSLCertificate 上传自有证书
func (c *tencentCloudClient) UploadSSLCertificate(ctx context.Context, alias, publicKey, privateKey string) (string, error) {
	data, err := c.tcRequest(ctx, "ssl", "ssl.tencentcloudapi.com", "2019-12-05", "UploadCertificate", map[string]interface{}{
		"Alias":                 alias,
		"CertificatePublicKey":  publicKey,
		"CertificatePrivateKey": privateKey,
	})
	if err != nil {
		return "", err
	}
	var resp struct {
		Response struct {
			CertificateID string `json:"CertificateId"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return "", err
	}
	return resp.Response.CertificateID, nil
}

// ─── CVM / Lighthouse 实例生命周期 ───

// CVMInstancesAction 对 CVM 实例批量执行 start/stop/reboot
func (c *tencentCloudClient) CVMInstancesAction(ctx context.Context, action string, instanceIDs []string) error {
	actions := map[string]struct {
		action string
		extra  map[string]interface{}
	}{
		"start":  {"StartInstances", nil},
		"stop":   {"StopInstances", map[string]interface{}{"StopType": "SOFT"}},
		"reboot": {"RebootInstances", nil},
	}
	spec, ok := actions[action]
	if !ok {
		return fmt.Errorf("不支持的操作: %s", action)
	}
	payload := map[string]interface{}{"InstanceIds": instanceIDs}
	for k, v := range spec.extra {
		payload[k] = v
	}
	_, err := c.tcRequest(ctx, "cvm", "cvm.tencentcloudapi.com", "2017-03-12", spec.action, payload)
	return err
}

// ─── CVM 监控 / 账单 / SSL 部署 ───

// GetCVMInstanceMonitor 拉取 CVM 监控指标（QCE/CVM，GetMonitorData）
func (c *tencentCloudClient) GetCVMInstanceMonitor(ctx context.Context, region, instanceID, metricName string, period int, start, end time.Time) ([][2]any, error) {
	if region == "" {
		region = "ap-guangzhou"
	}
	payload := map[string]interface{}{
		"Namespace":  "QCE/CVM",
		"MetricName": metricName,
		"Period":     period,
		"StartTime":  start.UTC().Format("2006-01-02T15:04:05Z"),
		"EndTime":    end.UTC().Format("2006-01-02T15:04:05Z"),
		"Instances": []map[string]any{
			{"Dimensions": []map[string]any{{"Name": "InstanceId", "Value": instanceID}}},
		},
	}
	data, err := c.tcRequest(ctx, "monitor", "monitor.tencentcloudapi.com", "2018-07-24", "GetMonitorData", payload)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Response struct {
			DataPoints []struct {
				Dimensions map[string]any `json:"Dimensions"`
				Timestamps []int64        `json:"Timestamps"`
				Values     []float64      `json:"Values"`
			} `json:"DataPoints"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	var out [][2]any
	for _, dp := range resp.Response.DataPoints {
		for i, ts := range dp.Timestamps {
			if i < len(dp.Values) {
				out = append(out, [2]any{ts, dp.Values[i]})
			}
		}
	}
	return out, nil
}

// GetAccountBalance 账户余额（billing 2018-07-09；金额单位为分）
func (c *tencentCloudClient) GetAccountBalance(ctx context.Context) (map[string]any, error) {
	data, err := c.tcRequest(ctx, "billing", "billing.tencentcloudapi.com", "2018-07-09", "DescribeAccountBalance", map[string]interface{}{})
	if err != nil {
		return nil, err
	}
	var resp struct {
		Response map[string]any `json:"Response"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return resp.Response, nil
}

// GetBillSummaryByProduct 按产品汇总月度账单（Month 形如 2026-09；金额单位为分）
func (c *tencentCloudClient) GetBillSummaryByProduct(ctx context.Context, month string) (map[string]any, error) {
	// 该接口不支持跨月区间：仅允许查询本月或上月，超出则自动收敛
	monthStart, err := time.Parse("2006-01", month)
	if err != nil {
		return nil, fmt.Errorf("month 格式应为 2006-01")
	}
	thisMonth := time.Now().Format("2006-01")
	if month != thisMonth && month != time.Now().AddDate(0, -1, 0).Format("2006-01") {
		month = time.Now().Format("2006-01")
	}
	_ = monthStart
	payload := map[string]interface{}{
		"BeginTime": month + "-01T00:00:00Z",
		"EndTime":   time.Now().UTC().Format("2006-01-02T15:04:05Z"),
	}
	data, err := c.tcRequest(ctx, "billing", "billing.tencentcloudapi.com", "2018-07-09", "DescribeBillSummaryByProduct", payload)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Response map[string]any `json:"Response"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return resp.Response, nil
}

// DescribeSSLDeployedResources 查询证书当前部署到的云资源（CLB/CDN 等）
func (c *tencentCloudClient) DescribeSSLDeployedResources(ctx context.Context, certID string) (map[string]any, error) {
	data, err := c.tcRequest(ctx, "ssl", "ssl.tencentcloudapi.com", "2019-12-05", "DescribeDeployedResources", map[string]interface{}{"CertificateIds": []string{certID}})
	if err != nil {
		return nil, err
	}
	var resp struct {
		Response map[string]any `json:"Response"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, err
	}
	return resp.Response, nil
}

// DeploySSLCertificateInstance 将证书部署到指定云资源（product: clb|cdn 等；cdn 的 ResourceId 为域名）
func (c *tencentCloudClient) DeploySSLCertificateInstance(ctx context.Context, certID, product, region string, resourceIDs []string) error {
	rr := make([]map[string]any, 0, 1)
	rr = append(rr, map[string]any{"ResourceIds": resourceIDs, "Region": region})
	payload := map[string]interface{}{
		"CertificateId":      certID,
		"ResourceIdsRegions": rr,
		"Status":             1,
	}
	_, err := c.tcRequest(ctx, "ssl", "ssl.tencentcloudapi.com", "2019-12-05", "DeployCertificateInstance", payload)
	return err
}

// LighthouseInstancesAction 对轻量云实例批量执行 start/stop/reboot
func (c *tencentCloudClient) LighthouseInstancesAction(ctx context.Context, action string, instanceIDs []string) error {
	actions := map[string]string{"start": "StartInstances", "stop": "StopInstances", "reboot": "RebootInstances"}
	act, ok := actions[action]
	if !ok {
		return fmt.Errorf("不支持的操作: %s", action)
	}
	_, err := c.tcRequest(ctx, "lighthouse", "lighthouse.tencentcloudapi.com", "2020-03-23", act, map[string]interface{}{"InstanceIds": instanceIDs})
	return err
}
