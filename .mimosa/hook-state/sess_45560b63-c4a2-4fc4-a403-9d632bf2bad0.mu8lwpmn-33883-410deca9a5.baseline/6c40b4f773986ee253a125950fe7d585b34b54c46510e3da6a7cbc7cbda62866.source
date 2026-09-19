package internal

// 内嵌 AI 判读客户端：巡检/故障识别直连 OpenAI 兼容接口（默认 GLM，
// https://open.bigmodel.cn/api/paas/v4），取代旧链路中经 OpenClaw 网关转发。
// 设计约束：单轮调用、低温、强制 JSON 结构化输出、失败可见并降级为纯规则结论。

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	defaultInspectJudgeBaseURL = "https://open.bigmodel.cn/api/paas/v4"
	defaultInspectJudgeModel   = "glm-5.3"
	inspectJudgeMaxTimeoutSec  = 300
)

// InspectJudgeModelConfig 内嵌判读模型配置（OpenAI 兼容 chat/completions）。
type InspectJudgeModelConfig struct {
	Enabled       bool    `json:"enabled"`
	BaseURL       string  `json:"baseUrl"`
	Model         string  `json:"model"`
	APIKeyEnc     string  `json:"apiKeyEnc,omitempty"`
	TimeoutSec    int     `json:"timeoutSec"`
	Temperature   float64 `json:"temperature"`
	MaxTokens     int     `json:"maxTokens"`
	SkipTLSVerify bool    `json:"skipTlsVerify"`
	// ExtraPrompt 追加判读要求；摘要场景支持 {{report}} 占位符注入报告 JSON。
	ExtraPrompt string `json:"extraPrompt,omitempty"`
	// EnableThinking 思考模式：对支持的模型（如 GLM）显式开启推理思考，回复中的
	// <think> 段落会被剥离后展示结论。
	EnableThinking bool `json:"enableThinking,omitempty"`
}

func normalizeInspectJudgeConfig(j *InspectJudgeModelConfig) {
	if j == nil {
		return
	}
	if strings.TrimSpace(j.BaseURL) == "" {
		j.BaseURL = defaultInspectJudgeBaseURL
	}
	if strings.TrimSpace(j.Model) == "" {
		j.Model = defaultInspectJudgeModel
	}
	if j.TimeoutSec <= 0 {
		j.TimeoutSec = 120
	}
	if j.TimeoutSec > inspectJudgeMaxTimeoutSec {
		j.TimeoutSec = inspectJudgeMaxTimeoutSec
	}
	if j.Temperature <= 0 {
		j.Temperature = 0.1
	}
	if j.MaxTokens <= 0 {
		j.MaxTokens = 8192
	}
}

var errInspectJudgeNotConfigured = errors.New("未启用内嵌判读模型或未配置 API Key")

// maskOpsAIJudgeSecret GET 响应脱敏：不回传判读模型密钥密文。
func maskOpsAIJudgeSecret(ai OpsAIInspectConfig) OpsAIInspectConfig {
	ai.JudgeModel.APIKeyEnc = ""
	return ai
}

func opsJudgeReady(ai OpsAIInspectConfig) bool {
	if !ai.JudgeModel.Enabled {
		return false
	}
	j := ai.JudgeModel
	normalizeInspectJudgeConfig(&j)
	return strings.TrimSpace(j.BaseURL) != ""
}

func resolveInspectJudgeAPIKey(cfg Config, ai OpsAIInspectConfig) (string, error) {
	key, err := opsEncryptionKey(cfg)
	if err != nil {
		return "", err
	}
	apiKey, _ := decryptSecret(key, ai.JudgeModel.APIKeyEnc)
	return strings.TrimSpace(apiKey), nil
}

// validateInspectJudgeBaseURL 仅允许 http/https 且 host 非空，避免 SSRF 类误配。
func validateInspectJudgeBaseURL(raw string) error {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" {
		return fmt.Errorf("判读模型 Base URL 无效：%q", raw)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("判读模型 Base URL 仅支持 http/https")
	}
	return nil
}

type judgeChatMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type judgeLLMUsage struct {
	PromptTokens     int64
	CompletionTokens int64
	TotalTokens      int64
}

