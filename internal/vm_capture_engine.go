package internal

// vCenter VM 抓包引擎：SSH 进 guest 执行 sudo -n tcpdump，stdout 经 TeeReader
// 同时落盘 dataDir/captures 与旁路 gopacket 解码（实时预览 + 规则风险引擎）。
// 限制（见 2026-09 demo-v2 方案）：每 VM 1 并发、全局并发上限、snaplen ≤1600、
// 单文件 ≤128MiB、时长 ≤300s、保留 7 天 + 总配额 2GiB；仅 admin 可发起并全程审计。

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/gopacket/pcapgo"
	"github.com/vmware/govmomi"
	"golang.org/x/crypto/ssh"
)

const (
	vmCaptureMaxSnaplen             = 1600
	vmCaptureMaxDurationSec         = 300
	vmCaptureMinDurationSec         = 5
	vmCaptureMaxFileMiB             = 128
	vmCaptureMinFileMiB             = 8
	vmCaptureGlobalConcurrent       = 3
	vmCaptureRetainDays             = 7
	vmCaptureQuotaBytes       int64 = 2 << 30 // 2 GiB
	vmCapturePreviewLines           = 300
	vmCaptureStderrTail             = 1024
	vmCaptureDirName                = "captures"
)

var vmCaptureIfaceRe = regexp.MustCompile(`^[A-Za-z0-9._-]{1,16}$`)
var vmCaptureBPFRe = regexp.MustCompile("[`'\"\\\\$;&|<>\r\n\x00]")

// vmCaptureValidateBPF 拒绝可能逃逸单引号上下文的字符（命令以 '包裹执行）。
func vmCaptureValidateBPF(bpf string) error {
	if len(bpf) > 512 {
		return errors.New("BPF 过滤器过长（≤512 字符）")
	}
	if vmCaptureBPFRe.MatchString(bpf) {
		return errors.New("BPF 过滤器包含不允许的字符（引号/反引号/$ ; & | < > 反斜杠等）")
	}
	return nil
}

func vmCaptureSanitizeNamePart(s string) string {
	out := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return -1
	}, s)
	if out == "" {
		out = "vm"
	}
	if len(out) > 48 {
		out = out[:48]
	}
	return out
}

// vmCapturePreviewLine 终端预览行（带递增 seq，前端按 cursor 增量拉取）。
type vmCapturePreviewLine struct {
	Seq   int    `json:"seq"`
	Proto string `json:"proto"`
	Text  string `json:"text"`
}

// vmCaptureOptions start 入参（已归一化）。
type vmCaptureOptions struct {
	BPF         string `json:"bpf"`
	Iface       string `json:"iface"`
	Snaplen     int    `json:"snaplen"`
	MaxMiB      int    `json:"maxMiB"`
	DurationSec int    `json:"durationSec"`
	AIEnabled   bool   `json:"aiEnabled"`
	RulesOnly   bool   `json:"rulesOnly,omitempty"`
	VMName      string `json:"vmName"`
}

// vmCaptureFileMeta sidecar {name}.meta.json：历史列表与 AI 报告的数据来源。
type vmCaptureFileMeta struct {
	Name        string             `json:"name"`
	Moref       string             `json:"moref"`
	VMName      string             `json:"vmName,omitempty"`
	GuestIP     string             `json:"guestIp,omitempty"`
	BPF         string             `json:"bpf"`
	Iface       string             `json:"iface"`
	Snaplen     int                `json:"snaplen"`
	StartedAt   string             `json:"startedAt"`
	EndedAt     string             `json:"endedAt"`
	DurationSec float64            `json:"durationSec"`
	Packets     int64              `json:"packets"`
	Bytes       int64              `json:"bytes"`
	Status      string             `json:"status"`
	StopReason  string             `json:"stopReason,omitempty"`
	ErrText     string             `json:"errText,omitempty"`
	RiskScore   int                `json:"riskScore"`
	Findings    []vmCaptureFinding `json:"findings"`
	ProtoDist   map[string]int64   `json:"protoDist"`
	Endpoints   map[string]int64   `json:"endpoints"`
	AIReady     bool               `json:"aiReady,omitempty"`
	AIEnabled   bool               `json:"aiEnabled"`
}

