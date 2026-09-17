package internal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/find"
	"github.com/vmware/govmomi/object"
	"github.com/vmware/govmomi/performance"
	"github.com/vmware/govmomi/vim25/mo"
	"github.com/vmware/govmomi/vim25/types"
)

// errVCenterNotConfiguredForVMList 表示未配置 vCenter，无法拉取虚拟机列表。
var errVCenterNotConfiguredForVMList = errors.New("vCenter 未配置")

type vcenterVMSnapshotEnvelope struct {
	VMs               []gin.H `json:"vms"`
	FolderPathPending bool    `json:"folderPathPending,omitempty"`
}

const platformKVKeyVCenterBastionFolderPaths = "vcenter:bastion:folder-paths"

func loadVCenterBastionFolderPathMap(kv PlatformKV) map[string]string {
	if kv == nil {
		return map[string]string{}
	}
	raw, ok := kv.Get(platformKVKeyVCenterBastionFolderPaths)
	if !ok || strings.TrimSpace(raw) == "" {
		return map[string]string{}
	}
	var out map[string]string
	if err := json.Unmarshal([]byte(raw), &out); err != nil || out == nil {
		return map[string]string{}
	}
	return out
}

func saveVCenterBastionFolderPathMap(kv PlatformKV, paths map[string]string) {
	if kv == nil || paths == nil {
		return
	}
	b, err := json.Marshal(paths)
	if err != nil {
		return
	}
	_ = kv.Set(platformKVKeyVCenterBastionFolderPaths, string(b))
}

func deleteVCenterBastionFolderPath(kv PlatformKV, moref string) {
	kvMap := loadVCenterBastionFolderPathMap(kv)
	if len(kvMap) == 0 {
		return
	}
	delete(kvMap, strings.TrimSpace(moref))
	saveVCenterBastionFolderPathMap(kv, kvMap)
}

func buildVCenterVMSnapshotPayload(ctx context.Context, vc *vCenterClient, folderPathMap map[string]string, resolveMissingFolderPaths bool) ([]byte, bool, map[string]string, error) {
	out := make([]gin.H, 0)
	updatedFolderMap := make(map[string]string, len(folderPathMap))
	for k, v := range folderPathMap {
		updatedFolderMap[k] = v
	}
	folderPathPending := false
	err := vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
		out = out[:0]
		f := find.NewFinder(client.Client, true)
		dcs, err := f.DatacenterList(ctx, "*")
		if err != nil {
			return err
		}
		for _, dc := range dcs {
			f.SetDatacenter(dc)
			vms, err := f.VirtualMachineList(ctx, "*")
			if err != nil {
				continue
			}
			for _, vm := range vms {
				var m mo.VirtualMachine
				if err := vm.Properties(ctx, vm.Reference(), []string{"summary"}, &m); err != nil {
					continue
				}
				if m.Summary.Config.Name == "" {
					continue
				}
				ps := string(m.Summary.Runtime.PowerState)
				cpu := m.Summary.Config.NumCpu
				mem := int64(m.Summary.Config.MemorySizeMB)
				qs := m.Summary.QuickStats
				rt := m.Summary.Runtime
				cpuUse := qs.OverallCpuUsage
				maxCpu := rt.MaxCpuUsage
				cpuPct := 0.0
				if maxCpu > 0 {
					cpuPct = float64(cpuUse) / float64(maxCpu) * 100
					if cpuPct > 100 {
						cpuPct = 100
					}
				}
				guestMem := qs.GuestMemoryUsage
				hostMem := qs.HostMemoryUsage
				memUse := guestMem
				if memUse <= 0 && hostMem > 0 {
					memUse = hostMem
				}
				maxMem := rt.MaxMemoryUsage
				memPct := 0.0
				if maxMem > 0 && memUse >= 0 {
					memPct = float64(memUse) / float64(maxMem) * 100
					if memPct > 100 {
						memPct = 100
					}
				} else if mem > 0 && guestMem > 0 {
					memPct = float64(guestMem) / float64(mem) * 100
					if memPct > 100 {
						memPct = 100
					}
				}
				row := gin.H{
					"moref":              vm.Reference().Value,
					"name":               m.Summary.Config.Name,
					"powerState":         ps,
					"guestId":            m.Summary.Config.GuestId,
					"cpu":                cpu,
					"memoryMB":           mem,
					"ip":                 guestIP(m.Summary),
					"overallStatus":      string(m.Summary.OverallStatus),
					"cpuUsageMHz":        cpuUse,
					"cpuCapacityMHz":     maxCpu,
					"cpuUsagePercent":    roundPct1(cpuPct),
					"memoryUsageMB":      memUse,
					"memoryMaxMB":        maxMem,
					"memoryUsagePercent": roundPct1(memPct),
					"uptimeSec":          qs.UptimeSeconds,
				}
				if dp := vmDiskStorageUsagePct(m.Summary.Storage); dp != nil {
					row["diskUsagePercent"] = *dp
				}
				moref := vm.Reference().Value
				if fp := strings.TrimSpace(updatedFolderMap[moref]); fp != "" {
					row["folderPath"] = fp
				} else if resolveMissingFolderPaths {
					fp = vcenterVMInventoryFolderPath(ctx, client, moref)
					if fp != "" {
						row["folderPath"] = fp
						updatedFolderMap[moref] = fp
					}
				} else if folderPathMap != nil {
					folderPathPending = true
				}
				out = append(out, row)
			}
		}
		return nil
	})
	if err != nil {
		return nil, false, nil, err
	}
	payload, err := json.Marshal(vcenterVMSnapshotEnvelope{
		VMs:               out,
		FolderPathPending: folderPathPending,
	})
	return payload, folderPathPending, updatedFolderMap, err
}

