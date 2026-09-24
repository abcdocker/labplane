package internal

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	// kvKeyVmLogAIAnalysis 存储已登记问题；沿用历史 KV key（含 openclaw 字样）保证旧数据兼容。
	kvKeyVmLogAIAnalysis      = "labplane_ops_vmlog_openclaw_analysis_v1"
	vmlogAnalysisMaxIssues    = 160
	vmlogAnalysisMaxScopes    = 80
	vmlogAnalysisMaxSample    = 100
	vmlogAnalysisMaxUserRunes = 95000
)

// VmLogAnalysisIssue 已登记问题（按 fingerprint 去重，避免模型重复输出）。
type VmLogAnalysisIssue struct {
	Fingerprint string `json:"fingerprint"`
	Title       string `json:"title"`
	Kind        string `json:"kind"`
	FirstSeen   string `json:"firstSeen"`
	LastSeen    string `json:"lastSeen"`
}

type vmLogAnalysisScope struct {
	Issues []VmLogAnalysisIssue `json:"issues"`
}

type vmLogAnalysisRoot struct {
	Scopes map[string]*vmLogAnalysisScope `json:"scopes"`
}

func loadVmLogAnalysisRoot(kv PlatformKV) (vmLogAnalysisRoot, error) {
	var out vmLogAnalysisRoot
	out.Scopes = map[string]*vmLogAnalysisScope{}
	if kv == nil {
		return out, fmt.Errorf("kv nil")
	}
	raw, ok := kv.Get(kvKeyVmLogAIAnalysis)
	if !ok || strings.TrimSpace(raw) == "" {
		return out, nil
	}
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return out, err
	}
	if out.Scopes == nil {
		out.Scopes = map[string]*vmLogAnalysisScope{}
	}
	return out, nil
}

func saveVmLogAnalysisRoot(kv PlatformKV, root vmLogAnalysisRoot) error {
	if kv == nil {
		return fmt.Errorf("kv nil")
	}
	if root.Scopes == nil {
		root.Scopes = map[string]*vmLogAnalysisScope{}
	}
	js, err := json.Marshal(root)
	if err != nil {
		return err
	}
	return kv.Set(kvKeyVmLogAIAnalysis, string(js))
}

func vmlogAnalysisScopeKey(category, k8sNs, keyword, k8sPod, kwField, start, end string, windowMin int) string {
	h := sha256.Sum256([]byte(strings.Join([]string{
		strings.TrimSpace(category),
		strings.TrimSpace(k8sNs),
		strings.TrimSpace(keyword),
		strings.TrimSpace(k8sPod),
		strings.TrimSpace(kwField),
		strings.TrimSpace(start),
		strings.TrimSpace(end),
		fmt.Sprintf("%d", windowMin),
	}, "\n")))
	return hex.EncodeToString(h[:])
}

var nonIdentFingerprint = regexp.MustCompile(`[^a-z0-9_]+`)

func normIssueFingerprint(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = nonIdentFingerprint.ReplaceAllString(s, "_")
	s = strings.Trim(s, "_")
	if len(s) > 96 {
		s = s[:96]
	}
	if s == "" {
		return "unnamed"
	}
	return s
}

func normalizeMsgDedupeKey(msg string) string {
	s := strings.TrimSpace(msg)
	r := []rune(s)
	if len(r) > 200 {
		s = string(r[:200])
	}
	return strings.ToLower(strings.Join(strings.Fields(s), " "))
}

type vmlogAggLine struct {
	firstT  time.Time
	lastT   time.Time
	ns      string
	src     string
	msg     string
	count   int
	hasTime bool
}

