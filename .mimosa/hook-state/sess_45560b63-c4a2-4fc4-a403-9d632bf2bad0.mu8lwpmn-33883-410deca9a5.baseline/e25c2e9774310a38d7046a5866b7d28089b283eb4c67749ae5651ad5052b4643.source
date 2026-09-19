package internal

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

const sessionCookieName = "kbts_session"

// dashboardAuthMySQLTimeout 登录后每请求校验账号/IP 策略的 DB 超时。勿绑定 c.Request.Context()，否则客户端断开或上游超时会取消查询导致误报 deadline。
// 可用 KUBEBT_DASHBOARD_AUTH_DB_TIMEOUT_SEC（3～120，默认 25）。
func dashboardAuthMySQLTimeout() time.Duration {
	sec := 25
	if s := strings.TrimSpace(os.Getenv("KUBEBT_DASHBOARD_AUTH_DB_TIMEOUT_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 3 && n <= 120 {
			sec = n
		}
	}
	return time.Duration(sec) * time.Second
}

// loginResponseMinDelay 统一本地密码登录分支的最短响应时间，降低成功/失败用时差带来的侧信道风险。
const loginResponseMinDelay = 90 * time.Millisecond

// DashboardRole 会话内角色：admin 全量；viewer 只读界面数据，禁止 Pod/虚拟机 SSH/云主机/改配置等。
const (
	// DashboardRoleAdmin 为「全量权限」角色标识（存于会话与 kubebt_dashboard_users.role），与登录名 username 无关。
	DashboardRoleAdmin  = "admin"
	DashboardRoleViewer = "viewer"
)

// PrepareDashboardAuth 在启用登录时解析或生成会话 HMAC 密钥。
func PrepareDashboardAuth(cfg Config) Config {
	if !cfg.DashboardCookieSecure &&
		strings.HasPrefix(strings.ToLower(strings.TrimSpace(cfg.PlatformPublicURL)), "https://") {
		cfg.DashboardCookieSecure = true
	}
	if !cfg.DashboardAuthEnabled() {
		return cfg
	}
	if len(cfg.resolvedDashboardSessionKey) > 0 {
		return cfg
	}
	sec := strings.TrimSpace(cfg.DashboardSessionSecret)
	if sec != "" {
		cfg.resolvedDashboardSessionKey = []byte(sec)
		return cfg
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		log.Printf(">>> 警告: 生成 DASHBOARD_SESSION_SECRET 失败: %v，将使用固定弱密钥（请设置环境变量）", err)
		cfg.resolvedDashboardSessionKey = []byte("kube-bt-sync-dev-only-change-me")
		return cfg
	}
	cfg.resolvedDashboardSessionKey = []byte(hex.EncodeToString(b))
	log.Println(">>> 警告: 已启用 Dashboard 登录但未设置 DASHBOARD_SESSION_SECRET，已生成临时会话密钥（重启后需重新登录；多副本请显式配置密钥）")
	return cfg
}

// PasswordLoginEnabled 本地用户名密码（DASHBOARD_PASSWORD）是否可用。
func (c Config) PasswordLoginEnabled() bool {
	return strings.TrimSpace(c.DashboardPassword) != ""
}

// OIDCConfigured 是否已完整配置 OIDC（如 Authentik 授权码流程）。
func (c Config) OIDCConfigured() bool {
	return strings.TrimSpace(c.OIDCIssuerURL) != "" &&
		strings.TrimSpace(c.OIDCClientID) != "" &&
		strings.TrimSpace(c.OIDCClientSecret) != "" &&
		strings.TrimSpace(c.OIDCRedirectURL) != ""
}

// DashboardAuthEnabled：本地密码和/或 OIDC 任一启用即要求登录。
func (c Config) DashboardAuthEnabled() bool {
	return c.PasswordLoginEnabled() || c.OIDCConfigured()
}

func unauthenticatedAdminAllowed(c *gin.Context) bool {
	if getEnvBool("KUBEBT_ALLOW_UNAUTHENTICATED_ADMIN", false) {
		return true
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(c.Request.RemoteAddr))
	if err != nil {
		host = strings.TrimSpace(c.Request.RemoteAddr)
	}
	ip := net.ParseIP(strings.Trim(host, "[]"))
	return ip != nil && ip.IsLoopback()
}

func (c Config) sessionMaxAge() time.Duration {
	d := c.DashboardSessionDays
	if d < 1 {
		d = 7
	}
	if d > 365 {
		d = 365
	}
	return time.Duration(d) * 24 * time.Hour
}

