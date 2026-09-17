package internal

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const alertmanagerWebhookMaxBody = 1 << 20 // 1 MiB

// alertmanagerWebhookPayload Alertmanager 向 webhook_configs.url POST 的 JSON（字段子集即可解析）。
type alertmanagerWebhookPayload struct {
	Status            string `json:"status"`
	Receiver          string `json:"receiver"`
	GroupKey          string `json:"groupKey"`
	ExternalURL       string `json:"externalURL"`
	CommonLabels      map[string]string `json:"commonLabels"`
	CommonAnnotations map[string]string `json:"commonAnnotations"`
	Alerts              []struct {
		Status       string            `json:"status"`
		Labels       map[string]string `json:"labels"`
		Annotations  map[string]string `json:"annotations"`
		StartsAt     string            `json:"startsAt"`
		EndsAt       string            `json:"endsAt"`
		GeneratorURL string            `json:"generatorURL"`
		Fingerprint  string            `json:"fingerprint"`
	} `json:"alerts"`
}

func randomWebhookTokenHex() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func constantTimeStringEq(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func decryptAlertmanagerWebhookToken(app *ServerApp, enc string) (string, error) {
	enc = strings.TrimSpace(enc)
	if enc == "" {
		return "", nil
	}
	key, err := opsEncryptionKey(app.Cfg())
	if err != nil {
		return "", err
	}
	return decryptSecret(key, enc)
}

func buildAlertmanagerWebhookURL(cfg Config, plainToken string) string {
	base := strings.TrimRight(strings.TrimSpace(cfg.PlatformPublicURL), "/")
	tok := strings.TrimSpace(plainToken)
	if base == "" || tok == "" {
		return ""
	}
	return base + "/api/hooks/alertmanager?token=" + url.QueryEscape(tok)
}

func formatAlertmanagerWebhookBody(p *alertmanagerWebhookPayload) string {
	var b strings.Builder
	b.WriteString("receiver=" + p.Receiver + "\n")
	b.WriteString("status=" + p.Status + "\n")
	if p.GroupKey != "" {
		b.WriteString("groupKey=" + p.GroupKey + "\n")
	}
	if p.ExternalURL != "" {
		b.WriteString("externalURL=" + p.ExternalURL + "\n")
	}
	for k, v := range p.CommonLabels {
		b.WriteString(k + "=" + v + "\n")
	}
	for k, v := range p.CommonAnnotations {
		b.WriteString(k + ": " + v + "\n")
	}
	b.WriteString("\n-- alerts --\n")
	for i, a := range p.Alerts {
		if i > 0 {
			b.WriteString("\n")
		}
		name := ""
		if a.Labels != nil {
			name = a.Labels["alertname"]
		}
		b.WriteString("[" + a.Status + "] " + name + "\n")
		for k, v := range a.Labels {
			b.WriteString("  " + k + "=" + v + "\n")
		}
		for k, v := range a.Annotations {
			b.WriteString("  " + k + ": " + v + "\n")
		}
		if a.GeneratorURL != "" {
			b.WriteString("  generatorURL=" + a.GeneratorURL + "\n")
		}
	}
	return b.String()
}

func alertmanagerPrimaryRuleName(p *alertmanagerWebhookPayload) string {
	if len(p.Alerts) == 0 {
		return "alertmanager"
	}
	if p.Alerts[0].Labels != nil {
		if n := strings.TrimSpace(p.Alerts[0].Labels["alertname"]); n != "" {
			return n
		}
	}
	return "alertmanager"
}

func alertmanagerPrimaryFingerprint(p *alertmanagerWebhookPayload) string {
	if len(p.Alerts) == 0 {
		return ""
	}
	return strings.TrimSpace(p.Alerts[0].Fingerprint)
}

// handleAlertmanagerWebhook 接收 Alertmanager webhook（无需登录，凭 URL query token 校验）。
func handleAlertmanagerWebhook(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, alertmanagerWebhookMaxBody)
		raw, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "read body"})
			return
		}
		center, err := loadOpsAlertCenter(app.PlatformKV())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "load config"})
			return
		}
		wantTok, err := decryptAlertmanagerWebhookToken(app, center.AlertmanagerWebhookTokenEnc)
		if err != nil || strings.TrimSpace(wantTok) == "" {
			c.JSON(http.StatusNotFound, gin.H{"error": "webhook 未配置"})
			return
		}
		gotTok := strings.TrimSpace(c.Query("token"))
		if gotTok == "" {
			gotTok = strings.TrimSpace(c.GetHeader("X-Kubebt-Webhook-Token"))
		}
		if !constantTimeStringEq(gotTok, wantTok) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		var p alertmanagerWebhookPayload
		if err := json.Unmarshal(raw, &p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid json"})
			return
		}
		body := formatAlertmanagerWebhookBody(&p)
		st := strings.ToLower(strings.TrimSpace(p.Status))
		if st == "" {
			st = "unknown"
		}
		ruleName := alertmanagerPrimaryRuleName(&p)
		fp := alertmanagerPrimaryFingerprint(&p)
		ruleID := "am-" + fp
		if strings.TrimSpace(fp) == "" {
			ruleID = "am-" + time.Now().UTC().Format("20060102150405")
		}
		subj := "[Alertmanager] " + strings.ToUpper(st) + ": " + ruleName
		appendAlertLog(app.PlatformKV(), alertLogEntry{
			Ts:      time.Now().UTC().Format(time.RFC3339Nano),
			RuleID:  ruleID,
			Rule:    ruleName + " (Alertmanager)",
			Status:  st,
			Message: body,
			Source:  "alertmanager",
		}, 200)

		forward := center.AlertmanagerForwardToChannels
		if forward && len(center.ChannelIDs) > 0 {
			opsNotifyChannels(app, app.Cfg(), center, subj, body)
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func handleOpsAlertsAlertmanagerWebhookRegenerate(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		base := strings.TrimRight(strings.TrimSpace(app.Cfg().PlatformPublicURL), "/")
		if base == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请先配置平台对外 URL（PLATFORM_PUBLIC_URL 或运行时 platformPublicUrl），否则无法生成可访问的 Webhook 地址。"})
			return
		}
		tok, err := randomWebhookTokenHex()
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		key, err := opsEncryptionKey(app.Cfg())
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		enc, err := encryptSecret(key, tok)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		bundle, err := loadOpsAlertCenter(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		bundle.AlertmanagerWebhookTokenEnc = enc
		if err := saveOpsAlertCenter(app.PlatformKV(), bundle); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		webhookURL := buildAlertmanagerWebhookURL(app.Cfg(), tok)
		log.Printf("ops-alerts: alertmanager webhook token regenerated (admin)")
		c.JSON(http.StatusOK, gin.H{
			"webhookUrl": webhookURL,
			"message":    "已生成新 token 并保存。请立即将下方完整 URL 配置到 Alertmanager；旧 token 即刻失效。",
		})
	}
}
