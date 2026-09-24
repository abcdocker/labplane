package internal

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"strings"
	"time"

	"k8s.io/client-go/tools/leaderelection"
	"k8s.io/client-go/tools/leaderelection/resourcelock"
)

func backgroundLeaderIdentity() string {
	name := strings.TrimSpace(os.Getenv("POD_NAME"))
	if name == "" {
		name, _ = os.Hostname()
	}
	var suffix [4]byte
	_, _ = rand.Read(suffix[:])
	return strings.TrimSpace(name) + "-" + hex.EncodeToString(suffix[:])
}

func backgroundLeaderNamespace() string {
	if namespace := strings.TrimSpace(os.Getenv("POD_NAMESPACE")); namespace != "" {
		return namespace
	}
	if raw, err := os.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/namespace"); err == nil {
		if namespace := strings.TrimSpace(string(raw)); namespace != "" {
			return namespace
		}
	}
	return "labplane"
}

func startLeaderBackgroundWorkers(ctx context.Context, app *ServerApp) {
	go StartSyncer(ctx, app)
	go StartIngressWatcher(ctx, app)
	StartHostEgressWatcher(app)
	StartVCenterPrometheusMetricsRefresher(app)
	StartK8sKubeSphereChartsCacheWatcher(app)
	go BastionNativeSSHReconcileLoop(ctx, func() *ServerApp { return app })
	StartOpsCenterBackground(app)
	StartK8sRestartCorrelationWorker(app)
	StartK8sControlPlaneAdvisoryWorker(ctx, app)
	StartHarborImageIndexWorker(app)
	StartVCenterEventWorker(app)
}

// StartBackgroundJobsWithLeaderElection 保证多副本下只有 Lease 持有者运行有副作用的后台任务。
// 非 K8s 环境没有协调 API，按单进程模式直接启动。
func StartBackgroundJobsWithLeaderElection(ctx context.Context, app *ServerApp) {
	client := app.K8s()
	if client == nil || !getEnvBool("LABPLANE_LEADER_ELECTION", true) {
		log.Println("后台任务: 单进程模式（无 K8s 客户端或已显式关闭 Leader Election）")
		startLeaderBackgroundWorkers(ctx, app)
		return
	}

	lockName := strings.TrimSpace(os.Getenv("LABPLANE_LEADER_ELECTION_NAME"))
	if lockName == "" {
		lockName = "labplane-background-jobs"
	}
	identity := backgroundLeaderIdentity()
	lock, err := resourcelock.New(
		resourcelock.LeasesResourceLock,
		backgroundLeaderNamespace(),
		lockName,
		client.CoreV1(),
		client.CoordinationV1(),
		resourcelock.ResourceLockConfig{Identity: identity},
	)
	if err != nil {
		log.Printf("后台任务 Leader Election 初始化失败: %v", err)
		return
	}

	go func() {
		leaderelection.RunOrDie(ctx, leaderelection.LeaderElectionConfig{
			Lock:            lock,
			LeaseDuration:   30 * time.Second,
			RenewDeadline:   20 * time.Second,
			RetryPeriod:     5 * time.Second,
			ReleaseOnCancel: true,
			Name:            lockName,
			Callbacks: leaderelection.LeaderCallbacks{
				OnStartedLeading: func(leaderCtx context.Context) {
					log.Printf("后台任务: 当前 Pod 已成为 Leader identity=%s", identity)
					startLeaderBackgroundWorkers(leaderCtx, app)
					<-leaderCtx.Done()
				},
				OnStoppedLeading: func() {
					if ctx.Err() == nil {
						// 部分历史 worker 尚未支持 context；丢失租约时退出进程，由 K8s 重启，
						// 避免旧 Leader 与新 Leader 同时执行有副作用任务。
						log.Printf("后台任务: Leader 租约已丢失，进程退出以停止遗留 worker")
						os.Exit(1)
					}
				},
				OnNewLeader: func(newIdentity string) {
					if newIdentity != identity {
						log.Printf("后台任务: 当前 Leader=%s，本实例仅提供 Web/API", newIdentity)
					}
				},
			},
		})
	}()
}