func buildVmLogSampleForAI(matched []map[string]any, sampleLimit int) string {
	if sampleLimit <= 0 {
		sampleLimit = vmlogAnalysisMaxSample
	}
	if sampleLimit > vmlogAnalysisMaxSample {
		sampleLimit = vmlogAnalysisMaxSample
	}
	merged := mergeAdjacentVmlogRowsForPreview(matched, 10*time.Second)
	aggs := map[string]*vmlogAggLine{}
	order := []string{}

	for i, row := range merged {
		msg := redactLogTextForAI(vmlogRowMsg(row))
		key := normalizeMsgDedupeKey(msg)
		if key == "" {
			key = fmt.Sprintf("_empty_line_%d", i)
		}
		tm, tOK := parseRowTime(row)
		ns := k8sNamespaceFromRow(row)
		src := vmlogRowSourceKey(row)
		if aggs[key] == nil {
			aggs[key] = &vmlogAggLine{ns: ns, src: src, msg: msg, count: 0, hasTime: tOK}
			if tOK {
				aggs[key].firstT = tm
				aggs[key].lastT = tm
			}
			order = append(order, key)
		}
		a := aggs[key]
		a.count++
		if tOK {
			if !a.hasTime {
				a.firstT, a.lastT, a.hasTime = tm, tm, true
			} else {
				if tm.Before(a.firstT) {
					a.firstT = tm
				}
				if tm.After(a.lastT) {
					a.lastT = tm
				}
			}
		}
		if ns != "" {
			a.ns = ns
		}
		if src != "" {
			a.src = src
		}
		if msg != "" && len(msg) > len(a.msg) {
			a.msg = msg
		}
	}

	var lines []string
	totalRunes := 0
	// 取时间上较新的聚合项优先：按 lastT 排序
	type pair struct {
		key string
		ts  int64
	}
	var idx []pair
	for _, k := range order {
		a := aggs[k]
		ts := int64(0)
		if a.hasTime {
			ts = a.lastT.Unix()
		}
		idx = append(idx, pair{key: k, ts: ts})
	}
	sort.Slice(idx, func(i, j int) bool { return idx[i].ts > idx[j].ts })

	for _, p := range idx {
		if len(lines) >= sampleLimit {
			break
		}
		a := aggs[p.key]
		tStr := "—"
		if a.hasTime {
			if a.count > 1 && !a.firstT.Equal(a.lastT) {
				tStr = a.firstT.Format(time.RFC3339) + " … " + a.lastT.Format(time.RFC3339)
			} else {
				tStr = a.lastT.Format(time.RFC3339)
			}
		}
		msg := a.msg
		if len([]rune(msg)) > 4000 {
			rs := []rune(msg)
			msg = string(rs[:4000]) + "…"
		}
		cnt := ""
		if a.count > 1 {
			cnt = fmt.Sprintf(" [同类重复×%d]", a.count)
		}
		line := fmt.Sprintf("[%s] ns=%s src=%s%s %s", tStr, nullDash(a.ns), nullDash(a.src), cnt, msg)
		totalRunes += len([]rune(line)) + 1
		if totalRunes > vmlogAnalysisMaxUserRunes {
			lines = append(lines, "…（样本过长，后续行已截断）")
			break
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n")
}

func nullDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "—"
	}
	return s
}

func extractJSONObjectFromLLM(s string) []byte {
	s = strings.TrimSpace(s)
	if i := strings.Index(s, "```json"); i >= 0 {
		s = s[i+7:]
		if j := strings.Index(s, "```"); j >= 0 {
			s = strings.TrimSpace(s[:j])
		}
	} else if i := strings.Index(s, "```"); i >= 0 {
		s = s[i+3:]
		if j := strings.Index(s, "```"); j >= 0 {
			s = strings.TrimSpace(s[:j])
		}
	}
	i := strings.Index(s, "{")
	j := strings.LastIndex(s, "}")
	if i < 0 || j <= i {
		return nil
	}
	return []byte(s[i : j+1])
}

type opsVmLogOpenclawAnalyzeBody struct {
	Category         string `json:"category"`
	K8sNamespace     string `json:"k8sNamespace"`
	K8sPodName       string `json:"k8sPodName"`
	Keyword          string `json:"keyword"`
	KeywordField     string `json:"keywordField"`
	Host             string `json:"host"`
	Level            string `json:"level"`
	WindowMinutes    int    `json:"windowMinutes"`
	StartTime        string `json:"startTime"`
	EndTime          string `json:"endTime"`
	FetchLimit       int    `json:"fetchLimit"`
	SampleLimit      int    `json:"sampleLimit"`
	ClearKnownIssues bool   `json:"clearKnownIssues"`
}

