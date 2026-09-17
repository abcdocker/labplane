package internal

import (
	"context"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/find"
	"github.com/vmware/govmomi/object"
	"github.com/vmware/govmomi/performance"
	"github.com/vmware/govmomi/vim25/mo"
	"github.com/vmware/govmomi/vim25/types"
)

// vSphere 虚拟机常用性能计数器（历史区间）
// 说明：disk.read/write 在多数环境中仅有「按盘」实例，无聚合实例；需从 AvailableMetric 展开各 instance 再 QueryPerf 后求和。
// virtualDisk.* 作为 disk.* 无数据时的备选（按虚拟磁盘求和，与 disk 组含义接近）。
var vmPerfCounterNames = []string{
	"cpu.usage.average",
	"mem.usage.average",
	"disk.read.average",
	"disk.write.average",
	"virtualDisk.read.average",
	"virtualDisk.write.average",
	"net.received.average",
	"net.transmitted.average",
	"net.bytesRx.average",
	"net.bytesTx.average",
}

// vmDiskNetRealtimeNames 虚拟机磁盘/网络实时采样（近 1 小时窗口，与详情页性能图表同源计数器；列表取时间序列最新点）
var vmDiskNetRealtimeNames = []string{
	"disk.read.average",
	"disk.write.average",
	"virtualDisk.read.average",
	"virtualDisk.write.average",
	"net.received.average",
	"net.transmitted.average",
	"net.bytesRx.average",
	"net.bytesTx.average",
}

// pickHistoricalSamplingPeriod 从 vCenter 已启用的历史统计档位中选「保留时长 ≥ 查询跨度」且粒度最细的一档。
// 错误用法：随意填 900s 等若不在 HistoricalInterval 里，QueryPerf 常返回空序列。
func pickHistoricalSamplingPeriod(list performance.IntervalList, days int) (int32, string) {
	needSec := int32(days * 24 * 3600)
	if needSec < 3600 {
		needSec = 3600
	}
	var best *types.PerfInterval
	var bestName string
	for i := range list {
		iv := &list[i]
		if !iv.Enabled {
			continue
		}
		if iv.Length < needSec {
			continue
		}
		if best == nil || iv.SamplingPeriod < best.SamplingPeriod {
			best = iv
			bestName = iv.Name
		}
	}
	if best != nil {
		return best.SamplingPeriod, bestName
	}
	// 没有满足保留时长的档位时，用已启用中保留最久的一档，避免完全无数据
	var fallback *types.PerfInterval
	var fbName string
	for i := range list {
		iv := &list[i]
		if !iv.Enabled {
			continue
		}
		if fallback == nil || iv.Length > fallback.Length {
			fallback = iv
			fbName = iv.Name
		}
	}
	if fallback != nil {
		return fallback.SamplingPeriod, fbName + "（保留不足 " + strconv.Itoa(days) + " 天，数据可能被截断）"
	}
	// 极端：无历史档位，退回 vSphere 常见 Past Day 间隔
	return 300, "默认 300s（未读到历史档位配置）"
}

func perfValueFloat(unit types.PerformanceManagerUnit, raw int64) float64 {
	switch unit {
	case types.PerformanceManagerUnitPercent:
		return float64(raw) / 100.0
	case types.PerformanceManagerUnitKiloBytesPerSecond:
		return float64(raw)
	case types.PerformanceManagerUnitMegaBytesPerSecond:
		return float64(raw)
	case types.PerformanceManagerUnitKiloBytes:
		return float64(raw) / 1024.0
	case types.PerformanceManagerUnitMegaBytes:
		return float64(raw)
	default:
		return float64(raw)
	}
}

