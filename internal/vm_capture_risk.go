package internal

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

// vm_capture_risk.go 规则风险引擎：旁路解码逐包喂入，产出实时风险流与风险指数。
// 设计定位（见 demo-v2 方案）：平台解码给出"事实"，规则引擎负责可本地判定的风险，
// AI 判读模型只负责报告文案增强——不依赖模型也能完整出结论。

const (
	vmCaptureSevHigh = "high"
	vmCaptureSevMid  = "mid"
	vmCaptureSevLow  = "low"
	vmCaptureSevInfo = "info"
)

var vmCaptureSevWeight = map[string]int{
	vmCaptureSevHigh: 30,
	vmCaptureSevMid:  15,
	vmCaptureSevLow:  6,
	vmCaptureSevInfo: 2,
}

var vmCaptureSevLabel = map[string]string{
	vmCaptureSevHigh: "高危",
	vmCaptureSevMid:  "中危",
	vmCaptureSevLow:  "低危",
	vmCaptureSevInfo: "信息",
}

// vmCaptureFinding 一条风险发现（实时流与 AI 报告共用结构）。
type vmCaptureFinding struct {
	ID       int    `json:"id"`
	Sev      string `json:"sev"`
	Title    string `json:"title"`
	Text     string `json:"text"`
	PacketNo int    `json:"packetNo,omitempty"`
	At       string `json:"at"`
}

// vmMaskSecretLen 口令/敏感参数脱敏展示：只暴露长度，永不回显内容。
func vmMaskSecretLen(n int) string {
	return fmt.Sprintf("****（长度 %d，已脱敏）", n)
}

type vmSynTrack struct {
	ports     map[int]bool
	firstTS   time.Time
	lastTS    time.Time
	firstNo   int
	intervals []time.Duration
}

// vmCaptureRiskEngine 单个抓包会话的风险状态机。
type vmCaptureRiskEngine struct {
	baselineSent  bool
	authSeen      bool
	httpAuthSeen  bool
	telnetSeen    bool
	ftpSeen       bool
	sshBannerSeen bool
	bigValueSeen  bool
	dnsSeen       bool
	syn           map[string]*vmSynTrack
	synReported   map[string]bool
	findings      []vmCaptureFinding
	nextID        int
	score         int
}

func newVMCaptureRiskEngine() *vmCaptureRiskEngine {
	return &vmCaptureRiskEngine{
		syn:         map[string]*vmSynTrack{},
		synReported: map[string]bool{},
	}
}

func (r *vmCaptureRiskEngine) emit(sev, title, text string, packetNo int, ts time.Time) vmCaptureFinding {
	r.nextID++
	f := vmCaptureFinding{
		ID:       r.nextID,
		Sev:      sev,
		Title:    title,
		Text:     text,
		PacketNo: packetNo,
		At:       ts.UTC().Format(time.RFC3339),
	}
	r.findings = append(r.findings, f)
	r.score += vmCaptureSevWeight[sev]
	if r.score > 100 {
		r.score = 100
	}
	return f
}

