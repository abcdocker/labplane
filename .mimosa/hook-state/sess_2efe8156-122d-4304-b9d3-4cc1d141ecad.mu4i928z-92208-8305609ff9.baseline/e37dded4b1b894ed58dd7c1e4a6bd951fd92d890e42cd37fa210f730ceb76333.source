package internal

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ─────────────────────────── interface ───────────────────────────

// DnsProviderRecord is the canonical record type exchanged with providers.
type DnsProviderRecord struct {
	ID         string
	RecordType string
	Host       string // sub-host, e.g. "@" for root, "www", "mail"
	Line       string // 解析线路（DNSPod/腾讯云）；空表示由适配器使用默认线路
	Value      string
	TTL        int
	MxPriority int
	Status     int // 1=enabled, 0=disabled
}

func dnsProviderDefaultLineTencentDnspod() string { return "默认" }

func dnsProviderTencentLine(r DnsProviderRecord) string {
	if s := strings.TrimSpace(r.Line); s != "" {
		return s
	}
	return dnsProviderDefaultLineTencentDnspod()
}

type DnsProviderClient interface {
	// ProviderName returns e.g. "cloudflare"
	ProviderName() string
	// ListDomains returns all domain/zone names managed by this account.
	ListDomains(ctx context.Context) ([]string, error)
	// ListRecords fetches all DNS records for the given domain (zone name).
	ListRecords(ctx context.Context, domain string) ([]DnsProviderRecord, error)
	// AddRecord creates a new DNS record and returns its provider-side ID.
	AddRecord(ctx context.Context, domain string, r DnsProviderRecord) (string, error)
	// UpdateRecord modifies an existing DNS record.
	UpdateRecord(ctx context.Context, domain string, r DnsProviderRecord) error
	// DeleteRecord removes a DNS record by its provider-side ID.
	DeleteRecord(ctx context.Context, domain string, recordID string) error
	// SetStatus enables or disables a DNS record (not all providers support this).
	SetStatus(ctx context.Context, domain string, recordID string, enabled bool) error
}

// newDnsProviderClient creates a provider client from account config JSON.
// Supported providers: cloudflare, aliyun, tencent, dnspod, namesilo, manual.
func newDnsProviderClient(provider, configJSON string) (DnsProviderClient, error) {
	var cfg map[string]string
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		return nil, fmt.Errorf("invalid account config: %w", err)
	}
	switch strings.ToLower(provider) {
	case "cloudflare":
		token := cfg["apiToken"]
		if token == "" {
			token = cfg["token"]
		}
		if token == "" {
			return nil, fmt.Errorf("cloudflare: apiToken is required")
		}
		return &cloudflareProvider{apiToken: token}, nil

	case "aliyun", "alibaba", "alidns":
		ak := cfg["accessKeyId"]
		sk := cfg["accessKeySecret"]
		if ak == "" || sk == "" {
			return nil, fmt.Errorf("aliyun: accessKeyId and accessKeySecret are required")
		}
		return &aliyunProvider{accessKeyID: ak, accessKeySecret: sk}, nil

	case "tencent", "tencentcloud", "dnspod":
		sid := cfg["secretId"]
		skey := cfg["secretKey"]
		if sid == "" || skey == "" {
			return nil, fmt.Errorf("tencent: secretId and secretKey are required")
		}
		return &tencentProvider{secretID: sid, secretKey: skey}, nil

	case "dnspod_token":
		appID := cfg["appId"]
		token := cfg["token"]
		if appID == "" || token == "" {
			return nil, fmt.Errorf("dnspod_token: appId and token are required")
		}
		return &dnspodTokenProvider{loginToken: appID + "," + token}, nil

	case "manual", "custom", "":
		return &manualProvider{}, nil

	default:
		return nil, fmt.Errorf("unsupported provider: %s", provider)
	}
}

// ─────────────────────────── Cloudflare ───────────────────────────

type cloudflareProvider struct {
	apiToken string
}

func (p *cloudflareProvider) ProviderName() string { return "cloudflare" }

