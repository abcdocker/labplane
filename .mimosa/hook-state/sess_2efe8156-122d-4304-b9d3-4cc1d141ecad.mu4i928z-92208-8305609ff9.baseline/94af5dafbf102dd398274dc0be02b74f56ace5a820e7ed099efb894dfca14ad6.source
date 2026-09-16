package internal

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// WeCom 企业微信应用 API（非群机器人 webhook）。
// 文档：https://developer.work.weixin.qq.com/document/path/90236

type wecomAppTokenCacheEntry struct {
	token   string
	expires time.Time
}

var wecomAppTokenCache sync.Map // key: corpID+"|"+secretPlain -> wecomAppTokenCacheEntry

func wecomAppGetAccessToken(corpID, corpSecret string) (string, error) {
	corpID = strings.TrimSpace(corpID)
	corpSecret = strings.TrimSpace(corpSecret)
	if corpID == "" || corpSecret == "" {
		return "", fmt.Errorf("企业 ID 或应用 Secret 为空")
	}
	key := corpID + "|" + corpSecret
	if v, ok := wecomAppTokenCache.Load(key); ok {
		e := v.(wecomAppTokenCacheEntry)
		if time.Now().Before(e.expires) && e.token != "" {
			return e.token, nil
		}
	}
	u := fmt.Sprintf("https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=%s&corpsecret=%s",
		url.QueryEscape(corpID), url.QueryEscape(corpSecret))
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return "", err
	}
	cli := &http.Client{Timeout: 20 * time.Second}
	resp, err := cli.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	var out struct {
		ErrCode     int    `json:"errcode"`
		ErrMsg      string `json:"errmsg"`
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(b, &out); err != nil {
		return "", fmt.Errorf("解析 gettoken 响应: %w", err)
	}
	if out.ErrCode != 0 {
		return "", fmt.Errorf("gettoken errcode=%d %s", out.ErrCode, out.ErrMsg)
	}
	if strings.TrimSpace(out.AccessToken) == "" {
		return "", fmt.Errorf("gettoken 无 access_token")
	}
	exp := time.Now().Add(time.Duration(intMax(60, out.ExpiresIn-120)) * time.Second)
	wecomAppTokenCache.Store(key, wecomAppTokenCacheEntry{token: out.AccessToken, expires: exp})
	return out.AccessToken, nil
}

func intMax(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func sendWeComAppMessage(corpID, corpSecret string, agentID int, toUser, subject, body string) error {
	tok, err := wecomAppGetAccessToken(corpID, corpSecret)
	if err != nil {
		return err
	}
	content := strings.TrimSpace(subject + "\n" + body)
	if len(content) > 3800 {
		content = content[:3800] + "…"
	}
	to := strings.TrimSpace(toUser)
	if to == "" {
		to = "@all"
	}
	payload := map[string]interface{}{
		"touser":  to,
		"msgtype": "text",
		"agentid": agentID,
		"text": map[string]string{
			"content": content,
		},
	}
	b, _ := json.Marshal(payload)
	u := "https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=" + url.QueryEscape(tok)
	req, err := http.NewRequest(http.MethodPost, u, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	cli := &http.Client{Timeout: 25 * time.Second}
	resp, err := cli.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	rb, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	var out struct {
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	_ = json.Unmarshal(rb, &out)
	if out.ErrCode != 0 {
		return fmt.Errorf("message/send errcode=%d %s", out.ErrCode, out.ErrMsg)
	}
	return nil
}
