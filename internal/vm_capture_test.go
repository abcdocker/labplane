package internal

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcapgo"
)

func TestVMCaptureValidateBPF(t *testing.T) {
	ok := []string{"", "tcp port 6379", "host 192.168.21.99", "not tcp port 22", "tcp port 80 or tcp port 443", "host 1.2.3.4 and (port 80 or 443)", "icmp"}
	for _, bpf := range ok {
		if err := vmCaptureValidateBPF(bpf); err != nil {
			t.Errorf("合法 BPF %q 被拒绝: %v", bpf, err)
		}
	}
	bad := []string{
		"tcp port 6379'; rm -rf /",
		"tcp port 6379'; sudo cat /etc/shadow",
		"tcp port 6379\" || echo pwned",
		"tcp port 6379`id`",
		"tcp port $(id)",
		"tcp port 6379; id",
		"tcp port 6379 & echo hi",
		"tcp port 6379 | sh",
		"port 1 > /tmp/x",
		"port 1\x00",
	}
	for _, bpf := range bad {
		if err := vmCaptureValidateBPF(bpf); err == nil {
			t.Errorf("危险 BPF %q 未被拒绝", bpf)
		}
	}
}

func TestVMCaptureNormalizeOptionsMatchesStartLimits(t *testing.T) {
	opts := vmCaptureOptions{Iface: " any ", BPF: " tcp port 443 ", Snaplen: 1600, MaxMiB: 1, DurationSec: 1}
	if err := vmCaptureNormalizeOptions(&opts); err != nil {
		t.Fatal(err)
	}
	if opts.Iface != "any" || opts.BPF != "tcp port 443" || opts.MaxMiB != vmCaptureMinFileMiB || opts.DurationSec != vmCaptureMinDurationSec {
		t.Fatalf("归一化结果不正确: %+v", opts)
	}
	badIface := vmCaptureOptions{Iface: "any;id", Snaplen: 1600, MaxMiB: 8, DurationSec: 5}
	if err := vmCaptureNormalizeOptions(&badIface); err == nil {
		t.Fatal("非法网卡名未被拒绝")
	}
	badSnaplen := vmCaptureOptions{Iface: "any", Snaplen: vmCaptureMaxSnaplen + 1, MaxMiB: 8, DurationSec: 5}
	if err := vmCaptureNormalizeOptions(&badSnaplen); err == nil {
		t.Fatal("超限 snaplen 未被拒绝")
	}
}

func TestVMCaptureSafeName(t *testing.T) {
	for _, ok := range []string{
		"vm-42_20260921-094412.pcap",
		"vm-42_20260921-094412-123456789.pcap",
	} {
		if !vmCaptureSafeName(ok) {
			t.Errorf("合法文件名 %q 被拒", ok)
		}
	}
	for _, bad := range []string{"../vm-42_x.pcap", "/etc/passwd", "vm-42_20260921-094412.pcap.exe", "a_b.pcap", "vm-42_2026-0921-094412.pcap"} {
		if vmCaptureSafeName(bad) {
			t.Errorf("非法文件名 %q 通过", bad)
		}
	}
}

func TestVMAnalyzePacketShortTLSPayloadDoesNotPanic(t *testing.T) {
	data := buildIPPacket("10.0.0.1", "10.0.0.2", 40123, 443, []byte{0x16})
	pkt := gopacket.NewPacket(data, layers.LayerTypeIPv4, gopacket.Default)

	defer func() {
		if recovered := recover(); recovered != nil {
			t.Fatalf("1-byte TLS-like payload must not panic: %v", recovered)
		}
	}()
	info := vmAnalyzePacket(pkt, 1)
	if info.App == "TLS" {
		t.Fatalf("1-byte payload cannot be classified as TLS: %+v", info)
	}
	noPayloadData, _ := buildSynPacket("10.0.0.1", "10.0.0.2", 40123, 443, nil, true)
	noPayload := vmAnalyzePacket(gopacket.NewPacket(noPayloadData, layers.LayerTypeEthernet, gopacket.Default), 2)
	if noPayload.PayloadOffset != -1 {
		t.Fatalf("packet without application payload has offset %d, want -1", noPayload.PayloadOffset)
	}
}