func dashboardUsernameMatch(got, want string) bool {
	got = strings.TrimSpace(got)
	want = strings.TrimSpace(want)
	if want == "" {
		return len(got) == 0
	}
	hg := sha256.Sum256([]byte(got))
	hw := sha256.Sum256([]byte(want))
	return subtle.ConstantTimeCompare(hg[:], hw[:]) == 1
}

func dashboardPasswordOk(cfg Config, password string) bool {
	stored := strings.TrimSpace(cfg.DashboardPassword)
	if stored == "" {
		return false
	}
	if strings.HasPrefix(stored, "$2a$") || strings.HasPrefix(stored, "$2b$") || strings.HasPrefix(stored, "$2y$") {
		return bcrypt.CompareHashAndPassword([]byte(stored), []byte(password)) == nil
	}
	sk := cfg.resolvedDashboardSessionKey
	if len(sk) == 0 {
		return false
	}
	mac := hmac.New(sha256.New, sk)
	mac.Write([]byte(stored))
	es := mac.Sum(nil)
	mac2 := hmac.New(sha256.New, sk)
	mac2.Write([]byte(password))
	ep := mac2.Sum(nil)
	return subtle.ConstantTimeCompare(es, ep) == 1
}

func mintSessionToken(user, role string, expUnix int64, nonce string, key []byte) string {
	if strings.TrimSpace(role) == "" {
		role = DashboardRoleAdmin
	}
	bv := sessionBuildVersionSegment()
	payload := fmt.Sprintf("%s|%s|%d|%s|%s", user, role, expUnix, nonce, bv)
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(payload))
	sig := mac.Sum(nil)
	pb := base64.RawURLEncoding.EncodeToString([]byte(payload))
	sb := base64.RawURLEncoding.EncodeToString(sig)
	return pb + "." + sb
}

// verifySessionToken 仅接受 payload「user|role|exp|nonce|buildVer」；发版后 buildVer 变化或旧格式令牌一律拒绝（需重新登录）。
func verifySessionToken(token string, key []byte) (user, role, nonce string, err error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return "", "", "", errors.New("invalid token")
	}
	payloadBytes, err1 := base64.RawURLEncoding.DecodeString(parts[0])
	sigBytes, err2 := base64.RawURLEncoding.DecodeString(parts[1])
	if err1 != nil || err2 != nil {
		return "", "", "", errors.New("invalid token")
	}
	mac := hmac.New(sha256.New, key)
	mac.Write(payloadBytes)
	expectedSig := mac.Sum(nil)
	if subtle.ConstantTimeCompare(sigBytes, expectedSig) != 1 {
		return "", "", "", errors.New("invalid signature")
	}
	payload := string(payloadBytes)
	segs := strings.Split(payload, "|")
	if len(segs) != 5 {
		return "", "", "", errors.New("stale session format")
	}
	user = segs[0]
	role = segs[1]
	var exp int64
	exp, err = strconv.ParseInt(segs[2], 10, 64)
	if err != nil {
		return "", "", "", errors.New("invalid expiry")
	}
	nonce = segs[3]
	if strings.TrimSpace(nonce) == "" {
		return "", "", "", errors.New("empty nonce")
	}
	if segs[4] != sessionBuildVersionSegment() {
		return "", "", "", errors.New("stale build")
	}
	if time.Now().Unix() > exp {
		return "", "", "", errors.New("expired")
	}
	if strings.TrimSpace(user) == "" {
		return "", "", "", errors.New("empty user")
	}
	if role != DashboardRoleAdmin && role != DashboardRoleViewer {
		role = DashboardRoleAdmin
	}
	return user, role, nonce, nil
}

// sessionAuthFromCookie 返回登录用户名、角色；未启用登录时视为 admin。
// 启用登录时校验会话 nonce 与 platform_kv 中当前值一致（单客户端：新登录踢掉旧会话）。
func sessionAuthFromCookie(c *gin.Context, cfg Config, app *ServerApp) (user, role string, ok bool) {
	if !cfg.DashboardAuthEnabled() {
		u := strings.TrimSpace(cfg.DashboardUser)
		if u == "" {
			u = "admin"
		}
		return u, DashboardRoleAdmin, true
	}
	if app == nil {
		return "", "", false
	}
	key := cfg.resolvedDashboardSessionKey
	if len(key) == 0 {
		return "", "", false
	}
	cookie, err := c.Cookie(sessionCookieName)
	if err != nil || cookie == "" {
		return "", "", false
	}
	u, r, nonce, err := verifySessionToken(cookie, key)
	if err != nil {
		return "", "", false
	}
	clientIP := AuditClientIP(c, cfg)
	if !app.SessionNonceMatchesWithIP(u, nonce, clientIP) {
		return "", "", false
	}
	return u, r, true
}

