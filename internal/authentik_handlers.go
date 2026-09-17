package internal

// Authentik 集成 API（/api/ops/authentik）：
//   GET    /instances                       实例列表（Token 打码）
//   PUT    /instances                       新增/更新（AdminOnly）
//   DELETE /instances/:id                   删除（AdminOnly）
//   POST   /instances/:id/test              连通性测试（AdminOnly）
//   GET    /instances/:id/status            状态：版本 + 各对象计数
//   GET    /instances/:id/users?search=     用户列表
//   POST   /instances/:id/users             创建用户（可选初始密码 + 关联组，AdminOnly）
//   POST   /instances/:id/users/:uid/password    重置密码（AdminOnly）
//   POST   /instances/:id/users/:uid/active      启用/停用（AdminOnly）
//   DELETE /instances/:id/users/:uid        删除用户（AdminOnly）
//   GET    /instances/:id/groups            用户组列表
//   POST   /instances/:id/groups            创建用户组（AdminOnly）
//   GET    /instances/:id/apps              应用列表
//   POST   /instances/:id/apps              对接向导：创建 OAuth2 提供程序 + 应用（+ 组绑定）（AdminOnly）
//   GET    /instances/:id/providers/oauth2  OAuth2 提供程序列表
//   GET    /instances/:id/events            最近事件
//   GET    /summary                         跨实例汇总（Dashboard 卡片）

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const authentikImplicitConsentFlowSlug = "default-provider-authorization-implicit-consent"
const authentikInvalidationFlowSlug = "default-invalidation-flow"

func registerAuthentikRoutes(api gin.IRouter, app *ServerApp) {
	g := api.Group("/ops/authentik")
	g.GET("/instances", handleAuthentikInstancesGet(app))
	g.PUT("/instances", AdminOnlyMiddleware(app), handleAuthentikInstancesPut(app))
	g.DELETE("/instances/:id", AdminOnlyMiddleware(app), handleAuthentikInstanceDelete(app))
	g.GET("/summary", handleAuthentikSummary(app))
	idg := g.Group("/instances/:id")
	idg.GET("/status", handleAuthentikStatus(app))
	idg.GET("/users", handleAuthentikUsersGet(app))
	idg.POST("/users", AdminOnlyMiddleware(app), handleAuthentikUserCreate(app))
	idg.PUT("/users/:uid", AdminOnlyMiddleware(app), handleAuthentikUserUpdate(app))
	idg.POST("/users/:uid/password", AdminOnlyMiddleware(app), handleAuthentikUserPassword(app))
	idg.POST("/users/:uid/active", AdminOnlyMiddleware(app), handleAuthentikUserActive(app))
	idg.DELETE("/users/:uid", AdminOnlyMiddleware(app), handleAuthentikUserDelete(app))
	idg.GET("/groups", handleAuthentikGroupsGet(app))
	idg.POST("/groups", AdminOnlyMiddleware(app), handleAuthentikGroupCreate(app))
	idg.GET("/apps", handleAuthentikAppsGet(app))
	idg.POST("/apps", AdminOnlyMiddleware(app), handleAuthentikAppCreate(app))
	idg.PUT("/apps/:slug", AdminOnlyMiddleware(app), handleAuthentikAppUpdate(app))
	idg.DELETE("/apps/:slug", AdminOnlyMiddleware(app), handleAuthentikAppDelete(app))
	idg.GET("/providers/oauth2", handleAuthentikProvidersGet(app))
	idg.POST("/providers/oauth2", AdminOnlyMiddleware(app), handleAuthentikProviderCreate(app))
	idg.PUT("/providers/:pk", AdminOnlyMiddleware(app), handleAuthentikProviderUpdate(app))
	idg.DELETE("/providers/:pk", AdminOnlyMiddleware(app), handleAuthentikProviderDelete(app))
	idg.GET("/bindings", handleAuthentikBindingsGet(app))
	idg.POST("/bindings", AdminOnlyMiddleware(app), handleAuthentikBindingCreate(app))
	idg.DELETE("/bindings/:bid", AdminOnlyMiddleware(app), handleAuthentikBindingDelete(app))
	idg.GET("/events", handleAuthentikEventsGet(app))
	idg.POST("/test", AdminOnlyMiddleware(app), handleAuthentikTest(app))
}