func vcenterSnapshotFolderPathPending(payload []byte) bool {
	var env struct {
		FolderPathPending bool `json:"folderPathPending"`
	}
	if err := json.Unmarshal(payload, &env); err != nil {
		return false
	}
	return env.FolderPathPending
}

func storeVCenterVMSnapshotPayload(ctx context.Context, app *ServerApp, key string, ttl time.Duration, payload []byte) {
	if len(payload) == 0 {
		return
	}
	if rdb := app.Redis(); rdb != nil {
		_ = rdb.Set(ctx, key, payload, ttl)
	}
	if kv := app.PlatformKV(); kv != nil {
		_ = kv.Set("vcenter:vms:snapshot", string(payload))
		if app.Cfg().RuntimeDualWriteRedis {
			if rdb := app.Redis(); rdb != nil {
				mctx, cancel := context.WithTimeout(ctx, 12*time.Second)
				defer cancel()
				_ = MirrorPlatformKVToRedis(mctx, rdb, app.Cfg(), kv.Snapshot())
			}
		}
	}
}

func warmVCenterBastionFolderCacheAsync(app *ServerApp) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		defer cancel()
		vc := app.VCenter()
		if vc == nil || !vc.cfg.vCenterConfigured() {
			return
		}
		folderMap := loadVCenterBastionFolderPathMap(app.PlatformKV())
		payload, _, updatedFolderMap, err := buildVCenterVMSnapshotPayload(ctx, vc, folderMap, true)
		if err != nil {
			return
		}
		cfg := vc.cfg
		saveVCenterBastionFolderPathMap(app.PlatformKV(), updatedFolderMap)
		storeVCenterVMSnapshotPayload(ctx, app, vcenterVMListBastionRedisKey(cfg), vcenterBastionListCacheTTL(cfg), payload)
	}()
}

// vcenterVMListSnapshotBytes 生成与 GET /api/vcenter/vms 相同的 JSON 正文；cacheHit 为 true 时表示来自 Redis 缓存未刷新。
// bastionListCache 为 true 时使用独立 Redis 键与更长 TTL（堡垒机列表），与仪表盘短缓存分离。
func vcenterVMListSnapshotBytes(ctx context.Context, app *ServerApp, force, bastionListCache bool) (payload []byte, cacheHit bool, folderPathPending bool, err error) {
	vc := app.VCenter()
	cfg := vc.cfg
	if !cfg.vCenterConfigured() {
		return nil, false, false, errVCenterNotConfiguredForVMList
	}
	var ttl time.Duration
	var key string
	if bastionListCache {
		key = vcenterVMListBastionRedisKey(cfg)
		ttl = vcenterBastionListCacheTTL(cfg)
	} else {
		key = vcenterVMListRedisKey(cfg)
		ttl = time.Duration(cfg.VCenterCacheTTLSec) * time.Second
		if ttl <= 0 {
			ttl = 120 * time.Second
		}
	}
	if !force {
		if rdb := app.Redis(); rdb != nil {
			if s, e := rdb.Get(ctx, key); e == nil && s != "" {
				payload = []byte(s)
				return payload, true, vcenterSnapshotFolderPathPending(payload), nil
			}
		}
	}
	includeFolderPaths := !bastionListCache
	var folderMap map[string]string
	if bastionListCache {
		folderMap = loadVCenterBastionFolderPathMap(app.PlatformKV())
	}
	payload, folderPathPending, updatedFolderMap, err := buildVCenterVMSnapshotPayload(ctx, vc, folderMap, includeFolderPaths)
	if err != nil {
		return nil, false, false, err
	}
	if bastionListCache && !folderPathPending {
		saveVCenterBastionFolderPathMap(app.PlatformKV(), updatedFolderMap)
	}
	storeVCenterVMSnapshotPayload(ctx, app, key, ttl, payload)
	if bastionListCache {
		if folderPathPending {
			warmVCenterBastionFolderCacheAsync(app)
		}
	}
	return payload, false, folderPathPending, nil
}

func handleVCenterStatus(c *gin.Context, cfg Config) {
	c.JSON(http.StatusOK, gin.H{
		"configured":     cfg.vCenterConfigured(),
		"vcenterUrlHint": maskVCenterURL(cfg.VCenterURL),
	})
}

func maskVCenterURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	raw = strings.TrimPrefix(raw, "https://")
	raw = strings.TrimPrefix(raw, "http://")
	if i := strings.Index(raw, "/"); i > 0 {
		raw = raw[:i]
	}
	if i := strings.Index(raw, "@"); i >= 0 {
		raw = raw[i+1:]
	}
	return raw
}

func handleVCenterVMs(c *gin.Context, app *ServerApp) {
	ctx := c.Request.Context()
	force := c.Query("refresh") == "1" || c.Query("refresh") == "true"
	payload, cacheHit, _, err := vcenterVMListSnapshotBytes(ctx, app, force, false)
	if err != nil {
		if errors.Is(err, errVCenterNotConfiguredForVMList) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vCenter 未配置"})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "列出数据中心失败: " + err.Error()})
		return
	}
	if cacheHit {
		c.Header("X-VCenter-VM-Cache", "redis-hit")
	} else {
		c.Header("X-VCenter-VM-Cache", "miss")
	}
	c.Data(http.StatusOK, "application/json", payload)
}

func guestIP(s types.VirtualMachineSummary) string {
	if s.Guest != nil && s.Guest.IpAddress != "" {
		return s.Guest.IpAddress
	}
	return "—"
}

func handleVCenterVMDetail(c *gin.Context, app *ServerApp) {
	vc := app.VCenter()
	if !vc.cfg.vCenterConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vCenter 未配置"})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	ctx := c.Request.Context()
	force := c.Query("refresh") == "1" || c.Query("refresh") == "true"
	ttl := vcenterCacheTTL(vc.cfg)
	detailKey := vcenterVMDetailRedisKey(vc.cfg, moref)
	if !force && detailKey != "" {
		if rdb := app.Redis(); rdb != nil {
			if s, err := rdb.Get(ctx, detailKey); err == nil && s != "" {
				c.Header("X-VCenter-VM-Cache", "redis-hit")
				c.Data(http.StatusOK, "application/json", []byte(s))
				return
			}
		}
	}

	var payload []byte
	err := vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
		vm := object.NewVirtualMachine(client.Client, types.ManagedObjectReference{Type: "VirtualMachine", Value: moref})
		var m mo.VirtualMachine
		if err := vm.Properties(ctx, vm.Reference(), []string{
			"summary", "runtime", "config", "guest", "resourcePool", "datastore", "network",
		}, &m); err != nil {
			return err
		}
		h := vmDetailJSON(&m)
		var merr error
		payload, merr = json.Marshal(h)
		return merr
	})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "虚拟机不存在或无权访问: " + err.Error()})
		return
	}
	if rdb := app.Redis(); rdb != nil && detailKey != "" {
		_ = rdb.Set(ctx, detailKey, payload, ttl)
	}
	c.Header("X-VCenter-VM-Cache", "miss")
	c.Data(http.StatusOK, "application/json", payload)
}

func vmDetailJSON(m *mo.VirtualMachine) gin.H {
	h := gin.H{
		"moref": m.Self.Value,
	}
	if m.Summary.Config.Name != "" {
		h["name"] = m.Summary.Config.Name
		h["guestId"] = m.Summary.Config.GuestId
		h["uuid"] = m.Summary.Config.Uuid
		h["cpu"] = m.Summary.Config.NumCpu
		h["memoryMB"] = m.Summary.Config.MemorySizeMB
		h["template"] = m.Summary.Config.Template
	}
	if m.Config != nil {
		if m.Config.CpuHotAddEnabled != nil {
			h["cpuHotAddEnabled"] = *m.Config.CpuHotAddEnabled
		}
		if m.Config.MemoryHotAddEnabled != nil {
			h["memoryHotAddEnabled"] = *m.Config.MemoryHotAddEnabled
		}
		if disks := virtualDisksFromConfig(m.Config); len(disks) > 0 {
			h["disks"] = disks
		}
	}
	h["powerState"] = string(m.Summary.Runtime.PowerState)
	h["bootTime"] = formatTimePtr(m.Summary.Runtime.BootTime)
	if m.Summary.Runtime.Host != nil {
		h["hostMoRef"] = m.Summary.Runtime.Host.Value
	}
	if m.Summary.Guest != nil {
		h["guest"] = gin.H{
			"ip":                 m.Summary.Guest.IpAddress,
			"hostname":           m.Summary.Guest.HostName,
			"guestFullName":      m.Summary.Guest.GuestFullName,
			"toolsRunningStatus": m.Summary.Guest.ToolsRunningStatus,
			"toolsVersionStatus": m.Summary.Guest.ToolsVersionStatus2,
		}
	}
	if m.Summary.Storage != nil {
		st := m.Summary.Storage
		h["storage"] = gin.H{
			"committedBytes":   st.Committed,
			"uncommittedBytes": st.Uncommitted,
			"unsharedBytes":    st.Unshared,
		}
	}
	if m.Guest != nil {
		nets := make([]gin.H, 0, len(m.Guest.Net))
		for _, n := range m.Guest.Net {
			nets = append(nets, gin.H{
				"network": n.Network,
				"mac":     n.MacAddress,
				"ips":     n.IpAddress,
			})
		}
		h["networkInterfaces"] = nets
	}
	h["quickStats"] = quickStatsJSON(m.Summary.QuickStats)
	return h
}