func sessionUserFromCookie(c *gin.Context, cfg Config, app *ServerApp) (string, bool) {
	u, _, ok := sessionAuthFromCookie(c, cfg, app)
	return u, ok
}

// DashboardAuthMiddleware 未启用登录时直接放行；每次请求读取 app 当前配置（支持初始化后重载）。
func DashboardAuthMiddleware(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		if !cfg.DashboardAuthEnabled() {
			if !unauthenticatedAdminAllowed(c) {
				c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
					"error": "平台尚未配置登录认证；仅回环地址允许无认证管理。请配置 DASHBOARD_PASSWORD 或 OIDC；紧急兼容可显式设置 KUBEBT_ALLOW_UNAUTHENTICATED_ADMIN=true",
				})
				return
			}
			u := strings.TrimSpace(cfg.DashboardUser)
			if u == "" {
				u = "admin"
			}
			c.Set("dashboardUser", u)
			c.Set("dashboardRole", DashboardRoleAdmin)
			setDashboardPermissionsGin(c, defaultEffectiveAdmin())
			c.Next()
			return
		}
		u, role, ok := sessionAuthFromCookie(c, cfg, app)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "未登录或会话已过期"})
			return
		}
		if db := app.MySQLDB(); db != nil {
			ctx, cancel := context.WithTimeout(context.Background(), dashboardAuthMySQLTimeout())
			ip := AuditClientIP(c, cfg)
			gate, err := DashboardUserRequestGate(db, ctx, u, ip)
			cancel()
			if err != nil {
				AbortAPIError(c, http.StatusInternalServerError, "校验账号与登录 IP 策略失败: "+err.Error())
				return
			}
			switch gate {
			case DashboardGateDisabled:
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "账号已禁用或已删除，请重新登录"})
				return
			case DashboardGateIPForbidden:
				AbortAPIPermissionDenied(c)
				return
			}
		}
		c.Set("dashboardUser", u)
		c.Set("dashboardRole", role)
		pctx, pcancel := context.WithTimeout(context.Background(), dashboardAuthMySQLTimeout())
		eff := LoadEffectiveDashboardPermissionsCached(pctx, app, app.MySQLDB(), u, role)
		pcancel()
		setDashboardPermissionsGin(c, eff)
		c.Next()
	}
}

func handleAuthStatus(c *gin.Context, app *ServerApp) {
	cfg := app.Cfg()
	expect := strings.TrimSpace(cfg.DashboardUser)
	if expect == "" {
		expect = "admin"
	}
	mysqlExtra := mysqlStatusFields(app, cfg)
	if !cfg.DashboardAuthEnabled() {
		if !unauthenticatedAdminAllowed(c) {
			out := gin.H{
				"authRequired":          true,
				"loggedIn":              false,
				"username":              "",
				"role":                  "",
				"permissions":           nil,
				"configurationRequired": true,
				"dashboardUsernameHint": expect,
				"passwordLogin":         false,
				"oidcLogin":             false,
				"buildVersion":          sessionBuildVersionSegment(),
			}
			for k, v := range mysqlExtra {
				out[k] = v
			}
			c.JSON(http.StatusOK, out)
			return
		}
		out := gin.H{
			"authRequired":          false,
			"loggedIn":              true,
			"username":              "",
			"role":                  DashboardRoleAdmin,
			"permissions":           EffectivePermissionsToPublic(defaultEffectiveAdmin()),
			"dashboardUsernameHint": expect,
			"passwordLogin":         false,
			"oidcLogin":             false,
			"buildVersion":          sessionBuildVersionSegment(),
		}
		for k, v := range mysqlExtra {
			out[k] = v
		}
		c.JSON(http.StatusOK, out)
		return
	}
	user, role, ok := sessionAuthFromCookie(c, cfg, app)
	if !ok {
		role = ""
	}
	out := gin.H{
		"authRequired":          true,
		"loggedIn":              ok,
		"username":              user,
		"role":                  role,
		"dashboardUsernameHint": expect,
		"passwordLogin":         cfg.PasswordLoginEnabled(),
		"oidcLogin":             cfg.OIDCConfigured(),
		"buildVersion":          sessionBuildVersionSegment(),
	}
	if ok && strings.TrimSpace(user) != "" {
		// 与 DashboardAuthMiddleware 一致：勿绑定 c.Request.Context()，避免客户端断开取消权限/DB 查询。
		pctx, pcancel := context.WithTimeout(context.Background(), dashboardAuthMySQLTimeout())
		eff := LoadEffectiveDashboardPermissionsCached(pctx, app, app.MySQLDB(), user, role)
		pcancel()
		out["permissions"] = EffectivePermissionsToPublic(eff)
		if db := app.MySQLDB(); db != nil {
			ctxOb, cancelOb := context.WithTimeout(context.Background(), 5*time.Second)
			var n int
			_ = db.QueryRowContext(ctxOb, `SELECT COUNT(*) FROM kubebt_dashboard_users WHERE username = ? AND TRIM(COALESCE(oidc_sub,'')) <> '' AND TRIM(COALESCE(oidc_issuer,'')) <> ''`, user).Scan(&n)
			cancelOb()
			out["oidcBound"] = n > 0
			ctxAv, cancelAv := context.WithTimeout(context.Background(), 5*time.Second)
			var av sql.NullString
			_ = db.QueryRowContext(ctxAv, `SELECT avatar_url FROM kubebt_dashboard_users WHERE username = ? LIMIT 1`, user).Scan(&av)
			cancelAv()
			if av.Valid && strings.TrimSpace(av.String) != "" {
				out["avatarUrl"] = strings.TrimSpace(av.String)
			}
		} else {
			out["oidcBound"] = false
		}
	}
	for k, v := range mysqlExtra {
		out[k] = v
	}
	c.JSON(http.StatusOK, out)
}

