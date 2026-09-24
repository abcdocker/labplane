package internal

import (
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"sort"
	"strings"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcapgo"
)

// vm_capture_decode.go pcap 文件解码：平台内查看器（包列表/协议树/Hex）与
// AI 分析报告共用的数据源。统计由 gopacket 解码聚合，AI 只负责研判文案。

const vmCaptureDecodeMaxPackets = 50000

type vmCapturePacketRow struct {
	No      int     `json:"no"`
	TsRel   float64 `json:"tsRel"`
	Src     string  `json:"src"`
	Dst     string  `json:"dst"`
	SrcPort int     `json:"srcPort,omitempty"`
	DstPort int     `json:"dstPort,omitempty"`
	Proto   string  `json:"proto"`
	Length  int     `json:"length"`
	Info    string  `json:"info"`
}

type vmCaptureEndpointStat struct {
	Endpoint string `json:"endpoint"`
	Packets  int64  `json:"packets"`
	Bytes    int64  `json:"bytes"`
}

type vmCaptureTreeField struct {
	K string `json:"k"`
	V string `json:"v"`
}

type vmCaptureTreeLayer struct {
	Layer  string               `json:"layer"`
	Fields []vmCaptureTreeField `json:"fields"`
	Alert  bool                 `json:"alert,omitempty"`
}

type vmCaptureHexLine struct {
	Off   int      `json:"off"`
	Hex   []string `json:"hex"`
	Ascii string   `json:"ascii"`
}

type vmCapturePacketDetail struct {
	No            int                  `json:"no"`
	Length        int                  `json:"length"`
	PayloadOffset int                  `json:"payloadOffset"`
	Tree          []vmCaptureTreeLayer `json:"tree"`
	Hex           []vmCaptureHexLine   `json:"hex"`
	Info          *vmPacketInfo        `json:"-"`
}

type vmCaptureDecodeResult struct {
	Meta struct {
		Packets   int    `json:"packets"`
		Capped    bool   `json:"capped"`
		FirstTS   string `json:"firstTs,omitempty"`
		LastTS    string `json:"lastTs,omitempty"`
		LinkType  string `json:"linkType"`
		ListLimit int    `json:"listLimit"`
	} `json:"meta"`
	Packets   []vmCapturePacketRow    `json:"packets"`
	ProtoDist []vmCaptureKV           `json:"protoDist"`
	Talkers   []vmCaptureEndpointStat `json:"topTalkers"`
	Detail    *vmCapturePacketDetail  `json:"detail,omitempty"`
}

// vmCaptureDecodePcap 解码 pcap：包列表截取 listLimit 条，统计最多 50k 包；
// detailNo>0 时附带该包协议树与 Hex。
func vmCaptureDecodePcap(path string, listLimit int, detailNo int) (*vmCaptureDecodeResult, error) {
	if listLimit <= 0 || listLimit > 2000 {
		listLimit = 200
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	rawLinkType := vmPcapFileLinkType(path)
	rdr, err := pcapgo.NewReader(f)
	if err != nil {
		return nil, fmt.Errorf("pcap 文件头无效: %w", err)
	}
	res := &vmCaptureDecodeResult{Packets: []vmCapturePacketRow{}}
	if rawLinkType == vmPcapLinkTypeLinuxSLL2 {
		res.Meta.LinkType = "LINUX_SLL2(276)"
	} else {
		res.Meta.LinkType = rdr.LinkType().String()
	}
	res.Meta.ListLimit = listLimit
	proto := map[string]int64{}
	talkers := map[string]*vmCaptureEndpointStat{}
	var firstTS, lastTS string
	no := 0
	var detailPkt gopacket.Packet
	var detailInfo *vmPacketInfo
	var firstUnix float64
	for {
		pkt, readErr := vmCaptureReadPacket(rdr, rawLinkType)
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				break
			}
			return nil, fmt.Errorf("pcap 数据不完整: %w", readErr)
		}
		no++
		if no > vmCaptureDecodeMaxPackets {
			res.Meta.Capped = true
			break
		}
		info := vmAnalyzePacket(pkt, no)
		ts := float64(info.TS.UnixNano()) / 1e9
		if no == 1 {
			firstUnix = ts
			firstTS = info.TS.Format("15:04:05.000000")
		}
		lastTS = info.TS.Format("15:04:05.000000")
		proto[info.ProtoLabel]++
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
		row := vmCapturePacketRow{
			No: info.No, TsRel: ts - firstUnix,
			Src: info.SrcIP, Dst: info.DstIP,
			SrcPort: info.SrcPort, DstPort: info.DstPort,
			Proto: info.ProtoLabel, Length: info.Length, Info: info.Info,
		}
		if len(res.Packets) < listLimit || (detailNo == no && no > listLimit) {
			res.Packets = append(res.Packets, row)
		}
		if detailNo == no {
			detailPkt = pkt
			detailInfo = info
		}
	}
	res.Meta.Packets = no
	if no > vmCaptureDecodeMaxPackets {
		res.Meta.Packets = vmCaptureDecodeMaxPackets
	}
	res.Meta.FirstTS = firstTS
	res.Meta.LastTS = lastTS
	res.ProtoDist = vmTopK(proto, 10)
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
	res.Talkers = tl
	if detailPkt != nil {
		res.Detail = vmCaptureBuildDetail(detailPkt, detailInfo)
	}
	return res, nil
}

