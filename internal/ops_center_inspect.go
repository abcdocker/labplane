package internal

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const (
	opsInspectTaskPhasePending = "pending"
	opsInspectTaskPhaseRunning = "running"
	opsInspectTaskPhaseSuccess = "success"
	opsInspectTaskPhaseError   = "error"
)

var opsInspectTaskStore sync.Map

type opsInspectTask struct {
	mu         sync.RWMutex
	ID         string
	Phase      string
	Progress   int
	Stage      string
	Message    string
	Error      string
	StartedAt  string
	FinishedAt string
	Report     *InspectionReport
	Domain     string
}

func newOpsInspectTask(domain string) *opsInspectTask {
	return &opsInspectTask{
		ID:        uuid.New().String(),
		Phase:     opsInspectTaskPhasePending,
		Progress:  0,
		Stage:     "queued",
		Message:   "任务已创建，等待开始执行巡检",
		StartedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Domain:    normalizeInspectionDomain(domain),
	}
}

func (t *opsInspectTask) setProgress(progress int, stage, message string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if progress < 0 {
		progress = 0
	}
	if progress > 100 {
		progress = 100
	}
	if progress > t.Progress {
		t.Progress = progress
	}
	if strings.TrimSpace(stage) != "" {
		t.Stage = strings.TrimSpace(stage)
	}
	if strings.TrimSpace(message) != "" {
		t.Message = strings.TrimSpace(message)
	}
	if t.Phase == opsInspectTaskPhasePending {
		t.Phase = opsInspectTaskPhaseRunning
	}
}

func (t *opsInspectTask) finishSuccess(rep InspectionReport) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Phase = opsInspectTaskPhaseSuccess
	t.Progress = 100
	t.Stage = "done"
	t.Message = "巡检已完成"
	t.FinishedAt = time.Now().UTC().Format(time.RFC3339Nano)
	t.Report = &rep
	t.Error = ""
}

func (t *opsInspectTask) finishError(err error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Phase = opsInspectTaskPhaseError
	if t.Progress < 5 {
		t.Progress = 5
	}
	t.Stage = "failed"
	t.Error = strings.TrimSpace(err.Error())
	if t.Error == "" {
		t.Error = "巡检失败"
	}
	t.Message = t.Error
	t.FinishedAt = time.Now().UTC().Format(time.RFC3339Nano)
}

func (t *opsInspectTask) snapshot() map[string]any {
	t.mu.RLock()
	defer t.mu.RUnlock()
	out := map[string]any{
		"taskId":     t.ID,
		"phase":      t.Phase,
		"progress":   t.Progress,
		"stage":      t.Stage,
		"message":    t.Message,
		"startedAt":  t.StartedAt,
		"finishedAt": t.FinishedAt,
		"domain":     t.Domain,
	}
	if t.Error != "" {
		out["error"] = t.Error
	}
	if t.Report != nil {
		out["report"] = t.Report
		if id := strings.TrimSpace(t.Report.ID); id != "" {
			out["reportId"] = id
		}
	}
	return out
}

// snapshotForList 与 snapshot 相同但省略完整 report，避免任务列表响应过大。
func (t *opsInspectTask) snapshotForList() map[string]any {
	snap := t.snapshot()
	delete(snap, "report")
	return snap
}

func opsInspectTaskGet(id string) (*opsInspectTask, bool) {
	v, ok := opsInspectTaskStore.Load(strings.TrimSpace(id))
	if !ok {
		return nil, false
	}
	t, ok := v.(*opsInspectTask)
	return t, ok
}

func opsInspectTaskList(limit int) []map[string]any {
	if limit <= 0 {
		limit = 10
	}
	type row struct {
		started time.Time
		data    map[string]any
	}
	items := make([]row, 0, limit)
	opsInspectTaskStore.Range(func(_, value any) bool {
		t, ok := value.(*opsInspectTask)
		if !ok || t == nil {
			return true
		}
		snap := t.snapshotForList()
		startedAt, _ := snap["startedAt"].(string)
		ts, _ := time.Parse(time.RFC3339Nano, startedAt)
		items = append(items, row{started: ts, data: snap})
		return true
	})
	sort.Slice(items, func(i, j int) bool { return items[i].started.After(items[j].started) })
	if len(items) > limit {
		items = items[:limit]
	}
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		out = append(out, item.data)
	}
	return out
}

