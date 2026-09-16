package internal

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type dashboardUserRow struct {
	ID                 int64  `json:"id"`
	Username           string `json:"username"`
	Email              string `json:"email"`
	Role               string `json:"role"`
	Disabled           bool   `json:"disabled"`
	PermissionsJSON    string `json:"permissionsJson,omitempty"`
	TotpEnabled        bool   `json:"totpEnabled"`
	TotpConfigured     bool   `json:"totpConfigured"`
	Virtual            bool   `json:"virtual,omitempty"`
	AllowMultiIPLogin  bool   `json:"allowMultiIpLogin,omitempty"`
	AllowedLoginIPs    string `json:"allowedLoginIps,omitempty"`
	OidcBound          bool   `json:"oidcBound"`
}

func registerAdminUserRoutes(api *gin.RouterGroup, app *ServerApp) {
	g := api.Group("/admin")
	g.Use(AdminOnlyMiddleware(app))
	g.GET("/users", func(c *gin.Context) { handleAdminUsersList(c, app) })
	g.GET("/users/oidc/bind/start", handleOIDCAdminBindStart(app))
	g.POST("/users/oidc/unbind", func(c *gin.Context) { handleAdminUserOIDCUnbind(c, app) })
	g.POST("/users", func(c *gin.Context) { handleAdminUsersCreate(c, app) })
	g.PUT("/users/:id", func(c *gin.Context) { handleAdminUsersUpdate(c, app) })
	g.DELETE("/users/:id", func(c *gin.Context) { handleAdminUsersDelete(c, app) })
	registerAdminTotpRoutes(g, app)
}

// AdminOnlyMiddleware 仅 admin 角色可访问（含运行时配置中的单一管理员会话）。
func AdminOnlyMiddleware(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		if !cfg.DashboardAuthEnabled() {
			c.Next()
			return
		}
		rVal, ok := c.Get("dashboardRole")
		if !ok {
			AbortAPIPermissionDenied(c)
			return
		}
		r, _ := rVal.(string)
		if r != DashboardRoleAdmin {
			AbortAPIPermissionDenied(c)
			return
		}
		c.Next()
	}
}