type vmCaptureSession struct {
	app *ServerApp

	mu          sync.Mutex
	Name        string
	Moref       string
	VMName      string
	GuestIP     string
	BPF         string
	Iface       string
	Snaplen     int
	MaxBytes    int64
	MaxDuration time.Duration
	AIEnabled   bool
	FilePath    string
	StartedAt   time.Time
	EndedAt     time.Time
	Status      string // running | done | error
	StopReason  string // manual | size | duration | remote-exit
	ErrText     string
	stderrTail  string
	packets     int64
	bytes       int64
	lines       []vmCapturePreviewLine
	lineSeq     int
	findings    []vmCaptureFinding
	protoCounts map[string]int64
	endpoints   map[string]int64
	risk        *vmCaptureRiskEngine
	ppsWindow   []time.Time
	sshClient   *ssh.Client
	sshSess     *ssh.Session
	cancel      context.CancelFunc
	durTimer    *time.Timer
	stopOnce    sync.Once
	done        chan struct{}
	finishOnce  sync.Once
}

type vmCaptureManager struct {
	mu       sync.Mutex
	sessions map[string]*vmCaptureSession // key: moref
	starting map[string]struct{}          // reserved slots while SSH/tcpdump startup is in progress
}

var vmCaptures = &vmCaptureManager{sessions: map[string]*vmCaptureSession{}, starting: map[string]struct{}{}}

func vmCaptureDir(dataDir string) string {
	return filepath.Join(dataDir, vmCaptureDirName)
}

// vmCaptureResolveSSH 解析 VM guest IP 并建立 SSH 连接（复用 listening-ports 链路）。
func vmCaptureResolveSSH(ctx context.Context, app *ServerApp, moref string) (*ssh.Client, string, error) {
	vc := app.VCenter()
	cfg := app.Cfg()
	if !vc.cfg.vCenterConfigured() {
		return nil, "", errors.New("vCenter 未配置")
	}
	key, kerr := sshEncryptionKey(cfg)
	var st *SSHVMStored
	if app.SSHStore() != nil && kerr == nil {
		st, _ = app.SSHStore().GetVM(ctx, moref, key)
	}
	if !sshEffectiveReady(ctx, cfg, app.SSHStore(), moref, key) {
		return nil, "", errors.New("未配置 SSH：请在环境变量中设置 VCENTER_VM_SSH_*，或在该虚拟机页面保存凭据")
	}
	var guestIP string
	err := vc.WithClientRetry(ctx, func(govClient *govmomi.Client) error {
		var e error
		guestIP, e = vcenterVMPrimaryGuestIP(ctx, govClient, moref)
		return e
	})
	if err != nil {
		return nil, "", fmt.Errorf("读取 guest IP 失败: %w", err)
	}
	sshCfg, err := buildSSHClientConfigMerged(cfg, st)
	if err != nil {
		return nil, "", err
	}
	port := cfg.VCenterVMSshPort
	if st != nil && st.Port > 0 {
		port = st.Port
	}
	client, err := ssh.Dial("tcp", net.JoinHostPort(guestIP, strconv.Itoa(port)), sshCfg)
	if err != nil {
		return nil, guestIP, fmt.Errorf("SSH 连接失败: %w", err)
	}
	return client, guestIP, nil
}

// vmCaptureRunOnce 一次性命令（预检 / BPF 语法校验）。
func vmCaptureRunOnce(ctx context.Context, client *ssh.Client, cmd string, timeout time.Duration) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	sess, err := client.NewSession()
	if err != nil {
		return "", err
	}
	defer sess.Close()
	type res struct {
		out []byte
		err error
	}
	ch := make(chan res, 1)
	go func() {
		out, err := sess.CombinedOutput(cmd)
		ch <- res{out, err}
	}()
	select {
	case <-ctx.Done():
		_ = sess.Close()
		return "", ctx.Err()
	case r := <-ch:
		return string(r.out), r.err
	}
}

type vmCountingWriter struct {
	f    *os.File
	n    int64
	max  int64
	over bool
}

func (w *vmCountingWriter) Write(p []byte) (int, error) {
	n, err := w.f.Write(p)
	w.n += int64(n)
	if w.max > 0 && w.n >= w.max {
		w.over = true
	}
	return n, err
}

