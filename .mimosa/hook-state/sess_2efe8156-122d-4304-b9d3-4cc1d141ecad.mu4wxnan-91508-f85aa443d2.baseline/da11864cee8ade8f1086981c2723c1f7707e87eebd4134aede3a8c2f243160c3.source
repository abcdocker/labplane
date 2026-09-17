package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

type redisEncryptedEnvelope struct {
	Version    int    `json:"version"`
	Ciphertext string `json:"ciphertext"`
}

func encryptRedisSnapshot(cfg Config, plaintext []byte) ([]byte, error) {
	key, err := deriveAESKey(cfg.EncryptionKey)
	if err != nil {
		return nil, fmt.Errorf("KUBEBT_ENCRYPTION_KEY 未配置，拒绝把含敏感信息的运行时快照明文写入 Redis: %w", err)
	}
	ciphertext, err := encryptSecret(key, string(plaintext))
	if err != nil {
		return nil, err
	}
	return json.Marshal(redisEncryptedEnvelope{Version: 2, Ciphertext: ciphertext})
}

func decryptRedisSnapshot(cfg Config, raw string) ([]byte, error) {
	var envelope redisEncryptedEnvelope
	if err := json.Unmarshal([]byte(raw), &envelope); err == nil && envelope.Version == 2 {
		key, err := deriveAESKey(cfg.EncryptionKey)
		if err != nil {
			return nil, fmt.Errorf("Redis 快照已加密，但当前未配置 KUBEBT_ENCRYPTION_KEY: %w", err)
		}
		plaintext, err := decryptSecret(key, envelope.Ciphertext)
		if err != nil {
			return nil, fmt.Errorf("解密 Redis 快照: %w", err)
		}
		return []byte(plaintext), nil
	}
	// 兼容读取旧版本明文快照；下一次镜像会自动升级为加密 envelope。
	return []byte(raw), nil
}

func redisRuntimeConfigKey(cfg Config) string {
	p := strings.TrimSpace(cfg.RedisKeyPrefix)
	if p == "" {
		p = "kubebt:"
	} else if !strings.HasSuffix(p, ":") {
		p += ":"
	}
	return p + "runtime-config"
}

func redisPlatformKVKey(cfg Config) string {
	p := strings.TrimSpace(cfg.RedisKeyPrefix)
	if p == "" {
		p = "kubebt:"
	} else if !strings.HasSuffix(p, ":") {
		p += ":"
	}
	return p + "platform-kv"
}

// MirrorRuntimeSettingsToRedis 将完整运行时配置写入 Redis（无 TTL）。
func MirrorRuntimeSettingsToRedis(ctx context.Context, r *RedisLight, cfg Config, rs *RuntimeSettings) error {
	if r == nil || rs == nil {
		return nil
	}
	b, err := json.Marshal(rs)
	if err != nil {
		return err
	}
	encrypted, err := encryptRedisSnapshot(cfg, b)
	if err != nil {
		return err
	}
	return r.SetPersist(ctx, redisRuntimeConfigKey(cfg), encrypted)
}

// LoadRuntimeSettingsFromRedis 从 Redis 读取运行时配置（用于灾备恢复）。
func LoadRuntimeSettingsFromRedis(ctx context.Context, r *RedisLight, cfg Config) (*RuntimeSettings, error) {
	s, err := r.Get(ctx, redisRuntimeConfigKey(cfg))
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(s) == "" {
		return nil, nil
	}
	raw, err := decryptRedisSnapshot(cfg, s)
	if err != nil {
		return nil, err
	}
	var rs RuntimeSettings
	if err := json.Unmarshal(raw, &rs); err != nil {
		return nil, err
	}
	return &rs, nil
}

// MirrorPlatformKVToRedis 将 platform_kv 全量镜像到 Redis。
func MirrorPlatformKVToRedis(ctx context.Context, r *RedisLight, cfg Config, data map[string]string) error {
	if r == nil || data == nil {
		return nil
	}
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	encrypted, err := encryptRedisSnapshot(cfg, b)
	if err != nil {
		return err
	}
	return r.SetPersist(ctx, redisPlatformKVKey(cfg), encrypted)
}

// LoadPlatformKVFromRedis 从 Redis 读取 platform_kv 映射。
func LoadPlatformKVFromRedis(ctx context.Context, r *RedisLight, cfg Config) (map[string]string, error) {
	s, err := r.Get(ctx, redisPlatformKVKey(cfg))
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(s) == "" {
		return nil, nil
	}
	raw, err := decryptRedisSnapshot(cfg, s)
	if err != nil {
		return nil, err
	}
	var m map[string]string
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, err
	}
	return m, nil
}
