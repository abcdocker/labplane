package internal

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
)

// NewSessionNonce 生成 64 位十六进制随机串，用于单点会话绑定。
func NewSessionNonce() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

const sessionNonceKVPrefix = "sess_nonce:v1:"

func sessionNonceKey(username string) string {
	u := strings.TrimSpace(username)
	if u == "" {
		return sessionNonceKVPrefix + "_"
	}
	return sessionNonceKVPrefix + base64.RawURLEncoding.EncodeToString([]byte(u))
}

type sessionNonceV1 struct {
	Version int               `json:"v"`
	One     string            `json:"one,omitempty"`
	Multi   bool              `json:"m,omitempty"`
	ByIP    map[string]string `json:"ip,omitempty"`
}

func decodeSessionNonceState(raw string) (one string, multi bool, byIP map[string]string, legacy bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", false, nil, true
	}
	if raw[0] != '{' {
		return raw, false, nil, true
	}
	var st sessionNonceV1
	if err := json.Unmarshal([]byte(raw), &st); err != nil || st.Version < 1 {
		return raw, false, nil, true
	}
	if st.Multi {
		return "", true, st.ByIP, false
	}
	return st.One, false, nil, false
}

func (s *ServerApp) setSessionNonceJSON(username string, st sessionNonceV1) error {
	if s == nil {
		return errors.New("app nil")
	}
	kv := s.PlatformKV()
	if kv == nil {
		return errors.New("platform kv 未初始化")
	}
	st.Version = 1
	b, err := json.Marshal(st)
	if err != nil {
		return err
	}
	return kv.Set(sessionNonceKey(username), string(b))
}

func trimIPNonceMap(m map[string]string, max int) {
	for len(m) > max {
		var k string
		for x := range m {
			k = x
			break
		}
		delete(m, k)
	}
}

// SetSessionNonceForUser 写入单点会话（新登录会踢掉其它客户端及该用户其它 IP 会话）。
func (s *ServerApp) SetSessionNonceForUser(username, nonce string) error {
	return s.setSessionNonceJSON(username, sessionNonceV1{Version: 1, One: nonce})
}

// SetSessionNonceAfterLogin 登录成功时写入会话；allowMulti 为 true 时按客户端 IP 分别保留 nonce（不同 IP 可同时在线，单 IP 仍互踢）。
func (s *ServerApp) SetSessionNonceAfterLogin(username, nonce, clientIP string, allowMulti bool) error {
	if !allowMulti {
		return s.setSessionNonceJSON(username, sessionNonceV1{Version: 1, One: nonce})
	}
	if s == nil {
		return errors.New("app nil")
	}
	kv := s.PlatformKV()
	if kv == nil {
		return errors.New("platform kv 未初始化")
	}
	key := sessionNonceKey(username)
	raw, _ := kv.Get(key)
	_, wasMulti, oldIP, _ := decodeSessionNonceState(raw)
	m := make(map[string]string)
	if wasMulti && oldIP != nil {
		for k, v := range oldIP {
			if strings.TrimSpace(v) != "" {
				m[k] = v
			}
		}
	}
	ipK := NormalizeClientIPForSessionKey(clientIP)
	m[ipK] = nonce
	trimIPNonceMap(m, 16)
	return s.setSessionNonceJSON(username, sessionNonceV1{Version: 1, Multi: true, ByIP: m})
}

// SessionNonceMatchesWithIP 校验 Cookie 内 nonce；须传入与登录时一致的客户端 IP（见 AuditClientIP）。
func (s *ServerApp) SessionNonceMatchesWithIP(username, nonce, clientIP string) bool {
	if s == nil || strings.TrimSpace(nonce) == "" {
		return false
	}
	kv := s.PlatformKV()
	if kv == nil {
		return false
	}
	stored, ok := kv.Get(sessionNonceKey(username))
	if !ok || strings.TrimSpace(stored) == "" {
		return false
	}
	one, multi, byIP, legacy := decodeSessionNonceState(stored)
	if legacy {
		if len(stored) != len(nonce) {
			return false
		}
		return subtle.ConstantTimeCompare([]byte(stored), []byte(nonce)) == 1
	}
	if multi {
		if byIP == nil {
			return false
		}
		k := NormalizeClientIPForSessionKey(clientIP)
		v, ok := byIP[k]
		if !ok || len(v) != len(nonce) {
			return false
		}
		return subtle.ConstantTimeCompare([]byte(v), []byte(nonce)) == 1
	}
	if len(one) != len(nonce) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(one), []byte(nonce)) == 1
}

// SessionNonceMatches 兼容旧调用：无 IP 时无法匹配多 IP 会话，视为不匹配。
func (s *ServerApp) SessionNonceMatches(username, nonce string) bool {
	return s.SessionNonceMatchesWithIP(username, nonce, "")
}

// ClearSessionNonceForUser 登出时清除，使旧 Cookie 立即失效。
func (s *ServerApp) ClearSessionNonceForUser(username string) error {
	if s == nil {
		return nil
	}
	kv := s.PlatformKV()
	if kv == nil {
		return nil
	}
	return kv.Set(sessionNonceKey(username), "")
}

// CountActiveSessionNonces 当前非空会话 nonce 键数量（与已登录用户数近似）。
func CountActiveSessionNonces(app *ServerApp) int {
	if app == nil {
		return 0
	}
	kv := app.PlatformKV()
	if kv == nil {
		return 0
	}
	n := 0
	for k, v := range kv.Snapshot() {
		if strings.HasPrefix(k, sessionNonceKVPrefix) && strings.TrimSpace(v) != "" {
			n++
		}
	}
	return n
}
