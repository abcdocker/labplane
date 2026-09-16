package internal

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"time"
)

// Prometheus 查询结果在平台 Redis 中的短 TTL 缓存（减轻对 Prometheus 的压力、合并重复查询）。
const prometheusCacheTTL = 60 * time.Second

func prometheusCacheKeyInstant(scope, q string) string {
	sum := sha256.Sum256([]byte("i1|" + scope + "\x00" + q))
	return "kubebt:prom:v1:" + hex.EncodeToString(sum[:])
}

func prometheusCacheKeyRange(scope, q, start, end, step string) string {
	sum := sha256.Sum256([]byte("r1|" + scope + "\x00" + q + "\x00" + start + "\x00" + end + "\x00" + step))
	return "kubebt:prom:v1:" + hex.EncodeToString(sum[:])
}

func prometheusCacheGet(ctx context.Context, r *RedisLight, key string) ([]byte, bool) {
	if r == nil {
		return nil, false
	}
	s, err := r.Get(ctx, key)
	if err != nil || s == "" {
		return nil, false
	}
	return []byte(s), true
}

func prometheusCachePut(ctx context.Context, r *RedisLight, key string, body []byte) {
	if r == nil || len(body) == 0 {
		return
	}
	_ = r.Set(ctx, key, body, prometheusCacheTTL)
}