// expandPerfMetricIDs 按当前 rollup 间隔下「实际存在的实例」展开；磁盘/网络多为 scsi0:0、4000 等多实例，仅查 "" 或 * 历史数据常为空。
func expandPerfMetricIDs(
	infoByName map[string]*types.PerfCounterInfo,
	avail performance.MetricList,
	counterNames []string,
) ([]types.PerfMetricId, []string) {
	var missing []string
	byPair := make(map[string]struct{})
	var out []types.PerfMetricId
	add := func(cid int32, inst string) {
		k := fmt.Sprintf("%d|%s", cid, inst)
		if _, ok := byPair[k]; ok {
			return
		}
		byPair[k] = struct{}{}
		out = append(out, types.PerfMetricId{CounterId: cid, Instance: inst})
	}

	for _, name := range counterNames {
		ci, ok := infoByName[name]
		if !ok {
			missing = append(missing, name)
			continue
		}
		cid := ci.Key
		if len(avail) == 0 {
			add(cid, "")
			add(cid, "*")
			continue
		}
		var found bool
		for _, mid := range avail {
			if mid.CounterId != cid {
				continue
			}
			found = true
			add(cid, mid.Instance)
		}
		if !found {
			add(cid, "")
			add(cid, "*")
		}
	}
	return out, missing
}

// queryPerfEntity 先按展开 ID 查询；无采样时再尝试仅 "" + "*"。
func queryPerfEntity(
	ctx context.Context,
	pm *performance.Manager,
	entity types.ManagedObjectReference,
	metricIDs []types.PerfMetricId,
	metricIDsFallback []types.PerfMetricId,
	start, end time.Time,
	interval int32,
) ([]types.BasePerfEntityMetricBase, error) {
	spec := types.PerfQuerySpec{
		Entity:     entity,
		StartTime:  &start,
		EndTime:    &end,
		IntervalId: interval,
		MetricId:   metricIDs,
		MaxSample:  0,
	}
	raw, err := pm.Query(ctx, []types.PerfQuerySpec{spec})
	if err != nil {
		return nil, err
	}
	if perfHasSamples(raw) {
		return raw, nil
	}
	if len(metricIDsFallback) == 0 {
		return raw, nil
	}
	spec.MetricId = metricIDsFallback
	raw2, err2 := pm.Query(ctx, []types.PerfQuerySpec{spec})
	if err2 != nil {
		return nil, err2
	}
	return raw2, nil
}

func perfHasSamples(raw []types.BasePerfEntityMetricBase) bool {
	if len(raw) == 0 {
		return false
	}
	em, ok := raw[0].(*types.PerfEntityMetric)
	if !ok {
		return true
	}
	return len(em.SampleInfo) > 0 && len(em.Value) > 0
}

type perfAggBucket struct {
	unit types.PerformanceManagerUnit
	vals []float64
}

func aggregatePerfEntityMetric(em *performance.EntityMetric, infoByName map[string]*types.PerfCounterInfo) (map[string]*perfAggBucket, []types.PerfSampleInfo) {
	sampleCount := len(em.SampleInfo)
	if sampleCount == 0 {
		return nil, nil
	}
	byName := make(map[string]*perfAggBucket)
	for _, ser := range em.Value {
		ci, ok := infoByName[ser.Name]
		if !ok {
			continue
		}
		name := ci.Name()
		u := types.PerformanceManagerUnit(ci.UnitInfo.GetElementDescription().Key)
		nVal := len(ser.Value)
		if nVal == 0 {
			continue
		}
		if nVal > sampleCount {
			nVal = sampleCount
		}
		a, ok := byName[name]
		if !ok {
			a = &perfAggBucket{
				unit: u,
				vals: make([]float64, sampleCount),
			}
			byName[name] = a
		}
		for i := 0; i < nVal; i++ {
			rv := ser.Value[i]
			if rv < 0 {
				continue
			}
			a.vals[i] += perfValueFloat(u, rv)
		}
	}
	return byName, em.SampleInfo
}

func perfSeriesPointsGin(ts []types.PerfSampleInfo, byName map[string]*perfAggBucket, name string) []gin.H {
	a := byName[name]
	if a == nil {
		return nil
	}
	out := make([]gin.H, len(ts))
	for i := range ts {
		v := a.vals[i]
		if math.IsNaN(v) || math.IsInf(v, 0) {
			v = 0
		}
		out[i] = gin.H{
			"t": ts[i].Timestamp.UTC().Format(time.RFC3339),
			"v": v,
		}
	}
	return out
}

func perfUnitKeyFromBucket(byName map[string]*perfAggBucket, name string) string {
	a := byName[name]
	if a == nil {
		return ""
	}
	return string(a.unit)
}

func seriesPointsPreferHost(ts []types.PerfSampleInfo, byName map[string]*perfAggBucket, primary, secondary string) []gin.H {
	if p := perfSeriesPointsGin(ts, byName, primary); len(p) > 0 {
		return p
	}
	return perfSeriesPointsGin(ts, byName, secondary)
}

