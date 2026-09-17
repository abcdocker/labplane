package internal

// Authentik 管理 API 客户端（/api/v3，Bearer Token）。
// 覆盖常用管理面：用户、用户组、应用、OAuth2 提供程序、授权 Flow、事件与系统状态。
// 列表接口为分页结构 {pagination, results}，此处统一取 results（page_size 拉满一页，
// 平台场景对象量级小，不做翻页循环）。

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type authentikClient struct {
	base  *url.URL
	token string
	hc    *http.Client
}

func newAuthentikClient(baseURL, token string, timeout time.Duration) (*authentikClient, error) {
	u, err := validateMeshOutboundURL(baseURL)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(token) == "" {
		return nil, fmt.Errorf("未配置 API Token")
	}
	if timeout <= 0 {
		timeout = 15 * time.Second
	}
	return &authentikClient{base: u, token: strings.TrimSpace(token), hc: &http.Client{Timeout: timeout}}, nil
}

func (a *authentikClient) do(ctx context.Context, method, path string, query url.Values, body any, out any) error {
	u := *a.base
	u.Path = strings.TrimSuffix(u.Path, "/") + "/api/v3" + path
	if query != nil {
		u.RawQuery = query.Encode()
	}
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, u.String(), rd)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+a.token)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := a.hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if resp.StatusCode >= 400 {
		msg := strings.TrimSpace(string(raw))
		var he struct {
			Detail string `json:"detail"`
		}
		if json.Unmarshal(raw, &he) == nil && strings.TrimSpace(he.Detail) != "" {
			msg = he.Detail
		}
		if len(msg) > 300 {
			msg = msg[:300]
		}
		return fmt.Errorf("authentik HTTP %d: %s", resp.StatusCode, msg)
	}
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return fmt.Errorf("解析 authentik 响应失败: %w", err)
		}
	}
	return nil
}

// listPaged 请求分页列表并返回 results 原始 JSON。
func (a *authentikClient) listPaged(ctx context.Context, path string, query url.Values) ([]json.RawMessage, error) {
	if query == nil {
		query = url.Values{}
	}
	query.Set("page_size", "100")
	var out struct {
		Results []json.RawMessage `json:"results"`
	}
	if err := a.do(ctx, http.MethodGet, path, query, nil, &out); err != nil {
		return nil, err
	}
	return out.Results, nil
}

