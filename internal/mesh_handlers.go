package internal

// 异地组网模块 API（/api/ops/mesh）：
//   GET    /instances                       实例列表（密钥打码）
//   PUT    /instances                       新增/更新实例（AdminOnly）
//   DELETE /instances/:id                   删除实例（AdminOnly）
//   POST   /instances/:id/test              连通性测试（health + 版本）
//   GET    /instances/:id/overview          深度信息：健康/用户/节点/预授权密钥
//   GET    /instances/:id/metrics           headscale /metrics 精简解析
//   GET    /instances/:id/traffic           上次流量快照（缓存）
//   POST   /instances/:id/traffic           立即采集（AdminOnly）
//   POST   /instances/:id/nodes/:nid/expire|DELETE .../nodes/:nid   节点管理
//   POST   /instances/:id/nodes/:nid/routes 路由审批（router 管理）
//   POST   /instances/:id/nodes/:nid/tags   标签管理
//   GET    /instances/:id/keys?user=        预授权密钥列表
//   POST   /instances/:id/keys              创建预授权密钥（AdminOnly）
//   POST   /instances/:id/keys/expire       使密钥过期（AdminOnly）
//   GET    /summary                         跨实例汇总（Dashboard 工作台卡片）

import (
	"context"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func registerMeshRoutes(api gin.IRouter, app *ServerApp) {
	g := api.Group("/ops/mesh")
	g.GET("/instances", handleMeshInstancesGet(app))
	g.PUT("/instances", AdminOnlyMiddleware(app), handleMeshInstancesPut(app))
	g.DELETE("/instances/:id", AdminOnlyMiddleware(app), handleMeshInstanceDelete(app))
	g.GET("/summary", handleMeshSummary(app))
	idg := g.Group("/instances/:id")
	idg.GET("/discover", handleMeshInstanceDiscover(app))
	idg.GET("/overview", handleMeshInstanceOverview(app))
	idg.GET("/metrics", handleMeshInstanceMetrics(app))
	idg.GET("/traffic", handleMeshInstanceTrafficGet(app))
	idg.POST("/test", AdminOnlyMiddleware(app), handleMeshInstanceTest(app))
	idg.POST("/traffic", AdminOnlyMiddleware(app), handleMeshInstanceTrafficCollect(app))
	idg.POST("/nodes/:nid/expire", AdminOnlyMiddleware(app), handleMeshNodeExpire(app))
	idg.DELETE("/nodes/:nid", AdminOnlyMiddleware(app), handleMeshNodeDelete(app))
	idg.POST("/nodes/:nid/routes", AdminOnlyMiddleware(app), handleMeshNodeRoutes(app))
	idg.POST("/nodes/:nid/tags", AdminOnlyMiddleware(app), handleMeshNodeTags(app))
	idg.GET("/keys", handleMeshKeysGet(app))
	idg.POST("/keys", AdminOnlyMiddleware(app), handleMeshKeyCreate(app))
	idg.POST("/keys/expire", AdminOnlyMiddleware(app), handleMeshKeyExpire(app))
}

// meshClientFor 从 bundle 找实例并构造已鉴权客户端。
func meshClientFor(app *ServerApp, instanceID string) (*headscaleClient, MeshInstance, bool, error) {
	b := loadMeshSettings(app.PlatformKV())
	for _, in := range b.Instances {
		if in.ID != instanceID {
			continue
		}
		key, err := meshEncryptionKey(app.Cfg())
		if err != nil {
			return nil, in, true, err
		}
		apiKey, _ := decryptSecret(key, in.APIKeyEnc)
		cli, err := newHeadscaleClient(in.APIURL, apiKey, 15*time.Second)
		if err != nil {
			return nil, in, true, err
		}
		return cli, in, true, nil
	}
	return nil, MeshInstance{}, false, nil
}

func handleMeshInstancesGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		b := loadMeshSettings(app.PlatformKV())
		out := make([]map[string]any, 0, len(b.Instances))
		for _, in := range b.Instances {
			out = append(out, meshInstancePublic(in))
		}
		c.JSON(http.StatusOK, gin.H{"instances": out})
	}
}

func handleMeshInstancesPut(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var in meshInstancePutInput
		if err := c.ShouldBindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		if strings.TrimSpace(in.Name) == "" || strings.TrimSpace(in.APIURL) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "名称与 API 地址必填"})
			return
		}
		if _, err := validateMeshOutboundURL(in.APIURL); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		key, err := meshEncryptionKey(app.Cfg())
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		b := loadMeshSettings(app.PlatformKV())
		inst, _, err := upsertMeshInstance(b, in, func(p string) (string, error) { return encryptSecret(key, p) }, key)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		if err := saveMeshSettings(app.PlatformKV(), b); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "已保存", "instance": meshInstancePublic(inst)})
	}
}

