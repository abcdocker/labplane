package internal

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"
)

const (
	oidcStateCookie       = "oidc_state"
	oidcNonceCookie       = "oidc_nonce"
	oidcIntentCookie      = "oidc_intent"
	oidcIntentLogin       = "login"
	oidcIntentBind        = "bind"
	oidcBindTargetCookie  = "oidc_bind_target"
	oidcBindReturnCookie  = "oidc_bind_return" // "settings" | "users"
	oidcBindReturnUsers   = "users"
	oidcBindReturnSettings = "settings"
	oidcPostLoginReturnCookie = "oidc_post_login_return" // base64url(UTF-8 path); 登录成功后跳转
)

// 用户常把 JWT「声明名」误填进 OAuth scope；发往 IdP 无效。OIDC 登录名与平台用户通过绑定后的 issuer+sub 关联，与 scope 无关。
var oidcScopeTokensMistakenForClaims = map[string]struct{}{
	"preferred_username": {},
	"name":               {},
	"username":           {},
	"sub":                {},
	"given_name":         {},
	"family_name":        {},
	"email_verified":     {},
	"nickname":           {},
}

func oidcScopesListMistakenTokens(fields []string) []string {
	var bad []string
	for _, raw := range fields {
		low := strings.ToLower(strings.TrimSpace(raw))
		if low == "" {
			continue
		}
		if _, ok := oidcScopeTokensMistakenForClaims[low]; ok {
			bad = append(bad, strings.TrimSpace(raw))
		}
	}
	return bad
}

// oidcScopesFromConfig 生成授权请求 scope；过滤误填的声明名，并保证含 openid；若因过滤导致缺 profile/email 则补全，便于 id_token 带常用声明。
func oidcScopesFromConfig(cfg Config) []string {
	s := strings.TrimSpace(cfg.OIDCScopes)
	if s == "" {
		return []string{oidc.ScopeOpenID, "profile", "email"}
	}
	fields := strings.Fields(s)
	seen := map[string]bool{}
	var stripped []string
	var out []string
	for _, raw := range fields {
		t := strings.TrimSpace(raw)
		if t == "" {
			continue
		}
		low := strings.ToLower(t)
		if _, mistaken := oidcScopeTokensMistakenForClaims[low]; mistaken {
			stripped = append(stripped, t)
			continue
		}
		if seen[low] {
			continue
		}
		seen[low] = true
		out = append(out, t)
	}
	if len(stripped) > 0 {
		log.Printf("oidc: oidcScopes 中下列为声明名而非 OAuth scope，已忽略: %s", strings.Join(stripped, ", "))
	}
	if !seen["openid"] {
		out = append([]string{oidc.ScopeOpenID}, out...)
		seen["openid"] = true
	}
	if len(stripped) > 0 {
		if !seen["profile"] {
			out = append(out, "profile")
			seen["profile"] = true
		}
		if !seen["email"] {
			out = append(out, "email")
			seen["email"] = true
		}
	}
	if len(out) == 0 {
		return []string{oidc.ScopeOpenID, "profile", "email"}
	}
	return out
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return ""
	}
	return hex.EncodeToString(b)
}

// sanitizePostLoginAppPath 仅允许站内相对路径（含查询串），防止开放重定向。
func sanitizePostLoginAppPath(s string) string {
	t := strings.TrimSpace(s)
	if t == "" {
		return ""
	}
	if !strings.HasPrefix(t, "/") {
		return ""
	}
	if strings.HasPrefix(t, "//") {
		return ""
	}
	low := strings.ToLower(t)
	if strings.HasPrefix(low, "/login") {
		return ""
	}
	if strings.ContainsAny(t, "\r\n\x00") {
		return ""
	}
	if len(t) > 2048 {
		return ""
	}
	return t
}