func TestVMParseRESPAuth(t *testing.T) {
	payload := []byte("*2\r\n$4\r\nAUTH\r\n$16\r\ndemo-redis-pass\r\n")
	cmd, _, ok := vmParseRESP(payload)
	if !ok || cmd == nil {
		t.Fatalf("RESP AUTH 未解析: %v %v", cmd, ok)
	}
	if cmd.Name != "AUTH" || !cmd.SecretArg || cmd.SecretLen != 16 {
		t.Fatalf("AUTH 元数据不符: %+v", cmd)
	}
	cmd, _, ok = vmParseRESP([]byte("*2\r\n$3\r\nGET\r\n$14\r\nsession:active\r\n"))
	if !ok || cmd == nil || cmd.Name != "GET" || cmd.Key != "session:active" || cmd.SecretArg {
		t.Fatalf("GET 元数据不符: %+v", cmd)
	}
	_, bulk, ok := vmParseRESP([]byte("$86016\r\nAAAA"))
	if !ok || bulk != 86016 {
		t.Fatalf("bulk 长度未解析: %d %v", bulk, ok)
	}
}

func TestVMParseTLSSNI(t *testing.T) {
	if sni := vmParseTLSSNI([]byte{0x17, 0x03, 0x03, 0x00, 0x10}); sni != "" {
		t.Fatalf("非 ClientHello 不应解析出 SNI，得到 %q", sni)
	}
	sni := vmParseTLSSNI(buildTLSClientHello("harbor.frps.cn"))
	if sni != "harbor.frps.cn" {
		t.Fatalf("SNI 解析失败: %q", sni)
	}
}

func buildTLSClientHello(sni string) []byte {
	name := []byte(sni)
	extBody := []byte{0x00, 0x00} // server_name list
	extBody = append(extBody, 0x00)
	extBody = append(extBody, byte(len(name)>>8), byte(len(name)))
	extBody = append(extBody, name...)
	ext := append([]byte{0x00, 0x00, byte(len(extBody) >> 8), byte(len(extBody))}, extBody...)
	hello := []byte{0x01, 0x00, 0x00, 0x00}       // handshake header（长度占位）
	hello = append(hello, 0x03, 0x03)             // version
	hello = append(hello, make([]byte, 32)...)    // random
	hello = append(hello, 0x00)                   // session id
	hello = append(hello, 0x00, 0x02, 0x13, 0x01) // 1 cipher
	hello = append(hello, 0x01, 0x00)             // compression
	hello = append(hello, byte(len(ext)>>8), byte(len(ext)))
	hello = append(hello, ext...)
	hsLen := len(hello) - 4
	hello[1] = byte(hsLen >> 16)
	hello[2] = byte(hsLen >> 8)
	hello[3] = byte(hsLen)
	rec := []byte{0x16, 0x03, 0x01, byte(len(hello) >> 8), byte(len(hello))}
	return append(rec, hello...)
}

