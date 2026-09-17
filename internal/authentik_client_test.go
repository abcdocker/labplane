package internal

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newAuthentikTestServer(t *testing.T, handler http.HandlerFunc) *authentikClient {
	t.Helper()
	meshAllowLoopbackForTest = true
	t.Cleanup(func() { meshAllowLoopbackForTest = false })
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	cli, err := newAuthentikClient(srv.URL, "ak-token", 5*time.Second)
	if err != nil {
		t.Fatalf("newAuthentikClient: %v", err)
	}
	return cli
}

func TestAuthentikClientListUsers(t *testing.T) {
	cli := newAuthentikTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer ak-token" {
			t.Fatalf("missing bearer: %q", got)
		}
		if r.URL.Path != "/api/v3/core/users/" {
			t.Fatalf("path = %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"pagination": map[string]any{"count": 1},
			"results": []map[string]any{
				{"pk": 3, "username": "abcdocker", "name": "abcdocker", "email": "a@b.c", "is_active": true, "groups": []string{"g-uuid"}},
			},
		})
	})
	users, err := cli.ListUsers(context.Background(), "")
	if err != nil || len(users) != 1 || users[0].Username != "abcdocker" || users[0].PK != 3 {
		t.Fatalf("ListUsers: %v %+v", err, users)
	}
}

func TestAuthentikClientCreateUserLifecycle(t *testing.T) {
	var setPwCalled bool
	cli := newAuthentikTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/api/v3/core/users/":
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["username"] != "newuser" {
				t.Fatalf("username = %v", body["username"])
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"pk": 9, "username": "newuser", "is_active": true, "groups": body["groups"]})
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/set_password/"):
			setPwCalled = true
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodPatch && r.URL.Path == "/api/v3/core/users/9/":
			w.WriteHeader(http.StatusOK)
		default:
			t.Fatalf("unexpected %s %s", r.Method, r.URL.Path)
		}
	})
	user, err := cli.CreateUser(context.Background(), map[string]any{"username": "newuser", "groups": []string{"g1"}})
	if err != nil || user.PK != 9 {
		t.Fatalf("CreateUser: %v %+v", err, user)
	}
	if err := cli.SetUserPassword(context.Background(), 9, "secret"); err != nil || !setPwCalled {
		t.Fatalf("SetUserPassword: %v setPw=%v", err, setPwCalled)
	}
	if err := cli.PatchUser(context.Background(), 9, map[string]any{"is_active": false}); err != nil {
		t.Fatalf("PatchUser: %v", err)
	}
}

func TestAuthentikAppWizardChain(t *testing.T) {
	cli := newAuthentikTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/v3/flows/instances/":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"pagination": map[string]any{"count": 1},
				"results":    []map[string]any{{"pk": "flow-uuid", "slug": "default-provider-authorization-implicit-consent", "name": "implicit"}},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/api/v3/providers/oauth2/":
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["authorization_flow"] != "flow-uuid" {
				t.Fatalf("flow = %v", body["authorization_flow"])
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"pk": 7, "name": "x", "client_id": "cid", "client_secret": "sec", "redirect_uris": []string{"https://app/cb"}})
		case r.Method == http.MethodPost && r.URL.Path == "/api/v3/core/applications/":
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["provider"] != float64(7) {
				t.Fatalf("provider = %v", body["provider"])
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"pk": "app-uuid", "name": "MyApp", "slug": "myapp"})
		case r.Method == http.MethodPost && r.URL.Path == "/api/v3/policy/bindings/":
			w.WriteHeader(http.StatusCreated)
		default:
			t.Fatalf("unexpected %s %s", r.Method, r.URL.Path)
		}
	})
	ctx := context.Background()
	flow, err := cli.FindFlowBySlug(ctx, "default-provider-authorization-implicit-consent")
	if err != nil {
		t.Fatalf("FindFlowBySlug: %v", err)
	}
	provider, err := cli.CreateOAuth2Provider(ctx, "MyApp (OIDC)", []string{"https://app/cb"}, flow.PK)
	if err != nil || provider.ClientSecret != "sec" {
		t.Fatalf("CreateOAuth2Provider: %v %+v", err, provider)
	}
	app, err := cli.CreateApp(ctx, "MyApp", "myapp", provider.PK)
	if err != nil || app.Slug != "myapp" {
		t.Fatalf("CreateApp: %v %+v", err, app)
	}
	if err := cli.CreateAppGroupBinding(ctx, app.PK, "group-uuid"); err != nil {
		t.Fatalf("CreateAppGroupBinding: %v", err)
	}
}

func TestAuthentikCountsUsesPagination(t *testing.T) {
	cli := newAuthentikTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("page_size") != "1" {
			t.Fatalf("page_size = %s", r.URL.Query().Get("page_size"))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"pagination": map[string]any{"count": 42}, "results": []any{}})
	})
	if n, _ := cli.pagedCount(context.Background(), "/core/users/"); n != 42 {
		t.Fatalf("count = %d", n)
	}
}

// authentik 2024.2+ 的 redirect_uris 是对象数组（{matching_mode, url}），旧版为字符串数组；
// 两种格式都必须能解析，且单条异常不应拖垮整个列表。
func TestAuthentikListOAuth2ProvidersRedirectURIForms(t *testing.T) {
	cli := newAuthentikTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"pagination": map[string]any{"count": 3},
			"results": []map[string]any{
				{"pk": 29, "name": "new-format", "client_id": "c1",
					"redirect_uris": []any{
						map[string]any{"matching_mode": "strict", "url": "https://a/cb"},
						map[string]any{"matching_mode": "regex", "url": "https://b/.*"},
					}},
				{"pk": 30, "name": "old-format", "client_id": "c2", "redirect_uris": []any{"https://c/cb"}},
				{"pk": 31, "name": "weird-element", "client_id": "c3", "redirect_uris": []any{map[string]any{"unexpected": true}}},
			},
		})
	})
	providers, err := cli.ListOAuth2Providers(context.Background())
	if err != nil {
		t.Fatalf("ListOAuth2Providers: %v", err)
	}
	if len(providers) != 3 {
		t.Fatalf("len = %d", len(providers))
	}
	if providers[0].RedirectURIs[0].URL != "https://a/cb" || providers[0].RedirectURIs[0].MatchingMode != "strict" {
		t.Fatalf("new format parse: %+v", providers[0].RedirectURIs)
	}
	if providers[1].RedirectURIs[0].URL != "https://c/cb" || providers[1].RedirectURIs[0].MatchingMode != "" {
		t.Fatalf("old format parse: %+v", providers[1].RedirectURIs)
	}
	if providers[2].RedirectURIs[0].URL == "" {
		t.Fatalf("weird element should keep raw fallback: %+v", providers[2].RedirectURIs)
	}
}
