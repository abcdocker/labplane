package internal

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

func registerOpsCenterRoutes(api *gin.RouterGroup, app *ServerApp) {
	api.GET("/ops/ai-config", AdminOnlyMiddleware(app), handleOpsAIConfigGet(app))
	api.PUT("/ops/ai-config", AdminOnlyMiddleware(app), handleOpsAIConfigPut(app))
	api.POST("/ops/inspect/run", AdminOnlyMiddleware(app), handleOpsInspectRun(app))
	api.GET("/ops/inspect/reports", AdminOnlyMiddleware(app), handleOpsInspectReports(app))
	api.GET("/ops/inspect/tasks", AdminOnlyMiddleware(app), handleOpsInspectTaskList(app))
	api.GET("/ops/inspect/tasks/:taskId", AdminOnlyMiddleware(app), handleOpsInspectTaskGet(app))

	api.GET("/ops/grafana/config", handleOpsGrafanaConfigGet(app))
	api.PUT("/ops/grafana/config", AdminOnlyMiddleware(app), handleOpsGrafanaConfigPut(app))
	api.POST("/ops/grafana/sync", AdminOnlyMiddleware(app), handleOpsGrafanaSync(app))
	api.GET("/ops/grafana/dashboards", handleOpsGrafanaDashboardsList(app))
	api.GET("/ops/grafana/dashboards/:uid", handleOpsGrafanaDashboardGet(app))

	api.GET("/ops/monitoring/panels", handleOpsMonitoringPanelsGet(app))
	api.PUT("/ops/monitoring/panels", AdminOnlyMiddleware(app), handleOpsMonitoringPanelsPut(app))

	api.GET("/ops/alerts", AdminOnlyMiddleware(app), handleOpsAlertsGet(app))
	api.PUT("/ops/alerts", AdminOnlyMiddleware(app), handleOpsAlertsPut(app))
	api.POST("/ops/alerts/test-channel", AdminOnlyMiddleware(app), handleOpsAlertsTestChannel(app))
	api.GET("/ops/alerts/log", AdminOnlyMiddleware(app), handleOpsAlertsLogGet(app))
	api.POST("/ops/alerts/alertmanager-webhook/regenerate", AdminOnlyMiddleware(app), handleOpsAlertsAlertmanagerWebhookRegenerate(app))

	api.GET("/ops/vmlog/status", handleOpsVmLogStatus(app))
	api.GET("/ops/vmlog/sources", handleOpsVmLogSources())
	api.GET("/ops/vmlog/namespaces", handleOpsVmLogNamespaces(app))
	api.GET("/ops/vmlog/discover", handleOpsVmLogDiscover(app))
	api.POST("/ops/vmlog/overview", handleOpsVmLogOverview(app))
	api.POST("/ops/vmlog/details", handleOpsVmLogDetails(app))
	api.POST("/ops/vmlog/query", handleOpsVmLogQuery(app))
	api.POST("/ops/vmlog/search", handleOpsVmLogSearch(app))
	api.POST("/ops/vmlog/stats", handleOpsVmLogStats(app))
	api.POST("/ops/vmlog/ai-analyze", handleOpsVmLogAIAnalyze(app))
	api.POST("/ops/vmlog/ai-analyze-row", handleOpsVmLogAIAnalyzeRow(app))
	api.POST("/ops/vmlog/vm-shipper/script", handleOpsVmLogVmShipperScript(app))
	api.POST("/ops/vmlog/vm-shipper/inspect", AdminOnlyMiddleware(app), handleOpsVmLogVmShipperInspect(app))
	api.POST("/ops/vmlog/vm-shipper/apply", AdminOnlyMiddleware(app), handleOpsVmLogVmShipperApply(app))
	api.GET("/ops/vmlog/vm-shipper/tasks", AdminOnlyMiddleware(app), handleOpsVmLogVmShipperTaskList(app))
	api.GET("/ops/vmlog/vm-shipper/tasks/:taskId", AdminOnlyMiddleware(app), handleOpsVmLogVmShipperTaskGet(app))

	api.GET("/ops/cluster-advisory", handleOpsClusterAdvisoryGet(app))
	api.POST("/ops/cluster-advisory/ack", handleOpsClusterAdvisoryAck(app))
	api.POST("/ops/cluster-advisory/dismiss-bell", handleOpsClusterAdvisoryDismissBell(app))
	api.POST("/ops/cluster-advisory/run", AdminOnlyMiddleware(app), handleOpsClusterAdvisoryRun(app))

	api.POST("/ops/ai-assistant/chat", AdminOnlyMiddleware(app), handleOpsAIAssistantChat(app))
	api.POST("/ops/ai-discover", AdminOnlyMiddleware(app), handleOpsAIDiscover(app))
	api.POST("/ops/ai-discover/apply", AdminOnlyMiddleware(app), handleOpsAIDiscoverApply(app))
	api.GET("/ops/ai-usage", AdminOnlyMiddleware(app), func(c *gin.Context) { handleOpsAIUsageGet(c, app) })
	api.GET("/ops/ai-assistant/sessions", func(c *gin.Context) { handleAIAssistantSessionList(c, app) })
	api.GET("/ops/ai-assistant/sessions/:id", func(c *gin.Context) { handleAIAssistantSessionGet(c, app) })
	api.POST("/ops/ai-assistant/sessions", func(c *gin.Context) { handleAIAssistantSessionSave(c, app) })
	api.DELETE("/ops/ai-assistant/sessions/:id", func(c *gin.Context) { handleAIAssistantSessionDelete(c, app) })
	api.GET("/ops/vendor-guide", handleVendorGuideList)
	api.POST("/ops/vendor-discover", AdminOnlyMiddleware(app), func(c *gin.Context) { handleVendorDiscoverServices(c, app) })
	api.GET("/ops/audit/export", AdminOnlyMiddleware(app), func(c *gin.Context) { handleAuditExport(c, app) })
}

func handleOpsAIConfigGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		b, err := loadOpsAIInspectBundle(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"ai":             maskOpsAIJudgeSecret(b.AI),
			"judgeApiKeySet": strings.TrimSpace(b.AI.JudgeModel.APIKeyEnc) != "",
		})
	}
}

type opsAIConfigPutBody struct {
	AI OpsAIInspectConfig `json:"ai"`
	// JudgeAPIKey 判读模型 API Key 明文；空表示不修改已存密文。
	JudgeAPIKey string `json:"judgeApiKey"`
}

func handleOpsAIConfigPut(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsAIConfigPutBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		key, err := opsEncryptionKey(app.Cfg())
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		cur, err := loadOpsAIInspectBundle(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		prevJudgeKeyEnc := cur.AI.JudgeModel.APIKeyEnc
		cur.AI = body.AI
		if strings.TrimSpace(body.JudgeAPIKey) != "" {
			enc, err := encryptSecret(key, strings.TrimSpace(body.JudgeAPIKey))
			if err != nil {
				RespondAPIError500(c, err.Error())
				return
			}
			cur.AI.JudgeModel.APIKeyEnc = enc
		} else {
			// 未传明文时保留已存密文，避免前端整表单回存把密钥清空。
			cur.AI.JudgeModel.APIKeyEnc = prevJudgeKeyEnc
		}
		if err := saveOpsAIInspectBundle(app.PlatformKV(), cur); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "已保存"})
	}
}

func handleOpsInspectRun(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Domain string `json:"domain"`
		}
		if c.Request.ContentLength != 0 {
			if err := c.ShouldBindJSON(&body); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
				return
			}
		}
		domain := normalizeInspectionDomain(body.Domain)
		if domain == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的巡检域"})
			return
		}
		cfg := app.Cfg()
		bundle, err := loadOpsAIInspectBundle(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		task := newOpsInspectTask(domain)
		opsInspectTaskStore.Store(task.ID, task)
		go func(task *opsInspectTask, cfg Config, bundle OpsAIInspectBundle, domain string) {
			var rep InspectionReport
			var err error
			progress := func(progress int, stage, message string) {
				task.setProgress(progress, stage, message)
			}
			if domain == "platform" {
				rep, err = RunPlatformInspection(app, cfg, bundle, progress)
			} else {
				rep, err = RunInfrastructureDomainInspection(app, cfg, bundle, domain, progress)
			}
			if err != nil {
				task.finishError(err)
				return
			}
			task.finishSuccess(rep)
		}(task, cfg, bundle, domain)
		c.JSON(http.StatusOK, gin.H{
			"accepted": true,
			"taskId":   task.ID,
			"phase":    task.Phase,
			"progress": task.Progress,
			"message":  task.Message,
			"domain":   domain,
		})
	}
}