func virtualDisksFromConfig(cfg *types.VirtualMachineConfigInfo) []gin.H {
	out := make([]gin.H, 0)
	for _, dev := range cfg.Hardware.Device {
		d, ok := dev.(*types.VirtualDisk)
		if !ok || d == nil {
			continue
		}
		vd := &d.VirtualDevice
		label := ""
		if vd.DeviceInfo != nil {
			if desc, ok := vd.DeviceInfo.(*types.Description); ok && desc != nil {
				label = desc.Label
			}
		}
		out = append(out, gin.H{
			"key":           vd.Key,
			"label":         label,
			"capacityKB":    d.CapacityInKB,
			"unitNumber":    vd.UnitNumber,
			"controllerKey": vd.ControllerKey,
			"fileName":      diskBackingFileName(vd.Backing),
		})
	}
	return out
}

func diskBackingFileName(b types.BaseVirtualDeviceBackingInfo) string {
	if b == nil {
		return ""
	}
	switch t := b.(type) {
	case *types.VirtualDiskFlatVer2BackingInfo:
		return t.FileName
	case *types.VirtualDiskSparseVer2BackingInfo:
		return t.FileName
	case *types.VirtualDiskFlatVer1BackingInfo:
		return t.FileName
	case *types.VirtualDiskSparseVer1BackingInfo:
		return t.FileName
	case *types.VirtualDiskRawDiskMappingVer1BackingInfo:
		return t.FileName
	case *types.VirtualDiskSeSparseBackingInfo:
		return t.FileName
	default:
		return ""
	}
}

// handleVCenterVMQuickStats 实时拉取单台虚拟机的 QuickStats（仅 summary 属性，无缓存）。
// 供堡垒机主机概览以 20s 间隔轮询，不影响列表缓存。
func handleVCenterVMQuickStats(c *gin.Context, app *ServerApp) {
	vc := app.VCenter()
	if !vc.cfg.vCenterConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vCenter 未配置"})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	if moref == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "moref 为空"})
		return
	}
	ctx := c.Request.Context()
	var result gin.H
	err := vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
		vm := object.NewVirtualMachine(client.Client, types.ManagedObjectReference{Type: "VirtualMachine", Value: moref})
		var m mo.VirtualMachine
		if err := vm.Properties(ctx, vm.Reference(), []string{"summary"}, &m); err != nil {
			return err
		}
		cfg := m.Summary.Config
		qs := m.Summary.QuickStats
		cpuCap := int64(cfg.NumCpu) * int64(cfg.CpuReservation)
		// cpuReservation 为 0 时退回到 vCPU × 1000MHz 估算
		if cpuCap <= 0 && cfg.NumCpu > 0 {
			cpuCap = int64(cfg.NumCpu) * 1000
		}
		memTotalMB := int64(cfg.MemorySizeMB)
		cpuPct := 0.0
		if cpuCap > 0 && qs.OverallCpuUsage > 0 {
			cpuPct = math.Round(float64(qs.OverallCpuUsage)/float64(cpuCap)*1000) / 10
			if cpuPct > 100 {
				cpuPct = 100
			}
		}
		memPct := 0.0
		if memTotalMB > 0 && qs.GuestMemoryUsage > 0 {
			memPct = math.Round(float64(qs.GuestMemoryUsage)/float64(memTotalMB)*1000) / 10
			if memPct > 100 {
				memPct = 100
			}
		}
		result = gin.H{
			"moref":              moref,
			"cpuUsageMHz":        qs.OverallCpuUsage,
			"cpuCapacityMHz":     cpuCap,
			"cpuUsagePercent":    cpuPct,
			"memoryUsageMB":      qs.GuestMemoryUsage,
			"memoryMaxMB":        memTotalMB,
			"memoryUsagePercent": memPct,
			"uptimeSec":          qs.UptimeSeconds,
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// netPerfSample 为单个采样点：时间戳（Unix 秒）、收发速率（KBps）。
type netPerfSample struct {
	Ts    int64   `json:"ts"`
	RxKBs float64 `json:"rxKBs"`
	TxKBs float64 `json:"txKBs"`
}

// handleVCenterVMNetPerf 查询单台虚拟机最近 ~5 分钟的网络收发趋势（20s 采样间隔）。
// 数据来自 vCenter 实时性能计数器 net.bytesRx/Tx.average（单位 KBps）。
func handleVCenterVMNetPerf(c *gin.Context, app *ServerApp) {
	vc := app.VCenter()
	if !vc.cfg.vCenterConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vCenter 未配置"})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	if moref == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "moref 为空"})
		return
	}
	ctx := c.Request.Context()

	type result struct {
		Moref   string          `json:"moref"`
		Samples []netPerfSample `json:"samples"`
	}
	var out result
	out.Moref = moref

	err := vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
		pm := performance.NewManager(client.Client)
		ref := types.ManagedObjectReference{Type: "VirtualMachine", Value: moref}

		// 实时间隔 20s；拉取最近 15 个点（约 5 分钟），以 "" 实例合计所有网卡。
		spec := types.PerfQuerySpec{
			MaxSample:  15,
			MetricId:   []types.PerfMetricId{{Instance: ""}},
			IntervalId: 20,
		}
		metrics := []string{"net.bytesRx.average", "net.bytesTx.average"}
		raw, err := pm.SampleByName(ctx, spec, metrics, []types.ManagedObjectReference{ref})
		if err != nil {
			return err
		}
		series, err := pm.ToMetricSeries(ctx, raw)
		if err != nil {
			return err
		}
		if len(series) == 0 {
			return nil
		}
		em := series[0]

		// 建立时间戳列表
		timestamps := make([]int64, len(em.SampleInfo))
		for i, si := range em.SampleInfo {
			timestamps[i] = si.Timestamp.Unix()
		}

		// 按名称收集收/发序列
		rxVals := make([]int64, len(timestamps))
		txVals := make([]int64, len(timestamps))
		for _, ms := range em.Value {
			switch ms.Name {
			case "net.bytesRx.average":
				for i, v := range ms.Value {
					if i < len(rxVals) {
						rxVals[i] += v
					}
				}
			case "net.bytesTx.average":
				for i, v := range ms.Value {
					if i < len(txVals) {
						txVals[i] += v
					}
				}
			}
		}

		out.Samples = make([]netPerfSample, len(timestamps))
		for i, ts := range timestamps {
			out.Samples[i] = netPerfSample{
				Ts:    ts,
				RxKBs: float64(rxVals[i]),
				TxKBs: float64(txVals[i]),
			}
		}
		return nil
	})
	if err != nil {
		// 性能数据不可用时返回空 samples，前端降级显示
		c.JSON(http.StatusOK, result{Moref: moref, Samples: []netPerfSample{}})
		return
	}
	c.JSON(http.StatusOK, out)
}

