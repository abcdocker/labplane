package internal

import (
	"crypto/md5"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

func joinBaotaURL(base, apiPath string) string {
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	apiPath = strings.TrimSpace(apiPath)
	if apiPath == "" {
		return base
	}
	if !strings.HasPrefix(apiPath, "/") {
		apiPath = "/" + apiPath
	}
	return base + apiPath
}

func newBaotaHTTPClient(cfg Config, timeout time.Duration) *http.Client {
	if timeout <= 0 {
		timeout = 45 * time.Second
	}
	dialer := &net.Dialer{
		Timeout:   15 * time.Second,
		KeepAlive: 60 * time.Second,
	}
	tr := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		// 减轻跨公网、面板偶发慢时的连接复用与握手问题
		MaxIdleConns:        32,
		MaxIdleConnsPerHost: 8,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 30 * time.Second,
		// 0：不在 Transport 层再单独卡「等头」时间，避免与 http.Client.Timeout 叠加过紧
		ResponseHeaderTimeout: 0,
		DialContext:           dialer.DialContext,
		DisableKeepAlives:     cfg.BaotaDisableHTTPKeepAlive,
	}
	if cfg.BaotaSkipTLSVerify {
		tr.TLSClientConfig = &tls.Config{
			InsecureSkipVerify: true,
			MinVersion:         tls.VersionTLS12,
		}
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: tr,
	}
}

var (
	baotaHTTPMu      sync.Mutex
	baotaHTTPClient  *http.Client
	baotaHTTPSig     string // SkipTLSVerify|DisableKeepAlive|timeoutMs — 变更时重建以复用连接池
)

func baotaHTTPClientCached(cfg Config, timeout time.Duration) *http.Client {
	if timeout <= 0 {
		timeout = 45 * time.Second
	}
	sig := fmt.Sprintf("%v|%v|%d", cfg.BaotaSkipTLSVerify, cfg.BaotaDisableHTTPKeepAlive, timeout/time.Millisecond)
	baotaHTTPMu.Lock()
	defer baotaHTTPMu.Unlock()
	if baotaHTTPClient != nil && baotaHTTPSig == sig {
		return baotaHTTPClient
	}
	baotaHTTPClient = newBaotaHTTPClient(cfg, timeout)
	baotaHTTPSig = sig
	return baotaHTTPClient
}

// CallBaotaAPI 站点/SSL 等常规接口，使用 BAOTA_HTTP_TIMEOUT_SEC（仅同步创建/删除/证书等业务路径调用）。
func CallBaotaAPI(cfg Config, apiPath string, params map[string]string) (string, error) {
	t := cfg.BaotaHTTPTimeout
	if t <= 0 {
		t = 45 * time.Second
	}
	return doBaotaPOST(cfg, t, apiPath, params)
}

func parseBaotaURLHostPort(raw string) (host, port string, err error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" {
		return "", "", errors.New("无效的 BAOTA_URL")
	}
	host = u.Hostname()
	if host == "" {
		return "", "", errors.New("无效的 BAOTA_URL：缺少主机名")
	}
	port = u.Port()
	if port == "" {
		if strings.EqualFold(u.Scheme, "https") {
			port = "443"
		} else {
			port = "80"
		}
	}
	return host, port, nil
}

func baotaTCPDialTimeout(cfg Config) time.Duration {
	t := cfg.BaotaTCPProbeTimeout
	if t <= 0 {
		return 5 * time.Second
	}
	return t
}

// ProbeBaotaTCP 仅检测面板 TCP 端口是否可达，不调用宝塔 HTTP API。
func ProbeBaotaTCP(cfg Config) error {
	host, port, err := parseBaotaURLHostPort(cfg.BaotaURL)
	if err != nil {
		return err
	}
	d := net.Dialer{Timeout: baotaTCPDialTimeout(cfg)}
	conn, err := d.Dial("tcp", net.JoinHostPort(host, port))
	if err != nil {
		return fmt.Errorf("宝塔 TCP %s:%s 不可达: %w", host, port, err)
	}
	_ = conn.Close()
	return nil
}

// ProbeBaotaTCPFromURL 供独立工具使用，仅 TCP 拨号。
func ProbeBaotaTCPFromURL(baotaURL string, dialTimeout time.Duration) error {
	host, port, err := parseBaotaURLHostPort(baotaURL)
	if err != nil {
		return err
	}
	if dialTimeout <= 0 {
		dialTimeout = 5 * time.Second
	}
	d := net.Dialer{Timeout: dialTimeout}
	conn, err := d.Dial("tcp", net.JoinHostPort(host, port))
	if err != nil {
		return fmt.Errorf("宝塔 TCP %s:%s 不可达: %w", host, port, err)
	}
	_ = conn.Close()
	return nil
}

func doBaotaPOST(cfg Config, timeout time.Duration, apiPath string, params map[string]string) (string, error) {
	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	md5Key := fmt.Sprintf("%x", md5.Sum([]byte(cfg.BaotaAPIKey)))
	requestToken := fmt.Sprintf("%x", md5.Sum([]byte(timestamp+md5Key)))

	data := url.Values{}
	data.Set("request_time", timestamp)
	data.Set("request_token", requestToken)
	for k, v := range params {
		data.Set(k, v)
	}

	reqURL := joinBaotaURL(cfg.BaotaURL, apiPath)
	req, err := http.NewRequest("POST", reqURL, strings.NewReader(data.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Add("Content-Type", "application/x-www-form-urlencoded")

	resp, err := baotaHTTPClientCached(cfg, timeout).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return "", errors.New("宝塔 API 返回异常状态: " + resp.Status)
	}
	bodyStr := string(bodyBytes)
	if err := interpretBaotaJSONBody(bodyStr); err != nil {
		return "", err
	}
	return bodyStr, nil
}

// 宝塔面板多数接口在 HTTP 200 下返回 JSON：{"status":false,"msg":"..."}，需解析后才能判断成败。
func interpretBaotaJSONBody(body string) error {
	trim := strings.TrimSpace(body)
	if trim == "" || trim[0] != '{' && trim[0] != '[' {
		return nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(trim), &m); err != nil {
		return nil
	}
	st, ok := m["status"]
	if !ok {
		return nil
	}
	if baotaStatusOK(st) {
		return nil
	}
	msg := ""
	if s, ok := m["msg"].(string); ok {
		msg = s
	}
	if msg == "" {
		msg = "宝塔 API 返回 status=false"
	}
	low := strings.ToLower(msg)
	if strings.Contains(msg, "已存在") || strings.Contains(msg, "同名") ||
		strings.Contains(low, "exist") || strings.Contains(msg, "重复") {
		return fmt.Errorf("%s: %w", msg, errBaotaAlreadyExists)
	}
	return errors.New("宝塔 API: " + msg)
}

func baotaStatusOK(v interface{}) bool {
	switch x := v.(type) {
	case bool:
		return x
	case float64:
		return x != 0
	case string:
		x = strings.TrimSpace(strings.ToLower(x))
		return x == "true" || x == "1" || x == "yes"
	default:
		return true
	}
}

// errBaotaAlreadyExists 表示站点/反代已存在，同步可忽略。
var errBaotaAlreadyExists = errors.New("baota resource already exists")

func IsBaotaAlreadyExists(err error) bool {
	return err != nil && errors.Is(err, errBaotaAlreadyExists)
}
