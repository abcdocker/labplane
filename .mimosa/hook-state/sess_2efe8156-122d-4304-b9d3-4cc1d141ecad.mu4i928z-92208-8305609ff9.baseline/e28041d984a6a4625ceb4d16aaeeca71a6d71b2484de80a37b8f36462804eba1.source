package internal

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func registerAccountProfileRoutes(api *gin.RouterGroup, app *ServerApp) {
	api.GET("/account/profile", func(c *gin.Context) { handleGetAccountProfile(c, app) })
	api.PUT("/account/profile", func(c *gin.Context) { handlePutAccountProfile(c, app) })
	api.POST("/account/profile/oidc/unbind", func(c *gin.Context) { handlePostAccountProfileOIDCUnbind(c, app) })
}

type accountProfileResponse struct {
	Username            string `json:"username"`
	Email               string `json:"email"`
	Role                string `json:"role"`
	InDatabase          bool   `json:"inDatabase"`
	HasPassword         bool   `json:"hasPassword"`
	PasswordLoginGlobal bool   `json:"passwordLoginGlobal"`
	OidcEnabled         bool   `json:"oidcEnabled"`
	OidcBound           bool   `json:"oidcBound"`
	AvatarURL           string `json:"avatarUrl,omitempty"`
}

func handleGetAccountProfile(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未连接 MySQL，无法读取平台用户资料"})
		return
	}
	user := strings.TrimSpace(dashboardUsernameFromGin(c))
	if user == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	role, _ := c.Get("dashboardRole")
	roleStr, _ := role.(string)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	var email, hash, avatar string
	var oidcN int
	err := db.QueryRowContext(ctx,
		`SELECT COALESCE(email,''), COALESCE(password_hash,''),
			(CASE WHEN TRIM(COALESCE(oidc_sub,''))<>'' AND TRIM(COALESCE(oidc_issuer,''))<>'' THEN 1 ELSE 0 END),
			COALESCE(avatar_url,'')
		 FROM kubebt_dashboard_users WHERE username = ? LIMIT 1`,
		user,
	).Scan(&email, &hash, &oidcN, &avatar)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusOK, accountProfileResponse{
			Username:            user,
			Email:               "",
			Role:                roleStr,
			InDatabase:          false,
			HasPassword:         false,
			PasswordLoginGlobal: app.Cfg().PasswordLoginEnabled(),
			OidcEnabled:         app.Cfg().OIDCConfigured(),
			OidcBound:           false,
		})
		return
	}
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	hash = strings.TrimSpace(hash)
	c.JSON(http.StatusOK, accountProfileResponse{
		Username:            user,
		Email:               email,
		Role:                roleStr,
		InDatabase:          true,
		HasPassword:         hash != "",
		PasswordLoginGlobal: app.Cfg().PasswordLoginEnabled(),
		OidcEnabled:         app.Cfg().OIDCConfigured(),
		OidcBound:           oidcN != 0,
		AvatarURL:           strings.TrimSpace(avatar),
	})
}

type accountProfilePutBody struct {
	Email           *string `json:"email,omitempty"`
	CurrentPassword string  `json:"currentPassword"`
	NewPassword     string  `json:"newPassword"`
	AvatarURL       *string `json:"avatarUrl,omitempty"`
}