func quickStatsJSON(qs types.VirtualMachineQuickStats) gin.H {
	return gin.H{
		"cpuUsageMHz":        qs.OverallCpuUsage,
		"cpuDemandMHz":       qs.OverallCpuDemand,
		"cpuReadinessPct":    qs.OverallCpuReadiness,
		"guestMemoryUsageMB": qs.GuestMemoryUsage,
		"hostMemoryUsageMB":  qs.HostMemoryUsage,
		"uptimeSeconds":      qs.UptimeSeconds,
		"balloonedMemoryMB":  qs.BalloonedMemory,
		"swappedMemoryMB":    qs.SwappedMemory,
		"grantedMemoryMB":    qs.GrantedMemory,
		"privateMemoryMB":    qs.PrivateMemory,
		"sharedMemoryMB":     qs.SharedMemory,
		"activeMemoryMB":     qs.ActiveMemory,
	}
}

func formatTimePtr(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func roundPct1(v float64) float64 {
	if v <= 0 || math.IsNaN(v) || math.IsInf(v, 0) {
		return 0
	}
	return math.Round(v*10) / 10
}

// vmDiskStorageUsagePct 虚拟机存储「已提交 / (已提交 + 未提交)」×100%，仅当 Uncommitted>0（薄置备尚有增长空间）时有意义。
// Uncommitted==0 时该分式恒为 100%，与来宾机 df 无关，厚置备会误显示满盘，故返回 nil。
func vmDiskStorageUsagePct(st *types.VirtualMachineStorageSummary) *float64 {
	if st == nil {
		return nil
	}
	if st.Uncommitted <= 0 {
		return nil
	}
	den := st.Committed + st.Uncommitted
	if den <= 0 {
		return nil
	}
	p := float64(st.Committed) / float64(den) * 100
	if p > 100 {
		p = 100
	}
	v := roundPct1(p)
	return &v
}

func hostRowFromMO(m *mo.HostSystem, ref string) gin.H {
	name := strings.TrimSpace(m.Summary.Config.Name)
	if name == "" {
		name = strings.TrimSpace(m.Name)
	}
	if name == "" {
		name = ref
	}
	qs := m.Summary.QuickStats
	var hw *types.HostHardwareSummary
	if m.Summary.Hardware != nil {
		hw = m.Summary.Hardware
	}
	var cpuMHzTotal int64
	var memTotalMB int64
	var numCores int32
	if hw != nil {
		numCores = int32(hw.NumCpuCores)
		cpuMHzTotal = int64(hw.CpuMhz) * int64(hw.NumCpuCores)
		if hw.MemorySize > 0 {
			memTotalMB = hw.MemorySize / (1024 * 1024)
		}
	}
	cpuPct := 0.0
	if cpuMHzTotal > 0 && qs.OverallCpuUsage >= 0 {
		cpuPct = float64(qs.OverallCpuUsage) / float64(cpuMHzTotal) * 100
		if cpuPct > 100 {
			cpuPct = 100
		}
	}
	memPct := 0.0
	if memTotalMB > 0 && qs.OverallMemoryUsage >= 0 {
		memPct = float64(qs.OverallMemoryUsage) / float64(memTotalMB) * 100
		if memPct > 100 {
			memPct = 100
		}
	}
	esxi := ""
	if m.Summary.Config.Product != nil {
		esxi = strings.TrimSpace(m.Summary.Config.Product.FullName)
	}
	row := gin.H{
		"moref":           ref,
		"name":            name,
		"connectionState": string(m.Runtime.ConnectionState),
		"overallStatus":   string(m.Summary.OverallStatus),
		"cpuCores":        numCores,
		"cpuMhzPerCore": func() int32 {
			if hw != nil {
				return hw.CpuMhz
			}
			return 0
		}(),
		"cpuUsageMHz":        qs.OverallCpuUsage,
		"cpuCapacityMHz":     cpuMHzTotal,
		"cpuUsagePercent":    roundPct1(cpuPct),
		"memoryTotalMB":      memTotalMB,
		"memoryUsageMB":      qs.OverallMemoryUsage,
		"memoryUsagePercent": roundPct1(memPct),
		"uptimeSec":          qs.Uptime,
		"esxiVersion":        esxi,
	}
	if hw != nil {
		row["vendor"] = hw.Vendor
		row["model"] = hw.Model
	}
	return row
}

// normalizeHostSystemMorefParam 规范化路由中的宿主机 moRef：URL 解码、HostSystem:host-21 形式、纯数字 → host-数字。
func normalizeHostSystemMorefParam(raw string) string {
	moref := strings.TrimSpace(raw)
	if moref == "" {
		return ""
	}
	if u, err := url.PathUnescape(moref); err == nil {
		moref = strings.TrimSpace(u)
	}
	if strings.Contains(moref, ":") {
		i := strings.LastIndex(moref, ":")
		if i > 0 && i < len(moref)-1 {
			left := strings.TrimSpace(moref[:i])
			right := strings.TrimSpace(moref[i+1:])
			if strings.HasSuffix(left, "HostSystem") && right != "" {
				moref = right
			}
		}
	}
	if moref != "" && !strings.Contains(moref, ":") {
		if n, err := strconv.Atoi(moref); err == nil && n >= 0 {
			moref = "host-" + strconv.Itoa(n)
		}
	}
	return moref
}

// vcenterHostDetailErrorStatus 区分「对象不存在」与「vCenter/网关 HTTP 异常」（如 POST /sdk 返回非 2xx）。
func vcenterHostDetailErrorStatus(err error) int {
	if err == nil {
		return http.StatusOK
	}
	var uerr *url.Error
	if errors.As(err, &uerr) && uerr != nil && uerr.Op == http.MethodPost && strings.Contains(uerr.URL, "sdk") {
		return http.StatusBadGateway
	}
	return http.StatusNotFound
}

// hostManagementVmIPv4 从 HostSystem.config.network.vnic 取首个有效 IPv4（常为管理网 vmk）。
func hostManagementVmIPv4(m *mo.HostSystem) string {
	if m == nil || m.Config == nil || m.Config.Network == nil {
		return ""
	}
	for _, vn := range m.Config.Network.Vnic {
		if vn.Spec.Ip == nil {
			continue
		}
		ip := strings.TrimSpace(vn.Spec.Ip.IpAddress)
		if ip != "" && ip != "0.0.0.0" {
			return ip
		}
	}
	return ""
}

// handleVCenterHostDetail 仅返回宿主机名称与管理网 IP，供详情页标题及 Prometheus host_name 过滤使用。
func handleVCenterHostDetail(c *gin.Context, app *ServerApp) {
	cfg := app.Cfg()
	vc := app.VCenter()
	if !cfg.vCenterConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vCenter 未配置"})
		return
	}
	moref := normalizeHostSystemMorefParam(c.Param("moref"))
	if moref == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少宿主机 moref"})
		return
	}
	ctx := c.Request.Context()
	var row gin.H
	err := vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
		hs := object.NewHostSystem(client.Client, types.ManagedObjectReference{Type: "HostSystem", Value: moref})
		var m mo.HostSystem
		// 与列表接口一致，避免整包拉取 config 触发部分 vCenter/网关异常（如 HTTP 465）。
		if err := hs.Properties(ctx, hs.Reference(), []string{"name", "summary", "runtime"}, &m); err != nil {
			return err
		}
		name := strings.TrimSpace(m.Summary.Config.Name)
		if name == "" {
			name = strings.TrimSpace(m.Name)
		}
		if name == "" {
			name = moref
		}
		r := gin.H{
			"moref": moref,
			"name":  name,
		}
		var mNet mo.HostSystem
		if err := hs.Properties(ctx, hs.Reference(), []string{"config.network.vnic"}, &mNet); err == nil {
			if ip := hostManagementVmIPv4(&mNet); ip != "" {
				r["managementVmkIp"] = ip
			}
		}
		row = r
		return nil
	})
	if err != nil {
		st := vcenterHostDetailErrorStatus(err)
		msg := "宿主机不存在或无权访问: " + err.Error()
		if st == http.StatusBadGateway {
			msg = "vCenter 连接异常（非对象不存在）: " + err.Error()
		}
		c.JSON(st, gin.H{"error": msg})
		return
	}
	c.JSON(http.StatusOK, gin.H{"host": row})
}

