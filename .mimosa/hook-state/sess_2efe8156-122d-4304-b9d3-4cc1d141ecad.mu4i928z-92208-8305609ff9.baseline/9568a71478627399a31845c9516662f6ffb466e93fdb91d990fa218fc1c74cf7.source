package internal

import (
	"context"
	"os"
	"strconv"
	"strings"
)

func configAPICacheRedisKey(cfg Config, user, role string) string {
	p := strings.TrimSpace(cfg.RedisKeyPrefix)
	if p != "" && !strings.HasSuffix(p, ":") {
		p += ":"
	}
	u := strings.TrimSpace(user)
	if u == "" {
		u = "_"
	}
	return p + "apicfg:v1:" + strings.TrimSpace(role) + ":" + u
}

// configAPICacheTTLSec GET /api/config 在 Redis 中的缓存秒数；KUBEBT_CONFIG_API_CACHE_TTL_SEC=0 关闭，默认 25，最大 300。
func configAPICacheTTLSec() int {
	sec := 25
	if s := strings.TrimSpace(os.Getenv("KUBEBT_CONFIG_API_CACHE_TTL_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 0 && n <= 300 {
			sec = n
		}
	}
	return sec
}

// InvalidateUserConfigAPICache 权限或用户变更后清除该用户的工作台配置缓存。
func InvalidateUserConfigAPICache(ctx context.Context, app *ServerApp, username string) {
	rdb := app.Redis()
	u := strings.TrimSpace(username)
	if rdb == nil || u == "" {
		return
	}
	cfg := app.Cfg()
	keys := []string{
		configAPICacheRedisKey(cfg, u, DashboardRoleAdmin),
		configAPICacheRedisKey(cfg, u, DashboardRoleViewer),
	}
	_ = rdb.Del(ctx, keys...)
}