func handleAdminUsersList(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未配置 MySQL，无法使用平台用户管理"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	rows, err := db.QueryContext(ctx, `SELECT id, username, email, role, disabled, permissions_json,
		COALESCE(totp_enabled,0) != 0,
		(totp_secret_enc IS NOT NULL AND TRIM(totp_secret_enc) != ''),
		COALESCE(allow_multi_ip_login,0) != 0,
		COALESCE(allowed_login_ips,''),
		(TRIM(COALESCE(oidc_issuer,'')) <> '' AND TRIM(COALESCE(oidc_sub,'')) <> '')
		FROM kubebt_dashboard_users ORDER BY id ASC`)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	defer rows.Close()
	var out []dashboardUserRow
	for rows.Next() {
		var r dashboardUserRow
		var pj sql.NullString
		var te, tc bool
		var mul bool
		var ips sql.NullString
		var oidcBound bool
		if err := rows.Scan(&r.ID, &r.Username, &r.Email, &r.Role, &r.Disabled, &pj, &te, &tc, &mul, &ips, &oidcBound); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		if pj.Valid {
			r.PermissionsJSON = pj.String
		}
		r.TotpEnabled = te
		r.TotpConfigured = tc
		r.AllowMultiIPLogin = mul
		if ips.Valid {
			r.AllowedLoginIPs = ips.String
		}
		r.OidcBound = oidcBound
		out = append(out, r)
	}
	expect := expectAdminName(app.Cfg())
	found := false
	for _, u := range out {
		if strings.EqualFold(u.Username, expect) {
			found = true
			break
		}
	}
	if !found {
		rtOk, _, _ := runtimeTotpEnabled(app)
		out = append([]dashboardUserRow{{
			ID: 0, Username: expect, Email: "", Role: DashboardRoleAdmin, Disabled: false,
			Virtual: true, TotpEnabled: rtOk, TotpConfigured: rtOk,
			AllowMultiIPLogin: false, AllowedLoginIPs: "",
		}}, out...)
	}
	c.JSON(http.StatusOK, gin.H{"users": out})
}

type adminUserCreateBody struct {
	Username            string  `json:"username"`
	Email               string  `json:"email"`
	Password            string  `json:"password"`
	Role                string  `json:"role"`
	PermissionsJSON     *string `json:"permissionsJson"`
	AllowedLoginIPs     *string `json:"allowedLoginIps"`
	AllowMultiIPLogin   *bool   `json:"allowMultiIpLogin"`
}

func handleAdminUsersCreate(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未配置 MySQL"})
		return
	}
	var body adminUserCreateBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	u := strings.TrimSpace(body.Username)
	if len(u) < 2 || len(u) > 64 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "用户名长度 2～64"})
		return
	}
	if len(body.Password) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "密码至少 8 位"})
		return
	}
	role := strings.TrimSpace(body.Role)
	if role == "" {
		role = DashboardRoleViewer
	}
	if role != DashboardRoleAdmin && role != DashboardRoleViewer {
		c.JSON(http.StatusBadRequest, gin.H{"error": "role 须为 admin 或 viewer"})
		return
	}
	var permArg interface{}
	if body.PermissionsJSON != nil {
		pj := strings.TrimSpace(*body.PermissionsJSON)
		if pj != "" {
			if err := ValidatePermissionsJSONString(pj); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "permissionsJson: " + err.Error()})
				return
			}
			permArg = pj
		} else {
			permArg = nil
		}
	} else {
		permArg = nil
	}
	if body.AllowedLoginIPs != nil {
		if err := ValidateAllowedLoginIPsText(*body.AllowedLoginIPs); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	hash, err := hashDashboardPassword(body.Password)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	multi := int64(0)
	if body.AllowMultiIPLogin != nil && *body.AllowMultiIPLogin {
		multi = 1
	}
	ipsVal := ""
	if body.AllowedLoginIPs != nil {
		ipsVal = strings.TrimSpace(*body.AllowedLoginIPs)
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	_, err = db.ExecContext(ctx,
		`INSERT INTO kubebt_dashboard_users (username, email, password_hash, role, disabled, permissions_json, allow_multi_ip_login, allowed_login_ips) VALUES (?,?,?,?,0,?,?,?)`,
		u, strings.TrimSpace(body.Email), hash, role, permArg, multi, sqlNullString(ipsVal),
	)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
			c.JSON(http.StatusConflict, gin.H{"error": "用户名已存在"})
			return
		}
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, "创建平台用户 "+u+" role="+role)
	InvalidateUserPermissionsCache(c.Request.Context(), app, u)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type adminUserUpdateBody struct {
	Email               *string `json:"email"`
	Password            *string `json:"password"`
	Role                *string `json:"role"`
	Disabled            *bool   `json:"disabled"`
	PermissionsJSON     *string `json:"permissionsJson"`
	AllowedLoginIPs     *string `json:"allowedLoginIps"`
	AllowMultiIPLogin   *bool   `json:"allowMultiIpLogin"`
}

func handleAdminUsersUpdate(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未配置 MySQL"})
		return
	}
	id, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	var body adminUserUpdateBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	var curRole, curUser, curEmail string
	var curHash string
	var curDisabled int
	var curMul int
	var curIPs sql.NullString
	var curPerm sql.NullString
	err = db.QueryRowContext(ctx,
		`SELECT username, role, email, password_hash, disabled, COALESCE(allow_multi_ip_login,0), COALESCE(allowed_login_ips,''), permissions_json FROM kubebt_dashboard_users WHERE id = ?`, id,
	).Scan(&curUser, &curRole, &curEmail, &curHash, &curDisabled, &curMul, &curIPs, &curPerm)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}

	email := curEmail
	if body.Email != nil {
		email = strings.TrimSpace(*body.Email)
	}
	role := curRole
	if body.Role != nil {
		r := strings.TrimSpace(*body.Role)
		if r != DashboardRoleAdmin && r != DashboardRoleViewer {
			c.JSON(http.StatusBadRequest, gin.H{"error": "role 须为 admin 或 viewer"})
			return
		}
		role = r
	}
	disabled := curDisabled
	if body.Disabled != nil {
		if *body.Disabled {
			disabled = 1
		} else {
			disabled = 0
		}
	}

	if curRole == DashboardRoleAdmin && curDisabled == 0 && (role != DashboardRoleAdmin || disabled == 1) {
		if ok, err := adminChangeRemovesLastAccess(db, ctx, app.Cfg()); err != nil {
			RespondAPIError500(c, err.Error())
			return
		} else if ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "不能禁用或降级最后一个管理员：请先在「平台用户」中保留至少一名其他未禁用的 admin，或确保仍可通过运行时初始化账号登录。"})
			return
		}
	}

	hash := curHash
	if body.Password != nil && strings.TrimSpace(*body.Password) != "" {
		if len(strings.TrimSpace(*body.Password)) < 8 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "密码至少 8 位"})
			return
		}
		hash, err = hashDashboardPassword(strings.TrimSpace(*body.Password))
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
	}

	permVal := curPerm
	if body.PermissionsJSON != nil {
		pj := strings.TrimSpace(*body.PermissionsJSON)
		if pj == "" {
			permVal = sql.NullString{Valid: false}
		} else {
			if err := ValidatePermissionsJSONString(pj); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "permissionsJson: " + err.Error()})
				return
			}
			permVal = sql.NullString{String: pj, Valid: true}
		}
	}

	mul := curMul
	if body.AllowMultiIPLogin != nil {
		if *body.AllowMultiIPLogin {
			mul = 1
		} else {
			mul = 0
		}
	}
	ipsStr := ""
	if curIPs.Valid {
		ipsStr = strings.TrimSpace(curIPs.String)
	}
	if body.AllowedLoginIPs != nil {
		ipsStr = strings.TrimSpace(*body.AllowedLoginIPs)
		if err := ValidateAllowedLoginIPsText(ipsStr); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	_, err = db.ExecContext(ctx,
		`UPDATE kubebt_dashboard_users SET email=?, password_hash=?, role=?, disabled=?, permissions_json=?, allow_multi_ip_login=?, allowed_login_ips=? WHERE id=?`,
		email, hash, role, disabled, permVal, mul, sqlNullString(ipsStr), id,
	)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, "更新平台用户 id="+strconv.FormatInt(id, 10)+" "+curUser)
	InvalidateUserPermissionsCache(c.Request.Context(), app, curUser)
	if disabled == 1 {
		_ = app.ClearSessionNonceForUser(curUser)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func adminCountEnabled(db *sql.DB, ctx context.Context) (int, error) {
	var n int
	err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM kubebt_dashboard_users WHERE role = ? AND disabled = 0`, DashboardRoleAdmin).Scan(&n)
	return n, err
}

