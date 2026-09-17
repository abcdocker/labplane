package internal

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// InspectCollectK8sRestartCorrelationSection 将整点关联分析并入 AI 巡检 Markdown 分项。
func InspectCollectK8sRestartCorrelationSection(app *ServerApp, ai OpsAIInspectConfig) InspectionSection {
	sec := InspectionSection{ID: "k8s_restart_correlation", Title: "异常 Pod 关联与重启分析（平台缓存）"}
	if !ai.InspectK8s {
		sec.Status = "skip"
		sec.Markdown = "未勾选 Kubernetes 巡检，跳过本项。"
		return sec
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()

	if doc, ok, err := RedisGetRestartCorrelationLatest(ctx, app.Redis()); err == nil && ok && strings.TrimSpace(doc.Body) != "" {
		sec.Status = "ok"
		var b strings.Builder
		b.WriteString("数据来自 **Redis 整点缓存**（后台任务写入）。\n\n")
		b.WriteString(doc.Body)
		if len(doc.Meta) > 0 {
			b.WriteString("\n\n#### 结构化摘要\n\n")
			b.WriteString(fmt.Sprintf("- likelyInfraCorrelation: **%v**\n", doc.Meta["likelyInfraCorrelation"]))
			b.WriteString(fmt.Sprintf("- totalHighRestartPods: **%v**\n", doc.Meta["totalHighRestartPods"]))
		}
		sec.Markdown = b.String()
		return sec
	}
	db := app.MySQLDB()
	if db == nil {
		sec.Status = "skip"
		sec.Markdown = "无 Redis 缓存且未配置 MySQL，暂无关联分析条目。"
		return sec
	}
	row, ok, err := MysqlSelectLatestRestartCorrelation(ctx, db)
	if err != nil {
		sec.Status = "warn"
		sec.Markdown = "读取 MySQL 失败：" + err.Error()
		return sec
	}
	if !ok || strings.TrimSpace(row.Body) == "" {
		sec.Status = "skip"
		sec.Markdown = "尚无整点关联分析记录（后台任务每小时写入一次）。"
		return sec
	}
	sec.Status = "ok"
	sec.Markdown = "数据来自 **MySQL** 最近一条 `hourly_correlation`。\n\n" + row.Body
	return sec
}