type opsVmLogOpenclawAnalyzeRowBody struct {
	Scope         string               `json:"scope"`
	K8sNamespace  string               `json:"k8sNamespace"`
	K8sPodName    string               `json:"k8sPodName"`
	Keyword       string               `json:"keyword"`
	KeywordField  string               `json:"keywordField"`
	WindowMinutes int                  `json:"windowMinutes"`
	StartTime     string               `json:"startTime"`
	EndTime       string               `json:"endTime"`
	Row           opsVmLogAnalyzeRowIn `json:"row"`
}

type opsVmLogAnalyzeRowIn struct {
	Time           string              `json:"time"`
	Scope          string              `json:"scope"`
	Namespace      string              `json:"namespace"`
	Pod            string              `json:"pod"`
	Source         string              `json:"source"`
	Msg            string              `json:"msg"`
	Fields         []opsVmLogAnalyzeKV `json:"fields"`
	Status         string              `json:"status"`
	HasError       bool                `json:"hasError"`
	Priority       string              `json:"priority"`
	PriorityReason string              `json:"priorityReason"`
}

type opsVmLogAnalyzeKV struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type vmlogAILLMOut struct {
	Summary   string `json:"summary"`
	NewIssues []struct {
		Fingerprint    string `json:"fingerprint"`
		Title          string `json:"title"`
		Classification string `json:"classification"`
		Evidence       string `json:"evidence"`
		Recommendation string `json:"recommendation"`
	} `json:"new_issues"`
}