func unitKeyPreferHost(byName map[string]*perfAggBucket, primary, secondary string) string {
	if u := perfUnitKeyFromBucket(byName, primary); u != "" {
		return u
	}
	return perfUnitKeyFromBucket(byName, secondary)
}

func vmDiskNetSeriesFromAgg(
	ts []types.PerfSampleInfo,
	byName map[string]*perfAggBucket,
) (dr, dw, nrx, ntx []gin.H, uDr, uDw, uNrx, uNtx string) {
	if len(ts) == 0 || byName == nil {
		return nil, nil, nil, nil, "", "", "", ""
	}
	dr = seriesPointsPreferHost(ts, byName, "disk.read.average", "virtualDisk.read.average")
	dw = seriesPointsPreferHost(ts, byName, "disk.write.average", "virtualDisk.write.average")
	nrx = seriesPointsPreferHost(ts, byName, "net.received.average", "net.bytesRx.average")
	ntx = seriesPointsPreferHost(ts, byName, "net.transmitted.average", "net.bytesTx.average")
	uDr = unitKeyPreferHost(byName, "disk.read.average", "virtualDisk.read.average")
	uDw = unitKeyPreferHost(byName, "disk.write.average", "virtualDisk.write.average")
	uNrx = unitKeyPreferHost(byName, "net.received.average", "net.bytesRx.average")
	uNtx = unitKeyPreferHost(byName, "net.transmitted.average", "net.bytesTx.average")
	return dr, dw, nrx, ntx, uDr, uDw, uNrx, uNtx
}

func diskNetSeriesAllEmpty(dr, dw, nrx, ntx []gin.H) bool {
	return len(dr) == 0 && len(dw) == 0 && len(nrx) == 0 && len(ntx) == 0
}

func lastPointPreferSeries(ts []types.PerfSampleInfo, byName map[string]*perfAggBucket, primary, secondary string) float64 {
	if len(ts) == 0 {
		return 0
	}
	pr := perfSeriesPointsGin(ts, byName, primary)
	if len(pr) > 0 {
		v := pr[len(pr)-1]["v"]
		switch x := v.(type) {
		case float64:
			return x
		case float32:
			return float64(x)
		default:
			return 0
		}
	}
	if secondary != "" {
		sec := perfSeriesPointsGin(ts, byName, secondary)
		if len(sec) > 0 {
			v := sec[len(sec)-1]["v"]
			switch x := v.(type) {
			case float64:
				return x
			case float32:
				return float64(x)
			default:
				return 0
			}
		}
	}
	return 0
}

func zeroDiskNetRow() gin.H {
	return gin.H{
		"diskRead": 0, "diskWrite": 0, "netRx": 0, "netTx": 0,
		"diskReadUnit": "", "diskWriteUnit": "", "netRxUnit": "", "netTxUnit": "",
	}
}

func vmDiskNetRowFromRealtime(
	ts []types.PerfSampleInfo,
	byName map[string]*perfAggBucket,
) gin.H {
	if byName == nil {
		byName = make(map[string]*perfAggBucket)
	}
	dr := lastPointPreferSeries(ts, byName, "disk.read.average", "virtualDisk.read.average")
	dw := lastPointPreferSeries(ts, byName, "disk.write.average", "virtualDisk.write.average")
	nrx := lastPointPreferSeries(ts, byName, "net.received.average", "net.bytesRx.average")
	ntx := lastPointPreferSeries(ts, byName, "net.transmitted.average", "net.bytesTx.average")
	return gin.H{
		"diskRead":      dr,
		"diskWrite":     dw,
		"netRx":         nrx,
		"netTx":         ntx,
		"diskReadUnit":  unitKeyPreferHost(byName, "disk.read.average", "virtualDisk.read.average"),
		"diskWriteUnit": unitKeyPreferHost(byName, "disk.write.average", "virtualDisk.write.average"),
		"netRxUnit":     unitKeyPreferHost(byName, "net.received.average", "net.bytesRx.average"),
		"netTxUnit":     unitKeyPreferHost(byName, "net.transmitted.average", "net.bytesTx.average"),
	}
}

