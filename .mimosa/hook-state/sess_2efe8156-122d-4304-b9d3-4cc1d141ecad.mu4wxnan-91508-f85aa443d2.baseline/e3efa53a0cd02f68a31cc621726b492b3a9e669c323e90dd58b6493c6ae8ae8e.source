package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const maxVCenterMetricNames = 200

var (
	reSafeJob   = regexp.MustCompile(`^[a-zA-Z0-9_.-]+$`)
	reSafePromM = regexp.MustCompile(`^[a-zA-Z_:][a-zA-Z0-9_:]*$`)
)

func jobNameSafe(s string) bool {
	return reSafeJob.MatchString(s)
}

func metricNameSafe(s string) bool {
	return reSafePromM.MatchString(s)
}

func promEscapeLabelValue(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `"`, `\"`)
}

func redisVCenterPromMetricsKey(cfg Config, job string) string {
	p := strings.TrimSpace(cfg.RedisKeyPrefix)
	if p != "" && !strings.HasSuffix(p, ":") {
		p += ":"
	}
	return p + "vcenter-prom-metrics:" + strings.TrimSpace(job)
}

const vcenterPromMetricsCacheTTL = 10 * time.Minute

// InvalidateVCenterPrometheusCache 配置重载后清空 vCenter Prometheus 指标快照缓存。
func InvalidateVCenterPrometheusCache(ctx context.Context, app *ServerApp) {
	rdb := app.Redis()
	if rdb == nil {
		return
	}
	cfg := app.Cfg()
	_ = rdb.Del(ctx, redisVCenterPromMetricsKey(cfg, "vmware_vcenter"))
}

// prometheusSeries GET /api/v1/series?match[]=...
func prometheusSeries(ctx context.Context, cfg Config, baseURL, matcher string) ([]map[string]string, error) {
	u, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil {
		return nil, err
	}
	u.Path = strings.TrimSuffix(u.Path, "/") + "/api/v1/series"
	qv := url.Values{}
	qv.Add("match[]", matcher)
	u.RawQuery = qv.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	if tok := strings.TrimSpace(cfg.PrometheusBearerToken); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := prometheusHTTPClient(cfg).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("prometheus series http %d: %s", resp.StatusCode, truncateStr(string(body), 200))
	}
	var wrap struct {
		Status string              `json:"status"`
		Data   []map[string]string `json:"data"`
	}
	if err := json.Unmarshal(body, &wrap); err != nil {
		return nil, err
	}
	if wrap.Status != "success" {
		return nil, fmt.Errorf("prometheus series status: %s", wrap.Status)
	}
	return wrap.Data, nil
}

func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func uniqueMetricNamesFromSeries(series []map[string]string) []string {
	seen := make(map[string]struct{})
	for _, lab := range series {
		n := strings.TrimSpace(lab["__name__"])
		if n != "" {
			seen[n] = struct{}{}
		}
	}
	out := make([]string, 0, len(seen))
	for n := range seen {
		out = append(out, n)
	}
	return out
}

type vcenterMetricRow struct {
	Name  string  `json:"name"`
	Value float64 `json:"value,omitempty"`
	Error string  `json:"error,omitempty"`
	OK    bool    `json:"ok"`
}

