package internal

import (
	"context"
	"log"
	"time"
)

// StartRedisReconnectLoop 周期性尝试连接平台 Redis（向导阶段若 Redis 未就绪导致 redis 为 nil，恢复后可自动连上而无需重启进程）。
func StartRedisReconnectLoop(ctx context.Context, app *ServerApp) {
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				log.Println("Redis 重连轮询: 已停止")
				return
			case <-ticker.C:
			}
			app.TryRedisReconnect(context.Background())
		}
	}()
}

// TryRedisReconnect 若当前未持有 Redis 客户端且已配置地址，则尝试拨号并清除 dialErr。
func (s *ServerApp) TryRedisReconnect(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.redis != nil {
		return
	}
	cfg := s.cfg
	if !RedisAddrConfigured(cfg) {
		return
	}
	rdb, err := dialRedisLight(cfg)
	if err != nil {
		s.redisDialErr = truncateErrMessage(err.Error(), 400)
		return
	}
	s.redis = rdb
	s.redisDialErr = ""
	log.Printf("Redis: 已自动重连（平台 KV / 双写可用）")
	if cfg.RuntimeDualWriteRedis {
		ctx2, cancel := context.WithTimeout(ctx, 20*time.Second)
		defer cancel()
		if s.platformKV != nil {
			if err := MirrorPlatformKVToRedis(ctx2, rdb, cfg, s.platformKV.Snapshot()); err != nil {
				log.Printf("Redis 重连后镜像 platform_kv: %v", err)
			}
		}
		if s.runtime != nil && s.runtime.Initialized {
			if err := MirrorRuntimeSettingsToRedis(ctx2, rdb, cfg, s.runtime); err != nil {
				log.Printf("Redis 重连后镜像 runtime: %v", err)
			}
		}
	}
}