func (p *cloudflareProvider) cfRequest(ctx context.Context, method, url string, body interface{}) ([]byte, error) {
	var rb io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rb = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, rb)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiToken)
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
		return nil, fmt.Errorf("cloudflare API error %d: %s", resp.StatusCode, string(data))
	}
	return data, nil
}

func (p *cloudflareProvider) getZoneID(ctx context.Context, domain string) (string, error) {
	data, err := p.cfRequest(ctx, "GET", "https://api.cloudflare.com/client/v4/zones?name="+url.QueryEscape(domain)+"&status=active", nil)
	if err != nil {
		return "", err
	}
	var resp struct {
		Result []struct {
			ID string `json:"id"`
		} `json:"result"`
		Success bool `json:"success"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return "", err
	}
	if !resp.Success || len(resp.Result) == 0 {
		return "", fmt.Errorf("zone not found for domain: %s", domain)
	}
	return resp.Result[0].ID, nil
}

func (p *cloudflareProvider) ListDomains(ctx context.Context) ([]string, error) {
	var out []string
	page := 1
	for {
		data, err := p.cfRequest(ctx, "GET",
			fmt.Sprintf("https://api.cloudflare.com/client/v4/zones?per_page=50&page=%d", page), nil)
		if err != nil {
			return nil, err
		}
		var resp struct {
			Result []struct {
				Name string `json:"name"`
			} `json:"result"`
			ResultInfo struct {
				TotalPages int `json:"total_pages"`
			} `json:"result_info"`
			Success bool `json:"success"`
		}
		if err := json.Unmarshal(data, &resp); err != nil {
			return nil, err
		}
		for _, z := range resp.Result {
			out = append(out, z.Name)
		}
		if page >= resp.ResultInfo.TotalPages {
			break
		}
		page++
	}
	return out, nil
}

func (p *cloudflareProvider) ListRecords(ctx context.Context, domain string) ([]DnsProviderRecord, error) {
	zoneID, err := p.getZoneID(ctx, domain)
	if err != nil {
		return nil, err
	}
	var out []DnsProviderRecord
	page := 1
	for {
		data, err := p.cfRequest(ctx, "GET",
			fmt.Sprintf("https://api.cloudflare.com/client/v4/zones/%s/dns_records?per_page=100&page=%d", zoneID, page), nil)
		if err != nil {
			return nil, err
		}
		var resp struct {
			Result []struct {
				ID       string `json:"id"`
				Type     string `json:"type"`
				Name     string `json:"name"`
				Content  string `json:"content"`
				TTL      int    `json:"ttl"`
				Priority *int   `json:"priority"`
				Proxied  bool   `json:"proxied"`
			} `json:"result"`
			ResultInfo struct {
				TotalPages int `json:"total_pages"`
			} `json:"result_info"`
			Success bool `json:"success"`
		}
		if err := json.Unmarshal(data, &resp); err != nil {
			return nil, err
		}
		for _, r := range resp.Result {
			host := strings.TrimSuffix(r.Name, "."+domain)
			if host == domain {
				host = "@"
			}
			pri := 0
			if r.Priority != nil {
				pri = *r.Priority
			}
			status := 1
			out = append(out, DnsProviderRecord{
				ID: r.ID, RecordType: r.Type, Host: host, Line: "",
				Value: r.Content, TTL: r.TTL, MxPriority: pri, Status: status,
			})
		}
		if page >= resp.ResultInfo.TotalPages {
			break
		}
		page++
	}
	return out, nil
}

func (p *cloudflareProvider) AddRecord(ctx context.Context, domain string, r DnsProviderRecord) (string, error) {
	zoneID, err := p.getZoneID(ctx, domain)
	if err != nil {
		return "", err
	}
	name := r.Host
	if name == "@" {
		name = domain
	} else {
		name = r.Host + "." + domain
	}
	body := map[string]interface{}{
		"type":    r.RecordType,
		"name":    name,
		"content": r.Value,
		"ttl":     r.TTL,
		"proxied": false,
	}
	if r.RecordType == "MX" {
		body["priority"] = r.MxPriority
	}
	data, err := p.cfRequest(ctx, "POST",
		"https://api.cloudflare.com/client/v4/zones/"+zoneID+"/dns_records", body)
	if err != nil {
		return "", err
	}
	var resp struct {
		Result struct {
			ID string `json:"id"`
		} `json:"result"`
		Success bool `json:"success"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return "", err
	}
	return resp.Result.ID, nil
}