func authentikClientFor(app *ServerApp, id string) (*authentikClient, AuthentikInstance, bool, error) {
	b := loadAuthentikSettings(app.PlatformKV())
	for _, in := range b.Instances {
		if in.ID != id {
			continue
		}
		key, err := opsEncryptionKey(app.Cfg())
		if err != nil {
			return nil, in, true, err
		}
		token, _ := decryptSecret(key, in.TokenEnc)
		cli, err := newAuthentikClient(in.BaseURL, token, 15*time.Second)
		if err != nil {
			return nil, in, true, err
		}
		return cli, in, true, nil
	}
	return nil, AuthentikInstance{}, false, nil
}

func handleAuthentikInstancesGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		b := loadAuthentikSettings(app.PlatformKV())
		out := make([]map[string]any, 0, len(b.Instances))
		for _, in := range b.Instances {
			out = append(out, authentikInstancePublic(in))
		}
		c.JSON(http.StatusOK, gin.H{"instances": out})
	}
}

func handleAuthentikInstancesPut(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var in authentikInstancePutInput
		if err := c.ShouldBindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		if strings.TrimSpace(in.Name) == "" || strings.TrimSpace(in.BaseURL) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "名称与 Base URL 必填"})
			return
		}
		if _, err := validateMeshOutboundURL(in.BaseURL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		key, err := opsEncryptionKey(app.Cfg())
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		b := loadAuthentikSettings(app.PlatformKV())
		inst, err := upsertAuthentikInstance(b, in, key)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		if err := saveAuthentikSettings(app.PlatformKV(), b); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "已保存", "instance": authentikInstancePublic(inst)})
	}
}

func handleAuthentikInstanceDelete(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		b := loadAuthentikSettings(app.PlatformKV())
		kept := b.Instances[:0]
		removed := false
		for _, in := range b.Instances {
			if in.ID == id {
				removed = true
				continue
			}
			kept = append(kept, in)
		}
		if !removed {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		b.Instances = kept
		if err := saveAuthentikSettings(app.PlatformKV(), b); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func handleAuthentikTest(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancel()
		sys, err := cli.SystemInfo(ctx)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "连接失败: " + err.Error()})
			return
		}
		version, _ := sys["version"].(string)
		c.JSON(http.StatusOK, gin.H{"message": "连接成功", "version": version})
	}
}

func handleAuthentikStatus(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, inst, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 25*time.Second)
		defer cancel()
		out := gin.H{"instance": authentikInstancePublic(inst)}
		sys, err := cli.SystemInfo(ctx)
		if err != nil {
			out["healthy"] = false
			out["error"] = err.Error()
			c.JSON(http.StatusOK, out)
			return
		}
		out["healthy"] = true
		out["system"] = sys
		out["version"], _ = sys["version"].(string)
		users, groups, apps, providers := cli.Counts(ctx)
		out["usersCount"] = users
		out["groupsCount"] = groups
		out["appsCount"] = apps
		out["providersCount"] = providers
		c.JSON(http.StatusOK, out)
	}
}

func handleAuthentikUsersGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		users, err := cli.ListUsers(ctx, c.Query("search"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		groups, _ := cli.ListGroups(ctx, "")
		c.JSON(http.StatusOK, gin.H{"users": users, "groups": groups})
	}
}

// handleAuthentikUserCreate 创建用户：可选初始密码 + 按组名关联（如「authentik Headscale」，
// headscale OIDC 登录要求该组成员）。
func handleAuthentikUserCreate(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Username   string   `json:"username"`
			Name       string   `json:"name"`
			Email      string   `json:"email"`
			Password   string   `json:"password"`
			Groups     []string `json:"groups"`     // 组 pk 列表
			GroupNames []string `json:"groupNames"` // 组名列表（自动解析 pk）
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		username := strings.TrimSpace(body.Username)
		if username == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "用户名必填"})
			return
		}
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		groups := append([]string{}, body.Groups...)
		if len(body.GroupNames) > 0 {
			all, err := cli.ListGroups(ctx, "")
			if err == nil {
				byName := map[string]string{}
				for _, g := range all {
					byName[g.Name] = g.PK
				}
				for _, gn := range body.GroupNames {
					if pk, ok := byName[gn]; ok {
						groups = append(groups, pk)
					}
				}
			}
		}
		userBody := map[string]any{
			"username": username,
			"name":     strings.TrimSpace(body.Name),
			"email":    strings.TrimSpace(body.Email),
			"path":     "users",
			"groups":   groups,
		}
		user, err := cli.CreateUser(ctx, userBody)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if strings.TrimSpace(body.Password) != "" {
			if err := cli.SetUserPassword(ctx, user.PK, body.Password); err != nil {
				c.JSON(http.StatusOK, gin.H{"message": "用户已创建，但初始密码设置失败", "user": user, "passwordError": err.Error()})
				return
			}
		}
		c.JSON(http.StatusOK, gin.H{"message": "用户已创建", "user": user})
	}
}

