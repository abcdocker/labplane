package internal

import (
	"bufio"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

const victoriaLogsDefaultPort int32 = 9428
const vmlogTrendCacheTTL = 90 * time.Second

func effectiveVictoriaLogsURL(rs *RuntimeSettings, cfg Config) string {
	if rs != nil && strings.TrimSpace(rs.VictoriaLogsURL) != "" {
		return strings.TrimSpace(rs.VictoriaLogsURL)
	}
	return strings.TrimSpace(cfg.VictoriaLogsURL)
}

// effectiveVictoriaLogsRetentionDays 与运行时 victoriaLogsRetentionDays 对齐；未配置或非法时默认 180 天。
func effectiveVictoriaLogsRetentionDays(rs *RuntimeSettings) int {
	if rs == nil || rs.VictoriaLogsRetentionDays <= 0 {
		return 180
	}
	if rs.VictoriaLogsRetentionDays < 7 {
		return 7
	}
	if rs.VictoriaLogsRetentionDays > 730 {
		return 730
	}
	return rs.VictoriaLogsRetentionDays
}

func normalizeVictoriaLogsBase(raw string) string {
	s := strings.TrimSpace(raw)
	s = strings.TrimRight(s, "/")
	return s
}

// discoverVictoriaLogsInCluster 在常见命名空间内查找名称含 victoria-logs / vmlog 的 Service，给出建议内网 URL。
func discoverVictoriaLogsInCluster(ctx context.Context, k8s *kubernetes.Clientset) []gin.H {
	if k8s == nil {
		return nil
	}
	cctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()

	namespaces := []string{
		"monitoring", "observability", "logging", "victoria-metrics", "vm",
		"kube-logging", "loki", "default",
	}
	seen := map[string]struct{}{}
	var out []gin.H

	tryNs := func(ns string) {
		svcs, err := k8s.CoreV1().Services(ns).List(cctx, metav1.ListOptions{})
		if err != nil {
			return
		}
		for _, s := range svcs.Items {
			ln := strings.ToLower(s.Name)
			if !strings.Contains(ln, "victoria-logs") && !strings.Contains(ln, "victorialogs") &&
				!strings.Contains(ln, "vmlog") {
				continue
			}
			port := pickVictoriaLogsServicePort(s)
			key := ns + "/" + s.Name
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			suggested := fmt.Sprintf("http://%s.%s.svc:%d", s.Name, ns, port)
			out = append(out, gin.H{
				"namespace":    ns,
				"service":      s.Name,
				"suggestedUrl": suggested,
				"port":         port,
				"hint":         "Helm 部署 VictoriaLogs 时 Service 端口多为 9428；若 chart 使用不同端口请以 kubectl get svc 为准。",
			})
		}
	}

	for _, ns := range namespaces {
		tryNs(ns)
	}

	// 全集群按标签探测（部分官方 chart）
	if selOut, err := k8s.CoreV1().Services("").List(cctx, metav1.ListOptions{
		LabelSelector: "app.kubernetes.io/name=victoria-logs",
	}); err == nil {
		for _, s := range selOut.Items {
			ns := s.Namespace
			key := ns + "/" + s.Name
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			port := pickVictoriaLogsServicePort(s)
			suggested := fmt.Sprintf("http://%s.%s.svc:%d", s.Name, ns, port)
			out = append(out, gin.H{
				"namespace":    ns,
				"service":      s.Name,
				"suggestedUrl": suggested,
				"port":         port,
				"hint":         "匹配标签 app.kubernetes.io/name=victoria-logs",
			})
		}
	}

	return out
}

// discoverVictoriaLogsInNamespace 在指定 namespace 内列出名称或标签疑似 VictoriaLogs 的 Service。
func discoverVictoriaLogsInNamespace(ctx context.Context, k8s *kubernetes.Clientset, ns string) []gin.H {
	if k8s == nil || strings.TrimSpace(ns) == "" {
		return nil
	}
	cctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	svcs, err := k8s.CoreV1().Services(strings.TrimSpace(ns)).List(cctx, metav1.ListOptions{})
	if err != nil {
		return nil
	}
	var out []gin.H
	for _, s := range svcs.Items {
		ln := strings.ToLower(s.Name)
		matchName := strings.Contains(ln, "victoria-logs") || strings.Contains(ln, "victorialogs") || strings.Contains(ln, "vmlog")
		matchLabel := s.Labels["app.kubernetes.io/name"] == "victoria-logs"
		if !matchName && !matchLabel {
			continue
		}
		port := pickVictoriaLogsServicePort(s)
		out = append(out, gin.H{
			"namespace":    s.Namespace,
			"service":      s.Name,
			"suggestedUrl": fmt.Sprintf("http://%s.%s.svc:%d", s.Name, s.Namespace, port),
			"port":         port,
			"hint": func() string {
				if matchLabel {
					return "标签 app.kubernetes.io/name=victoria-logs"
				}
				return "名称匹配 victoria-logs / victorialogs / vmlog"
			}(),
		})
	}
	return out
}

func listK8sNamespaceNames(ctx context.Context, k8s *kubernetes.Clientset) []string {
	if k8s == nil {
		return nil
	}
	cctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	list, err := k8s.CoreV1().Namespaces().List(cctx, metav1.ListOptions{})
	if err != nil {
		return nil
	}
	var names []string
	for _, n := range list.Items {
		if n.Status.Phase == corev1.NamespaceTerminating {
			continue
		}
		names = append(names, n.Name)
	}
	sort.Strings(names)
	return names
}

func handleOpsVmLogNamespaces(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		if app.K8s() == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未连接 Kubernetes API"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"namespaces": listK8sNamespaceNames(c.Request.Context(), app.K8s())})
	}
}

func handleOpsVmLogDiscover(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		ns := strings.TrimSpace(c.Query("namespace"))
		if ns == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 query 参数 namespace"})
			return
		}
		if app.K8s() == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未连接 Kubernetes API"})
			return
		}
		items := discoverVictoriaLogsInNamespace(c.Request.Context(), app.K8s(), ns)
		c.JSON(http.StatusOK, gin.H{"namespace": ns, "items": items})
	}
}

func pickVictoriaLogsServicePort(s corev1.Service) int32 {
	if len(s.Spec.Ports) == 0 {
		return victoriaLogsDefaultPort
	}
	for _, p := range s.Spec.Ports {
		if p.Port == victoriaLogsDefaultPort {
			return p.Port
		}
		n := strings.ToLower(p.Name)
		if strings.Contains(n, "http") || strings.Contains(n, "query") || strings.Contains(n, "vl") {
			return p.Port
		}
	}
	return s.Spec.Ports[0].Port
}

func vmlogHTTPClient(cfg Config) *http.Client {
	t := cfg.PrometheusTimeout
	if t <= 0 {
		t = 45 * time.Second
	}
	tr := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: cfg.VictoriaLogsSkipTLS,
		},
	}
	return &http.Client{Timeout: t, Transport: tr}
}