// handleVCenterHosts 列出 ESXi 宿主机及 QuickStats 资源使用率（CPU/Mem）。
// 结果缓存在 Redis 中，TTL 与虚拟机列表一致；?refresh=1 强制刷新。
func handleVCenterHosts(c *gin.Context, app *ServerApp) {
	vc := app.VCenter()
	cfg := vc.cfg
	if !cfg.vCenterConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vCenter 未配置"})
		return
	}
	ctx := c.Request.Context()
	force := c.Query("refresh") == "1" || c.Query("refresh") == "true"
	ttl := vcenterCacheTTL(cfg)
	cacheKey := vcenterHostListRedisKey(cfg)

	if !force {
		if rdb := app.Redis(); rdb != nil {
			if s, e := rdb.Get(ctx, cacheKey); e == nil && s != "" {
				c.Header("X-VCenter-Hosts-Cache", "redis-hit")
				c.Data(http.StatusOK, "application/json", []byte(s))
				return
			}
		}
	}

	out := make([]gin.H, 0)
	err := vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
		out = out[:0]
		f := find.NewFinder(client.Client, true)
		dcs, err := f.DatacenterList(ctx, "*")
		if err != nil {
			return err
		}
		seen := make(map[string]struct{})
		for _, dc := range dcs {
			f.SetDatacenter(dc)
			hosts, err := f.HostSystemList(ctx, "*")
			if err != nil {
				continue
			}
			for _, hs := range hosts {
				ref := hs.Reference().Value
				if _, ok := seen[ref]; ok {
					continue
				}
				seen[ref] = struct{}{}
				var m mo.HostSystem
				if err := hs.Properties(ctx, hs.Reference(), []string{"name", "summary", "runtime"}, &m); err != nil {
					continue
				}
				out = append(out, hostRowFromMO(&m, ref))
			}
		}
		return nil
	})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "列出数据中心失败: " + err.Error()})
		return
	}
	payload, merr := json.Marshal(gin.H{"hosts": out})
	if merr != nil {
		c.JSON(http.StatusOK, gin.H{"hosts": out})
		return
	}
	if rdb := app.Redis(); rdb != nil {
		_ = rdb.Set(ctx, cacheKey, payload, ttl)
	}
	c.Header("X-VCenter-Hosts-Cache", "miss")
	c.Data(http.StatusOK, "application/json", payload)
}