func clearOIDCCookies(w http.ResponseWriter, cfg Config) {
	sec := cfg.DashboardCookieSecure
	http.SetCookie(w, &http.Cookie{Name: oidcStateCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
	http.SetCookie(w, &http.Cookie{Name: oidcNonceCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
	http.SetCookie(w, &http.Cookie{Name: oidcIntentCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
	http.SetCookie(w, &http.Cookie{Name: oidcBindTargetCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
	http.SetCookie(w, &http.Cookie{Name: oidcBindReturnCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
	http.SetCookie(w, &http.Cookie{Name: oidcPostLoginReturnCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
}

func redirectAfterOIDCBind(c *gin.Context, cfg Config, query string) {
	ret, _ := c.Cookie(oidcBindReturnCookie)
	ret = strings.TrimSpace(ret)
	base := "/account/settings"
	if ret == oidcBindReturnUsers {
		base = "/account/users"
	}
	clearOIDCCookies(c.Writer, cfg)
	redir := base
	if strings.TrimSpace(query) != "" {
		redir += "?" + strings.TrimPrefix(strings.TrimSpace(query), "?")
	}
	c.Redirect(http.StatusFound, redir)
}

func redirectLoginError(c *gin.Context, cfg Config, msg string) {
	redirectLoginErrorWithHint(c, cfg, msg, "")
}

// redirectLoginErrorWithHint 跳转登录页；hint 为单独展示的排查说明（与 error 分列，避免长文挤在一条红框里）。
func redirectLoginErrorWithHint(c *gin.Context, cfg Config, msg, hint string) {
	clearOIDCCookies(c.Writer, cfg)
	q := url.Values{}
	q.Set("error", msg)
	if strings.TrimSpace(hint) != "" {
		q.Set("hint", strings.TrimSpace(hint))
	}
	c.Redirect(http.StatusFound, "/login?"+q.Encode())
}

func parseOIDCSigningAlgs(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	var out []string
	for _, p := range strings.Split(s, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func oidcVerifierConfig(cfg Config, clientID string) oidc.Config {
	oc := oidc.Config{
		ClientID:          strings.TrimSpace(clientID),
		SkipIssuerCheck:   cfg.OIDCSkipIssuerCheck,
		SkipClientIDCheck: cfg.OIDCSkipClientIDCheck,
	}
	if cfg.OIDCClockSkewSec > 0 {
		skew := time.Duration(cfg.OIDCClockSkewSec) * time.Second
		oc.Now = func() time.Time { return time.Now().Add(-skew) }
	}
	if algs := parseOIDCSigningAlgs(cfg.OIDCSupportedSigningAlgs); len(algs) > 0 {
		oc.SupportedSigningAlgs = algs
	}
	return oc
}

// oidcVerifyErrHint 将 go-oidc 校验错误与常见处置写进登录页 hint（供管理员排查）。
func oidcVerifyErrHint(err error) string {
	if err == nil {
		return ""
	}
	msg := strings.ReplaceAll(err.Error(), "\n", " ")
	if len(msg) > 600 {
		msg = msg[:600] + "…"
	}
	var tips []string
	if strings.Contains(msg, "audience") {
		tips = append(tips, "核对 OIDC_CLIENT_ID / 运行配置 oidcClientId 与 IdP 应用 Client ID 一致；若 IdP 发放的 id_token 的 aud 不含该 Client ID，可临时设 OIDC_SKIP_CLIENT_ID_CHECK 或 oidcSkipClientIdCheck（仅限明白风险时使用）。")
	}
	if strings.Contains(msg, "different provider") {
		tips = append(tips, "核对 OIDC_ISSUER_URL 与 IdP 文档中的 issuer 完全一致（含 https、路径与末尾 /）；必要时尝试 OIDC_SKIP_ISSUER_CHECK。")
	}
	if strings.Contains(msg, "malformed jwt") || strings.Contains(msg, "not signed") {
		if strings.Contains(msg, "HS256") {
			tips = append(tips, "若 IdP 为 Authentik：请在 OAuth2 Provider「协议设置」中为签名密钥显式选择 RSA 证书，使 ID Token 使用 RS256（对称 HS256 无法通过 JWKS 按本实现校验）。ES256 等可设 OIDC_SUPPORTED_SIGNING_ALGS。")
		} else {
			tips = append(tips, "可设置 OIDC_SUPPORTED_SIGNING_ALGS（逗号分隔，如 RS256,ES256）以匹配 IdP 在 JWKS 上使用的非对称算法。")
		}
	}
	if strings.Contains(msg, "expired") || strings.Contains(msg, "Expiry") {
		tips = append(tips, "若本机时钟快于标准时间，可增大 OIDC_CLOCK_SKEW_SEC（秒）；并校对系统时间/NTP。")
	}
	if strings.Contains(msg, "nbf") {
		tips = append(tips, "not-before 未满足：多为时钟不同步，请校对本机与 IdP 时间。")
	}
	hint := "底层错误：" + msg
	if len(tips) > 0 {
		hint += " " + strings.Join(tips, " ")
	}
	return hint
}

func handleOIDCLogin(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		if !cfg.OIDCConfigured() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "未配置 OIDC（OIDC_ISSUER_URL / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET / OIDC_REDIRECT_URL）"})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		issuer := strings.TrimSpace(cfg.OIDCIssuerURL)
		provider, err := oidc.NewProvider(ctx, issuer)
		if err != nil {
			log.Printf("oidc: NewProvider issuer=%q: %v", issuer, err)
			hint := "请核对 OIDC_ISSUER_URL 与 IdP（如 Authentik）Provider 的「发行者 URL」完全一致（含 https、路径与是否带末尾 /）；并确保本服务所在网络能访问该地址。"
			if strings.TrimSpace(issuer) != "" {
				hint += " 当前 issuer=" + issuer + "。"
			}
			hint += " 底层错误：" + err.Error()
			redirectLoginErrorWithHint(c, cfg, "OIDC 发现失败：无法拉取 IdP 的 .well-known/openid-configuration", hint)
			return
		}
		oauth2Config := oauth2.Config{
			ClientID:     strings.TrimSpace(cfg.OIDCClientID),
			ClientSecret: strings.TrimSpace(cfg.OIDCClientSecret),
			RedirectURL:  strings.TrimSpace(cfg.OIDCRedirectURL),
			Endpoint:     provider.Endpoint(),
			Scopes:       oidcScopesFromConfig(cfg),
		}
		state := randomHex(16)
		nonce := randomHex(16)
		if state == "" || nonce == "" {
			RespondAPIError500(c, "生成 state 失败")
			return
		}
		maxAge := 600
		sec := cfg.DashboardCookieSecure
		http.SetCookie(c.Writer, &http.Cookie{Name: oidcStateCookie, Value: state, Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
		http.SetCookie(c.Writer, &http.Cookie{Name: oidcNonceCookie, Value: nonce, Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
		http.SetCookie(c.Writer, &http.Cookie{Name: oidcIntentCookie, Value: oidcIntentLogin, Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
		if ret := sanitizePostLoginAppPath(c.Query("redirect")); ret != "" {
			enc := base64.RawURLEncoding.EncodeToString([]byte(ret))
			http.SetCookie(c.Writer, &http.Cookie{Name: oidcPostLoginReturnCookie, Value: enc, Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
		} else {
			http.SetCookie(c.Writer, &http.Cookie{Name: oidcPostLoginReturnCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
		}
		authURL := oauth2Config.AuthCodeURL(state, oauth2.SetAuthURLParam("nonce", nonce))
		c.Redirect(http.StatusFound, authURL)
	}
}

// handleOIDCBindStart 已登录用户在「账户与平台」发起 Authentik/OIDC 绑定；回调写入 oidc_issuer + oidc_sub。
func handleOIDCBindStart(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		if !cfg.OIDCConfigured() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "未配置 OIDC"})
			return
		}
		if app.MySQLDB() == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "绑定需要 MySQL 平台用户表"})
			return
		}
		u := strings.TrimSpace(dashboardUsernameFromGin(c))
		if u == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		issuer := strings.TrimSpace(cfg.OIDCIssuerURL)
		provider, err := oidc.NewProvider(ctx, issuer)
		if err != nil {
			log.Printf("oidc bind NewProvider issuer=%q: %v", issuer, err)
			c.JSON(http.StatusBadGateway, gin.H{"error": "OIDC 发现失败: " + err.Error()})
			return
		}
		oauth2Config := oauth2.Config{
			ClientID:     strings.TrimSpace(cfg.OIDCClientID),
			ClientSecret: strings.TrimSpace(cfg.OIDCClientSecret),
			RedirectURL:  strings.TrimSpace(cfg.OIDCRedirectURL),
			Endpoint:     provider.Endpoint(),
			Scopes:       oidcScopesFromConfig(cfg),
		}
		state := randomHex(16)
		nonce := randomHex(16)
		if state == "" || nonce == "" {
			RespondAPIError500(c, "生成 state 失败")
			return
		}
		maxAge := 600
		sec := cfg.DashboardCookieSecure
		http.SetCookie(c.Writer, &http.Cookie{Name: oidcStateCookie, Value: state, Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
		http.SetCookie(c.Writer, &http.Cookie{Name: oidcNonceCookie, Value: nonce, Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
		http.SetCookie(c.Writer, &http.Cookie{Name: oidcIntentCookie, Value: oidcIntentBind, Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
		http.SetCookie(c.Writer, &http.Cookie{Name: oidcBindTargetCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
		http.SetCookie(c.Writer, &http.Cookie{Name: oidcBindReturnCookie, Value: oidcBindReturnSettings, Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
		authURL := oauth2Config.AuthCodeURL(state, oauth2.SetAuthURLParam("nonce", nonce))
		c.Redirect(http.StatusFound, authURL)
	}
}

// handleOIDCAdminBindStart 管理员为指定平台用户发起 OIDC 绑定；回调将 IdP 身份写入目标用户而非当前会话用户。
func handleOIDCAdminBindStart(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		if !cfg.OIDCConfigured() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "未配置 OIDC"})
			return
		}
		db := app.MySQLDB()
		if db == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "绑定需要 MySQL 平台用户表"})
			return
		}
		target := strings.TrimSpace(c.Query("username"))
		if target == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 username"})
			return
		}
		ctx0, cancel0 := context.WithTimeout(c.Request.Context(), 8*time.Second)
		var one int
		err := db.QueryRowContext(ctx0, `SELECT 1 FROM kubebt_dashboard_users WHERE username = ? LIMIT 1`, target).Scan(&one)
		cancel0()
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
			return
		}
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		issuer := strings.TrimSpace(cfg.OIDCIssuerURL)
		provider, err := oidc.NewProvider(ctx, issuer)
		if err != nil {
			log.Printf("oidc admin bind NewProvider issuer=%q: %v", issuer, err)
			c.JSON(http.StatusBadGateway, gin.H{"error": "OIDC 发现失败: " + err.Error()})
			return
		}
		oauth2Config := oauth2.Config{
			ClientID:     strings.TrimSpace(cfg.OIDCClientID),
			ClientSecret: strings.TrimSpace(cfg.OIDCClientSecret),
			RedirectURL:  strings.TrimSpace(cfg.OIDCRedirectURL),
			Endpoint:     provider.Endpoint(),
			Scopes:       oidcScopesFromConfig(cfg),
		}
		state := randomHex(16)
		nonce := randomHex(16)
		if state == "" || nonce == "" {
			RespondAPIError500(c, "生成 state 失败")
			return
		}
		maxAge := 600
		sec := cfg.DashboardCookieSecure
		http.SetCookie(c.Writer, &http.Cookie{Name: oidcStateCookie, Value: state, Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
		http.SetCookie(c.Writer, &http.Cookie{Name: oidcNonceCookie, Value: nonce, Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
		http.SetCookie(c.Writer, &http.Cookie{Name: oidcIntentCookie, Value: oidcIntentBind, Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
		http.SetCookie(c.Writer, &http.Cookie{Name: oidcBindTargetCookie, Value: target, Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
		http.SetCookie(c.Writer, &http.Cookie{Name: oidcBindReturnCookie, Value: oidcBindReturnUsers, Path: "/", MaxAge: maxAge, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: sec})
		authURL := oauth2Config.AuthCodeURL(state, oauth2.SetAuthURLParam("nonce", nonce))
		c.Redirect(http.StatusFound, authURL)
	}
}

func redirectAccountSettingsOIDC(c *gin.Context, cfg Config, query string) {
	redirectAfterOIDCBind(c, cfg, query)
}

func handleOIDCCallback(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		if !cfg.OIDCConfigured() {
			redirectLoginError(c, cfg, "OIDC 未配置")
			return
		}
		intent, _ := c.Cookie(oidcIntentCookie)
		intent = strings.TrimSpace(intent)
		if intent == "" {
			intent = oidcIntentLogin
		}
		if errMsg := c.Query("error"); errMsg != "" {
			desc := c.Query("error_description")
			msg := errMsg
			if desc != "" {
				msg = errMsg + ": " + desc
			}
			if intent == oidcIntentBind {
				redirectAccountSettingsOIDC(c, cfg, "oidc_bind=err&reason=idp&message="+url.QueryEscape(msg))
			} else {
				redirectLoginError(c, cfg, msg)
			}
			return
		}
		code := strings.TrimSpace(c.Query("code"))
		stateQ := strings.TrimSpace(c.Query("state"))
		if code == "" || stateQ == "" {
			if intent == oidcIntentBind {
				redirectAccountSettingsOIDC(c, cfg, "oidc_bind=err&reason=missing_code")
			} else {
				redirectLoginError(c, cfg, "缺少 code 或 state")
			}
			return
		}
		stateCookie, err := c.Cookie(oidcStateCookie)
		if err != nil || stateCookie == "" || stateQ != stateCookie {
			if intent == oidcIntentBind {
				redirectAccountSettingsOIDC(c, cfg, "oidc_bind=err&reason=state")
			} else {
				redirectLoginError(c, cfg, "无效的 state（CSRF）")
			}
			return
		}
		nonceCookie, err := c.Cookie(oidcNonceCookie)
		if err != nil || nonceCookie == "" {
			if intent == oidcIntentBind {
				redirectAccountSettingsOIDC(c, cfg, "oidc_bind=err&reason=nonce")
			} else {
				redirectLoginError(c, cfg, "缺少 nonce")
			}
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 45*time.Second)
		defer cancel()
		issuer := strings.TrimSpace(cfg.OIDCIssuerURL)
		provider, err := oidc.NewProvider(ctx, issuer)
		if err != nil {
			log.Printf("oidc callback NewProvider issuer=%q: %v", issuer, err)
			if intent == oidcIntentBind {
				redirectAccountSettingsOIDC(c, cfg, "oidc_bind=err&reason=discovery")
			} else {
				redirectLoginError(c, cfg, "OIDC 发现失败：请核对 OIDC_ISSUER_URL 与 IdP 发行者 URL 一致且本机可访问（"+err.Error()+"）")
			}
			return
		}
		oauth2Config := oauth2.Config{
			ClientID:     strings.TrimSpace(cfg.OIDCClientID),
			ClientSecret: strings.TrimSpace(cfg.OIDCClientSecret),
			RedirectURL:  strings.TrimSpace(cfg.OIDCRedirectURL),
			Endpoint:     provider.Endpoint(),
			Scopes:       oidcScopesFromConfig(cfg),
		}
		oauth2Token, err := oauth2Config.Exchange(ctx, code)
		if err != nil {
			log.Printf("oidc: Exchange: %v", err)
			if intent == oidcIntentBind {
				redirectAccountSettingsOIDC(c, cfg, "oidc_bind=err&reason=exchange")
			} else {
				redirectLoginError(c, cfg, "换取令牌失败")
			}
			return
		}
		rawIDToken, _ := oauth2Token.Extra("id_token").(string)
		if strings.TrimSpace(rawIDToken) == "" {
			if intent == oidcIntentBind {
				redirectAccountSettingsOIDC(c, cfg, "oidc_bind=err&reason=no_id_token")
			} else {
				redirectLoginError(c, cfg, "响应中无 id_token")
			}
			return
		}
		vCfg := oidcVerifierConfig(cfg, oauth2Config.ClientID)
		verifier := provider.Verifier(&vCfg)
		idToken, err := verifier.Verify(ctx, rawIDToken)
		if err != nil {
			log.Printf("oidc: Verify id_token: %v", err)
			if intent == oidcIntentBind {
				redirectAccountSettingsOIDC(c, cfg, "oidc_bind=err&reason=verify")
			} else {
				redirectLoginErrorWithHint(c, cfg, "ID Token 校验失败", oidcVerifyErrHint(err))
			}
			return
		}
		// go-oidc 的 Verify 不校验 nonce，需自行比对（见 oidc/example/idtoken）
		if idToken.Nonce != nonceCookie {
			log.Printf("oidc: nonce mismatch: id_token=%q cookie=%q", idToken.Nonce, nonceCookie)
			if intent == oidcIntentBind {
				redirectAccountSettingsOIDC(c, cfg, "oidc_bind=err&reason=nonce_mismatch")
			} else {
				redirectLoginError(c, cfg, "nonce 不匹配")
			}
			return
		}
		iss := strings.TrimSpace(idToken.Issuer)
		sub := strings.TrimSpace(idToken.Subject)
		if sub == "" {
			if intent == oidcIntentBind {
				redirectAccountSettingsOIDC(c, cfg, "oidc_bind=err&reason=nosub")
			} else {
				redirectLoginError(c, cfg, "id_token 缺少 sub")
			}
			return
		}
		db := app.MySQLDB()
		if db == nil {
			if intent == oidcIntentBind {
				redirectAccountSettingsOIDC(c, cfg, "oidc_bind=err&reason=nodb")
			} else {
				redirectLoginError(c, cfg, "OIDC 需要 MySQL 平台用户表")
			}
			return
		}

		if intent == oidcIntentBind {
			sessUser, sessRole, sessOk := sessionAuthFromCookie(c, cfg, app)
			sessUser = strings.TrimSpace(sessUser)
			if !sessOk || sessUser == "" {
				clearOIDCCookies(c.Writer, cfg)
				redirectLoginErrorWithHint(c, cfg, "绑定会话已失效", "请使用用户名或邮箱与密码重新登录后，在「账户与平台」再次发起 Authentik 绑定。")
				return
			}
			bindUser := sessUser
			if tgt, _ := c.Cookie(oidcBindTargetCookie); strings.TrimSpace(tgt) != "" {
				tgt = strings.TrimSpace(tgt)
				if sessRole == DashboardRoleAdmin && tgt != "" {
					ctxT, cancelT := context.WithTimeout(ctx, 8*time.Second)
					var x int
					e2 := db.QueryRowContext(ctxT, `SELECT 1 FROM kubebt_dashboard_users WHERE username = ? LIMIT 1`, tgt).Scan(&x)
					cancelT()
					if e2 == nil {
						bindUser = tgt
					}
				}
			}
			ctxB, cancelB := context.WithTimeout(ctx, 12*time.Second)
			var otherUser string
			err = db.QueryRowContext(ctxB, `SELECT username FROM kubebt_dashboard_users WHERE oidc_issuer = ? AND oidc_sub = ? AND username <> ? LIMIT 1`, iss, sub, bindUser).Scan(&otherUser)
			cancelB()
			if err == nil && strings.TrimSpace(otherUser) != "" {
				log.Printf("oidc bind conflict: sub already bound to %q", otherUser)
				redirectAccountSettingsOIDC(c, cfg, "oidc_bind=conflict")
				return
			}
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				log.Printf("oidc bind lookup: %v", err)
				redirectAccountSettingsOIDC(c, cfg, "oidc_bind=err&reason=lookup")
				return
			}
			ctxU, cancelU := context.WithTimeout(ctx, 12*time.Second)
			_, err = db.ExecContext(ctxU, `UPDATE kubebt_dashboard_users SET oidc_issuer = ?, oidc_sub = ? WHERE username = ?`, iss, sub, bindUser)
			cancelU()
			if err != nil {
				log.Printf("oidc bind update: %v", err)
				if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
					redirectAccountSettingsOIDC(c, cfg, "oidc_bind=duplicate")
				} else {
					redirectAccountSettingsOIDC(c, cfg, "oidc_bind=err&reason=save")
				}
				return
			}
			ip := AuditClientIP(c, cfg)
			detail := "issuer=" + iss
			if bindUser != sessUser {
				detail += " target=" + bindUser + " by_admin=" + sessUser
			}
			AppendAuditRecord(app, AuditRecord{
				Action: "oidc_bind_ok",
				IP:     ip,
				User:   sessUser,
				Method: "GET",
				Path:   "/api/auth/oidc/callback",
				Status: http.StatusFound,
				Detail: detail,
			})
			redirectAccountSettingsOIDC(c, cfg, "oidc_bind=ok")
			return
		}

		ctxRole, cancelRole := context.WithTimeout(ctx, 10*time.Second)
		var username, r string
		var dis int
		err = db.QueryRowContext(ctxRole, `SELECT username, role, disabled FROM kubebt_dashboard_users WHERE oidc_issuer = ? AND oidc_sub = ? LIMIT 1`, iss, sub).Scan(&username, &r, &dis)
		cancelRole()
		if errors.Is(err, sql.ErrNoRows) {
			redirectLoginErrorWithHint(c, cfg, "尚未绑定 Authentik", "请先用平台用户名或邮箱与密码登录，打开「账户与平台」完成 Authentik 绑定后再使用 OIDC 登录。")
			return
		}
		if err != nil {
			log.Printf("oidc: lookup dashboard user by oidc: %v", err)
			redirectLoginError(c, cfg, "查询平台用户失败")
			return
		}
		username = strings.TrimSpace(username)
		if dis != 0 {
			redirectLoginError(c, cfg, "该账号已在平台禁用")
			return
		}
		role := DashboardRoleViewer
		if r == DashboardRoleAdmin || r == DashboardRoleViewer {
			role = r
		}
		key := cfg.resolvedDashboardSessionKey
		if len(key) == 0 {
			redirectLoginError(c, cfg, "服务端会话密钥未初始化")
			return
		}
		ipPre := AuditClientIP(c, cfg)
		allowMulti := false
		if db := app.MySQLDB(); db != nil {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
			ok, err := DashboardUserClientIPAllowed(db, ctx, username, ipPre)
			if err != nil {
				cancel()
				redirectLoginError(c, cfg, "校验登录 IP 失败: "+err.Error())
				return
			}
			if !ok {
				cancel()
				redirectLoginErrorWithHint(c, cfg, "OIDC 登录 IP 未授权", "该账号在「平台用户」中限制了授权登录 IP。")
				return
			}
			am, _, e := LoadDashboardUserLoginPolicy(db, ctx, username)
			cancel()
			if e == nil {
				allowMulti = am
			}
		}
		nonce, err := NewSessionNonce()
		if err != nil {
			log.Printf("oidc: NewSessionNonce: %v", err)
			redirectLoginError(c, cfg, "会话初始化失败")
			return
		}
		if err := app.SetSessionNonceAfterLogin(username, nonce, ipPre, allowMulti); err != nil {
			log.Printf("oidc: SetSessionNonceAfterLogin: %v", err)
			redirectLoginError(c, cfg, "会话持久化失败")
			return
		}
		exp := time.Now().Add(cfg.sessionMaxAge()).Unix()
		sess := mintSessionToken(username, role, exp, nonce, key)
		maxAgeSec := int(cfg.sessionMaxAge().Seconds())
		nextPath := "/"
		if raw, err := c.Cookie(oidcPostLoginReturnCookie); err == nil && strings.TrimSpace(raw) != "" {
			if b, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(raw)); err == nil {
				if p := sanitizePostLoginAppPath(string(b)); p != "" {
					nextPath = p
				}
			}
		}
		clearOIDCCookies(c.Writer, cfg)
		http.SetCookie(c.Writer, &http.Cookie{
			Name:     sessionCookieName,
			Value:    sess,
			Path:     "/",
			MaxAge:   maxAgeSec,
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			Secure:   cfg.DashboardCookieSecure,
		})
		ip := ipPre
		log.Printf("audit login ok user=%s ip=%s method=oidc", username, ip)
		AppendAuditRecord(app, AuditRecord{
			Action: "login_ok",
			IP:     ip,
			User:   username,
			Method: "GET",
			Path:   "/api/auth/oidc/callback",
			Status: http.StatusFound,
			Detail: "oidc",
		})
		OnPasswordLoginSuccess(app, username, ip)
		c.Redirect(http.StatusFound, nextPath)
	}
}
