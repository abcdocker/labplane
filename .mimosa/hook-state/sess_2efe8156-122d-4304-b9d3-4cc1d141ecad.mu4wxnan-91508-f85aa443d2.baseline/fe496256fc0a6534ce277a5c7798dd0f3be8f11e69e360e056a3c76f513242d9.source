package internal

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/vmware/govmomi/vim25/soap"
	"github.com/vmware/govmomi/vim25/types"
)

func TestWebMKSTicketURLPrefersServerURL(t *testing.T) {
	ticket := &types.VirtualMachineTicket{
		Url:    "wss://esxi.internal/ticket/opaque",
		Host:   "ignored.internal",
		Port:   443,
		Ticket: "ignored",
	}
	got, err := webMKSTicketURL(ticket)
	if err != nil {
		t.Fatal(err)
	}
	if got != ticket.Url {
		t.Fatalf("got %q want %q", got, ticket.Url)
	}
}

func TestWebMKSTicketURLFallback(t *testing.T) {
	ticket := &types.VirtualMachineTicket{Host: "10.0.0.12", Port: 443, Ticket: "a/b"}
	got, err := webMKSTicketURL(ticket)
	if err != nil {
		t.Fatal(err)
	}
	if got != "wss://10.0.0.12:443/ticket/a%2Fb" {
		t.Fatalf("unexpected URL: %q", got)
	}
}

func TestWebMKSTicketURLForDialOverridesUnresolvableHost(t *testing.T) {
	ticket := &types.VirtualMachineTicket{
		Url:  "wss://MiWiFi-RA72-srv:443/ticket/opaque?vm=2008",
		Host: "MiWiFi-RA72-srv",
	}
	got, err := webMKSTicketURLForDial(ticket, "192.168.21.101")
	if err != nil {
		t.Fatal(err)
	}
	if got != "wss://192.168.21.101:443/ticket/opaque?vm=2008" {
		t.Fatalf("unexpected overridden URL: %q", got)
	}
}

func TestWebMKSTicketURLForDialAllowsPortOverride(t *testing.T) {
	ticket := &types.VirtualMachineTicket{
		Url:  "wss://esxi.internal:443/ticket/opaque",
		Host: "esxi.internal",
	}
	got, err := webMKSTicketURLForDial(ticket, "192.168.21.101:9443")
	if err != nil {
		t.Fatal(err)
	}
	if got != "wss://192.168.21.101:9443/ticket/opaque" {
		t.Fatalf("unexpected overridden URL: %q", got)
	}
}

func TestWebMKSTicketURLForDialRejectsPath(t *testing.T) {
	ticket := &types.VirtualMachineTicket{Url: "wss://esxi.internal/ticket/opaque"}
	if _, err := webMKSTicketURLForDial(ticket, "https://192.168.21.101/not-allowed"); err == nil {
		t.Fatal("expected invalid console host to be rejected")
	}
}

func TestWebMKSConsoleDialTargetUsesESXiOverrideAndIgnoresLegacyProxy(t *testing.T) {
	ticket := &types.VirtualMachineTicket{
		Url:    "wss://MiWiFi-RA72-srv:443/ticket/opaque",
		Host:   "MiWiFi-RA72-srv",
		Port:   443,
		Ticket: "opaque",
	}
	gotURL, gotAddress, err := webMKSConsoleDialTarget(
		ticket,
		"192.168.21.101",
		"wss://vcenter.example.com/ui/webmks/{moid}?token={ticket}",
	)
	if err != nil {
		t.Fatal(err)
	}
	if gotURL != "wss://192.168.21.101:443/ticket/opaque" {
		t.Fatalf("unexpected ESXi WebMKS URL: %q", gotURL)
	}
	if gotAddress != "" {
		t.Fatalf("unexpected separate TCP dial address: %q", gotAddress)
	}
}

func TestWebMKSUpstreamHeadersEmulateBrowserOrigin(t *testing.T) {
	headers := webMKSUpstreamHeaders("wss://192.168.21.101:443/ticket/opaque")
	if got := headers.Get("Origin"); got != "https://192.168.21.101:443" {
		t.Fatalf("unexpected Origin: %q", got)
	}
	if got := headers.Get("User-Agent"); !strings.Contains(got, "Mozilla") {
		t.Fatalf("unexpected User-Agent: %q", got)
	}
}

