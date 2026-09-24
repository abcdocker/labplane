package internal

// AI 运维助手：本地内置引擎 + 判读模型(GLM) function calling。
// 只读模式(默认)可查询集群状态/指标/日志；运维模式额外开放受控处置动作
// (重启 Deployment / 删除 Pod / 扩缩容)，每次写操作均写入审计。

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	autoscalingv1 "k8s.io/api/autoscaling/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	"github.com/gin-gonic/gin"
)

const (
	aiAssistantMaxRounds      = 8
	aiAssistantToolResultMax  = 6000
	aiAssistantPodLogMaxBytes = 8000
)

type aiAssistantChatRequest struct {
	Question string `json:"question"`
	// History 多轮上下文（仅 role/content）。
	History []struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	} `json:"history"`
	// Mode readonly=只读诊断(默认)；operate=允许受控写操作。
	Mode string `json:"mode"`
	// Confirm 运维模式下写操作需二次确认：false 时写工具返回"待确认"而不执行，
	// 前端展示确认弹窗后携带 confirm=true 重发同一问题。
	Stream  *bool `json:"stream"`
	Confirm bool  `json:"confirm"`
}

type aiAssistantToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type aiAssistantMessage struct {
	Role       string                `json:"role"`
	Content    *string               `json:"content,omitempty"`
	ToolCalls  []aiAssistantToolCall `json:"tool_calls,omitempty"`
	ToolCallID string                `json:"tool_call_id,omitempty"`
}

type aiAssistantToolSpec struct {
	Type     string `json:"type"`
	Function struct {
		Name        string         `json:"name"`
		Description string         `json:"description"`
		Parameters  map[string]any `json:"parameters"`
	} `json:"function"`
}

type aiAssistantTool struct {
	Name        string
	Description string
	Parameters  map[string]any
	Write       bool
	Exec        func(app *ServerApp, args map[string]any) (string, error)
}

type aiAssistantToolTrace struct {
	Name       string `json:"name"`
	Arguments  string `json:"arguments"`
	Result     string `json:"result"`
	DurationMs int64  `json:"durationMs"`
	Write      bool   `json:"write"`
}

func obj(props map[string]any, required ...string) map[string]any {
	out := map[string]any{"type": "object", "properties": props}
	if len(required) > 0 {
		out["required"] = required
	}
	return out
}

func strProp(desc string) map[string]any {
	return map[string]any{"type": "string", "description": desc}
}
func intProp(desc string) map[string]any {
	return map[string]any{"type": "integer", "description": desc}
}