func handleOpsVmLogAIAnalyze(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsVmLogOpenclawAnalyzeBody
		_ = c.ShouldBindJSON(&body)
		body.Category = normalizeVmLogQuerySource(body.Category)
		if body.ClearKnownIssues {
			if getDashboardRoleFromGin(c) != DashboardRoleAdmin {
				RespondAPIPermissionDenied(c)
				return
			}
			root, err := loadVmLogAnalysisRoot(app.PlatformKV())
			if err != nil {
				RespondAPIError500(c, err.Error())
				return
			}
			sk := vmlogAnalysisScopeKey(body.Category, body.K8sNamespace, body.Keyword, body.K8sPodName, body.KeywordField, body.StartTime, body.EndTime, body.WindowMinutes)
			delete(root.Scopes, sk)
			if err := saveVmLogAnalysisRoot(app.PlatformKV(), root); err != nil {
				RespondAPIError500(c, err.Error())
				return
			}
			c.JSON(http.StatusOK, gin.H{"message": "已清除本筛选条件下的已登记问题", "scopeKey": sk})
			return
		}

		statsBody := opsVmLogStatsBody{
			Category:      body.Category,
			K8sNamespace:  body.K8sNamespace,
			K8sPodName:    body.K8sPodName,
			Host:          body.Host,
			Keyword:       body.Keyword,
			KeywordField:  body.KeywordField,
			WindowMinutes: body.WindowMinutes,
			StartTime:     body.StartTime,
			EndTime:       body.EndTime,
			FetchLimit:    body.FetchLimit,
		}

		matched, totalFetched, truncated, scanWarn, win, startT, endT, err := vmlogPullMatchedRows(c.Request.Context(), app, statsBody)
		if err != nil {
			if strings.Contains(err.Error(), "未配置") {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		if hostFilter := strings.ToLower(strings.TrimSpace(body.Host)); hostFilter != "" || strings.TrimSpace(body.Level) != "" {
			scopeName := vmlogSummaryScope(body.Category)
			filtered := make([]map[string]any, 0, len(matched))
			for _, row := range matched {
				if hostFilter != "" && !strings.Contains(strings.ToLower(vmlogRowHost(row)), hostFilter) {
					continue
				}
				if !vmlogMatchesLevel(scopeName, body.Level, row) {
					continue
				}
				filtered = append(filtered, row)
			}
			matched = filtered
		}

		cfg := app.Cfg()
		bundle, lerr := loadOpsAIInspectBundle(app.PlatformKV())
		if lerr != nil {
			RespondAPIError500(c, lerr.Error())
			return
		}
		ai := bundle.AI
		if !opsJudgeReady(ai) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "未启用内嵌 AI 判读模型：请在 AI 巡检配置中启用判读模型（GLM）并填写 API Key"})
			return
		}

		sk := vmlogAnalysisScopeKey(body.Category, body.K8sNamespace, body.Keyword, body.K8sPodName, body.KeywordField, body.StartTime, body.EndTime, body.WindowMinutes)
		root, rerr := loadVmLogAnalysisRoot(app.PlatformKV())
		if rerr != nil {
			RespondAPIError500(c, rerr.Error())
			return
		}
		scope := root.Scopes[sk]
		if scope == nil {
			scope = &vmLogAnalysisScope{Issues: nil}
		}
		knownFP := map[string]VmLogAnalysisIssue{}
		var knownLines strings.Builder
		for _, iss := range scope.Issues {
			fp := normIssueFingerprint(iss.Fingerprint)
			if fp == "" {
				continue
			}
			knownFP[fp] = iss
			fmt.Fprintf(&knownLines, "- %s: %s\n", fp, strings.TrimSpace(iss.Title))
		}

		sample := buildVmLogSampleForAI(matched, body.SampleLimit)
		if strings.TrimSpace(sample) == "" {
			sample = "（本时间窗与筛选条件下无匹配日志行，仅可根据统计说明可能原因。）"
		}

		cat := strings.TrimSpace(body.Category)
		if cat == "" {
			cat = "all"
		}
		userMsg := fmt.Sprintf(`筛选条件：分类=%s，k8s命名空间=%q，主机=%q，级别=%q，关键词=%q，时间窗=%d 分钟（%s ~ %s）。
VictoriaLogs 拉取 %d 条原始行，过滤后匹配 %d 条；truncated=%v scanWarn=%q

【已登记问题 fingerprint（禁止在 new_issues 中重复相同 fingerprint；summary 中不要复述这些问题的细节，最多一句话带过「与已登记问题一致」）】
%s

【去重后的日志样本（同类消息已聚合为一条并标注重复次数）】
%s

请严格按系统说明只输出 JSON。`,
			cat, body.K8sNamespace, body.Host, body.Level, body.Keyword, win,
			startT.Format(time.RFC3339), endT.Format(time.RFC3339),
			totalFetched, len(matched), truncated, scanWarn,
			strings.TrimSpace(knownLines.String()),
			sample,
		)

		sys := `你是资深运维与安全分析助手，分析 VictoriaLogs 日志样本。
要求：
1) 判断现象更像：外部攻击/扫描（attack_suspect）、应用或接口需优化（interface_opt，含超时/499/5xx/慢查询）、可靠性问题（reliability）、或良性噪声（benign_noise）。
2) new_issues 只包含**相对已登记 fingerprint 而言新发现**的问题；已列在「已登记问题」中的根因不要再次展开。
3) 每个新问题给稳定 fingerprint（英文小写+下划线，同一类日志模式应始终相同），title 一行，evidence 简述日志中可见模式，recommendation 可执行处置建议。
4) summary 用中文 Markdown 简报：先写本窗口整体观感，再列出**仅新增**要点；若无新问题，summary 明确写「未发现新增问题类型」，new_issues 为空数组。
5) 回复必须是**单一 JSON 对象**，不要 Markdown 代码围栏以外的文字。结构：
{"summary":"……","new_issues":[{"fingerprint":"snake_case","title":"……","classification":"attack_suspect|interface_opt|reliability|benign_noise","evidence":"……","recommendation":"……"}]}`

		SetAuditDetail(c, fmt.Sprintf(
			"VictoriaLogs AI 分析：category=%s matched=%d sampleLimit=%d，发送前已脱敏",
			cat, len(matched), body.SampleLimit,
		))
		rawLLM, latencyMs, cerr := opsInspectJudgeCall(app.PlatformKV(), cfg, ai, "vmlog_analyze", sys, userMsg, 8192)
		if cerr != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": cerr.Error()})
			return
		}

		var parsed vmlogAILLMOut
		js := extractJSONObjectFromLLM(rawLLM)
		if js == nil || json.Unmarshal(js, &parsed) != nil {
			c.JSON(http.StatusOK, gin.H{
				"ok":              true,
				"parseError":      true,
				"rawModel":        rawLLM,
				"latencyMs":       latencyMs,
				"matchedLines":    len(matched),
				"totalFetched":    totalFetched,
				"knownIssueCount": len(scope.Issues),
				"scopeKey":        sk,
			})
			return
		}

		now := opsNowRFC3339()
		mergedIssues := append([]VmLogAnalysisIssue(nil), scope.Issues...)
		mergedFP := map[string]struct{}{}
		for _, x := range mergedIssues {
			mergedFP[normIssueFingerprint(x.Fingerprint)] = struct{}{}
		}

		var accepted []VmLogAnalysisIssue
		for _, ni := range parsed.NewIssues {
			fp := normIssueFingerprint(ni.Fingerprint)
			if fp == "" || fp == "unnamed" {
				fp = normIssueFingerprint(ni.Title)
			}
			if _, ok := knownFP[fp]; ok {
				continue
			}
			if _, ok := mergedFP[fp]; ok {
				for i := range mergedIssues {
					if normIssueFingerprint(mergedIssues[i].Fingerprint) == fp {
						mergedIssues[i].LastSeen = now
						if strings.TrimSpace(ni.Title) != "" {
							mergedIssues[i].Title = strings.TrimSpace(ni.Title)
						}
						if strings.TrimSpace(ni.Classification) != "" {
							mergedIssues[i].Kind = strings.TrimSpace(ni.Classification)
						}
					}
				}
				continue
			}
			ti := strings.TrimSpace(ni.Title)
			if ti == "" {
				continue
			}
			iss := VmLogAnalysisIssue{
				Fingerprint: fp,
				Title:       ti,
				Kind:        strings.TrimSpace(ni.Classification),
				FirstSeen:   now,
				LastSeen:    now,
			}
			accepted = append(accepted, iss)
			mergedIssues = append(mergedIssues, iss)
			mergedFP[fp] = struct{}{}
		}

		if len(mergedIssues) > vmlogAnalysisMaxIssues {
			sort.Slice(mergedIssues, func(i, j int) bool {
				return mergedIssues[i].LastSeen > mergedIssues[j].LastSeen
			})
			mergedIssues = mergedIssues[:vmlogAnalysisMaxIssues]
		}
		root.Scopes[sk] = &vmLogAnalysisScope{Issues: mergedIssues}
		if len(root.Scopes) > vmlogAnalysisMaxScopes {
			type scEnt struct {
				k  string
				ts string
			}
			var ents []scEnt
			for k, sc := range root.Scopes {
				maxLS := ""
				for _, iss := range sc.Issues {
					if iss.LastSeen > maxLS {
						maxLS = iss.LastSeen
					}
				}
				ents = append(ents, scEnt{k: k, ts: maxLS})
			}
			sort.Slice(ents, func(i, j int) bool { return ents[i].ts < ents[j].ts })
			for len(root.Scopes) > vmlogAnalysisMaxScopes && len(ents) > 0 {
				delete(root.Scopes, ents[0].k)
				ents = ents[1:]
			}
		}
		if err := saveVmLogAnalysisRoot(app.PlatformKV(), root); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}

		details := make([]gin.H, 0, len(accepted))
		for _, a := range accepted {
			var ev, rec, cl string
			for _, ni := range parsed.NewIssues {
				nfp := normIssueFingerprint(ni.Fingerprint)
				if nfp == "" || nfp == "unnamed" {
					nfp = normIssueFingerprint(ni.Title)
				}
				if nfp == a.Fingerprint {
					ev = strings.TrimSpace(ni.Evidence)
					rec = strings.TrimSpace(ni.Recommendation)
					cl = strings.TrimSpace(ni.Classification)
					break
				}
			}
			if cl == "" {
				cl = a.Kind
			}
			details = append(details, gin.H{
				"fingerprint":    a.Fingerprint,
				"title":          a.Title,
				"classification": cl,
				"evidence":       ev,
				"recommendation": rec,
			})
		}

		c.JSON(http.StatusOK, gin.H{
			"ok":              true,
			"summaryMarkdown": strings.TrimSpace(parsed.Summary),
			"newIssues":       accepted,
			"newIssueDetails": details,
			"knownIssueCount": len(mergedIssues),
			"latencyMs":       latencyMs,
			"matchedLines":    len(matched),
			"totalFetched":    totalFetched,
			"scopeKey":        sk,
			"truncated":       truncated,
			"scanWarning":     scanWarn,
		})
	}
}