func handleVCenterVMWebmks(c *gin.Context, vc *vCenterClient, app *ServerApp) {
	if !vc.cfg.vCenterConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vCenter 未配置"})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	if vcenterBastionAbortIfForbidden(c, app, moref) {
		return
	}
	ctx := c.Request.Context()
	var powerState types.VirtualMachinePowerState
	err := vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
		vm := object.NewVirtualMachine(client.Client, types.ManagedObjectReference{Type: "VirtualMachine", Value: moref})
		state, e := vm.PowerState(ctx)
		powerState = state
		return e
	})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "读取虚拟机电源状态失败: " + err.Error()})
		return
	}
	if powerState != types.VirtualMachinePowerStatePoweredOn {
		c.JSON(http.StatusBadRequest, gin.H{"error": "虚拟机需处于开机状态才能打开 WebMKS 控制台"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"ready":      true,
		"powerState": string(powerState),
		"proxyPath":  fmt.Sprintf("/api/vcenter/vms/%s/console-ws", url.PathEscape(moref)),
		"hint":       "WebMKS ticket 仅在同源 WebSocket 握手时由服务端即时申请，不再通过 JSON 暴露给浏览器。",
	})
}

func registerVCenterRoutes(api *gin.RouterGroup, app *ServerApp) {
	api.GET("/vcenter/prometheus-metrics", func(c *gin.Context) { handleVCenterPrometheusMetrics(c, app) })
	api.GET("/vcenter/status", func(c *gin.Context) { handleVCenterStatus(c, app.Cfg()) })
	api.GET("/vcenter/hosts/:moref", func(c *gin.Context) { handleVCenterHostDetail(c, app) })
	api.GET("/vcenter/hosts", func(c *gin.Context) { handleVCenterHosts(c, app) })
	api.GET("/vcenter/vms/perf-snapshot", func(c *gin.Context) { handleVCenterVMsPerfSnapshot(c, app.VCenter()) })
	api.GET("/vcenter/vms/io-prometheus", func(c *gin.Context) { handleVCenterVMsPrometheusIO(c, app.Cfg()) })
	api.GET("/vcenter/vms/ikuai-client-stream", func(c *gin.Context) { handleVCenterVMsIkuaiClientStream(c, app.Cfg()) })
	api.GET("/vcenter/vms", func(c *gin.Context) { handleVCenterVMs(c, app) })
	api.GET("/vcenter/bastion/vms", func(c *gin.Context) { handleGetVCenterBastionVMs(c, app) })
	api.GET("/vcenter/bastion/extra/:id/ssh/ws", func(c *gin.Context) { handleBastionExtraSSHWS(c, app) })
	api.GET("/vcenter/bastion/extra/:id/sftp/ws", func(c *gin.Context) { handleBastionExtraSFTPWS(c, app) })
	api.GET("/vcenter/bastion/policy", AdminOnlyMiddleware(app), func(c *gin.Context) { handleGetVCenterBastionPolicy(c, app) })
	api.PUT("/vcenter/bastion/policy", AdminOnlyMiddleware(app), func(c *gin.Context) { handlePutVCenterBastionPolicy(c, app) })
	api.GET("/vcenter/bastion/native-ssh", func(c *gin.Context) { handleGetBastionNativeSshInfo(c, app) })
	// 所有 /vcenter/vms/:moref/<子路径> 必须注册在 GET /vcenter/vms/:moref 之前，否则 httprouter 会匹配错误并返回 404。
	api.GET("/vcenter/vms/:moref/quickstats", func(c *gin.Context) { handleVCenterVMQuickStats(c, app) })
	api.GET("/vcenter/vms/:moref/netperf", func(c *gin.Context) { handleVCenterVMNetPerf(c, app) })
	api.GET("/vcenter/vms/:moref/listening-ports", func(c *gin.Context) { handleVCenterVMListeningPorts(c, app) })
	api.GET("/vcenter/vms/:moref/tcp-established", func(c *gin.Context) { handleVCenterVMTcpEstablished(c, app) })
	api.GET("/vcenter/vms/:moref/metrics", func(c *gin.Context) { handleVCenterVMMetrics(c, app.VCenter()) })
	api.GET("/vcenter/vms/:moref/webmks", func(c *gin.Context) { handleVCenterVMWebmks(c, app.VCenter(), app) })
	api.GET("/vcenter/vms/:moref/console-ws", func(c *gin.Context) { handleVCenterConsoleWS(c, app.VCenter(), app) })
	api.GET("/vcenter/vms/:moref/ssh-settings", func(c *gin.Context) { handleGetVCenterVMSSHSettings(c, app.Cfg(), app.SSHStore()) })
	api.PUT("/vcenter/vms/:moref/ssh-settings", func(c *gin.Context) { handlePutVCenterVMSSHSettings(c, app.Cfg(), app.SSHStore()) })
	api.DELETE("/vcenter/vms/:moref/ssh-settings", func(c *gin.Context) { handleDeleteVCenterVMSSHSettings(c, app.Cfg(), app.SSHStore()) })
	api.GET("/vcenter/vms/:moref/ssh/ws", func(c *gin.Context) { handleVCenterVMSSHWS(c, app.VCenter(), app.Cfg(), app.SSHStore(), app) })
	api.GET("/vcenter/vms/:moref/sftp/ws", func(c *gin.Context) { handleVCenterVMSFTPWS(c, app) })
	api.POST("/vcenter/vms/:moref/power", func(c *gin.Context) { handleVCenterVMPower(c, app) })
	api.GET("/vcenter/tasks/:taskId", func(c *gin.Context) { handleVCenterTaskStatus(c, app.VCenter()) })
	api.PUT("/vcenter/vms/:moref/hardware", func(c *gin.Context) { handleVCenterVMHardware(c, app) })
	api.POST("/vcenter/vms/:moref/disk/expand", func(c *gin.Context) { handleVCenterVMDiskExpand(c, app) })
	api.POST("/vcenter/vms/:moref/screen-resolution", func(c *gin.Context) { handleVCenterVMSetScreenResolution(c, app) })
	api.GET("/vcenter/vms/:moref", func(c *gin.Context) { handleVCenterVMDetail(c, app) })
	api.GET("/idrac/vnc-ws", func(c *gin.Context) { handleIdracVNCWS(c, app) })
	api.GET("/vcenter/events", func(c *gin.Context) { handleGetVCenterVMEvents(c, app) })
}

// handleGetVCenterVMEvents 返回后台采集的 VM 电源与配置变更事件列表。
// 查询参数：limit（默认 100，最大 500），hours（过去 N 小时，默认 24）。
func handleGetVCenterVMEvents(c *gin.Context, app *ServerApp) {
	limit := 100
	if v, _ := c.GetQuery("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			if n > vcenterEventMaxStore {
				n = vcenterEventMaxStore
			}
			limit = n
		}
	}
	hours := 24
	if v, _ := c.GetQuery("hours"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			hours = n
		}
	}
	events, updatedAt := GetVCenterVMEvents(app.PlatformKV(), limit, hours)
	if events == nil {
		events = []vcenterVMEventRecord{}
	}
	c.JSON(http.StatusOK, gin.H{
		"events":    events,
		"total":     len(events),
		"updatedAt": updatedAt,
	})
}