// aiAssistantToolRegistry 组装工具集；operate=true 时附加写操作工具。
func aiAssistantToolRegistry(operate bool) []aiAssistantTool {
	tools := []aiAssistantTool{
		{
			Name: "k8s_list_pods", Description: "列出 Pod：命名空间/名称/状态/重启次数。namespace 留空查全部（上限 50 条）",
			Parameters: obj(map[string]any{
				"namespace":     strProp("命名空间，留空=全部"),
				"labelSelector": strProp("label 选择器，如 app=nginx"),
			}),
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				if app.K8s() == nil {
					return "", fmt.Errorf("K8s 未连接")
				}
				ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
				defer cancel()
				ns := strings.TrimSpace(strArg(a, "namespace"))
				opts := metav1.ListOptions{Limit: 50}
				if sel := strings.TrimSpace(strArg(a, "labelSelector")); sel != "" {
					opts.LabelSelector = sel
				}
				list, err := app.K8s().CoreV1().Pods(ns).List(ctx, opts)
				if err != nil {
					return "", err
				}
				var b strings.Builder
				b.WriteString("namespace\tname\tphase\trestarts\n")
				for _, p := range list.Items {
					r := int32(0)
					for _, cs := range p.Status.ContainerStatuses {
						r += cs.RestartCount
					}
					b.WriteString(fmt.Sprintf("%s\t%s\t%s\t%d\n", p.Namespace, p.Name, p.Status.Phase, r))
				}
				return b.String(), nil
			},
		},
		{
			Name: "k8s_get_pod_logs", Description: "读取 Pod 最近日志（用于故障判断）",
			Parameters: obj(map[string]any{
				"namespace": strProp("命名空间"),
				"pod":       strProp("Pod 名称"),
				"tailLines": intProp("尾部行数，默认 100"),
			}, "namespace", "pod"),
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				if app.K8s() == nil {
					return "", fmt.Errorf("K8s 未连接")
				}
				ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
				defer cancel()
				tail := int64(intArg(a, "tailLines", 100))
				stream, err := app.K8s().CoreV1().Pods(strings.TrimSpace(strArg(a, "namespace"))).
					GetLogs(strings.TrimSpace(strArg(a, "pod")), &corev1.PodLogOptions{TailLines: &tail}).Stream(ctx)
				if err != nil {
					return "", err
				}
				defer stream.Close()
				data, err := io.ReadAll(io.LimitReader(stream, aiAssistantPodLogMaxBytes))
				if err != nil {
					return "", err
				}
				return string(data), nil
			},
		},
		{
			Name: "k8s_list_deployments", Description: "列出 Deployment：命名空间/名称/期望与就绪副本/镜像",
			Parameters: obj(map[string]any{"namespace": strProp("命名空间，留空=全部")}),
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				if app.K8s() == nil {
					return "", fmt.Errorf("K8s 未连接")
				}
				ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
				defer cancel()
				list, err := app.K8s().AppsV1().Deployments(strings.TrimSpace(strArg(a, "namespace"))).List(ctx, metav1.ListOptions{Limit: 50})
				if err != nil {
					return "", err
				}
				var b strings.Builder
				b.WriteString("namespace\tname\tdesired\tready\timages\n")
				for _, d := range list.Items {
					imgs := make([]string, 0, len(d.Spec.Template.Spec.Containers))
					for _, c := range d.Spec.Template.Spec.Containers {
						imgs = append(imgs, c.Image)
					}
					b.WriteString(fmt.Sprintf("%s\t%s\t%d\t%d\t%s\n", d.Namespace, d.Name, *d.Spec.Replicas, d.Status.ReadyReplicas, strings.Join(imgs, ",")))
				}
				return b.String(), nil
			},
		},
		{
			Name: "k8s_list_nodes", Description: "列出节点：名称/Ready/版本/CPU与内存可分配",
			Parameters: obj(map[string]any{}),
			Exec: func(app *ServerApp, _ map[string]any) (string, error) {
				if app.K8s() == nil {
					return "", fmt.Errorf("K8s 未连接")
				}
				ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
				defer cancel()
				list, err := app.K8s().CoreV1().Nodes().List(ctx, metav1.ListOptions{})
				if err != nil {
					return "", err
				}
				var b strings.Builder
				b.WriteString("name\tready\tversion\tcpu(alloc)\tmemGi(alloc)\n")
				for _, n := range list.Items {
					ready := "Unknown"
					for _, c := range n.Status.Conditions {
						if c.Type == corev1.NodeReady {
							ready = string(c.Status)
						}
					}
					memGi := float64(n.Status.Allocatable.Memory().Value()) / (1 << 30)
					b.WriteString(fmt.Sprintf("%s\t%s\t%s\t%s\t%.1f\n", n.Name, ready, n.Status.NodeInfo.KubeletVersion, n.Status.Allocatable.Cpu().String(), memGi))
				}
				return b.String(), nil
			},
		},
		{
			Name: "k8s_list_events", Description: "列出最近的 Warning 事件（按时间倒序，上限 30 条）",
			Parameters: obj(map[string]any{"namespace": strProp("命名空间，留空=全部")}),
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				if app.K8s() == nil {
					return "", fmt.Errorf("K8s 未连接")
				}
				ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
				defer cancel()
				list, err := app.K8s().CoreV1().Events(strings.TrimSpace(strArg(a, "namespace"))).List(ctx, metav1.ListOptions{Limit: 200})
				if err != nil {
					return "", err
				}
				evs := list.Items
				sort.Slice(evs, func(i, j int) bool {
					return evs[i].LastTimestamp.Time.After(evs[j].LastTimestamp.Time)
				})
				var b strings.Builder
				n := 0
				for _, e := range evs {
					if e.Type != corev1.EventTypeWarning {
						continue
					}
					b.WriteString(fmt.Sprintf("%s\t%s\t%s\t%s\t%s\n", e.LastTimestamp.Format(time.RFC3339), e.Namespace, e.Reason, e.InvolvedObject.Name, truncateErrMessage(e.Message, 120)))
					n++
					if n >= 30 {
						break
					}
				}
				if n == 0 {
					return "（无 Warning 事件）", nil
				}
				return b.String(), nil
			},
		},
		{
			Name: "prom_instant_query", Description: "执行 Prometheus PromQL 即时查询（返回各序列当前值）",
			Parameters: obj(map[string]any{"expr": strProp("PromQL 表达式")}, "expr"),
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				series, err := inspectPromInstantVector(app.Cfg(), "k8s", strings.TrimSpace(strArg(a, "expr")))
				if err != nil {
					return "", err
				}
				if len(series) == 0 {
					return "（无数据）", nil
				}
				var b strings.Builder
				for _, s := range series {
					b.WriteString(fmt.Sprintf("%s = %s\n", inspectSeriesObjectLabel(s.Labels), strconvFormatFloat(s.Value)))
				}
				return b.String(), nil
			},
		},
		{
			Name: "vmlog_query", Description: "查询 VictoriaLogs 日志（LogsQL 过滤，不含时间范围）",
			Parameters: obj(map[string]any{
				"query":         strProp("LogsQL 查询，如 error 或 app:redis AND error"),
				"windowMinutes": intProp("回看分钟数，默认 60"),
				"limit":         intProp("返回行数上限，默认 30"),
			}, "query"),
			Exec: func(app *ServerApp, a map[string]any) (string, error) {
				base := normalizeVictoriaLogsBase(effectiveVictoriaLogsURL(app.Runtime(), app.Cfg()))
				if base == "" {
					return "", fmt.Errorf("未配置 VictoriaLogs 地址")
				}
				win := intArg(a, "windowMinutes", 60)
				limit := intArg(a, "limit", 30)
				end := time.Now().UTC()
				rows, _, _, _, err := fetchVictoriaLogsNDJSON(context.Background(), app.Cfg(), base, strings.TrimSpace(strArg(a, "query")), limit,
					end.Add(-time.Duration(win)*time.Minute).Format(time.RFC3339Nano), end.Format(time.RFC3339Nano))
				if err != nil {
					return "", err
				}
				var b strings.Builder
				for _, row := range rows {
					ts := ""
					if tm, ok := parseRowTime(row); ok {
						ts = tm.Format(time.RFC3339)
					}
					msg := redactLogTextForAI(vmlogRowMsg(row))
					if rs := []rune(msg); len(rs) > 200 {
						msg = string(rs[:200]) + "…"
					}
					b.WriteString(fmt.Sprintf("[%s] %s %s\n", ts, vmlogRowHost(row), msg))
				}
				if b.Len() == 0 {
					return "（无匹配日志）", nil
				}
				return b.String(), nil
			},
		},
		{
			Name: "inspection_latest_report", Description: "读取最近一次巡检报告的摘要与分项状态",
			Parameters: obj(map[string]any{}),
			Exec: func(app *ServerApp, _ map[string]any) (string, error) {
				list, err := loadInspectReports(app.PlatformKV())
				if err != nil || len(list) == 0 {
					return "（暂无巡检报告）", nil
				}
				r := list[0]
				var b strings.Builder
				b.WriteString("时间: " + r.CreatedAt + "\n摘要: " + r.Summary + "\n")
				for _, it := range r.Items {
					b.WriteString(fmt.Sprintf("- [%s] %s: %s\n", it.Status, it.Target, truncateErrMessage(it.Detail, 100)))
				}
				return b.String(), nil
			},
		},
	}
	tools = append(tools, aiAssistantPlatformTools()...)
	tools = append(tools, aiAssistantUserIdentityTools()...)
	if operate {
		tools = append(tools, aiAssistantUserWriteTools()...)
		tools = append(tools,
			aiAssistantTool{
				Name: "k8s_restart_deployment", Write: true,
				Description: "重启 Deployment（滚动重启，触发 Pod 重建）",
				Parameters: obj(map[string]any{
					"namespace": strProp("命名空间"), "name": strProp("Deployment 名称"),
				}, "namespace", "name"),
				Exec: func(app *ServerApp, a map[string]any) (string, error) {
					if app.K8s() == nil {
						return "", fmt.Errorf("K8s 未连接")
					}
					ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
					defer cancel()
					ns, name := strings.TrimSpace(strArg(a, "namespace")), strings.TrimSpace(strArg(a, "name"))
					patch := fmt.Sprintf(`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`, time.Now().UTC().Format(time.RFC3339))
					_, err := app.K8s().AppsV1().Deployments(ns).Patch(ctx, name, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
					if err != nil {
						return "", err
					}
					return fmt.Sprintf("已触发滚动重启: %s/%s", ns, name), nil
				},
			},
			aiAssistantTool{
				Name: "k8s_scale_deployment", Write: true,
				Description: "调整 Deployment 副本数",
				Parameters: obj(map[string]any{
					"namespace": strProp("命名空间"), "name": strProp("Deployment 名称"), "replicas": intProp("目标副本数"),
				}, "namespace", "name", "replicas"),
				Exec: func(app *ServerApp, a map[string]any) (string, error) {
					if app.K8s() == nil {
						return "", fmt.Errorf("K8s 未连接")
					}
					ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
					defer cancel()
					ns, name := strings.TrimSpace(strArg(a, "namespace")), strings.TrimSpace(strArg(a, "name"))
					replicas := int32(intArg(a, "replicas", -1))
					if replicas < 0 {
						return "", fmt.Errorf("replicas 无效")
					}
					scale := &autoscalingv1.Scale{
						ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns},
						Spec:       autoscalingv1.ScaleSpec{Replicas: replicas},
					}
					_, err := app.K8s().AppsV1().Deployments(ns).UpdateScale(ctx, name, scale, metav1.UpdateOptions{})
					if err != nil {
						return "", err
					}
					return fmt.Sprintf("已调整副本数: %s/%s -> %d", ns, name, replicas), nil
				},
			},
			aiAssistantTool{
				Name: "k8s_delete_pod", Write: true,
				Description: "删除 Pod（控制器会自动重建；用于让异常 Pod 重建恢复）",
				Parameters: obj(map[string]any{
					"namespace": strProp("命名空间"), "name": strProp("Pod 名称"),
				}, "namespace", "name"),
				Exec: func(app *ServerApp, a map[string]any) (string, error) {
					if app.K8s() == nil {
						return "", fmt.Errorf("K8s 未连接")
					}
					ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
					defer cancel()
					ns, name := strings.TrimSpace(strArg(a, "namespace")), strings.TrimSpace(strArg(a, "name"))
					err := app.K8s().CoreV1().Pods(ns).Delete(ctx, name, metav1.DeleteOptions{})
					if err != nil {
						return "", err
					}
					return fmt.Sprintf("已删除 Pod: %s/%s（控制器将重建）", ns, name), nil
				},
			},
		)
	}
	return tools
}