// parseJudgeUsage 从 chat/completions 响应体解析 usage 字段。
func parseJudgeUsage(raw []byte) judgeLLMUsage {
	var w struct {
		Usage struct {
			PromptTokens     int64 `json:"prompt_tokens"`
			CompletionTokens int64 `json:"completion_tokens"`
			TotalTokens      int64 `json:"total_tokens"`
		} `json:"usage"`
	}
	if json.Unmarshal(raw, &w) != nil {
		return judgeLLMUsage{}
	}
	return judgeLLMUsage{PromptTokens: w.Usage.PromptTokens, CompletionTokens: w.Usage.CompletionTokens, TotalTokens: w.Usage.TotalTokens}
}

// inspectJudgeChat 单轮调用判读模型；withJSONMode=false 用于不支持
// response_format 字段的上游降级重试。
func inspectJudgeChat(ctx context.Context, ai OpsAIInspectConfig, apiKey, systemPrompt, userMsg string, maxTokensOverride int, withJSONMode bool) (content string, latencyMs int64, usage judgeLLMUsage, err error) {
	j := ai.JudgeModel
	normalizeInspectJudgeConfig(&j)
	if err := validateInspectJudgeBaseURL(j.BaseURL); err != nil {
		return "", 0, usage, err
	}
	if strings.TrimSpace(apiKey) == "" {
		return "", 0, usage, fmt.Errorf("未配置判读模型 API Key")
	}
	mt := j.MaxTokens
	if maxTokensOverride > 0 {
		mt = maxTokensOverride
	}
	payload := map[string]interface{}{
		"model":       j.Model,
		"messages":    []judgeChatMsg{{Role: "system", Content: systemPrompt}, {Role: "user", Content: userMsg}},
		"temperature": j.Temperature,
		"max_tokens":  mt,
	}
	if withJSONMode {
		payload["response_format"] = map[string]string{"type": "json_object"}
	}
	// 思考模式：GLM 系列通过 thinking 参数显式控制推理开关
	if strings.Contains(j.BaseURL, "bigmodel.cn") {
		thinkType := "disabled"
		if j.EnableThinking {
			thinkType = "enabled"
		}
		payload["thinking"] = map[string]string{"type": thinkType}
	}
	b, _ := json.Marshal(payload)
	u := strings.TrimRight(strings.TrimSpace(j.BaseURL), "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(b))
	if err != nil {
		return "", 0, usage, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	tr := &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: j.SkipTLSVerify, MinVersion: tls.VersionTLS12}}
	cli := &http.Client{Timeout: time.Duration(j.TimeoutSec) * time.Second, Transport: tr}
	t0 := time.Now()
	resp, err := cli.Do(req)
	latencyMs = time.Since(t0).Milliseconds()
	if err != nil {
		return "", latencyMs, usage, fmt.Errorf("[判读模型] 请求失败（网络/DNS/TLS/超时）: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", latencyMs, usage, fmt.Errorf("[判读模型] 读取响应体失败: %w", err)
	}
	usage = parseJudgeUsage(raw)
	if resp.StatusCode >= 400 {
		return "", latencyMs, usage, fmt.Errorf("[判读模型] HTTP %d: %s", resp.StatusCode, opsTruncateStr(string(raw), 600))
	}
	var wrap struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &wrap); err != nil {
		return "", latencyMs, usage, fmt.Errorf("[判读模型] 解析 chat/completions JSON 失败: %w", err)
	}
	if len(wrap.Choices) == 0 {
		return "", latencyMs, usage, fmt.Errorf("[判读模型] 响应中无 choices")
	}
	return strings.TrimSpace(stripThinkBlock(wrap.Choices[0].Message.Content)), latencyMs, usage, nil
}