// queryVMDiskNetHistorical 与详情页「资源监控」同源：历史 rollup + 展开实例聚合；列表取最新点。
func queryVMDiskNetHistorical(
	ctx context.Context,
	pm *performance.Manager,
	infoByName map[string]*types.PerfCounterInfo,
	ref types.ManagedObjectReference,
	days int,
) (gin.H, bool, int) {
	z := zeroDiskNetRow()
	if days < 1 {
		days = 2
	}
	if days > 7 {
		days = 7
	}
	histIntervals, err := pm.HistoricalInterval(ctx)
	if err != nil {
		return z, false, 0
	}
	interval, _ := pickHistoricalSamplingPeriod(histIntervals, days)
	if interval <= 0 {
		return z, false, 0
	}
	avail, errAvail := pm.AvailableMetric(ctx, ref, interval)
	if errAvail != nil {
		avail = nil
	}
	metricIDs, _ := expandPerfMetricIDs(infoByName, avail, vmPerfCounterNames)
	var metricIDsFallback []types.PerfMetricId
	for _, name := range vmPerfCounterNames {
		ci, ok := infoByName[name]
		if !ok {
			continue
		}
		metricIDsFallback = append(metricIDsFallback,
			types.PerfMetricId{CounterId: ci.Key, Instance: ""},
			types.PerfMetricId{CounterId: ci.Key, Instance: "*"},
		)
	}
	if len(metricIDs) == 0 {
		metricIDs = metricIDsFallback
	}
	if len(metricIDs) == 0 {
		return z, false, 0
	}
	end := time.Now().UTC()
	start := end.AddDate(0, 0, -days)
	raw, err := queryPerfEntity(ctx, pm, ref, metricIDs, metricIDsFallback, start, end, interval)
	if err != nil || !perfHasSamples(raw) {
		return z, false, 0
	}
	emList, err2 := pm.ToMetricSeries(ctx, raw)
	if err2 != nil || len(emList) == 0 || len(emList[0].SampleInfo) == 0 {
		return z, false, 0
	}
	n := len(emList[0].SampleInfo)
	byName, ts := aggregatePerfEntityMetric(&emList[0], infoByName)
	return vmDiskNetRowFromRealtime(ts, byName), true, n
}

// queryVMDiskNetRealtime 近 1 小时实时采样（需 CurrentSupported）；部分环境 VM 无实时磁盘/网络，勿作为唯一来源。
func queryVMDiskNetRealtime(
	ctx context.Context,
	pm *performance.Manager,
	infoByName map[string]*types.PerfCounterInfo,
	ref types.ManagedObjectReference,
) (gin.H, bool, int) {
	z := zeroDiskNetRow()
	prov, err := pm.ProviderSummary(ctx, ref)
	if err != nil || prov == nil || !prov.CurrentSupported {
		return z, false, 0
	}
	refreshRate := prov.RefreshRate
	if refreshRate <= 0 {
		refreshRate = 20
	}
	endRT := time.Now().UTC()
	startRT := endRT.Add(-1 * time.Hour)
	availRT, errAvailRT := pm.AvailableMetric(ctx, ref, refreshRate)
	if errAvailRT != nil {
		availRT = nil
	}
	mIDsRT, _ := expandPerfMetricIDs(infoByName, availRT, vmDiskNetRealtimeNames)
	var fbRT []types.PerfMetricId
	for _, name := range vmDiskNetRealtimeNames {
		ci, ok := infoByName[name]
		if !ok {
			continue
		}
		fbRT = append(fbRT,
			types.PerfMetricId{CounterId: ci.Key, Instance: ""},
			types.PerfMetricId{CounterId: ci.Key, Instance: "*"},
		)
	}
	if len(mIDsRT) == 0 {
		mIDsRT = fbRT
	}
	if len(mIDsRT) == 0 {
		return z, false, 0
	}
	rawRT, errRT := queryPerfEntity(ctx, pm, ref, mIDsRT, fbRT, startRT, endRT, refreshRate)
	if errRT != nil || !perfHasSamples(rawRT) {
		return z, false, 0
	}
	emRTList, err2 := pm.ToMetricSeries(ctx, rawRT)
	if err2 != nil || len(emRTList) == 0 || len(emRTList[0].SampleInfo) == 0 {
		return z, false, 0
	}
	n := len(emRTList[0].SampleInfo)
	byRT, tsRT := aggregatePerfEntityMetric(&emRTList[0], infoByName)
	return vmDiskNetRowFromRealtime(tsRT, byRT), true, n
}