func strArg(a map[string]any, key string) string {
	if v, ok := a[key].(string); ok {
		return v
	}
	return ""
}

func intArg(a map[string]any, key string, def int) int {
	switch v := a[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	}
	return def
}

func strconvFormatFloat(v float64) string {
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.4f", v), "0"), ".")
}

const aiAssistantSystemPrompt = `你是平台的内置全功能 AI 运维助手，可管理：
- K8s 全资源：Pod/Deployment/Service/ConfigMap/StatefulSet/DaemonSet 的增删改查、YAML 应用、滚动重启、扩缩容
- 虚拟机：CVM/轻量云（开机/关机/重启）、vCenter 虚拟机（电源 on/off/suspend/reset/重启/磁盘查看）
- 应用中心：Redis/OpenSearch/云主机实例概览
- 监控：Prometheus 即时与区间查询；日志：VictoriaLogs 查询` + aiUserToolsSystemPromptSection + `
要求：
1) 分析问题前必须先用工具查实际数据：查 Pod 日志（k8s_get_pod_logs）、查最近事件（k8s_list_events）、查资源用量（prom_instant_query）。至少调用 2 个不同工具交叉验证后才能下结论。
2) 禁止猜测原因。每个结论必须引用具体工具返回的证据（如"日志显示 OOMKilled"或"事件显示 BackOff"）。如果数据不足以确定原因，明确说"根据当前数据无法确定，建议检查 XXX"，不要列举"可能原因"。
3) 确定需要执行写操作时，必须调用对应的写工具。工具返回 [操作已暂缓] 表示等待用户确认，此时告知用户操作已准备就绪。
4) 创建用户前必须先用对应的 list 工具查重（headscale_list_users / authentik_list_users）；用户缺少用户名等必填信息时先追问，不要编造。工具返回的初始密码/预授权密钥必须原样完整告知用户，并提醒妥善保管。
5) 回复使用中文 Markdown，简洁、可执行；涉及风险的变更必须提示影响面。
6) 只处理与本平台运维相关的请求；无关问题礼貌拒绝，说明你是平台运维助手，不调用工具。
7) 如果工具结果以 [操作已暂缓] 开头，如实告知用户操作已准备好但等待确认，不要声称操作已成功。`

