package internal

import (
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcapgo"
)

// vmPcapLinkTypeLinuxSLL2：-i any 在新版 libpcap/tcpdump（Ubuntu 22.04+）上的默认链路类型。
// 注意 layers.LinkType 底层是 uint8，pcapgo 会把 276 截断成 20，因此必须读原始文件头判断；
// 由 vmCapturePackets 手工剥 20 字节 SLL2 头后按内层 ethertype（IPv4/IPv6/ARP）重建包。
const vmPcapLinkTypeLinuxSLL2 = 276

// vmPcapHeaderLinkType 解析 pcap 全局头 24 字节，返回 linktype 原始值（0 表示无效）。
func vmPcapHeaderLinkType(hdr []byte) uint32 {
	if len(hdr) < 24 {
		return 0
	}
	magicLE := []byte{0xd4, 0xc3, 0xb2, 0xa1}
	magicNANO := []byte{0x4d, 0x3c, 0xb2, 0xa1}
	le := true
	if string(hdr[0:4]) == string([]byte{0xa1, 0xb2, 0xc3, 0xd4}) || string(hdr[0:4]) == string([]byte{0xa1, 0xb2, 0x3c, 0x4d}) {
		le = false
	} else if string(hdr[0:4]) != string(magicLE) && string(hdr[0:4]) != string(magicNANO) {
		return 0
	}
	if le {
		return binary.LittleEndian.Uint32(hdr[20:24])
	}
	return binary.BigEndian.Uint32(hdr[20:24])
}

// vmPcapFileLinkType 读取 pcap 文件头的原始 linktype。
func vmPcapFileLinkType(path string) uint32 {
	f, err := os.Open(path)
	if err != nil {
		return 0
	}
	defer f.Close()
	hdr := make([]byte, 24)
	if _, err := io.ReadFull(f, hdr); err != nil {
		return 0
	}
	return vmPcapHeaderLinkType(hdr)
}

// vmCaptureReadPacket 同步读取一帧，屏蔽 SLL 与 SLL2 的差异。
// 不使用生产者 goroutine，避免消费者在统计上限处提前退出时泄漏 goroutine。
func vmCaptureReadPacket(rdr *pcapgo.Reader, rawLinkType uint32) (gopacket.Packet, error) {
	for {
		data, ci, err := rdr.ReadPacketData()
		if err != nil {
			return nil, err
		}
		dec := gopacket.Decoder(rdr.LinkType())
		if rawLinkType == vmPcapLinkTypeLinuxSLL2 {
			if len(data) < 20 {
				continue
			}
			switch binary.BigEndian.Uint16(data[0:2]) {
			case 0x0800:
				dec = layers.LayerTypeIPv4
			case 0x86DD:
				dec = layers.LayerTypeIPv6
			case 0x0806:
				dec = layers.LayerTypeARP
			default:
				continue
			}
			data = data[20:]
		}
		pkt := gopacket.NewPacket(data, dec, gopacket.Default)
		pkt.Metadata().CaptureInfo = ci
		return pkt, nil
	}
}

// vmPacketInfo 一帧的通用分析结果：实时预览、规则风险引擎与查看器解码三处共用。
// 约定：Payload 仅保留应用层前 4KiB 供规则分析；任何口令/敏感值在进入 finding 前必须脱敏。
type vmPacketInfo struct {
	No            int
	TS            time.Time
	SrcIP         string
	DstIP         string
	SrcPort       int
	DstPort       int
	Net           string // IPv4 | IPv6 | 其他
	Transport     string // TCP | UDP | ICMP | ARP | 其他
	App           string // REDIS | SSH | HTTP | TLS | DNS | TELNET | FTP（空 = 无应用层识别）
	ProtoLabel    string // 前端协议徽章：REDIS/SSH/DNS/TLS/HTTP/TCP/UDP/ICMP/ARP
	Length        int
	CapLen        int
	Info          string // tcpdump 风格摘要
	Payload       []byte
	PayloadOffset int // 应用层载荷在整帧中的起始偏移（Hex 高亮用）
	SYN           bool
	IsServerResp  bool // 方向判定：载荷来自服务端（响应）
	RespCmd       *vmRespCommand
	RespBulkLen   int // Redis 服务端 bulk 响应声明长度
	DNSNames      []string
	SNI           string
	HTTPAuth      bool
	PlainBanner   string // SSH/Telnet/FTP 明文 banner（非敏感）
}