func handleOpsInspectReports(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		list, err := loadInspectReports(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		domainRaw := strings.TrimSpace(c.Query("domain"))
		if domainRaw != "" {
			domain := normalizeInspectionDomain(domainRaw)
			if domain == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的巡检域"})
				return
			}
			list = filterInspectReportsByDomain(list, domain)
		}
		total := len(list)
		if strings.TrimSpace(c.Query("limit")) == "" && strings.TrimSpace(c.Query("offset")) == "" {
			c.JSON(http.StatusOK, gin.H{"reports": list, "total": total, "offset": 0, "limit": total})
			return
		}
		offset := 0
		if s := strings.TrimSpace(c.Query("offset")); s != "" {
			if n, err := strconv.Atoi(s); err == nil && n >= 0 {
				offset = n
			}
		}
		limit := 20
		if s := strings.TrimSpace(c.Query("limit")); s != "" {
			if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 100 {
				limit = n
			}
		}
		if offset > total {
			offset = total
		}
		end := offset + limit
		if end > total {
			end = total
		}
		page := list[offset:end]
		c.JSON(http.StatusOK, gin.H{"reports": page, "total": total, "offset": offset, "limit": limit})
	}
}

func handleOpsInspectTaskList(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 8
		if s := strings.TrimSpace(c.Query("limit")); s != "" {
			if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 50 {
				limit = n
			}
		}
		c.JSON(http.StatusOK, gin.H{"tasks": opsInspectTaskList(limit)})
	}
}

func handleOpsInspectTaskGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskID := strings.TrimSpace(c.Param("taskId"))
		task, ok := opsInspectTaskGet(taskID)
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在或已过期"})
			return
		}
		c.JSON(http.StatusOK, task.snapshot())
	}
}

func handleOpsGrafanaConfigGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		m, err := loadOpsGrafanaMeta(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		authMode := strings.TrimSpace(m.AuthMode)
		if authMode == "" {
			authMode = "basic"
		}
		c.JSON(http.StatusOK, gin.H{
			"baseUrl":       m.BaseURL,
			"authMode":      authMode,
			"user":          m.User,
			"passwordSet":   strings.TrimSpace(m.PasswordEnc) != "",
			"skipTlsVerify": m.SkipTLSVerify,
			"lastSyncAt":    m.LastSyncAt,
			"lastSyncErr":   m.LastSyncErr,
			"dashboards":    m.Dashboards,
		})
	}
}

type opsGrafanaPutBody struct {
	BaseURL       string `json:"baseUrl"`
	AuthMode      string `json:"authMode"` // basic | api_token
	User          string `json:"user"`
	Password      string `json:"password"`
	SkipTLSVerify bool   `json:"skipTlsVerify"`
}

func handleOpsGrafanaConfigPut(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsGrafanaPutBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		key, err := opsEncryptionKey(app.Cfg())
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		m, err := loadOpsGrafanaMeta(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		m.BaseURL = strings.TrimSpace(body.BaseURL)
		am := strings.ToLower(strings.TrimSpace(body.AuthMode))
		if am == "api_token" {
			m.AuthMode = "api_token"
		} else {
			m.AuthMode = "basic"
		}
		m.User = strings.TrimSpace(body.User)
		if strings.TrimSpace(body.Password) != "" {
			enc, err := encryptSecret(key, strings.TrimSpace(body.Password))
			if err != nil {
				RespondAPIError500(c, err.Error())
				return
			}
			m.PasswordEnc = enc
		}
		m.SkipTLSVerify = body.SkipTLSVerify
		if err := saveOpsGrafanaMeta(app.PlatformKV(), m); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "已保存"})
	}
}