// mysqlStatusFields：usersManagementEnabled 等价于进程已成功连接 MySQL；mysqlDsnConfigured 表示合并配置里已有 DSN（含分字段拼出的）。
func mysqlStatusFields(app *ServerApp, cfg Config) map[string]interface{} {
	mysqlDsnConfigured := strings.TrimSpace(cfg.MySQLDSN) != ""
	mysqlOK := app.MySQLDB() != nil
	m := map[string]interface{}{
		"mysqlDsnConfigured":     mysqlDsnConfigured,
		"mysqlReachable":         mysqlOK,
		"usersManagementEnabled": mysqlOK,
		"mysqlConnectError":      "",
	}
	if mysqlDsnConfigured && !mysqlOK {
		m["mysqlConnectError"] = app.MySQLConnectError()
	}
	return m
}

type loginBody struct {
	Username      string `json:"username"`
	Password      string `json:"password"`
	CaptchaId     string `json:"captchaId"`
	CaptchaAnswer string `json:"captchaAnswer"`
}

func finalizePasswordLoginSession(c *gin.Context, app *ServerApp, cfg Config, username, role, ip, auditDetail string) {
	key := cfg.resolvedDashboardSessionKey
	nonce, err := NewSessionNonce()
	if err != nil {
		log.Printf("session nonce: %v", err)
		RespondAPIError500(c, "会话初始化失败")
		return
	}
	allowMulti := false
	if db := app.MySQLDB(); db != nil {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 6*time.Second)
		am, _, e := LoadDashboardUserLoginPolicy(db, ctx, username)
		cancel()
		if e == nil {
			allowMulti = am
		}
	}
	if err := app.SetSessionNonceAfterLogin(username, nonce, ip, allowMulti); err != nil {
		log.Printf("session nonce persist: %v", err)
		RespondAPIError500(c, "会话持久化失败")
		return
	}
	exp := time.Now().Add(cfg.sessionMaxAge()).Unix()
	token := mintSessionToken(username, role, exp, nonce, key)
	maxAgeSec := int(cfg.sessionMaxAge().Seconds())
	http.SetCookie(c.Writer, &http.Cookie{
		Name: sessionCookieName, Value: token, Path: "/", MaxAge: maxAgeSec,
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: cfg.DashboardCookieSecure,
	})
	log.Printf("audit login ok user=%s role=%s ip=%s src=%s", username, role, ip, auditDetail)
	AppendAuditRecord(app, AuditRecord{
		Action: "login_ok", IP: ip, User: username, Method: c.Request.Method, Path: c.Request.URL.Path,
		Status: http.StatusOK, Detail: auditDetail,
	})
	OnPasswordLoginSuccess(app, username, ip)
	c.JSON(http.StatusOK, gin.H{"message": "登录成功"})
}