// RunPlatformInspection 聚合平台各模块健康摘要与分项 Markdown 报告。
func RunPlatformInspection(app *ServerApp, cfg Config, bundle OpsAIInspectBundle, onProgress func(progress int, stage, message string)) (InspectionReport, error) {
	ai := bundle.AI
	var items []InspectionReportItem
	okN, warnN, failN := 0, 0, 0
	reportProgress := func(progress int, stage, message string) {
		if onProgress != nil {
			onProgress(progress, stage, message)
		}
	}
	add := func(target, status, detail string) {
		items = append(items, InspectionReportItem{Target: target, Status: status, Detail: detail})
		switch status {
		case "ok":
			okN++
		case "warn":
			warnN++
		case "fail":
			failN++
		}
	}
	reportProgress(5, "基础检查", "开始巡检基础连通性")

	if ai.InspectK8s {
		if app.K8s() == nil {
			add("Kubernetes API", "fail", "未连接集群")
		} else {
			ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
			_, err := app.K8s().CoreV1().Namespaces().List(ctx, metav1.ListOptions{Limit: 1})
			cancel()
			if err != nil {
				add("Kubernetes API", "fail", err.Error())
			} else {
				add("Kubernetes API", "ok", "可访问 API")
			}
		}
	}

	if ai.InspectVCenter {
		if app.VCenter() == nil {
			add("vCenter", "warn", "未配置或未连接")
		} else {
			add("vCenter", "ok", "客户端已初始化")
		}
	}

	if ai.InspectVCenterEvents {
		if app.VCenter() == nil {
			add("vCenter VM事件与告警", "warn", "vCenter 未配置或未连接")
		} else {
			evs, _ := GetVCenterVMEvents(app.PlatformKV(), 0, 24)
			add("vCenter VM事件与告警", "ok", fmt.Sprintf("过去24h已记录 %d 条 VM 事件", len(evs)))
		}
	}

	if ai.InspectPrometheusK8s {
		_, hint := PrometheusPromQLInstantProbe(cfg, "k8s", "1")
		if hint != "" {
			add("Prometheus(k8s)", "warn", hint)
		} else {
			add("Prometheus(k8s)", "ok", "即时查询可用")
		}
	}

	if ai.InspectPrometheusVCenter {
		_, hint := PrometheusPromQLInstantProbe(cfg, "vcenter", "1")
		if hint != "" {
			add("Prometheus(vcenter)", "warn", hint)
		} else {
			add("Prometheus(vcenter)", "ok", "即时查询可用")
		}
	}

	if ai.InspectVMLog {
		base := normalizeVictoriaLogsBase(effectiveVictoriaLogsURL(app.Runtime(), cfg))
		if base == "" {
			add("VictoriaLogs / VM 日志", "warn", "未配置 victoriaLogsUrl")
		} else {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			_, _, _, _, err := fetchVictoriaLogsNDJSON(ctx, cfg, base, "*", 1, "", "")
			cancel()
			if err != nil {
				add("VictoriaLogs / VM 日志", "warn", err.Error())
			} else {
				add("VictoriaLogs / VM 日志", "ok", "查询接口可用")
			}
		}
	}

	if ai.InspectRedis {
		db := app.MySQLDB()
		if db == nil {
			add("应用中心 Redis 实例表", "skip", "无 MySQL，跳过实例列表")
		} else {
			ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			var n int
			err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM labplane_app_redis_instances`).Scan(&n)
			if err != nil {
				add("应用中心 Redis", "warn", err.Error())
			} else {
				add("应用中心 Redis", "ok", fmt.Sprintf("已登记 %d 个实例", n))
			}
		}
	}

	if ai.InspectSSH {
		st := app.SSHStore()
		if st == nil {
			add("SSH 凭据存储", "warn", "未初始化")
		} else {
			add("SSH 凭据存储", "ok", "后端已就绪")
		}
	}

	if ai.InspectCloudVm {
		db := app.MySQLDB()
		if db == nil {
			add("云主机实例表", "skip", "无 MySQL")
		} else {
			ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
			defer cancel()
			var n int
			err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM labplane_app_cloud_vm_instances`).Scan(&n)
			if err != nil {
				add("云主机", "warn", err.Error())
			} else {
				add("云主机", "ok", fmt.Sprintf("已登记 %d 台", n))
			}
		}
	}
	reportProgress(25, "汇总分项", "开始生成各模块巡检分项")

	// —— 深度分项（Markdown）——
	var sections []InspectionSection
	colCtx, colCancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer colCancel()

	reportProgress(35, "Kubernetes", "采集 Kubernetes 巡检数据")
	sections = append(sections, inspectCollectK8sSection(colCtx, app, cfg, ai))
	reportProgress(45, "vCenter", "采集 vCenter 巡检数据")
	sections = append(sections, inspectCollectVCenterSection(colCtx, app, ai))
	reportProgress(50, "vCenter 事件与告警", "采集 vCenter VM 事件与宿主机告警")
	sections = append(sections, inspectCollectVCenterEventsSection(colCtx, app, ai))
	reportProgress(55, "Prometheus", "采集 Prometheus 巡检数据")
	sections = append(sections, inspectCollectPrometheusSection(colCtx, app, cfg, ai))
	reportProgress(65, "日志巡检", "采集 VictoriaLogs / VM 日志巡检数据")
	sections = append(sections, inspectCollectVMLogSection(colCtx, app, cfg, ai))
	reportProgress(72, "Redis", "采集 Redis 巡检数据")
	sections = append(sections, inspectCollectRedisSection(colCtx, app, cfg, ai))
	reportProgress(78, "云主机", "采集云主机巡检数据")
	sections = append(sections, inspectCollectCloudVmSection(colCtx, app, ai))
	reportProgress(86, "Pod 关联", "读取整点异常 Pod 关联与重启分析缓存")
	sections = append(sections, InspectCollectK8sRestartCorrelationSection(app, ai))
	reportProgress(88, "SSH", "采集 SSH 凭据存储状态")
	sections = append(sections, inspectCollectSSHSection(app, ai))
	reportProgress(89, "堡垒机", "采集堡垒机策略与目标连通性")
	sections = append(sections, inspectCollectBastionSection(colCtx, app, ai.InspectBastion))
	reportProgress(90, "Headscale", "采集 Headscale 实例与节点健康状态")
	sections = append(sections, inspectCollectHeadscaleSection(colCtx, app, ai.InspectHeadscale))
	reportProgress(91, "Authentik", "采集 Authentik 状态与异常事件")
	sections = append(sections, inspectCollectAuthentikSection(colCtx, app, ai.InspectAuthentik))
	reportProgress(92, "虚拟机剧本", "执行虚拟机层剧本巡检（确定性采集 + 阈值规则）")
	sections = append(sections, inspectCollectPlaybookSection(colCtx, app, cfg, ai, "vm"))
	reportProgress(93, "服务剧本", "执行虚拟机服务剧本巡检（确定性采集 + 阈值规则）")
	sections = append(sections, inspectCollectPlaybookSection(colCtx, app, cfg, ai, "service"))

	reportProgress(94, "模型探针", "执行判读模型连通性探针")
	llmProbe := opsInspectJudgeProbe(cfg, app.PlatformKV(), ai)

	summary := fmt.Sprintf("巡检完成：正常 %d，警告 %d，异常 %d · 分项报告 %d 段", okN, warnN, failN, len(sections))
	if llmProbe != nil {
		if llmProbe.OK {
			summary += fmt.Sprintf(" · 判读模型探针成功（%d ms）", llmProbe.LatencyMs)
		} else {
			summary += " · 判读模型探针：" + opsTruncateStr(llmProbe.Message, 100)
		}
	}
	ts := NowBeijingRFC3339()
	j := ai.JudgeModel
	normalizeInspectJudgeConfig(&j)
	modelLabel := strings.TrimSpace(j.Model)
	if modelLabel == "" {
		modelLabel = "未指定"
	}
	summary += fmt.Sprintf(" · 巡检时间 %s · 判读模型 %s", ts, modelLabel)

	rep := InspectionReport{
		ID:        uuid.New().String(),
		Domain:    "platform",
		CreatedAt: ts,
		Summary:   summary,
		Items:     items,
		Sections:  sections,
		LLMProbe:  llmProbe,
	}

	if opsJudgeReady(ai) {
		reportProgress(96, "AI 摘要", "调用判读模型生成巡检摘要")
		aiText, verdict, err := opsInspectJudgeSummary(app.PlatformKV(), cfg, ai, rep)
		if err == nil && strings.TrimSpace(aiText) != "" {
			rep.AISummary = aiText
			rep.AIJudge = verdict
		} else if err != nil {
			rep.AISummaryError = opsTruncateStr(err.Error(), 300)
			rep.AISummaryErrorDetail = opsTruncateStr(err.Error(), 900)
		}
	}

	reportProgress(99, "保存报告", "保存巡检报告")
	_ = appendInspectReport(app.PlatformKV(), rep, 50)
	return rep, nil
}

// opsInspectReportForAI 控制发给大模型的 JSON 体积（不含各段完整 Markdown）。
func opsInspectReportForAI(rep InspectionReport) map[string]interface{} {
	secBrief := make([]map[string]string, 0, len(rep.Sections))
	for _, s := range rep.Sections {
		secBrief = append(secBrief, map[string]string{"id": s.ID, "title": s.Title, "status": s.Status})
	}
	out := map[string]interface{}{
		"summary":  rep.Summary,
		"items":    rep.Items,
		"sections": secBrief,
		"llmProbe": rep.LLMProbe,
	}
	return out
}
