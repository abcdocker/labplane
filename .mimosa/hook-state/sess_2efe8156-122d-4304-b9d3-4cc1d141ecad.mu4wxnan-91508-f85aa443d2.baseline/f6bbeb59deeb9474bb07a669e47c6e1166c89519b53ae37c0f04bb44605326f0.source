package internal

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/vmware/govmomi"
	"golang.org/x/crypto/ssh"
)

// EstablishedTCPRow 来宾内一条已建立 TCP 连接（本端 / 对端）。
type EstablishedTCPRow struct {
	Local  string `json:"local"`
	Peer   string `json:"peer"`
	PeerIP string `json:"peerIp"`
}

const sshEstablishedTCPcmd = `bash -lc 'command -v ss >/dev/null 2>&1 && ss -Htan state established 2>/dev/null || (netstat -tan 2>/dev/null | grep -E "ESTABLISHED|ESTAB") || true'`

// establishedTCPResponseMaxRows API 与前端明细表最多返回的连接行数（按对端 IP 出现次数优先，再按对端 IP、本端排序）。
const establishedTCPResponseMaxRows = 10

// establishedTCPTopRowsByPeerCount 将全量行按「对端 IP 上的连接条数」降序稳定排序后截断为至多 n 条；返回截断后的切片与截断前总行数。
func establishedTCPTopRowsByPeerCount(rows []EstablishedTCPRow, n int) (out []EstablishedTCPRow, total int) {
	total = len(rows)
	if n <= 0 || len(rows) == 0 {
		return nil, total
	}
	if len(rows) <= n {
		return rows, total
	}
	counts := make(map[string]int, len(rows))
	for _, r := range rows {
		counts[r.PeerIP]++
	}
	sort.SliceStable(rows, func(i, j int) bool {
		ci, cj := counts[rows[i].PeerIP], counts[rows[j].PeerIP]
		if ci != cj {
			return ci > cj
		}
		if rows[i].PeerIP != rows[j].PeerIP {
			return rows[i].PeerIP < rows[j].PeerIP
		}
		return rows[i].Local < rows[j].Local
	})
	return rows[:n], total
}

func extractLastTwoHostPorts(fields []string) (local, peer string, ok bool) {
	var stack []string
	for i := len(fields) - 1; i >= 0; i-- {
		f := fields[i]
		if strings.HasPrefix(f, "users:") {
			break
		}
		if _, _, hp := splitHostPortFlexible(f); hp {
			stack = append(stack, f)
			if len(stack) == 2 {
				return stack[1], stack[0], true
			}
		}
	}
	return "", "", false
}

func parseEstablishedTCPFromSSLine(line string) (local, peer string, ok bool) {
	line = strings.TrimSpace(line)
	if line == "" || strings.HasPrefix(line, "Netid") || strings.HasPrefix(line, "Active Internet") {
		return "", "", false
	}
	if idx := strings.Index(line, " users:"); idx >= 0 {
		line = strings.TrimSpace(line[:idx])
	}
	fields := strings.Fields(line)
	if len(fields) < 4 {
		return "", "", false
	}
	// netstat: tcp 0 0 local foreign ESTABLISHED
	if len(fields) >= 6 {
		last := strings.ToUpper(fields[len(fields)-1])
		if strings.Contains(last, "ESTABLISHED") || last == "ESTAB" {
			_, _, ok1 := splitHostPortFlexible(fields[3])
			_, _, ok2 := splitHostPortFlexible(fields[4])
			if ok1 && ok2 {
				return fields[3], fields[4], true
			}
		}
	}
	return extractLastTwoHostPorts(fields)
}

func parseEstablishedTCPFromOutput(s string) []EstablishedTCPRow {
	seen := make(map[string]struct{})
	var out []EstablishedTCPRow
	for _, line := range strings.Split(s, "\n") {
		local, peer, ok := parseEstablishedTCPFromSSLine(line)
		if !ok || peer == "" {
			continue
		}
		peerIP, _, pok := splitHostPortFlexible(peer)
		if !pok {
			peerIP = peer
		}
		key := local + "|" + peer
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, EstablishedTCPRow{Local: local, Peer: peer, PeerIP: peerIP})
	}
	return out
}