// opsInspectJudgeCall 判读统一入口：先带 JSON mode 调用；HTTP 400 时按上游可能
// 不支持 response_format 降级重试一次（内容仍从文本中提取 JSON）。每次调用记入用量统计。
func opsInspectJudgeCall(kv PlatformKV, cfg Config, ai OpsAIInspectConfig, feature, systemPrompt, userMsg string, maxTokensOverride int) (content string, latencyMs int64, err error) {
	if !opsJudgeReady(ai) {
		return "", 0, errInspectJudgeNotConfigured
	}
	apiKey, err := resolveInspectJudgeAPIKey(cfg, ai)
	if err != nil {
		return "", 0, err
	}
	if apiKey == "" {
		return "", 0, errInspectJudgeNotConfigured
	}
	j := ai.JudgeModel
	normalizeInspectJudgeConfig(&j)
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(j.TimeoutSec)*time.Second)
	defer cancel()
	content, latencyMs, usage, err := inspectJudgeChat(ctx, ai, apiKey, systemPrompt, userMsg, maxTokensOverride, true)
	if err != nil && strings.Contains(err.Error(), "HTTP 400") {
		content, latencyMs, usage, err = inspectJudgeChat(ctx, ai, apiKey, systemPrompt, userMsg, maxTokensOverride, false)
	}
	feature = strings.TrimSpace(feature)
	if feature == "" {
		feature = "other"
	}
	aiUsageRecordCall(kv, feature, j.Model, usage.PromptTokens, usage.CompletionTokens, latencyMs, err == nil)
	return content, latencyMs, err
}

// InspectJudgeAssessment 单个 finding 的判读结论。
type InspectJudgeAssessment struct {
	Step       string `json:"step"`
	Object     string `json:"object"`
	FaultLevel string `json:"fault_level"` // critical | warning | info | ok
	RootCause  string `json:"root_cause"`
	Suggestion string `json:"suggestion"`
}

// InspectJudgeVerdict 判读模型结构化输出（JSON Schema 契约）。
type InspectJudgeVerdict struct {
	FaultLevel         string                   `json:"fault_level"` // critical | warning | info | ok
	Component          string                   `json:"component"`
	RootCause          string                   `json:"root_cause"`
	Evidence           []string                 `json:"evidence,omitempty"`
	Confidence         float64                  `json:"confidence"`
	Suggestion         string                   `json:"suggestion"`
	NeedsHumanApproval bool                     `json:"needs_human_approval"`
	Assessments        []InspectJudgeAssessment `json:"assessments,omitempty"`
	SummaryMarkdown    string                   `json:"summary_markdown,omitempty"`
}

func judgeNormalizeFaultLevel(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "critical":
		return "critical"
	case "warning":
		return "warning"
	case "info":
		return "info"
	case "ok":
		return "ok"
	default:
		return "info"
	}
}

func judgeParseVerdict(raw string) (*InspectJudgeVerdict, error) {
	js := extractJSONObjectFromLLM(raw)
	if js == nil {
		return nil, fmt.Errorf("响应中未找到 JSON 对象")
	}
	var v InspectJudgeVerdict
	if err := json.Unmarshal(js, &v); err != nil {
		return nil, fmt.Errorf("判读 JSON 解析失败: %w", err)
	}
	v.FaultLevel = judgeNormalizeFaultLevel(v.FaultLevel)
	for i := range v.Assessments {
		v.Assessments[i].FaultLevel = judgeNormalizeFaultLevel(v.Assessments[i].FaultLevel)
	}
	return &v, nil
}

const inspectJudgeProbeSystemPrompt = "你是 API 连通性测试，只输出所需单词。"

// opsInspectJudgeProbe 巡检内判读模型连通性探针（pong）。
func opsInspectJudgeProbe(cfg Config, kv PlatformKV, ai OpsAIInspectConfig) *InspectionLLMProbe {
	if !opsJudgeReady(ai) {
		return &InspectionLLMProbe{OK: false, Message: "未启用内嵌判读模型，已跳过探针", Detail: "请在 AI 巡检配置中启用判读模型并填写 API Key（默认 GLM）。"}
	}
	j := ai.JudgeModel
	normalizeInspectJudgeConfig(&j)
	content, ms, err := opsInspectJudgeCall(kv, cfg, ai, "probe", inspectJudgeProbeSystemPrompt, "请只回复一小行：单词 pong（小写），不要其它内容。", 32)
	probe := &InspectionLLMProbe{Model: j.Model, LatencyMs: ms, ResponsePreview: opsTruncateStr(content, 800)}
	if err != nil {
		probe.Message = opsTruncateStr(err.Error(), 300)
		probe.Detail = opsTruncateStr(err.Error(), 900)
		return probe
	}
	if !strings.Contains(strings.ToLower(strings.TrimSpace(content)), "pong") {
		probe.Message = "HTTP 成功但模型回复中未包含 pong，请检查模型是否按指令输出或是否命中内容安全策略"
		return probe
	}
	probe.OK = true
	probe.Message = fmt.Sprintf("Chat Completions 正常，延迟约 %d ms", ms)
	return probe
}