// buildTCPPacket 构造 Ethernet/IPv4/TCP 帧（gopacket 序列化含校验和）。
func buildSynPacket(srcIP, dstIP string, sport, dport uint16, payload []byte, syn bool) ([]byte, gopacket.CaptureInfo) {
	eth := &layers.Ethernet{SrcMAC: net.HardwareAddr{0x00, 0x50, 0x56, 0xaa, 0x01, 0x42}, DstMAC: net.HardwareAddr{0x00, 0x50, 0x56, 0xaa, 0x07, 0x19}, EthernetType: layers.EthernetTypeIPv4}
	ip := &layers.IPv4{Version: 4, TTL: 64, Protocol: layers.IPProtocolTCP, SrcIP: net.ParseIP(srcIP).To4(), DstIP: net.ParseIP(dstIP).To4()}
	tcp := &layers.TCP{SrcPort: layers.TCPPort(sport), DstPort: layers.TCPPort(dport), Window: 502, Seq: 1}
	if syn {
		tcp.SYN = true
	} else {
		tcp.PSH, tcp.ACK = true, true
	}
	tcp.SetNetworkLayerForChecksum(ip)
	buf := gopacket.NewSerializeBuffer()
	opts := gopacket.SerializeOptions{FixLengths: true, ComputeChecksums: true}
	layersl := []gopacket.SerializableLayer{eth, ip, tcp}
	if len(payload) > 0 {
		layersl = append(layersl, gopacket.Payload(payload))
	}
	if err := gopacket.SerializeLayers(buf, opts, layersl...); err != nil {
		panic(err)
	}
	return buf.Bytes(), gopacket.CaptureInfo{Timestamp: time.Now(), CaptureLength: len(buf.Bytes()), Length: len(buf.Bytes())}
}

func writeTestPcap(t *testing.T, path string) {
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	w := pcapgo.NewWriter(f)
	if err := w.WriteFileHeader(1600, layers.LinkTypeEthernet); err != nil {
		t.Fatal(err)
	}
	t0 := time.Now()
	mustWrite := func(data []byte, ci gopacket.CaptureInfo, dt time.Duration) {
		ci.Timestamp = t0.Add(dt)
		if err := w.WritePacket(ci, data); err != nil {
			t.Fatal(err)
		}
	}
	// #1 client AUTH（口令绝不能出现在任何 JSON 输出中）
	auth := []byte("*2\r\n$4\r\nAUTH\r\n$16\r\ndemo-redis-pass\r\n")
	d, ci := buildSynPacket("192.168.21.99", "192.168.21.2", 40001, 6379, auth, false)
	mustWrite(d, ci, 0)
	// #2 server bulk 大 value
	big := append([]byte("$86016\r\n"), bytes.Repeat([]byte{'A'}, 64)...)
	d, ci = buildSynPacket("192.168.21.2", "192.168.21.99", 6379, 40001, big, false)
	mustWrite(d, ci, 30*time.Millisecond)
	// #3-#10 八个端口的 SYN（扫描特征，间隔均匀 → 巡检提示）
	for i, p := range []uint16{6379, 6380, 6381, 6382, 27017, 3306, 9200, 11211} {
		d, ci = buildSynPacket("192.168.21.31", "192.168.21.2", 45000, p, nil, true)
		mustWrite(d, ci, time.Duration(i+1)*1200*time.Millisecond)
	}
	// #11 TLS ClientHello SNI
	d, ci = buildSynPacket("192.168.21.2", "140.82.112.34", 51000, 443, buildTLSClientHello("harbor.frps.cn"), false)
	mustWrite(d, ci, 11*time.Second)
}

