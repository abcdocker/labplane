package internal

import (
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// 进程内站点访问统计（重启清零）；与 audit.jsonl 互补。
var siteStatsMu sync.Mutex
var (
	siteTotalReq int64
	siteByPath   = map[string]int64{}
	siteByIP     = map[string]int64{}
	siteLoginFailByIP = map[string]int64{}
	siteStarted  = time.Now().UTC()
)

const siteStatsMaxKeys = 8000

// RecordSiteAccess 记录一次 HTTP 访问（路径与客户端 IP）。
func RecordSiteAccess(path, ip string) {
	if path == "" {
		path = "/"
	}
	if len(path) > 600 {
		path = path[:600]
	}
	siteStatsMu.Lock()
	defer siteStatsMu.Unlock()
	siteTotalReq++
	siteByPath[path]++
	if ip != "" {
		siteByIP[ip]++
	}
	trimMapsLocked()
}

// RecordLoginFailForStats 登录失败按 IP 计数（与 audit 中 login_fail 一致，便于铃铛侧统计）。
func RecordLoginFailForStats(ip string) {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return
	}
	siteStatsMu.Lock()
	defer siteStatsMu.Unlock()
	siteLoginFailByIP[ip]++
	if len(siteLoginFailByIP) > siteStatsMaxKeys {
		siteLoginFailByIP = trimTopNLocked(siteLoginFailByIP, siteStatsMaxKeys/2)
	}
}

func trimMapsLocked() {
	if len(siteByPath) <= siteStatsMaxKeys && len(siteByIP) <= siteStatsMaxKeys && len(siteLoginFailByIP) <= siteStatsMaxKeys {
		return
	}
	// 简单裁剪：按计数保留 top
	siteByPath = trimTopNLocked(siteByPath, siteStatsMaxKeys/2)
	siteByIP = trimTopNLocked(siteByIP, siteStatsMaxKeys/2)
	siteLoginFailByIP = trimTopNLocked(siteLoginFailByIP, siteStatsMaxKeys/2)
}

func trimTopNLocked(m map[string]int64, keep int) map[string]int64 {
	type kv struct {
		k string
		v int64
	}
	arr := make([]kv, 0, len(m))
	for k, v := range m {
		arr = append(arr, kv{k, v})
	}
	sort.Slice(arr, func(i, j int) bool {
		if arr[i].v == arr[j].v {
			return arr[i].k < arr[j].k
		}
		return arr[i].v > arr[j].v
	})
	if len(arr) > keep {
		arr = arr[:keep]
	}
	out := make(map[string]int64, len(arr))
	for _, e := range arr {
		out[e.k] = e.v
	}
	return out
}

type pathCount struct {
	Path  string `json:"path"`
	Count int64  `json:"count"`
}

type ipCount struct {
	IP    string `json:"ip"`
	Count int64  `json:"count"`
}

func topPathCounts(n int) []pathCount {
	siteStatsMu.Lock()
	defer siteStatsMu.Unlock()
	type kv struct {
		k string
		v int64
	}
	arr := make([]kv, 0, len(siteByPath))
	for k, v := range siteByPath {
		arr = append(arr, kv{k, v})
	}
	sort.Slice(arr, func(i, j int) bool {
		if arr[i].v == arr[j].v {
			return arr[i].k < arr[j].k
		}
		return arr[i].v > arr[j].v
	})
	if len(arr) > n {
		arr = arr[:n]
	}
	out := make([]pathCount, 0, len(arr))
	for _, e := range arr {
		out = append(out, pathCount{Path: e.k, Count: e.v})
	}
	return out
}

func topIPCounts(m map[string]int64, n int) []ipCount {
	siteStatsMu.Lock()
	defer siteStatsMu.Unlock()
	type kv struct {
		k string
		v int64
	}
	arr := make([]kv, 0, len(m))
	for k, v := range m {
		arr = append(arr, kv{k, v})
	}
	sort.Slice(arr, func(i, j int) bool {
		if arr[i].v == arr[j].v {
			return arr[i].k < arr[j].k
		}
		return arr[i].v > arr[j].v
	})
	if len(arr) > n {
		arr = arr[:n]
	}
	out := make([]ipCount, 0, len(arr))
	for _, e := range arr {
		out = append(out, ipCount{IP: e.k, Count: e.v})
	}
	return out
}

func handleGetSiteStats(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		siteStatsMu.Lock()
		total := siteTotalReq
		started := siteStarted
		nLoginIP := len(siteLoginFailByIP)
		siteStatsMu.Unlock()
		c.JSON(http.StatusOK, gin.H{
			"startedAt":         started.Format(time.RFC3339Nano),
			"totalHttpRequests": total,
			"topPaths":          topPathCounts(30),
			"topClientIPs":      topIPCounts(siteByIP, 30),
			"loginFailsByIP":    topIPCounts(siteLoginFailByIP, 30),
			"totalLoginFailIPs": nLoginIP,
			"note":              "进程内自启动以来统计，服务重启后清零；与审计文件互补。",
		})
	}
}

func handleGetAuditSummary(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		path := auditFilePath(app.DataDir())
		var size int64
		if fi, err := os.Stat(path); err == nil {
			size = fi.Size()
		}
		c.JSON(http.StatusOK, gin.H{
			"activeSessionNonceCount": CountActiveSessionNonces(app),
			"auditRetentionDays":      auditRetentionDays,
			"auditFileBytes":          size,
			"auditFilePath":           path,
		})
	}
}