// respondAfterPasswordOk：密码已验证通过后，按需进入 TOTP 第二步或强制管理员绑定 TOTP，否则签发会话。
func respondAfterPasswordOk(c *gin.Context, app *ServerApp, cfg Config, uname, role, ip, successDetail string) {
	if db := app.MySQLDB(); db != nil {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 6*time.Second)
		ok, err := DashboardUserClientIPAllowed(db, ctx, uname, ip)
		cancel()
		if err != nil {
			RespondAPIError500(c, "校验登录 IP 策略失败: "+err.Error())
			return
		}
		if !ok {
			RespondAPIPermissionDenied(c)
			return
		}
	}
	key := cfg.resolvedDashboardSessionKey
	exp := time.Now().Add(totpStepTokenTTL).Unix()
	var hasTotp bool
	if db := app.MySQLDB(); db != nil {
		en, secEnc, err := dashboardUserTotpMeta(db, uname)
		if err != nil {
			log.Printf("totp meta: %v", err)
			RespondAPIError500(c, "登录校验失败")
			return
		}
		hasTotp = en && strings.TrimSpace(secEnc) != ""
	} else {
		var err error
		hasTotp, _, err = runtimeTotpEnabled(app)
		if err != nil {
			log.Printf("runtime totp: %v", err)
			RespondAPIError500(c, "登录校验失败")
			return
		}
	}
	// 二次验证仅由管理员在「平台用户」中为用户生成密钥后启用；登录时不再强制绑定。
	if hasTotp {
		nonce, err := NewSessionNonce()
		if err != nil {
			log.Printf("session nonce: %v", err)
			RespondAPIError500(c, "会话初始化失败")
			return
		}
		totpTok := mintTotpVerifyStepToken(key, uname, role, nonce, exp)
		c.JSON(http.StatusOK, gin.H{"needsTotp": true, "totpToken": totpTok})
		return
	}
	finalizePasswordLoginSession(c, app, cfg, uname, role, ip, successDetail)
}

