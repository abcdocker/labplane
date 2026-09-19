package internal

import (
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
)

// Go 版 ikuai_exporter：ikuai_network_*_kbytes_per_second × ikuai_device_info → 按 ip_addr 聚合

const ikuaiModernRecvJoin = `(ikuai_network_recv_kbytes_per_second{id=~"device/.*"}) * on(instance,job,id) group_left(ip_addr,mac,hostname,comment) (ikuai_device_info)`

const ikuaiModernSendJoin = `(ikuai_network_send_kbytes_per_second{id=~"device/.*"}) * on(instance,job,id) group_left(ip_addr,mac,hostname,comment) (ikuai_device_info)`

var ikuaiModernDownloadByIPQueries = []string{
	`max by (ip_addr) (` + ikuaiModernRecvJoin + `)`,
}

var ikuaiModernUploadByIPQueries = []string{
	`max by (ip_addr) (` + ikuaiModernSendJoin + `)`,
}

var ikuaiModernTopologyQueries = []string{
	`topk(500, ` + ikuaiModernRecvJoin + `)`,
	ikuaiModernRecvJoin,
}

// yw9381/ikuai_exporter（Python）：monitor_lanip → ikuai_client_download / ikuai_client_upload

var ikuaiClientDownloadByIPQueries = []string{
	`max by (ip_addr) (ikuai_client_download)`,
}

var ikuaiClientUploadByIPQueries = []string{
	`max by (ip_addr) (ikuai_client_upload)`,
}

var ikuaiClientStreamDetailQueries = []string{
	`topk(500, ikuai_client_download)`,
	`ikuai_client_download`,
}

// ikuaiStreamPerfRowFromRaw 转为与 perf-snapshot 一致的 KiB/s 语义，供前端按十进制 Mbps 展示。
// unit=bytes（默认）：指标为字节/秒 → 除以 1024 得 KiB/s。
// unit=kbs：指标已为「千字节/秒」（按 1024），直接使用。
func ikuaiStreamPerfRowFromRaw(downloadRaw, uploadRaw float64, unit string) gin.H {
	u := strings.ToLower(strings.TrimSpace(unit))
	if u == "kbs" || u == "kb_s" || u == "kilobytes" {
		return gin.H{
			"netRx": downloadRaw, "netTx": uploadRaw,
			"netRxUnit": "kiloBytesPerSecond", "netTxUnit": "kiloBytesPerSecond",
		}
	}
	return gin.H{
		"netRx": downloadRaw / 1024, "netTx": uploadRaw / 1024,
		"netRxUnit": "kiloBytesPerSecond", "netTxUnit": "kiloBytesPerSecond",
	}
}

func resolvePrometheusBaseForIkuai(cfg Config) string {
	base := strings.TrimSpace(GetPrometheusURLForScope(cfg, "vcenter"))
	if base != "" {
		return base
	}
	return strings.TrimSpace(GetEffectivePrometheusURL(cfg))
}