func buildOpsVmLogStatusPayload(ctx context.Context, app *ServerApp) gin.H {
	cfg := app.Cfg()
	base := normalizeVictoriaLogsBase(effectiveVictoriaLogsURL(app.Runtime(), cfg))
	retDays := effectiveVictoriaLogsRetentionDays(app.Runtime())
	maxWinMin := retDays * 24 * 60
	if maxWinMin <= 0 {
		maxWinMin = 180 * 24 * 60
	}
	out := gin.H{
		"configured":       base != "",
		"baseUrlHint":      maskPrometheusURL(base),
		"defaultPort":      victoriaLogsDefaultPort,
		"queryPath":        "/select/logsql/query",
		"docsUrl":          "https://docs.victoriametrics.com/victorialogs/",
		"helmChartsUrl":    "https://github.com/VictoriaMetrics/helm-charts",
		"discovered":       []gin.H{},
		"retentionDays":    retDays,
		"maxWindowMinutes": maxWinMin,
		"retentionHint":    "平台侧记录的目标保留天数（默认 180），请在 VictoriaLogs Helm/部署中与 retention 策略对齐；日志查询时间窗上限不超过此天数。",
	}
	vecDL := effectiveVMLogVectorDownloadBaseURL(app.Runtime(), cfg)
	if vecDL != "" {
		out["vmLogVectorDownloadConfigured"] = true
		out["vmLogVectorDownloadBaseUrlHint"] = maskPrometheusURL(vecDL)
	} else {
		out["vmLogVectorDownloadConfigured"] = false
	}
	geoMMDB := effectiveGeoLiteCountryMMDB(app.Runtime(), cfg)
	out["nginxGeoLiteConfigured"] = strings.TrimSpace(geoMMDB) != ""
	out["nginxGeoHint"] = "Nginx 访问统计：未配置时按内网/公网粗分；填写 MaxMind GeoLite2-Country.mmdb 路径（环境变量 KUBEBT_GEOLITE2_COUNTRY_MMDB 或运行时 geoLite2CountryMmdb）可展示国家/地区 Top。"
	if app.K8s() != nil {
		out["discovered"] = discoverVictoriaLogsInCluster(ctx, app.K8s())
	}
	return out
}

func handleOpsVmLogStatus(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, buildOpsVmLogStatusPayload(c.Request.Context(), app))
	}
}

type opsVmLogQueryBody struct {
	Query string `json:"query"`
	Limit int    `json:"limit"`
	Start string `json:"start"`
	End   string `json:"end"`
}

// fetchVictoriaLogsNDJSON 向 VictoriaLogs 发起 LogsQL 查询，解析 NDJSON 行。
func fetchVictoriaLogsNDJSON(ctx context.Context, cfg Config, baseRaw string, query string, limit int, start, end string) (rows []map[string]any, truncated bool, scanWarning string, effLimit int, err error) {
	effLimit = limit
	if effLimit <= 0 {
		effLimit = 200
	}
	base := normalizeVictoriaLogsBase(baseRaw)
	if base == "" {
		return nil, false, "", effLimit, fmt.Errorf("VictoriaLogs 根地址未配置")
	}
	u, perr := url.Parse(base + "/select/logsql/query")
	if perr != nil {
		return nil, false, "", effLimit, fmt.Errorf("VictoriaLogs 地址无效")
	}
	form := url.Values{}
	form.Set("query", query)
	// 多取一条用于判断是否达到扫描上限；响应仍严格返回 effLimit 条。
	form.Set("limit", fmt.Sprintf("%d", effLimit+1))
	if strings.TrimSpace(start) != "" {
		form.Set("start", strings.TrimSpace(start))
	}
	if strings.TrimSpace(end) != "" {
		form.Set("end", strings.TrimSpace(end))
	}
	req, rerr := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), strings.NewReader(form.Encode()))
	if rerr != nil {
		return nil, false, "", effLimit, rerr
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, derr := vmlogHTTPClient(cfg).Do(req)
	if derr != nil {
		return nil, false, "", effLimit, derr
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		slurp, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, false, "", effLimit, fmt.Errorf("VictoriaLogs HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(slurp)))
	}
	reader := io.LimitReader(resp.Body, 12<<20)
	scanner := bufio.NewScanner(reader)
	const maxTok = 1024 * 1024
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, maxTok)
	rows = make([]map[string]any, 0, effLimit+1)
	for len(rows) <= effLimit && scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var obj map[string]any
		if uerr := json.Unmarshal([]byte(line), &obj); uerr != nil {
			rows = append(rows, map[string]any{"_raw": line, "_parseError": uerr.Error()})
			continue
		}
		rows = append(rows, obj)
	}
	if serr := scanner.Err(); serr != nil {
		return rows, true, serr.Error(), effLimit, nil
	}
	if len(rows) > effLimit {
		rows = rows[:effLimit]
		truncated = true
	}
	return rows, truncated, "", effLimit, nil
}