func (p *cloudflareProvider) UpdateRecord(ctx context.Context, domain string, r DnsProviderRecord) error {
	zoneID, err := p.getZoneID(ctx, domain)
	if err != nil {
		return err
	}
	name := r.Host
	if name == "@" {
		name = domain
	} else {
		name = r.Host + "." + domain
	}
	body := map[string]interface{}{
		"type":    r.RecordType,
		"name":    name,
		"content": r.Value,
		"ttl":     r.TTL,
		"proxied": false,
	}
	if r.RecordType == "MX" {
		body["priority"] = r.MxPriority
	}
	_, err = p.cfRequest(ctx, "PUT",
		"https://api.cloudflare.com/client/v4/zones/"+zoneID+"/dns_records/"+r.ID, body)
	return err
}

func (p *cloudflareProvider) DeleteRecord(ctx context.Context, domain string, recordID string) error {
	zoneID, err := p.getZoneID(ctx, domain)
	if err != nil {
		return err
	}
	_, err = p.cfRequest(ctx, "DELETE",
		"https://api.cloudflare.com/client/v4/zones/"+zoneID+"/dns_records/"+recordID, nil)
	return err
}

func (p *cloudflareProvider) SetStatus(ctx context.Context, domain string, recordID string, enabled bool) error {
	// Cloudflare doesn't have enable/disable; skip silently.
	return nil
}

// ─────────────────────────── Alibaba Cloud DNS ───────────────────────────

type aliyunProvider struct {
	accessKeyID     string
	accessKeySecret string
}

func (p *aliyunProvider) ProviderName() string { return "aliyun" }

func (p *aliyunProvider) aliyunRequest(ctx context.Context, action string, params map[string]string) ([]byte, error) {
	params["Action"] = action
	params["Format"] = "JSON"
	params["Version"] = "2015-01-09"
	params["AccessKeyId"] = p.accessKeyID
	params["SignatureMethod"] = "HMAC-SHA1"
	params["SignatureVersion"] = "1.0"
	params["SignatureNonce"] = strconv.FormatInt(time.Now().UnixNano(), 10)
	params["Timestamp"] = time.Now().UTC().Format("2006-01-02T15:04:05Z")

	// Sort keys
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// Build canonical query string
	var parts []string
	for _, k := range keys {
		parts = append(parts, url.QueryEscape(k)+"="+url.QueryEscape(params[k]))
	}
	canonicalQuery := strings.Join(parts, "&")
	strToSign := "GET&%2F&" + url.QueryEscape(canonicalQuery)

	mac := hmac.New(sha256.New, []byte(p.accessKeySecret+"&"))
	mac.Write([]byte(strToSign))
	sig := hex.EncodeToString(mac.Sum(nil))
	params["Signature"] = sig

	// Build final URL
	finalParts := make([]string, 0, len(params))
	for k, v := range params {
		finalParts = append(finalParts, url.QueryEscape(k)+"="+url.QueryEscape(v))
	}
	apiURL := "https://alidns.aliyuncs.com/?" + strings.Join(finalParts, "&")

	req, err := http.NewRequestWithContext(ctx, "GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("aliyun API error %d: %s", resp.StatusCode, string(data))
	}
	return data, nil
}

