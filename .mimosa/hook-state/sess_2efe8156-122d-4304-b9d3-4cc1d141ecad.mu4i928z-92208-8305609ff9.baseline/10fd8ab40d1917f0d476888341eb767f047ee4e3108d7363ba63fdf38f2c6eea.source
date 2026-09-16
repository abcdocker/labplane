package internal

import (
	"context"
	"crypto/md5"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// ─── Upyun 通用客户端 ───

type upyunCloudClient struct {
	serviceName string
	operator    string
	password    string // 操作员密码的 MD5 值，或原始密码
}

func newUpyunCloudClient(serviceName, operator, password string) *upyunCloudClient {
	return &upyunCloudClient{serviceName: serviceName, operator: operator, password: password}
}

// upyunBasicAuth 返回 Basic Auth header 值（使用密码 MD5）
func (c *upyunCloudClient) upyunBasicAuth() string {
	passMD5 := c.password
	if len(passMD5) != 32 {
		passMD5 = fmt.Sprintf("%x", md5.Sum([]byte(c.password)))
	}
	auth := c.operator + ":" + passMD5
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(auth))
}

func (c *upyunCloudClient) doJSON(ctx context.Context, method, endpoint string, query url.Values, body []byte) ([]byte, error) {
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
	req.Header.Set("Authorization", c.upyunBasicAuth())
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("upyun API %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	return data, nil
}

// ─── 对象存储 (USS) ───

// UpyunFile 又拍云文件/目录项
type UpyunFile struct {
	Name      string `json:"name"`
	Type      string `json:"type"`      // file | folder
	Size      int64  `json:"length"`    // 文件大小
	LastMod   string `json:"last_modified"`
}

// ListFiles 列出服务下的文件（使用 REST API 的 GET / 配合 x-list-iter）
func (c *upyunCloudClient) ListFiles(ctx context.Context, path string, limit int) (*UpyunListResult, error) {
	if limit <= 0 || limit > 1000 {
		limit = 1000
	}
	endpoint := fmt.Sprintf("https://v0.api.upyun.com/%s%s", c.serviceName, path)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", c.upyunBasicAuth())
	req.Header.Set("x-list-limit", strconv.Itoa(limit))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("upyun LIST %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	// 又拍云返回 x-list-iter header 用于分页
	nextIter := resp.Header.Get("x-list-iter")
	var items []UpyunFile
	if err := json.Unmarshal(data, &items); err != nil {
		// 可能不是 JSON，尝试按行解析 name;type;size;last_mod
		lines := strings.Split(strings.TrimSpace(string(data)), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			parts := strings.Split(line, "\t")
			if len(parts) >= 4 {
				items = append(items, UpyunFile{Name: parts[0], Type: parts[1], LastMod: parts[3]})
			} else {
				items = append(items, UpyunFile{Name: line, Type: "file"})
			}
		}
	}
	return &UpyunListResult{Items: items, NextIter: nextIter}, nil
}

// UpyunListResult 又拍云列表结果
type UpyunListResult struct {
	Items    []UpyunFile `json:"items"`
	NextIter string      `json:"nextIter"`
}

// ─── CDN ───

// UpyunDomain 又拍云 CDN 加速域名
type UpyunDomain struct {
	Domain   string `json:"domain"`
	Platform string `json:"platform"`
	Status   string `json:"status"`
	CNAME    string `json:"cname"`
}

// ListCDNDomains 获取 CDN 域名列表
// 使用 https://api.upyun.com/ 的域名列表接口需要额外授权，这里使用通用查询
func (c *upyunCloudClient) ListCDNDomains(ctx context.Context) ([]UpyunDomain, error) {
	// 又拍云没有直接公开的 REST API 列出所有 CDN 域名，此处返回空或从服务信息中解析
	// 未来可以接入 https://api.upyun.com/buckets 等接口
	return []UpyunDomain{}, nil
}

// GetServiceInfo 获取服务基本信息
func (c *upyunCloudClient) GetServiceInfo(ctx context.Context) (*UpyunServiceInfo, error) {
	endpoint := fmt.Sprintf("https://v0.api.upyun.com/%s/?usage", c.serviceName)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", c.upyunBasicAuth())
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("upyun usage %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	usage, _ := strconv.ParseInt(strings.TrimSpace(string(data)), 10, 64)
	return &UpyunServiceInfo{ServiceName: c.serviceName, UsageBytes: usage}, nil
}

// UpyunServiceInfo 服务信息
type UpyunServiceInfo struct {
	ServiceName string `json:"serviceName"`
	UsageBytes  int64  `json:"usageBytes"`
}

// VerifyCredentials 验证又拍云凭证是否可用
func (c *upyunCloudClient) VerifyCredentials(ctx context.Context) error {
	_, err := c.GetServiceInfo(ctx)
	return err
}
