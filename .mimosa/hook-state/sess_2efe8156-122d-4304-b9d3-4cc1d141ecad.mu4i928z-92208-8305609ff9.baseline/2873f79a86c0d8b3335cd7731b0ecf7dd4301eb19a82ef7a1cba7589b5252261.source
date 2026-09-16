package main

import (
	"context"
	"kube-bt-sync/internal" // 引用模块
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	internal.ApplyGOMAXProcsFromEnv()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log.Println(">>> 初始化 kube-bt-sync 环境...")
	app, err := internal.NewServerApp(internal.DataDirFromEnv())
	if err != nil {
		log.Fatalf("加载应用状态失败: %v", err)
	}
	if app.Initialized() {
		if err := app.Cfg().Validate(); err != nil {
			log.Fatalf("配置校验失败: %v", err)
		}
	} else {
		log.Printf(">>> 尚未完成向导初始化，请浏览器访问 /setup；数据目录: %s", app.DataDir())
	}
	if app.Cfg().BaotaSkipTLSVerify {
		log.Println(">>> 宝塔 API 使用 HTTPS 且已跳过 TLS 证书校验（自签/证书与 IP 不一致时可用；正规证书可设 BAOTA_SKIP_TLS_VERIFY=false）")
	}
	if app.Initialized() && !app.Cfg().DashboardAuthEnabled() {
		log.Println(">>> 安全提示：当前未启用控制台登录（未配置本地密码且未启用 OIDC）。/api 下除探活/初始化/登录/Webhook 外均无会话鉴权，等效全员管理员；公网暴露时请务必启用 DASHBOARD_PASSWORD 或 OIDC。")
	}

	if app.K8s() == nil {
		log.Println(">>> K8s 客户端未就绪（未完成向导或集群不可达）")
	} else {
		log.Println(">>> K8s 客户端已连接")
	}

	bg := app.Cfg().EnableBackgroundJobs
	if !bg {
		log.Println(">>> KUBEBT_ENABLE_BACKGROUND_JOBS=false：本进程仅作 API/Web 副本，不启动宝塔同步、告警巡检、Pod 重启关联/报告清理、出站监视、vCenter Prom 缓存刷新、审计裁剪定时器（多副本时请保证至少一个 Pod 为 true）")
	}
	if bg {
		internal.StartBackgroundJobsWithLeaderElection(ctx, app)
	}
	internal.StartRedisReconnectLoop(ctx, app)
	internal.StartCrossPodRuntimeSync(ctx, func() *internal.ServerApp { return app })
	internal.StartRuntimeStatusRefresher(app)
	internal.StartVCenterSessionKeepalive(func() *internal.ServerApp { return app })
	internal.InitLoginSecurityState(app)
	internal.StartAuditWriter(ctx)
	internal.StartWebServer(ctx, app)
}
