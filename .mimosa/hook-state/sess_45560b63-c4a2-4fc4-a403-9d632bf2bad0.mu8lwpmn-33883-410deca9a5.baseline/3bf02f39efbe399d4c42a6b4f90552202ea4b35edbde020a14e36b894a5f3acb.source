package internal

import (
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// ─── Qiniu 通用客户端 ───

type qiniuCloudClient struct {
	accessKey string
	secretKey string
}

func newQiniuCloudClient(accessKey, secretKey string) *qiniuCloudClient {
	return &qiniuCloudClient{accessKey: accessKey, secretKey: secretKey}
}

// qiniuSign 生成 Qiniu 管理凭证（新规则，含 Host 与 Content-Type）
// 官方规则：https://developer.qiniu.com/kodo/1201/access-token
func (c *qiniuCloudClient) qiniuSign(method, pathWithQuery, host, contentType string, body []byte) string {
	signData := strings.ToUpper(method) + " " + pathWithQuery
	if host != "" {
		signData += "\nHost: " + host
	}
	if contentType != "" && contentType != "application/x-www-form-urlencoded" {
		signData += "\nContent-Type: " + contentType
	}
	signData += "\n\n"
	if len(body) > 0 && contentType != "" && contentType != "application/octet-stream" {
		signData += string(body)
	}
	mac := hmac.New(sha1.New, []byte(c.secretKey))
	mac.Write([]byte(signData))
	sig := base64.URLEncoding.EncodeToString(mac.Sum(nil))
	return "Qiniu " + c.accessKey + ":" + sig
}

func (c *qiniuCloudClient) doJSON(ctx context.Context, method, endpoint string, query url.Values, body []byte) ([]byte, error) {
	u, err := url.Parse(endpoint)
	if err != nil {
		return nil, err
	}
	if query != nil {
		u.RawQuery = query.Encode()
	}
	var bodyReader io.Reader
	if body != nil {
		bodyReader = strings.NewReader(string(body))
	}
	req, err := http.NewRequestWithContext(ctx, method, u.String(), bodyReader)
	if err != nil {
		return nil, err
	}
	pathWithQuery := u.Path
	if u.RawQuery != "" {
		pathWithQuery += "?" + u.RawQuery
	}
	contentType := ""
	if body != nil {
		contentType = "application/json"
		req.Header.Set("Content-Type", contentType)
	}
	req.Header.Set("Authorization", c.qiniuSign(method, pathWithQuery, u.Host, contentType, body))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("qiniu API %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	return data, nil
}

// ─── 存储桶 (Kodo) ───

// QiniuBucket 七牛云存储桶
type QiniuBucket struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Region    string `json:"region"`
	Private   int    `json:"private"`
	CreatedAt string `json:"createdAt"`
	Domain    string `json:"domain"`
}

// ListBuckets 获取存储桶列表
func (c *qiniuCloudClient) ListBuckets(ctx context.Context) ([]QiniuBucket, error) {
	data, err := c.doJSON(ctx, http.MethodGet, "https://rs.qiniu.com/buckets", nil, nil)
	if err != nil {
		return nil, err
	}
	var names []string
	if err := json.Unmarshal(data, &names); err != nil {
		return nil, err
	}
	if len(names) == 0 {
		return []QiniuBucket{}, nil
	}

	// 获取各 bucket 信息
	qv := url.Values{}
	for _, n := range names {
		qv.Add("bucket", n)
	}
	infoBytes, err := c.doJSON(ctx, http.MethodGet, "https://uc.qiniu.com/v2/bucketInfos", qv, nil)
	var infos []struct {
		BucketID   string `json:"bucket_id"`
		Bucket     string `json:"bucket"`
		Region     string `json:"region"`
		Private    int    `json:"private"`
		CreateTime int64  `json:"ctime"`
		Domains    []struct {
			Domain string `json:"domain"`
		} `json:"domains"`
	}
	infoMap := make(map[string]struct {
		BucketID   string
		Region     string
		Private    int
		CreateTime int64
		Domain     string
	})
	if err == nil {
		_ = json.Unmarshal(infoBytes, &infos)
		for _, i := range infos {
			domain := ""
			if len(i.Domains) > 0 {
				domain = i.Domains[0].Domain
			}
			infoMap[i.Bucket] = struct {
				BucketID   string
				Region     string
				Private    int
				CreateTime int64
				Domain     string
			}{BucketID: i.BucketID, Region: i.Region, Private: i.Private, CreateTime: i.CreateTime, Domain: domain}
		}
	}

	out := make([]QiniuBucket, 0, len(names))
	for _, n := range names {
		b := QiniuBucket{Name: n}
		if info, ok := infoMap[n]; ok {
			b.ID = info.BucketID
			b.Region = info.Region
			b.Private = info.Private
			b.Domain = info.Domain
			if info.CreateTime > 0 {
				b.CreatedAt = time.Unix(info.CreateTime, 0).Format("2006-01-02 15:04:05")
			}
		}
		out = append(out, b)
	}
	return out, nil
}

// QiniuListResult rsf list 结果
type QiniuListResult struct {
	Marker         string        `json:"marker"`
	CommonPrefixes []string      `json:"commonPrefixes"`
	Items          []QiniuObject `json:"items"`
}

// QiniuObject 七牛云对象
type QiniuObject struct {
	Key      string `json:"key"`
	Hash     string `json:"hash"`
	FSize    int64  `json:"fsize"`
	PutTime  int64  `json:"putTime"`
	MimeType string `json:"mimeType"`
	Type     int    `json:"type"`
}

func (o QiniuObject) LastModified() string {
	if o.PutTime <= 0 {
		return ""
	}
	// putTime 是 100纳秒 为单位的时间戳
	ts := o.PutTime / 1e7
	return time.Unix(ts, 0).Format("2006-01-02 15:04:05")
}

// ListObjects 使用 rsf 接口列出存储桶中的文件
func (c *qiniuCloudClient) ListObjects(ctx context.Context, bucket, prefix, marker string, limit int) (*QiniuListResult, error) {
	if limit <= 0 || limit > 1000 {
		limit = 1000
	}
	qv := url.Values{}
	qv.Set("bucket", bucket)
	qv.Set("limit", strconv.Itoa(limit))
	if prefix != "" {
		qv.Set("prefix", prefix)
	}
	if marker != "" {
		qv.Set("marker", marker)
	}
	data, err := c.doJSON(ctx, http.MethodGet, "https://rsf.qiniu.com/list", qv, nil)
	if err != nil {
		return nil, err
	}
	var result QiniuListResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ─── CDN ───

// QiniuDomain 七牛 CDN 加速域名
type QiniuDomain struct {
	Name           string `json:"name"`
	Type           string `json:"type"`
	Status         string `json:"status"`
	CNAME          string `json:"cname"`
	Protocol       string `json:"protocol"`
	GeoCover       string `json:"geoCover"`
	CreateAt       string `json:"createAt"`
	ModifyAt       string `json:"modifyAt"`
	OperatingState string `json:"operatingState"`
	TestURLPath    string `json:"testURLPath"`
	QiniuPrivate   bool   `json:"qiniuPrivate"`
}

// ListCDNDomains 获取 CDN 域名列表
func (c *qiniuCloudClient) ListCDNDomains(ctx context.Context) ([]QiniuDomain, error) {
	data, err := c.doJSON(ctx, http.MethodGet, "https://api.qiniu.com/domain", nil, nil)
	if err != nil {
		return nil, err
	}
	var result struct {
		Domains []QiniuDomain `json:"domains"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	if result.Domains == nil {
		return []QiniuDomain{}, nil
	}
	return result.Domains, nil
}

// ─── SSL 证书 ───

// QiniuSSLCert SSL 证书条目
type QiniuSSLCert struct {
	CertID     string `json:"cert_id"`
	ID         string `json:"id"`
	Name       string `json:"name"`
	CommonName string `json:"common_name"`
	NotBefore  int64  `json:"not_before"`
	NotAfter   int64  `json:"not_after"`
}

// UnmarshalJSON 兼容不同响应键名：cert_id 缺失时回退到 id 字段。
func (c *QiniuSSLCert) UnmarshalJSON(data []byte) error {
	type alias QiniuSSLCert
	var wire struct {
		*alias
		ID string `json:"id"`
	}
	wire.alias = (*alias)(c)
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	if c.CertID == "" {
		c.CertID = wire.ID
	}
	return nil
}

// ListSSLCerts 列出 SSL 证书（GET /sslcert；兼容数组与对象两种响应形态）
func (c *qiniuCloudClient) ListSSLCerts(ctx context.Context) ([]QiniuSSLCert, error) {
	data, err := c.doJSON(ctx, http.MethodGet, "https://api.qiniu.com/sslcert", nil, nil)
	if err != nil {
		return nil, err
	}
	trim := strings.TrimSpace(string(data))
	var certs []QiniuSSLCert
	if strings.HasPrefix(trim, "[") {
		if err := json.Unmarshal(data, &certs); err != nil {
			return nil, err
		}
		return certs, nil
	}
	// 对象形态：在常见键名中寻找证书数组
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(data, &probe); err != nil {
		return nil, err
	}
	for _, key := range []string{"certs", "certificates", "items", "data", "list"} {
		raw, ok := probe[key]
		if !ok {
			continue
		}
		if err := json.Unmarshal(raw, &certs); err == nil {
			return certs, nil
		}
	}
	return []QiniuSSLCert{}, nil
}

// UploadSSLCert 上传自有证书（POST /sslcert；仅 CDN 域名可通过 API 绑定证书）
func (c *qiniuCloudClient) UploadSSLCert(ctx context.Context, name, commonName, cert, key string) error {
	body, _ := json.Marshal(map[string]string{
		"name":        name,
		"common_name": commonName,
		"cert":        cert,
		"key":         key,
	})
	_, err := c.doJSON(ctx, http.MethodPost, "https://api.qiniu.com/sslcert", nil, body)
	return err
}

// BindCDNCertHTTPS 将已上传证书绑定到 CDN 域名（PUT /domain/<domain>/httpsconf）
func (c *qiniuCloudClient) BindCDNCertHTTPS(ctx context.Context, domain string, certID int64, forceHTTPS bool) error {
	body, _ := json.Marshal(map[string]any{
		"certMode":   "upload",
		"certId":     certID,
		"forceHttps": forceHTTPS,
	})
	_, err := c.doJSON(ctx, http.MethodPut, "https://api.qiniu.com/domain/"+domain+"/httpsconf", nil, body)
	return err
}

// QiniuUsagePoint 空间用量时间点（unix 秒 -> 存储字节数）
type QiniuUsagePoint struct {
	TS   int64 `json:"ts"`
	Size int64 `json:"size"`
}

// GetBucketSpaceUsage 空间级存储用量明细（GET /v6/space，按天）
func (c *qiniuCloudClient) GetBucketSpaceUsage(ctx context.Context, bucket string, days int) ([]QiniuUsagePoint, error) {
	if days <= 0 || days > 90 {
		days = 30
	}
	end := time.Now()
	begin := end.AddDate(0, 0, -days)
	q := url.Values{}
	q.Set("bucket", bucket)
	q.Set("begin", begin.Format("20060102150405"))
	q.Set("end", end.Format("20060102150405"))
	q.Set("g", "day")
	data, err := c.doJSON(ctx, http.MethodGet, "https://api.qiniu.com/v6/space", q, nil)
	if err != nil {
		return nil, err
	}
	trim := strings.TrimSpace(string(data))
	var points []QiniuUsagePoint
	if strings.HasPrefix(trim, "[") {
		var raw [][2]int64
		if err := json.Unmarshal(data, &raw); err == nil {
			for _, p := range raw {
				points = append(points, QiniuUsagePoint{TS: p[0], Size: p[1]})
			}
		}
	} else {
		var obj struct {
			Items [][2]int64 `json:"items"`
		}
		if err := json.Unmarshal(data, &obj); err == nil {
			for _, p := range obj.Items {
				points = append(points, QiniuUsagePoint{TS: p[0], Size: p[1]})
			}
		}
	}
	return points, nil
}

// DeleteSSLCert 删除证书（DELETE /sslcert/<id>）
func (c *qiniuCloudClient) DeleteSSLCert(ctx context.Context, certID string) error {
	_, err := c.doJSON(ctx, http.MethodDelete, "https://api.qiniu.com/sslcert/"+certID, nil, nil)
	return err
}

// VerifyCredentials 验证七牛云凭证是否可用
func (c *qiniuCloudClient) VerifyCredentials(ctx context.Context) error {
	_, err := c.doJSON(ctx, http.MethodGet, "https://rs.qiniu.com/buckets", nil, nil)
	return err
}

// ─── 统计 ───

// QiniuStats 七牛云对象存储概览统计
type QiniuStats struct {
	TodayCount     int64 `json:"todayCount"`
	YesterdayCount int64 `json:"yesterdayCount"`
	ThisMonthCount int64 `json:"thisMonthCount"`
	LastMonthCount int64 `json:"lastMonthCount"`
	TodaySpace     int64 `json:"todaySpace"`     // bytes
	YesterdaySpace int64 `json:"yesterdaySpace"` // bytes
	ThisMonthSpace int64 `json:"thisMonthSpace"` // bytes
	LastMonthSpace int64 `json:"lastMonthSpace"` // bytes
}

// qiniuTimeSeriesResp /v6/count 与 /v6/space 的统一响应结构
type qiniuTimeSeriesResp struct {
	Times []int64 `json:"times"`
	Datas []int64 `json:"datas"`
}

// GetStats 获取七牛云对象存储概览统计（今日/昨日/本月/上月的文件数与存储量）
func (c *qiniuCloudClient) GetStats(ctx context.Context) (*QiniuStats, error) {
	now := time.Now()

	// 日粒度：取最近 7 天，最后两个元素分别是今日、昨日
	dayBegin := now.AddDate(0, 0, -6).Truncate(24 * time.Hour).Unix()
	dayEnd := now.Unix()

	dayCount, err := c.fetchTimeSeries(ctx, "/v6/count", "day", dayBegin, dayEnd)
	if err != nil {
		return nil, fmt.Errorf("count: %w", err)
	}
	daySpace, err := c.fetchTimeSeries(ctx, "/v6/space", "day", dayBegin, dayEnd)
	if err != nil {
		return nil, fmt.Errorf("space: %w", err)
	}

	// 月粒度：取最近 2 个月，最后两个元素分别是本月、上月
	monthBegin := now.AddDate(0, -1, 0).Truncate(24 * time.Hour).Unix()
	monthCount, err := c.fetchTimeSeries(ctx, "/v6/count", "month", monthBegin, dayEnd)
	if err != nil {
		return nil, fmt.Errorf("month count: %w", err)
	}
	monthSpace, err := c.fetchTimeSeries(ctx, "/v6/space", "month", monthBegin, dayEnd)
	if err != nil {
		return nil, fmt.Errorf("month space: %w", err)
	}

	s := &QiniuStats{}
	if len(dayCount.Datas) >= 1 {
		s.TodayCount = dayCount.Datas[len(dayCount.Datas)-1]
	}
	if len(dayCount.Datas) >= 2 {
		s.YesterdayCount = dayCount.Datas[len(dayCount.Datas)-2]
	}
	if len(daySpace.Datas) >= 1 {
		s.TodaySpace = daySpace.Datas[len(daySpace.Datas)-1]
	}
	if len(daySpace.Datas) >= 2 {
		s.YesterdaySpace = daySpace.Datas[len(daySpace.Datas)-2]
	}
	if len(monthCount.Datas) >= 1 {
		s.ThisMonthCount = monthCount.Datas[len(monthCount.Datas)-1]
	}
	if len(monthCount.Datas) >= 2 {
		s.LastMonthCount = monthCount.Datas[len(monthCount.Datas)-2]
	}
	if len(monthSpace.Datas) >= 1 {
		s.ThisMonthSpace = monthSpace.Datas[len(monthSpace.Datas)-1]
	}
	if len(monthSpace.Datas) >= 2 {
		s.LastMonthSpace = monthSpace.Datas[len(monthSpace.Datas)-2]
	}
	return s, nil
}

func (c *qiniuCloudClient) fetchTimeSeries(ctx context.Context, path, granularity string, begin, end int64) (*qiniuTimeSeriesResp, error) {
	endpoint := fmt.Sprintf("https://api.qiniu.com%s?g=%s&begin=%d&end=%d", path, granularity, begin, end)
	data, err := c.doJSON(ctx, http.MethodGet, endpoint, nil, nil)
	if err != nil {
		return nil, err
	}
	var r qiniuTimeSeriesResp
	if err := json.Unmarshal(data, &r); err != nil {
		return nil, err
	}
	return &r, nil
}
