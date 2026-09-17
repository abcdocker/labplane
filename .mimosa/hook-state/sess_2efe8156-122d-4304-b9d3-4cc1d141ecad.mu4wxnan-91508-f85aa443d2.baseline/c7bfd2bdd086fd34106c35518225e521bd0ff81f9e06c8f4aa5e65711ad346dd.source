package internal

import (
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type opsVmLogSearchBody struct {
	Source        string `json:"source"`
	Keyword       string `json:"keyword"`
	KeywordField  string `json:"keywordField"`
	Level         string `json:"level"`
	Host          string `json:"host"`
	K8sNamespace  string `json:"k8sNamespace"`
	K8sPodName    string `json:"k8sPodName"`
	WindowMinutes int    `json:"windowMinutes"`
	FetchLimit    int    `json:"fetchLimit"`
	StartTime     string `json:"startTime"`
	EndTime       string `json:"endTime"`
	Page          int    `json:"page"`
	PageSize      int    `json:"pageSize"`
}

func normalizeVmLogQuerySource(source string) string {
	source = strings.TrimSpace(strings.ToLower(source))
	switch source {
	case "container", "kubernetes":
		return "kubernetes"
	case "virtual_machine", "virtual-machine", "vm", "vcenter":
		return "vcenter"
	case "application", "appcenter":
		return "appcenter"
	case "nginx", "aiinspect", "platform":
		return source
	default:
		return "all"
	}
}

func vmlogSearchFieldStats(rows []map[string]any) []gin.H {
	stats := make([]gin.H, 0, len(vmLogSearchFields()))
	for _, field := range vmLogSearchFields() {
		if field.ID == "any" || field.ID == "__custom__" {
			continue
		}
		values := map[string]int{}
		count := 0
		for _, row := range rows {
			value := strings.TrimSpace(rowKeywordFieldValue(row, field.ID))
			if value == "" {
				continue
			}
			count++
			if field.ID != "_msg" {
				if len([]rune(value)) > 100 {
					value = string([]rune(value)[:100]) + "…"
				}
				values[value]++
			}
		}
		if count == 0 {
			continue
		}
		type valueCount struct {
			Value string
			Count int
		}
		top := make([]valueCount, 0, len(values))
		for value, n := range values {
			top = append(top, valueCount{Value: value, Count: n})
		}
		sort.Slice(top, func(i, j int) bool {
			if top[i].Count == top[j].Count {
				return top[i].Value < top[j].Value
			}
			return top[i].Count > top[j].Count
		})
		if len(top) > 5 {
			top = top[:5]
		}
		topValues := make([]gin.H, 0, len(top))
		for _, item := range top {
			topValues = append(topValues, gin.H{"value": item.Value, "count": item.Count})
		}
		stats = append(stats, gin.H{
			"id":        field.ID,
			"label":     field.Label,
			"group":     field.Group,
			"count":     count,
			"topValues": topValues,
		})
	}
	return stats
}

func vmlogRowHost(row map[string]any) string {
	for _, field := range []string{"vm_host", "host", "hostname", "kubernetes.node_name"} {
		if value := strings.TrimSpace(rowKeywordFieldValue(row, field)); value != "" {
			return value
		}
	}
	return ""
}

func vmlogMatchesLevel(scope, level string, row map[string]any) bool {
	level = strings.TrimSpace(strings.ToLower(level))
	if level == "" || level == "all" {
		return true
	}
	status := vmlogAssessRow(scope, row).Status
	switch level {
	case "error":
		return status == "fail"
	case "warn":
		return status == "warn"
	case "ok":
		return status == "ok"
	default:
		return true
	}
}

func handleOpsVmLogSearch(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsVmLogSearchBody
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		source := normalizeVmLogQuerySource(body.Source)
		page := body.Page
		if page < 1 {
			page = 1
		}
		pageSize := body.PageSize
		if pageSize <= 0 {
			pageSize = 50
		}
		if pageSize > 200 {
			pageSize = 200
		}
		fetchLimit := body.FetchLimit
		if fetchLimit <= 0 {
			fetchLimit = 6000
		}

		matched, totalFetched, truncated, scanWarn, win, startT, endT, err := vmlogPullMatchedRows(
			c.Request.Context(),
			app,
			opsVmLogStatsBody{
				Category:      source,
				K8sNamespace:  strings.TrimSpace(body.K8sNamespace),
				K8sPodName:    strings.TrimSpace(body.K8sPodName),
				Host:          strings.TrimSpace(body.Host),
				Keyword:       strings.TrimSpace(body.Keyword),
				KeywordField:  strings.TrimSpace(body.KeywordField),
				WindowMinutes: body.WindowMinutes,
				FetchLimit:    fetchLimit,
				StartTime:     body.StartTime,
				EndTime:       body.EndTime,
			},
		)
		if err != nil {
			if strings.Contains(err.Error(), "未配置") {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}

		scope := vmlogSummaryScope(source)
		hostFilter := strings.ToLower(strings.TrimSpace(body.Host))
		filtered := make([]map[string]any, 0, len(matched))
		levelCounts := map[string]int{"error": 0, "warn": 0, "ok": 0}
		for _, row := range matched {
			if hostFilter != "" && !strings.Contains(strings.ToLower(vmlogRowHost(row)), hostFilter) {
				continue
			}
			switch vmlogAssessRow(scope, row).Status {
			case "fail":
				levelCounts["error"]++
			case "warn":
				levelCounts["warn"]++
			default:
				levelCounts["ok"]++
			}
			if vmlogMatchesLevel(scope, body.Level, row) {
				filtered = append(filtered, row)
			}
		}

		sort.SliceStable(filtered, func(i, j int) bool {
			ti, okI := parseRowTime(filtered[i])
			tj, okJ := parseRowTime(filtered[j])
			if okI && okJ {
				return ti.After(tj)
			}
			return okI && !okJ
		})

		totalMatched := len(filtered)
		startIdx := (page - 1) * pageSize
		if startIdx > totalMatched {
			startIdx = totalMatched
		}
		endIdx := startIdx + pageSize
		if endIdx > totalMatched {
			endIdx = totalMatched
		}

		rows := make([]gin.H, 0, endIdx-startIdx)
		for _, raw := range filtered[startIdx:endIdx] {
			row := vmlogBuildDetailRow(scope, raw)
			row["host"] = vmlogRowHost(raw)
			row["logSource"] = rowValueByPath(raw, "log_source")
			rows = append(rows, row)
		}

		c.JSON(http.StatusOK, gin.H{
			"source":          source,
			"requestedSource": strings.TrimSpace(body.Source),
			"level":           strings.TrimSpace(body.Level),
			"windowMinutes":   win,
			"windowStart":     startT.Format(time.RFC3339Nano),
			"windowEnd":       endT.Format(time.RFC3339Nano),
			"refreshedAt":     endT.Format(time.RFC3339Nano),
			"totalFetched":    totalFetched,
			"totalMatched":    totalMatched,
			"page":            page,
			"pageSize":        pageSize,
			"hasMore":         endIdx < totalMatched,
			"truncated":       truncated,
			"scanWarning":     scanWarn,
			"levelCounts":     levelCounts,
			"fieldStats":      vmlogSearchFieldStats(filtered),
			"summary":         vmlogSummarizeRows(scope, filtered),
			"rows":            rows,
		})
	}
}