func vmCaptureNormalizeOptions(opts *vmCaptureOptions) error {
	opts.Iface = strings.TrimSpace(opts.Iface)
	if opts.Iface == "" {
		opts.Iface = "any"
	}
	if !vmCaptureIfaceRe.MatchString(opts.Iface) {
		return errors.New("网卡名非法（仅允许字母数字与 . _ -）")
	}
	opts.BPF = strings.TrimSpace(opts.BPF)
	if err := vmCaptureValidateBPF(opts.BPF); err != nil {
		return err
	}
	if opts.Snaplen <= 0 || opts.Snaplen > vmCaptureMaxSnaplen {
		return fmt.Errorf("snaplen 需在 1–%d 之间", vmCaptureMaxSnaplen)
	}
	if opts.MaxMiB < vmCaptureMinFileMiB {
		opts.MaxMiB = vmCaptureMinFileMiB
	}
	if opts.MaxMiB > vmCaptureMaxFileMiB {
		return fmt.Errorf("单文件上限不可超过 %d MiB", vmCaptureMaxFileMiB)
	}
	if opts.DurationSec < vmCaptureMinDurationSec {
		opts.DurationSec = vmCaptureMinDurationSec
	}
	if opts.DurationSec > vmCaptureMaxDurationSec {
		return fmt.Errorf("时长上限不可超过 %d 秒", vmCaptureMaxDurationSec)
	}
	return nil
}

// vmCaptureStart 启动一个抓包会话；成功后立即返回，状态经 status 拉取。
func (m *vmCaptureManager) start(app *ServerApp, moref string, opts vmCaptureOptions) (*vmCaptureSession, error) {
	moref = strings.TrimSpace(moref)
	if err := vmCaptureNormalizeOptions(&opts); err != nil {
		return nil, err
	}

	m.mu.Lock()
	if m.sessions == nil {
		m.sessions = map[string]*vmCaptureSession{}
	}
	if m.starting == nil {
		m.starting = map[string]struct{}{}
	}
	_, running := m.sessions[moref]
	_, starting := m.starting[moref]
	if running || starting {
		m.mu.Unlock()
		return nil, errors.New("该虚拟机已有进行中的抓包会话")
	}
	if len(m.sessions)+len(m.starting) >= vmCaptureGlobalConcurrent {
		m.mu.Unlock()
		return nil, fmt.Errorf("全局并发抓包已达上限（%d）", vmCaptureGlobalConcurrent)
	}
	m.starting[moref] = struct{}{}
	m.mu.Unlock()
	reserved := true
	defer func() {
		if !reserved {
			return
		}
		m.mu.Lock()
		delete(m.starting, moref)
		m.mu.Unlock()
	}()

	ctx := context.Background()
	client, guestIP, err := vmCaptureResolveSSH(ctx, app, moref)
	if err != nil {
		return nil, err
	}
	// BPF 语法预校验：tcpdump -d 编译不过直接报错，不落任何文件（不加管道，保留退出码）
	if opts.BPF != "" {
		out, err := vmCaptureRunOnce(ctx, client, "sudo -n tcpdump -d '"+opts.BPF+"' 2>&1", 15*time.Second)
		if err != nil || strings.Contains(out, "a password is required") || strings.Contains(out, "tcpdump: ") {
			hint := strings.TrimSpace(out)
			if hint == "" && err != nil {
				hint = err.Error()
			}
			_ = client.Close()
			return nil, fmt.Errorf("BPF 过滤器校验失败: %s", vmTruncateStr(hint, 400))
		}
	}

	dir := vmCaptureDir(app.DataDir())
	if err := os.MkdirAll(dir, 0o700); err != nil {
		_ = client.Close()
		return nil, err
	}
	name := fmt.Sprintf("%s_%s.pcap", vmCaptureSanitizeNamePart(moref), time.Now().Format("20060102-150405-000000000"))
	path := filepath.Join(dir, name)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		_ = client.Close()
		return nil, err
	}

	var risk *vmCaptureRiskEngine
	if opts.AIEnabled {
		risk = newVMCaptureRiskEngine()
	}
	s := &vmCaptureSession{
		app:         app,
		Name:        name,
		Moref:       moref,
		VMName:      strings.TrimSpace(opts.VMName),
		GuestIP:     guestIP,
		BPF:         opts.BPF,
		Iface:       opts.Iface,
		Snaplen:     opts.Snaplen,
		MaxBytes:    int64(opts.MaxMiB) << 20,
		MaxDuration: time.Duration(opts.DurationSec) * time.Second,
		AIEnabled:   opts.AIEnabled,
		FilePath:    path,
		StartedAt:   time.Now(),
		Status:      "running",
		risk:        risk,
		protoCounts: map[string]int64{},
		endpoints:   map[string]int64{},
		sshClient:   client,
		done:        make(chan struct{}),
	}
	_, cancel := context.WithCancel(ctx)
	s.cancel = cancel

	sess, err := client.NewSession()
	if err != nil {
		cancel()
		_ = f.Close()
		_ = os.Remove(path)
		_ = client.Close()
		return nil, err
	}
	s.sshSess = sess
	stdout, err := sess.StdoutPipe()
	if err != nil {
		cancel()
		_ = f.Close()
		_ = os.Remove(path)
		_ = client.Close()
		return nil, err
	}
	stderr, err := sess.StderrPipe()
	if err != nil {
		cancel()
		_ = f.Close()
		_ = os.Remove(path)
		_ = client.Close()
		return nil, err
	}
	bpfArg := ""
	if opts.BPF != "" {
		bpfArg = " '" + opts.BPF + "'"
	}
	cmd := fmt.Sprintf("sudo -n tcpdump -i %s -U -s %d -w -%s", opts.Iface, opts.Snaplen, bpfArg)
	if err := sess.Start(cmd); err != nil {
		cancel()
		_ = f.Close()
		_ = os.Remove(path)
		_ = client.Close()
		return nil, fmt.Errorf("启动 tcpdump 失败: %w", err)
	}

	m.mu.Lock()
	delete(m.starting, moref)
	reserved = false
	// 防御性复检：预留槽位期间不应有其他会话进入。
	if _, running := m.sessions[moref]; running || len(m.sessions) >= vmCaptureGlobalConcurrent {
		m.mu.Unlock()
		cancel()
		_ = sess.Close()
		_ = f.Close()
		_ = os.Remove(path)
		_ = client.Close()
		return nil, errors.New("抓包并发状态已变化，请重试")
	}
	m.sessions[moref] = s
	m.mu.Unlock()

	s.durTimer = time.AfterFunc(s.MaxDuration, func() { s.stop("duration") })
	go s.drainStderr(stderr)
	go s.pump(stdout, f)
	return s, nil
}

