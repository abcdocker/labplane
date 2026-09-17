package internal

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"strconv"
	"strings"
	"time"
)

func redisPermissionsCacheKey(cfg Config, username string) string {
	p := strings.TrimSpace(cfg.RedisKeyPrefix)
	if p != "" && !strings.HasSuffix(p, ":") {
		p += ":"
	}
	return p + "perm:v1:" + strings.TrimSpace(username)
}

func permissionsCacheTTL() time.Duration {
	sec := 120
	if s := strings.TrimSpace(os.Getenv("KUBEBT_PERMISSIONS_CACHE_TTL_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 10 && n <= 3600 {
			sec = n
		}
	}
	return time.Duration(sec) * time.Second
}

type cachedEffPerm struct {
	K8s              string          `json:"k8s"`
	VCenter          string          `json:"vcenter"`
	Baota            string          `json:"baota"`
	AppCenter        string          `json:"appcenter"`
	AppCenterRedis   string          `json:"appcenterRedis"`
	AppCenterCloudVm string          `json:"appcenterCloudVm"`
	MaskSensitive    bool            `json:"maskSensitive"`
	LegacyViewer     bool            `json:"legacyViewer"`
	K8sPodExec                     bool            `json:"k8sPodExec"`
	K8sPodDelete                   bool            `json:"k8sPodDelete"`
	AppCenterCloudVmHysteriaReveal bool            `json:"appcenterCloudVmHysteriaReveal"`
	Menu                           map[string]bool `json:"menu,omitempty"`
}

func effToCached(e *EffectiveDashboardPermissions) *cachedEffPerm {
	if e == nil {
		return nil
	}
	return &cachedEffPerm{
		K8s:              e.K8s,
		VCenter:          e.VCenter,
		Baota:            e.Baota,
		AppCenter:        e.AppCenter,
		AppCenterRedis:   e.AppCenterRedis,
		AppCenterCloudVm: e.AppCenterCloudVm,
		MaskSensitive:    e.MaskSensitive,
		LegacyViewer:     e.LegacyViewer,
		K8sPodExec:                     e.K8sPodExec,
		K8sPodDelete:                   e.K8sPodDelete,
		AppCenterCloudVmHysteriaReveal: e.AppCenterCloudVmHysteriaReveal,
		Menu:                           e.Menu,
	}
}

func cachedToEff(c *cachedEffPerm) *EffectiveDashboardPermissions {
	if c == nil {
		return defaultEffectiveLegacyViewer()
	}
	return &EffectiveDashboardPermissions{
		K8s:              c.K8s,
		VCenter:          c.VCenter,
		Baota:            c.Baota,
		AppCenter:        c.AppCenter,
		AppCenterRedis:   c.AppCenterRedis,
		AppCenterCloudVm: c.AppCenterCloudVm,
		MaskSensitive:    c.MaskSensitive,
		LegacyViewer:     c.LegacyViewer,
		K8sPodExec:                     c.K8sPodExec,
		K8sPodDelete:                   c.K8sPodDelete,
		AppCenterCloudVmHysteriaReveal: c.AppCenterCloudVmHysteriaReveal,
		Menu:                           c.Menu,
	}
}

// LoadEffectiveDashboardPermissionsCached viewer 角色下优先读 Redis，减少每次 API 请求打 MySQL；admin 仍走原逻辑。
func LoadEffectiveDashboardPermissionsCached(ctx context.Context, app *ServerApp, db *sql.DB, username, role string) *EffectiveDashboardPermissions {
	if role == DashboardRoleAdmin {
		return LoadEffectiveDashboardPermissions(db, username, role)
	}
	if db == nil {
		return LoadEffectiveDashboardPermissions(db, username, role)
	}
	rdb := app.Redis()
	if rdb == nil {
		return LoadEffectiveDashboardPermissions(db, username, role)
	}
	u := strings.TrimSpace(username)
	if u == "" {
		return LoadEffectiveDashboardPermissions(db, username, role)
	}
	key := redisPermissionsCacheKey(app.Cfg(), u)
	if s, err := rdb.Get(ctx, key); err == nil && strings.TrimSpace(s) != "" {
		var c cachedEffPerm
		if json.Unmarshal([]byte(s), &c) == nil {
			return cachedToEff(&c)
		}
	}
	eff := LoadEffectiveDashboardPermissions(db, username, role)
	if c := effToCached(eff); c != nil {
		if b, err := json.Marshal(c); err == nil {
			_ = rdb.Set(ctx, key, b, permissionsCacheTTL())
		}
	}
	return eff
}

// InvalidateUserPermissionsCache 平台用户增删改或权限变更后使缓存失效。
func InvalidateUserPermissionsCache(ctx context.Context, app *ServerApp, username string) {
	rdb := app.Redis()
	u := strings.TrimSpace(username)
	if rdb == nil || u == "" {
		return
	}
	cfg := app.Cfg()
	_ = rdb.Del(ctx, redisPermissionsCacheKey(cfg, u))
	InvalidateUserConfigAPICache(ctx, app, u)
}