// runtimeAdminFallbackInEffect 当 expectAdminName 在库中无同名用户时，登录仍会走「运行时单一管理员」口令（见 handleAuthLogin 第二步），
// 与列表中的「虚拟」行一致；计数「最后一名管理员」时必须算入，否则会误拦对另一名库内 admin 的删除/禁用。
func runtimeAdminFallbackInEffect(db *sql.DB, ctx context.Context, cfg Config) (bool, error) {
	expect := strings.TrimSpace(expectAdminName(cfg))
	if expect == "" {
		expect = "admin"
	}
	var tmp string
	err := db.QueryRowContext(ctx,
		`SELECT username FROM kubebt_dashboard_users WHERE LOWER(username) = LOWER(?) LIMIT 1`,
		expect).Scan(&tmp)
	if errors.Is(err, sql.ErrNoRows) {
		return true, nil
	}
	if err != nil {
		return false, err
	}
	return false, nil
}

// adminChangeRemovesLastAccess 在「当前行是已启用的 admin」前提下，若执行禁用/降级/删除会使系统无任何管理员入口，则返回 true。
func adminChangeRemovesLastAccess(db *sql.DB, ctx context.Context, cfg Config) (bool, error) {
	n, err := adminCountEnabled(db, ctx)
	if err != nil {
		return false, err
	}
	bonus := 0
	if ok, err := runtimeAdminFallbackInEffect(db, ctx, cfg); err != nil {
		return false, err
	} else if ok {
		bonus = 1
	}
	// 去掉本行这名启用中的库内 admin 后，库内剩余 (n-1) 名；加上运行时入口 bonus，需至少为 1
	return n+bonus <= 1, nil
}