func handleOpsVmLogQuery(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsVmLogQueryBody
		_ = c.ShouldBindJSON(&body)
		q := strings.TrimSpace(body.Query)
		if q == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "query 不能为空"})
			return
		}
		cfg := app.Cfg()
		base := normalizeVictoriaLogsBase(effectiveVictoriaLogsURL(app.Runtime(), cfg))
		if base == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "未配置 VictoriaLogs 根地址：请在运行时填写 victoriaLogsUrl（如 http://victoria-logs.monitoring.svc:9428）",
			})
			return
		}
		limit := body.Limit
		if limit <= 0 {
			limit = 200
		}
		if limit > 2000 {
			limit = 2000
		}
		rows, truncated, scanWarn, lim, err := fetchVictoriaLogsNDJSON(c.Request.Context(), cfg, base, q, limit, body.Start, body.End)
		if err != nil {
			if strings.Contains(err.Error(), "未配置") || strings.Contains(err.Error(), "无效") {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		if truncated || scanWarn != "" {
			c.JSON(http.StatusOK, gin.H{
				"rows":        rows,
				"truncated":   truncated,
				"scanWarning": scanWarn,
				"limit":       lim,
				"count":       len(rows),
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{"rows": rows, "limit": lim, "count": len(rows)})
	}
}

var (
	vmlogErrorWordRE = regexp.MustCompile(`(?i)\b(error|fatal|panic|exception|traceback|critical|crit|alert|emerg|failed|failure|crash(?:ed)?|denied|refused)\b`)
	vmlogWarnWordRE  = regexp.MustCompile(`(?i)\b(warn(?:ing)?|timeout|timed out|retry(?:ing)?|degraded|slow|unhealthy|disconnect(?:ed)?|backoff|throttle(?:d)?)\b`)
	vmlogFieldNameRE = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_.-]{0,127}$`)
)

type opsVmLogOverviewBody struct {
	WindowMinutes int    `json:"windowMinutes"`
	FetchLimit    int    `json:"fetchLimit"`
	StartTime     string `json:"startTime"`
	EndTime       string `json:"endTime"`
}

type opsVmLogDetailsBody struct {
	Scope         string `json:"scope"`
	K8sNamespace  string `json:"k8sNamespace"`
	K8sPodName    string `json:"k8sPodName"`
	Keyword       string `json:"keyword"`
	KeywordField  string `json:"keywordField"`
	WindowMinutes int    `json:"windowMinutes"`
	FetchLimit    int    `json:"fetchLimit"`
	StartTime     string `json:"startTime"`
	EndTime       string `json:"endTime"`
	Page          int    `json:"page"`
	PageSize      int    `json:"pageSize"`
}

type vmlogRowAssessment struct {
	Status         string
	HasError       bool
	Priority       string
	PriorityReason string
	ErrorCount     int
	WarnCount      int
}

func vmlogPriorityRank(priority string) int {
	switch strings.TrimSpace(strings.ToLower(priority)) {
	case "high":
		return 3
	case "medium":
		return 2
	case "low":
		return 1
	default:
		return 0
	}
}

func vmlogStatusRank(status string) int {
	switch strings.TrimSpace(strings.ToLower(status)) {
	case "fail":
		return 3
	case "warn":
		return 2
	case "ok":
		return 1
	default:
		return 0
	}
}

func vmlogScopeToCategory(scope string) string {
	switch strings.TrimSpace(strings.ToLower(scope)) {
	case "project_config":
		return "project_config"
	case "pod", "kubernetes":
		return "kubernetes"
	case "nginx":
		return "nginx"
	case "platform":
		return "platform"
	default:
		return ""
	}
}

func vmlogSummaryScope(category string) string {
	switch strings.TrimSpace(strings.ToLower(category)) {
	case "kubernetes":
		return "pod"
	case "nginx":
		return "nginx"
	case "platform":
		return "platform"
	case "project_config":
		return "project_config"
	default:
		return strings.TrimSpace(strings.ToLower(category))
	}
}

func vmlogRowSignalText(row map[string]any) string {
	parts := []string{
		vmlogRowMsg(row),
		rowValueByPath(row, "level"),
		rowValueByPath(row, "severity"),
		rowValueByPath(row, "status"),
		rowValueByPath(row, "log.level"),
		rowValueByPath(row, "log.severity"),
		rowValueByPath(row, "error"),
		rowValueByPath(row, "exception"),
	}
	return strings.ToLower(strings.Join(parts, " "))
}

func vmlogExtractHTTPStatusCode(row map[string]any) int {
	for _, key := range []string{"status", "status_code", "response_status", "http.status_code", "http_status"} {
		if s := strings.TrimSpace(rowValueByPath(row, key)); s != "" {
			if n, err := strconv.Atoi(s); err == nil && n >= 100 && n <= 599 {
				return n
			}
		}
	}
	msg := strings.TrimSpace(vmlogRowMsg(row))
	if msg == "" {
		return 0
	}
	first := strings.TrimSpace(strings.Split(msg, "\n")[0])
	if sub := reNginxCombined.FindStringSubmatch(first); len(sub) >= 5 {
		if n, err := strconv.Atoi(strings.TrimSpace(sub[4])); err == nil {
			return n
		}
	}
	if sub := reNginxStatusLoose.FindAllStringSubmatch(first, -1); len(sub) > 0 {
		last := sub[len(sub)-1]
		if len(last) >= 2 {
			if n, err := strconv.Atoi(strings.TrimSpace(last[1])); err == nil {
				return n
			}
		}
	}
	return 0
}

func vmlogAssessRow(scope string, row map[string]any) vmlogRowAssessment {
	scope = strings.TrimSpace(strings.ToLower(scope))
	if scope == "nginx" {
		if code := vmlogExtractHTTPStatusCode(row); code >= 500 {
			return vmlogRowAssessment{
				Status:         "fail",
				HasError:       true,
				Priority:       "high",
				PriorityReason: fmt.Sprintf("检测到 HTTP %d", code),
				ErrorCount:     1,
			}
		} else if code >= 400 {
			return vmlogRowAssessment{
				Status:         "warn",
				Priority:       "medium",
				PriorityReason: fmt.Sprintf("检测到 HTTP %d", code),
				WarnCount:      1,
			}
		}
	}
	text := vmlogRowSignalText(row)
	switch {
	case strings.Contains(text, "fatal") || strings.Contains(text, "panic") || strings.Contains(text, "critical") || strings.Contains(text, "traceback"):
		return vmlogRowAssessment{Status: "fail", HasError: true, Priority: "high", PriorityReason: "日志包含致命错误信号", ErrorCount: 1}
	case vmlogErrorWordRE.MatchString(text):
		return vmlogRowAssessment{Status: "fail", HasError: true, Priority: "high", PriorityReason: "日志包含错误关键字", ErrorCount: 1}
	case vmlogWarnWordRE.MatchString(text):
		return vmlogRowAssessment{Status: "warn", Priority: "medium", PriorityReason: "日志包含告警关键字", WarnCount: 1}
	default:
		return vmlogRowAssessment{Status: "ok", Priority: "none", PriorityReason: "当前日志未命中错误或告警信号"}
	}
}

func vmlogSummarizeRows(scope string, rows []map[string]any) gin.H {
	if len(rows) == 0 {
		return gin.H{
			"status":         "skip",
			"hasError":       false,
			"priority":       "none",
			"priorityReason": "当前时间范围内暂无匹配日志",
			"totalCount":     0,
			"errorCount":     0,
			"warnCount":      0,
			"lastSeenAt":     "",
		}
	}
	summary := gin.H{
		"status":         "ok",
		"hasError":       false,
		"priority":       "none",
		"priorityReason": "当前时间范围内暂无错误或告警日志",
		"totalCount":     len(rows),
		"errorCount":     0,
		"warnCount":      0,
	}
	var lastSeen time.Time
	for _, row := range rows {
		assessment := vmlogAssessRow(scope, row)
		if assessment.ErrorCount > 0 {
			summary["errorCount"] = summary["errorCount"].(int) + assessment.ErrorCount
		}
		if assessment.WarnCount > 0 {
			summary["warnCount"] = summary["warnCount"].(int) + assessment.WarnCount
		}
		if vmlogStatusRank(assessment.Status) > vmlogStatusRank(summary["status"].(string)) {
			summary["status"] = assessment.Status
		}
		if vmlogPriorityRank(assessment.Priority) > vmlogPriorityRank(summary["priority"].(string)) {
			summary["priority"] = assessment.Priority
			summary["priorityReason"] = assessment.PriorityReason
		}
		if tm, ok := parseRowTime(row); ok && (lastSeen.IsZero() || tm.After(lastSeen)) {
			lastSeen = tm
		}
	}
	if summary["errorCount"].(int) > 0 {
		summary["hasError"] = true
	}
	if lastSeen.IsZero() {
		summary["lastSeenAt"] = ""
	} else {
		summary["lastSeenAt"] = lastSeen.Format(time.RFC3339Nano)
	}
	return summary
}

func vmlogBuildDetailRow(scope string, row map[string]any) gin.H {
	assessment := vmlogAssessRow(scope, row)
	out := gin.H{
		"scope":          scope,
		"msg":            vmlogRowMsg(row),
		"fields":         buildVmlogRecentDetailFields(row),
		"status":         assessment.Status,
		"hasError":       assessment.HasError,
		"priority":       assessment.Priority,
		"priorityReason": assessment.PriorityReason,
	}
	if tm, ok := parseRowTime(row); ok {
		out["time"] = tm.Format(time.RFC3339Nano)
	}
	if ns := k8sNamespaceFromRow(row); ns != "" {
		out["namespace"] = ns
	}
	if pod := k8sPodNameFromRow(row); pod != "" {
		out["pod"] = pod
	}
	if source := vmlogRowSourceKey(row); source != "" {
		out["source"] = source
	}
	return out
}

func vmlogOverviewConfigItem(ctx context.Context, app *ServerApp) gin.H {
	payload := buildOpsVmLogStatusPayload(ctx, app)
	configured, _ := payload["configured"].(bool)
	vecConfigured, _ := payload["vmLogVectorDownloadConfigured"].(bool)
	geoConfigured, _ := payload["nginxGeoLiteConfigured"].(bool)
	item := gin.H{
		"scope":          "project_config",
		"label":          "项目配置",
		"status":         "ok",
		"hasError":       false,
		"priority":       "none",
		"priorityReason": "日志系统配置正常",
		"totalCount":     0,
		"errorCount":     0,
		"warnCount":      0,
		"lastSeenAt":     time.Now().UTC().Format(time.RFC3339Nano),
	}
	if !configured {
		item["status"] = "fail"
		item["hasError"] = true
		item["priority"] = "high"
		item["priorityReason"] = "VictoriaLogs 未配置"
		item["errorCount"] = 1
		return item
	}
	warnCount := 0
	var reasons []string
	if !vecConfigured {
		warnCount++
		reasons = append(reasons, "Vector 下载源未配置")
	}
	if !geoConfigured {
		warnCount++
		reasons = append(reasons, "GeoLite 国家库未配置")
	}
	if warnCount > 0 {
		item["status"] = "warn"
		item["priority"] = map[bool]string{true: "medium", false: "low"}[warnCount > 1]
		item["priorityReason"] = strings.Join(reasons, "；")
		item["warnCount"] = warnCount
	}
	return item
}

func handleOpsVmLogOverview(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsVmLogOverviewBody
		_ = c.ShouldBindJSON(&body)
		fetchBody := opsVmLogStatsBody{
			Category:      "all",
			WindowMinutes: body.WindowMinutes,
			FetchLimit:    body.FetchLimit,
			StartTime:     body.StartTime,
			EndTime:       body.EndTime,
		}
		if fetchBody.WindowMinutes <= 0 {
			fetchBody.WindowMinutes = 1440
		}
		if fetchBody.FetchLimit <= 0 {
			fetchBody.FetchLimit = 6000
		}
		allRows, totalFetched, truncated, scanWarn, win, startT, endT, err := vmlogPullMatchedRows(c.Request.Context(), app, fetchBody)
		if err != nil {
			if strings.Contains(err.Error(), "未配置") {
				configOnly := []gin.H{
					vmlogOverviewConfigItem(c.Request.Context(), app),
					{"scope": "pod", "label": "Pod", "status": "skip", "hasError": false, "priority": "none", "priorityReason": "VictoriaLogs 未配置，无法读取 Pod 日志", "totalCount": 0, "errorCount": 0, "warnCount": 0, "lastSeenAt": ""},
					{"scope": "nginx", "label": "Nginx", "status": "skip", "hasError": false, "priority": "none", "priorityReason": "VictoriaLogs 未配置，无法读取 Nginx 日志", "totalCount": 0, "errorCount": 0, "warnCount": 0, "lastSeenAt": ""},
					{"scope": "platform", "label": "平台日志", "status": "skip", "hasError": false, "priority": "none", "priorityReason": "VictoriaLogs 未配置，无法读取平台日志", "totalCount": 0, "errorCount": 0, "warnCount": 0, "lastSeenAt": ""},
				}
				c.JSON(http.StatusOK, gin.H{
					"windowMinutes": fetchBody.WindowMinutes,
					"windowStart":   "",
					"windowEnd":     "",
					"refreshedAt":   time.Now().UTC().Format(time.RFC3339Nano),
					"totalFetched":  0,
					"truncated":     false,
					"scanWarning":   "VictoriaLogs 未配置，仅展示项目配置状态",
					"items":         configOnly,
				})
				return
			}
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		filterRows := func(category string) []map[string]any {
			out := make([]map[string]any, 0, len(allRows))
			for _, row := range allRows {
				if rowMatchesCategory(category, "", row) {
					out = append(out, row)
				}
			}
			return out
		}
		buildItem := func(scope, label, category string) gin.H {
			rows := filterRows(category)
			summary := vmlogSummarizeRows(scope, rows)
			summary["scope"] = scope
			summary["label"] = label
			return summary
		}
		items := []gin.H{
			vmlogOverviewConfigItem(c.Request.Context(), app),
			buildItem("pod", "Pod", "kubernetes"),
			buildItem("nginx", "Nginx", "nginx"),
			buildItem("platform", "平台日志", "platform"),
		}
		c.JSON(http.StatusOK, gin.H{
			"windowMinutes": win,
			"windowStart":   startT.Format(time.RFC3339Nano),
			"windowEnd":     endT.Format(time.RFC3339Nano),
			"refreshedAt":   endT.Format(time.RFC3339Nano),
			"totalFetched":  totalFetched,
			"truncated":     truncated,
			"scanWarning":   scanWarn,
			"items":         items,
		})
	}
}

func handleOpsVmLogDetails(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsVmLogDetailsBody
		_ = c.ShouldBindJSON(&body)
		category := vmlogScopeToCategory(body.Scope)
		if category == "" || category == "project_config" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "scope 仅支持 pod / nginx / platform"})
			return
		}
		statsBody := opsVmLogStatsBody{
			Category:      category,
			K8sNamespace:  body.K8sNamespace,
			K8sPodName:    body.K8sPodName,
			Keyword:       body.Keyword,
			KeywordField:  body.KeywordField,
			WindowMinutes: body.WindowMinutes,
			FetchLimit:    body.FetchLimit,
			StartTime:     body.StartTime,
			EndTime:       body.EndTime,
		}
		if statsBody.WindowMinutes <= 0 {
			statsBody.WindowMinutes = 1440
		}
		if statsBody.FetchLimit <= 0 {
			statsBody.FetchLimit = 6000
		}
		page := body.Page
		if page <= 0 {
			page = 1
		}
		pageSize := body.PageSize
		if pageSize <= 0 {
			pageSize = 25
		}
		if pageSize > 200 {
			pageSize = 200
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
		scope := vmlogSummaryScope(category)
		summary := vmlogSummarizeRows(scope, matched)
		sort.SliceStable(matched, func(i, j int) bool {
			ti, okI := parseRowTime(matched[i])
			tj, okJ := parseRowTime(matched[j])
			if okI && okJ {
				return ti.After(tj)
			}
			if okI != okJ {
				return okI
			}
			return false
		})
		totalMatched := len(matched)
		startIdx := (page - 1) * pageSize
		if startIdx > totalMatched {
			startIdx = totalMatched
		}
		endIdx := startIdx + pageSize
		if endIdx > totalMatched {
			endIdx = totalMatched
		}
		pageRows := matched[startIdx:endIdx]
		rows := make([]gin.H, 0, len(pageRows))
		for _, row := range pageRows {
			rows = append(rows, vmlogBuildDetailRow(scope, row))
		}
		c.JSON(http.StatusOK, gin.H{
			"scope":         scope,
			"category":      category,
			"k8sNamespace":  strings.TrimSpace(body.K8sNamespace),
			"k8sPodName":    strings.TrimSpace(body.K8sPodName),
			"keyword":       strings.TrimSpace(body.Keyword),
			"keywordField":  strings.TrimSpace(body.KeywordField),
			"windowMinutes": win,
			"windowStart":   startT.Format(time.RFC3339Nano),
			"windowEnd":     endT.Format(time.RFC3339Nano),
			"refreshedAt":   endT.Format(time.RFC3339Nano),
			"totalFetched":  totalFetched,
			"totalMatched":  totalMatched,
			"page":          page,
			"pageSize":      pageSize,
			"hasMore":       endIdx < totalMatched,
			"truncated":     truncated,
			"scanWarning":   scanWarn,
			"summary":       summary,
			"rows":          rows,
		})
	}
}

func rowJSONLower(row map[string]any) string {
	b, err := json.Marshal(row)
	if err != nil {
		return ""
	}
	return strings.ToLower(string(b))
}

func rowValueByPath(row map[string]any, path string) string {
	path = strings.TrimSpace(path)
	if path == "" || row == nil {
		return ""
	}
	if v, ok := row[path]; ok {
		s := strings.TrimSpace(fmt.Sprint(v))
		if s != "" && s != "<nil>" {
			return s
		}
	}
	parts := strings.Split(path, ".")
	var cur any = row
	for _, part := range parts {
		m, ok := cur.(map[string]any)
		if !ok {
			return ""
		}
		cur, ok = m[part]
		if !ok {
			return ""
		}
	}
	s := strings.TrimSpace(fmt.Sprint(cur))
	if s == "<nil>" {
		return ""
	}
	return s
}

func logsQLQuoteValue(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return `"` + s + `"`
}

func rowKeywordFieldValue(row map[string]any, field string) string {
	switch strings.TrimSpace(strings.ToLower(field)) {
	case "", "any", "all":
		return rowJSONLower(row)
	case "_msg", "msg", "message":
		return vmlogRowMsg(row)
	case "namespace", "k8s_namespace", "kubernetes.namespace_name":
		return k8sNamespaceFromRow(row)
	case "pod", "pod_name", "kubernetes.pod_name", "kubernetes_pod_name":
		return k8sPodNameFromRow(row)
	case "source":
		return vmlogRowSourceKey(row)
	case "filename":
		return rowValueByPath(row, "filename")
	case "host":
		if s := rowValueByPath(row, "host"); s != "" {
			return s
		}
		return rowValueByPath(row, "hostname")
	case "job":
		return rowValueByPath(row, "job")
	case "vm_host":
		return rowValueByPath(row, "vm_host")
	case "log_source":
		return rowValueByPath(row, "log_source")
	default:
		if s := rowValueByPath(row, field); s != "" {
			return s
		}
		return rowJSONLower(row)
	}
}

func rowContainsKeyword(row map[string]any, kw, field string) bool {
	k := strings.ToLower(strings.TrimSpace(kw))
	if k == "" {
		return true
	}
	return strings.Contains(strings.ToLower(rowKeywordFieldValue(row, field)), k)
}

type vmLogHitsSeries struct {
	Fields     map[string]string `json:"fields"`
	Timestamps []string          `json:"timestamps"`
	Values     []float64         `json:"values"`
	Total      float64           `json:"total"`
}

type vmLogHitsResponse struct {
	Hits []vmLogHitsSeries `json:"hits"`
}

func vmlogTrendCacheKey(query, start, end, step string) string {
	sum := sha256.Sum256([]byte("vmlog-trend-v1\x00" + query + "\x00" + start + "\x00" + end + "\x00" + step))
	return "kubebt:vmlog:trend:" + hex.EncodeToString(sum[:])
}

func fetchVictoriaLogsHits(ctx context.Context, cfg Config, baseRaw, query, start, end, step string) (*vmLogHitsResponse, error) {
	base := normalizeVictoriaLogsBase(baseRaw)
	if base == "" {
		return nil, fmt.Errorf("VictoriaLogs 根地址未配置")
	}
	u, err := url.Parse(base + "/select/logsql/hits")
	if err != nil {
		return nil, fmt.Errorf("VictoriaLogs 地址无效")
	}
	form := url.Values{}
	form.Set("query", query)
	form.Set("start", start)
	form.Set("end", end)
	form.Set("step", step)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := vmlogHTTPClient(cfg).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		slurp, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("VictoriaLogs HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(slurp)))
	}
	var out vmLogHitsResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

func k8sNamespaceFromRow(row map[string]any) string {
	keys := []string{"kubernetes.namespace_name", "kubernetes_namespace_name", "k8s.namespace_name"}
	for _, key := range keys {
		if v, ok := row[key]; ok {
			s := strings.TrimSpace(fmt.Sprint(v))
			if s != "" {
				return s
			}
		}
	}
	if m, ok := row["kubernetes"].(map[string]any); ok {
		if v, ok := m["namespace_name"]; ok {
			return strings.TrimSpace(fmt.Sprint(v))
		}
	}
	return ""
}

func k8sPodNameFromRow(row map[string]any) string {
	keys := []string{"kubernetes.pod_name", "kubernetes_pod_name", "pod_name", "pod"}
	for _, key := range keys {
		if v, ok := row[key]; ok {
			s := strings.TrimSpace(fmt.Sprint(v))
			if s != "" && s != "<nil>" {
				return s
			}
		}
	}
	if m, ok := row["kubernetes"].(map[string]any); ok {
		if v, ok := m["pod_name"]; ok {
			s := strings.TrimSpace(fmt.Sprint(v))
			if s != "" && s != "<nil>" {
				return s
			}
		}
	}
	return ""
}

const (
	vmlogPreviewFieldValMaxRunes = 8000
	vmlogPreviewFieldMaxPairs    = 128
)

func stringifyVmlogPreviewValue(v any) string {
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return strings.TrimSpace(x)
	case map[string]any:
		b, err := json.Marshal(x)
		if err != nil {
			return strings.TrimSpace(fmt.Sprint(v))
		}
		return strings.TrimSpace(string(b))
	case []any:
		b, err := json.Marshal(x)
		if err != nil {
			return strings.TrimSpace(fmt.Sprint(v))
		}
		return strings.TrimSpace(string(b))
	case json.Number:
		return x.String()
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func truncateRunesPreview(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "…"
}

// buildVmlogRecentDetailFields 汇总 VictoriaLogs 行中的 _time、_stream、kubernetes.* 等，供前端「详细字段」展示（_msg 仍在消息列）。
func buildVmlogRecentDetailFields(row map[string]any) []gin.H {
	if row == nil {
		return nil
	}
	type pair struct {
		k, v string
	}
	var list []pair
	seen := map[string]struct{}{}
	add := func(k, v string) {
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		if k == "" || v == "" {
			return
		}
		if _, ok := seen[k]; ok {
			return
		}
		seen[k] = struct{}{}
		v = truncateRunesPreview(v, vmlogPreviewFieldValMaxRunes)
		list = append(list, pair{k: k, v: v})
	}

	for _, k := range []string{"_time", "_stream", "_stream_id"} {
		if v, ok := row[k]; ok {
			add(k, stringifyVmlogPreviewValue(v))
		}
	}

	var k8sFlat []string
	for k := range row {
		if strings.HasPrefix(k, "kubernetes.") {
			k8sFlat = append(k8sFlat, k)
		}
	}
	sort.Strings(k8sFlat)
	for _, k := range k8sFlat {
		if v, ok := row[k]; ok {
			add(k, stringifyVmlogPreviewValue(v))
		}
	}

	if m, ok := row["kubernetes"].(map[string]any); ok {
		var sub []string
		for k := range m {
			sub = append(sub, k)
		}
		sort.Strings(sub)
		for _, k := range sub {
			full := "kubernetes." + k
			if _, ok := seen[full]; ok {
				continue
			}
			add(full, stringifyVmlogPreviewValue(m[k]))
		}
	}

	for _, item := range []struct {
		key string
		val string
	}{
		{"filename", rowValueByPath(row, "filename")},
		{"host", rowKeywordFieldValue(row, "host")},
		{"job", rowValueByPath(row, "job")},
		{"vm_host", rowValueByPath(row, "vm_host")},
		{"log_source", rowValueByPath(row, "log_source")},
		{"stream", rowValueByPath(row, "stream")},
	} {
		if item.val == "" {
			continue
		}
		add(item.key, item.val)
	}

	skipTop := map[string]struct{}{
		"_msg": {}, "_time": {}, "_stream": {}, "_stream_id": {}, "kubernetes": {},
	}
	var rest []string
	for k := range row {
		if _, ok := skipTop[k]; ok {
			continue
		}
		if strings.HasPrefix(k, "kubernetes.") {
			continue
		}
		if _, ok := seen[k]; ok {
			continue
		}
		rest = append(rest, k)
	}
	sort.Strings(rest)
	for _, k := range rest {
		if v, ok := row[k]; ok {
			add(k, stringifyVmlogPreviewValue(v))
		}
	}

	if len(list) > vmlogPreviewFieldMaxPairs {
		list = list[:vmlogPreviewFieldMaxPairs]
	}
	out := make([]gin.H, 0, len(list))
	for _, p := range list {
		out = append(out, gin.H{"key": p.k, "value": p.v})
	}
	return out
}

func rowMatchesPodFilter(podSubstr string, row map[string]any) bool {
	podSubstr = strings.TrimSpace(podSubstr)
	if podSubstr == "" {
		return true
	}
	pn := strings.ToLower(k8sPodNameFromRow(row))
	return strings.Contains(pn, strings.ToLower(podSubstr))
}

// vmlogRowSourceKey 用于「最近日志」合并：同一 Pod/流 的连续行视为一条多行日志。
func vmlogRowSourceKey(row map[string]any) string {
	for _, k := range []string{
		"kubernetes.pod_name", "kubernetes_pod_name", "pod", "stream",
		"kubernetes.container_name", "kubernetes_container_name", "container",
	} {
		if v, ok := row[k]; ok {
			s := strings.TrimSpace(fmt.Sprint(v))
			if s != "" {
				return s
			}
		}
	}
	if m, ok := row["kubernetes"].(map[string]any); ok {
		for _, sub := range []string{"pod_name", "container_name"} {
			if v, ok := m[sub]; ok {
				s := strings.TrimSpace(fmt.Sprint(v))
				if s != "" {
					return s
				}
			}
		}
	}
	if v, ok := row["_stream"]; ok {
		return strings.TrimSpace(fmt.Sprint(v))
	}
	return ""
}

func vmlogRowMsg(row map[string]any) string {
	if m, ok := row["_msg"].(string); ok {
		return m
	}
	return ""
}

func vmlogCloneRowShallow(row map[string]any) map[string]any {
	if row == nil {
		return nil
	}
	c := make(map[string]any, len(row)+1)
	for k, v := range row {
		c[k] = v
	}
	return c
}

// mergeAdjacentVmlogRowsForPreview 将时间升序下、同命名空间+同来源且间隔不超过 maxGap 的相邻行合并为一条（_msg 用换行拼接），便于表格阅读多行 stack / JSON。
func mergeAdjacentVmlogRowsForPreview(rows []map[string]any, maxGap time.Duration) []map[string]any {
	if len(rows) == 0 {
		return nil
	}
	sorted := append([]map[string]any(nil), rows...)
	sort.Slice(sorted, func(i, j int) bool {
		ti, ok1 := parseRowTime(sorted[i])
		tj, ok2 := parseRowTime(sorted[j])
		if ok1 && ok2 {
			if ti.Equal(tj) {
				return i < j
			}
			return ti.Before(tj)
		}
		if ok1 != ok2 {
			return ok1 && !ok2
		}
		return i < j
	})
	out := make([]map[string]any, 0, len(sorted))
	for _, row := range sorted {
		msg := vmlogRowMsg(row)
		ns := k8sNamespaceFromRow(row)
		src := vmlogRowSourceKey(row)
		tm, tOK := parseRowTime(row)
		if len(out) == 0 {
			out = append(out, vmlogCloneRowShallow(row))
			continue
		}
		last := out[len(out)-1]
		ltm, ltOK := parseRowTime(last)
		keyOK := ns != "" || src != ""
		if keyOK && ns == k8sNamespaceFromRow(last) && src == vmlogRowSourceKey(last) && tOK && ltOK {
			if d := tm.Sub(ltm); d >= 0 && d <= maxGap {
				prev := vmlogRowMsg(last)
				if prev == "" {
					last["_msg"] = msg
				} else if msg == "" {
					// keep prev
				} else {
					last["_msg"] = prev + "\n" + msg
				}
				continue
			}
		}
		out = append(out, vmlogCloneRowShallow(row))
	}
	return out
}

func rowLooksKubernetes(row map[string]any) bool {
	if k8sNamespaceFromRow(row) != "" {
		return true
	}
	js := rowJSONLower(row)
	return strings.Contains(js, "kubernetes.") || strings.Contains(js, `"pod_name"`) || strings.Contains(js, "container_name")
}

func rowMatchesCategory(category, k8sNamespace string, row map[string]any) bool {
	cat := strings.TrimSpace(strings.ToLower(category))
	if cat == "" {
		cat = "all"
	}
	switch cat {
	case "all":
		return true
	case "kubernetes":
		if !rowLooksKubernetes(row) {
			return false
		}
		ns := strings.TrimSpace(k8sNamespace)
		if ns == "" {
			return true
		}
		return k8sNamespaceFromRow(row) == ns || strings.Contains(rowJSONLower(row), strings.ToLower(ns))
	case "vcenter":
		js := rowJSONLower(row)
		return strings.Contains(js, "vmware") || strings.Contains(js, "esxi") || strings.Contains(js, "vpxa") ||
			strings.Contains(js, "hostd") || strings.Contains(js, "vcenter") || strings.Contains(js, "vsphere")
	case "appcenter":
		js := rowJSONLower(row)
		return strings.Contains(js, "redis") || strings.Contains(js, "openclaw") || strings.Contains(js, "cloud-vm") ||
			strings.Contains(js, "app-center") || strings.Contains(js, "appcenter")
	case "aiinspect":
		js := rowJSONLower(row)
		return strings.Contains(js, "grafana") || strings.Contains(js, "prometheus") || strings.Contains(js, "alertmanager") ||
			strings.Contains(js, "openclaw") || strings.Contains(js, "inspect")
	case "platform":
		js := rowJSONLower(row)
		return strings.Contains(js, "audit") || strings.Contains(js, "login") || strings.Contains(js, "oauth") ||
			strings.Contains(js, "session") || strings.Contains(js, "dashboard")
	case "nginx":
		js := rowJSONLower(row)
		msg := strings.ToLower(vmlogRowMsg(row))
		ok := strings.Contains(js, "nginx") || strings.Contains(js, "wwwlogs") || strings.Contains(js, "access.log") ||
			strings.Contains(js, "baota-nginx") || strings.Contains(msg, `"get `) || strings.Contains(msg, `"post `) ||
			strings.Contains(msg, `"head `) || strings.Contains(msg, "http/1.1\"")
		if !ok {
			return false
		}
		if ns := strings.TrimSpace(k8sNamespace); ns != "" {
			if k8sNamespaceFromRow(row) != ns {
				return false
			}
		}
		return true
	default:
		return true
	}
}

