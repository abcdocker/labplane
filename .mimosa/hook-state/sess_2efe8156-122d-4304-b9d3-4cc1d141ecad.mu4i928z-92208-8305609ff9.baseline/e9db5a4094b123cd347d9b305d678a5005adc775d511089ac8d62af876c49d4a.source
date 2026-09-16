package internal

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"image/png"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

type adminTotpBody struct {
	UserID          int64  `json:"userId"`
	Username        string `json:"username"`
	CurrentPassword string `json:"currentPassword"`
}

var (
	totpProvisionRLMu sync.Mutex
	totpProvisionRL   = map[string]time.Time{} // key: adminUser|targetKey
)

func registerAdminTotpRoutes(g *gin.RouterGroup, app *ServerApp) {
	g.POST("/users/totp/provision", func(c *gin.Context) { handleAdminUserTotpProvision(c, app) })
	g.POST("/users/totp/disable", func(c *gin.Context) { handleAdminUserTotpDisable(c, app) })
}

func verifyCurrentOperatorPassword(c *gin.Context, app *ServerApp, cfg Config, password string) error {
	password = strings.TrimSpace(password)
	if password == "" {
		return errors.New("请输入当前登录管理员密码")
	}
	adminName := dashboardUsernameFromGin(c)
	if adminName == "" {
		return errors.New("未登录")
	}
	if db := app.MySQLDB(); db != nil {
		_, _, ok, found, err := dashboardUserAuthenticate(db, adminName, password)
		if err != nil {
			if errors.Is(err, ErrLoginPasswordTooLong) {
				return ErrLoginPasswordTooLong
			}
			return err
		}
		if found && ok {
			return nil
		}
		if found && !ok {
			return errors.New("当前密码错误")
		}
	}
	if dashboardUsernameMatch(adminName, expectAdminName(cfg)) && dashboardPasswordOk(cfg, password) {
		return nil
	}
	return errors.New("当前密码错误")
}

func handleAdminUserTotpProvision(c *gin.Context, app *ServerApp) {
	cfg := app.Cfg()
	var body adminTotpBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
		return
	}
	if err := verifyCurrentOperatorPassword(c, app, cfg, body.CurrentPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	key, err := totpEncryptionKey(cfg)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id, uname, useRuntime, err := resolveTotpTarget(c, app, cfg, body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	adminName := dashboardUsernameFromGin(c)
	rlKey := fmt.Sprintf("%s|%s|%d|%v", adminName, uname, id, useRuntime)
	totpProvisionRLMu.Lock()
	if last, ok := totpProvisionRL[rlKey]; ok && time.Since(last) < 90*time.Second {
		totpProvisionRLMu.Unlock()
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "同一用户两次生成间隔至少 90 秒，请稍后再试"})
		return
	}
	totpProvisionRL[rlKey] = time.Now()
	totpProvisionRLMu.Unlock()

	rk, err := totp.Generate(totp.GenerateOpts{
		Issuer:      totpIssuer(cfg),
		AccountName: uname,
		Period:      30,
		SecretSize:  20,
	})
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	secretB32 := rk.Secret()
	enc, err := encryptSecret(key, secretB32)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if useRuntime {
		if err := saveRuntimeTotp(app, &runtimeTotpPayload{SecretEnc: enc, Enabled: true}); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
	} else {
		db := app.MySQLDB()
		ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
		defer cancel()
		_, err = db.ExecContext(ctx,
			`UPDATE kubebt_dashboard_users SET totp_secret_enc=?, totp_enabled=1 WHERE id=?`,
			enc, id,
		)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
	}
	otpauth := buildOtpauthURLLabel(totpIssuer(cfg), uname, secretB32)
	otpKey, err := otp.NewKeyFromURL(otpauth)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	img, err := otpKey.Image(220, 220)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	qrB64 := base64.StdEncoding.EncodeToString(buf.Bytes())

	SetAuditDetail(c, "为用户启用 TOTP: "+uname)
	c.JSON(http.StatusOK, gin.H{
		"otpauthUrl":  otpauth,
		"secret":      secretB32,
		"issuer":      totpIssuer(cfg),
		"account":     uname,
		"qrPngBase64": qrB64,
	})
}

func resolveTotpTarget(c *gin.Context, app *ServerApp, cfg Config, body adminTotpBody) (id int64, uname string, useRuntime bool, err error) {
	expect := expectAdminName(cfg)
	db := app.MySQLDB()
	ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
	defer cancel()

	if body.UserID > 0 {
		if db == nil {
			return 0, "", false, errors.New("未配置 MySQL")
		}
		var u string
		e := db.QueryRowContext(ctx, `SELECT id, username FROM kubebt_dashboard_users WHERE id=?`, body.UserID).Scan(&id, &u)
		if errors.Is(e, sql.ErrNoRows) {
			return 0, "", false, errors.New("用户不存在")
		}
		if e != nil {
			return 0, "", false, e
		}
		return id, strings.TrimSpace(u), false, nil
	}

	u := strings.TrimSpace(body.Username)
	if u == "" {
		return 0, "", false, errors.New("请提供 userId 或 username")
	}

	if db != nil {
		var rowID int64
		var rowUser string
		e := db.QueryRowContext(ctx, `SELECT id, username FROM kubebt_dashboard_users WHERE username=?`, u).Scan(&rowID, &rowUser)
		if e == nil {
			return rowID, strings.TrimSpace(rowUser), false, nil
		}
		if !errors.Is(e, sql.ErrNoRows) {
			return 0, "", false, e
		}
		if dashboardUsernameMatch(u, expect) {
			return 0, expect, true, nil
		}
		return 0, "", false, errors.New("用户不存在")
	}

	if dashboardUsernameMatch(u, expect) {
		return 0, expect, true, nil
	}
	return 0, "", false, errors.New("未配置 MySQL，无法按用户名解析")
}

func handleAdminUserTotpDisable(c *gin.Context, app *ServerApp) {
	cfg := app.Cfg()
	var body adminTotpBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
		return
	}
	if err := verifyCurrentOperatorPassword(c, app, cfg, body.CurrentPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id, uname, useRuntime, err := resolveTotpTarget(c, app, cfg, body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if useRuntime {
		if err := saveRuntimeTotp(app, &runtimeTotpPayload{SecretEnc: "", Enabled: false}); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
	} else {
		db := app.MySQLDB()
		ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
		defer cancel()
		_, err = db.ExecContext(ctx, `UPDATE kubebt_dashboard_users SET totp_secret_enc=NULL, totp_enabled=0 WHERE id=?`, id)
		cancel()
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
	}
	SetAuditDetail(c, "关闭用户 TOTP: "+uname)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