func (p *aliyunProvider) ListDomains(ctx context.Context) ([]string, error) {
	var out []string
	page := 1
	for {
		data, err := p.aliyunRequest(ctx, "DescribeDomains", map[string]string{
			"PageNumber": strconv.Itoa(page),
			"PageSize":   "100",
		})
		if err != nil {
			return nil, err
		}
		var resp struct {
			Domains struct {
				Domain []struct {
					DomainName string `json:"DomainName"`
				} `json:"Domain"`
			} `json:"Domains"`
			TotalCount int `json:"TotalCount"`
		}
		if err := json.Unmarshal(data, &resp); err != nil {
			return nil, err
		}
		for _, d := range resp.Domains.Domain {
			out = append(out, d.DomainName)
		}
		if len(out) >= resp.TotalCount {
			break
		}
		page++
	}
	return out, nil
}

func (p *aliyunProvider) ListRecords(ctx context.Context, domain string) ([]DnsProviderRecord, error) {
	var out []DnsProviderRecord
	page := 1
	for {
		data, err := p.aliyunRequest(ctx, "DescribeDomainRecords", map[string]string{
			"DomainName": domain,
			"PageNumber": strconv.Itoa(page),
			"PageSize":   "500",
		})
		if err != nil {
			return nil, err
		}
		var resp struct {
			DomainRecords struct {
				Record []struct {
					RecordId string `json:"RecordId"`
					RR       string `json:"RR"`
					Type     string `json:"Type"`
					Value    string `json:"Value"`
					Line     string `json:"Line"`
					TTL      int    `json:"TTL"`
					Priority int    `json:"Priority"`
					Status   string `json:"Status"`
				} `json:"Record"`
			} `json:"DomainRecords"`
			TotalCount int `json:"TotalCount"`
		}
		if err := json.Unmarshal(data, &resp); err != nil {
			return nil, err
		}
		for _, r := range resp.DomainRecords.Record {
			status := 1
			if r.Status != "Enable" {
				status = 0
			}
			line := strings.TrimSpace(r.Line)
			if line == "" {
				line = "default"
			}
			out = append(out, DnsProviderRecord{
				ID: r.RecordId, RecordType: r.Type, Host: r.RR, Line: line,
				Value: r.Value, TTL: r.TTL, MxPriority: r.Priority, Status: status,
			})
		}
		if len(out) >= resp.TotalCount {
			break
		}
		page++
	}
	return out, nil
}

