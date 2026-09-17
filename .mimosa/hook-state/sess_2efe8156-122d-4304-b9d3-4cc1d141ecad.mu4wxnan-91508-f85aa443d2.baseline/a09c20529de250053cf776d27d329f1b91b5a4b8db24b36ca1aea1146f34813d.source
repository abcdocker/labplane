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

// harborListCacheMaxBodyMB 单条 Harbor 列表/统计 JSON 写入 Redis 的最大体积（MB）。
// KUBEBT_HARBOR_LIST_CACHE_MAX_BODY_MB：默认 16，范围 1～128（原硬编码 2MB，大制品列表易超出导致不落库）。
func harborListCacheMaxBodyMB() int {
	mb := 16
	if s := strings.TrimSpace(os.Getenv("KUBEBT_HARBOR_LIST_CACHE_MAX_BODY_MB")); s != "" {
		if n, err := strconv.Atoi(s); err == nil {
			if n < 1 {
				n = 1
			}
			if n > 128 {
				n = 128
			}
			mb = n
		}
	}
	return mb
}

func harborListCacheMaxBodyBytes() int {
	return harborListCacheMaxBodyMB() * 1024 * 1024
}

// harborListCacheTTLSec GET 项目/仓库/制品/统计 在 Redis 中的 TTL；KUBEBT_HARBOR_LIST_CACHE_TTL_SEC=0 关闭，默认 45，最大 86400（24h）。
func harborListCacheTTLSec() int {
	sec := 45
	if s := strings.TrimSpace(os.Getenv("KUBEBT_HARBOR_LIST_CACHE_TTL_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 0 && n <= 86400 {
			sec = n
		}
	}
	return sec
}

func harborListCacheTTL() time.Duration {
	s := harborListCacheTTLSec()
	if s <= 0 {
		return 0
	}
	return time.Duration(s) * time.Second
}

func harborCacheRedisPrefix(cfg Config) string {
	p := strings.TrimSpace(cfg.RedisKeyPrefix)
	if p != "" && !strings.HasSuffix(p, ":") {
		p += ":"
	}
	return p
}

// harborCacheInstanceTag 区分不同 Harbor 根地址与账号；变更凭据后 bump gen 即可丢弃旧缓存。
func harborCacheInstanceTag(cfg Config) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(cfg.HarborBaseURL) + "\x1e" + strings.TrimSpace(cfg.HarborUsername)))
	return hex.EncodeToString(sum[:10])
}

func harborCacheGenRedisKey(cfg Config) string {
	return harborCacheRedisPrefix(cfg) + "harbor:v1:gen:" + harborCacheInstanceTag(cfg)
}

func harborCacheGenRead(ctx context.Context, rdb *RedisLight, cfg Config) int64 {
	if rdb == nil {
		return 0
	}
	s, err := rdb.Get(ctx, harborCacheGenRedisKey(cfg))
	if err != nil || strings.TrimSpace(s) == "" {
		return 0
	}
	n, _ := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	if n < 0 {
		return 0
	}
	return n
}

// HarborCacheBustGen 使 Harbor 列表类 Redis 缓存失效（删除制品、修改 Harbor 配置后调用）。
func HarborCacheBustGen(ctx context.Context, app *ServerApp) {
	rdb := app.Redis()
	if rdb == nil {
		return
	}
	cfg := app.Cfg()
	_, _ = rdb.Incr(ctx, harborCacheGenRedisKey(cfg))
}

func harborListCacheRedisKey(cfg Config, gen int64, kind, subKeyHash string) string {
	kind = strings.TrimSpace(kind)
	subKeyHash = strings.TrimSpace(subKeyHash)
	if kind == "" || subKeyHash == "" {
		return ""
	}
	return harborCacheRedisPrefix(cfg) + "harbor:v1:" + strconv.FormatInt(gen, 10) + ":" + kind + ":" + subKeyHash
}

func harborSubKeyHash(parts ...string) string {
	var b strings.Builder
	for i, p := range parts {
		if i > 0 {
			b.WriteByte('\x1e')
		}
		b.WriteString(p)
	}
	sum := sha256.Sum256([]byte(b.String()))
	return hex.EncodeToString(sum[:12])
}
