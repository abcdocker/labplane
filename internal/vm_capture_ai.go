package internal

// vm_capture_ai.go 抓包 AI 三件套：BPF 命令解读、pcap 分析报告、报告追问。
// 分层原则：gopacket 平台解码给出统计事实，规则引擎给本地可判定风险；
// AI 判读模型（复用巡检 OpsAIInspectConfig）只做文案研判——模型不可用时全部降级为规则结论。
// 红线：送入模型的上下文只含统计与已脱敏的发现，绝不包含原始载荷/口令。

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/google/gopacket/pcapgo"
)

type vmCaptureInterpretLine struct {
	Level string `json:"level"` // ok | warn | bad | info
	Text  string `json:"text"`
}

type vmCaptureInterpretResult struct {
	Command string                   `json:"command"`
	Lines   []vmCaptureInterpretLine `json:"lines"`
	AIUsed  bool                     `json:"aiUsed"`
	AIError string                   `json:"aiError,omitempty"`
}

var vmCaptureHostRe = regexp.MustCompile(`host [0-9]`)

// vmCaptureBuildCommand 回显实际执行的命令。
func vmCaptureBuildCommand(opts vmCaptureOptions) string {
	bpf := ""
	if opts.BPF != "" {
		bpf = " '" + opts.BPF + "'"
	}
	return fmt.Sprintf("sudo -n tcpdump -i %s -U -s %d -w -%s", opts.Iface, opts.Snaplen, bpf)
}

// vmCaptureInterpret 规则解读（即时）+ 判读模型增强（如已配置）。
func vmCaptureInterpret(app *ServerApp, opts vmCaptureOptions) vmCaptureInterpretResult {
	cmd := vmCaptureBuildCommand(opts)
	var lines []vmCaptureInterpretLine
	add := func(level, text string) { lines = append(lines, vmCaptureInterpretLine{Level: level, Text: text}) }
	b := strings.ToLower(opts.BPF)
	add("info", "命令："+cmd)
	switch {
	case opts.BPF == "":
		add("bad", fmt.Sprintf("过滤器为空 = 全量抓包：所有明文协议（Redis/DNS/HTTP/Telnet）与口令将完整入包；%d MiB 上限在高流量 VM 上可能数分钟内写满。建议至少排除 SSH（not tcp port 22）", opts.MaxMiB))
	default:
		show := opts.BPF
		if len(show) > 48 {
			show = show[:48] + "…"
		}
		add("ok", fmt.Sprintf("过滤范围明确（%s），配合 %d MiB / %d 秒上限，文件体积可控", show, opts.MaxMiB, opts.DurationSec))
	}
	if strings.Contains(b, "6379") {
		add("warn", "Redis 为明文协议：AUTH 口令、GET/SET 键值将完整出现在抓包数据中。文件按敏感策略存储（仅 admin 可下载），建议分析完成后即删，必要时轮换口令")
	}
	if strings.Contains(b, "not port 22") || strings.Contains(b, "not tcp port 22") {
		add("info", "SSH 已被排除：本次窗口内的登录行为不在审计范围内（如需审计来源 IP，可改用 host 聚焦只看握手）")
	}
	if strings.Contains(b, "53") {
		add("info", "DNS 为明文：可看到全部查询域名（含内部服务名），可用于发现数据外发渠道，注意勿外传")
	}
	if strings.Contains(b, "443") {
		add("info", "HTTPS 载荷已加密：可分析 SNI/证书/时序特征，内容不可见")
	}
	if vmCaptureHostRe.MatchString(b) {
		add("ok", "按主机聚焦，噪声小，AI 关联分析准确率更高")
	}
	add("info", "平台将在回传链路旁路解码：实时风险流 + 停止后生成分析报告（风险指数 / Top 端点 / 处置建议）")

	res := vmCaptureInterpretResult{Command: cmd, Lines: lines}
	// AI 增强（失败不影响规则结论）
	if !opts.RulesOnly {
		if bundle, err := loadOpsAIInspectBundle(app.PlatformKV()); err == nil && opsJudgeReady(bundle.AI) {
			sys := "你是网络抓包与安全专家。解读一条将在 Linux VM 内执行的 tcpdump 抓包命令，指出过滤范围、数据敏感面（明文口令/协议）、体积与审计影响。要求：中文，每条一句话以内，最多 5 条；只输出 JSON：{\"lines\":[{\"level\":\"ok|warn|bad|info\",\"text\":\"…\"}]}"
			user := fmt.Sprintf("命令：%s\n参数：iface=%s snaplen=%d 大小上限=%dMiB 时长上限=%ds\n已有规则解读供参考（不要重复）：\n%s",
				cmd, opts.Iface, opts.Snaplen, opts.MaxMiB, opts.DurationSec, vmInterpretLinesPlain(lines))
			if content, _, err := opsInspectJudgeCall(app.PlatformKV(), app.Cfg(), bundle.AI, "vm_capture", sys, user, 1024); err == nil {
				if js := extractJSONObjectFromLLM(content); js != nil {
					var out struct {
						Lines []vmCaptureInterpretLine `json:"lines"`
					}
					if json.Unmarshal(js, &out) == nil && len(out.Lines) > 0 {
						for _, l := range out.Lines {
							switch l.Level {
							case "ok", "warn", "bad", "info":
							default:
								l.Level = "info"
							}
							if strings.TrimSpace(l.Text) != "" {
								lines = append(lines, vmCaptureInterpretLine{Level: l.Level, Text: strings.TrimSpace(l.Text)})
							}
						}
						res.Lines = lines
						res.AIUsed = true
						return res
					}
				}
			} else {
				res.AIError = vmTruncateStr(err.Error(), 200)
			}
		}
	}
	return res
}