func handleAuthentikUserPassword(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Password) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "密码必填"})
			return
		}
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		pk, err := strconv.ParseInt(c.Param("uid"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "用户 ID 无效"})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		if err := cli.SetUserPassword(ctx, pk, body.Password); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "密码已重置"})
	}
}

func handleAuthentikUserActive(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Active *bool `json:"active"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || body.Active == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		pk, err := strconv.ParseInt(c.Param("uid"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "用户 ID 无效"})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		if err := cli.PatchUser(ctx, pk, map[string]any{"is_active": *body.Active}); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "已更新"})
	}
}

func handleAuthentikUserDelete(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		pk, err := strconv.ParseInt(c.Param("uid"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "用户 ID 无效"})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		if err := cli.DeleteUser(ctx, pk); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "用户已删除"})
	}
}

func handleAuthentikGroupsGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		groups, err := cli.ListGroups(ctx, c.Query("search"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"groups": groups})
	}
}

func handleAuthentikGroupCreate(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Name string `json:"name"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Name) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "组名必填"})
			return
		}
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		g, err := cli.CreateGroup(ctx, strings.TrimSpace(body.Name))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "用户组已创建", "group": g})
	}
}

func handleAuthentikAppsGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		apps, err := cli.ListApps(ctx)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"apps": apps})
	}
}

// handleAuthentikAppCreate 对接向导：一次完成「OAuth2 提供程序 + 应用 + 组绑定」。
// 请求：{name, slug?, redirectUris[], groupPK?, providerPK?}
// providerPK 提供时直接关联已有提供程序（跳过新建与 Flow 解析）；
// 否则新建提供程序，响应含 client_id / client_secret（仅此次返回，请立即复制）。
func handleAuthentikAppCreate(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Name         string   `json:"name"`
			Slug         string   `json:"slug"`
			RedirectUris []string `json:"redirectUris"`
			GroupPK      string   `json:"groupPK"`
			ProviderPK   *int64   `json:"providerPK"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "应用名称必填"})
			return
		}
		if body.ProviderPK == nil && len(body.RedirectUris) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "需提供 redirectUris（新建）或 providerPK（关联已有）"})
			return
		}
		slug := strings.TrimSpace(body.Slug)
		if slug == "" {
			slug = strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(name, " ", "-"), "_", "-"))
		}
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		var provider *AKOAuth2Provider
		if body.ProviderPK != nil {
			// 关联已有提供程序
			appObj, err := cli.CreateApp(ctx, name, slug, *body.ProviderPK)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "创建应用失败: " + err.Error()})
				return
			}
			if strings.TrimSpace(body.GroupPK) != "" {
				if err := cli.CreateAppGroupBinding(ctx, appObj.PK, body.GroupPK); err != nil {
					c.JSON(http.StatusOK, gin.H{
						"message":      "应用已创建，但组绑定失败（可稍后在「访问绑定」中补）",
						"app":          appObj,
						"bindingError": err.Error(),
					})
					return
				}
			}
			c.JSON(http.StatusOK, gin.H{"message": "应用已创建并关联已有提供程序", "app": appObj})
			return
		}
		flow, err := cli.FindFlowBySlug(ctx, authentikImplicitConsentFlowSlug)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		invalidationFlow, err := cli.FindFlowBySlug(ctx, authentikInvalidationFlowSlug)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		providerObj, err := cli.CreateOAuth2Provider(ctx, name+" (OIDC)", body.RedirectUris, flow.PK, invalidationFlow.PK)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "创建提供程序失败: " + err.Error()})
			return
		}
		provider = &providerObj
		appObj, err := cli.CreateApp(ctx, name, slug, provider.PK)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "创建应用失败: " + err.Error(), "provider": provider})
			return
		}
		if strings.TrimSpace(body.GroupPK) != "" {
			if err := cli.CreateAppGroupBinding(ctx, appObj.PK, body.GroupPK); err != nil {
				c.JSON(http.StatusOK, gin.H{
					"message":      "应用已创建，但组绑定失败（可稍后在「访问绑定」中补）",
					"app":          appObj,
					"provider":     provider,
					"bindingError": err.Error(),
				})
				return
			}
		}
		c.JSON(http.StatusOK, gin.H{"message": "对接完成：提供程序与应用均已创建", "app": appObj, "provider": provider})
	}
}

func handleAuthentikProvidersGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		providers, err := cli.ListOAuth2Providers(ctx)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"providers": providers})
	}
}

func handleAuthentikEventsGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		perPage, _ := strconv.Atoi(c.DefaultQuery("perPage", "20"))
		events, err := cli.ListEvents(ctx, perPage)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"events": events})
	}
}

// ── 应用：更新 / 删除 / 访问绑定 ──

func handleAuthentikAppUpdate(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Name          string  `json:"name"`
			Provider      *int64  `json:"provider"` // 提供 pk 时挂/换提供程序
			MetaLaunchURL *string `json:"metaLaunchUrl"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		patch := map[string]any{}
		if strings.TrimSpace(body.Name) != "" {
			patch["name"] = strings.TrimSpace(body.Name)
		}
		if body.Provider != nil {
			patch["provider"] = *body.Provider
		}
		if body.MetaLaunchURL != nil {
			patch["meta_launch_url"] = strings.TrimSpace(*body.MetaLaunchURL)
		}
		if len(patch) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无可更新字段"})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		if err := cli.UpdateApp(ctx, c.Param("slug"), patch); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "应用已更新"})
	}
}

