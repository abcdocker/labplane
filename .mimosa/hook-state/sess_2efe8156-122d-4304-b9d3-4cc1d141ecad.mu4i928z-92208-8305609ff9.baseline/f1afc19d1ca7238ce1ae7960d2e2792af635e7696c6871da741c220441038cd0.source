package internal

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	mathrand "math/rand"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	loginFailCaptchaAfter   = 3
	loginFailAdminAlertAt   = 20
	loginCaptchaTTL         = 10 * time.Minute
	adminPasswordFailBanAt  = 5
	adminPasswordBanDuration = 10 * time.Minute
)

type loginIPState struct {
	FailCount       int
	LastFail        time.Time
	AdminAlertFired bool // 已达 20 次并已写入管理员通知
	// 针对「运行时 admin 账号」或 MySQL 用户名为 admin 的密码错误次数（同一 IP）
	AdminPasswordFail int
	BanUntil          time.Time // 该 IP 禁止密码登录直至该时刻
}

var (
	loginTrackMu sync.Mutex
	loginByIP    = map[string]*loginIPState{}

	captchaMu sync.Mutex
	// captchaID -> expected answer (digits string)
	captchaAnswers = map[string]captchaEntry{}
)

type captchaEntry struct {
	answer  string
	expires time.Time
	ip      string
}

func getLoginIPState(ip string) *loginIPState {
	loginTrackMu.Lock()
	defer loginTrackMu.Unlock()
	st := loginByIP[ip]
	if st == nil {
		st = &loginIPState{}
		loginByIP[ip] = st
	}
	return st
}

func resetLoginFailures(app *ServerApp, ip string) {
	loginTrackMu.Lock()
	delete(loginByIP, ip)
	loginTrackMu.Unlock()
	if app != nil {
		persistLoginThrottleAfterMutation(app)
	}
}

// isIPLoginBanned 同一 IP 因 admin 密码连续错误被临时禁止登录。
func isIPLoginBanned(ip string) bool {
	loginTrackMu.Lock()
	defer loginTrackMu.Unlock()
	st := loginByIP[ip]
	if st == nil || st.BanUntil.IsZero() {
		return false
	}
	if time.Now().Before(st.BanUntil) {
		return true
	}
	// 已过期：清除封禁与 admin 专项计数，保留其它失败计数由 delete 或后续逻辑处理
	st.BanUntil = time.Time{}
	st.AdminPasswordFail = 0
	return false
}

// recordAdminPasswordFailure admin 账号密码错误（同一来源 IP）；达阈值则封禁 IP 并写入审计与铃铛。
func recordAdminPasswordFailure(app *ServerApp, ip string) {
	loginTrackMu.Lock()
	st := loginByIP[ip]
	if st == nil {
		st = &loginIPState{}
		loginByIP[ip] = st
	}
	st.AdminPasswordFail++
	st.LastFail = time.Now()
	var until time.Time
	triggered := false
	if st.AdminPasswordFail >= adminPasswordFailBanAt {
		until = time.Now().Add(adminPasswordBanDuration)
		st.BanUntil = until
		triggered = true
	}
	loginTrackMu.Unlock()
	if app != nil {
		persistLoginThrottleAfterMutation(app)
	}
	if !triggered || app == nil {
		return
	}
	msg := fmt.Sprintf(
		"来源 IP %s 已连续 %d 次输入 admin 账号错误密码，已禁止该 IP 密码登录至 %s（UTC）。",
		ip, adminPasswordFailBanAt, until.UTC().Format(time.RFC3339),
	)
	AppendAuditRecord(app, AuditRecord{
		Action: "security_ip_ban",
		IP:     ip,
		Method: "POST",
		Path:   "/api/auth/login",
		Status: http.StatusTooManyRequests,
		Detail: msg,
	})
	_ = saveAdminIpBanAlertUnified(app, AdminIpBanAlertState{
		Unread:   true,
		Message:  msg,
		LastAt:   time.Now().UTC(),
		SourceIP: ip,
		BanUntil: until.UTC(),
	})
}

func recordLoginFailure(app *ServerApp, ip string) (needCaptcha bool, adminAlert bool) {
	loginTrackMu.Lock()
	st := loginByIP[ip]
	if st == nil {
		st = &loginIPState{}
		loginByIP[ip] = st
	}
	st.FailCount++
	st.LastFail = time.Now()

	needCaptcha = st.FailCount >= loginFailCaptchaAfter
	if st.FailCount >= loginFailAdminAlertAt && !st.AdminAlertFired {
		st.AdminAlertFired = true
		adminAlert = true
	}
	loginTrackMu.Unlock()
	if app != nil {
		persistLoginThrottleAfterMutation(app)
	}
	return needCaptcha, adminAlert
}

