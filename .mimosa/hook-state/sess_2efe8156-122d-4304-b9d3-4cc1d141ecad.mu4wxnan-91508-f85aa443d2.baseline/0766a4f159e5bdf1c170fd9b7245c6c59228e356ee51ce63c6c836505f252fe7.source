package internal

import (
	"context"
	"os"
	"strconv"
	"strings"
	"time"
)

// platformKVRedisHot 在 MySQL/文件持久化之上增加 Redis 热读缓存（短 TTL），重复 Get 不打冷存储。
// 关闭：环境变量 KUBEBT_PLATFORM_KV_REDIS_CACHE=0
type platformKVRedisHot struct {
	inner PlatformKV
	rdb   *RedisLight
	cfg   Config
}

func wrapPlatformKVRedisHot(inner PlatformKV, rdb *RedisLight, cfg Config) PlatformKV {
	if inner == nil || rdb == nil {
		return inner
	}
	if strings.TrimSpace(os.Getenv("KUBEBT_PLATFORM_KV_REDIS_CACHE")) == "0" {
		return inner
	}
	return &platformKVRedisHot{inner: inner, rdb: rdb, cfg: cfg}
}

func (p *platformKVRedisHot) redisKey(k string) string {
	pr := strings.TrimSpace(p.cfg.RedisKeyPrefix)
	if pr != "" && !strings.HasSuffix(pr, ":") {
		pr += ":"
	}
	return pr + "pkv:v1:" + k
}

func platformKVHotTTL() time.Duration {
	sec := 300
	if s := strings.TrimSpace(os.Getenv("KUBEBT_PLATFORM_KV_REDIS_TTL_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 30 && n <= 86400 {
			sec = n
		}
	}
	return time.Duration(sec) * time.Second
}

const platformKVRedisMaxCacheBytes = 1024 * 1024

func (p *platformKVRedisHot) Get(k string) (string, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	rk := p.redisKey(k)
	if s, err := p.rdb.Get(ctx, rk); err == nil && s != "" {
		return s, true
	}
	v, ok := p.inner.Get(k)
	if !ok {
		return "", false
	}
	if len(v) > platformKVRedisMaxCacheBytes {
		return v, true
	}
	_ = p.rdb.Set(ctx, rk, []byte(v), platformKVHotTTL())
	return v, true
}

func (p *platformKVRedisHot) Set(k, v string) error {
	if err := p.inner.Set(k, v); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rk := p.redisKey(k)
	if len(v) > platformKVRedisMaxCacheBytes {
		_ = p.rdb.Del(ctx, rk)
		return nil
	}
	_ = p.rdb.Set(ctx, rk, []byte(v), platformKVHotTTL())
	return nil
}

func (p *platformKVRedisHot) Snapshot() map[string]string {
	return p.inner.Snapshot()
}

var _ PlatformKV = (*platformKVRedisHot)(nil)
