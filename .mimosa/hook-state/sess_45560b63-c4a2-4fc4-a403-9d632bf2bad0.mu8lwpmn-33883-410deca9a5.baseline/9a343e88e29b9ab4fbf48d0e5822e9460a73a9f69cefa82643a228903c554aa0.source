package internal

import (
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

// dialRedisLightWithRetry 启动与 Reload 时连接 Redis，带指数退避重试（应对 Redis 晚于本进程就绪）。
func dialRedisLightWithRetry(cfg Config) (*RedisLight, error) {
	if !RedisAddrConfigured(cfg) {
		return nil, nil
	}
	attempts := 10
	if s := strings.TrimSpace(os.Getenv("KUBEBT_REDIS_DIAL_ATTEMPTS")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 1 && n <= 60 {
			attempts = n
		}
	}
	base := 250 * time.Millisecond
	if s := strings.TrimSpace(os.Getenv("KUBEBT_REDIS_DIAL_BACKOFF_MS")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 50 && n <= 10000 {
			base = time.Duration(n) * time.Millisecond
		}
	}
	var lastErr error
	for i := 1; i <= attempts; i++ {
		r, err := dialRedisLight(cfg)
		if err == nil && r != nil {
			if i > 1 {
				log.Printf("Redis: 第 %d 次尝试后连接成功", i)
			}
			return r, nil
		}
		lastErr = err
		if i < attempts {
			sh := i - 1
			if sh > 6 {
				sh = 6
			}
			d := base * time.Duration(1<<sh)
			if d > 5*time.Second {
				d = 5 * time.Second
			}
			time.Sleep(d)
		}
	}
	return nil, lastErr
}