func queryVMDiskNetLatestPoint(
	ctx context.Context,
	pm *performance.Manager,
	infoByName map[string]*types.PerfCounterInfo,
	ref types.ManagedObjectReference,
) gin.H {
	// 与虚拟机详情性能图表一致：优先历史归档；无采样再尝试实时。
	h, hOK, _ := queryVMDiskNetHistorical(ctx, pm, infoByName, ref, 2)
	if hOK {
		return h
	}
	r, rOK, _ := queryVMDiskNetRealtime(ctx, pm, infoByName, ref)
	if rOK {
		return r
	}
	return h
}

// diagnoseVMDiskNetSnapshot 对第一台虚拟机探测历史/实时是否可用，便于日志与前端展示「无数据」原因。
func diagnoseVMDiskNetSnapshot(
	ctx context.Context,
	pm *performance.Manager,
	infoByName map[string]*types.PerfCounterInfo,
	ref types.ManagedObjectReference,
	moref string,
) gin.H {
	out := gin.H{"moref": moref}
	prov, err := pm.ProviderSummary(ctx, ref)
	if err != nil {
		out["providerSummaryErr"] = err.Error()
	} else if prov != nil {
		out["currentSupported"] = prov.CurrentSupported
		out["refreshRateSec"] = prov.RefreshRate
		out["summarySupported"] = prov.SummarySupported
	}
	_, hOK, hN := queryVMDiskNetHistorical(ctx, pm, infoByName, ref, 2)
	out["historicalSamples"] = hN
	out["historicalOk"] = hOK
	_, rOK, rN := queryVMDiskNetRealtime(ctx, pm, infoByName, ref)
	out["realtimeSamples"] = rN
	out["realtimeOk"] = rOK
	var parts []string
	chosen := "none"
	if hOK {
		chosen = "historical"
		parts = append(parts, "磁盘/网络取自历史 rollup 最新点（与详情「资源监控」一致）。")
	} else if rOK {
		chosen = "realtime"
		parts = append(parts, "历史无有效采样，已回退实时性能。")
	}
	if !hOK && !rOK {
		if prov != nil && !prov.CurrentSupported {
			parts = append(parts, "CurrentSupported=false，实时性能不可用。")
		}
		if prov != nil && !prov.SummarySupported {
			parts = append(parts, "SummarySupported=false，可能无历史统计。")
		}
		parts = append(parts, "请在 vCenter「设置→常规→统计信息」提高级别（磁盘≥2、网络≥3/4）并确认 Past Day 等间隔已启用。")
	}
	out["chosen"] = chosen
	out["reason"] = strings.Join(parts, " ")
	return out
}

// handleVCenterVMsPerfSnapshot 列表页磁盘/网络 IO：与详情「资源监控」相同计数器，取历史 rollup 最新点；无历史时再试实时。
func handleVCenterVMsPerfSnapshot(c *gin.Context, vc *vCenterClient) {
	if !vc.cfg.vCenterConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vCenter 未配置"})
		return
	}
	ctx := c.Request.Context()
	type job struct {
		ref   types.ManagedObjectReference
		moref string
	}
	var jobs []job
	rates := gin.H{}
	var probe gin.H
	err := vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
		jobs = nil
		f := find.NewFinder(client.Client, true)
		dcs, err := f.DatacenterList(ctx, "*")
		if err != nil {
			return err
		}
		pm := performance.NewManager(client.Client)
		infoByName, err := pm.CounterInfoByName(ctx)
		if err != nil {
			return fmt.Errorf("读取性能计数器定义失败: %w", err)
		}
		for _, dc := range dcs {
			f.SetDatacenter(dc)
			vms, err := f.VirtualMachineList(ctx, "*")
			if err != nil {
				continue
			}
			for _, vm := range vms {
				ref := vm.Reference()
				jobs = append(jobs, job{ref: ref, moref: ref.Value})
			}
		}
		rates = gin.H{}
		var mu sync.Mutex
		sem := make(chan struct{}, 12)
		var wg sync.WaitGroup
		for _, j := range jobs {
			j := j
			wg.Add(1)
			go func() {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()
				row := queryVMDiskNetLatestPoint(ctx, pm, infoByName, j.ref)
				mu.Lock()
				rates[j.moref] = row
				mu.Unlock()
			}()
		}
		wg.Wait()
		probe = nil
		if len(jobs) > 0 {
			probe = diagnoseVMDiskNetSnapshot(ctx, pm, infoByName, jobs[0].ref, jobs[0].moref)
			if p, ok := probe["chosen"].(string); ok {
				log.Printf("[vcenter] perf-snapshot probe moref=%s chosen=%s historicalOk=%v realtimeOk=%v histSamples=%v rtSamples=%v",
					jobs[0].moref, p, probe["historicalOk"], probe["realtimeOk"], probe["historicalSamples"], probe["realtimeSamples"])
			}
		}
		return nil
	})
	if err != nil {
		if strings.Contains(err.Error(), "读取性能计数器定义失败") {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "列出数据中心失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"rates": rates,
		"note":  "磁盘/网络优先使用历史性能最新点（与详情「资源监控」一致）；无历史采样时再试实时；关机或全 0 多为空闲或统计级别不足。",
		"probe": probe,
	})
}