// computeVCenterPrometheusMetrics 从 Prometheus 拉取 series 并对各指标做 sum 快照。
func computeVCenterPrometheusMetrics(ctx context.Context, cfg Config, job string) (gin.H, error) {
	base := strings.TrimRight(GetPrometheusURLForScope(cfg, "vcenter"), "/")
	if base == "" {
		return nil, fmt.Errorf("未配置 vCenter 数据源 Prometheus")
	}
	jobs := promEscapeLabelValue(job)
	matcher := fmt.Sprintf(`{job="%s"}`, jobs)
	series, err := prometheusSeries(ctx, cfg, base, matcher)
	if err != nil {
		return nil, err
	}
	discovery := "job"
	if len(series) == 0 {
		series, err = prometheusSeries(ctx, cfg, base, `{__name__=~"vmware_.+"}`)
		if err != nil {
			return nil, err
		}
		discovery = "name_prefix_vmware_"
		if len(series) > 800 {
			series = series[:800]
		}
	}

	names := uniqueMetricNamesFromSeries(series)
	sort.Strings(names)
	if len(names) > maxVCenterMetricNames {
		names = names[:maxVCenterMetricNames]
	}

	out := make([]vcenterMetricRow, len(names))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 10)
	for i, rawName := range names {
		if !metricNameSafe(rawName) {
			out[i] = vcenterMetricRow{Name: rawName, Error: "指标名包含非法字符，已跳过", OK: false}
			continue
		}
		idx := i
		name := rawName
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			q1 := fmt.Sprintf(`sum(%s{job="%s"})`, name, jobs)
			v, err := prometheusInstantScalar(ctx, cfg, base, q1)
			row := vcenterMetricRow{Name: name}
			if err != nil {
				row.Error = err.Error()
				out[idx] = row
				return
			}
			if !math.IsNaN(v) {
				row.Value = v
				row.OK = true
				out[idx] = row
				return
			}
			q2 := fmt.Sprintf(`sum(%s)`, name)
			v2, err2 := prometheusInstantScalar(ctx, cfg, base, q2)
			if err2 != nil {
				row.Error = err2.Error()
				out[idx] = row
				return
			}
			if !math.IsNaN(v2) {
				row.Value = v2
				row.OK = true
			} else {
				row.Error = "无数据（NaN）"
			}
			out[idx] = row
		}()
	}
	wg.Wait()

	okN := 0
	for _, r := range out {
		if r.OK {
			okN++
		}
	}

	return gin.H{
		"job":           job,
		"discovery":     discovery,
		"seriesCount":   len(series),
		"metricCount":   len(names),
		"okCount":       okN,
		"metrics":       out,
		"hint":          "值为对该指标在当前 Prometheus 中的 sum 聚合快照；Histogram/Summary 类指标可能需 histogram_quantile 才有意义。",
		"generatedAt":   time.Now().UTC().Format(time.RFC3339),
		"cacheSource":   "live",
	}, nil
}

// handleVCenterPrometheusMetrics GET /api/vcenter/prometheus-metrics 与 GET /api/prometheus/vcenter-metrics（别名）
func handleVCenterPrometheusMetrics(c *gin.Context, app *ServerApp) {
	cfg := app.Cfg()
	base := strings.TrimRight(GetPrometheusURLForScope(cfg, "vcenter"), "/")
	if base == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未配置 vCenter 数据源 Prometheus（prometheusUrlVcenter 或兜底 prometheusUrl）"})
		return
	}
	job := strings.TrimSpace(c.Query("job"))
	if job == "" {
		job = "vmware_vcenter"
	}
	if !jobNameSafe(job) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "job 仅允许字母数字、_ . -"})
		return
	}

	ctx := c.Request.Context()
	key := redisVCenterPromMetricsKey(cfg, job)
	if rdb := app.Redis(); rdb != nil {
		if s, err := rdb.Get(ctx, key); err == nil && strings.TrimSpace(s) != "" {
			c.Header("X-VCenter-Prom-Cache", "HIT")
			c.Data(http.StatusOK, "application/json", []byte(s))
			return
		}
	}

	c.Header("X-VCenter-Prom-Cache", "MISS")
	runCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	h, err := computeVCenterPrometheusMetrics(runCtx, cfg, job)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	b, err := json.Marshal(h)
	if err != nil {
		RespondAPIError500(c, "序列化失败: " + err.Error())
		return
	}
	if rdb := app.Redis(); rdb != nil {
		if err := rdb.Set(ctx, key, b, vcenterPromMetricsCacheTTL); err != nil {
			log.Printf("vcenter prom metrics 写入 Redis 缓存: %v", err)
		}
	}
	c.Data(http.StatusOK, "application/json", b)
}

// StartVCenterPrometheusMetricsRefresher 每 10 分钟预计算 vmware_vcenter 指标并写入 Redis，页面请求可走缓存。
func StartVCenterPrometheusMetricsRefresher(app *ServerApp) {
	go func() {
		ticker := time.NewTicker(vcenterPromMetricsCacheTTL)
		defer ticker.Stop()
		refresh := func() {
			cfg := app.Cfg()
			if strings.TrimRight(GetPrometheusURLForScope(cfg, "vcenter"), "/") == "" {
				return
			}
			rdb := app.Redis()
			if rdb == nil {
				return
			}
			ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
			defer cancel()
			job := "vmware_vcenter"
			h, err := computeVCenterPrometheusMetrics(ctx, cfg, job)
			if err != nil {
				log.Printf("vcenter prom metrics 后台刷新: %v", err)
				return
			}
			b, err := json.Marshal(h)
			if err != nil {
				return
			}
			_ = rdb.Set(ctx, redisVCenterPromMetricsKey(cfg, job), b, vcenterPromMetricsCacheTTL)
		}
		refresh()
		for range ticker.C {
			refresh()
		}
	}()
}