func unmarshalInto[T any](raws []json.RawMessage) ([]T, error) {
	out := make([]T, 0, len(raws))
	for _, r := range raws {
		var v T
		if err := json.Unmarshal(r, &v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}

// pagedCount 用 page_size=1 的 pagination.count 取总数（供状态汇总）。
func (a *authentikClient) pagedCount(ctx context.Context, path string) (int, error) {
	q := url.Values{"page_size": []string{"1"}}
	var out struct {
		Pagination struct {
			Count int `json:"count"`
		} `json:"pagination"`
	}
	if err := a.do(ctx, http.MethodGet, path, q, nil, &out); err != nil {
		return 0, err
	}
	return out.Pagination.Count, nil
}

// ── 类型 ──

type AKUser struct {
	PK        int64    `json:"pk"`
	Username  string   `json:"username"`
	Name      string   `json:"name"`
	Email     string   `json:"email"`
	IsActive  bool     `json:"is_active"`
	Groups    []string `json:"groups"`
	Type      string   `json:"type"`
	UUID      string   `json:"uuid"`
	Path      string   `json:"path"`
	LastLogin string   `json:"last_login"`
}

type AKGroup struct {
	PK     string `json:"pk"`
	Name   string `json:"name"`
	Parent string `json:"parent,omitempty"`
}

type AKApp struct {
	PK               string `json:"pk"`
	Name             string `json:"name"`
	Slug             string `json:"slug"`
	Provider         any    `json:"provider,omitempty"`
	MetaLaunchURL    string `json:"meta_launch_url,omitempty"`
	PolicyEngineMode string `json:"policy_engine_mode,omitempty"`
}

// AKRedirectURI 兼容 authentik 新旧 API 格式：2024.2 前为纯字符串，
// 之后为 {"matching_mode": "...", "url": "..."} 对象。
type AKRedirectURI struct {
	URL          string `json:"url"`
	MatchingMode string `json:"matchingMode,omitempty"`
}

func (r *AKRedirectURI) UnmarshalJSON(b []byte) error {
	s := strings.TrimSpace(string(b))
	if len(s) >= 2 && s[0] == '"' {
		r.URL = ""
		return json.Unmarshal(b, &r.URL)
	}
	var obj struct {
		URL          string `json:"url"`
		MatchingMode string `json:"matching_mode"`
	}
	if err := json.Unmarshal(b, &obj); err != nil || strings.TrimSpace(obj.URL) == "" {
		r.URL = s // 无法识别的结构原样保留，不让单条 URI 拖垮整个列表
		return nil
	}
	r.URL = obj.URL
	r.MatchingMode = obj.MatchingMode
	return nil
}

type AKOAuth2Provider struct {
	PK                int64           `json:"pk"`
	Name              string          `json:"name"`
	ClientID          string          `json:"client_id"`
	ClientSecret      string          `json:"client_secret,omitempty"` // 仅创建响应返回
	RedirectURIs      []AKRedirectURI `json:"redirect_uris"`
	SubMode           string          `json:"sub_mode"`
	AuthorizationFlow string          `json:"authorization_flow"`
}

type AKFlow struct {
	PK   string `json:"pk"`
	Slug string `json:"slug"`
	Name string `json:"name"`
}

// ── 用户 ──

func (a *authentikClient) ListUsers(ctx context.Context, search string) ([]AKUser, error) {
	q := url.Values{}
	if strings.TrimSpace(search) != "" {
		q.Set("search", strings.TrimSpace(search))
	}
	raws, err := a.listPaged(ctx, "/core/users/", q)
	if err != nil {
		return nil, err
	}
	return unmarshalInto[AKUser](raws)
}

func (a *authentikClient) CreateUser(ctx context.Context, body map[string]any) (AKUser, error) {
	var out AKUser
	err := a.do(ctx, http.MethodPost, "/core/users/", nil, body, &out)
	return out, err
}

func (a *authentikClient) PatchUser(ctx context.Context, pk int64, body map[string]any) error {
	return a.do(ctx, http.MethodPatch, fmt.Sprintf("/core/users/%d/", pk), nil, body, nil)
}

func (a *authentikClient) SetUserPassword(ctx context.Context, pk int64, password string) error {
	return a.do(ctx, http.MethodPost, fmt.Sprintf("/core/users/%d/set_password/", pk), nil, map[string]any{"password": password}, nil)
}

func (a *authentikClient) DeleteUser(ctx context.Context, pk int64) error {
	return a.do(ctx, http.MethodDelete, fmt.Sprintf("/core/users/%d/", pk), nil, nil, nil)
}

// ── 用户组 ──

func (a *authentikClient) ListGroups(ctx context.Context, search string) ([]AKGroup, error) {
	q := url.Values{}
	if strings.TrimSpace(search) != "" {
		q.Set("search", strings.TrimSpace(search))
	}
	raws, err := a.listPaged(ctx, "/core/groups/", q)
	if err != nil {
		return nil, err
	}
	return unmarshalInto[AKGroup](raws)
}

func (a *authentikClient) CreateGroup(ctx context.Context, name string) (AKGroup, error) {
	var out AKGroup
	err := a.do(ctx, http.MethodPost, "/core/groups/", nil, map[string]any{"name": name}, &out)
	return out, err
}

// ── 应用 ──

func (a *authentikClient) ListApps(ctx context.Context) ([]AKApp, error) {
	raws, err := a.listPaged(ctx, "/core/applications/", nil)
	if err != nil {
		return nil, err
	}
	return unmarshalInto[AKApp](raws)
}

func (a *authentikClient) CreateApp(ctx context.Context, name, slug string, provider any) (AKApp, error) {
	body := map[string]any{"name": name, "slug": slug, "policy_engine_mode": "any"}
	if provider != nil {
		body["provider"] = provider
	}
	var out AKApp
	err := a.do(ctx, http.MethodPost, "/core/applications/", nil, body, &out)
	return out, err
}

func (a *authentikClient) DeleteApp(ctx context.Context, slug string) error {
	return a.do(ctx, http.MethodDelete, "/core/applications/"+url.PathEscape(slug)+"/", nil, nil, nil)
}

// ── OAuth2 提供程序 ──

func (a *authentikClient) ListOAuth2Providers(ctx context.Context) ([]AKOAuth2Provider, error) {
	raws, err := a.listPaged(ctx, "/providers/oauth2/", nil)
	if err != nil {
		return nil, err
	}
	return unmarshalInto[AKOAuth2Provider](raws)
}

// CreateOAuth2Provider 创建 OIDC 提供程序；client_secret 仅本次响应返回。
func (a *authentikClient) CreateOAuth2Provider(ctx context.Context, name string, redirectURIs []string, flowPK string) (AKOAuth2Provider, error) {
	body := map[string]any{
		"name":                   name,
		"authorization_flow":     flowPK,
		"redirect_uris":          redirectURIs,
		"sub_mode":               "user_email",
		"access_token_validity":  "hours=1",
		"refresh_token_validity": "days=30",
	}
	var out AKOAuth2Provider
	err := a.do(ctx, http.MethodPost, "/providers/oauth2/", nil, body, &out)
	return out, err
}

// ── Flow / 绑定 ──

func (a *authentikClient) FindFlowBySlug(ctx context.Context, slug string) (AKFlow, error) {
	q := url.Values{"slug": []string{slug}}
	raws, err := a.listPaged(ctx, "/flows/instances/", q)
	if err != nil {
		return AKFlow{}, err
	}
	flows, err := unmarshalInto[AKFlow](raws)
	if err != nil {
		return AKFlow{}, err
	}
	if len(flows) == 0 {
		return AKFlow{}, fmt.Errorf("未找到授权 Flow %q（请在 Authentik 中确认默认隐式授权流程存在）", slug)
	}
	return flows[0], nil
}

// CreateAppGroupBinding 把用户组绑定到应用（组内成员可见/可访问）。
func (a *authentikClient) CreateAppGroupBinding(ctx context.Context, appPK, groupPK string) error {
	body := map[string]any{"target": appPK, "group": groupPK, "order": 0}
	return a.do(ctx, http.MethodPost, "/policy/bindings/", nil, body, nil)
}

// ── 事件与系统状态 ──

func (a *authentikClient) ListEvents(ctx context.Context, perPage int) ([]map[string]any, error) {
	if perPage <= 0 || perPage > 50 {
		perPage = 20
	}
	q := url.Values{"page_size": []string{fmt.Sprintf("%d", perPage)}}
	var out struct {
		Results []map[string]any `json:"results"`
	}
	err := a.do(ctx, http.MethodGet, "/events/events/", q, nil, &out)
	return out.Results, err
}

func (a *authentikClient) SystemInfo(ctx context.Context) (map[string]any, error) {
	var out map[string]any
	err := a.do(ctx, http.MethodGet, "/admin/system/", nil, nil, &out)
	return out, err
}

// Counts 并发友好的对象计数（状态汇总用）。
func (a *authentikClient) Counts(ctx context.Context) (users, groups, apps, providers int) {
	users, _ = a.pagedCount(ctx, "/core/users/")
	groups, _ = a.pagedCount(ctx, "/core/groups/")
	apps, _ = a.pagedCount(ctx, "/core/applications/")
	providers, _ = a.pagedCount(ctx, "/providers/oauth2/")
	return
}