func TestWebMKSTLSConfigPinsTicketCertificate(t *testing.T) {
	cert := &x509.Certificate{Raw: []byte("esxi-test-certificate")}
	ticket := &types.VirtualMachineTicket{
		Host: "esxi.internal",
		CertThumbprintList: []types.VirtualMachineCertThumbprint{{
			HashAlgorithm: "SHA-256",
			Thumbprint:    soap.ThumbprintSHA256(cert),
		}},
	}
	cfg := webMKSTLSConfig(ticket, false)
	if cfg.VerifyConnection == nil {
		t.Fatal("expected ticket certificate pinning")
	}
	if err := cfg.VerifyConnection(tls.ConnectionState{PeerCertificates: []*x509.Certificate{cert}}); err != nil {
		t.Fatalf("matching certificate rejected: %v", err)
	}
	other := &x509.Certificate{Raw: []byte("other-certificate")}
	if err := cfg.VerifyConnection(tls.ConnectionState{PeerCertificates: []*x509.Certificate{other}}); err == nil ||
		!strings.Contains(err.Error(), "指纹") {
		t.Fatalf("mismatched certificate was not rejected: %v", err)
	}
}

func TestSanitizeWebMKSErrorRemovesTicketSecrets(t *testing.T) {
	ticket := &types.VirtualMachineTicket{
		Ticket:  "secret-ticket",
		CfgFile: "secret-config",
		Url:     "wss://esxi.internal/ticket/secret-ticket",
	}
	got := sanitizeWebMKSError(
		errors.New("dial wss://esxi.internal/ticket/secret-ticket failed\nsecret-config"),
		ticket,
	)
	if strings.Contains(got, "secret-ticket") || strings.Contains(got, "secret-config") {
		t.Fatalf("ticket secret was not removed: %q", got)
	}
	if strings.ContainsAny(got, "\r\n\t") {
		t.Fatalf("control characters were not removed: %q", got)
	}
}

// TestStripHTMLForLogExtractsVSphereErrorMessage 模拟 vCenter 返回的 XHTML
// 错误页（head 全是 CSS、body 里才是真正的错误原因），验证剥标签后能拿到
// 可读的错误文本，而不是被 CSS 配额占满。
func TestStripHTMLForLogExtractsVSphereErrorMessage(t *testing.T) {
	html := `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>vSphere - Error</title>
    <link rel="stylesheet" href="/ui/resources13461463/css/banners.css" />
    <style type="text/css" media="screen">
      html { height: 100%; }
      body { padding: 0; margin: 0; font-size: 13px; font-family: 'Metropolis','Avenir Next','Helvetica Neue',Arial,sans-serif; }
    </style>
  </head>
  <body class="vsphere">
    <div class="errorPageContainer">
      <div class="errorPage">
        <h1>You do not have permission to access this resource</h1>
        <p>Please contact your administrator to request the necessary privileges.</p>
      </div>
    </div>
  </body>
</html>`

	got := stripHTMLForLog(html)
	if strings.Contains(got, "<") || strings.Contains(got, ">") {
		t.Fatalf("HTML tags were not removed: %q", got)
	}
	if strings.Contains(got, "Metropolis") || strings.Contains(got, "font-family") || strings.Contains(got, ".css") {
		t.Fatalf("CSS/style content leaked into log: %q", got)
	}
	if !strings.Contains(got, "vSphere - Error") {
		t.Fatalf("expected title text to remain, got: %q", got)
	}
	if !strings.Contains(got, "You do not have permission to access this resource") {
		t.Fatalf("expected error message body to remain, got: %q", got)
	}
	if !strings.Contains(got, "Please contact your administrator") {
		t.Fatalf("expected second paragraph to remain, got: %q", got)
	}
	if strings.Contains(got, "  ") {
		t.Fatalf("whitespace was not collapsed: %q", got)
	}
}