func loginNeedsCaptcha(ip string) bool {
	loginTrackMu.Lock()
	defer loginTrackMu.Unlock()
	st := loginByIP[ip]
	if st == nil {
		return false
	}
	return st.FailCount >= loginFailCaptchaAfter
}

func newCaptchaID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func storeCaptchaAnswer(id, answer, ip string) {
	captchaMu.Lock()
	defer captchaMu.Unlock()
	captchaAnswers[id] = captchaEntry{
		answer:  answer,
		expires: time.Now().Add(loginCaptchaTTL),
		ip:      ip,
	}
}

func verifyCaptchaAnswer(id, answer, ip string) bool {
	captchaMu.Lock()
	defer captchaMu.Unlock()
	e, ok := captchaAnswers[id]
	if !ok || time.Now().After(e.expires) {
		delete(captchaAnswers, id)
		return false
	}
	if e.ip != ip {
		return false
	}
	delete(captchaAnswers, id)
	return e.answer == answer
}

func handleAuthLoginChallenge(app *ServerApp) gin.HandlerFunc {
	cfg := app.Cfg()
	return func(c *gin.Context) {
		if !cfg.DashboardAuthEnabled() || !cfg.PasswordLoginEnabled() {
			c.JSON(http.StatusOK, gin.H{"captchaRequired": false})
			return
		}
		ip := AuditClientIP(c, cfg)
		if !loginNeedsCaptcha(ip) {
			c.JSON(http.StatusOK, gin.H{"captchaRequired": false})
			return
		}
		a, b := randIntOneToNine(), randIntOneToNine()
		sum := a + b
		id := newCaptchaID()
		storeCaptchaAnswer(id, fmt.Sprintf("%d", sum), ip)
		c.JSON(http.StatusOK, gin.H{
			"captchaRequired": true,
			"captchaId":       id,
			"question":        fmt.Sprintf("%d + %d = ?", a, b),
		})
	}
}

// randIntOneToNine 生成 1~9 的随机整数，优先 crypto/rand，失败时 fallback 到 math/rand。
func randIntOneToNine() int {
	n, err := rand.Int(rand.Reader, big.NewInt(9))
	if err == nil && n != nil {
		return int(n.Int64()) + 1
	}
	return mathrand.Intn(9) + 1
}

const securityLoginAlertFile = "security-login-alert.json"

// SecurityLoginAlertState 管理员铃铛：登录暴力尝试告警（持久化，进程重启后仍可提示）。
type SecurityLoginAlertState struct {
	Unread    bool      `json:"unread"`
	Message   string    `json:"message,omitempty"`
	LastAt    time.Time `json:"lastAt,omitempty"`
	SourceIP  string    `json:"sourceIp,omitempty"`
}

func loadSecurityLoginAlert(dataDir string) (SecurityLoginAlertState, error) {
	path := filepath.Join(dataDir, securityLoginAlertFile)
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return SecurityLoginAlertState{}, nil
		}
		return SecurityLoginAlertState{}, err
	}
	var st SecurityLoginAlertState
	if err := json.Unmarshal(b, &st); err != nil {
		return SecurityLoginAlertState{}, err
	}
	return st, nil
}

var securityAlertMu sync.Mutex

func appendSecurityLoginBruteforceAlert(app *ServerApp, ip string) {
	securityAlertMu.Lock()
	defer securityAlertMu.Unlock()
	st := SecurityLoginAlertState{
		Unread:   true,
		Message:  fmt.Sprintf("来源 IP %s 已连续登录失败达到 %d 次，请检查是否为暴力破解。", ip, loginFailAdminAlertAt),
		LastAt:   time.Now(),
		SourceIP: ip,
	}
	if err := SaveSecurityLoginAlertUnified(app, st); err != nil {
		log.Printf("security login alert: save: %v", err)
	}
}

func handleSecurityLoginAlertRead(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		securityAlertMu.Lock()
		defer securityAlertMu.Unlock()
		st, err := LoadSecurityLoginAlertUnified(app)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		st.Unread = false
		if err := SaveSecurityLoginAlertUnified(app, st); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}