func vmlogBaseQueryForCategory(category, k8sNamespace string) string {
	cat := strings.TrimSpace(strings.ToLower(category))
	ns := strings.TrimSpace(k8sNamespace)
	switch cat {
	case "", "all":
		return "*"
	case "kubernetes":
		if ns != "" {
			return fmt.Sprintf("kubernetes.namespace_name:%s", logsQLQuoteValue(ns))
		}
		return "kubernetes.namespace_name:*"
	case "vcenter":
		return `(vm_host:* OR log_source:* OR host:* OR filename:* OR job:* OR vmware OR esxi OR vcenter OR vsphere OR pyvmomi)`
	case "appcenter":
		return `(redis OR openclaw OR cloud-vm OR app-center OR appcenter)`
	case "aiinspect":
		return `(grafana OR prometheus OR alertmanager OR openclaw OR inspect)`
	case "platform":
		return `(audit OR login OR oauth OR session OR dashboard)`
	case "nginx":
		q := `(log_source:*nginx* OR filename:*nginx* OR filename:*wwwlogs* OR filename:*access* OR _msg:"GET " OR _msg:"POST " OR _msg:"HEAD ")`
		if ns != "" {
			q = "(" + q + ") AND kubernetes.namespace_name:" + logsQLQuoteValue(ns)
		}
		return q
	default:
		return "*"
	}
}