func vmCaptureBuildDetail(pkt gopacket.Packet, info *vmPacketInfo) *vmCapturePacketDetail {
	d := &vmCapturePacketDetail{No: info.No, Length: info.Length, PayloadOffset: info.PayloadOffset, Info: info}
	frame := vmCaptureTreeLayer{Layer: fmt.Sprintf("Frame %d: %d bytes on wire", info.No, info.Length)}
	frame.Fields = append(frame.Fields,
		vmCaptureTreeField{K: "Interface", V: info.Net},
		vmCaptureTreeField{K: "Arrival", V: info.TS.Format("15:04:05.000000")},
		vmCaptureTreeField{K: "Protocol", V: info.ProtoLabel},
	)
	d.Tree = append(d.Tree, frame)
	for _, l := range pkt.Layers() {
		switch v := l.(type) {
		case *layers.Ethernet:
			d.Tree = append(d.Tree, vmCaptureTreeLayer{Layer: "Ethernet II", Fields: []vmCaptureTreeField{
				{K: "Src", V: v.SrcMAC.String()}, {K: "Dst", V: v.DstMAC.String()},
				{K: "Type", V: v.EthernetType.String()},
			}})
		case *layers.LinuxSLL:
			d.Tree = append(d.Tree, vmCaptureTreeLayer{Layer: "Linux Cooked (SLL)", Fields: []vmCaptureTreeField{
				{K: "Packet type", V: fmt.Sprintf("%d", v.PacketType)}, {K: "Link-layer addr", V: v.Addr.String()},
				{K: "Protocol", V: v.EthernetType.String()},
			}})
		case *layers.IPv4:
			d.Tree = append(d.Tree, vmCaptureTreeLayer{Layer: "IPv4", Fields: []vmCaptureTreeField{
				{K: "Src", V: v.SrcIP.String()}, {K: "Dst", V: v.DstIP.String()},
				{K: "TTL", V: fmt.Sprintf("%d", v.TTL)}, {K: "ID", V: fmt.Sprintf("0x%04x", v.Id)},
			}})
		case *layers.IPv6:
			d.Tree = append(d.Tree, vmCaptureTreeLayer{Layer: "IPv6", Fields: []vmCaptureTreeField{
				{K: "Src", V: v.SrcIP.String()}, {K: "Dst", V: v.DstIP.String()},
				{K: "Hop limit", V: fmt.Sprintf("%d", v.HopLimit)},
			}})
		case *layers.TCP:
			fl := []vmCaptureTreeField{
				{K: "Src Port", V: fmt.Sprintf("%d", v.SrcPort)}, {K: "Dst Port", V: fmt.Sprintf("%d", v.DstPort)},
				{K: "Seq", V: fmt.Sprintf("%d", v.Seq)}, {K: "ACK", V: fmt.Sprintf("%d", v.Ack)},
				{K: "Window", V: fmt.Sprintf("%d", v.Window)}, {K: "Flags", V: vmTCPFlagsStr(v)},
			}
			d.Tree = append(d.Tree, vmCaptureTreeLayer{Layer: "TCP", Fields: fl})
		case *layers.UDP:
			d.Tree = append(d.Tree, vmCaptureTreeLayer{Layer: "UDP", Fields: []vmCaptureTreeField{
				{K: "Src Port", V: fmt.Sprintf("%d", v.SrcPort)}, {K: "Dst Port", V: fmt.Sprintf("%d", v.DstPort)},
				{K: "Length", V: fmt.Sprintf("%d", v.Length)},
			}})
		case *layers.ICMPv4:
			d.Tree = append(d.Tree, vmCaptureTreeLayer{Layer: "ICMP", Fields: []vmCaptureTreeField{
				{K: "Type/Code", V: v.TypeCode.String()}, {K: "Checksum", V: fmt.Sprintf("0x%04x", v.Checksum)},
			}})
		case *layers.ARP:
			d.Tree = append(d.Tree, vmCaptureTreeLayer{Layer: "ARP", Fields: []vmCaptureTreeField{
				{K: "Opcode", V: fmt.Sprintf("%d", v.Operation)},
				{K: "Sender MAC", V: vmHexStr(v.SourceHwAddress)}, {K: "Sender IP", V: netIPString(v.SourceProtAddress)},
				{K: "Target IP", V: netIPString(v.DstProtAddress)},
			}})
		case *layers.DNS:
			var fl []vmCaptureTreeField
			for _, q := range v.Questions {
				fl = append(fl, vmCaptureTreeField{K: "Query", V: string(q.Name) + " " + q.Type.String()})
			}
			for _, a := range v.Answers {
				fl = append(fl, vmCaptureTreeField{K: "Answer", V: string(a.Name) + " -> " + a.IP.String()})
			}
			d.Tree = append(d.Tree, vmCaptureTreeLayer{Layer: "DNS", Fields: fl})
		}
	}
	if info.App == "REDIS" {
		fl := []vmCaptureTreeField{{K: "明文可见", V: "载荷未加密"}}
		if info.RespCmd != nil {
			fl = append(fl, vmCaptureTreeField{K: "Command", V: info.RespCmd.Name},
				vmCaptureTreeField{K: "参数个数", V: fmt.Sprintf("%d", info.RespCmd.ArgCount)})
			if info.RespCmd.Key != "" {
				fl = append(fl, vmCaptureTreeField{K: "Key", V: info.RespCmd.Key})
			}
			if info.RespCmd.SecretArg {
				fl = append(fl, vmCaptureTreeField{K: "口令参数", V: vmMaskSecretLen(info.RespCmd.SecretLen)})
			}
		}
		if info.RespBulkLen > 0 {
			fl = append(fl, vmCaptureTreeField{K: "Bulk 长度", V: fmt.Sprintf("%d bytes", info.RespBulkLen)})
		}
		d.Tree = append(d.Tree, vmCaptureTreeLayer{Layer: "Redis Protocol (RESP)", Fields: fl, Alert: true})
	} else if info.App == "SSH" && info.PlainBanner != "" {
		d.Tree = append(d.Tree, vmCaptureTreeLayer{Layer: "SSH", Fields: []vmCaptureTreeField{{K: "Banner", V: vmTruncateStr(info.PlainBanner, 80)}}})
	} else if info.App == "SSH" {
		d.Tree = append(d.Tree, vmCaptureTreeLayer{Layer: "SSH", Fields: []vmCaptureTreeField{{K: "Payload", V: fmt.Sprintf("加密数据 · %d bytes", len(info.Payload))}}})
	} else if info.App == "TLS" {
		fl := []vmCaptureTreeField{{K: "Record", V: "ApplicationData/Handshake"}, {K: "载荷加密", V: "内容不可见，SNI/证书/时序可分析"}}
		if info.SNI != "" {
			fl = append(fl, vmCaptureTreeField{K: "SNI", V: info.SNI})
		}
		d.Tree = append(d.Tree, vmCaptureTreeLayer{Layer: "TLS", Fields: fl})
	} else if info.App == "HTTP" {
		d.Tree = append(d.Tree, vmCaptureTreeLayer{Layer: "HTTP", Fields: []vmCaptureTreeField{
			{K: "首行", V: vmTruncateStr(strings.SplitN(string(info.Payload), "\r\n", 2)[0], 120)},
		}})
	} else if info.App == "TELNET" || info.App == "FTP" {
		d.Tree = append(d.Tree, vmCaptureTreeLayer{Layer: info.App, Fields: []vmCaptureTreeField{
			{K: "明文协议", V: "全部交互（含口令）明文可见"},
		}})
	}
	// Hex 转储：16 字节/行 + ASCII
	data := pkt.Data()
	for off := 0; off < len(data); off += 16 {
		end := off + 16
		if end > len(data) {
			end = len(data)
		}
		var hexArr []string
		var ascii strings.Builder
		for i := off; i < end; i++ {
			hexArr = append(hexArr, fmt.Sprintf("%02x", data[i]))
			if data[i] >= 32 && data[i] < 127 {
				ascii.WriteByte(data[i])
			} else {
				ascii.WriteByte('.')
			}
		}
		d.Hex = append(d.Hex, vmCaptureHexLine{Off: off, Hex: hexArr, Ascii: ascii.String()})
	}
	return d
}

func vmHexStr(b []byte) string {
	parts := make([]string, len(b))
	for i, x := range b {
		parts[i] = fmt.Sprintf("%02x", x)
	}
	return strings.Join(parts, ":")
}

func netIPString(b []byte) string { return net.IP(b).String() }
