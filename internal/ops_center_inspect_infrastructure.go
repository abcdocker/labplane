package internal

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

type bastionPolicyFacts struct {
	Targets  int
	Warnings []string
}

func inspectWithRetry(ctx context.Context, operation func() error) error {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if err := operation(); err == nil {
			return nil
		} else {
			lastErr = err
		}
		if attempt == 2 {
			break
		}
		delay := time.Duration(150*(1<<attempt)) * time.Millisecond
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
	return lastErr
}

func inspectBastionPolicyFacts(policy *VCenterBastionPolicy) bastionPolicyFacts {
	if policy == nil {
		policy = bastionPolicyDefault()
	}
	facts := bastionPolicyFacts{Targets: len(policy.ExtraHosts)}
	if !policy.EnableACL {
		facts.Warnings = append(facts.Warnings, "堡垒机 ACL 未启用，拥有 vCenter 模块权限的用户均可访问目标")
	}
	if policy.NativeSshEnabled && (policy.NativeSshPort < 1 || policy.NativeSshPort > 65535) {
		facts.Warnings = append(facts.Warnings, "原生 SSH 监听端口无效")
	}
	for _, host := range policy.ExtraHosts {
		name := strings.TrimSpace(host.Name)
		if name == "" {
			name = strings.TrimSpace(host.ID)
		}
		if strings.EqualFold(host.Kind, "windows") {
			if raw := strings.TrimSpace(host.RDPWebURL); raw != "" {
				u, err := url.Parse(raw)
				if err != nil || !strings.EqualFold(u.Scheme, "https") {
					facts.Warnings = append(facts.Warnings, fmt.Sprintf("目标 %s 的 RDP Web 地址未使用 HTTPS", name))
				}
			}
			continue
		}
		if strings.TrimSpace(host.SSHHostKeyFingerprint) == "" {
			facts.Warnings = append(facts.Warnings, fmt.Sprintf("目标 %s 未固定 SSH 主机密钥指纹", name))
		}
	}
	return facts
}

type headscaleNodeFacts struct {
	Total              int
	Online             int
	Stale              int
	Expired            int
	PendingRoutes      int
	InvalidTags        int
	DuplicateAddresses int
}

func inspectHeadscaleNodeFacts(nodes []HSNode, now time.Time) headscaleNodeFacts {
	facts := headscaleNodeFacts{Total: len(nodes)}
	addresses := make(map[string]int)
	for _, node := range nodes {
		for _, address := range node.IPAddresses {
			address = strings.TrimSpace(address)
			if address != "" {
				addresses[address]++
			}
		}
		if node.Online {
			facts.Online++
		} else if seen, err := time.Parse(time.RFC3339, node.LastSeen); err == nil && now.Sub(seen) > 7*24*time.Hour {
			facts.Stale++
		}
		if expiry, err := time.Parse(time.RFC3339, node.Expiry); err == nil && expiry.Before(now) {
			facts.Expired++
		}
		approved := make(map[string]struct{}, len(node.ApprovedRoutes))
		for _, route := range node.ApprovedRoutes {
			approved[route] = struct{}{}
		}
		for _, route := range node.AvailableRoutes {
			if _, ok := approved[route]; !ok {
				facts.PendingRoutes++
			}
		}
		facts.InvalidTags += len(node.InvalidTags)
	}
	for _, count := range addresses {
		if count > 1 {
			facts.DuplicateAddresses++
		}
	}
	return facts
}

type authentikEventFacts struct {
	SystemTaskExceptions int
	AuthFailures         int
	Lines                []string
}

func inspectAuthentikEventFacts(events []map[string]any) authentikEventFacts {
	facts := authentikEventFacts{}
	for _, event := range events {
		action := safeEventString(event["action"])
		if action == "" {
			action = "unknown"
		}
		lower := strings.ToLower(action)
		if lower == "system_task_exception" {
			facts.SystemTaskExceptions++
		}
		if strings.Contains(lower, "login_failed") || strings.Contains(lower, "authentication_failed") || strings.Contains(lower, "invalid_credentials") {
			facts.AuthFailures++
		}
		user := "系统任务"
		if userMap, ok := event["user"].(map[string]any); ok {
			if candidate := safeEventString(userMap["username"]); candidate != "" {
				user = candidate
			} else if candidate := safeEventString(userMap["name"]); candidate != "" {
				user = candidate
			}
		} else if candidate := safeEventString(event["user"]); candidate != "" {
			user = candidate
		}
		created := safeEventString(event["created"])
		line := fmt.Sprintf("%s user=%s", action, user)
		if created != "" {
			line = created + " " + line
		}
		facts.Lines = append(facts.Lines, line)
	}
	return facts
}