func vmInterpretLinesPlain(lines []vmCaptureInterpretLine) string {
	var sb strings.Builder
	for _, l := range lines {
		sb.WriteString("[" + l.Level + "] " + l.Text + "\n")
	}
	return sb.String()
}

// ---- 分析报告 ----

type vmCaptureAIReportFinding struct {
	Severity string `json:"severity"` // high | mid | low
	Title    string `json:"title"`
	PacketNo int    `json:"packetNo,omitempty"`
	Desc     string `json:"desc"`
	Fix      string `json:"fix,omitempty"`
}

type vmCaptureAIAdvice struct {
	When string `json:"when"` // 立即 | 本周 | 计划
	Text string `json:"text"`
}

type vmCaptureAIReport struct {
	Engine      string                     `json:"engine"`
	Score       int                        `json:"score"`
	Level       string                     `json:"level"`
	Summary     string                     `json:"summary"`
	Findings    []vmCaptureAIReportFinding `json:"findings"`
	Advice      []vmCaptureAIAdvice        `json:"advice"`
	ProtoDist   []vmCaptureKV              `json:"protoDist"`
	Talkers     []vmCaptureEndpointStat    `json:"topTalkers"`
	DNSTop      []vmCaptureKV              `json:"dnsTop,omitempty"`
	SNITop      []vmCaptureKV              `json:"sniTop,omitempty"`
	GeneratedAt string                     `json:"generatedAt"`
	AiUsed      bool                       `json:"aiUsed"`
	AiError     string                     `json:"aiError,omitempty"`
}