func handleMeshInstanceDelete(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		b := loadMeshSettings(app.PlatformKV())
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
		if err := saveMeshSettings(app.PlatformKV(), b); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// handleMeshInstanceTest 连通性测试：health + 可用性 + 节点计数。
func handleMeshInstanceTest(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, _, ok, err := meshClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
		defer cancel()
		if err := cli.Health(ctx); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "连接失败: " + err.Error()})
			return
		}
		nodes, nerr := cli.ListNodes(ctx)
		users, uerr := cli.ListUsers(ctx)
		c.JSON(http.StatusOK, gin.H{
			"message":    "连接成功",
			"health":     true,
			"nodesCount": len(nodes),
			"usersCount": len(users),
			"nodesError": errString(nerr),
			"usersError": errString(uerr),
		})
	}
}

// handleMeshInstanceOverview 深度信息：用户 + 节点（含路由）+ 预授权密钥。
func handleMeshInstanceOverview(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, inst, ok, err := meshClientFor(app, c.Param("id"))
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
		out := gin.H{"instance": meshInstancePublic(inst)}
		if err := cli.Health(ctx); err != nil {
			out["health"] = false
			out["error"] = err.Error()
			c.JSON(http.StatusOK, out)
			return
		}
		out["health"] = true
		if users, err := cli.ListUsers(ctx); err == nil {
			out["users"] = users
		} else {
			out["usersError"] = err.Error()
		}
		nodes, nerr := cli.ListNodes(ctx)
		if nerr == nil {
			sort.Slice(nodes, func(i, j int) bool { return nodeName(nodes[i]) < nodeName(nodes[j]) })
			out["nodes"] = nodes
			// 站点聚合：把有子网路由的节点视为站点路由器
			routers := []gin.H{}
			for _, n := range nodes {
				if len(n.ApprovedRoutes) > 0 || len(n.AvailableRoutes) > 0 {
					routers = append(routers, gin.H{
						"id": n.ID, "name": nodeName(n), "online": n.Online,
						"approvedRoutes": n.ApprovedRoutes, "availableRoutes": n.AvailableRoutes,
						"lastSeen": n.LastSeen,
					})
				}
			}
			out["routers"] = routers
		} else {
			out["nodesError"] = nerr.Error()
		}
		// 密钥按用户汇总（headscale 要求按 user 查询）
		if usersRaw, ok := out["users"].([]HSUser); ok {
			keys := []HSPreAuthKey{}
			for _, u := range usersRaw {
				ks, err := cli.ListPreAuthKeys(ctx, u.Name)
				if err == nil {
					keys = append(keys, ks...)
				}
			}
			sort.Slice(keys, func(i, j int) bool { return keys[i].CreatedAt > keys[j].CreatedAt })
			out["preAuthKeys"] = keys
		}
		c.JSON(http.StatusOK, out)
	}
}

func handleMeshInstanceMetrics(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		_, inst, ok, err := meshClientFor(app, c.Param("id"))
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
		metricsURL := strings.TrimSpace(inst.MetricsURL)
		if metricsURL == "" {
			metricsURL = deriveMetricsURL(inst.APIURL)
		}
		key, _ := meshEncryptionKey(app.Cfg())
		apiKey, _ := decryptSecret(key, inst.APIKeyEnc)
		samples, err := FetchMetrics(ctx, metricsURL, apiKey, 12*time.Second)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "metricsUrl": metricsURL})
			return
		}
		c.JSON(http.StatusOK, gin.H{"metricsUrl": metricsURL, "samples": pickMeshMetrics(samples)})
	}
}

// pickMeshMetrics 只保留控制面关键序列，避免把全部 Prometheus 文本塞给前端。
func pickMeshMetrics(all []HSMetricSample) []HSMetricSample {
	prefixes := []string{
		"headscale_nodestore_nodes_total",
		"headscale_users_registered",
		"headscale_nodes_registered",
		"headscale_api_request_duration_seconds_count",
		"headscale_api_requests_total",
		"headscale_grpc_requests_total",
		"headscale_machine_registrations_total",
		"headscale_build_info",
		"headscale_database_",
		"headscale_nodestore_operations_total",
		"go_goroutines",
	}
	out := []HSMetricSample{}
	for _, s := range all {
		for _, p := range prefixes {
			if strings.HasPrefix(s.Name, p) {
				out = append(out, s)
				break
			}
		}
	}
	return out
}