func safeEventString(v any) string {
	s, ok := v.(string)
	if !ok {
		return ""
	}
	s = strings.TrimSpace(s)
	if len(s) > 120 {
		s = s[:120]
	}
	return s
}

func inspectCollectBastionSection(ctx context.Context, app *ServerApp, enabled bool) InspectionSection {
	sec := InspectionSection{ID: "bastion", Title: "堡垒机", Status: "skip"}
	if !enabled {
		sec.Markdown = "未勾选堡垒机巡检。"
		return sec
	}
	policy := loadVCenterBastionPolicy(app.PlatformKV())
	facts := inspectBastionPolicyFacts(policy)
	var lines []string
	lines = append(lines, fmt.Sprintf("- ACL：%v", policy.EnableACL), fmt.Sprintf("- 额外目标：%d", len(policy.ExtraHosts)))
	unreachable := 0
	for i, host := range policy.ExtraHosts {
		if i >= 25 || strings.TrimSpace(host.Address) == "" {
			continue
		}
		port := host.SSHPort
		if strings.EqualFold(host.Kind, "windows") {
			port = host.RDPPort
		}
		if port <= 0 {
			continue
		}
		dialer := net.Dialer{Timeout: 1500 * time.Millisecond}
		var conn net.Conn
		err := inspectWithRetry(ctx, func() error {
			var dialErr error
			conn, dialErr = dialer.DialContext(ctx, "tcp", net.JoinHostPort(strings.Trim(host.Address, "[]"), strconv.Itoa(port)))
			return dialErr
		})
		if err != nil {
			unreachable++
			continue
		}
		_ = conn.Close()
	}
	if unreachable > 0 {
		facts.Warnings = append(facts.Warnings, fmt.Sprintf("%d 个额外目标端口不可达", unreachable))
	}
	if len(facts.Warnings) == 0 {
		sec.Status = "ok"
		lines = append(lines, "- 安全策略与目标连通性未发现异常")
	} else {
		sec.Status = "warn"
		for _, warning := range facts.Warnings {
			lines = append(lines, "- ⚠️ "+warning)
		}
	}
	sec.Markdown = strings.Join(lines, "\n")
	return sec
}

func inspectCollectHeadscaleSection(ctx context.Context, app *ServerApp, enabled bool) InspectionSection {
	sec := InspectionSection{ID: "headscale", Title: "Headscale 异地组网", Status: "skip"}
	if !enabled {
		sec.Markdown = "未勾选 Headscale 巡检。"
		return sec
	}
	bundle := loadMeshSettings(app.PlatformKV())
	var lines []string
	bad := 0
	active := 0
	for _, instance := range bundle.Instances {
		if !instance.Enabled {
			continue
		}
		active++
		client, _, _, err := meshClientFor(app, instance.ID)
		if err != nil {
			bad++
			lines = append(lines, fmt.Sprintf("- **%s**：连接配置不可用", instance.Name))
			continue
		}
		if err := inspectWithRetry(ctx, func() error { return client.Health(ctx) }); err != nil {
			bad++
			lines = append(lines, fmt.Sprintf("- **%s**：健康检查失败", instance.Name))
			continue
		}
		var nodes []HSNode
		err = inspectWithRetry(ctx, func() error {
			var listErr error
			nodes, listErr = client.ListNodes(ctx)
			return listErr
		})
		if err != nil {
			bad++
			lines = append(lines, fmt.Sprintf("- **%s**：节点列表读取失败", instance.Name))
			continue
		}
		facts := inspectHeadscaleNodeFacts(nodes, time.Now().UTC())
		if facts.Stale+facts.Expired+facts.PendingRoutes+facts.InvalidTags+facts.DuplicateAddresses > 0 {
			bad++
		}
		lines = append(lines, fmt.Sprintf("- **%s**：在线 %d/%d，长期离线 %d，已过期 %d，待审批路由 %d，无效标签 %d，重复地址 %d", instance.Name, facts.Online, facts.Total, facts.Stale, facts.Expired, facts.PendingRoutes, facts.InvalidTags, facts.DuplicateAddresses))
	}
	if active == 0 {
		sec.Markdown = "未配置已启用的 Headscale 实例。"
		return sec
	}
	if bad > 0 {
		sec.Status = "warn"
	} else {
		sec.Status = "ok"
	}
	sec.Markdown = strings.Join(lines, "\n")
	return sec
}