const inspectJudgeSummarySystemPrompt = `你是资深 SRE，负责对运维巡检报告做最终结论。要求：
1) 先给总评（fault_level：critical|warning|info|ok），点名最需要人工处理的对象；root_cause 只写有证据支撑的判断，证据不足要写明。
2) evidence 引用报告中具体指标/状态，不得编造。
3) suggestion 给可执行处置建议，按优先级排序；可能影响业务的操作必须 needs_human_approval=true。
4) summary_markdown 用中文输出完整结论（Markdown）：先总评，再按模块列要点与建议，控制在 600 字以内。
5) 回复必须是单一 JSON 对象，结构：
{"fault_level":"critical|warning|info|ok","component":"…","root_cause":"…","evidence":["…"],"confidence":0.0,"suggestion":"…","needs_human_approval":true|false,"summary_markdown":"…"}`

// opsInspectJudgeSummary 生成整份巡检报告的 AI 摘要与结构化结论。
func opsInspectJudgeSummary(kv PlatformKV, cfg Config, ai OpsAIInspectConfig, rep InspectionReport) (string, *InspectJudgeVerdict, error) {
	slim := opsInspectReportForAI(rep)
	reportJSON, _ := json.Marshal(slim)
	userMsg := "请根据以下巡检 JSON 输出结构化结论与中文 Markdown 摘要。\n{{report}}"
	if extra := strings.TrimSpace(ai.JudgeModel.ExtraPrompt); extra != "" {
		if strings.Contains(extra, "{{report}}") {
			userMsg = extra
		} else {
			userMsg = extra + "\n\n" + userMsg
		}
	}
	userMsg = strings.ReplaceAll(userMsg, "{{report}}", string(reportJSON))
	raw, _, err := opsInspectJudgeCall(kv, cfg, ai, "inspect_summary", inspectJudgeSummarySystemPrompt, userMsg, 0)
	if err != nil {
		return "", nil, err
	}
	verdict, perr := judgeParseVerdict(raw)
	if perr != nil {
		// 结构化解析失败时保留原始输出为摘要文本，保证信息不丢。
		return strings.TrimSpace(raw), nil, fmt.Errorf("%w（原始输出已作为摘要文本保留）", perr)
	}
	md := strings.TrimSpace(verdict.SummaryMarkdown)
	if md == "" {
		md = renderInspectJudgeVerdictMarkdown(verdict)
	}
	return md, verdict, nil
}

// renderInspectJudgeVerdictMarkdown 无 summary_markdown 时从结构化字段兜底渲染。
func renderInspectJudgeVerdictMarkdown(v *InspectJudgeVerdict) string {
	if v == nil {
		return ""
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("- **总体级别**：%s\n", judgeFaultLevelCN(v.FaultLevel)))
	if comp := strings.TrimSpace(v.Component); comp != "" {
		b.WriteString(fmt.Sprintf("- **重点关注**：%s\n", comp))
	}
	if rc := strings.TrimSpace(v.RootCause); rc != "" {
		b.WriteString(fmt.Sprintf("- **根因判断**：%s\n", rc))
	}
	for _, ev := range v.Evidence {
		if strings.TrimSpace(ev) == "" {
			continue
		}
		b.WriteString(fmt.Sprintf("  - 证据：%s\n", ev))
	}
	if sg := strings.TrimSpace(v.Suggestion); sg != "" {
		b.WriteString(fmt.Sprintf("- **处置建议**：%s（人工审批：%s）\n", sg, judgeBoolCN(v.NeedsHumanApproval)))
	}
	return b.String()
}

func judgeFaultLevelCN(s string) string {
	switch s {
	case "critical":
		return "严重（critical）"
	case "warning":
		return "警告（warning）"
	case "info":
		return "提示（info）"
	case "ok":
		return "正常（ok）"
	default:
		return s
	}
}

func judgeBoolCN(b bool) string {
	if b {
		return "需要"
	}
	return "不需要"
}