// deriveMetricsURL 由 API URL 推导默认 metrics 地址（headscale 默认 :9090）。
func deriveMetricsURL(apiURL string) string {
	u, err := validateMeshOutboundURL(apiURL)
	if err != nil {
		return ""
	}
	host := u.Hostname()
	port := "9090"
	return "http://" + host + ":" + port + "/metrics"
}

func handleMeshNodeExpire(app *ServerApp) gin.HandlerFunc {
	return meshNodeAction(app, func(cli *headscaleClient, nid string, _ *gin.Context) error {
		ctx, cancel := reqCtx()
		defer cancel()
		return cli.ExpireNode(ctx, nid)
	})
}

func handleMeshNodeDelete(app *ServerApp) gin.HandlerFunc {
	return meshNodeAction(app, func(cli *headscaleClient, nid string, _ *gin.Context) error {
		ctx, cancel := reqCtx()
		defer cancel()
		return cli.DeleteNode(ctx, nid)
	})
}

func handleMeshNodeRoutes(app *ServerApp) gin.HandlerFunc {
	return meshNodeAction(app, func(cli *headscaleClient, nid string, c *gin.Context) error {
		var body struct {
			Routes []string `json:"routes"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			return err
		}
		ctx, cancel := reqCtx()
		defer cancel()
		return cli.SetApprovedRoutes(ctx, nid, body.Routes)
	})
}

func handleMeshNodeTags(app *ServerApp) gin.HandlerFunc {
	return meshNodeAction(app, func(cli *headscaleClient, nid string, c *gin.Context) error {
		var body struct {
			Tags []string `json:"tags"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			return err
		}
		ctx, cancel := reqCtx()
		defer cancel()
		return cli.SetTags(ctx, nid, body.Tags)
	})
}

func meshNodeAction(app *ServerApp, fn func(*headscaleClient, string, *gin.Context) error) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, _, ok, err := meshClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := fn(cli, c.Param("nid"), c); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "已执行"})
	}
}

func handleMeshKeysGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, _, ok, err := meshClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		user := strings.TrimSpace(c.Query("user"))
		if user == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 user 参数"})
			return
		}
		ctx, cancel := reqCtx()
		defer cancel()
		keys, err := cli.ListPreAuthKeys(ctx, user)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"preAuthKeys": keys})
	}
}

func handleMeshKeyCreate(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			User      string   `json:"user"`
			Reusable  bool     `json:"reusable"`
			Ephemeral bool     `json:"ephemeral"`
			Hours     int      `json:"hours"` // 有效期小时；0=1h
			AclTags   []string `json:"aclTags"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		cli, _, ok, err := meshClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		hours := body.Hours
		if hours <= 0 {
			hours = 1
		}
		exp := time.Now().Add(time.Duration(hours) * time.Hour)
		ctx, cancel := reqCtx()
		defer cancel()
		k, err := cli.CreatePreAuthKey(ctx, strings.TrimSpace(body.User), body.Reusable, body.Ephemeral, &exp, body.AclTags)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "已创建", "key": k})
	}
}

func handleMeshKeyExpire(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			User string `json:"user"`
			Key  string `json:"key"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		cli, _, ok, err := meshClientFor(app, c.Param("id"))
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
		if err := cli.ExpirePreAuthKey(ctx, strings.TrimSpace(body.User), strings.TrimSpace(body.Key)); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "已过期"})
	}
}

func handleMeshInstanceTrafficCollect(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		_, inst, ok, _ := meshClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if len(inst.TrafficCollectors) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "实例未配置流量采集器"})
			return
		}
		snaps := collectMeshTrafficAll(app, inst)
		c.JSON(http.StatusOK, gin.H{"snapshots": snaps})
	}
}

func handleMeshInstanceTrafficGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		_, inst, ok, _ := meshClientFor(app, c.Param("id"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		cache := loadMeshTrafficCache(app.PlatformKV())
		snaps := []MeshTrafficSnapshot{}
		for _, col := range inst.TrafficCollectors {
			if s, ok := cache[col.ID]; ok {
				snaps = append(snaps, s)
			}
		}
		c.JSON(http.StatusOK, gin.H{"snapshots": snaps})
	}
}