func handleAuthentikAppDelete(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		if err := cli.DeleteApp(ctx, c.Param("slug")); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "应用已删除"})
	}
}

// bindingOut 绑定的友好输出：group/user 无论对象还是 pk 都展开成可显示字段。
type bindingOut struct {
	PK        string `json:"pk"`
	Order     int    `json:"order"`
	Enabled   bool   `json:"enabled"`
	Kind      string `json:"kind"` // group | user | other
	GroupPK   string `json:"groupPK,omitempty"`
	GroupName string `json:"groupName,omitempty"`
	UserPK    int64  `json:"userPK,omitempty"`
	Username  string `json:"username,omitempty"`
}

func parseBindingsOut(list []AKBinding) []bindingOut {
	out := make([]bindingOut, 0, len(list))
	for _, b := range list {
		o := bindingOut{PK: b.PK, Order: b.Order, Enabled: b.Enabled, Kind: "other"}
		if len(b.Group) > 0 && string(b.Group) != "null" {
			var g struct {
				PK   string `json:"pk"`
				Name string `json:"name"`
			}
			if json.Unmarshal(b.Group, &g) == nil && g.PK != "" {
				o.Kind = "group"
				o.GroupPK = g.PK
				o.GroupName = g.Name
			} else {
				var gpks string
				if json.Unmarshal(b.Group, &gpks) == nil && gpks != "" {
					o.Kind = "group"
					o.GroupPK = gpks
					o.GroupName = gpks
				}
			}
		}
		if len(b.User) > 0 && string(b.User) != "null" {
			var u struct {
				PK       int64  `json:"pk"`
				Username string `json:"username"`
			}
			if json.Unmarshal(b.User, &u) == nil && u.PK != 0 {
				o.Kind = "user"
				o.UserPK = u.PK
				o.Username = u.Username
			}
		}
		out = append(out, o)
	}
	return out
}

func handleAuthentikBindingsGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		target := strings.TrimSpace(c.Query("target"))
		if target == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 target 参数"})
			return
		}
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		list, err := cli.ListBindings(ctx, target)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"bindings": parseBindingsOut(list)})
	}
}

func handleAuthentikBindingCreate(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Target  string `json:"target"`  // 应用 pk
			GroupPK string `json:"groupPK"` // 二选一
			UserPK  int64  `json:"userPK"`  // 二选一
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		if strings.TrimSpace(body.Target) == "" || (body.GroupPK == "" && body.UserPK == 0) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "target 与 groupPK/userPK 必填其一"})
			return
		}
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		patch := map[string]any{"target": body.Target, "order": 0}
		if body.GroupPK != "" {
			patch["group"] = body.GroupPK
		} else {
			patch["user"] = body.UserPK
		}
		ctx, cancel := reqCtx()
		defer cancel()
		if err := cli.CreateBinding(ctx, patch); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "绑定已创建"})
	}
}