// TestStripHTMLForLogHandlesEmptyAndPlainText 验证空串/纯文本不受影响。
func TestStripHTMLForLogHandlesEmptyAndPlainText(t *testing.T) {
	if got := stripHTMLForLog(""); got != "" {
		t.Fatalf("expected empty string, got %q", got)
	}
	if got := stripHTMLForLog("plain text without html"); got != "plain text without html" {
		t.Fatalf("plain text should pass through, got %q", got)
	}
}

// TestStripHTMLForLogHandlesTruncatedStyleBlock 模拟 gorilla/websocket 只缓存
// 前 1024 字节、</style> 没在捕获区内的场景，确保 CSS 不会再漏到日志里。
func TestStripHTMLForLogHandlesTruncatedStyleBlock(t *testing.T) {
	truncated := `<!DOCTYPE html>
<html>
  <head>
    <title>vSphere - Error</title>
    <style type="text/css" media="screen">
      html { height: 100%; }
      body { padding: 0; margin: 0; font-size: 13px; font-family: Metropolis, "Avenir Next", sans-serif; }
      .bg-image { background: linear-gradient(...); }
      /* 还有几百 KB 的 CSS 在这里被截断 */
      .missing-c`
	// 没有 </style> 也没有 </head>，完全模拟 1024 字节截断
	got := stripHTMLForLog(truncated)
	if strings.Contains(got, "font-family") || strings.Contains(got, "Metropolis") ||
		strings.Contains(got, "font-size") || strings.Contains(got, "background") ||
		strings.Contains(got, ".bg-image") {
		t.Fatalf("CSS leaked despite missing </style>: %q", got)
	}
	if !strings.Contains(got, "vSphere - Error") {
		t.Fatalf("expected title to survive, got: %q", got)
	}
}

// TestDescribeUpstreamResponseExtractsVSphereError 模拟握手失败 + vCenter
// HTML 错误页的完整链路，确保 status + 真正的错误文本都被打印出来。
func TestDescribeUpstreamResponseExtractsVSphereError(t *testing.T) {
	ticket := &types.VirtualMachineTicket{Ticket: "opaque-ticket"}
	html := `<!DOCTYPE html>
<html>
  <head>
    <title>vSphere - Error</title>
    <link rel="stylesheet" href="/ui/resources13461463/css/banners.css" />
    <style type="text/css">html { height: 100%; } body { padding: 0; }</style>
  </head>
  <body>
    <div class="errorPage">
      <h1>Unable to acquire ticket</h1>
      <p>The console ticket for this VM is invalid or has expired.</p>
    </div>
  </body>
</html>`
	resp := &http.Response{
		StatusCode: 401,
		Header:     http.Header{},
		Body:       io.NopCloser(strings.NewReader(html)),
	}
	got := describeUpstreamResponse(resp, ticket)
	if !strings.Contains(got, "status=401") {
		t.Fatalf("expected status=401 in %q", got)
	}
	if strings.Contains(got, "<title>") || strings.Contains(got, "font-family") || strings.Contains(got, ".css") {
		t.Fatalf("expected HTML/CSS to be stripped, got %q", got)
	}
	if !strings.Contains(got, "Unable to acquire ticket") {
		t.Fatalf("expected visible error text, got %q", got)
	}
	if strings.Contains(got, "opaque-ticket") {
		t.Fatalf("ticket secret leaked into log: %q", got)
	}
}

