package internal

// 剧本化巡检引擎：确定性采集（Prometheus 即时向量 / VictoriaLogs 日志计数）
// + 阈值规则 → 仅将越限 findings 送内嵌判读模型做根因分析。
// 热路径全部为确定性查询，判读失败时自动降级为纯规则结论。

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// InspectPlaybookStep 单个检查步骤。
type InspectPlaybookStep struct {
	ID            string `yaml:"id" json:"id"`
	Title         string `yaml:"title" json:"title"`
	Source        string `yaml:"source" json:"source"` // prometheus | vmlog
	Scope         string `yaml:"scope,omitempty" json:"scope,omitempty"`
	Expr          string `yaml:"expr,omitempty" json:"expr,omitempty"`     // PromQL（instant vector）
	Query         string `yaml:"query,omitempty" json:"query,omitempty"`   // LogsQL 过滤（不含时间范围）
	WindowMinutes int    `yaml:"windowMinutes,omitempty" json:"windowMinutes,omitempty"`
	GroupBy       string `yaml:"groupBy,omitempty" json:"groupBy,omitempty"` // vmlog 聚合字段，默认 host
	Warn          string `yaml:"warn,omitempty" json:"warn,omitempty"`
	Crit          string `yaml:"crit,omitempty" json:"crit,omitempty"`
	Unit          string `yaml:"unit,omitempty" json:"unit,omitempty"`
	TopN          int    `yaml:"topN,omitempty" json:"topN,omitempty"`
	SampleLimit   int    `yaml:"sampleLimit,omitempty" json:"sampleLimit,omitempty"`
}

// InspectPlaybook 一份巡检剧本。
type InspectPlaybook struct {
	Name         string                `yaml:"name" json:"name"`
	Title        string                `yaml:"title" json:"title"`
	Kind         string                `yaml:"kind" json:"kind"` // vm | service
	Description  string                `yaml:"description,omitempty" json:"description,omitempty"`
	DefaultScope string                `yaml:"defaultScope,omitempty" json:"defaultScope,omitempty"`
	Steps        []InspectPlaybookStep `yaml:"steps" json:"steps"`
}

// InspectFinding 规则命中的异常项（仅 breach 项进入判读）。
type InspectFinding struct {
	Playbook  string   `json:"playbook"`
	StepID    string   `json:"step"`
	Title     string   `json:"title"`
	Object    string   `json:"object"`
	Value     string   `json:"value"`
	Threshold string   `json:"threshold"`
	Severity  string   `json:"severity"` // warn | crit
	Samples   []string `json:"samples,omitempty"`
}

type inspectPlaybookRun struct {
	Playbook InspectPlaybook
	Status   string // ok | warn | fail
	Checked  int
	Findings []InspectFinding
	Markdown string
}

// ---- 阈值 ----

func parseInspectThreshold(s string) (op string, val float64, err error) {
	t := strings.TrimSpace(s)
	if t == "" {
		return "", 0, fmt.Errorf("空阈值")
	}
	for _, p := range []string{">=", "<=", "==", ">", "<"} {
		if strings.HasPrefix(t, p) {
			v, perr := strconv.ParseFloat(strings.TrimSpace(strings.TrimPrefix(t, p)), 64)
			if perr != nil {
				return "", 0, fmt.Errorf("阈值 %q 数值解析失败: %w", s, perr)
			}
			return p, v, nil
		}
	}
	return "", 0, fmt.Errorf("阈值 %q 缺少比较符（支持 > >= < <= ==）", s)
}

func inspectThresholdHit(op string, val, th float64) bool {
	switch op {
	case ">":
		return val > th
	case ">=":
		return val >= th
	case "<":
		return val < th
	case "<=":
		return val <= th
	case "==":
		return val == th
	}
	return false
}

// ---- Prometheus 步骤 ----

type inspectPromSeries struct {
	Labels map[string]string
	Value  float64
}