// vmCaptureCollectAIContext 单次扫描 pcap：统计 + 规则引擎逐包复算（与实时引擎同规则，
// 保证报告中的 packet_no 可跳转）+ 送入模型的脱敏上下文（无任何原始载荷）。
func vmCaptureCollectAIContext(path string, meta vmCaptureFileMeta) (*vmCaptureAIReport, map[string]any, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer f.Close()
	rawLinkType := vmPcapFileLinkType(path)
	rdr, err := pcapgo.NewReader(f)
	if err != nil {
		return nil, nil, err
	}
	risk := newVMCaptureRiskEngine()
	protoCounts := map[string]int64{}
	talkers := map[string]*vmCaptureEndpointStat{}
	cmdCounts := map[string]int64{}
	dnsCounts := map[string]int64{}
	sniCounts := map[string]int64{}
	synSources := map[string]bool{}
	var total int64
	no := 0
	for {
		pkt, readErr := vmCaptureReadPacket(rdr, rawLinkType)
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				break
			}
			return nil, nil, fmt.Errorf("pcap 数据不完整: %w", readErr)
		}
		no++
		if no > vmCaptureDecodeMaxPackets {
			break
		}
		total++
		info := vmAnalyzePacket(pkt, no)
		risk.Feed(info)
		protoCounts[info.ProtoLabel]++
		for _, ip := range []string{info.SrcIP, info.DstIP} {
			if ip == "" {
				continue
			}
			st := talkers[ip]
			if st == nil {
				st = &vmCaptureEndpointStat{Endpoint: ip}
				talkers[ip] = st
			}
			st.Packets++
			st.Bytes += int64(info.Length)
		}
		if info.RespCmd != nil {
			cmdCounts[info.RespCmd.Name]++
		}
		for _, n := range info.DNSNames {
			dnsCounts[n]++
		}
		if info.SNI != "" {
			sniCounts[info.SNI]++
		}
		if info.SYN && info.SrcIP != "" && info.DstPort != 0 {
			synSources[info.SrcIP] = true
		}
	}
	tl := make([]vmCaptureEndpointStat, 0, len(talkers))
	for _, v := range talkers {
		tl = append(tl, *v)
	}
	sort.Slice(tl, func(i, j int) bool {
		if tl[i].Packets != tl[j].Packets {
			return tl[i].Packets > tl[j].Packets
		}
		return tl[i].Endpoint < tl[j].Endpoint
	})
	if len(tl) > 6 {
		tl = tl[:6]
	}
	report := &vmCaptureAIReport{
		Engine:      "gopacket 解码 + 规则风险模型",
		Score:       risk.Score(),
		Level:       vmCaptureRiskLevel(risk.Score()),
		Findings:    []vmCaptureAIReportFinding{},
		Advice:      []vmCaptureAIAdvice{},
		ProtoDist:   vmTopK(protoCounts, 10),
		Talkers:     tl,
		DNSTop:      vmTopK(dnsCounts, 8),
		SNITop:      vmTopK(sniCounts, 8),
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
	}
	for _, fd := range risk.Findings() {
		rf := vmCaptureAIReportFinding{
			Severity: fd.Sev,
			Title:    fd.Title,
			PacketNo: fd.PacketNo,
			Desc:     fd.Text,
		}
		switch fd.Sev {
		case vmCaptureSevHigh:
			rf.Fix = "立即处置：删除或限权本文件、轮换暴露的口令，并评估启用 TLS。"
		case vmCaptureSevMid:
			rf.Fix = "建议本周内跟进确认。"
		default:
			rf.Fix = "计划内跟进即可。"
		}
		report.Findings = append(report.Findings, rf)
	}
	report.Summary = vmCaptureRuleSummary(meta, total, report)
	ctxMap := map[string]any{
		"file":         meta.Name,
		"vm":           meta.VMName,
		"guestIp":      meta.GuestIP,
		"bpf":          meta.BPF,
		"iface":        meta.Iface,
		"duration":     meta.DurationSec,
		"packets":      total,
		"bytes":        meta.Bytes,
		"protoDist":    report.ProtoDist,
		"topTalkers":   report.Talkers,
		"dnsTop":       report.DNSTop,
		"sniTop":       report.SNITop,
		"respCommands": vmTopK(cmdCounts, 10),
		"synSources":   keysOfBool(synSources),
		"ruleFindings": report.Findings,
		"ruleScore":    report.Score,
	}
	return report, ctxMap, nil
}

