package internal

import (
	"context"
	"log"
	"time"
)

type ProxyTarget struct {
	Domain           string
	TargetURL        string
	BaotaHTTPS       bool
	BaotaHTTPSConfig BaotaHTTPSConfig
	// BaotaTargetID 对应多宝塔实例 id（Ingress 注解 kube-bt-sync.io/baota-target）；空则默认实例。
	BaotaTargetID    string
	IngressNamespace string
	IngressName      string
}

func StartSyncer(ctx context.Context, app *ServerApp) {
	log.Printf("同步引擎启动 (间隔: %v)...", app.Cfg().SyncInterval)
	for {
		select {
		case <-ctx.Done():
			log.Println("同步引擎: 已停止")
			return
		default:
		}
		cfg := app.Cfg()
		if !cfg.IngressBaotaSyncEnabled {
			select {
			case <-ctx.Done():
				return
			case <-time.After(cfg.SyncInterval):
			}
			continue
		}
		k8s := app.K8s()
		if k8s != nil && len(EffectiveBaotaTargets(cfg)) > 0 {
			RunBaotaIngressSync(ctx, app, "timer")
		} else if cfg.IngressBaotaSyncEnabled {
			log.Printf("跳过 Ingress↔宝塔同步：K8s 或宝塔未配置完整")
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(cfg.SyncInterval):
		}
	}
}

// TriggerSync 由 Ingress 事件等按需触发一次同步（与定时 Syncer 并行）。
func TriggerSync(app *ServerApp) {
	if app == nil {
		return
	}
	go RunBaotaIngressSync(context.Background(), app, "watcher")
}
