package internal

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

const totpStepTokenTTL = 5 * time.Minute

// totpEncryptionKey 优先 KUBEBT_ENCRYPTION_KEY；否则用会话密钥派生 32 字节（便于开发环境）。
func totpEncryptionKey(cfg Config) ([]byte, error) {
	if k := strings.TrimSpace(cfg.EncryptionKey); k != "" {
		return deriveAESKey(k)
	}
	key := cfg.resolvedDashboardSessionKey
	if len(key) == 0 {
		return nil, errors.New("缺少 KUBEBT_ENCRYPTION_KEY 或 DASHBOARD_SESSION_SECRET")
	}
	if len(key) >= 32 {
		return key[:32], nil
	}
	h := sha256.Sum256(key)
	return h[:], nil
}

func totpIssuer(cfg Config) string {
	if v := strings.TrimSpace(cfg.TotpIssuer); v != "" {
		return v
	}
	return "Kube-BT-Sync"
}

// mintTotpVerifyStepToken 密码已通过、待验证 TOTP；payload: totp|user|role|exp|nonce|buildVer
func mintTotpVerifyStepToken(hmacKey []byte, user, role, nonce string, expUnix int64) string {
	bv := sessionBuildVersionSegment()
	payload := fmt.Sprintf("totp|%s|%s|%d|%s|%s", user, role, expUnix, nonce, bv)
	return signTotpPayload(hmacKey, payload)
}

func parseTotpVerifyStepToken(hmacKey []byte, token string) (user, role, nonce string, expUnix int64, err error) {
	payload, err := verifyTotpPayload(hmacKey, token)
	if err != nil {
		return "", "", "", 0, err
	}
	segs := strings.Split(payload, "|")
	if len(segs) != 6 || segs[0] != "totp" {
		return "", "", "", 0, errors.New("invalid totp token")
	}
	user = segs[1]
	role = segs[2]
	expUnix, err = strconv.ParseInt(segs[3], 10, 64)
	if err != nil {
		return "", "", "", 0, err
	}
	nonce = segs[4]
	bv := segs[5]
	if bv != sessionBuildVersionSegment() {
		return "", "", "", 0, errors.New("stale build")
	}
	if time.Now().Unix() > expUnix {
		return "", "", "", 0, errors.New("token expired")
	}
	return user, role, nonce, expUnix, nil
}

// mintTotpSetupStepToken payload: setup|user|role|exp|secretB64|buildVer（secretB64 为 base32 密钥的 RawURLEncoding）
func mintTotpSetupStepToken(hmacKey []byte, user, role, secretBase32 string, expUnix int64) string {
	secEnc := base64.RawURLEncoding.EncodeToString([]byte(secretBase32))
	bv := sessionBuildVersionSegment()
	payload := fmt.Sprintf("setup|%s|%s|%d|%s|%s", user, role, expUnix, secEnc, bv)
	return signTotpPayload(hmacKey, payload)
}

func parseTotpSetupStepToken(hmacKey []byte, token string) (user, role, secretBase32 string, expUnix int64, err error) {
	payload, err := verifyTotpPayload(hmacKey, token)
	if err != nil {
		return "", "", "", 0, err
	}
	segs := strings.Split(payload, "|")
	if len(segs) != 6 || segs[0] != "setup" {
		return "", "", "", 0, errors.New("invalid setup token")
	}
	user = segs[1]
	role = segs[2]
	expUnix, err = strconv.ParseInt(segs[3], 10, 64)
	if err != nil {
		return "", "", "", 0, err
	}
	raw, err := base64.RawURLEncoding.DecodeString(segs[4])
	if err != nil {
		return "", "", "", 0, err
	}
	secretBase32 = string(raw)
	if segs[5] != sessionBuildVersionSegment() {
		return "", "", "", 0, errors.New("stale build")
	}
	if time.Now().Unix() > expUnix {
		return "", "", "", 0, errors.New("token expired")
	}
	return user, role, secretBase32, expUnix, nil
}

func signTotpPayload(hmacKey []byte, payload string) string {
	mac := hmac.New(sha256.New, hmacKey)
	mac.Write([]byte(payload))
	sig := mac.Sum(nil)
	pb := base64.RawURLEncoding.EncodeToString([]byte(payload))
	sb := base64.RawURLEncoding.EncodeToString(sig)
	return pb + "." + sb
}

func verifyTotpPayload(hmacKey []byte, token string) (payload string, err error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return "", errors.New("invalid token")
	}
	payloadBytes, err1 := base64.RawURLEncoding.DecodeString(parts[0])
	sigBytes, err2 := base64.RawURLEncoding.DecodeString(parts[1])
	if err1 != nil || err2 != nil {
		return "", errors.New("invalid token")
	}
	mac := hmac.New(sha256.New, hmacKey)
	mac.Write(payloadBytes)
	expectedSig := mac.Sum(nil)
	if subtle.ConstantTimeCompare(sigBytes, expectedSig) != 1 {
		return "", errors.New("invalid signature")
	}
	return string(payloadBytes), nil
}

// ValidateTOTPCode 校验 6 位动态码（允许 ±1 时间窗）。
func ValidateTOTPCode(secretBase32, code string) bool {
	code = strings.TrimSpace(code)
	if len(code) != 6 || secretBase32 == "" {
		return false
	}
	ok, err := totp.ValidateCustom(code, secretBase32, time.Now(), totp.ValidateOpts{
		Period:    30,
		Skew:      1,
		Digits:    otp.DigitsSix,
		Algorithm: otp.AlgorithmSHA1,
	})
	return err == nil && ok
}