func (p *aliyunProvider) AddRecord(ctx context.Context, domain string, r DnsProviderRecord) (string, error) {
	line := strings.TrimSpace(r.Line)
	if line == "" {
		line = "default"
	}
	data, err := p.aliyunRequest(ctx, "AddDomainRecord", map[string]string{
		"DomainName": domain,
		"RR":         r.Host,
		"Type":       r.RecordType,
		"Value":      r.Value,
		"TTL":        strconv.Itoa(r.TTL),
		"Priority":   strconv.Itoa(r.MxPriority),
		"Line":       line,
	})
	if err != nil {
		return "", err
	}
	var resp struct {
		RecordId string `json:"RecordId"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return "", err
	}
	return resp.RecordId, nil
}

func (p *aliyunProvider) UpdateRecord(ctx context.Context, domain string, r DnsProviderRecord) error {
	line := strings.TrimSpace(r.Line)
	if line == "" {
		line = "default"
	}
	_, err := p.aliyunRequest(ctx, "UpdateDomainRecord", map[string]string{
		"RecordId": r.ID,
		"RR":       r.Host,
		"Type":     r.RecordType,
		"Value":    r.Value,
		"TTL":      strconv.Itoa(r.TTL),
		"Priority": strconv.Itoa(r.MxPriority),
		"Line":     line,
	})
	return err
}

func (p *aliyunProvider) DeleteRecord(ctx context.Context, domain string, recordID string) error {
	_, err := p.aliyunRequest(ctx, "DeleteDomainRecord", map[string]string{"RecordId": recordID})
	return err
}

func (p *aliyunProvider) SetStatus(ctx context.Context, domain string, recordID string, enabled bool) error {
	status := "Disable"
	if enabled {
		status = "Enable"
	}
	_, err := p.aliyunRequest(ctx, "SetDomainRecordStatus", map[string]string{
		"RecordId": recordID,
		"Status":   status,
	})
	return err
}

// ─────────────────────────── Tencent Cloud DNS (DNSPod) ───────────────────────────

type tencentProvider struct {
	secretID  string
	secretKey string
}

func (p *tencentProvider) ProviderName() string { return "tencent" }

func (p *tencentProvider) tcRequest(ctx context.Context, action string, payload interface{}) ([]byte, error) {
	bodyBytes, _ := json.Marshal(payload)
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	date := time.Now().UTC().Format("2006-01-02")

	service := "dnspod"
	host := "dnspod.tencentcloudapi.com"
	algorithm := "TC3-HMAC-SHA256"

	// Step 1: canonical request
	hashedPayload := dnsSha256Hex(bodyBytes)
	canonicalRequest := "POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:" + host + "\n\ncontent-type;host\n" + hashedPayload

	// Step 2: string to sign
	credentialScope := date + "/" + service + "/tc3_request"
	hashedCR := dnsSha256Hex([]byte(canonicalRequest))
	stringToSign := algorithm + "\n" + timestamp + "\n" + credentialScope + "\n" + hashedCR

	// Step 3: signing key
	secretDate := hmacSHA256([]byte("TC3"+p.secretKey), []byte(date))
	secretService := hmacSHA256(secretDate, []byte(service))
	secretSigning := hmacSHA256(secretService, []byte("tc3_request"))
	signature := hex.EncodeToString(hmacSHA256(secretSigning, []byte(stringToSign)))

	authorization := fmt.Sprintf(
		"%s Credential=%s/%s, SignedHeaders=content-type;host, Signature=%s",
		algorithm, p.secretID, credentialScope, signature)

	req, err := http.NewRequestWithContext(ctx, "POST",
		"https://"+host, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("Host", host)
	req.Header.Set("X-TC-Action", action)
	req.Header.Set("X-TC-Timestamp", timestamp)
	req.Header.Set("X-TC-Version", "2021-03-23")
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
		return nil, fmt.Errorf("tencent API error %s: %s",
			errCheck.Response.Error.Code, errCheck.Response.Error.Message)
	}
	return data, nil
}

func (p *tencentProvider) ListDomains(ctx context.Context) ([]string, error) {
	var out []string
	offset := 0
	limit := 100
	for {
		data, err := p.tcRequest(ctx, "DescribeDomainList", map[string]interface{}{
			"Offset": offset,
			"Limit":  limit,
		})
		if err != nil {
			return nil, err
		}
		var resp struct {
			Response struct {
				DomainList []struct {
					Name string `json:"Name"`
				} `json:"DomainList"`
				DomainCountInfo struct {
					AllTotal int `json:"AllTotal"`
				} `json:"DomainCountInfo"`
			} `json:"Response"`
		}
		if err := json.Unmarshal(data, &resp); err != nil {
			return nil, err
		}
		for _, d := range resp.Response.DomainList {
			out = append(out, d.Name)
		}
		if len(out) >= resp.Response.DomainCountInfo.AllTotal {
			break
		}
		offset += limit
	}
	return out, nil
}

func (p *tencentProvider) ListRecords(ctx context.Context, domain string) ([]DnsProviderRecord, error) {
	var out []DnsProviderRecord
	offset := 0
	limit := 3000
	for {
		data, err := p.tcRequest(ctx, "DescribeRecordList", map[string]interface{}{
			"Domain": domain, "Limit": limit, "Offset": offset,
		})
		if err != nil {
			return nil, err
		}
		var resp struct {
			Response struct {
				RecordList []struct {
					RecordId   uint64 `json:"RecordId"`
					SubDomain  string `json:"SubDomain"`
					RecordType string `json:"RecordType"`
					Line       string `json:"Line"`
					Value      string `json:"Value"`
					TTL        int    `json:"TTL"`
					MX         int    `json:"MX"`
					Enabled    int    `json:"Enabled"`
				} `json:"RecordList"`
				RecordCountInfo struct {
					SubdomainCount int `json:"SubdomainCount"`
				} `json:"RecordCountInfo"`
			} `json:"Response"`
		}
		if err := json.Unmarshal(data, &resp); err != nil {
			return nil, err
		}
		for _, r := range resp.Response.RecordList {
			line := strings.TrimSpace(r.Line)
			if line == "" {
				line = dnsProviderDefaultLineTencentDnspod()
			}
			out = append(out, DnsProviderRecord{
				ID:         strconv.FormatUint(r.RecordId, 10),
				RecordType: r.RecordType,
				Host:       r.SubDomain,
				Line:       line,
				Value:      r.Value,
				TTL:        r.TTL,
				MxPriority: r.MX,
				Status:     r.Enabled,
			})
		}
		if len(resp.Response.RecordList) < limit {
			break
		}
		offset += limit
	}
	return out, nil
}

func (p *tencentProvider) AddRecord(ctx context.Context, domain string, r DnsProviderRecord) (string, error) {
	data, err := p.tcRequest(ctx, "CreateRecord", map[string]interface{}{
		"Domain": domain, "SubDomain": r.Host, "RecordType": r.RecordType,
		"RecordLine": dnsProviderTencentLine(r), "Value": r.Value, "TTL": r.TTL, "MX": r.MxPriority,
	})
	if err != nil {
		return "", err
	}
	var resp struct {
		Response struct {
			RecordInfo struct {
				ID uint64 `json:"id"`
			} `json:"RecordInfo"`
		} `json:"Response"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return "", err
	}
	return strconv.FormatUint(resp.Response.RecordInfo.ID, 10), nil
}