func TestVMCaptureDecodeAndRisk(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "vm-42_20260921-094412.pcap")
	writeTestPcap(t, path)

	res, err := vmCaptureDecodePcap(path, 100, 1)
	if err != nil {
		t.Fatal(err)
	}
	if res.Meta.Packets != 11 {
		t.Fatalf("包数 = %d, 期望 11", res.Meta.Packets)
	}
	proto := map[string]int64{}
	for _, kv := range res.ProtoDist {
		proto[kv.Key] = kv.Count
	}
	if proto["REDIS"] != 2 {
		t.Fatalf("REDIS 包数 = %d, 期望 2（dist=%v）", proto["REDIS"], res.ProtoDist)
	}
	if res.Detail == nil || len(res.Detail.Hex) == 0 {
		t.Fatalf("包 #1 详情缺失")
	}
	hasRESP := false
	for _, l := range res.Detail.Tree {
		if l.Layer == "Redis Protocol (RESP)" {
			hasRESP = true
			foundMask := false
			for _, f := range l.Fields {
				if f.K == "口令参数" && strings.Contains(f.V, "已脱敏") {
					foundMask = true
				}
			}
			if !foundMask {
				t.Fatalf("RESP 树未脱敏口令参数: %+v", l.Fields)
			}
		}
	}
	if !hasRESP {
		t.Fatalf("包 #1 协议树缺少 RESP 层")
	}
	// 风险引擎：AUTH 高危 + 大 value + 扫描
	meta := vmCaptureFileMeta{Name: "vm-42_20260921-094412.pcap", Moref: "vm-42", VMName: "ops", BPF: "tcp port 6379", Iface: "any"}
	report, ctxMap, err := vmCaptureCollectAIContext(path, meta)
	if err != nil {
		t.Fatal(err)
	}
	sev := map[string]int{}
	for _, f := range report.Findings {
		sev[f.Severity]++
	}
	if sev[vmCaptureSevHigh] == 0 {
		t.Fatalf("未检出 AUTH 高危: %+v", report.Findings)
	}
	if sev[vmCaptureSevMid] < 2 {
		t.Fatalf("大 value / 扫描中危未检出: %+v", report.Findings)
	}
	if report.Score < 40 {
		t.Fatalf("风险指数 %d 过低", report.Score)
	}
	// 红线：口令原文不得进入 AI 上下文 / 报告 JSON
	ctxJSON, _ := json.Marshal(ctxMap)
	if strings.Contains(string(ctxJSON), "demo-redis-pass") {
		t.Fatalf("AI 上下文泄露口令原文")
	}
	repJSON, _ := json.Marshal(report)
	if strings.Contains(string(repJSON), "demo-redis-pass") {
		t.Fatalf("报告 JSON 泄露口令原文")
	}
	// 巡检提示（间隔均匀）
	scanHint := false
	for _, f := range report.Findings {
		if f.Title == "检测到端口扫描特征" && strings.Contains(f.Desc, "巡检") {
			scanHint = true
		}
	}
	if !scanHint {
		t.Fatalf("均匀间隔扫描未给出巡检提示: %+v", report.Findings)
	}
}

func TestVMCaptureRiskLevel(t *testing.T) {
	if vmCaptureRiskLevel(0) != "低危" || vmCaptureRiskLevel(45) != "中危" || vmCaptureRiskLevel(80) != "中高危" {
		t.Fatal("风险等级阈值错误")
	}
}

// writeSLL2Record 手工写 pcap 记录（SLL2 头 + 内层 IP 包）。
func writeSLL2Record(t *testing.T, f *os.File, ipPayload []byte, sec, usec uint32) {
	sll2 := make([]byte, 20)
	sll2[0], sll2[1] = 0x08, 0x00 // IPv4
	sll2[10] = 0                  // host->other
	sll2[11] = 6
	frame := append(sll2, ipPayload...)
	rec := make([]byte, 16)
	binary.LittleEndian.PutUint32(rec[0:4], sec)
	binary.LittleEndian.PutUint32(rec[4:8], usec)
	binary.LittleEndian.PutUint32(rec[8:12], uint32(len(frame)))
	binary.LittleEndian.PutUint32(rec[12:16], uint32(len(frame)))
	if _, err := f.Write(rec); err != nil {
		t.Fatal(err)
	}
	if _, err := f.Write(frame); err != nil {
		t.Fatal(err)
	}
}

