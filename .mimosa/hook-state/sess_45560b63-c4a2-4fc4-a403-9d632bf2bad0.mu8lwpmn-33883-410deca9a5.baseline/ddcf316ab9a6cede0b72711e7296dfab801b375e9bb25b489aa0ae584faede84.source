package internal

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

const kvKeyOpsAlertLog = "kubebt_ops_alert_log_v1"

type alertLogEntry struct {
	Ts      string `json:"ts"`
	RuleID  string `json:"ruleId"`
	Rule    string `json:"rule"`
	Status  string `json:"status"` // firing | resolved
	Message string `json:"message"`
	Source  string `json:"source,omitempty"` // alertmanager | 空为平台规则引擎
}

type alertLogPayload struct {
	Entries []alertLogEntry `json:"entries"`
}

func appendAlertLog(kv PlatformKV, e alertLogEntry, max int) {
	if kv == nil || max <= 0 {
		max = 100
	}
	var p alertLogPayload
	raw, ok := kv.Get(kvKeyOpsAlertLog)
	if ok && strings.TrimSpace(raw) != "" {
		_ = json.Unmarshal([]byte(raw), &p)
	}
	p.Entries = append([]alertLogEntry{e}, p.Entries...)
	if len(p.Entries) > max {
		p.Entries = p.Entries[:max]
	}
	b, err := json.Marshal(p)
	if err != nil {
		return
	}
	_ = kv.Set(kvKeyOpsAlertLog, string(b))
}

// StartOpsCenterBackground 告警评估与每日巡检报告。
func StartOpsCenterBackground(app *ServerApp) {
	cfg := app.Cfg()
	ticker := time.NewTicker(1 * time.Minute)
	go func() {
		for range ticker.C {
			opsTickAlerts(app, cfg)
			opsTickDailyInspect(app, cfg)
		}
	}()
	log.Println("ops-center: 后台任务已启动（告警 1m、每日巡检）")
}

func opsTickDailyInspect(app *ServerApp, cfg Config) {
	bundle, err := loadOpsAIInspectBundle(app.PlatformKV())
	if err != nil {
		return
	}
	h := bundle.AI.DailyReportHour
	if h < 0 || h > 23 {
		h = 8
	}
	m := bundle.AI.DailyReportMinute
	if m < 0 || m > 59 {
		m = 0
	}
	// 容器内多为 UTC；界面「每日几点」按中国习惯理解为东八区，与 datetime-cn 等一致。
	now := time.Now().In(BeijingLocation())
	if now.Hour() != h || now.Minute() != m {
		return
	}
	day := now.Format("2006-01-02")
	raw, ok := app.PlatformKV().Get(kvKeyOpsInspectCron)
	var st struct {
		LastDaily string `json:"lastDaily"`
	}
	if ok && raw != "" {
		_ = json.Unmarshal([]byte(raw), &st)
	}
	if st.LastDaily == day {
		return
	}
	_, err = RunPlatformInspection(app, cfg, bundle, nil)
	if err != nil {
		log.Printf("ops-center daily inspect: %v", err)
		return
	}
	st.LastDaily = day
	b, _ := json.Marshal(st)
	_ = app.PlatformKV().Set(kvKeyOpsInspectCron, string(b))
	log.Printf("ops-center: 已生成每日巡检报告 %s", day)
}

func opsTickAlerts(app *ServerApp, cfg Config) {
	center, err := loadOpsAlertCenter(app.PlatformKV())
	if err != nil || len(center.Rules) == 0 {
		return
	}
	state, err := loadOpsAlertState(app.PlatformKV())
	if err != nil {
		return
	}
	now := time.Now().Unix()
	for _, rule := range center.Rules {
		if !rule.Enabled || strings.TrimSpace(rule.ID) == "" {
			continue
		}
		if opsSilenced(center.Silences, rule) {
			delete(state.PendingSince, rule.ID)
			continue
		}
		sc := strings.ToLower(strings.TrimSpace(rule.Scope))
		if sc == "" {
			sc = "k8s"
		}
		v := PrometheusPromQLInstantScalar(cfg, sc, rule.PromQL)
		cond := false
		if v != nil {
			cond = cmpThreshold(rule.Compare, *v, rule.Threshold)
		}
		forSec := rule.ForSeconds
		if forSec <= 0 {
			forSec = 60
		}
		wasFiring := state.LastFiring[rule.ID]
		if !cond {
			if wasFiring {
				msg := formatPromAlertMessage(rule, "resolved", 0)
				opsNotifyChannels(app, cfg, center, "RESOLVED: "+rule.Name, msg)
				appendAlertLog(app.PlatformKV(), alertLogEntry{
					Ts: time.Now().UTC().Format(time.RFC3339), RuleID: rule.ID, Rule: rule.Name, Status: "resolved", Message: msg,
				}, 200)
			}
			delete(state.PendingSince, rule.ID)
			state.LastFiring[rule.ID] = false
			continue
		}
		if state.PendingSince[rule.ID] == 0 {
			state.PendingSince[rule.ID] = now
		}
		if now-state.PendingSince[rule.ID] < int64(forSec) {
			continue
		}
		if !wasFiring {
			val := 0.0
			if v != nil {
				val = *v
			}
			msg := formatPromAlertMessage(rule, "firing", val)
			subj := fmt.Sprintf("[FIRING] %s", rule.Name)
			opsNotifyChannels(app, cfg, center, subj, msg)
			appendAlertLog(app.PlatformKV(), alertLogEntry{
				Ts: time.Now().UTC().Format(time.RFC3339), RuleID: rule.ID, Rule: rule.Name, Status: "firing", Message: msg,
			}, 200)
		}
		state.LastFiring[rule.ID] = true
	}
	_ = saveOpsAlertState(app.PlatformKV(), state)
}