func handleAuthentikBindingDelete(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		if err := cli.DeleteBinding(ctx, c.Param("bid")); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "绑定已移除"})
	}
}

// ── 提供程序：新建 / 更新 / 删除 ──

func handleAuthentikProviderCreate(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Name         string   `json:"name"`
			RedirectUris []string `json:"redirectUris"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		if strings.TrimSpace(body.Name) == "" || len(body.RedirectUris) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "名称与回调 redirect URI 必填"})
			return
		}
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		flow, err := cli.FindFlowBySlug(ctx, authentikImplicitConsentFlowSlug)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		invalidationFlow, err := cli.FindFlowBySlug(ctx, authentikInvalidationFlowSlug)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		provider, err := cli.CreateOAuth2Provider(ctx, strings.TrimSpace(body.Name), body.RedirectUris, flow.PK, invalidationFlow.PK)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "提供程序已创建", "provider": provider})
	}
}

func handleAuthentikProviderUpdate(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Name         string   `json:"name"`
			RedirectUris []string `json:"redirectUris"`
			SubMode      string   `json:"subMode"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		pk, err := strconv.ParseInt(c.Param("pk"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "提供程序 ID 无效"})
			return
		}
		patch := map[string]any{}
		if strings.TrimSpace(body.Name) != "" {
			patch["name"] = strings.TrimSpace(body.Name)
		}
		if len(body.RedirectUris) > 0 {
			uris := make([]map[string]string, 0, len(body.RedirectUris))
			for _, u := range body.RedirectUris {
				uris = append(uris, map[string]string{"matching_mode": "strict", "url": strings.TrimSpace(u)})
			}
			patch["redirect_uris"] = uris
		}
		if strings.TrimSpace(body.SubMode) != "" {
			patch["sub_mode"] = strings.TrimSpace(body.SubMode)
		}
		if len(patch) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无可更新字段"})
			return
		}
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		if err := cli.UpdateProvider(ctx, pk, patch); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "提供程序已更新"})
	}
}

func handleAuthentikProviderDelete(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		pk, err := strconv.ParseInt(c.Param("pk"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "提供程序 ID 无效"})
			return
		}
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		if err := cli.DeleteProvider(ctx, pk); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "提供程序已删除"})
	}
}

// ── 用户：更新（基础信息 + 组关联）──

func handleAuthentikUserUpdate(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Name   string   `json:"name"`
			Email  string   `json:"email"`
			Groups []string `json:"groups"` // 组 pk 全量列表
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		pk, err := strconv.ParseInt(c.Param("uid"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "用户 ID 无效"})
			return
		}
		patch := map[string]any{}
		if body.Name != "" {
			patch["name"] = strings.TrimSpace(body.Name)
		}
		if body.Email != "" {
			patch["email"] = strings.TrimSpace(body.Email)
		}
		if body.Groups != nil {
			patch["groups"] = body.Groups
		}
		if len(patch) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无可更新字段"})
			return
		}
		cli, _, ok, err := authentikClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		if err := cli.PatchUser(ctx, pk, patch); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "用户已更新"})
	}
}

// handleAuthentikSummary 跨实例汇总（Dashboard 卡片）。
func handleAuthentikSummary(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		b := loadAuthentikSettings(app.PlatformKV())
		type instSummary struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			Enabled   bool   `json:"enabled"`
			Healthy   bool   `json:"healthy"`
			Version   string `json:"version,omitempty"`
			Users     int    `json:"users"`
			Apps      int    `json:"apps"`
			Providers int    `json:"providers"`
			Error     string `json:"error,omitempty"`
		}
		out := make([]instSummary, 0, len(b.Instances))
		ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
		defer cancel()
		for _, in := range b.Instances {
			s := instSummary{ID: in.ID, Name: in.Name, Enabled: in.Enabled}
			if in.Enabled {
				if cli, _, _, err := authentikClientFor(app, in.ID); err == nil {
					if sys, err := cli.SystemInfo(ctx); err == nil {
						s.Healthy = true
						s.Version, _ = sys["version"].(string)
						s.Users, _, s.Apps, s.Providers = cli.Counts(ctx)
					} else {
						s.Error = err.Error()
					}
				} else {
					s.Error = err.Error()
				}
			}
			out = append(out, s)
		}
		c.JSON(http.StatusOK, gin.H{"instances": out})
	}
}