func handleAuthLogin(c *gin.Context, app *ServerApp) {
	cfg := app.Cfg()
	if !cfg.DashboardAuthEnabled() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未启用登录（请配置 DASHBOARD_PASSWORD 或 OIDC）"})
		return
	}
	if !cfg.PasswordLoginEnabled() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未启用本地密码登录，请使用 OIDC 登录"})
		return
	}
	var body loginBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
		return
	}
	if len(body.Password) > LoginPasswordMaxBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "密码过长"})
		return
	}
	start := time.Now()
	defer func() {
		if d := time.Since(start); d < loginResponseMinDelay {
			time.Sleep(loginResponseMinDelay - d)
		}
	}()
	uname := strings.TrimSpace(body.Username)
	ip := AuditClientIP(c, cfg)
	key := cfg.resolvedDashboardSessionKey
	if len(key) == 0 {
		RespondAPIError500(c, "服务端会话密钥未初始化")
		return
	}

	if isIPLoginBanned(ip) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "该 IP 因多次 admin 密码错误已临时禁止登录，请稍后再试"})
		return
	}

	if loginNeedsCaptcha(ip) {
		cid := strings.TrimSpace(body.CaptchaId)
		ans := strings.TrimSpace(body.CaptchaAnswer)
		if cid == "" || ans == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请填写验证码"})
			return
		}
		if !verifyCaptchaAnswer(cid, ans, ip) {
			if _, alert := recordLoginFailure(app, ip); alert {
				appendSecurityLoginBruteforceAlert(app, ip)
			}
			c.JSON(http.StatusBadRequest, gin.H{"error": "验证码错误"})
			return
		}
	}

	// 1) MySQL 平台用户（若已配置数据库）
	if db := app.MySQLDB(); db != nil {
		dbUser, role, ok, found, err := dashboardUserAuthenticate(db, uname, body.Password)
		if err != nil {
			if errors.Is(err, ErrLoginPasswordTooLong) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "密码过长"})
				return
			}
			log.Printf("dashboard user login db err: %v", err)
			RespondAPIError500(c, "登录校验失败")
			return
		}
		if found {
			if !ok {
				// 区分禁用与口令错误；禁用账号不允许用环境变量口令绕过。
				ctxD, cd := context.WithTimeout(context.Background(), 8*time.Second)
				var dis int
				derr := db.QueryRowContext(ctxD, `SELECT disabled FROM kubebt_dashboard_users WHERE username=? LIMIT 1`, dbUser).Scan(&dis)
				cd()
				if derr == nil && dis != 0 {
					log.Printf("audit login fail user=%s ip=%s reason=disabled", dbUser, ip)
					AppendAuditRecord(app, AuditRecord{
						Action: "login_fail", IP: ip, User: dbUser, Method: c.Request.Method, Path: c.Request.URL.Path,
						Status: http.StatusUnauthorized, Detail: "mysql_user_disabled",
					})
					RecordLoginFailForStats(ip)
					if _, alert := recordLoginFailure(app, ip); alert {
						appendSecurityLoginBruteforceAlert(app, ip)
					}
					c.JSON(http.StatusUnauthorized, gin.H{"error": "账号已禁用，请重新登录"})
					return
				}
				log.Printf("audit login fail user=%s ip=%s reason=password_or_disabled", dbUser, ip)
				AppendAuditRecord(app, AuditRecord{
					Action: "login_fail", IP: ip, User: dbUser, Method: c.Request.Method, Path: c.Request.URL.Path,
					Status: http.StatusUnauthorized, Detail: "mysql_user",
				})
				RecordLoginFailForStats(ip)
				if _, alert := recordLoginFailure(app, ip); alert {
					appendSecurityLoginBruteforceAlert(app, ip)
				}
				if isAdminLoginName(cfg, dbUser) {
					recordAdminPasswordFailure(app, ip)
				}
				c.JSON(http.StatusUnauthorized, gin.H{"error": "密码错误"})
				return
			}
			resetLoginFailures(app, ip)
			respondAfterPasswordOk(c, app, cfg, dbUser, role, ip, "mysql_user")
			return
		}
	}

	// 2) 运行时配置中的单一管理员账号（兼容）
	expectUser := strings.TrimSpace(cfg.DashboardUser)
	if expectUser == "" {
		expectUser = "admin"
	}
	if !dashboardUsernameMatch(body.Username, expectUser) {
		log.Printf("audit login fail user=%s ip=%s reason=username", uname, ip)
		AppendAuditRecord(app, AuditRecord{
			Action: "login_fail", IP: ip, User: uname, Method: c.Request.Method, Path: c.Request.URL.Path,
			Status: http.StatusUnauthorized, Detail: "username",
		})
		RecordLoginFailForStats(ip)
		if _, alert := recordLoginFailure(app, ip); alert {
			appendSecurityLoginBruteforceAlert(app, ip)
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "密码错误"})
		return
	}
	if !dashboardPasswordOk(cfg, body.Password) {
		log.Printf("audit login fail user=%s ip=%s reason=password", expectUser, ip)
		AppendAuditRecord(app, AuditRecord{
			Action: "login_fail", IP: ip, User: expectUser, Method: c.Request.Method, Path: c.Request.URL.Path,
			Status: http.StatusUnauthorized, Detail: "password",
		})
		RecordLoginFailForStats(ip)
		if _, alert := recordLoginFailure(app, ip); alert {
			appendSecurityLoginBruteforceAlert(app, ip)
		}
		recordAdminPasswordFailure(app, ip)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "密码错误"})
		return
	}
	resetLoginFailures(app, ip)
	respondAfterPasswordOk(c, app, cfg, expectUser, DashboardRoleAdmin, ip, "password")
}

func expectAdminName(cfg Config) string {
	u := strings.TrimSpace(cfg.DashboardUser)
	if u == "" {
		return "admin"
	}
	return u
}

func isAdminLoginName(cfg Config, uname string) bool {
	u := strings.TrimSpace(uname)
	if u == "" {
		return false
	}
	if strings.EqualFold(u, "admin") {
		return true
	}
	return dashboardUsernameMatch(u, expectAdminName(cfg))
}

func handleAuthLogout(c *gin.Context, app *ServerApp) {
	cfg := app.Cfg()
	ip := AuditClientIP(c, cfg)
	if cfg.DashboardAuthEnabled() {
		if u, ok := sessionUserFromCookie(c, cfg, app); ok {
			_ = app.ClearSessionNonceForUser(u)
			log.Printf("audit logout user=%s ip=%s", u, ip)
			AppendAuditRecord(app, AuditRecord{
				Action: "logout",
				IP:     ip,
				User:   u,
				Method: c.Request.Method,
				Path:   c.Request.URL.Path,
				Status: http.StatusOK,
			})
		}
	}
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   cfg.DashboardCookieSecure,
	})
	c.JSON(http.StatusOK, gin.H{"message": "已退出"})
}