// vmRespCommand Redis RESP 命令的脱敏摘要。
type vmRespCommand struct {
	Name      string `json:"name"`
	ArgCount  int    `json:"argCount"`
	Key       string `json:"key,omitempty"`       // 第一个非口令参数（键名）
	SecretArg bool   `json:"secretArg"`           // AUTH/HELLO 等含口令，展示时必须脱敏
	SecretLen int    `json:"secretLen,omitempty"` // 口令长度（非敏感元数据，用于脱敏展示）
}

var vmCaptureRespPorts = map[int]bool{6379: true, 6380: true, 6381: true, 26379: true}

const vmCaptureAnalyzePayloadMax = 4096

func vmClipPayload(b []byte) []byte {
	if len(b) > vmCaptureAnalyzePayloadMax {
		return b[:vmCaptureAnalyzePayloadMax]
	}
	return b
}

// vmAnalyzePacket 将 gopacket 解出的帧转为 vmPacketInfo。
func vmAnalyzePacket(pkt gopacket.Packet, no int) *vmPacketInfo {
	info := &vmPacketInfo{
		No:            no,
		Length:        len(pkt.Data()),
		CapLen:        len(pkt.Data()),
		TS:            pkt.Metadata().Timestamp,
		PayloadOffset: -1,
	}
	if info.TS.IsZero() {
		info.TS = time.Now()
	}
	var tcp *layers.TCP
	var udp *layers.UDP
	for _, l := range pkt.Layers() {
		switch v := l.(type) {
		case *layers.Ethernet:
			info.Net = "Ethernet"
		case *layers.LinuxSLL:
			info.Net = "LinuxSLL"
		case *layers.IPv4:
			info.Net = "IPv4"
			info.SrcIP = v.SrcIP.String()
			info.DstIP = v.DstIP.String()
		case *layers.IPv6:
			info.Net = "IPv6"
			info.SrcIP = v.SrcIP.String()
			info.DstIP = v.DstIP.String()
		case *layers.TCP:
			tcp = v
			info.Transport = "TCP"
			info.SrcPort = int(v.SrcPort)
			info.DstPort = int(v.DstPort)
			info.SYN = v.SYN
		case *layers.UDP:
			udp = v
			info.Transport = "UDP"
			info.SrcPort = int(v.SrcPort)
			info.DstPort = int(v.DstPort)
		case *layers.ICMPv4:
			info.Transport = "ICMP"
			info.ProtoLabel = "ICMP"
			info.Info = v.TypeCode.String()
		case *layers.ARP:
			info.Transport = "ARP"
			info.Net = "ARP"
			info.ProtoLabel = "ARP"
			who := "Reply"
			if v.Operation == 1 {
				who = "Request"
			}
			info.Info = fmt.Sprintf("ARP %s who-has %s tell %s", who, net.IP(v.DstProtAddress), net.IP(v.SourceProtAddress))
			info.SrcIP = net.IP(v.SourceProtAddress).String()
		case *layers.DNS:
			info.App = "DNS"
			info.ProtoLabel = "DNS"
			var names []string
			if v.QR {
				for _, a := range v.Answers {
					names = append(names, strings.TrimSuffix(string(a.Name), "."))
				}
				if len(names) == 0 && len(v.Questions) > 0 {
					names = append(names, strings.TrimSuffix(string(v.Questions[0].Name), "."))
				}
				info.Info = fmt.Sprintf("Response %d/%d/%d %s", len(v.Answers), len(v.Authorities), len(v.Additionals), strings.Join(names, ","))
			} else {
				for _, q := range v.Questions {
					names = append(names, strings.TrimSuffix(string(q.Name), "."))
				}
				info.Info = "Standard query " + strings.Join(names, ",")
			}
			info.DNSNames = names
		}
	}
	if tcp != nil {
		vmAnalyzeTCP(info, tcp)
	} else if udp != nil {
		if p := udp.LayerPayload(); len(p) > 0 {
			info.Payload = vmClipPayload(p)
			info.PayloadOffset = info.CapLen - len(p)
		}
		if info.App == "" {
			info.ProtoLabel = "UDP"
			info.Info = fmt.Sprintf("UDP %d → %d len=%d", info.SrcPort, info.DstPort, len(pkt.Data()))
		}
	}
	if info.ProtoLabel == "" {
		if info.App != "" {
			info.ProtoLabel = info.App
		} else if info.Transport != "" {
			info.ProtoLabel = info.Transport
		} else {
			info.ProtoLabel = info.Net
		}
	}
	if info.Info == "" {
		info.Info = fmt.Sprintf("len=%d", len(pkt.Data()))
	}
	return info
}