func opsSilenced(silences []OpsAlertSilence, rule OpsAlertRule) bool {
	labels := map[string]string{"alertname": rule.Name}
	for k, v := range rule.Labels {
		labels[k] = v
	}
	now := time.Now()
	for _, s := range silences {
		if len(s.Matchers) == 0 {
			continue
		}
		until, err := time.Parse(time.RFC3339, strings.TrimSpace(s.Until))
		if err != nil || until.Before(now) {
			continue
		}
		match := true
		for mk, mv := range s.Matchers {
			lv := labels[mk]
			if lv != mv {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

func cmpThreshold(op string, v, th float64) bool {
	switch strings.ToLower(strings.TrimSpace(op)) {
	case "gt":
		return v > th
	case "gte", "ge":
		return v >= th
	case "lt":
		return v < th
	case "lte", "le":
		return v <= th
	case "eq", "==":
		return v == th
	case "neq", "ne", "!=":
		return v != th
	default:
		return v > th
	}
}

func formatPromAlertMessage(rule OpsAlertRule, status string, value float64) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("alertname=%q\n", rule.Name))
	b.WriteString(fmt.Sprintf("status=%s\n", status))
	b.WriteString(fmt.Sprintf("promql=%s\n", rule.PromQL))
	b.WriteString(fmt.Sprintf("value=%g\n", value))
	for k, v := range rule.Labels {
		b.WriteString(fmt.Sprintf("%s=%q\n", k, v))
	}
	for k, v := range rule.Annotations {
		b.WriteString(fmt.Sprintf("%s: %s\n", k, v))
	}
	return b.String()
}

func opsNotifyChannels(app *ServerApp, cfg Config, center OpsAlertCenterBundle, subject, body string) {
	enc, err := opsEncryptionKey(cfg)
	if err != nil {
		return
	}
	chByID := map[string]OpsAlertChannel{}
	for _, c := range center.Channels {
		chByID[c.ID] = c
	}
	for _, id := range center.ChannelIDs {
		ch, ok := chByID[id]
		if !ok {
			continue
		}
		switch strings.ToLower(strings.TrimSpace(ch.Type)) {
		case "email":
			pass, _ := decryptSecret(enc, ch.SMTPPassEnc)
			_ = sendOpsEmail(ch, pass, subject, body)
		case "wecom", "wework":
			_ = sendWeCom(ch.WeComWebhook, subject+"\n"+body)
		case "wecom_app":
			sec, _ := decryptSecret(enc, ch.WeComCorpSecretEnc)
			_ = sendWeComAppMessage(ch.WeComCorpID, sec, ch.WeComAgentID, ch.WeComToUser, subject, body)
		case "dingtalk", "dingding":
			_ = PostDingTalkWebhook(context.Background(), ch.DingTalkWebhook, subject+"\n"+body)
		case "feishu", "lark":
			_ = PostFeishuWebhook(context.Background(), ch.FeishuWebhook, subject+"\n"+body)
		}
	}
}

func sendOpsEmail(ch OpsAlertChannel, pass, subject, body string) error {
	host := strings.TrimSpace(ch.SMTPHost)
	if host == "" || ch.SMTPPort <= 0 {
		return fmt.Errorf("smtp not configured")
	}
	to := strings.Split(strings.ReplaceAll(ch.ToAddrs, "，", ","), ",")
	var addrs []string
	for _, t := range to {
		t = strings.TrimSpace(t)
		if t != "" {
			addrs = append(addrs, t)
		}
	}
	if len(addrs) == 0 {
		return fmt.Errorf("no recipients")
	}
	addr := host + ":" + strconv.Itoa(ch.SMTPPort)
	from := strings.TrimSpace(ch.FromAddr)
	var auth smtp.Auth
	if ch.SMTPUser != "" {
		auth = smtp.PlainAuth("", ch.SMTPUser, pass, host)
	}
	msg := []byte("To: " + strings.Join(addrs, ",") + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n\r\n" +
		body + "\r\n")
	return smtp.SendMail(addr, auth, from, addrs, msg)
}

func sendWeCom(webhook, text string) error {
	webhook = strings.TrimSpace(webhook)
	if webhook == "" {
		return fmt.Errorf("no webhook")
	}
	payload := map[string]interface{}{
		"msgtype": "text",
		"text":    map[string]string{"content": text},
	}
	b, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, webhook, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	cli := &http.Client{Timeout: 15 * time.Second, Transport: &http.Transport{
		TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12},
	}}
	resp, err := cli.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("wecom %d", resp.StatusCode)
	}
	return nil
}