// Feed 逐包喂入；返回本包新产生的发现（可能为空）。
func (r *vmCaptureRiskEngine) Feed(info *vmPacketInfo) []vmCaptureFinding {
	var out []vmCaptureFinding
	fire := func(sev, title, text string, no int) {
		out = append(out, r.emit(sev, title, text, no, info.TS))
	}
	if !r.baselineSent {
		r.baselineSent = true
		fire(vmCaptureSevInfo, "流量基线已建立", "已开始旁路解码：后续将逐包识别明文口令、明文协议、扫描与异常外联特征，并实时更新风险指数。", info.No)
	}
	if info.RespCmd != nil && info.RespCmd.SecretArg && !r.authSeen {
		r.authSeen = true
		fire(vmCaptureSevHigh, "Redis AUTH 明文口令暴露",
			"包 #"+fmt.Sprint(info.No)+" 载荷含明文 RESP "+info.RespCmd.Name+" 命令（口令值不回显，完整存在于 pcap 中）。"+
				"任何能下载本 pcap 的人都可还原该口令。建议：分析完成后立即删除本文件并轮换口令；长期需要抓包排查时改用 TLS 或仅在故障窗口临时放行 6379。", info.No)
	}
	if info.RespBulkLen > 64*1024 && !r.bigValueSeen {
		r.bigValueSeen = true
		fire(vmCaptureSevMid, "Redis 大 value 响应",
			fmt.Sprintf("包 #%d 服务端响应声明 bulk 长度 %d 字节（阈值 64KiB）。大 value 会拉长单命令处理时间并占用带宽，建议拆分为 hash 或启用压缩，可结合平台 Redis 模块 slowlog 交叉验证。", info.No, info.RespBulkLen), info.No)
	}
	if info.HTTPAuth && !r.httpAuthSeen {
		r.httpAuthSeen = true
		fire(vmCaptureSevHigh, "HTTP Authorization 明文暴露",
			"包 #"+fmt.Sprint(info.No)+" 为明文 HTTP 且携带 Authorization 头（Basic 凭据 base64 即明文）。建议改用 HTTPS 或轮换该凭据。", info.No)
	}
	if info.App == "TELNET" && !r.telnetSeen {
		r.telnetSeen = true
		fire(vmCaptureSevMid, "Telnet 明文协议流量",
			"包 #"+fmt.Sprint(info.No)+" 检测到 Telnet 会话：全部交互（含登录口令）均为明文。建议改用 SSH。", info.No)
	}
	if info.App == "FTP" && !r.ftpSeen {
		r.ftpSeen = true
		fire(vmCaptureSevMid, "FTP 明文协议流量",
			"包 #"+fmt.Sprint(info.No)+" 检测到 FTP 控制连接：USER/PASS 命令为明文。建议改用 SFTP/FTPS。", info.No)
	}
	if info.App == "SSH" && info.PlainBanner != "" && !r.sshBannerSeen {
		r.sshBannerSeen = true
		fire(vmCaptureSevLow, "SSH 版本信息暴露",
			"Banner 显示 "+vmTruncateStr(info.PlainBanner, 64)+"，版本号可被用于针对性漏洞匹配，暴露面可控，计划内升级即可。", info.No)
	}
	if info.App == "DNS" && len(info.DNSNames) > 0 && !r.dnsSeen {
		r.dnsSeen = true
		fire(vmCaptureSevInfo, "DNS 明文查询可见",
			"DNS 查询域名在抓包中完整可见（含内部服务名），可用于发现数据外发渠道；本文件请勿外传。", info.No)
	}
	// SYN 扫描/巡检特征：同源短时间内探测多个不同端口。
	// 当前旁路规则不追踪完整 TCP 状态机，因此不声称握手是否完成。
	if info.SYN && info.SrcIP != "" && info.DstPort > 0 {
		t := r.syn[info.SrcIP]
		if t == nil {
			t = &vmSynTrack{ports: map[int]bool{}, firstTS: info.TS, firstNo: info.No}
			r.syn[info.SrcIP] = t
		}
		if !t.ports[info.DstPort] {
			t.ports[info.DstPort] = true
			if !t.lastTS.IsZero() {
				t.intervals = append(t.intervals, info.TS.Sub(t.lastTS))
			}
			t.lastTS = info.TS
			if len(t.ports) >= 8 && !r.synReported[info.SrcIP] && info.TS.Sub(t.firstTS) <= 10*time.Second {
				r.synReported[info.SrcIP] = true
				regular := ""
				if vmIntervalsRegular(t.intervals) {
					regular = "各探测间隔均匀，符合周期性巡检（如 Prometheus/blackbox）指纹，误报可能较高；建议将源主机加入信任探针白名单。"
				}
				ports := make([]string, 0, len(t.ports))
				for p := range t.ports {
					ports = append(ports, fmt.Sprint(p))
				}
				sort.Strings(ports)
				fire(vmCaptureSevMid, "检测到端口扫描特征",
					info.SrcIP+" 在 "+info.TS.Sub(t.firstTS).Round(time.Millisecond).String()+" 内对本机 "+strings.Join(ports, "/")+" 发起多端口 SYN 探测。"+regular, t.firstNo)
			}
		}
	}
	return out
}

// vmIntervalsRegular 判定 SYN 间隔是否均匀（巡检特征）：≥3 个间隔且变异系数 < 0.35。
func vmIntervalsRegular(ds []time.Duration) bool {
	if len(ds) < 3 {
		return false
	}
	var sum float64
	for _, d := range ds {
		sum += d.Seconds()
	}
	mean := sum / float64(len(ds))
	if mean <= 0 {
		return false
	}
	var sq float64
	for _, d := range ds {
		sq += math.Pow(d.Seconds()-mean, 2)
	}
	cv := math.Sqrt(sq/float64(len(ds))) / mean
	return cv < 0.35
}

// Findings 全量发现（新->旧）。
func (r *vmCaptureRiskEngine) Findings() []vmCaptureFinding {
	out := make([]vmCaptureFinding, len(r.findings))
	for i, f := range r.findings {
		out[len(r.findings)-1-i] = f
	}
	return out
}

func (r *vmCaptureRiskEngine) Score() int { return r.score }

// RiskLevel 风险指数对应的等级文案。
func vmCaptureRiskLevel(score int) string {
	switch {
	case score >= 70:
		return "中高危"
	case score >= 40:
		return "中危"
	default:
		return "低危"
	}
}