// TestProbeVCenterWebMKSEndpointSendsExpectedHeaders 验证探测请求带上了
// session cookie、session header、Origin(https)、Referer、UA，与 WebSocket
// 升级请求保持一致，避免探测和服务端实际校验之间因为头部差异产生误导。
func TestProbeVCenterWebMKSEndpointSendsExpectedHeaders(t *testing.T) {
	var gotReq *http.Request
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotReq = r.Clone(r.Context())
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`<!DOCTYPE html><html><head><title>vSphere - Error</title></head><body><h1>Forbidden</h1></body></html>`))
	}))
	defer server.Close()

	cfg := Config{VCenterInsecure: true}
	status, body, err := probeVCenterWebMKSEndpoint(context.Background(), cfg,
		"wss://"+strings.TrimPrefix(server.URL, "https://")+"/ui/webmks/vm-9?token=abc",
		"test-session-id-xyz", &types.VirtualMachineTicket{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if status != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", status)
	}
	if !strings.Contains(body, "Forbidden") {
		t.Fatalf("expected body to contain Forbidden, got %q", body)
	}
	if gotReq == nil {
		t.Fatal("server did not receive the probe request")
	}
	if gotReq.Method != http.MethodGet {
		t.Fatalf("expected GET, got %s", gotReq.Method)
	}
	if cookie := gotReq.Header.Get("Cookie"); !strings.Contains(cookie, "vmware-api-session-id=test-session-id-xyz") {
		t.Fatalf("Cookie header missing session id: %q", cookie)
	}
	if gotReq.Header.Get("vmware-api-session-id") != "test-session-id-xyz" {
		t.Fatalf("vmware-api-session-id header missing: %q", gotReq.Header.Get("vmware-api-session-id"))
	}
	if origin := gotReq.Header.Get("Origin"); !strings.HasPrefix(origin, "https://") {
		t.Fatalf("Origin must use https scheme for browser compatibility, got %q", origin)
	}
	if ua := gotReq.Header.Get("User-Agent"); !strings.Contains(ua, "Mozilla") {
		t.Fatalf("User-Agent should look like a browser, got %q", ua)
	}
}

// TestProbeVCenterSessionCookieDistinguishesCookieTransport 模拟两个场景：
// 1) vCenter 接受 cookie → 200 + session id（说明 cookie 透传正常，问题在 /ui/webmks/ 反代）
// 2) vCenter 不接受 cookie → 401（说明 cookie 没到 vCenter，问题在 FRP 透传 / 域不匹配）
func TestProbeVCenterSessionCookieDistinguishesCookieTransport(t *testing.T) {
	t.Run("valid_cookie_returns_200", func(t *testing.T) {
		server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/session" {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			cookie, err := r.Cookie("vmware-api-session-id")
			if err != nil || cookie.Value == "" {
				http.Error(w, "missing session", http.StatusUnauthorized)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(cookie.Value)
		}))
		defer server.Close()

		cfg := Config{VCenterURL: server.URL, VCenterInsecure: true}
		status, body, err := probeVCenterSessionCookie(context.Background(), cfg, "abc-123")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if status != http.StatusOK {
			t.Fatalf("expected 200, got %d (body=%q)", status, body)
		}
		if !strings.Contains(body, "abc-123") {
			t.Fatalf("expected session id in body, got %q", body)
		}
	})
	t.Run("missing_cookie_returns_401", func(t *testing.T) {
		server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error_type":"UNAUTHENTICATED"}`))
		}))
		defer server.Close()

		cfg := Config{VCenterURL: server.URL, VCenterInsecure: true}
		status, _, err := probeVCenterSessionCookie(context.Background(), cfg, "ignored")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if status != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", status)
		}
	})
}