func handleOpsGrafanaSync(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		m, err := loadOpsGrafanaMeta(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		key, err := opsEncryptionKey(cfg)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		pass, err := decryptSecret(key, m.PasswordEnc)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := SyncGrafanaDashboards(app, cfg, &m, pass); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message":        "同步完成",
			"lastSyncAt":     m.LastSyncAt,
			"lastSyncErr":    m.LastSyncErr,
			"dashboardCount": len(m.Dashboards),
		})
	}
}

func handleOpsGrafanaDashboardsList(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		m, err := loadOpsGrafanaMeta(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"dashboards": m.Dashboards})
	}
}

func handleOpsGrafanaDashboardGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := strings.TrimSpace(c.Param("uid"))
		raw, err := readGrafanaDashboardFile(app, uid)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "未找到看板，请先同步"})
			return
		}
		c.Data(http.StatusOK, "application/json", raw)
	}
}

func handleOpsAlertsGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		b, err := loadOpsAlertCenter(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		chs := make([]gin.H, 0, len(b.Channels))
		for _, ch := range b.Channels {
			chs = append(chs, gin.H{
				"id":                 ch.ID,
				"type":               ch.Type,
				"smtpHost":           ch.SMTPHost,
				"smtpPort":           ch.SMTPPort,
				"smtpUser":           ch.SMTPUser,
				"smtpPassSet":        strings.TrimSpace(ch.SMTPPassEnc) != "",
				"fromAddr":           ch.FromAddr,
				"toAddrs":            ch.ToAddrs,
				"useTls":             ch.UseTLS,
				"wecomWebhook":       ch.WeComWebhook,
				"wecomCorpId":        ch.WeComCorpID,
				"wecomAgentId":       ch.WeComAgentID,
				"wecomCorpSecretSet": strings.TrimSpace(ch.WeComCorpSecretEnc) != "",
				"wecomToUser":        ch.WeComToUser,
				"dingtalkWebhook":    ch.DingTalkWebhook,
				"feishuWebhook":      ch.FeishuWebhook,
			})
		}
		out := gin.H{
			"rules":                              b.Rules,
			"channelIds":                         b.ChannelIDs,
			"silences":                           b.Silences,
			"channels":                           chs,
			"alertmanagerWebhookTokenConfigured": strings.TrimSpace(b.AlertmanagerWebhookTokenEnc) != "",
			"alertmanagerForwardToChannels":      b.AlertmanagerForwardToChannels,
		}
		if tok, err := decryptAlertmanagerWebhookToken(app, b.AlertmanagerWebhookTokenEnc); err == nil && strings.TrimSpace(tok) != "" {
			if u := buildAlertmanagerWebhookURL(app.Cfg(), tok); u != "" {
				out["alertmanagerWebhookUrl"] = u
			}
		}
		c.JSON(http.StatusOK, out)
	}
}

type opsAlertChannelIn struct {
	ID              string `json:"id"`
	Type            string `json:"type"`
	SMTPHost        string `json:"smtpHost"`
	SMTPPort        int    `json:"smtpPort"`
	SMTPUser        string `json:"smtpUser"`
	SMTPPassword    string `json:"smtpPassword"`
	FromAddr        string `json:"fromAddr"`
	ToAddrs         string `json:"toAddrs"`
	UseTLS          bool   `json:"useTls"`
	WeComWebhook    string `json:"wecomWebhook"`
	WeComCorpID     string `json:"wecomCorpId"`
	WeComAgentID    int    `json:"wecomAgentId"`
	WeComCorpSecret string `json:"wecomCorpSecret"`
	WeComToUser     string `json:"wecomToUser"`
	DingTalkWebhook string `json:"dingtalkWebhook"`
	FeishuWebhook   string `json:"feishuWebhook"`
}