func vmlogKeywordQuery(field, keyword string) string {
	kw := strings.TrimSpace(keyword)
	if kw == "" {
		return ""
	}
	switch strings.TrimSpace(strings.ToLower(field)) {
	case "", "any", "all":
		return logsQLQuoteValue(kw)
	case "_msg", "msg", "message":
		return fmt.Sprintf("_msg:%s", logsQLQuoteValue(kw))
	case "namespace", "k8s_namespace", "kubernetes.namespace_name":
		return fmt.Sprintf("kubernetes.namespace_name:%s", logsQLQuoteValue(kw))
	case "pod", "pod_name", "kubernetes.pod_name", "kubernetes_pod_name":
		return fmt.Sprintf("kubernetes.pod_name:%s", logsQLQuoteValue(kw))
	case "source":
		return fmt.Sprintf("_stream:%s", logsQLQuoteValue(kw))
	case "filename", "host", "job", "vm_host", "log_source", "stream":
		return fmt.Sprintf("%s:%s", strings.TrimSpace(field), logsQLQuoteValue(kw))
	default:
		fieldName := strings.TrimSpace(field)
		if !vmlogFieldNameRE.MatchString(fieldName) {
			return logsQLQuoteValue(kw)
		}
		return fmt.Sprintf("%s:%s", fieldName, logsQLQuoteValue(kw))
	}
}