func (s *vmCaptureSession) drainStderr(r io.Reader) {
	buf := make([]byte, 512)
	var tail []byte
	for {
		n, err := r.Read(buf)
		if n > 0 {
			tail = append(tail, buf[:n]...)
			if len(tail) > vmCaptureStderrTail {
				tail = tail[len(tail)-vmCaptureStderrTail:]
			}
			s.mu.Lock()
			s.stderrTail = string(tail)
			s.mu.Unlock()
		}
		if err != nil {
			return
		}
	}
}

// pump 旁路解码主循环：stdout →(tee)→ pcap 文件 + gopacket 解码。
// 注意：pump 自身路径（EOF / 超限）只能调用 requestStop 并 return，由 defer finalize 收尾，
// 否则会在等待 done 通道时自阻塞。
func (s *vmCaptureSession) pump(stdout io.Reader, f *os.File) {
	defer s.finalize("remote-exit")
	defer f.Close()
	cw := &vmCountingWriter{f: f, max: s.MaxBytes}
	rdr, err := pcapgo.NewReader(io.TeeReader(stdout, cw))
	if err != nil {
		s.mu.Lock()
		s.ErrText = "pcap 流解析失败（tcpdump 可能未启动，检查 sudo -n 免密配置）"
		s.Status = "error"
		s.mu.Unlock()
		s.requestStop("remote-exit")
		return
	}
	// pcapgo 已消费全局头（TeeReader 同步落盘），从文件读原始 linktype 以识别 SLL2
	rawLinkType := vmPcapFileLinkType(s.FilePath)
	for {
		pkt, readErr := vmCaptureReadPacket(rdr, rawLinkType)
		if readErr != nil {
			if !errors.Is(readErr, io.EOF) && !errors.Is(readErr, io.ErrUnexpectedEOF) {
				s.mu.Lock()
				s.ErrText = "pcap 流读取或落盘失败: " + vmTruncateStr(readErr.Error(), 240)
				s.Status = "error"
				s.mu.Unlock()
			}
			return
		}
		s.mu.Lock()
		s.packets++
		no := int(s.packets)
		s.bytes = cw.n
		s.mu.Unlock()
		info := vmAnalyzePacket(pkt, no)
		s.consume(info)
		if cw.over {
			s.requestStop("size")
			return
		}
	}
}