func inspectPromInstantVector(cfg Config, scope, expr string) ([]inspectPromSeries, error) {
	body, status, err := prometheusFetchInstant(cfg, scope, expr)
	if err != nil {
		return nil, err
	}
	if status >= 400 {
		return nil, fmt.Errorf("Prometheus HTTP %d: %s", status, opsTruncateStr(string(body), 200))
	}
	var wrap struct {
		Status string `json:"status"`
		Data   struct {
			ResultType string `json:"resultType"`
			Result     []struct {
				Metric map[string]string `json:"metric"`
				Value  []interface{}     `json:"value"`
			} `json:"result"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &wrap); err != nil {
		return nil, fmt.Errorf("解析 /api/v1/query 响应失败: %w", err)
	}
	out := make([]inspectPromSeries, 0, len(wrap.Data.Result))
	for _, r := range wrap.Data.Result {
		// value = [时间戳, "采样值字符串"]，取第二项解析
		if len(r.Value) < 2 {
			continue
		}
		if v, ok := promFloatFromJSONSample(r.Value[1]); ok {
			out = append(out, inspectPromSeries{Labels: r.Metric, Value: v})
		}
	}
	return out, nil
}

var inspectObjectLabelKeys = []string{"instance", "vm_name", "vmname", "host_name", "ds_name", "dsname", "pod", "exported_instance", "name"}

func inspectSeriesObjectLabel(labels map[string]string) string {
	for _, k := range inspectObjectLabelKeys {
		if v := strings.TrimSpace(labels[k]); v != "" {
			return v
		}
	}
	return "未知对象"
}

func inspectFormatStepValue(v float64, unit string) string {
	if strings.TrimSpace(unit) == "" {
		return strconv.FormatFloat(v, 'f', -1, 64)
	}
	return fmt.Sprintf("%.2f %s", v, unit)
}

func evalInspectPromStep(cfg Config, pb InspectPlaybook, step InspectPlaybookStep) (checked int, findings []InspectFinding, topSeries []inspectPromSeries, note string, err error) {
	scope := strings.TrimSpace(step.Scope)
	if scope == "" || scope == "inherit" {
		scope = strings.TrimSpace(pb.DefaultScope)
	}
	if scope == "" {
		scope = "k8s"
	}
	series, err := inspectPromInstantVector(cfg, scope, step.Expr)
	if err != nil {
		return 0, nil, nil, "", err
	}
	if len(series) == 0 {
		return 0, nil, nil, fmt.Sprintf("步骤 %s（%s）：无数据，指标可能未被采集", step.ID, step.Title), nil
	}
	warnOp, warnVal, warnErr := parseInspectThreshold(step.Warn)
	critOp, critVal, critErr := parseInspectThreshold(step.Crit)
	hasThreshold := step.Warn != "" || step.Crit != ""
	for _, s := range series {
		checked++
		if !hasThreshold {
			continue
		}
		sev := ""
		thStr := ""
		if critErr == nil && inspectThresholdHit(critOp, s.Value, critVal) {
			sev, thStr = "crit", step.Crit
		} else if warnErr == nil && inspectThresholdHit(warnOp, s.Value, warnVal) {
			sev, thStr = "warn", step.Warn
		}
		if sev == "" {
			continue
		}
		findings = append(findings, InspectFinding{
			Playbook:  pb.Name,
			StepID:    step.ID,
			Title:     step.Title,
			Object:    inspectSeriesObjectLabel(s.Labels),
			Value:     inspectFormatStepValue(s.Value, step.Unit),
			Threshold: thStr,
			Severity:  sev,
		})
	}
	if step.TopN > 0 {
		sorted := append([]inspectPromSeries(nil), series...)
		sort.Slice(sorted, func(i, j int) bool { return sorted[i].Value > sorted[j].Value })
		if len(sorted) > step.TopN {
			sorted = sorted[:step.TopN]
		}
		topSeries = sorted
	}
	return checked, findings, topSeries, "", nil
}

// ---- VictoriaLogs 步骤 ----

func inspectVmLogRowGroupValue(row map[string]any, field string) string {
	switch strings.TrimSpace(field) {
	case "", "host":
		return vmlogRowHost(row)
	case "namespace":
		return k8sNamespaceFromRow(row)
	}
	if v, ok := row[field].(string); ok && strings.TrimSpace(v) != "" {
		return v
	}
	return vmlogRowHost(row)
}

func evalInspectVmLogStep(ctx context.Context, app *ServerApp, cfg Config, pb InspectPlaybook, step InspectPlaybookStep) (checked int, findings []InspectFinding, note string, err error) {
	base := normalizeVictoriaLogsBase(effectiveVictoriaLogsURL(app.Runtime(), cfg))
	if base == "" {
		return 0, nil, fmt.Sprintf("步骤 %s（%s）：未配置 VictoriaLogs，跳过", step.ID, step.Title), nil
	}
	win := step.WindowMinutes
	if win <= 0 {
		win = 1440
	}
	end := time.Now().UTC()
	start := end.Add(-time.Duration(win) * time.Minute)
	sampleLimit := step.SampleLimit
	if sampleLimit <= 0 {
		sampleLimit = 5
	}
	rows, truncated, scanWarn, _, err := fetchVictoriaLogsNDJSON(ctx, cfg, base, step.Query, 5000, start.Format(time.RFC3339Nano), end.Format(time.RFC3339Nano))
	if err != nil {
		return 0, nil, "", err
	}
	type group struct {
		count   int
		samples []string
	}
	groups := map[string]*group{}
	for _, row := range rows {
		g := inspectVmLogRowGroupValue(row, step.GroupBy)
		if strings.TrimSpace(g) == "" {
			g = "未知来源"
		}
		gg := groups[g]
		if gg == nil {
			gg = &group{}
			groups[g] = gg
		}
		gg.count++
		if len(gg.samples) < sampleLimit {
			msg := redactLogTextForAI(vmlogRowMsg(row))
			if rs := []rune(msg); len(rs) > 300 {
				msg = string(rs[:300]) + "…"
			}
			ts := ""
			if tm, ok := parseRowTime(row); ok {
				ts = tm.Format(time.RFC3339)
			}
			gg.samples = append(gg.samples, fmt.Sprintf("[%s] %s", nullDash(ts), msg))
		}
	}
	warnOp, warnVal, warnErr := parseInspectThreshold(step.Warn)
	critOp, critVal, critErr := parseInspectThreshold(step.Crit)
	for gname, gg := range groups {
		checked++
		sev := ""
		thStr := ""
		if critErr == nil && inspectThresholdHit(critOp, float64(gg.count), critVal) {
			sev, thStr = "crit", step.Crit
		} else if warnErr == nil && inspectThresholdHit(warnOp, float64(gg.count), warnVal) {
			sev, thStr = "warn", step.Warn
		}
		if sev == "" {
			continue
		}
		findings = append(findings, InspectFinding{
			Playbook:  pb.Name,
			StepID:    step.ID,
			Title:     step.Title,
			Object:    gname,
			Value:     fmt.Sprintf("%d 条", gg.count),
			Threshold: thStr,
			Severity:  sev,
			Samples:   gg.samples,
		})
	}
	extra := ""
	if truncated || strings.TrimSpace(scanWarn) != "" {
		extra = fmt.Sprintf("（truncated=%v scanWarn=%q）", truncated, scanWarn)
	}
	if len(groups) == 0 {
		note = fmt.Sprintf("步骤 %s（%s）：时间窗 %d 分钟内无匹配日志%s", step.ID, step.Title, win, extra)
	} else if extra != "" {
		note = fmt.Sprintf("步骤 %s（%s）：匹配 %d 组来源%s", step.ID, step.Title, len(groups), extra)
	}
	return checked, findings, note, nil
}

// ---- 剧本执行 ----

func runInspectPlaybook(ctx context.Context, app *ServerApp, cfg Config, pb InspectPlaybook) inspectPlaybookRun {
	run := inspectPlaybookRun{Playbook: pb, Status: "ok"}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("#### 剧本 `%s`（%s）\n\n", pb.Name, inspectMdEscape(pb.Title)))
	if desc := strings.TrimSpace(pb.Description); desc != "" {
		b.WriteString(desc + "\n\n")
	}
	for _, step := range pb.Steps {
		switch strings.TrimSpace(step.Source) {
		case "prometheus":
			checked, findings, topSeries, note, err := evalInspectPromStep(cfg, pb, step)
			if err != nil {
				run.Status = inspectWorseStatus(run.Status, "warn")
				b.WriteString(fmt.Sprintf("- **%s**（%s）：查询失败：%s\n", step.Title, step.ID, inspectMdEscape(err.Error())))
				continue
			}
			run.Checked += checked
			run.Findings = append(run.Findings, findings...)
			run.Status = inspectApplyFindingsStatus(run.Status, findings)
			b.WriteString(inspectRenderStepMarkdown(step, checked, findings, topSeries, note))
		case "vmlog":
			checked, findings, note, err := evalInspectVmLogStep(ctx, app, cfg, pb, step)
			if err != nil {
				run.Status = inspectWorseStatus(run.Status, "warn")
				b.WriteString(fmt.Sprintf("- **%s**（%s）：查询失败：%s\n", step.Title, step.ID, inspectMdEscape(err.Error())))
				continue
			}
			run.Checked += checked
			run.Findings = append(run.Findings, findings...)
			run.Status = inspectApplyFindingsStatus(run.Status, findings)
			b.WriteString(inspectRenderStepMarkdown(step, checked, findings, nil, note))
		default:
			run.Status = inspectWorseStatus(run.Status, "warn")
			b.WriteString(fmt.Sprintf("- 步骤 %s：未知 source %q，已跳过\n", step.ID, inspectMdEscape(step.Source)))
		}
	}
	run.Markdown = b.String()
	return run
}

func inspectRenderStepMarkdown(step InspectPlaybookStep, checked int, findings []InspectFinding, topSeries []inspectPromSeries, note string) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("**%s**（`%s`）\n\n", step.Title, step.ID))
	if note != "" {
		b.WriteString(fmt.Sprintf("- %s\n\n", inspectMdEscape(note)))
		return b.String()
	}
	if len(topSeries) > 0 {
		b.WriteString("| 对象 | 当前值 |\n| --- | --- |\n")
		for _, s := range topSeries {
			b.WriteString(fmt.Sprintf("| %s | %s |\n", inspectMdEscape(inspectSeriesObjectLabel(s.Labels)), inspectMdEscape(inspectFormatStepValue(s.Value, step.Unit))))
		}
		b.WriteString("\n")
		return b.String()
	}
	if len(findings) == 0 {
		b.WriteString(fmt.Sprintf("- 正常（共检查 %d 个对象）\n\n", checked))
		return b.String()
	}
	b.WriteString("| 对象 | 当前值 | 阈值 | 级别 |\n| --- | --- | --- | --- |\n")
	for _, f := range findings {
		sev := "警告"
		if f.Severity == "crit" {
			sev = "严重"
		}
		b.WriteString(fmt.Sprintf("| %s | %s | `%s` | %s |\n", inspectMdEscape(f.Object), inspectMdEscape(f.Value), inspectMdEscape(f.Threshold), sev))
	}
	b.WriteString("\n")
	return b.String()
}

func inspectWorseStatus(cur, next string) string {
	rank := map[string]int{"ok": 0, "skip": 0, "warn": 1, "fail": 2}
	if rank[next] > rank[cur] {
		return next
	}
	return cur
}

func inspectApplyFindingsStatus(cur string, findings []InspectFinding) string {
	for _, f := range findings {
		if f.Severity == "crit" {
			cur = inspectWorseStatus(cur, "fail")
		} else {
			cur = inspectWorseStatus(cur, "warn")
		}
	}
	return cur
}

// ---- 剧本加载：内置 + <dataDir>/inspect_playbooks/*.yaml 覆盖 ----

func loadInspectPlaybooks(app *ServerApp) []InspectPlaybook {
	out := append([]InspectPlaybook(nil), builtinInspectPlaybooks()...)
	if app == nil {
		return out
	}
	dir := filepath.Join(app.DataDir(), "inspect_playbooks")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return out
	}
	for _, e := range entries {
		name := strings.ToLower(e.Name())
		if e.IsDir() || (!strings.HasSuffix(name, ".yaml") && !strings.HasSuffix(name, ".yml")) {
			continue
		}
		data, rerr := os.ReadFile(filepath.Join(dir, e.Name()))
		if rerr != nil {
			continue
		}
		var pb InspectPlaybook
		if uerr := yaml.Unmarshal(data, &pb); uerr != nil || strings.TrimSpace(pb.Name) == "" || len(pb.Steps) == 0 {
			continue
		}
		replaced := false
		for i := range out {
			if out[i].Name == pb.Name {
				out[i] = pb
				replaced = true
				break
			}
		}
		if !replaced {
			out = append(out, pb)
		}
	}
	return out
}

const inspectJudgeFindingsSystemPrompt = `你是资深 SRE，负责对确定性巡检规则筛出的异常项做根因判读。要求：
1) 只基于 findings 数据判读，不得编造；证据不足时降低 fault_level 并在 root_cause 写明缺少什么证据。
2) assessments 必须逐条覆盖 findings：step/object 原样回填，每个给 fault_level、root_cause、suggestion。
3) fault_level ∈ critical|warning|info|ok；suggestion 给可执行处置建议；可能影响业务的操作须 needs_human_approval=true。
4) summary_markdown 用中文输出本组结论（Markdown，先总评后逐项），500 字以内。
5) 回复必须是单一 JSON 对象，结构：
{"fault_level":"…","component":"…","root_cause":"…","evidence":["…"],"confidence":0.0,"suggestion":"…","needs_human_approval":true|false,"assessments":[{"step":"…","object":"…","fault_level":"…","root_cause":"…","suggestion":"…"}],"summary_markdown":"…"}`

// inspectCollectPlaybookSection 按剧本类型（vm/service）构建巡检分项，
// findings 非空且判读模型可用时追加 AI 根因判读。
func inspectCollectPlaybookSection(ctx context.Context, app *ServerApp, cfg Config, ai OpsAIInspectConfig, kind string) InspectionSection {
	sec := InspectionSection{ID: "playbook-" + kind, Title: "虚拟机层巡检（剧本）"}
	if kind == "service" {
		sec.Title = "服务巡检（剧本）"
	}
	if !ai.PlaybooksEnabled() {
		sec.Status = "skip"
		sec.Markdown = "未启用剧本化巡检（playbooksEnabled=false）。"
		return sec
	}
	var pbs []InspectPlaybook
	for _, pb := range loadInspectPlaybooks(app) {
		if strings.TrimSpace(pb.Kind) == kind {
			pbs = append(pbs, pb)
		}
	}
	if len(pbs) == 0 {
		sec.Status = "skip"
		sec.Markdown = fmt.Sprintf("无 kind=%s 的剧本（可放置于 dataDir/inspect_playbooks/）。", kind)
		return sec
	}
	var b strings.Builder
	b.WriteString(fmt.Sprintf("共执行 %d 份剧本（确定性采集 + 阈值规则，仅异常项进入 AI 判读）。\n\n", len(pbs)))
	var allFindings []InspectFinding
	for _, pb := range pbs {
		run := runInspectPlaybook(ctx, app, cfg, pb)
		sec.Status = inspectWorseStatus(sec.Status, run.Status)
		allFindings = append(allFindings, run.Findings...)
		b.WriteString(run.Markdown)
	}
	if sec.Status == "" {
		sec.Status = "ok"
	}
	if len(allFindings) == 0 {
		b.WriteString("\n本组剧本未发现越限异常。")
		sec.Markdown = b.String()
		if sec.Status == "" {
			sec.Status = "ok"
		}
		return sec
	}
	j := ai.JudgeModel
	normalizeInspectJudgeConfig(&j)
	if !opsJudgeReady(ai) {
		b.WriteString("\n> 未启用内嵌判读模型，以上为纯规则结论。\n")
		sec.Markdown = b.String()
		return sec
	}
	b.WriteString(fmt.Sprintf("\n### AI 判读（%s）\n\n", inspectMdEscape(j.Model)))
	verdict, err := inspectJudgeFindings(app.PlatformKV(), cfg, ai, allFindings)
	if err != nil {
		b.WriteString(fmt.Sprintf("> AI 判读失败，已降级为纯规则结论：%s\n", inspectMdEscape(err.Error())))
		sec.Markdown = b.String()
		return sec
	}
	sec.Judge = verdict
	if md := strings.TrimSpace(verdict.SummaryMarkdown); md != "" {
		b.WriteString(md + "\n\n")
	} else if rendered := renderInspectJudgeVerdictMarkdown(verdict); rendered != "" {
		b.WriteString(rendered + "\n\n")
	}
	if len(verdict.Assessments) > 0 {
		b.WriteString("| 步骤 | 对象 | 级别 | 根因判断 | 处置建议 |\n| --- | --- | --- | --- | --- |\n")
		for _, a := range verdict.Assessments {
			b.WriteString(fmt.Sprintf("| `%s` | %s | %s | %s | %s |\n",
				inspectMdEscape(a.Step), inspectMdEscape(a.Object), judgeFaultLevelCN(a.FaultLevel),
				inspectMdEscape(a.RootCause), inspectMdEscape(a.Suggestion)))
		}
	}
	sec.Markdown = b.String()
	return sec
}

// inspectJudgeFindings 将 findings（含日志样本）送判读模型，返回结构化结论。
func inspectJudgeFindings(kv PlatformKV, cfg Config, ai OpsAIInspectConfig, findings []InspectFinding) (*InspectJudgeVerdict, error) {
	const maxFindings = 40
	if len(findings) > maxFindings {
		findings = findings[:maxFindings]
	}
	payload, _ := json.Marshal(map[string]any{"findings": findings})
	userMsg := "以下是本次巡检规则命中的异常 findings JSON（samples 为日志样本，已脱敏）：\n" + string(payload) + "\n\n请逐条判读并按系统说明输出 JSON。"
	raw, _, err := opsInspectJudgeCall(kv, cfg, ai, "inspect_findings", inspectJudgeFindingsSystemPrompt, userMsg, 0)
	if err != nil {
		return nil, err
	}
	return judgeParseVerdict(raw)
}