func inspectCollectAuthentikSection(ctx context.Context, app *ServerApp, enabled bool) InspectionSection {
	sec := InspectionSection{ID: "authentik", Title: "Authentik 身份认证", Status: "skip"}
	if !enabled {
		sec.Markdown = "未勾选 Authentik 巡检。"
		return sec
	}
	bundle := loadAuthentikSettings(app.PlatformKV())
	var lines []string
	bad := 0
	active := 0
	for _, instance := range bundle.Instances {
		if !instance.Enabled {
			continue
		}
		active++
		client, _, _, err := authentikClientFor(app, instance.ID)
		if err != nil {
			bad++
			lines = append(lines, fmt.Sprintf("- **%s**：连接配置不可用", instance.Name))
			continue
		}
		var sys map[string]any
		err = inspectWithRetry(ctx, func() error {
			var statusErr error
			sys, statusErr = client.SystemInfo(ctx)
			return statusErr
		})
		if err != nil {
			bad++
			lines = append(lines, fmt.Sprintf("- **%s**：系统状态读取失败", instance.Name))
			continue
		}
		version := safeEventString(sys["version"])
		users, groups, apps, providers := client.Counts(ctx)
		var events []map[string]any
		eventErr := inspectWithRetry(ctx, func() error {
			var listErr error
			events, listErr = client.ListEvents(ctx, 50)
			return listErr
		})
		facts := inspectAuthentikEventFacts(events)
		if eventErr != nil || facts.SystemTaskExceptions > 0 || facts.AuthFailures > 0 {
			bad++
		}
		lines = append(lines, fmt.Sprintf("- **%s**：版本 %s，用户 %d，组 %d，应用 %d，提供程序 %d，系统任务异常 %d，认证失败 %d", instance.Name, version, users, groups, apps, providers, facts.SystemTaskExceptions, facts.AuthFailures))
		for _, line := range facts.Lines {
			if strings.Contains(strings.ToLower(line), "exception") || strings.Contains(strings.ToLower(line), "failed") {
				lines = append(lines, "  - "+line)
			}
		}
	}
	if active == 0 {
		sec.Markdown = "未配置已启用的 Authentik 实例。"
		return sec
	}
	if bad > 0 {
		sec.Status = "warn"
	} else {
		sec.Status = "ok"
	}
	sec.Markdown = strings.Join(lines, "\n")
	return sec
}

func RunInfrastructureDomainInspection(app *ServerApp, cfg Config, bundle OpsAIInspectBundle, domain string, onProgress func(int, string, string)) (InspectionReport, error) {
	domain = normalizeInspectionDomain(domain)
	if domain == "" || domain == "platform" {
		return InspectionReport{}, fmt.Errorf("无效的独立巡检域")
	}
	if onProgress != nil {
		onProgress(10, "初始化", "开始"+domain+"巡检")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	sections := make([]InspectionSection, 0, 2)
	switch domain {
	case "vcenter":
		focusedAI := bundle.AI
		focusedAI.InspectVCenter = true
		focusedAI.InspectVCenterEvents = true
		sections = append(sections, inspectCollectVCenterSection(ctx, app, focusedAI), inspectCollectVCenterEventsSection(ctx, app, focusedAI))
	case "bastion":
		sections = append(sections, inspectCollectBastionSection(ctx, app, true))
	case "headscale":
		sections = append(sections, inspectCollectHeadscaleSection(ctx, app, true))
	case "authentik":
		sections = append(sections, inspectCollectAuthentikSection(ctx, app, true))
	}
	items := make([]InspectionReportItem, 0, len(sections))
	counts := map[string]int{}
	for _, section := range sections {
		counts[section.Status]++
		items = append(items, InspectionReportItem{Target: section.Title, Status: section.Status, Detail: firstMarkdownLine(section.Markdown)})
	}
	created := NowBeijingRFC3339()
	report := InspectionReport{
		ID: uuid.New().String(), Domain: domain, CreatedAt: created,
		Summary: fmt.Sprintf("%s 巡检完成：正常 %d，警告 %d，异常 %d，跳过 %d", domain, counts["ok"], counts["warn"], counts["fail"], counts["skip"]),
		Items:   items, Sections: sections,
	}
	if opsJudgeReady(bundle.AI) {
		if onProgress != nil {
			onProgress(85, "AI 摘要", "生成脱敏巡检摘要")
		}
		text, verdict, err := opsInspectJudgeSummary(app.PlatformKV(), cfg, bundle.AI, report)
		if err != nil {
			report.AISummaryError = opsTruncateStr(err.Error(), 300)
		} else {
			report.AISummary, report.AIJudge = text, verdict
		}
	}
	if onProgress != nil {
		onProgress(99, "保存报告", "保存独立巡检报告")
	}
	if err := appendInspectReport(app.PlatformKV(), report, 50); err != nil {
		return InspectionReport{}, err
	}
	return report, nil
}

func firstMarkdownLine(markdown string) string {
	lines := strings.Split(strings.TrimSpace(markdown), "\n")
	if len(lines) == 0 || lines[0] == "" {
		return "无详细信息"
	}
	return strings.TrimSpace(strings.TrimPrefix(lines[0], "-"))
}