// consume 更新预览/统计并喂风险引擎（engine 与 pump 同一 goroutine 调用）。
func (s *vmCaptureSession) consume(info *vmPacketInfo) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.protoCounts[info.ProtoLabel]++
	if info.SrcIP != "" {
		s.endpoints[info.SrcIP]++
	}
	if info.DstIP != "" {
		s.endpoints[info.DstIP]++
	}
	s.lineSeq++
	line := vmCapturePreviewLine{Seq: s.lineSeq, Proto: info.ProtoLabel, Text: info.Info}
	s.lines = append(s.lines, line)
	if len(s.lines) > vmCapturePreviewLines {
		s.lines = s.lines[len(s.lines)-vmCapturePreviewLines:]
	}
	now := time.Now()
	s.ppsWindow = append(s.ppsWindow, now)
	cut := now.Add(-5 * time.Second)
	idx := 0
	for idx < len(s.ppsWindow) && s.ppsWindow[idx].Before(cut) {
		idx++
	}
	s.ppsWindow = s.ppsWindow[idx:]
	if s.AIEnabled && s.risk != nil {
		s.risk.Feed(info)
		s.findings = s.risk.Findings()
	}
}

// requestStop 非阻塞停止：关闭 SSH 通道使远端 tcpdump 退出；幂等。
func (s *vmCaptureSession) requestStop(reason string) {
	s.stopOnce.Do(func() {
		s.mu.Lock()
		if s.StopReason == "" {
			s.StopReason = reason
		}
		s.mu.Unlock()
		if s.cancel != nil {
			s.cancel()
		}
		if s.sshSess != nil {
			_ = s.sshSess.Close()
		}
		if s.sshClient != nil {
			_ = s.sshClient.Close()
		}
	})
}

// stop 阻塞停止：requestStop 后等待收尾完成（最多 5s）。
func (s *vmCaptureSession) stop(reason string) {
	s.requestStop(reason)
	s.waitDone(5 * time.Second)
}

// waitDone 等待 finalize 完成（删除文件前调用，避免 sidecar 落盘竞态）。
func (s *vmCaptureSession) waitDone(d time.Duration) {
	select {
	case <-s.done:
	case <-time.After(d):
		s.finalize("")
	}
}

// finalize 收尾：关文件、写 sidecar、退出管理器、审计；幂等。
func (s *vmCaptureSession) finalize(reason string) {
	s.finishOnce.Do(func() {
		if s.durTimer != nil {
			s.durTimer.Stop()
		}
		if s.cancel != nil {
			s.cancel()
		}
		if s.sshSess != nil {
			_ = s.sshSess.Close()
		}
		if s.sshClient != nil {
			_ = s.sshClient.Close()
		}
		s.mu.Lock()
		s.EndedAt = time.Now()
		if s.StopReason == "" {
			s.StopReason = reason
		}
		stderrTail := s.stderrTail
		if s.Status == "running" {
			s.Status = "done"
		}
		meta := s.metaLocked()
		fPath := s.FilePath
		s.mu.Unlock()
		if f, err := os.OpenFile(fPath+".meta.json", os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600); err == nil {
			_ = json.NewEncoder(f).Encode(meta)
			_ = f.Close()
		}
		if s.app != nil {
			AppendAuditRecord(s.app, AuditRecord{
				Action: "vm_capture_finish",
				User:   "",
				Method: "-",
				Detail: fmt.Sprintf("file=%s vm=%s packets=%d bytes=%d reason=%s status=%s stderr=%q", meta.Name, meta.VMName, meta.Packets, meta.Bytes, meta.StopReason, meta.Status, vmTruncateStr(stderrTail, 200)),
			})
		}
		close(s.done)
		vmCaptures.mu.Lock()
		if vmCaptures.sessions[s.Moref] == s {
			delete(vmCaptures.sessions, s.Moref)
		}
		vmCaptures.mu.Unlock()
		go vmCaptureCleanup(s.app.DataDir())
	})
}