func vmTCPFlagsStr(t *layers.TCP) string {
	var fs []string
	if t.FIN {
		fs = append(fs, "F")
	}
	if t.SYN {
		fs = append(fs, "S")
	}
	if t.RST {
		fs = append(fs, "R")
	}
	if t.PSH {
		fs = append(fs, "P")
	}
	if t.ACK {
		fs = append(fs, ".")
	}
	if t.URG {
		fs = append(fs, "U")
	}
	if len(fs) == 0 {
		fs = append(fs, ".")
	}
	return "[" + strings.Join(fs, "") + "]"
}

func vmAnalyzeTCP(info *vmPacketInfo, tcp *layers.TCP) {
	payload := vmClipPayload(tcp.LayerPayload())
	if len(payload) > 0 {
		info.Payload = payload
		info.PayloadOffset = info.CapLen - len(tcp.LayerPayload())
	}
	flags := vmTCPFlagsStr(tcp)
	base := fmt.Sprintf("IP %s.%d > %s.%d: Flags %s, seq %d, win %d, length %d",
		info.SrcIP, info.SrcPort, info.DstIP, info.DstPort, flags, tcp.Seq, tcp.Window, len(tcp.LayerPayload()))
	info.Info = base
	dport, sport := info.DstPort, info.SrcPort
	serverSide := vmCaptureRespPorts[sport] || sport == 22 || sport == 80 || sport == 8080 || sport == 443 || sport == 21 || sport == 23
	info.IsServerResp = serverSide
	if len(payload) == 0 {
		info.ProtoLabel = "TCP"
		return
	}
	switch {
	case vmCaptureRespPorts[dport] || vmCaptureRespPorts[sport] || vmLooksLikeRESP(payload):
		info.App = "REDIS"
		if cmd, bulk, ok := vmParseRESP(payload); ok {
			if cmd != nil {
				info.RespCmd = cmd
				if info.IsServerResp {
					info.Info = base + " · RESP response"
				} else {
					info.Info = base + " · RESP " + cmd.Name
				}
			} else {
				info.RespBulkLen = bulk
				info.Info = base + fmt.Sprintf(" · RESP bulk $%d", bulk)
			}
		} else {
			info.Info = base + " · RESP"
		}
	case dport == 22 || sport == 22:
		info.App = "SSH"
		if strings.HasPrefix(string(payload), "SSH-") && !info.IsServerResp {
			// 客户端不会以 SSH- 开头发数据，这里多为服务端 banner 方向修正
			info.IsServerResp = true
		}
		if strings.HasPrefix(string(payload), "SSH-") {
			info.PlainBanner = strings.TrimSpace(strings.SplitN(string(payload), "\n", 2)[0])
			info.Info = base + " · Banner " + vmTruncateStr(info.PlainBanner, 48)
		} else {
			info.Info = base + " · Encrypted data"
		}
	case dport == 23 || sport == 23:
		info.App = "TELNET"
		if len(payload) > 0 && !info.telnetBannerChecked() {
			info.PlainBanner = vmPrintablePrefix(payload, 48)
		}
		info.Info = base + " · Telnet 明文"
	case dport == 21 || sport == 21:
		info.App = "FTP"
		info.PlainBanner = vmPrintablePrefix(payload, 48)
		info.Info = base + " · FTP 明文"
	case vmLooksLikeHTTP(payload):
		info.App = "HTTP"
		line := strings.SplitN(string(payload), "\r\n", 2)[0]
		info.Info = base + " · " + vmTruncateStr(line, 96)
		if strings.Contains(strings.ToLower(string(payload)), "authorization:") {
			info.HTTPAuth = true
			info.Info += "（含 Authorization 头）"
		}
	case len(payload) >= 2 && (payload[0] == 0x16 || payload[0] == 0x17) && payload[1] == 0x03 && (dport == 443 || sport == 443):
		info.App = "TLS"
		if sni := vmParseTLSSNI(payload); sni != "" {
			info.SNI = sni
			info.Info = base + " · ClientHello SNI=" + sni
		} else {
			info.Info = base + " · Application Data (加密)"
		}
	}
	if info.App == "REDIS" {
		info.ProtoLabel = "REDIS"
	} else if info.App != "" {
		info.ProtoLabel = info.App
	} else {
		info.ProtoLabel = "TCP"
	}
}