func TestVCenterAPIBaseURL(t *testing.T) {
	cases := []struct {
		name string
		url  string
		want string
		err  bool
	}{
		{"https_with_sdk_path", "https://vcenter.example.com/sdk", "https://vcenter.example.com/sdk", false},
		{"https_no_path", "https://vcenter.example.com", "https://vcenter.example.com", false},
		{"http_with_port", "http://vcenter.local:8080", "http://vcenter.local:8080", false},
		{"missing_scheme_uses_https", "vcenter.example.com", "https://vcenter.example.com", false},
		{"empty", "", "", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := vcenterAPIBaseURL(Config{VCenterURL: c.url})
			if c.err {
				if err == nil {
					t.Fatalf("expected error, got %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != c.want {
				t.Fatalf("got %q want %q", got, c.want)
			}
		})
	}
}

func TestTruncateWebSocketCloseReasonKeepsValidUTF8(t *testing.T) {
	got := truncateWebSocketCloseReason(strings.Repeat("内部连接失败", 30))
	if len(got) > 123 {
		t.Fatalf("close reason is too large: %d bytes", len(got))
	}
	if !utf8.ValidString(got) {
		t.Fatalf("close reason is invalid UTF-8: %q", got)
	}
}

func TestWebMKSProxyURLSubstitutesPlaceholders(t *testing.T) {
	ticket := &types.VirtualMachineTicket{Ticket: "abc/123?x=y"}
	got, err := webMKSProxyURL("wss://vcenter.example.com/ui/webmks/{moid}?token={ticket}", "vm-2037", ticket)
	if err != nil {
		t.Fatal(err)
	}
	want := "wss://vcenter.example.com/ui/webmks/vm-2037?token=abc%2F123%3Fx%3Dy"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestWebMKSProxyURLWithoutPlaceholders(t *testing.T) {
	ticket := &types.VirtualMachineTicket{Ticket: "abc"}
	got, err := webMKSProxyURL("wss://vcenter.example.com/console/static", "vm-1", ticket)
	if err != nil {
		t.Fatal(err)
	}
	if got != "wss://vcenter.example.com/console/static" {
		t.Fatalf("unexpected URL: %q", got)
	}
}

func TestWebMKSProxyURLRejectsBadScheme(t *testing.T) {
	ticket := &types.VirtualMachineTicket{Ticket: "abc"}
	if _, err := webMKSProxyURL("https://vcenter.example.com/ui/webmks/{moid}?token={ticket}", "vm-1", ticket); err == nil {
		t.Fatal("expected non-wss/ws scheme to be rejected")
	}
}

func TestWebMKSProxyURLRejectsEmptyTicket(t *testing.T) {
	if _, err := webMKSProxyURL("wss://vcenter/{moid}", "vm-1", nil); err == nil {
		t.Fatal("expected nil ticket to be rejected")
	}
}

func TestAcquireVCenterRESTSessionSuccess(t *testing.T) {
	var gotUser, gotPass string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/session" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method", http.StatusMethodNotAllowed)
			return
		}
		u, p, ok := r.BasicAuth()
		if !ok {
			http.Error(w, "missing basic auth", http.StatusUnauthorized)
			return
		}
		gotUser = u
		gotPass = p
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Set-Cookie", "vmware_soap_session=session-abc-123; Path=/; HttpOnly")
		_, _ = w.Write([]byte(`{"id":"from-body-ignored"}`))
	}))
	defer server.Close()

	cfg := Config{
		VCenterURL:      server.URL,
		VCenterUser:     "admin",
		VCenterPassword: "secret",
		VCenterInsecure: true,
	}
	id, err := acquireVCenterRESTSession(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id != "session-abc-123" {
		t.Fatalf("got session id %q want %q", id, "session-abc-123")
	}
	if gotUser != "admin" || gotPass != "secret" {
		t.Fatalf("credentials not posted as expected: user=%q pass=%q", gotUser, gotPass)
	}
}

// vSphere 7+ 标准响应：裸 JSON 字符串，无 Set-Cookie。
// 这正是用户实际遇到的 vCenter 配置（frp 隧道也未透传 Set-Cookie）。
func TestAcquireVCenterRESTSessionParsesPlainJSONString(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/session" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if _, _, ok := r.BasicAuth(); !ok {
			http.Error(w, "missing basic auth", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		// vSphere 7+ 的真实响应体是裸 JSON 字符串
		_, _ = w.Write([]byte(`"524f3a40-xyz789"`))
	}))
	defer server.Close()

	cfg := Config{
		VCenterURL:      server.URL,
		VCenterUser:     "admin",
		VCenterPassword: "secret",
		VCenterInsecure: true,
	}
	id, err := acquireVCenterRESTSession(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id != "524f3a40-xyz789" {
		t.Fatalf("got session id %q want %q", id, "524f3a40-xyz789")
	}
}