func (s *vmCaptureSession) metaLocked() vmCaptureFileMeta {
	riskScore := 0
	findings := []vmCaptureFinding{}
	if s.risk != nil {
		riskScore = s.risk.Score()
		findings = s.risk.Findings()
	}
	dur := 0.0
	if !s.EndedAt.IsZero() {
		dur = s.EndedAt.Sub(s.StartedAt).Seconds()
	}
	return vmCaptureFileMeta{
		Name: s.Name, Moref: s.Moref, VMName: s.VMName, GuestIP: s.GuestIP,
		BPF: s.BPF, Iface: s.Iface, Snaplen: s.Snaplen,
		StartedAt:   s.StartedAt.UTC().Format(time.RFC3339),
		EndedAt:     s.EndedAt.UTC().Format(time.RFC3339),
		DurationSec: dur, Packets: s.packets, Bytes: s.bytes,
		Status: s.Status, StopReason: s.StopReason, ErrText: s.ErrText,
		RiskScore: riskScore, Findings: findings,
		ProtoDist: s.protoCounts, Endpoints: s.endpoints,
		AIEnabled: s.AIEnabled,
	}
}

// StatusDTO 面板轮询响应；afterSeq>0 时 previewLines 仅返回其后的行。
type vmCaptureStatusDTO struct {
	Name         string                 `json:"name"`
	Status       string                 `json:"status"`
	StopReason   string                 `json:"stopReason,omitempty"`
	ErrText      string                 `json:"errText,omitempty"`
	StderrTail   string                 `json:"stderrTail,omitempty"`
	VMName       string                 `json:"vmName"`
	Moref        string                 `json:"moref"`
	GuestIP      string                 `json:"guestIp"`
	BPF          string                 `json:"bpf"`
	Iface        string                 `json:"iface"`
	Snaplen      int                    `json:"snaplen"`
	MaxMiB       int                    `json:"maxMiB"`
	DurationSec  int                    `json:"durationSec"`
	AIEnabled    bool                   `json:"aiEnabled"`
	StartedAt    string                 `json:"startedAt"`
	ElapsedSec   float64                `json:"elapsedSec"`
	Packets      int64                  `json:"packets"`
	Bytes        int64                  `json:"bytes"`
	Pps          int                    `json:"pps"`
	RiskScore    int                    `json:"riskScore"`
	RiskLevel    string                 `json:"riskLevel"`
	Findings     []vmCaptureFinding     `json:"findings"`
	PreviewSeq   int                    `json:"previewSeq"`
	PreviewLines []vmCapturePreviewLine `json:"previewLines"`
	ProtoDist    []vmCaptureKV          `json:"protoDist"`
}

type vmCaptureKV struct {
	Key   string `json:"key"`
	Count int64  `json:"count"`
}

func vmTopK(m map[string]int64, n int) []vmCaptureKV {
	out := make([]vmCaptureKV, 0, len(m))
	for k, v := range m {
		out = append(out, vmCaptureKV{Key: k, Count: v})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Count > out[j].Count })
	if len(out) > n {
		out = out[:n]
	}
	return out
}

func (s *vmCaptureSession) statusDTO(afterSeq int) vmCaptureStatusDTO {
	s.mu.Lock()
	defer s.mu.Unlock()
	elapsed := time.Since(s.StartedAt).Seconds()
	if !s.EndedAt.IsZero() {
		elapsed = s.EndedAt.Sub(s.StartedAt).Seconds()
	}
	dto := vmCaptureStatusDTO{
		Name: s.Name, Status: s.Status, StopReason: s.StopReason, ErrText: s.ErrText,
		StderrTail: vmTruncateStr(s.stderrTail, 400), VMName: s.VMName, Moref: s.Moref,
		GuestIP: s.GuestIP, BPF: s.BPF, Iface: s.Iface, Snaplen: s.Snaplen,
		MaxMiB: int(s.MaxBytes >> 20), DurationSec: int(s.MaxDuration.Seconds()),
		AIEnabled: s.AIEnabled, StartedAt: s.StartedAt.UTC().Format(time.RFC3339),
		ElapsedSec: elapsed, Packets: s.packets, Bytes: s.bytes,
		Pps: len(s.ppsWindow), PreviewSeq: s.lineSeq,
	}
	lines := []vmCapturePreviewLine{}
	for _, l := range s.lines {
		if l.Seq > afterSeq {
			lines = append(lines, l)
		}
	}
	dto.PreviewLines = lines
	if s.risk != nil {
		dto.RiskScore = s.risk.Score()
		dto.RiskLevel = vmCaptureRiskLevel(dto.RiskScore)
		dto.Findings = s.findings
	}
	dto.ProtoDist = vmTopK(s.protoCounts, 8)
	return dto
}

func (s *vmCaptureSession) packetCount() int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.packets
}

