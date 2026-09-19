package internal

import (
	"context"
	"log"
	"time"
)

// StartCrossPodRuntimeSync 在配置 MySQL 时轮询 kubebt_schema_meta.runtime_config_revision；
// 任意 Pod 保存 runtime 后修订号变化，其余 Pod 自动 Reload，使多副本内存配置与连接态一致。
func StartCrossPodRuntimeSync(ctx context.Context, getApp func() *ServerApp) {
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		var lastRev string
		for {
			select {
			case <-ctx.Done():
				log.Println("cluster-sync: 已停止")
				return
			case <-ticker.C:
			}
			app := getApp()
			if app == nil {
				continue
			}
			db := app.MySQLDB()
			if db == nil {
				continue
			}
			cur, err := mysqlGetSchemaMeta(db, schemaMetaKeyRuntimeRevision)
			if err != nil || cur == "" {
				if lastRev == "" {
					continue
				}
				// 修订被清空等异常：不刷
				continue
			}
			if lastRev == "" {
				lastRev = cur
				continue
			}
			if cur == lastRev {
				continue
			}
			log.Printf("cluster-sync: 检测到 runtime 修订更新 (%s -> %s)，本 Pod 执行 Reload", lastRev, cur)
			if err := app.Reload(); err != nil {
				log.Printf("cluster-sync: Reload 失败: %v", err)
				continue
			}
			lastRev = cur
		}
	}()
	log.Println("cluster-sync: 已启动跨 Pod runtime 修订轮询（依赖 MySQL）")
}
