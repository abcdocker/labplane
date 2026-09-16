package internal

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// redisRuntimeStatusKey 运行状态缓存键（按 admin / viewer 分片，与脱敏一致）。
func redisRuntimeStatusKey(cfg Config, roleSuffix string) string {
	p := strings.TrimSpace(cfg.RedisKeyPrefix)
	if p != "" && !strings.HasSuffix(p, ":") {
		p += ":"
	}
	if roleSuffix != "viewer" {
		roleSuffix = "admin"
	}
	return p + "runtime-status:" + roleSuffix
}

func runtimeStatusTTL() time.Duration {
	sec := 90
	if s := strings.TrimSpace(os.Getenv("KUBEBT_RUNTIME_STATUS_TTL_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			sec = n
		}
	}
	return time.Duration(sec) * time.Second
}

func runtimeStatusRefreshInterval() time.Duration {
	sec := 60
	if s := strings.TrimSpace(os.Getenv("KUBEBT_RUNTIME_STATUS_REFRESH_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			sec = n
		}
	}
	return time.Duration(sec) * time.Second
}

// InvalidateRuntimeStatusCache 在 Reload 等配置变更后清空缓存，避免读到旧状态。
func InvalidateRuntimeStatusCache(ctx context.Context, app *ServerApp) {
	rdb := app.Redis()
	if rdb == nil {
		return
	}
	cfg := app.Cfg()
	_ = rdb.Del(ctx, redisRuntimeStatusKey(cfg, "admin"), redisRuntimeStatusKey(cfg, "viewer"))
}

func buildRuntimeStatusPayload(ctx context.Context, app *ServerApp, role string, eff *EffectiveDashboardPermissions) gin.H {
	return gin.H{
		"config":        buildConfigMapResponse(app, role, eff),
		"systemCheck":   buildSystemCheckResponse(ctx, app, role),
		"buildVersion":  sessionBuildVersionSegment(),
		"mysqlSchema":   GinHMySQLSchemaStatus(ctx, app),
	}
}

// handleGetRuntimeStatus GET /api/runtime/status — 优先读 Redis 缓存（与宝塔/K8s 探活结果），未命中再计算并回写。
func handleGetRuntimeStatus(c *gin.Context, app *ServerApp) {
	role := getDashboardRoleFromGin(c)
	eff := getEffectiveDashboardPermissionsFromGin(c)
	ctx := c.Request.Context()
	suffix := "admin"
	if role != DashboardRoleAdmin {
		suffix = "viewer"
	}
	rdb := app.Redis()
	if rdb != nil {
		key := redisRuntimeStatusKey(app.Cfg(), suffix)
		if s, err := rdb.Get(ctx, key); err == nil && strings.TrimSpace(s) != "" {
			merged, merr := MergeRuntimeStatusFreshDiagnostics(ctx, app, []byte(s))
			if merr != nil {
				c.Data(http.StatusOK, "application/json", []byte(s))
				return
			}
			c.Data(http.StatusOK, "application/json", merged)
			return
		}
	}
	payload := buildRuntimeStatusPayload(ctx, app, role, eff)
	b, err := json.Marshal(payload)
	if err != nil {
		RespondAPIError500(c, "序列化运行状态失败: " + err.Error())
		return
	}
	if rdb != nil {
		key := redisRuntimeStatusKey(app.Cfg(), suffix)
		_ = rdb.Set(ctx, key, b, runtimeStatusTTL())
	}
	c.Data(http.StatusOK, "application/json", b)
}

// StartRuntimeStatusRefresher 后台定期把 admin/viewer 两套运行状态写入 Redis，减轻首次打开时的探活延迟。
func StartRuntimeStatusRefresher(app *ServerApp) {
	d := runtimeStatusRefreshInterval()
	if d < 30*time.Second {
		d = 30 * time.Second
	}
	go func() {
		ticker := time.NewTicker(d)
		defer ticker.Stop()
		for range ticker.C {
			rdb := app.Redis()
			if rdb == nil {
				continue
			}
			ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
			ttl := runtimeStatusTTL()
			cfg := app.Cfg()
			for _, pair := range []struct {
				role string
				eff  *EffectiveDashboardPermissions
			}{
				{DashboardRoleAdmin, defaultEffectiveAdmin()},
				{DashboardRoleViewer, defaultEffectiveLegacyViewer()},
			} {
				payload := buildRuntimeStatusPayload(ctx, app, pair.role, pair.eff)
				b, err := json.Marshal(payload)
				if err != nil {
					continue
				}
				suffix := "admin"
				if pair.role != DashboardRoleAdmin {
					suffix = "viewer"
				}
				key := redisRuntimeStatusKey(cfg, suffix)
				_ = rdb.Set(ctx, key, b, ttl)
			}
			cancel()
		}
	}()
}
