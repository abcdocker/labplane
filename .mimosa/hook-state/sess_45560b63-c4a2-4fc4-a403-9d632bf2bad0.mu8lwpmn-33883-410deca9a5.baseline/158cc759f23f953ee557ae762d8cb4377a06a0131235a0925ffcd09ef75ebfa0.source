package internal

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const docShareCookieTTL = 30 * 24 * time.Hour

func docShareCookieName(docID uint64) string {
	return fmt.Sprintf("kubebt_ds_%d", docID)
}

func docShareHMACSecret(cfg Config) string {
	s := strings.TrimSpace(cfg.DashboardSessionSecret)
	if s != "" {
		return s
	}
	return "kubebt-docshare-insecure-set-DASHBOARD_SESSION_SECRET"
}

// mintDocShareCookieValue 签发「已验证分享密码」Cookie 值（HMAC），与 docID、过期时间绑定。
func mintDocShareCookieValue(docID uint64, secret string) string {
	exp := time.Now().Add(docShareCookieTTL).Unix()
	payload := fmt.Sprintf("%d|%d", docID, exp)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return payload + "." + sig
}

func verifyDocShareCookieValue(val string, docID uint64, secret string) bool {
	val = strings.TrimSpace(val)
	if val == "" {
		return false
	}
	dot := strings.LastIndex(val, ".")
	if dot <= 0 || dot >= len(val)-1 {
		return false
	}
	payload, sigB64 := val[:dot], val[dot+1:]
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(payload))
	expected := mac.Sum(nil)
	got, err := base64.RawURLEncoding.DecodeString(sigB64)
	if err != nil || !hmac.Equal(expected, got) {
		return false
	}
	var id uint64
	var exp int64
	if _, err := fmt.Sscanf(payload, "%d|%d", &id, &exp); err != nil {
		return false
	}
	if id != docID {
		return false
	}
	if time.Now().Unix() > exp {
		return false
	}
	return true
}

func setDocShareCookie(c *gin.Context, cfg Config, docID uint64, rawValue string) {
	maxAge := int(docShareCookieTTL.Seconds())
	secure := cfg.DashboardCookieSecure
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(docShareCookieName(docID), rawValue, maxAge, "/", "", secure, true)
}
