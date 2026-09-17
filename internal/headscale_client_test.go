package internal

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHeadscaleClientListNodes(t *testing.T) {
	meshAllowLoopbackForTest = true
	defer func() { meshAllowLoopbackForTest = false }()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("missing bearer auth: %q", got)
		}
		if r.URL.Path != "/api/v1/node" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"nodes":[{"id":"26","givenName":"ops","name":"ops","online":true,
			"ipAddresses":["100.64.0.1"],"user":{"id":"2","name":"abcdocker","provider":"oidc"},
			"approvedRoutes":["192.168.21.0/24"],"availableRoutes":["192.168.21.0/24"],
			"subnetRoutes":["192.168.21.0/24"],"tags":[],"lastSeen":"2026-09-16T18:16:56Z"}]}`))
	}))
	defer srv.Close()
	cli, err := newHeadscaleClient(srv.URL, "test-key", 5*time.Second)
	if err != nil {
		t.Fatalf("newHeadscaleClient: %v", err)
	}
	nodes, err := cli.ListNodes(context.Background())
	if err != nil {
		t.Fatalf("ListNodes: %v", err)
	}
	if len(nodes) != 1 || nodes[0].GivenName != "ops" || len(nodes[0].ApprovedRoutes) != 1 {
		t.Fatalf("unexpected nodes: %+v", nodes)
	}
}

func TestHeadscaleClientSetApprovedRoutes(t *testing.T) {
	meshAllowLoopbackForTest = true
	defer func() { meshAllowLoopbackForTest = false }()
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	cli, err := newHeadscaleClient(srv.URL, "k", 5*time.Second)
	if err != nil {
		t.Fatalf("newHeadscaleClient: %v", err)
	}
	if err := cli.SetApprovedRoutes(context.Background(), "24", []string{"192.168.31.0/24"}); err != nil {
		t.Fatalf("SetApprovedRoutes: %v", err)
	}
	if gotPath != "/api/v1/node/24/approve_routes" {
		t.Fatalf("path = %s（v0.28 实测为 approve_routes）", gotPath)
	}
}

func TestHeadscaleClientPreAuthKeys(t *testing.T) {
	meshAllowLoopbackForTest = true
	defer func() { meshAllowLoopbackForTest = false }()
	var createdUserID any
	var expiredKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/preauthkey" && r.URL.Query().Get("user") == "abcdocker":
			_, _ = w.Write([]byte(`{"preAuthKeys":[{"id":"1","key":"hskey-auth-xxx-***","reusable":true,"used":false,"expiration":"2026-07-07T14:28:17Z","user":{"name":"abcdocker"}}]}`))
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/preauthkey":
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			createdUserID = body["user"]
			// v0.28 响应为包装结构，且完整 key 仅此响应返回
			_, _ = w.Write([]byte(`{"preAuthKey":{"id":"9","key":"hskey-auth-new-full-key","reusable":false,"used":false,"user":{"name":"abcdocker"}}}`))
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/preauthkey/expire":
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			expiredKey, _ = body["key"].(string)
			w.WriteHeader(http.StatusOK)
		default:
			t.Fatalf("unexpected %s %s", r.Method, r.URL.Path)
		}
	}))
	defer srv.Close()
	cli, _ := newHeadscaleClient(srv.URL, "k", 5*time.Second)
	keys, err := cli.ListPreAuthKeys(context.Background(), "abcdocker")
	if err != nil || len(keys) != 1 || keys[0].Key != "hskey-auth-xxx-***" {
		t.Fatalf("ListPreAuthKeys: %v %+v", err, keys)
	}
	created, err := cli.CreatePreAuthKey(context.Background(), 2, false, false, nil, nil)
	if err != nil || created.Key != "hskey-auth-new-full-key" {
		t.Fatalf("CreatePreAuthKey: %v %+v", err, created)
	}
	if createdUserID != float64(2) {
		t.Fatalf("create user 字段应为数字 ID，实际 %v", createdUserID)
	}
	if err := cli.ExpirePreAuthKey(context.Background(), 2, "hskey-auth-xxx"); err != nil || expiredKey != "hskey-auth-xxx" {
		t.Fatalf("ExpirePreAuthKey: %v key=%q", err, expiredKey)
	}
}

func TestValidateMeshOutboundURL(t *testing.T) {
	meshAllowLoopbackForTest = false
	for _, ok := range []string{"https://headscale.frps.cn", "http://192.168.21.99:8080", "http://152.136.120.44:9090"} {
		if _, err := validateMeshOutboundURL(ok); err != nil {
			t.Errorf("expected %q to pass, got %v", ok, err)
		}
	}
	for _, bad := range []string{"http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:9000", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "ftp://x", "http://0.0.0.0:8080"} {
		if _, err := validateMeshOutboundURL(bad); err == nil {
			t.Errorf("expected %q to be rejected", bad)
		}
	}
}

func TestParsePromText(t *testing.T) {
	text := `# HELP headscale_nodestore_nodes_total Number of nodes.
# TYPE headscale_nodestore_nodes_total gauge
headscale_nodestore_nodes_total 17
headscale_api_requests_total{code="200",method="GET"} 42
garbage-line-not-parseable
`
	samples := parsePromText(bufio.NewScanner(strings.NewReader(text)))
	if len(samples) != 2 {
		t.Fatalf("expected 2 samples, got %d: %+v", len(samples), samples)
	}
	if samples[0].Name != "headscale_nodestore_nodes_total" || samples[0].Value != 17 {
		t.Fatalf("sample0 = %+v", samples[0])
	}
	if samples[1].Labels["method"] != "GET" || samples[1].Value != 42 {
		t.Fatalf("sample1 = %+v", samples[1])
	}
}

func TestDeriveMetricsURL(t *testing.T) {
	got := deriveMetricsURL("https://headscale.frps.cn")
	if got != "http://headscale.frps.cn:9090/metrics" {
		t.Fatalf("deriveMetricsURL = %s", got)
	}
}