// list 合并运行中会话与历史文件。
func (m *vmCaptureManager) list(app *ServerApp, moref string) ([]vmCaptureStatusDTO, []vmCaptureFileMeta, error) {
	running := []vmCaptureStatusDTO{}
	m.mu.Lock()
	if s, ok := m.sessions[moref]; ok {
		// 列表接口只用于发现运行中的会话；预览行由 1s status 增量接口拉取，
		// 避免这里每 3s 再携带最多 300 行完整 ring。
		running = append(running, s.statusDTO(int(^uint(0)>>1)))
	}
	m.mu.Unlock()
	files, err := vmCaptureListFiles(app.DataDir(), moref)
	return running, files, err
}

// vmCaptureListFiles 扫描 captures 目录（可按 moref 过滤），保留期内且配额清理后返回。
func vmCaptureListFiles(dataDir, moref string) ([]vmCaptureFileMeta, error) {
	dir := vmCaptureDir(dataDir)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []vmCaptureFileMeta{}, nil
		}
		return nil, err
	}
	prefix := ""
	if moref != "" {
		prefix = vmCaptureSanitizeNamePart(moref) + "_"
	}
	out := []vmCaptureFileMeta{}
	for _, e := range entries {
		n := e.Name()
		if !strings.HasSuffix(n, ".meta.json") || strings.HasPrefix(n, ".") {
			continue
		}
		if prefix != "" && !strings.HasPrefix(n, prefix) {
			continue
		}
		b, err := os.ReadFile(filepath.Join(dir, n))
		if err != nil {
			continue
		}
		var meta vmCaptureFileMeta
		if json.Unmarshal(b, &meta) != nil {
			continue
		}
		if meta.Name == "" {
			meta.Name = strings.TrimSuffix(n, ".meta.json")
		}
		out = append(out, meta)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StartedAt > out[j].StartedAt })
	return out, nil
}

// vmCaptureUsage captures 目录当前占用与配额。
func vmCaptureUsage(dataDir string) (used int64, quota int64) {
	quota = vmCaptureQuotaBytes
	entries, err := os.ReadDir(vmCaptureDir(dataDir))
	if err != nil {
		return 0, quota
	}
	for _, e := range entries {
		if info, err := e.Info(); err == nil {
			used += info.Size()
		}
	}
	return used, quota
}

// vmCaptureCleanup 保留期（7 天）与总配额（2 GiB）清理；调用方异步执行。
func vmCaptureCleanup(dataDir string) {
	dir := vmCaptureDir(dataDir)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	cutoff := time.Now().AddDate(0, 0, -vmCaptureRetainDays)
	active := map[string]bool{}
	vmCaptures.mu.Lock()
	for _, s := range vmCaptures.sessions {
		active[s.Name] = true
	}
	vmCaptures.mu.Unlock()
	type captureGroup struct {
		name   string
		paths  []string
		size   int64
		newest time.Time
	}
	groupsByName := map[string]*captureGroup{}
	var total int64
	for _, e := range entries {
		n := e.Name()
		if !strings.HasSuffix(n, ".pcap") && !strings.HasSuffix(n, ".meta.json") && !strings.HasSuffix(n, ".ai.json") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		base := n
		if strings.HasSuffix(base, ".meta.json") {
			base = strings.TrimSuffix(base, ".meta.json")
		} else if strings.HasSuffix(base, ".ai.json") {
			base = strings.TrimSuffix(base, ".ai.json")
		}
		g := groupsByName[base]
		if g == nil {
			g = &captureGroup{name: base}
			groupsByName[base] = g
		}
		g.paths = append(g.paths, filepath.Join(dir, n))
		g.size += info.Size()
		if info.ModTime().After(g.newest) {
			g.newest = info.ModTime()
		}
		total += info.Size()
	}
	groups := make([]*captureGroup, 0, len(groupsByName))
	for _, g := range groupsByName {
		groups = append(groups, g)
	}
	sort.Slice(groups, func(i, j int) bool { return groups[i].newest.Before(groups[j].newest) })
	for _, g := range groups {
		if active[g.name] {
			continue
		}
		expired := g.newest.Before(cutoff)
		overQuota := total > vmCaptureQuotaBytes
		if !expired && !overQuota {
			continue
		}
		removed := int64(0)
		for _, path := range g.paths {
			if info, err := os.Stat(path); err == nil {
				if err := os.Remove(path); err == nil {
					removed += info.Size()
				}
			}
		}
		total -= removed
	}
}
