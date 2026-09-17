package internal

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"strconv"
	"strings"
	"time"
)

func docsRedisKeyPrefix(cfg Config) string {
	p := strings.TrimSpace(cfg.RedisKeyPrefix)
	if p != "" && !strings.HasSuffix(p, ":") {
		p += ":"
	}
	return p
}

func docsDetailCacheRedisKey(cfg Config, docID uint64) string {
	return docsRedisKeyPrefix(cfg) + "docs:v1:d:" + strconv.FormatUint(docID, 10)
}

func docsListRevRedisKey(cfg Config) string {
	return docsRedisKeyPrefix(cfg) + "docs:v1:listRev"
}

func docsListCacheRedisKey(cfg Config, listRev int64, categoryID, tag, q string) string {
	h := sha256.Sum256([]byte(categoryID + "\x1e" + tag + "\x1e" + q))
	return docsRedisKeyPrefix(cfg) + "docs:v1:l:" + strconv.FormatInt(listRev, 10) + ":" + hex.EncodeToString(h[:8])
}

func docsPublicPageCacheRedisKey(cfg Config, docID uint64) string {
	return docsRedisKeyPrefix(cfg) + "docs:v1:pubhtml:" + strconv.FormatUint(docID, 10)
}

// docsAPICacheTTL GET /api/docs 列表与单篇 JSON 在 Redis 中的 TTL；可通过 KUBEBT_DOCS_API_CACHE_TTL_SEC 调整（5～3600，默认 120）。
func docsAPICacheTTL() time.Duration {
	sec := 120
	if s := strings.TrimSpace(os.Getenv("KUBEBT_DOCS_API_CACHE_TTL_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 5 && n <= 3600 {
			sec = n
		}
	}
	return time.Duration(sec) * time.Second
}

func docsListRevFromRedis(ctx context.Context, app *ServerApp) int64 {
	rdb := app.Redis()
	if rdb == nil {
		return 0
	}
	s, err := rdb.Get(ctx, docsListRevRedisKey(app.Cfg()))
	if err != nil || strings.TrimSpace(s) == "" {
		return 0
	}
	n, _ := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	if n < 0 {
		return 0
	}
	return n
}

func docsTryDetailCache(ctx context.Context, app *ServerApp, docID uint64) []byte {
	rdb := app.Redis()
	if rdb == nil {
		return nil
	}
	raw, err := rdb.Get(ctx, docsDetailCacheRedisKey(app.Cfg(), docID))
	if err != nil || strings.TrimSpace(raw) == "" {
		return nil
	}
	return []byte(raw)
}

func docsStoreDetailCache(ctx context.Context, app *ServerApp, docID uint64, jsonBytes []byte) {
	rdb := app.Redis()
	if rdb == nil || len(jsonBytes) == 0 {
		return
	}
	_ = rdb.Set(ctx, docsDetailCacheRedisKey(app.Cfg(), docID), jsonBytes, docsAPICacheTTL())
}

func docsTryListCache(ctx context.Context, app *ServerApp, listRev int64, categoryID, tag, q string) []byte {
	rdb := app.Redis()
	if rdb == nil {
		return nil
	}
	key := docsListCacheRedisKey(app.Cfg(), listRev, categoryID, tag, q)
	raw, err := rdb.Get(ctx, key)
	if err != nil || strings.TrimSpace(raw) == "" {
		return nil
	}
	return []byte(raw)
}

func docsStoreListCache(ctx context.Context, app *ServerApp, listRev int64, categoryID, tag, q string, jsonBytes []byte) {
	rdb := app.Redis()
	if rdb == nil || len(jsonBytes) == 0 {
		return
	}
	key := docsListCacheRedisKey(app.Cfg(), listRev, categoryID, tag, q)
	_ = rdb.Set(ctx, key, jsonBytes, docsAPICacheTTL())
}

func docsTryPublicPageCache(ctx context.Context, app *ServerApp, docID uint64) []byte {
	rdb := app.Redis()
	if rdb == nil {
		return nil
	}
	raw, err := rdb.Get(ctx, docsPublicPageCacheRedisKey(app.Cfg(), docID))
	if err != nil || strings.TrimSpace(raw) == "" {
		return nil
	}
	return []byte(raw)
}

func docsStorePublicPageCache(ctx context.Context, app *ServerApp, docID uint64, html []byte) {
	rdb := app.Redis()
	if rdb == nil || docID == 0 || len(html) == 0 {
		return
	}
	_ = rdb.Set(ctx, docsPublicPageCacheRedisKey(app.Cfg(), docID), html, docsAPICacheTTL())
}

// docsBumpDocsAPICache 文档或文库元数据变更后：删除指定文档详情缓存，并递增列表版本使列表缓存键失效。
func docsBumpDocsAPICache(ctx context.Context, app *ServerApp, invalidateDocIDs ...uint64) {
	rdb := app.Redis()
	if rdb == nil {
		return
	}
	cfg := app.Cfg()
	if len(invalidateDocIDs) > 0 {
		keys := make([]string, 0, len(invalidateDocIDs)*2)
		for _, id := range invalidateDocIDs {
			if id > 0 {
				keys = append(keys, docsDetailCacheRedisKey(cfg, id))
				keys = append(keys, docsPublicPageCacheRedisKey(cfg, id))
			}
		}
		if len(keys) > 0 {
			_ = rdb.Del(ctx, keys...)
		}
	}
	_, _ = rdb.Incr(ctx, docsListRevRedisKey(cfg))
}