func (p *tencentProvider) UpdateRecord(ctx context.Context, domain string, r DnsProviderRecord) error {
	id, _ := strconv.ParseUint(r.ID, 10, 64)
	_, err := p.tcRequest(ctx, "ModifyRecord", map[string]interface{}{
		"Domain": domain, "SubDomain": r.Host, "RecordType": r.RecordType,
		"RecordLine": dnsProviderTencentLine(r), "Value": r.Value, "TTL": r.TTL,
		"MX": r.MxPriority, "RecordId": id,
	})
	return err
}

func (p *tencentProvider) DeleteRecord(ctx context.Context, domain string, recordID string) error {
	id, _ := strconv.ParseUint(recordID, 10, 64)
	_, err := p.tcRequest(ctx, "DeleteRecord", map[string]interface{}{"Domain": domain, "RecordId": id})
	return err
}

func (p *tencentProvider) SetStatus(ctx context.Context, domain string, recordID string, enabled bool) error {
	id, _ := strconv.ParseUint(recordID, 10, 64)
	status := "DISABLE"
	if enabled {
		status = "ENABLE"
	}
	_, err := p.tcRequest(ctx, "ModifyRecordStatus", map[string]interface{}{
		"Domain": domain, "RecordId": id, "Status": status,
	})
	return err
}

// ─────────────────────────── Manual provider ───────────────────────────

type manualProvider struct{}

func (p *manualProvider) ProviderName() string                            { return "manual" }
func (p *manualProvider) ListDomains(_ context.Context) ([]string, error) { return nil, nil }
func (p *manualProvider) ListRecords(_ context.Context, _ string) ([]DnsProviderRecord, error) {
	return nil, fmt.Errorf("manual 模式不支持从服务商拉取记录，请手动录入")
}
func (p *manualProvider) AddRecord(_ context.Context, _ string, _ DnsProviderRecord) (string, error) {
	return "", fmt.Errorf("manual 模式不支持写入服务商，请在服务商控制台操作")
}
func (p *manualProvider) UpdateRecord(_ context.Context, _ string, _ DnsProviderRecord) error {
	return fmt.Errorf("manual 模式不支持写入服务商")
}
func (p *manualProvider) DeleteRecord(_ context.Context, _ string, _ string) error {
	return fmt.Errorf("manual 模式不支持写入服务商")
}
func (p *manualProvider) SetStatus(_ context.Context, _ string, _ string, _ bool) error {
	return fmt.Errorf("manual 模式不支持写入服务商")
}

