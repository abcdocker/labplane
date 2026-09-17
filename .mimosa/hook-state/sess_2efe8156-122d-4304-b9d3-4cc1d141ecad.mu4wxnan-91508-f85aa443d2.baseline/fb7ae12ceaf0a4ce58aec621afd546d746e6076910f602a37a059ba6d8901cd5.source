package internal

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
)

var harborCacheHits atomic.Int64
var harborCacheMisses atomic.Int64
var harborProxyCalls atomic.Int64

func harborIncCacheHit() { harborCacheHits.Add(1) }
func harborIncCacheMiss() {
	harborCacheMisses.Add(1)
}
func harborIncProxyCall() { harborProxyCalls.Add(1) }

// HarborProxyLogEntry 控制台经本平台访问 Harbor API 的最近记录（进程内，重启清空）。
type HarborProxyLogEntry struct {
	Ts         string `json:"ts"`
	User       string `json:"user,omitempty"`
	IP         string `json:"ip,omitempty"`
	Method     string `json:"method,omitempty"`
	APIRoute   string `json:"apiRoute,omitempty"`
	HarborPath string `json:"harborPath,omitempty"`
	Status     int    `json:"status,omitempty"`
	DurationMs int64  `json:"durationMs,omitempty"`
	FromCache  bool   `json:"fromCache,omitempty"`
	Note       string `json:"note,omitempty"`
}

const harborProxyLogMax = 600

var harborProxyLogMu sync.Mutex
var harborProxyLogRing []HarborProxyLogEntry

func appendHarborProxyLog(e HarborProxyLogEntry) {
	if e.Ts == "" {
		e.Ts = time.Now().UTC().Format(time.RFC3339Nano)
	}
	harborProxyLogMu.Lock()
	defer harborProxyLogMu.Unlock()
	harborProxyLogRing = append(harborProxyLogRing, e)
	if len(harborProxyLogRing) > harborProxyLogMax {
		harborProxyLogRing = harborProxyLogRing[len(harborProxyLogRing)-harborProxyLogMax:]
	}
}

func harborProxyLogSnapshotNewestFirst(limit int) []HarborProxyLogEntry {
	if limit <= 0 {
		limit = 100
	}
	if limit > harborProxyLogMax {
		limit = harborProxyLogMax
	}
	harborProxyLogMu.Lock()
	defer harborProxyLogMu.Unlock()
	n := len(harborProxyLogRing)
	if n == 0 {
		return nil
	}
	start := n - limit
	if start < 0 {
		start = 0
	}
	slice := harborProxyLogRing[start:n]
	out := make([]HarborProxyLogEntry, len(slice))
	for i := range slice {
		out[len(slice)-1-i] = slice[i]
	}
	return out
}

func recordHarborProxyAccess(app *ServerApp, c *gin.Context, apiRoute, harborPath string, status int, d time.Duration, fromCache bool, note string) {
	harborIncProxyCall()
	cfg := app.Cfg()
	ip := AuditClientIP(c, cfg)
	if len(harborPath) > 480 {
		harborPath = harborPath[:480] + "…"
	}
	note = strings.TrimSpace(note)
	if len(note) > 200 {
		note = note[:200] + "…"
	}
	appendHarborProxyLog(HarborProxyLogEntry{
		User:       dashboardUsernameFromGin(c),
		IP:         ip,
		Method:     http.MethodGet,
		APIRoute:   apiRoute,
		HarborPath: harborPath,
		Status:     status,
		DurationMs: d.Milliseconds(),
		FromCache:  fromCache,
		Note:       note,
	})
}

func handleGetHarborAdminDashboard(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		gen := int64(0)
		if rdb := app.Redis(); rdb != nil {
			gen = harborCacheGenRead(ctx, rdb, cfg)
		}
		cancel()

		ttlSec := harborListCacheTTLSec()
		rdbOK := app.Redis() != nil
		out := gin.H{
			"platform": gin.H{
				"harborProxyCalls":       harborProxyCalls.Load(),
				"cacheHits":              harborCacheHits.Load(),
				"cacheMisses":            harborCacheMisses.Load(),
				"cacheTtlSec":            ttlSec,
				"cacheMaxBodyMB":         harborListCacheMaxBodyMB(),
				"harborListCacheEnabled": rdbOK && ttlSec > 0,
				"redisAvailable":         rdbOK,
				"cacheGeneration":        gen,
				"harborConfigured":       harborConfiguredFromCfg(cfg),
			},
			"remoteStatistics": nil,
			"remoteError":      "",
			"logs":             harborProxyLogSnapshotNewestFirst(120),
		}

		if !harborConfiguredFromCfg(cfg) {
			c.JSON(http.StatusOK, out)
			return
		}

		infoCtx, infoCancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		sys := harborFetchSystemInfoMap(infoCtx, cfg)
		infoCancel()
		if ui := strings.TrimSpace(harborResolvePublicUIURL(cfg, sys)); ui != "" {
			out["harborUiUrl"] = ui
		}

		statCtx, statCancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
		defer statCancel()
		b, code, err := harborGETStatisticsCached(statCtx, app, nil)
		if err != nil {
			out["remoteError"] = err.Error()
		} else if code == http.StatusOK {
			if len(b) > 0 {
				var stat map[string]interface{}
				if json.Unmarshal(harborStatisticsPrunedJSONBody(b), &stat) == nil {
					out["remoteStatistics"] = stat
				}
			}
		} else if code == http.StatusUnauthorized || code == http.StatusForbidden {
			if fb, ferr := harborStatisticsAggregateFromProjects(statCtx, cfg); ferr == nil {
				out["remoteStatistics"] = fb
				out["remoteStatisticsFallback"] = true
				out["remoteError"] = ""
			} else {
				out["remoteError"] = strings.TrimSpace(string(b))
				if out["remoteError"] == "" {
					out["remoteError"] = "HTTP " + strconv.Itoa(code)
				}
			}
		} else {
			out["remoteError"] = strings.TrimSpace(string(b))
			if out["remoteError"] == "" {
				out["remoteError"] = "HTTP " + strconv.Itoa(code)
			}
		}
		c.JSON(http.StatusOK, out)
	}
}