// handleVCenterVMsIkuaiClientStream 从 Prometheus 拉取 ikuai_exporter 的 LAN 客户端实时上下行（按 IP），并返回局域网设备列表供「网络架构」展示。
func handleVCenterVMsIkuaiClientStream(c *gin.Context, cfg Config) {
	unit := strings.ToLower(strings.TrimSpace(c.DefaultQuery("unit", "bytes")))
	base := resolvePrometheusBaseForIkuai(cfg)
	if base == "" {
		c.JSON(http.StatusOK, gin.H{
			"prometheusConfigured": false,
			"ratesByIp":            gin.H{},
			"devices":              []gin.H{},
			"note":                 "未配置 Prometheus（prometheusUrlVcenter / prometheusUrl）",
		})
		return
	}
	ctx := c.Request.Context()

	var dl, ul map[string]float64
	var qDl, qUl string
	var errDl, errUl error
	useModern := false

	mdl, mqDl, errM := firstNonEmptyVectorByLabelKey(ctx, cfg, base, ikuaiModernDownloadByIPQueries, "ip_addr")
	if errM == nil && len(mdl) > 0 {
		useModern = true
		dl = mdl
		qDl = mqDl
		mul, mqUl, errMU := firstNonEmptyVectorByLabelKey(ctx, cfg, base, ikuaiModernUploadByIPQueries, "ip_addr")
		if errMU != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"error": "Prometheus 查询 ikuai 上行（Go exporter）失败: " + errMU.Error(),
			})
			return
		}
		ul = mul
		qUl = mqUl
	} else {
		dl, qDl, errDl = firstNonEmptyVectorByLabelKey(ctx, cfg, base, ikuaiClientDownloadByIPQueries, "ip_addr")
		ul, qUl, errUl = firstNonEmptyVectorByLabelKey(ctx, cfg, base, ikuaiClientUploadByIPQueries, "ip_addr")
		if errDl != nil && errUl != nil {
			msg := errDl.Error()
			if errUl != nil {
				msg += "; " + errUl.Error()
			}
			c.JSON(http.StatusBadGateway, gin.H{
				"error": "Prometheus 查询 ikuai 终端流量失败（需 Go 版 ikuai_* 或 yw9381 ikuai_client_* 且已抓取）: " + msg,
			})
			return
		}
	}
	dl = safeFloatMap(dl)
	ul = safeFloatMap(ul)
	allIP := map[string]struct{}{}
	for k := range dl {
		allIP[k] = struct{}{}
	}
	for k := range ul {
		allIP[k] = struct{}{}
	}
	rateUnit := unit
	if useModern {
		rateUnit = "kbs"
	}
	ratesByIP := gin.H{}
	for ip := range allIP {
		ratesByIP[ip] = ikuaiStreamPerfRowFromRaw(dl[ip], ul[ip], rateUnit)
	}

	var devices []gin.H
	var qDet string
	if useModern {
		samples, qd, errDet := firstNonEmptySamples(ctx, cfg, base, ikuaiModernTopologyQueries)
		qDet = qd
		if errDet == nil && len(samples) > 0 {
			ded := make(map[string]gin.H)
			for _, s := range samples {
				ip := strings.TrimSpace(s.Metric["ip_addr"])
				if ip == "" {
					continue
				}
				dv := s.Value
				if ex, ok := ded[ip]; ok {
					if prev, ok2 := ex["download"].(float64); ok2 && dv <= prev {
						continue
					}
				}
				ded[ip] = gin.H{
					"ip":         ip,
					"mac":        strings.TrimSpace(s.Metric["mac"]),
					"hostname":   strings.TrimSpace(s.Metric["hostname"]),
					"comment":    strings.TrimSpace(s.Metric["comment"]),
					"clientType": "",
					"download":   dv,
					"upload":     ul[ip],
				}
			}
			devices = make([]gin.H, 0, len(ded))
			for _, v := range ded {
				devices = append(devices, v)
			}
			sort.Slice(devices, func(i, j int) bool {
				di, _ := devices[i]["download"].(float64)
				dj, _ := devices[j]["download"].(float64)
				return di > dj
			})
		}
	} else {
		samples, qd, errDet := firstNonEmptySamples(ctx, cfg, base, ikuaiClientStreamDetailQueries)
		qDet = qd
		if errDet == nil && len(samples) > 0 {
			ded := make(map[string]gin.H)
			for _, s := range samples {
				ip := strings.TrimSpace(s.Metric["ip_addr"])
				if ip == "" {
					continue
				}
				dv := s.Value
				if ex, ok := ded[ip]; ok {
					if prev, ok2 := ex["download"].(float64); ok2 && dv <= prev {
						continue
					}
				}
				ded[ip] = gin.H{
					"ip":         ip,
					"mac":        strings.TrimSpace(s.Metric["mac"]),
					"hostname":   strings.TrimSpace(s.Metric["hostname"]),
					"comment":    strings.TrimSpace(s.Metric["comment"]),
					"clientType": strings.TrimSpace(s.Metric["client_type"]),
					"download":   dv,
					"upload":     ul[ip],
				}
			}
			devices = make([]gin.H, 0, len(ded))
			for _, v := range ded {
				devices = append(devices, v)
			}
			sort.Slice(devices, func(i, j int) bool {
				di, _ := devices[i]["download"].(float64)
				dj, _ := devices[j]["download"].(float64)
				return di > dj
			})
		}
	}

	note := "来自 Prometheus：优先匹配 Go 版 ikuai_exporter（ikuai_network_*_kbytes_per_second × ikuai_device_info），" +
		"否则回退 yw9381 Python 版（ikuai_client_*）。Go 版下行/上行按 KiB/s（1024 字节/秒）理解；Python 版默认按 unit=bytes 换算。"
	if !useModern {
		note += " 当前为 Python 版：默认 unit=bytes；若已为 KB/s 请加 unit=kbs。"
	}

	c.JSON(http.StatusOK, gin.H{
		"prometheusConfigured": true,
		"ratesByIp":            ratesByIP,
		"devices":              devices,
		"exporterKind":         map[bool]string{true: "modern", false: "legacy"}[useModern],
		"note":                 note,
		"queriesUsed":          gin.H{"downloadByIp": qDl, "uploadByIp": qUl, "topology": qDet},
	})
}