func (i *vmPacketInfo) telnetBannerChecked() bool { return i.PlainBanner != "" }

func vmPrintablePrefix(b []byte, max int) string {
	var sb strings.Builder
	for _, c := range b {
		if c >= 32 && c < 127 {
			sb.WriteByte(c)
		} else {
			break
		}
		if sb.Len() >= max {
			break
		}
	}
	return sb.String()
}

func vmTruncateStr(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

// vmLooksLikeRESP 粗判载荷是否为 RESP 协议；要求首行严格成形，
// 避免加密/二进制流的首字节恰为 +$*-: 时误判。
func vmLooksLikeRESP(p []byte) bool {
	if len(p) < 4 {
		return false
	}
	line, _ := vmSplitCRLF(p)
	if len(line) < 2 || len(line) > 64 {
		return false
	}
	allDigits := func(s []byte) bool {
		if len(s) == 0 {
			return false
		}
		for _, c := range s {
			if c < '0' || c > '9' {
				return false
			}
		}
		return true
	}
	switch line[0] {
	case '*':
		return allDigits(line[1:])
	case ':':
		return allDigits(line[1:])
	case '$':
		return allDigits(line[1:]) || string(line[1:]) == "-1"
	case '+', '-':
		for _, c := range line[1:] {
			if c < 32 || c > 126 {
				return false
			}
		}
		return true
	}
	return false
}

// vmParseRESP 解析 RESP 命令或服务端响应；返回 (命令, bulk 长度, 是否解析成功)。
// 命令参数不返回原文（仅计数与键名），口令类参数只标记 SecretArg。
func vmParseRESP(p []byte) (*vmRespCommand, int, bool) {
	if len(p) < 4 {
		return nil, 0, false
	}
	line, rest := vmSplitCRLF(p)
	if len(line) == 0 {
		return nil, 0, false
	}
	switch line[0] {
	case '*':
		n, err := strconv.Atoi(string(line[1:]))
		if err != nil || n <= 0 || n > 64 {
			return nil, 0, false
		}
		cmd := &vmRespCommand{}
		for i := 0; i < n && len(rest) > 0; i++ {
			var item []byte
			item, rest = vmSplitCRLF(rest)
			if len(item) < 2 || item[0] != '$' {
				return nil, 0, false
			}
			ln, err := strconv.Atoi(string(item[1:]))
			if err != nil || ln < 0 || ln > 1<<20 {
				return nil, 0, false
			}
			if len(rest) < ln {
				// 截断的载荷（snaplen）也算命中，但不取值
				arg := ""
				if i == 0 {
					arg = string(rest)
				}
				vmRESPFill(cmd, i, arg)
				return cmd, 0, true
			}
			arg := string(rest[:ln])
			rest = rest[ln:]
			if len(rest) >= 2 {
				rest = rest[2:]
			}
			vmRESPFill(cmd, i, arg)
		}
		if cmd.Name == "" {
			return nil, 0, false
		}
		return cmd, 0, true
	case '$':
		ln, err := strconv.Atoi(string(line[1:]))
		if err != nil {
			return nil, 0, false
		}
		return nil, ln, true
	}
	return nil, 0, false
}

func vmRESPFill(cmd *vmRespCommand, idx int, arg string) {
	if idx == 0 {
		cmd.Name = strings.ToUpper(arg)
		cmd.ArgCount++
		return
	}
	cmd.ArgCount++
	switch cmd.Name {
	case "AUTH", "HELLO":
		cmd.SecretArg = true
		cmd.SecretLen = len(arg)
	default:
		if cmd.Key == "" && len(arg) <= 256 {
			cmd.Key = arg
		}
	}
}

func vmSplitCRLF(p []byte) (line, rest []byte) {
	for i := 0; i+1 < len(p); i++ {
		if p[i] == '\r' && p[i+1] == '\n' {
			return p[:i], p[i+2:]
		}
	}
	return p, nil
}

// vmLooksLikeHTTP 判定明文 HTTP 报文。
func vmLooksLikeHTTP(p []byte) bool {
	if len(p) < 16 {
		return false
	}
	head := p[:16]
	for _, m := range [][]byte{[]byte("GET "), []byte("POST "), []byte("PUT "), []byte("DELETE "), []byte("HEAD "), []byte("OPTIONS "), []byte("PATCH ")} {
		if string(head[:len(m)]) == string(m) {
			return true
		}
	}
	return string(head[:5]) == "HTTP/"
}

// vmParseTLSSNI 从 ClientHello 中提取 SNI（bounds-checked）。
func vmParseTLSSNI(p []byte) string {
	// TLS record: type(1) ver(2) len(2) | handshake: type(1)=0x01 len(3) ver(2) random(32) session(1+n)
	if len(p) < 43 || p[0] != 0x16 {
		return ""
	}
	hs := p[5:]
	if len(hs) < 4 || hs[0] != 0x01 {
		return ""
	}
	pos := 4 + 2 + 32
	if pos+1 > len(hs) {
		return ""
	}
	sessionLen := int(hs[pos])
	pos += 1 + sessionLen
	if pos+2 > len(hs) {
		return ""
	}
	cipherLen := int(hs[pos])<<8 | int(hs[pos+1])
	pos += 2 + cipherLen
	if pos+1 > len(hs) {
		return ""
	}
	compLen := int(hs[pos])
	pos += 1 + compLen
	if pos+2 > len(hs) {
		return ""
	}
	extLen := int(hs[pos])<<8 | int(hs[pos+1])
	pos += 2
	extEnd := pos + extLen
	if extEnd > len(hs) {
		extEnd = len(hs)
	}
	for pos+4 <= extEnd {
		etype := int(hs[pos])<<8 | int(hs[pos+1])
		elen := int(hs[pos+2])<<8 | int(hs[pos+3])
		pos += 4
		if pos+elen > extEnd {
			return ""
		}
		if etype == 0 {
			body := hs[pos : pos+elen]
			// server_name list: total(2) type(1)=0 len(2) name
			if len(body) >= 5 && body[2] == 0 {
				nlen := int(body[3])<<8 | int(body[4])
				if 5+nlen <= len(body) {
					return string(body[5 : 5+nlen])
				}
			}
			return ""
		}
		pos += elen
	}
	return ""
}