func aiAssistantStrPtr(s string) *string { return &s }

// aiAssistantChatOnce 单轮对话请求；返回模型文本、待执行的工具调用与 token 用量。
func aiAssistantChatOnce(kv PlatformKV, cfg Config, ai OpsAIInspectConfig, feature, apiKey string, msgs []aiAssistantMessage, tools []aiAssistantTool) (string, []aiAssistantToolCall, judgeLLMUsage, error) {
	j := ai.JudgeModel
	normalizeInspectJudgeConfig(&j)
	if err := validateInspectJudgeBaseURL(j.BaseURL); err != nil {
		return "", nil, judgeLLMUsage{}, err
	}
	specs := make([]aiAssistantToolSpec, 0, len(tools))
	for _, t := range tools {
		var spec aiAssistantToolSpec
		spec.Type = "function"
		spec.Function.Name = t.Name
		spec.Function.Description = t.Description
		spec.Function.Parameters = t.Parameters
		specs = append(specs, spec)
	}
	payload := map[string]any{
		"model":       j.Model,
		"messages":    msgs,
		"temperature": j.Temperature,
		"max_tokens":  j.MaxTokens,
		"tools":       specs,
		"tool_choice": "auto",
	}
	if strings.Contains(j.BaseURL, "bigmodel.cn") {
		thinkType := "disabled"
		if j.EnableThinking {
			thinkType = "enabled"
		}
		payload["thinking"] = map[string]string{"type": thinkType}
	}
	var usage judgeLLMUsage
	b, _ := json.Marshal(payload)
	u := strings.TrimRight(strings.TrimSpace(j.BaseURL), "/") + "/chat/completions"
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(j.TimeoutSec)*time.Second)
	defer cancel()
	t0 := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, strings.NewReader(string(b)))
	if err != nil {
		return "", nil, usage, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	client := &http.Client{Timeout: time.Duration(j.TimeoutSec) * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", nil, usage, fmt.Errorf("[AI助手] 请求失败: %w", err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, usage, err
	}
	usage = parseJudgeUsage(raw)
	if resp.StatusCode >= 400 {
		return "", nil, usage, fmt.Errorf("[AI助手] HTTP %d: %s", resp.StatusCode, truncateErrMessage(string(raw), 500))
	}
	var wrap struct {
		Choices []struct {
			Message struct {
				Content   *string               `json:"content"`
				ToolCalls []aiAssistantToolCall `json:"tool_calls"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &wrap); err != nil {
		return "", nil, usage, fmt.Errorf("[AI助手] 解析响应失败: %w", err)
	}
	if len(wrap.Choices) == 0 {
		return "", nil, usage, fmt.Errorf("[AI助手] 响应中无 choices")
	}
	msg := wrap.Choices[0].Message
	content := ""
	if msg.Content != nil {
		content = stripThinkBlock(*msg.Content)
	}
	feat := strings.TrimSpace(feature)
	if feat == "" {
		feat = "assistant"
	}
	aiUsageRecordCall(kv, feat, j.Model, usage.PromptTokens, usage.CompletionTokens, time.Since(t0).Milliseconds(), true)
	return content, msg.ToolCalls, usage, nil
}

// stripThinkBlock 剥离推理模型混在正文里的 <think>…</think> 段。
func stripThinkBlock(s string) string {
	i := strings.Index(s, "<think>")
	if i < 0 {
		return strings.TrimSpace(s)
	}
	j := strings.Index(s, "</think>")
	if j < i {
		return ""
	}
	return strings.TrimSpace(s[:i] + s[j+len("</think>"):])
}

type aiAssistantToolResult struct {
	Trace  aiAssistantToolTrace
	Result string
}

func aiAssistantExecuteTool(app *ServerApp, c *gin.Context, tools []aiAssistantTool, operate bool, confirm bool, tc aiAssistantToolCall, actions *[]gin.H) (out aiAssistantToolResult) {
	out.Trace = aiAssistantToolTrace{Name: tc.Function.Name, Arguments: tc.Function.Arguments}
	var tool *aiAssistantTool
	for i := range tools {
		if tools[i].Name == tc.Function.Name {
			tool = &tools[i]
			break
		}
	}
	t0 := time.Now()
	defer func() {
		out.Trace.DurationMs = time.Since(t0).Milliseconds()
		out.Trace.Result = out.Result
	}()
	if tool == nil {
		out.Result = "未知工具: " + tc.Function.Name
		return out
	}
	out.Trace.Write = tool.Write
	if tool.Write && !operate {
		out.Result = "当前为只读模式，写操作已拒绝；如需执行请在助手界面切换为「运维模式」。"
		return out
	}
	if tool.Write && !confirm {
		out.Result = "[操作已暂缓] 该写操作尚未执行，需要用户在确认弹窗中点击确认后才会发生。绝对不要声称操作已成功。"
		return out
	}
	var args map[string]any
	_ = json.Unmarshal([]byte(tc.Function.Arguments), &args)
	res, err := tool.Exec(app, args)
	if err != nil {
		out.Result = "执行失败: " + truncateErrMessage(err.Error(), 300)
		return out
	}
	if len(res) > aiAssistantToolResultMax {
		res = res[:aiAssistantToolResultMax] + "\n…（结果过长已截断）"
	}
	out.Result = res
	if tool.Write {
		*actions = append(*actions, gin.H{"tool": tool.Name, "arguments": tc.Function.Arguments, "result": res})
		AppendAuditRecord(app, AuditRecord{
			Action: "ai_assistant_mutation",
			IP:     AuditClientIP(c, app.Cfg()),
			Method: "POST",
			Path:   "/api/ops/ai-assistant/chat",
			Status: http.StatusOK,
			Detail: aiAssistantMaskAuditSecrets(fmt.Sprintf("AI助手执行 %s %s → %s", tool.Name, tc.Function.Arguments, res)),
		})
	}
	return out
}

// handleOpsAIAssistantChat AI 助手对话端点：多轮工具调用循环，以 NDJSON 流式返回每一步
// （status/tool_start/tool_result/final/error），前端实时展示"正在检查什么"。写操作受模式控制并写审计。
func handleOpsAIAssistantChat(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body aiAssistantChatRequest
		if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Question) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效：需要 question"})
			return
		}
		mode := strings.ToLower(strings.TrimSpace(body.Mode))
		if mode != "operate" {
			mode = "readonly"
		}
		bundle, err := loadOpsAIInspectBundle(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		ai := bundle.AI
		if !opsJudgeReady(ai) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "未启用内嵌 AI 判读模型：请在 AI 巡检配置中启用判读模型并填写 API Key"})
			return
		}
		apiKey, err := resolveInspectJudgeAPIKey(app.Cfg(), ai)
		if err != nil || apiKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "未配置判读模型 API Key"})
			return
		}

		// 校验全部通过后按 Stream 决定输出方式：默认一次性 JSON；stream=true 走 NDJSON 事件流
		useStream := body.Stream != nil && *body.Stream
		if useStream {
			c.Writer.Header().Set("Content-Type", "application/x-ndjson")
			c.Writer.Header().Set("Cache-Control", "no-cache")
			c.Writer.Header().Set("X-Accel-Buffering", "no")
			c.Status(http.StatusOK)
		}
		emit := func(ev map[string]any) {
			if !useStream {
				return
			}
			b, _ := json.Marshal(ev)
			_, _ = c.Writer.Write(append(b, '\n'))
			if f, ok := c.Writer.(http.Flusher); ok {
				f.Flush()
			}
		}

		operate := mode == "operate"
		confirm := body.Confirm
		tools := aiAssistantToolRegistry(operate)

		msgs := make([]aiAssistantMessage, 0, len(body.History)+2)
		msgs = append(msgs, aiAssistantMessage{Role: "system", Content: aiAssistantStrPtr(aiAssistantSystemPrompt)})
		for _, h := range body.History {
			role := strings.TrimSpace(h.Role)
			if role != "user" && role != "assistant" {
				continue
			}
			if strings.TrimSpace(h.Content) == "" {
				continue
			}
			msgs = append(msgs, aiAssistantMessage{Role: role, Content: aiAssistantStrPtr(h.Content)})
		}
		msgs = append(msgs, aiAssistantMessage{Role: "user", Content: aiAssistantStrPtr(body.Question)})

		trace := make([]aiAssistantToolTrace, 0, 4)
		actions := make([]gin.H, 0, 2)
		reply := ""
		rounds := 0
		for rounds < aiAssistantMaxRounds {
			rounds++
			emit(map[string]any{"type": "status", "round": rounds, "message": fmt.Sprintf("第 %d 轮：分析问题并决定下一步检查项…", rounds)})
			content, toolCalls, _, err := aiAssistantChatOnce(app.PlatformKV(), app.Cfg(), ai, "assistant", apiKey, msgs, tools)
			if err != nil {
				if useStream {
					emit(map[string]any{"type": "error", "error": err.Error(), "toolTrace": trace, "actions": actions})
					return
				}
				c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "toolTrace": trace, "actions": actions})
				return
			}
			if len(toolCalls) == 0 {
				reply = strings.TrimSpace(content)
				break
			}
			msgs = append(msgs, aiAssistantMessage{Role: "assistant", Content: aiAssistantStrPtr(content), ToolCalls: toolCalls})
			for _, tc := range toolCalls {
				var argsPretty any
				_ = json.Unmarshal([]byte(tc.Function.Arguments), &argsPretty)
				emit(map[string]any{"type": "tool_start", "name": tc.Function.Name, "arguments": argsPretty, "write": aiAssistantToolIsWrite(tools, tc.Function.Name)})
				res := aiAssistantExecuteTool(app, c, tools, operate, confirm, tc, &actions)
				trace = append(trace, res.Trace)
				msgs = append(msgs, aiAssistantMessage{Role: "tool", Content: aiAssistantStrPtr(res.Result), ToolCallID: tc.ID})
				if res.Trace.Write && strings.HasPrefix(res.Trace.Result, "[操作已暂缓]") {
					emit(map[string]any{"type": "proposed", "name": tc.Function.Name, "arguments": argsPretty})
				} else {
					emit(map[string]any{"type": "tool_result", "name": tc.Function.Name, "arguments": argsPretty, "result": res.Trace.Result, "durationMs": res.Trace.DurationMs, "write": res.Trace.Write})
				}
			}
		}
		if strings.TrimSpace(reply) == "" {
			reply = "已达到工具调用轮次上限，请缩小问题范围后重试。"
		}
		// 解析并剥离 SUGGESTED_FOLLOW_UPS 行 → suggestedActions 数组
		var followUps []string
		lines := strings.Split(reply, "\n")
		var cleanLines []string
		for _, ln := range lines {
			if strings.HasPrefix(strings.TrimSpace(ln), "SUGGESTED_FOLLOW_UPS:") {
				val := strings.TrimPrefix(strings.TrimSpace(ln), "SUGGESTED_FOLLOW_UPS:")
				for _, part := range strings.Split(val, "|") {
					part = strings.TrimSpace(part)
					if part != "" {
						followUps = append(followUps, part)
					}
				}
			} else {
				cleanLines = append(cleanLines, ln)
			}
		}
		reply = strings.TrimSpace(strings.Join(cleanLines, "\n"))
		if len(followUps) > 3 {
			followUps = followUps[:3]
		}
		if useStream {
			ev := map[string]any{"type": "final", "reply": reply, "toolTrace": trace, "actions": actions, "mode": mode, "rounds": rounds}
			if len(followUps) > 0 {
				ev["suggestedFollowUps"] = followUps
			}
			emit(ev)
			return
		}
		out := gin.H{"reply": reply, "toolTrace": trace, "actions": actions, "mode": mode, "rounds": rounds}
		if len(followUps) > 0 {
			out["suggestedFollowUps"] = followUps
		}
		c.JSON(http.StatusOK, out)
	}
}

func aiAssistantToolIsWrite(tools []aiAssistantTool, name string) bool {
	for i := range tools {
		if tools[i].Name == name {
			return tools[i].Write
		}
	}
	return false
}