func handleOpsVmLogAIAnalyzeRow(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsVmLogOpenclawAnalyzeRowBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		if strings.TrimSpace(body.Row.Msg) == "" && len(body.Row.Fields) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少日志内容"})
			return
		}

		cfg := app.Cfg()
		bundle, lerr := loadOpsAIInspectBundle(app.PlatformKV())
		if lerr != nil {
			RespondAPIError500(c, lerr.Error())
			return
		}
		ai := bundle.AI
		if !opsJudgeReady(ai) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "未启用内嵌 AI 判读模型：请在 AI 巡检配置中启用判读模型（GLM）并填写 API Key"})
			return
		}

		var fieldLines []string
		for _, kv := range body.Row.Fields {
			k := strings.TrimSpace(kv.Key)
			v := strings.TrimSpace(kv.Value)
			if k == "" || v == "" {
				continue
			}
			if sensitiveLogFieldName(k) {
				v = "[REDACTED]"
			} else {
				v = redactLogTextForAI(v)
			}
			fieldLines = append(fieldLines, fmt.Sprintf("- %s: %s", k, v))
		}
		if len(fieldLines) == 0 {
			fieldLines = append(fieldLines, "- （无结构化字段）")
		}

		scope := strings.TrimSpace(body.Scope)
		if scope == "" {
			scope = strings.TrimSpace(body.Row.Scope)
		}
		if scope == "" {
			scope = "pod"
		}
		windowMin := body.WindowMinutes
		if windowMin <= 0 {
			windowMin = 60
		}

		userMsg := fmt.Sprintf(`请分析下面这条日志，并用中文 Markdown 简洁回答。

【筛选上下文】
- scope: %s
- k8sNamespace: %s
- k8sPodName: %s
- keyword: %s
- keywordField: %s
- windowMinutes: %d
- startTime: %s
- endTime: %s

【当前日志】
- time: %s
- scope: %s
- namespace: %s
- pod: %s
- source: %s
- status: %s
- hasError: %t
- priority: %s
- priorityReason: %s

【message】
%s

【fields】
%s

请按下面结构输出：
## 初步判断
一句话说明这条日志最像什么问题。

## 问题类型
明确判断更像：应用异常 / 配置问题 / 网络问题 / 权限问题 / 资源问题 / 良性噪声 / 证据不足。

## 排查建议
给 3-5 条可执行建议，优先结合日志中可见证据。

## 还缺什么信息
如果证据不足，明确列出还需要哪些上下文；如果已足够，可写“暂无”。`,
			scope,
			nullDash(body.K8sNamespace),
			nullDash(body.K8sPodName),
			nullDash(body.Keyword),
			nullDash(body.KeywordField),
			windowMin,
			nullDash(body.StartTime),
			nullDash(body.EndTime),
			nullDash(body.Row.Time),
			nullDash(body.Row.Scope),
			nullDash(body.Row.Namespace),
			nullDash(body.Row.Pod),
			nullDash(body.Row.Source),
			nullDash(body.Row.Status),
			body.Row.HasError,
			nullDash(body.Row.Priority),
			nullDash(body.Row.PriorityReason),
			nullDash(redactLogTextForAI(body.Row.Msg)),
			strings.Join(fieldLines, "\n"),
		)

		sys := "你是资深 SRE / 运维排障助手。目标是解释单条日志大概表示什么问题，并给出简短、可执行的排查思路。不要编造不存在的上下文；证据不足时要明确说证据不足。输出使用中文 Markdown，不要加代码围栏。"
		SetAuditDetail(c, "VictoriaLogs 单条 AI 分析：scope="+scope+"，发送前已脱敏")
		rawLLM, latencyMs, cerr := opsInspectJudgeCall(app.PlatformKV(), cfg, ai, "vmlog_analyze_row", sys, userMsg, 2048)
		if cerr != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": cerr.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":              true,
			"summaryMarkdown": strings.TrimSpace(rawLLM),
			"latencyMs":       latencyMs,
		})
	}
}