// ─────────────────────────── DNSPod Token (旧版 dnsapi.cn) ───────────────────────────

// dnspodTokenProvider 使用 DNSPod 旧版 Token API（https://dnsapi.cn）。
// config_json 格式: {"appId":"1252194796","token":"your_token"}
type dnspodTokenProvider struct {
	loginToken string // "APPID,Token"
}

func (p *dnspodTokenProvider) ProviderName() string { return "dnspod_token" }

func (p *dnspodTokenProvider) dpRequest(ctx context.Context, action string, params map[string]string) ([]byte, error) {
	form := url.Values{}
	form.Set("login_token", p.loginToken)
	form.Set("format", "json")
	form.Set("lang", "cn")
	form.Set("error_on_empty", "no")
	for k, v := range params {
		form.Set(k, v)
	}
	req, err := http.NewRequestWithContext(ctx, "POST", "https://dnsapi.cn/"+action,
		strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "kube-bt-sync/1.0 (admin@example.com)")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	var check struct {
		Status struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"status"`
	}
	if err := json.Unmarshal(data, &check); err == nil {
		if check.Status.Code != "1" {
			return nil, fmt.Errorf("dnspod error %s: %s", check.Status.Code, check.Status.Message)
		}
	}
	return data, nil
}

func (p *dnspodTokenProvider) getDomainID(ctx context.Context, domain string) (string, error) {
	// Try Domain.Info first (direct lookup, no pagination issues)
	data, err := p.dpRequest(ctx, "Domain.Info", map[string]string{"domain": domain})
	if err == nil {
		var infoResp struct {
			Domain struct {
				ID int `json:"id"`
			} `json:"domain"`
		}
		if jerr := json.Unmarshal(data, &infoResp); jerr == nil && infoResp.Domain.ID != 0 {
			return strconv.Itoa(infoResp.Domain.ID), nil
		}
	}

	// Fallback: paginate through Domain.List
	const pageSize = 100
	for offset := 0; ; offset += pageSize {
		data, err := p.dpRequest(ctx, "Domain.List", map[string]string{
			"offset": strconv.Itoa(offset),
			"length": strconv.Itoa(pageSize),
		})
		if err != nil {
			return "", err
		}
		var resp struct {
			Domains []struct {
				ID   int    `json:"id"`
				Name string `json:"name"`
			} `json:"domains"`
		}
		if err := json.Unmarshal(data, &resp); err != nil {
			return "", err
		}
		for _, d := range resp.Domains {
			if strings.EqualFold(d.Name, domain) {
				return strconv.Itoa(d.ID), nil
			}
		}
		if len(resp.Domains) < pageSize {
			break
		}
	}
	return "", fmt.Errorf("dnspod_token: domain %q not found", domain)
}

func (p *dnspodTokenProvider) ListDomains(ctx context.Context) ([]string, error) {
	var out []string
	const pageSize = 100
	for offset := 0; ; offset += pageSize {
		data, err := p.dpRequest(ctx, "Domain.List", map[string]string{
			"offset": strconv.Itoa(offset),
			"length": strconv.Itoa(pageSize),
		})
		if err != nil {
			return nil, err
		}
		var resp struct {
			Domains []struct {
				Name string `json:"name"`
			} `json:"domains"`
		}
		if err := json.Unmarshal(data, &resp); err != nil {
			return nil, err
		}
		for _, d := range resp.Domains {
			out = append(out, d.Name)
		}
		if len(resp.Domains) < pageSize {
			break
		}
	}
	return out, nil
}

func (p *dnspodTokenProvider) ListRecords(ctx context.Context, domain string) ([]DnsProviderRecord, error) {
	domainID, err := p.getDomainID(ctx, domain)
	if err != nil {
		return nil, err
	}
	var out []DnsProviderRecord
	offset := 0
	for {
		data, err := p.dpRequest(ctx, "Record.List", map[string]string{
			"domain_id": domainID,
			"offset":    strconv.Itoa(offset),
			"length":    "3000",
		})
		if err != nil {
			return nil, err
		}
		var resp struct {
			Records []struct {
				ID      string `json:"id"`
				Name    string `json:"name"`
				Type    string `json:"type"`
				Line    string `json:"line"`
				Value   string `json:"value"`
				TTL     string `json:"ttl"`
				MX      string `json:"mx"`
				Enabled string `json:"enabled"`
			} `json:"records"`
		}
		if err := json.Unmarshal(data, &resp); err != nil {
			return nil, err
		}
		for _, r := range resp.Records {
			ttl, _ := strconv.Atoi(r.TTL)
			mx, _ := strconv.Atoi(r.MX)
			enabled, _ := strconv.Atoi(r.Enabled)
			line := strings.TrimSpace(r.Line)
			if line == "" {
				line = dnsProviderDefaultLineTencentDnspod()
			}
			out = append(out, DnsProviderRecord{
				ID: r.ID, RecordType: r.Type, Host: r.Name, Line: line,
				Value: r.Value, TTL: ttl, MxPriority: mx, Status: enabled,
			})
		}
		if len(resp.Records) < 3000 {
			break
		}
		offset += 3000
	}
	return out, nil
}

func (p *dnspodTokenProvider) AddRecord(ctx context.Context, domain string, r DnsProviderRecord) (string, error) {
	domainID, err := p.getDomainID(ctx, domain)
	if err != nil {
		return "", err
	}
	data, err := p.dpRequest(ctx, "Record.Create", map[string]string{
		"domain_id":   domainID,
		"sub_domain":  r.Host,
		"record_type": r.RecordType,
		"record_line": dnsProviderTencentLine(r),
		"value":       r.Value,
		"ttl":         strconv.Itoa(r.TTL),
		"mx":          strconv.Itoa(r.MxPriority),
	})
	if err != nil {
		return "", err
	}
	var resp struct {
		Record struct {
			ID int `json:"id"`
		} `json:"record"`
	}
	if err := json.Unmarshal(data, &resp); err != nil {
		return "", err
	}
	return strconv.Itoa(resp.Record.ID), nil
}

func (p *dnspodTokenProvider) UpdateRecord(ctx context.Context, domain string, r DnsProviderRecord) error {
	domainID, err := p.getDomainID(ctx, domain)
	if err != nil {
		return err
	}
	_, err = p.dpRequest(ctx, "Record.Modify", map[string]string{
		"domain_id":   domainID,
		"record_id":   r.ID,
		"sub_domain":  r.Host,
		"record_type": r.RecordType,
		"record_line": dnsProviderTencentLine(r),
		"value":       r.Value,
		"ttl":         strconv.Itoa(r.TTL),
		"mx":          strconv.Itoa(r.MxPriority),
	})
	return err
}

func (p *dnspodTokenProvider) DeleteRecord(ctx context.Context, domain string, recordID string) error {
	domainID, err := p.getDomainID(ctx, domain)
	if err != nil {
		return err
	}
	_, err = p.dpRequest(ctx, "Record.Remove", map[string]string{
		"domain_id": domainID,
		"record_id": recordID,
	})
	return err
}

func (p *dnspodTokenProvider) SetStatus(ctx context.Context, domain string, recordID string, enabled bool) error {
	domainID, err := p.getDomainID(ctx, domain)
	if err != nil {
		return err
	}
	status := "Disable"
	if enabled {
		status = "Enable"
	}
	_, err = p.dpRequest(ctx, "Record.Status", map[string]string{
		"domain_id": domainID,
		"record_id": recordID,
		"status":    status,
	})
	return err
}

// ─────────────────────────── helpers ───────────────────────────

func dnsSha256Hex(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func hmacSHA256(key, data []byte) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write(data)
	return mac.Sum(nil)
}