func buildIPPacket(srcIP, dstIP string, sport, dport uint16, payload []byte) []byte {
	ip := &layers.IPv4{Version: 4, TTL: 64, Protocol: layers.IPProtocolTCP, SrcIP: net.ParseIP(srcIP).To4(), DstIP: net.ParseIP(dstIP).To4()}
	tcp := &layers.TCP{SrcPort: layers.TCPPort(sport), DstPort: layers.TCPPort(dport), Window: 502, Seq: 1}
	tcp.PSH, tcp.ACK = true, true
	tcp.SetNetworkLayerForChecksum(ip)
	buf := gopacket.NewSerializeBuffer()
	opts := gopacket.SerializeOptions{FixLengths: true, ComputeChecksums: true}
	ls := []gopacket.SerializableLayer{ip, tcp}
	if len(payload) > 0 {
		ls = append(ls, gopacket.Payload(payload))
	}
	if err := gopacket.SerializeLayers(buf, opts, ls...); err != nil {
		panic(err)
	}
	return buf.Bytes()
}

// TestVMCaptureSLL2Decode SLL2 链路（-i any + 新 libpcap）必须能正常解码并触发风险规则。
func TestVMCaptureSLL2Decode(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "vm-99_20260921-000000.pcap")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	hdr := make([]byte, 24)
	binary.LittleEndian.PutUint32(hdr[0:4], 0xa1b2c3d4)
	binary.LittleEndian.PutUint16(hdr[4:6], 2)
	binary.LittleEndian.PutUint16(hdr[6:8], 4)
	binary.LittleEndian.PutUint32(hdr[16:20], 1600)
	binary.LittleEndian.PutUint32(hdr[20:24], 276)
	if _, err := f.Write(hdr); err != nil {
		t.Fatal(err)
	}
	auth := []byte("*2\r\n$4\r\nAUTH\r\n$16\r\ndemo-redis-pass\r\n")
	writeSLL2Record(t, f, buildIPPacket("10.1.1.5", "10.1.1.2", 40001, 6379, auth), 1, 0)
	writeSLL2Record(t, f, buildIPPacket("10.1.1.2", "10.1.1.5", 6379, 40001, []byte("+OK\r\n")), 1, 50000)
	f.Close()

	if lt := vmPcapFileLinkType(path); lt != 276 {
		t.Fatalf("linktype 读取 = %d, 期望 276", lt)
	}
	res, err := vmCaptureDecodePcap(path, 10, 1)
	if err != nil {
		t.Fatal(err)
	}
	if res.Meta.LinkType != "LINUX_SLL2(276)" {
		t.Fatalf("LinkType 显示 = %s", res.Meta.LinkType)
	}
	if len(res.Packets) != 2 || res.Packets[0].Proto != "REDIS" {
		t.Fatalf("SLL2 解码失败: %+v", res.Packets)
	}
	if res.Packets[0].Src != "10.1.1.5" || res.Packets[0].DstPort != 6379 {
		t.Fatalf("地址解码错误: %+v", res.Packets[0])
	}
	meta := vmCaptureFileMeta{Name: "vm-99_20260921-000000.pcap", Moref: "vm-99"}
	report, _, err := vmCaptureCollectAIContext(path, meta)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, fd := range report.Findings {
		if strings.Contains(fd.Title, "AUTH") {
			found = true
		}
	}
	if !found {
		t.Fatalf("SLL2 包未触发 AUTH 风险规则: %+v", report.Findings)
	}
}

func TestVMCaptureDecodeIncludesFocusedPacketOutsideListLimit(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "vm-42_20260921-094412.pcap")
	writeTestPcap(t, path)

	res, err := vmCaptureDecodePcap(path, 2, 11)
	if err != nil {
		t.Fatal(err)
	}
	if res.Detail == nil || res.Detail.No != 11 {
		t.Fatalf("focused packet detail missing: %+v", res.Detail)
	}
	found := false
	for _, row := range res.Packets {
		if row.No == 11 {
			found = true
		}
	}
	if !found {
		t.Fatalf("focused packet #11 not included in packet rows: %+v", res.Packets)
	}
}

