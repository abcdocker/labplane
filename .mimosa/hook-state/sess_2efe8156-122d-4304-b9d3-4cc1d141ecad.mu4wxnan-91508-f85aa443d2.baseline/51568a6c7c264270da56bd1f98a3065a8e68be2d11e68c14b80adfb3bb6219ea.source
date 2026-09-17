package internal

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func handleHarborIndexStatus(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		rdb := app.Redis()
		out := gin.H{
			"redisAvailable":           rdb != nil,
			"harborConfigured":         harborConfiguredFromCfg(cfg),
			"intervalSec":              harborIndexIntervalSec(),
			"crawlTimeoutSec":          harborIndexCrawlTimeoutSec(),
			"maxRepoPages":             harborIndexMaxRepoPages(),
			"maxArtifactPages":         harborIndexMaxArtifactPages(),
			"maxProjectPages":          harborIndexMaxProjectPages(),
			"projectConcurrency":       harborIndexProjectConcurrency(),
			"backgroundJobsEnabled":    cfg.EnableBackgroundJobs,
			"entryCount":               0,
			"updatedAt":                "",
			"lastDurationMs":           int64(0),
			"lastError":                "",
			"registryHost":             "",
			"progress":                 nil,
			"syncRunningProcessLocked": harborIndexRunning.Load(),
		}
		if rdb == nil || !harborConfiguredFromCfg(cfg) {
			c.JSON(http.StatusOK, out)
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()
		if prRaw, e2 := rdb.Get(ctx, harborIndexRedisProgressKey(cfg)); e2 == nil && strings.TrimSpace(prRaw) != "" {
			var pr HarborImageIndexProgress
			if json.Unmarshal([]byte(prRaw), &pr) == nil {
				out["progress"] = pr
			}
		}
		metaRaw, err := rdb.Get(ctx, harborIndexRedisMetaKey(cfg))
		if err != nil || strings.TrimSpace(metaRaw) == "" {
			c.JSON(http.StatusOK, out)
			return
		}
		var meta harborImageIndexMeta
		if json.Unmarshal([]byte(metaRaw), &meta) != nil {
			c.JSON(http.StatusOK, out)
			return
		}
		out["entryCount"] = meta.EntryCount
		out["updatedAt"] = meta.UpdatedAt
		out["lastDurationMs"] = meta.LastDurationMs
		out["lastError"] = meta.LastError
		out["registryHost"] = meta.RegistryHost
		out["contentSha256"] = meta.ContentSHA256
		out["skippedIdentical"] = meta.SkippedIdentical
		c.JSON(http.StatusOK, out)
	}
}

func handleHarborIndexSync(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		if app.Redis() == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Redis 未连接，无法写入索引"})
			return
		}
		if !harborConfiguredFromCfg(cfg) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请先配置 Harbor 根地址与账号"})
			return
		}
		if !HarborIndexSyncAsync(app) {
			c.JSON(http.StatusConflict, gin.H{"error": "已有全量同步任务正在运行，请稍候再试"})
			return
		}
		c.JSON(http.StatusAccepted, gin.H{"ok": true, "message": "已在后台启动 Harbor 镜像全量索引同步"})
	}
}

func handleHarborIndexSearch(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		rdb := app.Redis()
		if rdb == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Redis 未连接，无法从索引查询"})
			return
		}
		q := strings.TrimSpace(c.Query("q"))
		limit := 200
		if ls := strings.TrimSpace(c.Query("limit")); ls != "" {
			if n, err := strconv.Atoi(ls); err == nil && n > 0 && n <= 2000 {
				limit = n
			}
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancel()

		payload, meta, err := harborIndexReadPayloadFromRedis(ctx, rdb, cfg)
		if err != nil || payload == nil {
			var m harborImageIndexMeta
			if mr, e2 := rdb.Get(ctx, harborIndexRedisMetaKey(cfg)); e2 == nil && strings.TrimSpace(mr) != "" {
				_ = json.Unmarshal([]byte(mr), &m)
			}
			c.JSON(http.StatusOK, gin.H{
				"entries":    []HarborImageIndexEntry{},
				"limit":      limit,
				"matched":    0,
				"query":      q,
				"indexReady": false,
				"indexNote":  "索引尚未就绪，请等待后台任务（需 Redis + Harbor，且 KUBEBT_ENABLE_BACKGROUND_JOBS=true）",
				"meta":       m,
			})
			return
		}

		tokens := harborIndexSearchTokenize(q)
		var matched []HarborImageIndexEntry
		if len(tokens) == 0 {
			c.JSON(http.StatusOK, gin.H{
				"entries":    []HarborImageIndexEntry{},
				"limit":      limit,
				"matched":    0,
				"query":      q,
				"indexReady": true,
				"meta":       meta,
			})
			return
		}

		for i := range payload.Entries {
			if harborIndexSearchMatch(&payload.Entries[i], tokens) {
				matched = append(matched, payload.Entries[i])
				if len(matched) >= limit {
					break
				}
			}
		}
		c.JSON(http.StatusOK, gin.H{
			"entries":      matched,
			"limit":        limit,
			"matched":      len(matched),
			"totalIndexed": len(payload.Entries),
			"query":        q,
			"indexReady":   true,
			"meta":         meta,
		})
	}
}