// handleMeshSummary 跨实例汇总（Dashboard 卡片）；单实例失败不阻塞整体。
func handleMeshSummary(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		b := loadMeshSettings(app.PlatformKV())
		type instSummary struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			Region      string `json:"region,omitempty"`
			Enabled     bool   `json:"enabled"`
			Healthy     bool   `json:"healthy"`
			NodesTotal  int    `json:"nodesTotal"`
			NodesOnline int    `json:"nodesOnline"`
			Routes      int    `json:"routesApproved"`
			Error       string `json:"error,omitempty"`
		}
		out := make([]instSummary, 0, len(b.Instances))
		ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
		defer cancel()
		for _, in := range b.Instances {
			s := instSummary{ID: in.ID, Name: in.Name, Region: in.Region, Enabled: in.Enabled}
			if in.Enabled {
				if cli, _, _, err := meshClientFor(app, in.ID); err == nil {
					if nodes, err := cli.ListNodes(ctx); err == nil {
						s.Healthy = true
						s.NodesTotal = len(nodes)
						for _, n := range nodes {
							if n.Online {
								s.NodesOnline++
							}
							s.Routes += len(n.ApprovedRoutes)
						}
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

// ── 全局自动发现 ──

// MeshDiscoveredNode 节点 + 从节点侧采集合并的客户端信息。
// headscale v0.26+ API 不再返回客户端 OS/版本，设备类型由流量采集器（tailscale status）补齐。
type MeshDiscoveredNode struct {
	HSNode
	OS            string `json:"os,omitempty"`
	ClientVersion string `json:"clientVersion,omitempty"`
}

// MeshSite 自动发现的站点（子网路由器宣告的 CIDR）。
type MeshSite struct {
	Subnet      string `json:"subnet"`
	Router      string `json:"router"`
	RouterID    string `json:"routerId"`
	Approved    bool   `json:"approved"`
	Online      bool   `json:"online"`
	LastSeen    string `json:"lastSeen,omitempty"`
	TailscaleIP string `json:"tailscaleIp,omitempty"`
}

// MeshLink 站点间/节点间链路（来自路由节点侧快照）。
type MeshLink struct {
	From    string `json:"from"`
	To      string `json:"to"`
	Via     string `json:"via"` // direct | relay
	CurAddr string `json:"curAddr,omitempty"`
	Relay   string `json:"relay,omitempty"`
	RxBytes int64  `json:"rxBytes"`
	TxBytes int64  `json:"txBytes"`
	SeenAt  string `json:"seenAt,omitempty"`
}

// MeshCollectorSuggestion 建议新增的流量采集器（有子网路由但尚未配置采集器的节点）。
type MeshCollectorSuggestion struct {
	RouterID string `json:"routerId"`
	Name     string `json:"name"`
	Host     string `json:"host"` // 节点 Tailscale IP
	Port     int    `json:"port"`
}

// handleMeshInstanceDiscover 一次调用发现：健康/版本 + 用户 + 节点（含加入时间、
// 注册方式、设备类型合并）+ 站点 + 链路 + 预授权密钥 + 采集器建议。
func handleMeshInstanceDiscover(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cli, inst, ok, err := meshClientFor(app, c.Param("id"))
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

		out := gin.H{"instance": meshInstancePublic(inst)}

		// 流量缓存：节点侧信息来源（OS/版本/链路）
		cache := loadMeshTrafficCache(app.PlatformKV())
		byIP := map[string]MeshTrafficPeer{}
		byHost := map[string]MeshTrafficPeer{}
		for _, s := range cache {
			for _, p := range s.Peers {
				for _, ip := range p.TailscaleIPs {
					if strings.HasPrefix(ip, "100.") {
						byIP[ip] = p
					}
				}
				if hn := strings.ToLower(strings.TrimSpace(p.HostName)); hn != "" {
					byHost[hn] = p
				}
			}
		}

		// 版本：/metrics build info（best-effort）
		if key, err := meshEncryptionKey(app.Cfg()); err == nil {
			apiKey, _ := decryptSecret(key, inst.APIKeyEnc)
			mURL := strings.TrimSpace(inst.MetricsURL)
			if mURL == "" {
				mURL = deriveMetricsURL(inst.APIURL)
			}
			if mURL != "" {
				if samples, err := FetchMetrics(ctx, mURL, apiKey, 8*time.Second); err == nil {
					for _, s := range samples {
						if s.Name == "headscale_build_info" {
							out["version"] = s.Labels["version"]
							break
						}
					}
				}
			}
		}

		if err := cli.Health(ctx); err != nil {
			out["health"] = false
			out["error"] = err.Error()
			c.JSON(http.StatusOK, out)
			return
		}
		out["health"] = true

		users, uerr := cli.ListUsers(ctx)
		if uerr == nil {
			out["users"] = users
		}
		nodes, nerr := cli.ListNodes(ctx)
		if nerr != nil {
			out["nodesError"] = nerr.Error()
			c.JSON(http.StatusOK, out)
			return
		}
		sort.Slice(nodes, func(i, j int) bool { return nodeName(nodes[i]) < nodeName(nodes[j]) })

		routerByName := map[string]HSNode{}
		for _, n := range nodes {
			if len(n.ApprovedRoutes) > 0 || len(n.AvailableRoutes) > 0 {
				routerByName[strings.ToLower(nodeName(n))] = n
			}
		}
		discovered := make([]MeshDiscoveredNode, 0, len(nodes))
		sites := []MeshSite{}
		suggestions := []MeshCollectorSuggestion{}
		coveredHosts := map[string]bool{}
		for _, col := range inst.TrafficCollectors {
			coveredHosts[strings.TrimSpace(col.Host)] = true
		}
		for _, n := range nodes {
			dn := MeshDiscoveredNode{HSNode: n}
			// 设备类型合并：先按 Tailscale IP，再按主机名
			var peer MeshTrafficPeer
			var found bool
			for _, ip := range n.IPAddresses {
				if p, ok := byIP[ip]; ok {
					peer, found = p, true
					break
				}
			}
			if !found {
				for _, cand := range []string{strings.ToLower(n.GivenName), strings.ToLower(n.Name)} {
					if p, ok := byHost[cand]; ok {
						peer, found = p, true
						break
					}
				}
			}
			if found {
				dn.OS = peer.OS
			}
			discovered = append(discovered, dn)
			// 站点归纳
			tsIP := firstTailscaleIP(n.IPAddresses)
			subnets := n.ApprovedRoutes
			if len(subnets) == 0 {
				subnets = n.AvailableRoutes
			}
			for _, sn := range subnets {
				sites = append(sites, MeshSite{
					Subnet: sn, Router: nodeName(n), RouterID: n.ID,
					Approved: len(n.ApprovedRoutes) > 0, Online: n.Online,
					LastSeen: n.LastSeen, TailscaleIP: tsIP,
				})
			}
			// 采集器建议：有子网路由但未按 Tailscale IP 配置采集器
			if (len(n.AvailableRoutes) > 0 || len(n.ApprovedRoutes) > 0) && tsIP != "" && !coveredHosts[tsIP] {
				suggestions = append(suggestions, MeshCollectorSuggestion{
					RouterID: n.ID, Name: nodeName(n), Host: tsIP, Port: 22,
				})
			}
		}
		out["nodes"] = discovered
		out["sites"] = sites

		// 链路：路由节点侧快照中对端也是路由器 → 站点间链路
		links := []MeshLink{}
		for _, s := range cache {
			for _, p := range s.Peers {
				if _, isRouter := routerByName[strings.ToLower(p.HostName)]; isRouter {
					via := "relay"
					if strings.TrimSpace(p.CurAddr) != "" {
						via = "direct"
					}
					links = append(links, MeshLink{
						From: s.SelfHostName, To: p.HostName, Via: via,
						CurAddr: p.CurAddr, Relay: p.Relay,
						RxBytes: p.RxBytes, TxBytes: p.TxBytes, SeenAt: s.CollectedAt,
					})
				}
			}
		}
		sort.Slice(links, func(i, j int) bool {
			return links[i].From+links[i].To < links[j].From+links[j].To
		})
		out["links"] = links
		out["collectorSuggestions"] = suggestions

		// 预授权密钥汇总
		if users != nil {
			keys := []HSPreAuthKey{}
			for _, u := range users {
				ks, err := cli.ListPreAuthKeys(ctx, u.Name)
				if err == nil {
					keys = append(keys, ks...)
				}
			}
			sort.Slice(keys, func(i, j int) bool { return keys[i].CreatedAt > keys[j].CreatedAt })
			out["preAuthKeys"] = keys
		}
		c.JSON(http.StatusOK, out)
	}
}

func firstTailscaleIP(ips []string) string {
	for _, ip := range ips {
		if strings.HasPrefix(ip, "100.") {
			return ip
		}
	}
	return ""
}

// ── 小工具 ──

func nodeName(n HSNode) string {
	if strings.TrimSpace(n.GivenName) != "" {
		return n.GivenName
	}
	return n.Name
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func reqCtx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 20*time.Second)
}
