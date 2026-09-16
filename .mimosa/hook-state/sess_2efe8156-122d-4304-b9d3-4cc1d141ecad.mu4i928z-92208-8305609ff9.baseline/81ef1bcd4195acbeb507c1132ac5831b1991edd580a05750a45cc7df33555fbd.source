package internal

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image/png"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pquerna/otp"
)

type totpLoginTotpBody struct {
	TotpToken string `json:"totpToken"`
	Code      string `json:"code"`
}

type totpSetupVerifyBody struct {
	SetupToken string `json:"setupToken"`
	Code       string `json:"code"`
}

func handleAuthLoginTotp(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		if !cfg.DashboardAuthEnabled() || !cfg.PasswordLoginEnabled() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "未启用本地密码登录"})
			return
		}
		key := cfg.resolvedDashboardSessionKey
		if len(key) == 0 {
			RespondAPIError500(c, "服务端会话密钥未初始化")
			return
		}
		var body totpLoginTotpBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		user, role, nonce, _, err := parseTotpVerifyStepToken(key, strings.TrimSpace(body.TotpToken))
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "登录已过期，请重新输入密码"})
			return
		}
		encKey, err := totpEncryptionKey(cfg)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		plain, err := totpSecretPlainForUser(app, cfg, encKey, user)
		if err != nil || strings.TrimSpace(plain) == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "未绑定两步验证"})
			return
		}
		if !ValidateTOTPCode(plain, strings.TrimSpace(body.Code)) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "验证码错误"})
			return
		}
		ip := AuditClientIP(c, cfg)
		allowMulti := false
		if db := app.MySQLDB(); db != nil {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
			ok, err := DashboardUserClientIPAllowed(db, ctx, user, ip)
			if err != nil {
				cancel()
				RespondAPIError500(c, "校验登录 IP 策略失败: " + err.Error())
				return
			}
			if !ok {
				cancel()
				RespondAPIPermissionDenied(c)
				return
			}
			am, _, e := LoadDashboardUserLoginPolicy(db, ctx, user)
			cancel()
			if e == nil {
				allowMulti = am
			}
		}
		if err := app.SetSessionNonceAfterLogin(user, nonce, ip, allowMulti); err != nil {
			log.Printf("totp login: persist nonce: %v", err)
			RespondAPIError500(c, "会话持久化失败")
			return
		}
		exp := time.Now().Add(cfg.sessionMaxAge()).Unix()
		token := mintSessionToken(user, role, exp, nonce, key)
		maxAgeSec := int(cfg.sessionMaxAge().Seconds())
		http.SetCookie(c.Writer, &http.Cookie{
			Name: sessionCookieName, Value: token, Path: "/", MaxAge: maxAgeSec,
			HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: cfg.DashboardCookieSecure,
		})
		log.Printf("audit login ok user=%s role=%s ip=%s step=totp", user, role, ip)
		AppendAuditRecord(app, AuditRecord{
			Action: "login_ok", IP: ip, User: user, Method: c.Request.Method, Path: c.Request.URL.Path,
			Status: http.StatusOK, Detail: "totp",
		})
		OnPasswordLoginSuccess(app, user, ip)
		c.JSON(http.StatusOK, gin.H{"message": "登录成功"})
	}
}

func totpSecretPlainForUser(app *ServerApp, cfg Config, encKey []byte, username string) (string, error) {
	u := strings.TrimSpace(username)
	if db := app.MySQLDB(); db != nil {
		var enc string
		ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
		defer cancel()
		err := db.QueryRowContext(ctx,
			`SELECT COALESCE(totp_secret_enc,'') FROM kubebt_dashboard_users WHERE username=? LIMIT 1`,
			u,
		).Scan(&enc)
		if err != nil {
			return "", err
		}
		return decryptSecret(encKey, enc)
	}
	expect := expectAdminName(cfg)
	if !dashboardUsernameMatch(u, expect) {
		return "", nil
	}
	p, err := loadRuntimeTotp(app)
	if err != nil || p == nil || strings.TrimSpace(p.SecretEnc) == "" {
		return "", err
	}
	return decryptSecret(encKey, p.SecretEnc)
}

func buildOtpauthURLLabel(issuer, account, secretB32 string) string {
	label := issuer + ":" + account
	return fmt.Sprintf("otpauth://totp/%s?secret=%s&issuer=%s&digits=6&period=30&algorithm=SHA1",
		url.PathEscape(label), secretB32, url.QueryEscape(issuer))
}