func buildVmLogQuery(category, k8sNamespace, keyword, keywordField, podName string) string {
	base := vmlogBaseQueryForCategory(category, k8sNamespace)
	kq := vmlogKeywordQuery(keywordField, keyword)
	pod := strings.TrimSpace(podName)
	var podQ string
	if pod != "" {
		podQ = "kubernetes.pod_name:" + logsQLQuoteValue(pod)
	}
	parts := make([]string, 0, 3)
	if strings.TrimSpace(base) != "" && base != "*" {
		parts = append(parts, "("+base+")")
	}
	if kq != "" {
		parts = append(parts, "("+kq+")")
	}
	if podQ != "" {
		parts = append(parts, "("+podQ+")")
	}
	if len(parts) == 0 {
		return "*"
	}
	return strings.Join(parts, " AND ")
}

func parseRowTime(row map[string]any) (time.Time, bool) {
	if v, ok := row["_time"]; ok {
		switch t := v.(type) {
		case float64:
			sec, frac := math.Modf(t)
			ns := int64(frac * 1e9)
			return time.Unix(int64(sec), ns).UTC(), true
		case string:
			s := strings.TrimSpace(t)
			if s == "" {
				break
			}
			if tm, err := time.Parse(time.RFC3339Nano, s); err == nil {
				return tm.UTC(), true
			}
			if tm, err := time.Parse(time.RFC3339, s); err == nil {
				return tm.UTC(), true
			}
			if u, err := strconv.ParseInt(s, 10, 64); err == nil {
				if u > 1e12 {
					return time.UnixMilli(u).UTC(), true
				}
				return time.Unix(u, 0).UTC(), true
			}
		}
	}
	for _, k := range []string{"timestamp", "time", "@timestamp"} {
		if v, ok := row[k]; ok {
			if s, ok := v.(string); ok {
				if tm, err := time.Parse(time.RFC3339Nano, s); err == nil {
					return tm.UTC(), true
				}
			}
		}
	}
	return time.Time{}, false
}