func handleOpsAlertsPut(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Rules                         []OpsAlertRule      `json:"rules"`
			Channels                      []opsAlertChannelIn `json:"channels"`
			ChannelIDs                    []string            `json:"channelIds"`
			Silences                      []OpsAlertSilence   `json:"silences"`
			AlertmanagerForwardToChannels *bool               `json:"alertmanagerForwardToChannels"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		key, err := opsEncryptionKey(app.Cfg())
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		cur, err := loadOpsAlertCenter(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		oldPass := map[string]string{}
		oldWecomSec := map[string]string{}
		for _, ch := range cur.Channels {
			p, _ := decryptSecret(key, ch.SMTPPassEnc)
			oldPass[ch.ID] = p
			w, _ := decryptSecret(key, ch.WeComCorpSecretEnc)
			oldWecomSec[ch.ID] = w
		}
		var channels []OpsAlertChannel
		for _, in := range body.Channels {
			ch := OpsAlertChannel{
				ID: in.ID, Type: in.Type, SMTPHost: in.SMTPHost, SMTPPort: in.SMTPPort,
				SMTPUser: in.SMTPUser, FromAddr: in.FromAddr, ToAddrs: in.ToAddrs,
				UseTLS: in.UseTLS, WeComWebhook: in.WeComWebhook,
				WeComCorpID:     strings.TrimSpace(in.WeComCorpID),
				WeComAgentID:    in.WeComAgentID,
				WeComToUser:     strings.TrimSpace(in.WeComToUser),
				DingTalkWebhook: strings.TrimSpace(in.DingTalkWebhook),
				FeishuWebhook:   strings.TrimSpace(in.FeishuWebhook),
			}
			if strings.TrimSpace(in.SMTPPassword) != "" {
				enc, err := encryptSecret(key, strings.TrimSpace(in.SMTPPassword))
				if err != nil {
					RespondAPIError500(c, err.Error())
					return
				}
				ch.SMTPPassEnc = enc
			} else if in.ID != "" {
				if old, ok := oldPass[in.ID]; ok && old != "" {
					enc, _ := encryptSecret(key, old)
					ch.SMTPPassEnc = enc
				}
			}
			if strings.TrimSpace(in.WeComCorpSecret) != "" {
				enc, err := encryptSecret(key, strings.TrimSpace(in.WeComCorpSecret))
				if err != nil {
					RespondAPIError500(c, err.Error())
					return
				}
				ch.WeComCorpSecretEnc = enc
			} else if in.ID != "" {
				if old, ok := oldWecomSec[in.ID]; ok && old != "" {
					enc, _ := encryptSecret(key, old)
					ch.WeComCorpSecretEnc = enc
				}
			}
			channels = append(channels, ch)
		}
		fwd := cur.AlertmanagerForwardToChannels
		if body.AlertmanagerForwardToChannels != nil {
			fwd = *body.AlertmanagerForwardToChannels
		}
		bundle := OpsAlertCenterBundle{
			Rules:                         body.Rules,
			Channels:                      channels,
			ChannelIDs:                    body.ChannelIDs,
			Silences:                      body.Silences,
			AlertmanagerWebhookTokenEnc:   cur.AlertmanagerWebhookTokenEnc,
			AlertmanagerForwardToChannels: fwd,
		}
		if err := saveOpsAlertCenter(app.PlatformKV(), bundle); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "已保存"})
	}
}

type opsTestChannelBody struct {
	ChannelID string `json:"channelId"`
}

func handleOpsAlertsTestChannel(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsTestChannelBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		center, err := loadOpsAlertCenter(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		var ch *OpsAlertChannel
		for i := range center.Channels {
			if center.Channels[i].ID == body.ChannelID {
				ch = &center.Channels[i]
				break
			}
		}
		if ch == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "通道不存在"})
			return
		}
		key, err := opsEncryptionKey(app.Cfg())
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		pass, _ := decryptSecret(key, ch.SMTPPassEnc)
		subj := "[LabPlane] 告警通道测试"
		msg := "这是一条测试通知。\nlabels: test=1"
		switch strings.ToLower(strings.TrimSpace(ch.Type)) {
		case "email":
			if err := sendOpsEmail(*ch, pass, subj, msg); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
		case "wecom", "wework":
			if err := sendWeCom(ch.WeComWebhook, subj+"\n"+msg); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
		case "wecom_app":
			sec, _ := decryptSecret(key, ch.WeComCorpSecretEnc)
			if err := sendWeComAppMessage(ch.WeComCorpID, sec, ch.WeComAgentID, ch.WeComToUser, subj, msg); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
		case "dingtalk", "dingding":
			if err := PostDingTalkWebhook(c.Request.Context(), ch.DingTalkWebhook, subj+"\n"+msg); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
		case "feishu", "lark":
			if err := PostFeishuWebhook(c.Request.Context(), ch.FeishuWebhook, subj+"\n"+msg); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "未知通道类型"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "已发送测试"})
	}
}

func handleOpsAlertsLogGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw, ok := app.PlatformKV().Get(kvKeyOpsAlertLog)
		if !ok || strings.TrimSpace(raw) == "" {
			c.JSON(http.StatusOK, gin.H{"entries": []interface{}{}})
			return
		}
		var p alertLogPayload
		if err := json.Unmarshal([]byte(raw), &p); err != nil {
			c.JSON(http.StatusOK, gin.H{"entries": []interface{}{}})
			return
		}
		c.JSON(http.StatusOK, gin.H{"entries": p.Entries})
	}
}

const (
	opsMonitoringMaxCustomPanels = 48
	opsMonitoringMaxTitleRunes   = 120
	opsMonitoringMaxPromQLBytes  = 8000
)

func validateOpsMonitoringCustomPanels(panels []OpsMonitoringCustomPanel) error {
	if len(panels) > opsMonitoringMaxCustomPanels {
		return fmt.Errorf("自定义图最多 %d 个", opsMonitoringMaxCustomPanels)
	}
	seen := map[string]struct{}{}
	for i := range panels {
		p := &panels[i]
		p.ID = strings.TrimSpace(p.ID)
		p.Title = strings.TrimSpace(p.Title)
		p.Category = strings.TrimSpace(p.Category)
		p.PromQL = strings.TrimSpace(p.PromQL)
		p.Scope = strings.ToLower(strings.TrimSpace(p.Scope))
		p.Display = strings.ToLower(strings.TrimSpace(p.Display))
		if p.ID == "" {
			return fmt.Errorf("第 %d 项缺少 id", i+1)
		}
		if _, dup := seen[p.ID]; dup {
			return fmt.Errorf("重复的 id: %s", p.ID)
		}
		seen[p.ID] = struct{}{}
		if p.Title == "" {
			return fmt.Errorf("第 %d 项缺少标题", i+1)
		}
		if utf8.RuneCountInString(p.Title) > opsMonitoringMaxTitleRunes {
			return fmt.Errorf("标题过长（第 %d 项）", i+1)
		}
		if p.PromQL == "" {
			return fmt.Errorf("第 %d 项缺少 PromQL", i+1)
		}
		if len(p.PromQL) > opsMonitoringMaxPromQLBytes {
			return fmt.Errorf("PromQL 过长（第 %d 项）", i+1)
		}
		switch p.Scope {
		case "k8s", "vcenter", "inherit", "":
			if p.Scope == "" {
				p.Scope = "inherit"
			}
		default:
			return fmt.Errorf("第 %d 项 scope 须为 k8s、vcenter 或 inherit", i+1)
		}
		switch p.Display {
		case "single", "matrix", "":
			if p.Display == "" {
				p.Display = "single"
			}
		default:
			return fmt.Errorf("第 %d 项 display 须为 single 或 matrix", i+1)
		}
		if len(p.LabelKeys) > 16 {
			return fmt.Errorf("labelKeys 过多（第 %d 项）", i+1)
		}
		for j := range p.LabelKeys {
			p.LabelKeys[j] = strings.TrimSpace(p.LabelKeys[j])
		}
	}
	return nil
}

func handleOpsMonitoringPanelsGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		list, err := loadOpsMonitoringCustomPanels(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		if list == nil {
			list = []OpsMonitoringCustomPanel{}
		}
		c.JSON(http.StatusOK, gin.H{"panels": list})
	}
}

func handleOpsMonitoringPanelsPut(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsMonitoringPanelsPayload
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		if err := validateOpsMonitoringCustomPanels(body.Panels); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := saveOpsMonitoringCustomPanels(app.PlatformKV(), body.Panels); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "已保存", "panels": body.Panels})
	}
}
