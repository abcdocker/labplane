package internal

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"time"
)

var harborIndexProgressFlushMu sync.Mutex
var harborIndexProgressLastFlush time.Time

func harborIndexWriteProgress(ctx context.Context, rdb *RedisLight, cfg Config, p HarborImageIndexProgress) {
	if rdb == nil {
		return
	}
	harborIndexProgressFlushMu.Lock()
	if p.State == "running" && time.Since(harborIndexProgressLastFlush) < 280*time.Millisecond {
		harborIndexProgressFlushMu.Unlock()
		return
	}
	harborIndexProgressLastFlush = time.Now()
	harborIndexProgressFlushMu.Unlock()
	raw, err := json.Marshal(p)
	if err != nil {
		return
	}
	_ = rdb.SetPersist(ctx, harborIndexRedisProgressKey(cfg), raw)
}

// HarborIndexRefreshOnce 全量爬取并写 Redis（与定时任务共用）；已在运行则直接返回。
func HarborIndexRefreshOnce(ctx context.Context, app *ServerApp) {
	if !harborIndexRunning.CompareAndSwap(false, true) {
		return
	}
	defer harborIndexRunning.Store(false)
	harborIndexRefreshInner(ctx, app)
}

// harborIndexRefreshInner 假定外层已持有 harborIndexRunning。
func harborIndexRefreshInner(ctx context.Context, app *ServerApp) {
	cfg := app.Cfg()
	rdb := app.Redis()
	if rdb == nil || !harborConfiguredFromCfg(cfg) {
		return
	}

	t0 := time.Now()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	meta := harborImageIndexMeta{
		RegistryHost: harborRegistryPullHost(cfg.HarborBaseURL),
	}
	if meta.RegistryHost == "" {
		meta.RegistryHost = strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(cfg.HarborBaseURL), "https://"), "http://")
		meta.RegistryHost = strings.TrimSuffix(meta.RegistryHost, "/")
	}

	harborIndexWriteProgress(ctx, rdb, cfg, HarborImageIndexProgress{
		State:     "running",
		Phase:     "listing_projects",
		Message:   "开始全量同步 Harbor 镜像索引",
		StartedAt: now,
	})

	entries, err := HarborIndexCrawlWithProgress(ctx, cfg, func(p HarborImageIndexProgress) {
		if p.StartedAt == "" {
			p.StartedAt = now
		}
		bg := context.Background()
		harborIndexWriteProgress(bg, rdb, cfg, p)
	})
	dur := time.Since(t0)
	meta.LastDurationMs = dur.Milliseconds()
	meta.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)

	if err != nil {
		meta.LastError = err.Error()
		meta.LastErrorAt = meta.UpdatedAt
		mb, _ := json.Marshal(meta)
		_ = rdb.SetPersist(context.Background(), harborIndexRedisMetaKey(cfg), mb)
		harborIndexWriteProgress(context.Background(), rdb, cfg, HarborImageIndexProgress{
			State:      "error",
			Phase:      "idle",
			Message:    "同步失败",
			LastError:  err.Error(),
			FinishedAt: meta.UpdatedAt,
		})
		return
	}

	harborIndexWriteProgress(ctx, rdb, cfg, HarborImageIndexProgress{
		State:         "running",
		Phase:         "writing_redis",
		Message:       "正在写入 Redis 快照",
		TagsIndexed:   len(entries),
		PercentApprox: 99,
	})

	payload := harborImageIndexPayload{V: 1, Entries: entries}
	raw, jerr := json.Marshal(payload)
	if jerr != nil {
		meta.LastError = jerr.Error()
		meta.LastErrorAt = meta.UpdatedAt
		mb, _ := json.Marshal(meta)
		_ = rdb.SetPersist(context.Background(), harborIndexRedisMetaKey(cfg), mb)
		harborIndexWriteProgress(context.Background(), rdb, cfg, HarborImageIndexProgress{
			State:      "error",
			Phase:      "idle",
			LastError:  jerr.Error(),
			FinishedAt: meta.UpdatedAt,
		})
		return
	}

	hash := harborIndexPayloadHashJSON(raw)
	prevMetaRaw, _ := rdb.Get(ctx, harborIndexRedisMetaKey(cfg))
	var prev harborImageIndexMeta
	if strings.TrimSpace(prevMetaRaw) != "" {
		_ = json.Unmarshal([]byte(prevMetaRaw), &prev)
	}
	if prev.ContentSHA256 != "" && prev.ContentSHA256 == hash {
		meta.EntryCount = len(entries)
		meta.ContentSHA256 = hash
		meta.SkippedIdentical = true
		meta.LastError = ""
		mb, _ := json.Marshal(meta)
		_ = rdb.SetPersist(context.Background(), harborIndexRedisMetaKey(cfg), mb)
		harborIndexWriteProgress(context.Background(), rdb, cfg, HarborImageIndexProgress{
			State:         "idle",
			Phase:         "idle",
			Message:       "内容与上次一致，已跳过写入 payload",
			TagsIndexed:   len(entries),
			PercentApprox: 100,
			FinishedAt:    meta.UpdatedAt,
		})
		return
	}

	if err := rdb.SetPersist(ctx, harborIndexRedisPayloadKey(cfg), raw); err != nil {
		meta.LastError = err.Error()
		meta.LastErrorAt = meta.UpdatedAt
		mb, _ := json.Marshal(meta)
		_ = rdb.SetPersist(context.Background(), harborIndexRedisMetaKey(cfg), mb)
		harborIndexWriteProgress(context.Background(), rdb, cfg, HarborImageIndexProgress{
			State:      "error",
			Phase:      "idle",
			LastError:  err.Error(),
			FinishedAt: meta.UpdatedAt,
		})
		return
	}

	meta.EntryCount = len(entries)
	meta.ContentSHA256 = hash
	meta.LastError = ""
	mb, _ := json.Marshal(meta)
	_ = rdb.SetPersist(context.Background(), harborIndexRedisMetaKey(cfg), mb)
	harborIndexWriteProgress(context.Background(), rdb, cfg, HarborImageIndexProgress{
		State:         "idle",
		Phase:         "idle",
		Message:       "同步完成",
		TagsIndexed:   len(entries),
		PercentApprox: 100,
		FinishedAt:    meta.UpdatedAt,
	})
}

// HarborIndexSyncAsync 在后台启动一次全量同步（HTTP 触发）；若已有任务在跑则返回 false。
func HarborIndexSyncAsync(app *ServerApp) bool {
	if !harborIndexRunning.CompareAndSwap(false, true) {
		return false
	}
	go func() {
		defer harborIndexRunning.Store(false)
		timeout := time.Duration(harborIndexCrawlTimeoutSec()) * time.Second
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()
		harborIndexRefreshInner(ctx, app)
	}()
	return true
}
