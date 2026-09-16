package internal

import (
	"context"
	"strings"
	"time"
)

// vcenterCacheTTL 与虚拟机列表缓存一致，由 VCENTER_CACHE_TTL_SEC 控制（默认 120s）。
func vcenterCacheTTL(cfg Config) time.Duration {
	ttl := time.Duration(cfg.VCenterCacheTTLSec) * time.Second
	if ttl <= 0 {
		ttl = 120 * time.Second
	}
	return ttl
}

func vcenterVMListRedisKey(cfg Config) string {
	p := strings.TrimSpace(cfg.RedisKeyPrefix)
	if p == "" {
		return "kbts:vcenter:vms:snapshot"
	}
	return p + ":vcenter:vms:snapshot"
}

func vcenterVMListBastionRedisKey(cfg Config) string {
	return vcenterVMListRedisKey(cfg) + ":bastion:v2"
}

// vcenterBastionListCacheTTL 堡垒机 VM 列表专用缓存（默认 1h，可用 VCENTER_BASTION_VM_LIST_CACHE_TTL_SEC 调整）。
func vcenterBastionListCacheTTL(cfg Config) time.Duration {
	ttl := time.Duration(cfg.VCenterBastionVMListCacheTTLSec) * time.Second
	if ttl <= 0 {
		ttl = 3600 * time.Second
	}
	return ttl
}

func vcenterVMDetailRedisKey(cfg Config, moref string) string {
	moref = strings.TrimSpace(moref)
	if moref == "" {
		return ""
	}
	p := strings.TrimSpace(cfg.RedisKeyPrefix)
	if p == "" {
		return "kbts:vcenter:vm:detail:" + moref
	}
	return p + ":vcenter:vm:detail:" + moref
}

func vcenterHostListRedisKey(cfg Config) string {
	p := strings.TrimSpace(cfg.RedisKeyPrefix)
	if p == "" {
		return "kbts:vcenter:hosts:snapshot"
	}
	return p + ":vcenter:hosts:snapshot"
}

// vcenterInvalidateVMCaches 在虚拟机变更后删除 Redis 中的列表与单台详情快照，下次请求再拉 vCenter。
func vcenterInvalidateVMCaches(ctx context.Context, app *ServerApp, moref string) {
	rdb := app.Redis()
	if rdb == nil {
		if strings.TrimSpace(moref) != "" {
			deleteVCenterBastionFolderPath(app.PlatformKV(), moref)
		}
		return
	}
	cfg := app.Cfg()
	if dk := vcenterVMDetailRedisKey(cfg, moref); dk != "" {
		_ = rdb.Del(ctx, dk)
	}
	_ = rdb.Del(ctx, vcenterVMListRedisKey(cfg))
	_ = rdb.Del(ctx, vcenterVMListBastionRedisKey(cfg))
	if strings.TrimSpace(moref) != "" {
		deleteVCenterBastionFolderPath(app.PlatformKV(), moref)
	}
}