func trimRecentRowsForUI(rows []map[string]any, max int) []map[string]any {
	if len(rows) <= max {
		return rows
	}
	return rows[len(rows)-max:]
}

type opsVmLogStatsBody struct {
	Category      string `json:"category"`
	K8sNamespace  string `json:"k8sNamespace"`
	K8sPodName    string `json:"k8sPodName"`
	Host          string `json:"host"`
	Keyword       string `json:"keyword"`
	KeywordField  string `json:"keywordField"`
	WindowMinutes int    `json:"windowMinutes"`
	BucketMinutes int    `json:"bucketMinutes"`
	FetchLimit    int    `json:"fetchLimit"`
	// StartTime / EndTime 为 RFC3339（可选）；均有效时优先于 windowMinutes，构成绝对时间窗。
	StartTime string `json:"startTime"`
	EndTime   string `json:"endTime"`
}

// vmlogPullMatchedRows 拉取时间窗内日志并按分类/命名空间/关键词过滤，供 stats 与 OpenClaw 分析复用。
func vmlogPullMatchedRows(ctx context.Context, app *ServerApp, body opsVmLogStatsBody) (matched []map[string]any, totalFetched int, truncated bool, scanWarn string, win int, startT, endT time.Time, err error) {
	cfg := app.Cfg()
	base := normalizeVictoriaLogsBase(effectiveVictoriaLogsURL(app.Runtime(), cfg))
	if base == "" {
		return nil, 0, false, "", 0, time.Time{}, time.Time{}, fmt.Errorf("未配置 VictoriaLogs 根地址：请在「Cluster Settings → VictoriaLogs」填写 victoriaLogsUrl")
	}
	retDays := effectiveVictoriaLogsRetentionDays(app.Runtime())
	maxWinMin := retDays * 24 * 60
	if maxWinMin <= 0 {
		maxWinMin = 180 * 24 * 60
	}

	win = body.WindowMinutes
	if win <= 0 {
		win = 60
	}
	if win > maxWinMin {
		win = maxWinMin
	}
	fetchLimit := body.FetchLimit
	if fetchLimit <= 0 {
		fetchLimit = 5000
	}
	if fetchLimit > 12000 {
		fetchLimit = 12000
	}
	endT = time.Now().UTC()
	startT = endT.Add(-time.Duration(win) * time.Minute)
	customStart := strings.TrimSpace(body.StartTime)
	customEnd := strings.TrimSpace(body.EndTime)
	if customStart != "" && customEnd != "" {
		if st, err := time.Parse(time.RFC3339Nano, customStart); err == nil {
			if et, err2 := time.Parse(time.RFC3339Nano, customEnd); err2 == nil {
				su, eu := st.UTC(), et.UTC()
				if !eu.Before(su) {
					now := time.Now().UTC()
					if eu.After(now.Add(5 * time.Minute)) {
						eu = now
					}
					maxSpan := time.Duration(maxWinMin) * time.Minute
					if eu.Sub(su) > maxSpan {
						su = eu.Add(-maxSpan)
					}
					startT, endT = su, eu
					win = int(endT.Sub(startT) / time.Minute)
					if win < 1 {
						win = 1
					}
				}
			}
		}
	}
	startS := startT.Format(time.RFC3339Nano)
	endS := endT.Format(time.RFC3339Nano)

	var rows []map[string]any
	var terr error
	query := buildVmLogQuery(body.Category, body.K8sNamespace, body.Keyword, body.KeywordField, body.K8sPodName)
	if host := strings.TrimSpace(body.Host); host != "" {
		h := logsQLQuoteValue(host)
		hostQuery := fmt.Sprintf("(vm_host:%s OR host:%s OR hostname:%s OR kubernetes.node_name:%s)", h, h, h, h)
		if query == "*" {
			query = hostQuery
		} else {
			query = "(" + query + ") AND " + hostQuery
		}
	}
	rows, truncated, scanWarn, _, terr = fetchVictoriaLogsNDJSON(ctx, cfg, base, query, fetchLimit, startS, endS)
	if terr != nil {
		return nil, 0, false, "", win, startT, endT, terr
	}
	totalFetched = len(rows)
	cat := strings.TrimSpace(body.Category)
	if cat == "" {
		cat = "all"
	}
	k8sNs := strings.TrimSpace(body.K8sNamespace)
	kw := body.Keyword
	kwField := body.KeywordField
	podF := strings.TrimSpace(body.K8sPodName)

	for _, row := range rows {
		if !rowMatchesCategory(cat, k8sNs, row) {
			continue
		}
		if !rowContainsKeyword(row, kw, kwField) {
			continue
		}
		if !rowMatchesPodFilter(podF, row) {
			continue
		}
		matched = append(matched, row)
	}
	return matched, totalFetched, truncated, scanWarn, win, startT, endT, nil
}