func handleTotpSetupProvision(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		key := cfg.resolvedDashboardSessionKey
		if len(key) == 0 {
			RespondAPIError500(c, "服务端会话密钥未初始化")
			return
		}
		tok := strings.TrimSpace(c.Query("setupToken"))
		if tok == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 setupToken"})
			return
		}
		user, role, secretB32, _, err := parseTotpSetupStepToken(key, tok)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "链接已过期，请重新登录"})
			return
		}
		issuer := totpIssuer(cfg)
		otpauth := buildOtpauthURLLabel(issuer, user, secretB32)
		otpKey, err := otp.NewKeyFromURL(otpauth)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		img, err := otpKey.Image(220, 220)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"otpauthUrl": otpauth,
				"secret":     secretB32,
				"issuer":     issuer,
				"account":    user,
				"role":       role,
			})
			return
		}
		var buf bytes.Buffer
		if err := png.Encode(&buf, img); err != nil {
			c.JSON(http.StatusOK, gin.H{
				"otpauthUrl": otpauth,
				"secret":     secretB32,
				"issuer":     issuer,
				"account":    user,
				"role":       role,
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"otpauthUrl":  otpauth,
			"secret":      secretB32,
			"issuer":      issuer,
			"account":     user,
			"role":        role,
			"qrPngBase64": base64.StdEncoding.EncodeToString(buf.Bytes()),
		})
	}
}

func handleTotpSetupVerify(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		if !cfg.DashboardAuthEnabled() || !cfg.PasswordLoginEnabled() {
			c.JSON(http.StatusBadRequest, gin.H{"error": "未启用本地密码登录"})
			return
		}
		key := cfg.resolvedDashboardSessionKey
		if len(key) == 0 {
			RespondAPIError500(c, "服务端会话密钥未初始化")
			return
		}
		var body totpSetupVerifyBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		user, role, secretB32, _, err := parseTotpSetupStepToken(key, strings.TrimSpace(body.SetupToken))
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "链接已过期，请重新登录"})
			return
		}
		if !ValidateTOTPCode(secretB32, strings.TrimSpace(body.Code)) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "验证码错误"})
			return
		}
		encKey, err := totpEncryptionKey(cfg)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		enc, err := encryptSecret(encKey, secretB32)
		if err != nil {
			RespondAPIError500(c, "加密失败")
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()
		if db := app.MySQLDB(); db != nil {
			var n int
			if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM kubebt_dashboard_users WHERE username=?`, user).Scan(&n); err != nil {
				RespondAPIError500(c, err.Error())
				return
			}
			if n > 0 {
				if err := dashboardUserSaveTotpSecret(ctx, db, user, enc, true); err != nil {
					RespondAPIError500(c, err.Error())
					return
				}
			} else {
				if err := saveRuntimeTotp(app, &runtimeTotpPayload{SecretEnc: enc, Enabled: true}); err != nil {
					RespondAPIError500(c, err.Error())
					return
				}
			}
		} else {
			if err := saveRuntimeTotp(app, &runtimeTotpPayload{SecretEnc: enc, Enabled: true}); err != nil {
				RespondAPIError500(c, err.Error())
				return
			}
		}
		nonce, err := NewSessionNonce()
		if err != nil {
			RespondAPIError500(c, "会话初始化失败")
			return
		}
		ip := AuditClientIP(c, cfg)
		allowMulti := false
		if db := app.MySQLDB(); db != nil {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
			ok, err := DashboardUserClientIPAllowed(db, ctx, user, ip)
			if err != nil {
				cancel()
				RespondAPIError500(c, "校验登录 IP 策略失败: " + err.Error())
				return
			}
			if !ok {
				cancel()
				RespondAPIPermissionDenied(c)
				return
			}
			am, _, e := LoadDashboardUserLoginPolicy(db, ctx, user)
			cancel()
			if e == nil {
				allowMulti = am
			}
		}
		if err := app.SetSessionNonceAfterLogin(user, nonce, ip, allowMulti); err != nil {
			RespondAPIError500(c, "会话持久化失败")
			return
		}
		exp := time.Now().Add(cfg.sessionMaxAge()).Unix()
		sess := mintSessionToken(user, role, exp, nonce, key)
		maxAgeSec := int(cfg.sessionMaxAge().Seconds())
		http.SetCookie(c.Writer, &http.Cookie{
			Name: sessionCookieName, Value: sess, Path: "/", MaxAge: maxAgeSec,
			HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: cfg.DashboardCookieSecure,
		})
		log.Printf("audit login ok user=%s role=%s ip=%s step=totp_setup", user, role, ip)
		AppendAuditRecord(app, AuditRecord{
			Action: "login_ok", IP: ip, User: user, Method: c.Request.Method, Path: c.Request.URL.Path,
			Status: http.StatusOK, Detail: "totp_setup",
		})
		OnPasswordLoginSuccess(app, user, ip)
		c.JSON(http.StatusOK, gin.H{"message": "两步验证已启用并登录成功"})
	}
}