func TestVMCaptureDisabledRealtimeAnalysisDoesNotFeedRiskEngine(t *testing.T) {
	s := &vmCaptureSession{
		AIEnabled:   false,
		risk:        newVMCaptureRiskEngine(),
		protoCounts: map[string]int64{},
		endpoints:   map[string]int64{},
	}
	s.consume(&vmPacketInfo{
		No: 1, TS: time.Now(), ProtoLabel: "REDIS",
		RespCmd: &vmRespCommand{Name: "AUTH", SecretArg: true, SecretLen: 8},
	})
	if got := s.risk.Score(); got != 0 {
		t.Fatalf("disabled realtime analysis changed risk score to %d", got)
	}
	if len(s.findings) != 0 {
		t.Fatalf("disabled realtime analysis produced findings: %+v", s.findings)
	}
}

func TestVMCapturePumpClosesOutputFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "capture.pcap")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	var stream bytes.Buffer
	w := pcapgo.NewWriter(&stream)
	if err := w.WriteFileHeader(1600, layers.LinkTypeEthernet); err != nil {
		t.Fatal(err)
	}
	s := &vmCaptureSession{
		app:         &ServerApp{dataDir: dir},
		Name:        "vm-1_20260921-094412.pcap",
		Moref:       "vm-1",
		FilePath:    path,
		StartedAt:   time.Now(),
		Status:      "running",
		MaxBytes:    1 << 20,
		risk:        newVMCaptureRiskEngine(),
		protoCounts: map[string]int64{},
		endpoints:   map[string]int64{},
		done:        make(chan struct{}),
	}

	s.pump(bytes.NewReader(stream.Bytes()), f)
	if _, err := f.Write([]byte("still-open")); err == nil {
		t.Fatal("capture output file remained writable after pump finalized")
	}
}

func TestVMCaptureCleanupKeepsCaptureGroupAtomic(t *testing.T) {
	dir := t.TempDir()
	captureDir := vmCaptureDir(dir)
	if err := os.MkdirAll(captureDir, 0o700); err != nil {
		t.Fatal(err)
	}
	base := "vm-42_20260921-094412.pcap"
	pcapPath := filepath.Join(captureDir, base)
	metaPath := pcapPath + ".meta.json"
	if err := os.WriteFile(pcapPath, []byte("pcap"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(metaPath, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	old := time.Now().AddDate(0, 0, -vmCaptureRetainDays-1)
	if err := os.Chtimes(pcapPath, old, old); err != nil {
		t.Fatal(err)
	}

	vmCaptureCleanup(dir)
	if _, err := os.Stat(pcapPath); err != nil {
		t.Fatalf("cleanup removed only one member of a non-expired capture group: %v", err)
	}
	if _, err := os.Stat(metaPath); err != nil {
		t.Fatalf("cleanup removed capture metadata unexpectedly: %v", err)
	}
}

func TestVMCaptureCleanupSkipsRunningCapture(t *testing.T) {
	dir := t.TempDir()
	captureDir := vmCaptureDir(dir)
	if err := os.MkdirAll(captureDir, 0o700); err != nil {
		t.Fatal(err)
	}
	name := "vm-77_20260921-094412.pcap"
	path := filepath.Join(captureDir, name)
	if err := os.WriteFile(path, []byte("pcap"), 0o600); err != nil {
		t.Fatal(err)
	}
	old := time.Now().AddDate(0, 0, -vmCaptureRetainDays-1)
	if err := os.Chtimes(path, old, old); err != nil {
		t.Fatal(err)
	}

	vmCaptures.mu.Lock()
	previous := vmCaptures.sessions
	vmCaptures.sessions = map[string]*vmCaptureSession{"vm-77": {Name: name, FilePath: path}}
	vmCaptures.mu.Unlock()
	t.Cleanup(func() {
		vmCaptures.mu.Lock()
		vmCaptures.sessions = previous
		vmCaptures.mu.Unlock()
	})

	vmCaptureCleanup(dir)
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("cleanup removed a running capture: %v", err)
	}
}