func sshFetchEstablishedTCP(ctx context.Context, client *ssh.Client) ([]EstablishedTCPRow, string, error) {
	sess, err := client.NewSession()
	if err != nil {
		return nil, "", err
	}
	defer sess.Close()
	type res struct {
		out []byte
		err error
	}
	ch := make(chan res, 1)
	go func() {
		out, err := sess.CombinedOutput(sshEstablishedTCPcmd)
		ch <- res{out, err}
	}()
	select {
	case <-ctx.Done():
		_ = sess.Close()
		return nil, "", ctx.Err()
	case r := <-ch:
		outStr := string(r.out)
		rows := parseEstablishedTCPFromOutput(outStr)
		if r.err != nil && len(rows) == 0 {
			hint := strings.TrimSpace(outStr)
			if hint == "" {
				hint = r.err.Error()
			}
			return nil, hint, fmt.Errorf("执行 ss/netstat 失败: %w", r.err)
		}
		return rows, "", nil
	}
}

func uniqueSortedIPs(rows []EstablishedTCPRow) []string {
	m := make(map[string]struct{})
	for _, r := range rows {
		ip := strings.TrimSpace(r.PeerIP)
		if ip == "" {
			continue
		}
		m[ip] = struct{}{}
	}
	out := make([]string, 0, len(m))
	for ip := range m {
		out = append(out, ip)
	}
	sort.Strings(out)
	return out
}

// handleVCenterVMTcpEstablished 经 SSH 在来宾内执行 ss/netstat，列出已建立 TCP 连接及对端 IP（需已配置 SSH）。
func handleVCenterVMTcpEstablished(c *gin.Context, app *ServerApp) {
	vc := app.VCenter()
	cfg := app.Cfg()
	if !vc.cfg.vCenterConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vCenter 未配置"})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	ctx := c.Request.Context()
	key, kerr := sshEncryptionKey(cfg)
	var st *SSHVMStored
	if app.SSHStore() != nil && kerr == nil {
		st, _ = app.SSHStore().GetVM(ctx, moref, key)
	}
	if !sshEffectiveReady(ctx, cfg, app.SSHStore(), moref, key) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未配置 SSH：请在环境变量中设置 VCENTER_VM_SSH_*，或在页面保存该虚拟机凭据"})
		return
	}
	var guestIP string
	err := vc.WithClientRetry(ctx, func(govClient *govmomi.Client) error {
		var e error
		guestIP, e = vcenterVMPrimaryGuestIP(ctx, govClient, moref)
		return e
	})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	sshCfg, err := buildSSHClientConfigMerged(cfg, st)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	port := cfg.VCenterVMSshPort
	if st != nil && st.Port > 0 {
		port = st.Port
	}
	addr := net.JoinHostPort(guestIP, strconv.Itoa(port))
	client, err := ssh.Dial("tcp", addr, sshCfg)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "SSH 连接失败: " + err.Error()})
		return
	}
	defer client.Close()
	rows, stderrHint, err := sshFetchEstablishedTCP(ctx, client)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "stderr": stderrHint})
		return
	}
	total := len(rows)
	rows, _ = establishedTCPTopRowsByPeerCount(rows, establishedTCPResponseMaxRows)
	uniq := uniqueSortedIPs(rows)
	c.JSON(http.StatusOK, gin.H{
		"guestIp":             guestIP,
		"rows":                rows,
		"connectionCount":   total,
		"truncated":           total > len(rows),
		"uniquePeerIpCount":   len(uniq),
		"uniquePeerIps":       uniq,
		"stderr":              stderrHint,
		"scannedAt":           time.Now().UTC().Format(time.RFC3339),
		"source":              "ssh",
		"commandHint":         "ss -Htan state established 或 netstat -tan | ESTABLISHED",
		"scanFromPodHint":     "由 Dashboard Pod 经 SSH 在来宾内执行；仅统计 ESTABLISHED 的 TCP。",
	})
}