func TestAcquireVCenterRESTSessionParsesLegacyJSONObject(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, _, ok := r.BasicAuth(); !ok {
			http.Error(w, "missing basic auth", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"value":"legacy-session-id","created":"2024-01-01T00:00:00Z"}`))
	}))
	defer server.Close()

	cfg := Config{
		VCenterURL:      server.URL,
		VCenterUser:     "admin",
		VCenterPassword: "secret",
		VCenterInsecure: true,
	}
	id, err := acquireVCenterRESTSession(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id != "legacy-session-id" {
		t.Fatalf("got session id %q want %q", id, "legacy-session-id")
	}
}

func TestAcquireVCenterRESTSessionFallsBackToJSONBody(t *testing.T) {
	var sawBasicAuth bool
	var bodyUsername, bodyPassword string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, _, ok := r.BasicAuth(); ok {
			sawBasicAuth = true
			http.Error(w, "forbidden basic auth", http.StatusForbidden)
			return
		}
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		bodyUsername = body.Username
		bodyPassword = body.Password
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"id": "session-json-456"})
	}))
	defer server.Close()

	cfg := Config{
		VCenterURL:      server.URL,
		VCenterUser:     "admin",
		VCenterPassword: "secret",
		VCenterInsecure: true,
	}
	id, err := acquireVCenterRESTSession(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id != "session-json-456" {
		t.Fatalf("got session id %q want %q", id, "session-json-456")
	}
	if !sawBasicAuth {
		t.Fatal("expected Basic Auth attempt first")
	}
	if bodyUsername != "admin" || bodyPassword != "secret" {
		t.Fatalf("JSON body credentials missing: user=%q pass=%q", bodyUsername, bodyPassword)
	}
}

func TestAcquireVCenterRESTSessionRejectsUnauthorized(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte("<html><body>login required</body></html>"))
	}))
	defer server.Close()

	cfg := Config{
		VCenterURL:      server.URL,
		VCenterUser:     "admin",
		VCenterPassword: "wrong",
		VCenterInsecure: true,
	}
	_, err := acquireVCenterRESTSession(context.Background(), cfg)
	if err == nil {
		t.Fatal("expected unauthorized error")
	}
	if !strings.Contains(err.Error(), "401") {
		t.Fatalf("expected 401 in error, got: %v", err)
	}
}

func TestAcquireVCenterRESTSessionRejectsMalformed(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("not-json"))
	}))
	defer server.Close()

	cfg := Config{
		VCenterURL:      server.URL,
		VCenterUser:     "admin",
		VCenterPassword: "x",
		VCenterInsecure: true,
	}
	_, err := acquireVCenterRESTSession(context.Background(), cfg)
	if err == nil || !strings.Contains(err.Error(), "解析") {
		t.Fatalf("expected parse error, got: %v", err)
	}
}

func TestAcquireVCenterRESTSessionRequiresURL(t *testing.T) {
	if _, err := acquireVCenterRESTSession(context.Background(), Config{}); err == nil {
		t.Fatal("expected error when vCenter URL is empty")
	}
}

func TestAcquireVCenterRESTSessionRequiresCredentials(t *testing.T) {
	cfg := Config{VCenterURL: "https://vcenter.example.com"}
	if _, err := acquireVCenterRESTSession(context.Background(), cfg); err == nil {
		t.Fatal("expected error when username is empty")
	}
	cfg.VCenterUser = "admin"
	if _, err := acquireVCenterRESTSession(context.Background(), cfg); err == nil {
		t.Fatal("expected error when password is empty")
	}
}

func TestSessionHostForLog(t *testing.T) {
	cases := []struct {
		url  string
		want string
	}{
		{"https://cmdb.example.com/sdk", "cmdb.example.com"},
		{"http://vcenter.example.com:8080", "vcenter.example.com"},
		{"vcenter.example.com", "vcenter.example.com"},
		{"", ""},
		{"  https://vcenter.example.com/  ", "vcenter.example.com"},
	}
	for _, c := range cases {
		cfg := Config{VCenterURL: c.url}
		if got := sessionHostForLog(cfg); got != c.want {
			t.Errorf("sessionHostForLog(%q) = %q, want %q", c.url, got, c.want)
		}
	}
}

func TestSessionIDPrefix(t *testing.T) {
	if got := sessionIDPrefix(""); got != "" {
		t.Errorf("empty id should be empty, got %q", got)
	}
	if got := sessionIDPrefix("abc"); got != "abc" {
		t.Errorf("short id should pass through, got %q", got)
	}
	if got := sessionIDPrefix("abcdefghij"); got != "abcdefgh..." {
		t.Errorf("long id should be truncated with ellipsis, got %q", got)
	}
	if got := sessionIDPrefix("  abcdefghij  "); got != "abcdefgh..." {
		t.Errorf("id should be trimmed before truncation, got %q", got)
	}
}