func handleOpsVmLogStats(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsVmLogStatsBody
		_ = c.ShouldBindJSON(&body)
		bucketMin := body.BucketMinutes
		if bucketMin <= 0 {
			bucketMin = 5
		}
		if bucketMin > 120 {
			bucketMin = 120
		}

		matched, totalFetched, truncated, scanWarn, win, startT, endT, err := vmlogPullMatchedRows(c.Request.Context(), app, body)
		if err != nil {
			if strings.Contains(err.Error(), "未配置") {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		cat := strings.TrimSpace(body.Category)
		if cat == "" {
			cat = "all"
		}
		k8sNs := strings.TrimSpace(body.K8sNamespace)
		kw := body.Keyword
		kwField := strings.TrimSpace(body.KeywordField)
		if kwField == "" {
			kwField = "any"
		}
		podName := strings.TrimSpace(body.K8sPodName)

		actualBucketMin := bucketMin
		step := fmt.Sprintf("%dm", bucketMin)
		if win >= 10080 && bucketMin < 60 {
			step = "1h"
			actualBucketMin = 60
		}
		query := buildVmLogQuery(cat, k8sNs, kw, kwField, podName)
		base := normalizeVictoriaLogsBase(effectiveVictoriaLogsURL(app.Runtime(), app.Cfg()))
		startS := startT.Format(time.RFC3339Nano)
		endS := endT.Format(time.RFC3339Nano)
		var hits *vmLogHitsResponse
		if key := vmlogTrendCacheKey(query, startS, endS, step); key != "" {
			if app.Redis() != nil {
				if raw, ok := prometheusCacheGet(c.Request.Context(), app.Redis(), key); ok && len(raw) > 0 {
					var cached vmLogHitsResponse
					if err := json.Unmarshal(raw, &cached); err == nil {
						hits = &cached
					}
				}
			}
			if hits == nil {
				fetched, err := fetchVictoriaLogsHits(c.Request.Context(), app.Cfg(), base, query, startS, endS, step)
				if err != nil {
					c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
					return
				}
				hits = fetched
				if app.Redis() != nil && hits != nil {
					if raw, err := json.Marshal(hits); err == nil {
						_ = app.Redis().Set(c.Request.Context(), key, raw, vmlogTrendCacheTTL)
					}
				}
			}
		}

		buckets := make([]gin.H, 0, 256)
		timeOK := 0
		totalMatchedAccurate := len(matched)
		if hits != nil && len(hits.Hits) > 0 {
			totalMatchedAccurate = 0
			for _, series := range hits.Hits {
				totalMatchedAccurate += int(math.Round(series.Total))
				for i := 0; i < len(series.Timestamps) && i < len(series.Values); i++ {
					ts, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(series.Timestamps[i]))
					if err != nil {
						if ts2, err2 := time.Parse(time.RFC3339, strings.TrimSpace(series.Timestamps[i])); err2 == nil {
							ts = ts2
						} else {
							continue
						}
					}
					timeOK++
					buckets = append(buckets, gin.H{
						"ts":    ts.Unix(),
						"label": ts.Format("01-02 15:04"),
						"count": int(math.Round(series.Values[i])),
					})
				}
			}
		}
		sort.Slice(buckets, func(i, j int) bool {
			return buckets[i]["ts"].(int64) < buckets[j]["ts"].(int64)
		})

		nginxAgg := vmlogAggregateNginxStyle(matched, 15, effectiveGeoLiteCountryMMDB(app.Runtime(), app.Cfg()))

		merged := mergeAdjacentVmlogRowsForPreview(matched, 10*time.Second)
		recent := trimRecentRowsForUI(merged, 50)
		preview := make([]gin.H, 0, len(recent))
		const msgMaxRunes = 12000
		for _, row := range recent {
			p := gin.H{}
			if tm, ok := parseRowTime(row); ok {
				p["time"] = tm.Format(time.RFC3339)
			}
			if m, ok := row["_msg"].(string); ok {
				s := m
				if len([]rune(s)) > msgMaxRunes {
					rs := []rune(s)
					s = string(rs[:msgMaxRunes]) + "…"
				}
				p["msg"] = s
			}
			if ns := k8sNamespaceFromRow(row); ns != "" {
				p["namespace"] = ns
			}
			if sk := vmlogRowSourceKey(row); sk != "" {
				p["source"] = sk
			}
			if pod := k8sPodNameFromRow(row); pod != "" {
				p["pod"] = pod
			}
			if fields := buildVmlogRecentDetailFields(row); len(fields) > 0 {
				p["fields"] = fields
			}
			preview = append(preview, p)
		}

		c.JSON(http.StatusOK, gin.H{
			"category":      cat,
			"k8sNamespace":  k8sNs,
			"k8sPodName":    podName,
			"keyword":       kw,
			"keywordField":  kwField,
			"windowMinutes": win,
			"windowStart":   startT.Format(time.RFC3339Nano),
			"windowEnd":     endT.Format(time.RFC3339Nano),
			"bucketMinutes": actualBucketMin,
			"refreshedAt":   endT.Format(time.RFC3339Nano),
			"totalFetched":  totalFetched,
			"totalMatched":  totalMatchedAccurate,
			"matchedWithTs": timeOK,
			"truncated":     truncated,
			"scanWarning":   scanWarn,
			"summary":       vmlogSummarizeRows(vmlogSummaryScope(cat), matched),
			"buckets":       buckets,
			"recent":        preview,
			"nginxAgg":      nginxAgg,
		})
	}
}
