package internal

import (
	"context"
	"log"
	"time"
)

// StartHarborImageIndexWorker 周期性将 Harbor 镜像（到 tag）全量索引写入 Redis；间隔 KUBEBT_HARBOR_INDEX_INTERVAL_SEC（默认 60，0 关闭）。
func StartHarborImageIndexWorker(app *ServerApp) {
	if !app.Cfg().EnableBackgroundJobs {
		return
	}
	sec := harborIndexIntervalSec()
	if sec <= 0 {
		log.Println(">>> KUBEBT_HARBOR_INDEX_INTERVAL_SEC=0：Harbor 镜像 Redis 索引后台任务已关闭")
		return
	}
	go func() {
		time.Sleep(8 * time.Second)
		for {
			if !harborConfiguredFromCfg(app.Cfg()) || app.Redis() == nil {
				time.Sleep(time.Duration(sec) * time.Second)
				continue
			}
			timeout := time.Duration(harborIndexCrawlTimeoutSec()) * time.Second
			ctx, cancel := context.WithTimeout(context.Background(), timeout)
			HarborIndexRefreshOnce(ctx, app)
			cancel()
			time.Sleep(time.Duration(sec) * time.Second)
		}
	}()
	log.Printf(">>> Harbor 镜像索引：每 %d 秒写入 Redis（需 Harbor 与 Redis 均已配置）", sec)
}