func handleVCenterVMMetrics(c *gin.Context, vc *vCenterClient) {
	if !vc.cfg.vCenterConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vCenter 未配置"})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	days, _ := strconv.Atoi(strings.TrimSpace(c.Query("days")))
	if days < 1 {
		days = 7
	}
	if days > 7 {
		days = 7
	}

	ctx := c.Request.Context()
	client, err := vc.getClient(ctx)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	vm := object.NewVirtualMachine(client.Client, types.ManagedObjectReference{Type: "VirtualMachine", Value: moref})
	var exists mo.VirtualMachine
	if err := vm.Properties(ctx, vm.Reference(), []string{"name"}, &exists); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "虚拟机不存在或无权访问: " + err.Error()})
		return
	}

	pm := performance.NewManager(client.Client)

	prov, err := pm.ProviderSummary(ctx, vm.Reference())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "QueryPerfProviderSummary 失败: " + err.Error()})
		return
	}

	histIntervals, err := pm.HistoricalInterval(ctx)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "读取 HistoricalInterval 失败: " + err.Error()})
		return
	}
	interval, intervalHint := pickHistoricalSamplingPeriod(histIntervals, days)

	infoByName, err := pm.CounterInfoByName(ctx)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "读取性能计数器定义失败: " + err.Error()})
		return
	}

	avail, errAvail := pm.AvailableMetric(ctx, vm.Reference(), interval)
	if errAvail != nil {
		avail = nil
	}

	metricIDs, missing := expandPerfMetricIDs(infoByName, avail, vmPerfCounterNames)
	var metricIDsFallback []types.PerfMetricId
	for _, name := range vmPerfCounterNames {
		ci, ok := infoByName[name]
		if !ok {
			continue
		}
		metricIDsFallback = append(metricIDsFallback,
			types.PerfMetricId{CounterId: ci.Key, Instance: ""},
			types.PerfMetricId{CounterId: ci.Key, Instance: "*"},
		)
	}
	if len(metricIDs) == 0 {
		c.JSON(http.StatusBadGateway, gin.H{
			"error":   "未找到所需性能计数器（请确认 vCenter 版本与权限）",
			"missing": missing,
		})
		return
	}

	end := time.Now().UTC()
	start := end.AddDate(0, 0, -days)

	raw, err := queryPerfEntity(ctx, pm, vm.Reference(), metricIDs, metricIDsFallback, start, end, interval)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	emList, err := pm.ToMetricSeries(ctx, raw)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "解析性能序列失败: " + err.Error()})
		return
	}

	noteParts := []string{
		fmt.Sprintf("历史档位: %s，rollup %ds。", intervalHint, interval),
	}
	if errAvail != nil {
		noteParts = append(noteParts, fmt.Sprintf("QueryAvailablePerfMetric 失败（%v），磁盘/网络可能无法展开实例。", errAvail))
	}
	if prov != nil && !prov.SummarySupported {
		noteParts = append(noteParts, "该对象 SummarySupported=false，可能无历史统计。")
	}

	if len(emList) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"moref":       moref,
			"days":        days,
			"rangeFrom":   start.Format(time.RFC3339),
			"rangeTo":     end.Format(time.RFC3339),
			"intervalSec": interval,
			"series":      gin.H{},
			"units":       gin.H{},
			"missing":     missing,
			"note": strings.Join(noteParts, "") + " QueryPerf 未返回实体指标。请在 vCenter「设置 → 常规 → 统计信息」提高统计级别并确认已启用 Past Day / Past Week 等间隔。",
		})
		return
	}

	emEnt := &emList[0]
	if len(emEnt.SampleInfo) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"moref":       moref,
			"days":        days,
			"rangeFrom":   start.Format(time.RFC3339),
			"rangeTo":     end.Format(time.RFC3339),
			"intervalSec": interval,
			"series":      gin.H{},
			"units":       gin.H{},
			"missing":     missing,
			"note":        strings.Join(noteParts, "") + " 采样点为空，请检查统计级别与历史间隔是否启用。",
		})
		return
	}

	byNameHist, tsHist := aggregatePerfEntityMetric(emEnt, infoByName)
	if byNameHist == nil {
		byNameHist = make(map[string]*perfAggBucket)
	}

	seriesPoints := func(name string) []gin.H {
		return perfSeriesPointsGin(tsHist, byNameHist, name)
	}
	unitKey := func(name string) string {
		return perfUnitKeyFromBucket(byNameHist, name)
	}

	dr, dw, nrx, ntx, uDr, uDw, uNrx, uNtx := vmDiskNetSeriesFromAgg(tsHist, byNameHist)

	usedDiskNetRT := false
	var diskNetRT gin.H
	if diskNetSeriesAllEmpty(dr, dw, nrx, ntx) && prov != nil && prov.CurrentSupported {
		refreshRate := prov.RefreshRate
		if refreshRate <= 0 {
			refreshRate = 20
		}
		endRT := time.Now().UTC()
		startRT := endRT.Add(-1 * time.Hour)
		availRT, errAvailRT := pm.AvailableMetric(ctx, vm.Reference(), refreshRate)
		if errAvailRT != nil {
			availRT = nil
		}
		mIDsRT, _ := expandPerfMetricIDs(infoByName, availRT, vmDiskNetRealtimeNames)
		var fbRT []types.PerfMetricId
		for _, name := range vmDiskNetRealtimeNames {
			ci, ok := infoByName[name]
			if !ok {
				continue
			}
			fbRT = append(fbRT,
				types.PerfMetricId{CounterId: ci.Key, Instance: ""},
				types.PerfMetricId{CounterId: ci.Key, Instance: "*"},
			)
		}
		if len(mIDsRT) == 0 {
			mIDsRT = fbRT
		}
		if len(mIDsRT) > 0 {
			rawRT, errRT := queryPerfEntity(ctx, pm, vm.Reference(), mIDsRT, fbRT, startRT, endRT, refreshRate)
			if errRT == nil && perfHasSamples(rawRT) {
				emRTList, err2 := pm.ToMetricSeries(ctx, rawRT)
				if err2 == nil && len(emRTList) > 0 && len(emRTList[0].SampleInfo) > 0 {
					byRT, tsRT := aggregatePerfEntityMetric(&emRTList[0], infoByName)
					dr2, dw2, nrx2, ntx2, uDr2, uDw2, uNrx2, uNtx2 := vmDiskNetSeriesFromAgg(tsRT, byRT)
					if !diskNetSeriesAllEmpty(dr2, dw2, nrx2, ntx2) {
						dr, dw, nrx, ntx = dr2, dw2, nrx2, ntx2
						uDr, uDw, uNrx, uNtx = uDr2, uDw2, uNrx2, uNtx2
						usedDiskNetRT = true
						diskNetRT = gin.H{
							"rangeFrom":   startRT.Format(time.RFC3339),
							"rangeTo":     endRT.Format(time.RFC3339),
							"intervalSec": refreshRate,
						}
						noteParts = append(noteParts,
							"磁盘/网络曲线使用近 1 小时实时性能（Past Week 等粗粒度历史档位通常不包含磁盘/网络计数器）。",
						)
					}
				}
			}
		}
	}

	if diskNetSeriesAllEmpty(dr, dw, nrx, ntx) && !usedDiskNetRT {
		intervalPD, hintPD := pickHistoricalSamplingPeriod(histIntervals, 1)
		if intervalPD > 0 && intervalPD < interval {
			availPD, _ := pm.AvailableMetric(ctx, vm.Reference(), intervalPD)
			metricIDsPD, _ := expandPerfMetricIDs(infoByName, availPD, vmPerfCounterNames)
			var fbPD []types.PerfMetricId
			for _, name := range vmPerfCounterNames {
				ci, ok := infoByName[name]
				if !ok {
					continue
				}
				fbPD = append(fbPD,
					types.PerfMetricId{CounterId: ci.Key, Instance: ""},
					types.PerfMetricId{CounterId: ci.Key, Instance: "*"},
				)
			}
			if len(metricIDsPD) == 0 {
				metricIDsPD = fbPD
			}
			if len(metricIDsPD) > 0 {
				endPD := time.Now().UTC()
				startPD := endPD.AddDate(0, 0, -2)
				rawPD, errPD := queryPerfEntity(ctx, pm, vm.Reference(), metricIDsPD, fbPD, startPD, endPD, intervalPD)
				if errPD == nil && perfHasSamples(rawPD) {
					emPDList, errPD2 := pm.ToMetricSeries(ctx, rawPD)
					if errPD2 == nil && len(emPDList) > 0 && len(emPDList[0].SampleInfo) > 0 {
						byPD, tsPD := aggregatePerfEntityMetric(&emPDList[0], infoByName)
						dr3, dw3, nrx3, ntx3, uDr3, uDw3, uNrx3, uNtx3 := vmDiskNetSeriesFromAgg(tsPD, byPD)
						if !diskNetSeriesAllEmpty(dr3, dw3, nrx3, ntx3) {
							dr, dw, nrx, ntx = dr3, dw3, nrx3, ntx3
							uDr, uDw, uNrx, uNtx = uDr3, uDw3, uNrx3, uNtx3
							noteParts = append(noteParts,
								fmt.Sprintf("磁盘/网络使用较细历史档位 %s（rollup %ds）：Past Week 档位无磁盘/网络归档时可从此档位读取。", hintPD, intervalPD),
							)
						}
					}
				}
			}
		}
	}

	series := gin.H{
		"cpu":       seriesPoints("cpu.usage.average"),
		"memory":    seriesPoints("mem.usage.average"),
		"diskRead":  dr,
		"diskWrite": dw,
		"netRx":     nrx,
		"netTx":     ntx,
	}
	units := gin.H{
		"cpu":       unitKey("cpu.usage.average"),
		"memory":    unitKey("mem.usage.average"),
		"diskRead":  uDr,
		"diskWrite": uDw,
		"netRx":     uNrx,
		"netTx":     uNtx,
	}

	hasAny := false
	for _, k := range []string{
		"cpu.usage.average", "mem.usage.average",
		"disk.read.average", "disk.write.average",
		"virtualDisk.read.average", "virtualDisk.write.average",
		"net.received.average", "net.transmitted.average",
		"net.bytesRx.average", "net.bytesTx.average",
	} {
		if len(seriesPoints(k)) > 0 {
			hasAny = true
			break
		}
	}
	if !hasAny {
		noteParts = append(noteParts,
			"已返回采样时间轴但所选计数器无数据：请确认统计级别≥2（磁盘 I/O）与≥3 或≥4（网络，视 vCenter 版本而定），且虚拟机已开机过一段时间。",
		)
	}

	resp := gin.H{
		"moref":       moref,
		"days":        days,
		"rangeFrom":   start.Format(time.RFC3339),
		"rangeTo":     end.Format(time.RFC3339),
		"intervalSec": interval,
		"series":      series,
		"units":       units,
		"missing":     missing,
		"note": strings.Join(noteParts, "") + " CPU/内存为平均占用率；磁盘/网络为各实例求和（KB/s）。磁盘优先 disk.*，无则 virtualDisk.*；网络优先 net.received/transmitted，无则 net.bytesRx/bytesTx。",
	}
	if usedDiskNetRT {
		resp["diskNetRealtime"] = diskNetRT
	}
	c.JSON(http.StatusOK, resp)
}

