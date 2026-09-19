package internal

import (
	"strings"

	corev1 "k8s.io/api/core/v1"
)

const defaultExporterTag = "v1.69.0"

// ResolveRedisServerImage 解析 Redis 服务端镜像。
// engineLine 为向导中的主版本键（如 "7"）；若配置了 RedisEngineImages 则优先取映射的完整镜像；
// 否则在 RedisImageRegistry 下拼接 /redis:tag，无 registry 时用官方 redis:tag。
func ResolveRedisServerImage(cfg Config, engineLine string, overrideFull string) string {
	if strings.TrimSpace(overrideFull) != "" {
		return strings.TrimSpace(overrideFull)
	}
	line := strings.TrimSpace(engineLine)
	if m := cfg.RedisEngineImages; len(m) > 0 && line != "" {
		if img, ok := m[line]; ok && strings.TrimSpace(img) != "" {
			return strings.TrimSpace(img)
		}
	}
	ver := sanitizeRedisImageTag(engineLine)
	reg := strings.TrimSpace(cfg.RedisImageRegistry)
	if reg == "" {
		return "redis:" + ver
	}
	return strings.TrimRight(reg, "/") + "/redis:" + ver
}

// ResolveRedisExporterImage 解析 redis_exporter 镜像。
func ResolveRedisExporterImage(cfg Config, overrideFull string) string {
	if strings.TrimSpace(overrideFull) != "" {
		return strings.TrimSpace(overrideFull)
	}
	if full := strings.TrimSpace(cfg.RedisExporterImageFull); full != "" {
		return full
	}
	reg := strings.TrimSpace(cfg.RedisExporterImageRegistry)
	if reg == "" {
		reg = strings.TrimSpace(cfg.RedisImageRegistry)
	}
	if reg == "" {
		return defaultRedisExporterImage
	}
	return strings.TrimRight(reg, "/") + "/redis_exporter:" + defaultExporterTag
}

// PodImagePullSecrets 若配置了 RedisImagePullSecret，则返回 imagePullSecrets 切片。
func PodImagePullSecrets(cfg Config) []corev1.LocalObjectReference {
	name := strings.TrimSpace(cfg.RedisImagePullSecret)
	if name == "" {
		return nil
	}
	return []corev1.LocalObjectReference{{Name: name}}
}

// ImagePullSecretsForRedisDeploy 优先使用单次部署指定的 Secret 名，否则回退到进程级 REDIS_IMAGE_PULL_SECRET。
func ImagePullSecretsForRedisDeploy(cfg Config, deploySecretName string) []corev1.LocalObjectReference {
	if s := strings.TrimSpace(deploySecretName); s != "" {
		return []corev1.LocalObjectReference{{Name: s}}
	}
	return PodImagePullSecrets(cfg)
}