func handleAdminUsersDelete(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未配置 MySQL"})
		return
	}
	id, err := strconv.ParseInt(strings.TrimSpace(c.Param("id")), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	var curRole string
	var curUser string
	var curDisabled int
	err = db.QueryRowContext(ctx, `SELECT username, role, disabled FROM kubebt_dashboard_users WHERE id = ?`, id).Scan(&curUser, &curRole, &curDisabled)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	// 仅当删除「当前仍启用」的管理员时，需保证删除后仍存在至少一种管理员入口（其他库内 admin 或运行时未入库的初始化账号）
	if curRole == DashboardRoleAdmin && curDisabled == 0 {
		if bad, err := adminChangeRemovesLastAccess(db, ctx, app.Cfg()); err != nil {
			RespondAPIError500(c, err.Error())
			return
		} else if bad {
			c.JSON(http.StatusBadRequest, gin.H{"error": "不能删除最后一个管理员：请先在「平台用户」中保留至少一名其他未禁用的 admin，或确保仍可通过运行时初始化账号登录。"})
			return
		}
	}
	u, _ := c.Get("dashboardUser")
	if su, ok := u.(string); ok && strings.EqualFold(su, curUser) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不能删除当前登录用户"})
		return
	}
	_, err = db.ExecContext(ctx, `DELETE FROM kubebt_dashboard_users WHERE id = ?`, id)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	_ = app.ClearSessionNonceForUser(curUser)
	SetAuditDetail(c, "删除平台用户 "+curUser)
	InvalidateUserPermissionsCache(c.Request.Context(), app, curUser)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type adminOIDCUnbindBody struct {
	Username         string `json:"username" binding:"required"`
	OperatorPassword string `json:"operatorPassword" binding:"required"`
}

func handleAdminUserOIDCUnbind(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未配置 MySQL"})
		return
	}
	var body adminOIDCUnbindBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 无效: " + err.Error()})
		return
	}
	target := strings.TrimSpace(body.Username)
	op := body.OperatorPassword
	if target == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username 无效"})
		return
	}
	adminU, _ := c.Get("dashboardUser")
	adminName, _ := adminU.(string)
	adminName = strings.TrimSpace(adminName)
	if adminName == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	_, _, ok, _, aerr := dashboardUserAuthenticate(db, adminName, op)
	if aerr != nil {
		if errors.Is(aerr, ErrLoginPasswordTooLong) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "密码过长"})
			return
		}
		RespondAPIError500(c, aerr.Error())
		return
	}
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "当前管理员密码不正确"})
		return
	}
	res, err := db.ExecContext(ctx, `UPDATE kubebt_dashboard_users SET oidc_issuer = NULL, oidc_sub = NULL WHERE username = ?`, target)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在或未变更"})
		return
	}
	ip := AuditClientIP(c, app.Cfg())
	AppendAuditRecord(app, AuditRecord{
		Action: "oidc_unbind_admin",
		IP:     ip,
		User:   adminName,
		Method: c.Request.Method,
		Path:   c.Request.URL.Path,
		Status: http.StatusOK,
		Detail: "target=" + target,
	})
	InvalidateUserPermissionsCache(c.Request.Context(), app, target)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func sqlNullString(s string) interface{} {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return s
}