func handlePutAccountProfile(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未连接 MySQL，无法修改资料"})
		return
	}
	user := strings.TrimSpace(dashboardUsernameFromGin(c))
	if user == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	var body accountProfilePutBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 无效: " + err.Error()})
		return
	}
	newPwd := strings.TrimSpace(body.NewPassword)
	if newPwd != "" && len(newPwd) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "新密码至少 8 位"})
		return
	}
	avatarTouch := body.AvatarURL != nil
	if body.Email == nil && newPwd == "" && !avatarTouch {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请修改邮箱、头像 URL 或填写新密码"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	var curEmail, hash, curAvatar string
	err := db.QueryRowContext(ctx,
		`SELECT COALESCE(email,''), COALESCE(password_hash,''), COALESCE(avatar_url,'') FROM kubebt_dashboard_users WHERE username = ? LIMIT 1`,
		user,
	).Scan(&curEmail, &hash, &curAvatar)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "当前会话用户不在平台用户表中，无法在此修改；请由管理员在「平台用户」中创建该用户或使用环境变量管理员入库后再试"})
		return
	}
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	hash = strings.TrimSpace(hash)
	hasPwd := hash != ""

	if newPwd != "" {
		if hasPwd {
			cur := body.CurrentPassword
			_, _, ok, _, aerr := dashboardUserAuthenticate(db, user, cur)
			if aerr != nil {
				if errors.Is(aerr, ErrLoginPasswordTooLong) {
					c.JSON(http.StatusBadRequest, gin.H{"error": "密码过长"})
					return
				}
				RespondAPIError500(c, aerr.Error())
				return
			}
			if !ok {
				c.JSON(http.StatusBadRequest, gin.H{"error": "当前密码不正确"})
				return
			}
		}
		nhash, herr := hashDashboardPassword(newPwd)
		if herr != nil {
			RespondAPIError500(c, herr.Error())
			return
		}
		hash = nhash
		hasPwd = true
	}

	outEmail := curEmail
	if body.Email != nil {
		outEmail = strings.TrimSpace(*body.Email)
		if len(outEmail) > 255 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "邮箱过长"})
			return
		}
	}
	outAvatar := strings.TrimSpace(curAvatar)
	if body.AvatarURL != nil {
		outAvatar = strings.TrimSpace(*body.AvatarURL)
		if len(outAvatar) > 512 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "头像 URL 过长（最多 512 字符）"})
			return
		}
	}

	_, err = db.ExecContext(ctx,
		`UPDATE kubebt_dashboard_users SET email = ?, password_hash = ?, avatar_url = ? WHERE username = ?`,
		outEmail, hash, outAvatar, user,
	)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	ip := AuditClientIP(c, app.Cfg())
	AppendAuditRecord(app, AuditRecord{
		Action: "account_profile_update",
		IP:     ip,
		User:   user,
		Method: c.Request.Method,
		Path:   c.Request.URL.Path,
		Status: http.StatusOK,
		Detail: "email_or_password_or_avatar",
	})
	c.JSON(http.StatusOK, gin.H{"message": "已保存"})
}

type accountProfileOIDCUnbindBody struct {
	CurrentPassword string `json:"currentPassword" binding:"required"`
}

func handlePostAccountProfileOIDCUnbind(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未连接 MySQL"})
		return
	}
	user := strings.TrimSpace(dashboardUsernameFromGin(c))
	if user == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	var body accountProfileOIDCUnbindBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 无效: " + err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	var hash string
	err := db.QueryRowContext(ctx, `SELECT COALESCE(password_hash,'') FROM kubebt_dashboard_users WHERE username = ? LIMIT 1`, user).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "当前会话用户不在平台用户表中"})
		return
	}
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if strings.TrimSpace(hash) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请先在「个人中心」设置本地登录密码后，再解绑 OIDC"})
		return
	}
	_, _, ok, _, aerr := dashboardUserAuthenticate(db, user, body.CurrentPassword)
	if aerr != nil {
		if errors.Is(aerr, ErrLoginPasswordTooLong) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "密码过长"})
			return
		}
		RespondAPIError500(c, aerr.Error())
		return
	}
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "密码不正确"})
		return
	}
	_, err = db.ExecContext(ctx, `UPDATE kubebt_dashboard_users SET oidc_issuer = NULL, oidc_sub = NULL WHERE username = ?`, user)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	ip := AuditClientIP(c, app.Cfg())
	AppendAuditRecord(app, AuditRecord{
		Action: "oidc_unbind_self",
		IP:     ip,
		User:   user,
		Method: c.Request.Method,
		Path:   c.Request.URL.Path,
		Status: http.StatusOK,
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