func keysOfBool(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func vmCaptureRuleSummary(meta vmCaptureFileMeta, totalPackets int64, report *vmCaptureAIReport) string {
	total := totalPackets
	var topProto string
	var topCount int64
	if len(report.ProtoDist) > 0 {
		topProto = report.ProtoDist[0].Key
		topCount = report.ProtoDist[0].Count
	}
	pct := 0.0
	if total > 0 {
		pct = float64(topCount) / float64(total) * 100
	}
	sevCount := map[string]int{}
	for _, f := range report.Findings {
		sevCount[f.Severity]++
	}
	sb := strings.Builder{}
	fmt.Fprintf(&sb, "本窗口共解码 %s 包，流量主体为 %s（%.0f%%）。", fmt.Sprint(total), topProto, pct)
	if sevCount[vmCaptureSevHigh] > 0 {
		fmt.Fprintf(&sb, "规则引擎判定：中高风险——发现 %d 项高危（明文口令/凭据暴露）、%d 项中危。", sevCount[vmCaptureSevHigh], sevCount[vmCaptureSevMid])
	} else if sevCount[vmCaptureSevMid] > 0 {
		fmt.Fprintf(&sb, "规则引擎判定：中危——发现 %d 项中危特征，无明文口令暴露。", sevCount[vmCaptureSevMid])
	} else {
		sb.WriteString("规则引擎未发现明文口令、扫描或明文协议风险。")
	}
	if meta.BPF != "" {
		fmt.Fprintf(&sb, "（过滤器：%s）", meta.BPF)
	}
	return sb.String()
}

// vmCaptureAIReportForFile 生成（带缓存）或读取 AI 分析报告。
func vmCaptureAIReportForFile(app *ServerApp, pcapPath string, meta vmCaptureFileMeta, regen bool) (*vmCaptureAIReport, error) {
	cache := pcapPath + ".ai.json"
	if !regen {
		if b, err := os.ReadFile(cache); err == nil {
			var rep vmCaptureAIReport
			if json.Unmarshal(b, &rep) == nil {
				return &rep, nil
			}
		}
	}
	report, ctxMap, err := vmCaptureCollectAIContext(pcapPath, meta)
	if err != nil {
		return nil, err
	}
	bundle, bundleErr := loadOpsAIInspectBundle(app.PlatformKV())
	if bundleErr == nil && opsJudgeReady(bundle.AI) {
		ctxJSON, _ := json.Marshal(ctxMap)
		sys := `你是资深网络安全工程师，为运维平台生成 pcap 抓包分析报告。输入是平台解码后的统计事实与规则引擎发现（已脱敏）。
要求：
1) 基于给定事实研判，不得编造数据里没有的结论；引用发现时带上 packet_no。
2) score 为 0-100 风险指数（高危发现多则高）；summary 用中文 3-5 句；findings 按严重度排序；advice 给 2-4 条处置建议（when ∈ 立即|本周|计划）。
3) 只输出 JSON：{"score":62,"summary":"…","findings":[{"severity":"high|mid|low","title":"…","packet_no":31,"desc":"…","fix":"…"}],"advice":[{"when":"立即","text":"…"}]}`
		user := "解码上下文（JSON，载荷已脱敏）：\n" + string(ctxJSON) + "\n\n请输出分析报告 JSON。"
		if content, _, err := opsInspectJudgeCall(app.PlatformKV(), app.Cfg(), bundle.AI, "vm_capture", sys, user, 4096); err == nil {
			if js := extractJSONObjectFromLLM(content); js != nil {
				var aiOut struct {
					Score    int                        `json:"score"`
					Summary  string                     `json:"summary"`
					Findings []vmCaptureAIReportFinding `json:"findings"`
					Advice   []vmCaptureAIAdvice        `json:"advice"`
				}
				if json.Unmarshal(js, &aiOut) == nil && strings.TrimSpace(aiOut.Summary) != "" {
					if aiOut.Score >= 0 && aiOut.Score <= 100 {
						report.Score = aiOut.Score
						report.Level = vmCaptureRiskLevel(aiOut.Score)
					}
					report.Summary = aiOut.Summary
					if len(aiOut.Findings) > 0 {
						report.Findings = normalizeAIReportFindings(aiOut.Findings, report.Findings)
					}
					if len(aiOut.Advice) > 0 {
						report.Advice = aiOut.Advice
					}
					report.Engine = "gopacket 解码 + " + strings.TrimSpace(bundle.AI.JudgeModel.Model) + " 研判 · 平台内置，无需外发数据"
					report.AiUsed = true
				}
			}
		} else {
			report.AiError = vmTruncateStr(err.Error(), 200)
			report.Engine += "（AI 研判失败，已降级为规则结论）"
		}
	} else {
		report.Engine += "（未启用判读模型）"
	}
	if len(report.Advice) == 0 {
		report.Advice = vmCaptureFallbackAdvice(report)
	}
	report.GeneratedAt = time.Now().UTC().Format(time.RFC3339)
	if f, err := os.OpenFile(cache, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600); err == nil {
		_ = json.NewEncoder(f).Encode(report)
		_ = f.Close()
	}
	return report, nil
}

// normalizeAIReportFindings 校验 AI 发现的 severity/参考包号（超出解码范围则丢弃引用）。
func normalizeAIReportFindings(ai []vmCaptureAIReportFinding, rules []vmCaptureAIReportFinding) []vmCaptureAIReportFinding {
	maxNo := 0
	for _, r := range rules {
		if r.PacketNo > maxNo {
			maxNo = r.PacketNo
		}
	}
	out := make([]vmCaptureAIReportFinding, 0, len(ai))
	for _, f := range ai {
		switch f.Severity {
		case vmCaptureSevHigh, vmCaptureSevMid, vmCaptureSevLow:
		default:
			f.Severity = vmCaptureSevLow
		}
		if f.PacketNo > maxNo || f.PacketNo < 0 {
			f.PacketNo = 0
		}
		if strings.TrimSpace(f.Title) == "" {
			continue
		}
		f.Title = vmTruncateStr(strings.TrimSpace(f.Title), 120)
		f.Desc = vmTruncateStr(strings.TrimSpace(f.Desc), 800)
		f.Fix = vmTruncateStr(strings.TrimSpace(f.Fix), 500)
		out = append(out, f)
	}
	return out
}

func vmCaptureFallbackAdvice(report *vmCaptureAIReport) []vmCaptureAIAdvice {
	var out []vmCaptureAIAdvice
	for _, f := range report.Findings {
		switch {
		case f.Severity == vmCaptureSevHigh && strings.Contains(f.Title, "AUTH"):
			out = append(out, vmCaptureAIAdvice{When: "立即", Text: "轮换已暴露的 Redis 口令，并删除或收紧本抓包文件的访问权限"})
		case f.Severity == vmCaptureSevHigh && strings.Contains(f.Title, "Authorization"):
			out = append(out, vmCaptureAIAdvice{When: "立即", Text: "轮换明文 HTTP 凭据并改用 HTTPS"})
		case strings.Contains(f.Title, "端口扫描"):
			out = append(out, vmCaptureAIAdvice{When: "本周", Text: "确认扫描源是否为巡检探针（间隔均匀多为 Prometheus/blackbox），是则加入白名单消除误报"})
		case strings.Contains(f.Title, "大 value"):
			out = append(out, vmCaptureAIAdvice{When: "计划", Text: "拆分大 value 键或启用压缩，结合 slowlog 验证"})
		}
	}
	if len(out) == 0 {
		out = append(out, vmCaptureAIAdvice{When: "留存", Text: "本报告与 pcap 已关联存储；文件 7 天后自动清理，导出报告可长期归档"})
	}
	return out
}

// ---- 追问 ----

type vmCaptureChatTurn struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// vmCaptureAIChat 基于同一份脱敏上下文回答追问。
func vmCaptureAIChat(app *ServerApp, pcapPath string, meta vmCaptureFileMeta, report *vmCaptureAIReport, question string, history []vmCaptureChatTurn) (string, bool, error) {
	bundle, bundleErr := loadOpsAIInspectBundle(app.PlatformKV())
	if bundleErr != nil || !opsJudgeReady(bundle.AI) {
		fallback := "当前未启用判读模型，仅能给出规则引擎结论：" + report.Summary
		return fallback, false, nil
	}
	_, ctxMap, err := vmCaptureCollectAIContext(pcapPath, meta)
	if err != nil {
		return "", false, err
	}
	ctxJSON, _ := json.Marshal(ctxMap)
	var hist strings.Builder
	for _, h := range history {
		if len(h.Content) > 500 || len(history) > 6 {
			continue
		}
		role := "用户"
		if h.Role == "assistant" {
			role = "助手"
		}
		fmt.Fprintf(&hist, "%s：%s\n", role, h.Content)
	}
	sys := "你是运维平台的抓包分析助手。基于给定的 pcap 解码统计（已脱敏，无原始载荷）回答问题。中文回答，300 字以内，可引用 packet_no；数据中没有的事实要明说不知道。"
	user := fmt.Sprintf("解码上下文（JSON）：\n%s\n\n已有报告结论：%s\n\n最近对话：\n%s\n当前问题：%s", string(ctxJSON), report.Summary, hist.String(), question)
	content, _, err := opsInspectJudgeCall(app.PlatformKV(), app.Cfg(), bundle.AI, "vm_capture", sys, user, 2048)
	if err != nil {
		return "", false, err
	}
	return strings.TrimSpace(content), true, nil
}

// vmCaptureMetaForName 读取 sidecar 元数据（handler 通用入口）。
func vmCaptureMetaForName(dataDir, moref, name string) (vmCaptureFileMeta, string, error) {
	if !vmCaptureSafeName(name) {
		return vmCaptureFileMeta{}, "", fmt.Errorf("文件名非法")
	}
	base := vmCaptureSanitizeNamePart(moref) + "_"
	if !strings.HasPrefix(name, base) {
		return vmCaptureFileMeta{}, "", fmt.Errorf("文件不属于该虚拟机")
	}
	metaPath := filepath.Join(vmCaptureDir(dataDir), name+".meta.json")
	b, err := os.ReadFile(metaPath)
	if err != nil {
		return vmCaptureFileMeta{}, metaPath, err
	}
	var meta vmCaptureFileMeta
	if err := json.Unmarshal(b, &meta); err != nil {
		return meta, metaPath, err
	}
	return meta, filepath.Join(vmCaptureDir(dataDir), name), nil
}

var vmCaptureNameRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,48}_[0-9]{8}-[0-9]{6}(?:-[0-9]{9})?\.pcap$`)

func vmCaptureSafeName(name string) bool {
	return vmCaptureNameRe.MatchString(name)
}
