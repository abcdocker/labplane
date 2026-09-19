package internal

import (
	"context"
	"log"
	"time"

	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/tools/cache"
)

// StartIngressWatcher 使用 SharedInformer 本地缓存监听 Ingress，并将短时间内的连续变更合并为一次同步。
func StartIngressWatcher(ctx context.Context, app *ServerApp) {
	if app == nil || app.K8s() == nil {
		return
	}
	factory := informers.NewSharedInformerFactory(app.K8s(), 10*time.Minute)
	informer := factory.Networking().V1().Ingresses().Informer()
	changed := make(chan struct{}, 1)
	notify := func(obj interface{}) {
		ing, ok := obj.(*networkingv1.Ingress)
		if !ok {
			if tombstone, tombstoneOK := obj.(cache.DeletedFinalStateUnknown); tombstoneOK {
				ing, ok = tombstone.Obj.(*networkingv1.Ingress)
			}
		}
		if !ok || ing == nil || !IsManagedIngress(ing.Annotations) {
			return
		}
		select {
		case changed <- struct{}{}:
		default:
		}
	}
	_, err := informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    notify,
		UpdateFunc: func(_, next interface{}) { notify(next) },
		DeleteFunc: notify,
	})
	if err != nil {
		log.Printf("ingress-informer: 注册事件处理器失败: %v", err)
		return
	}

	factory.Start(ctx.Done())
	if !cache.WaitForCacheSync(ctx.Done(), informer.HasSynced) {
		if ctx.Err() == nil {
			log.Printf("ingress-informer: 缓存同步失败")
		}
		return
	}
	log.Printf("ingress-informer: 已启动（10m 全量 resync，800ms 事件合并）")

	var timer *time.Timer
	var timerC <-chan time.Time
	for {
		select {
		case <-ctx.Done():
			if timer != nil {
				timer.Stop()
			}
			return
		case <-changed:
			if timer == nil {
				timer = time.NewTimer(800 * time.Millisecond)
			} else {
				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}
				timer.Reset(800 * time.Millisecond)
			}
			timerC = timer.C
		case <-timerC:
			timerC = nil
			go RunBaotaIngressSync(ctx, app, "watcher")
		}
	}
}
