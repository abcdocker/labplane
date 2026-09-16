package internal

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/vmware/govmomi"
	"golang.org/x/crypto/ssh"
)

// ListeningPort 远端 ss/netstat 解析出的一条监听。
type ListeningPort struct {
	Proto string `json:"proto"`
	Local string `json:"local"`
	Port  int    `json:"port"`
}

const sshListeningPortsCmd = `bash -lc 'command -v ss >/dev/null 2>&1 && ss -tuln 2>/dev/null || netstat -tuln 2>/dev/null || true'`

func parseListeningPortsFromSSOutput(s string) []ListeningPort {
	var out []ListeningPort
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "Netid") || strings.HasPrefix(line, "Active Internet") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		netid := strings.ToLower(fields[0])
		if netid != "tcp" && netid != "udp" && netid != "tcp6" && netid != "udp6" {
			continue
		}
		proto := netid
		if strings.HasSuffix(proto, "6") {
			proto = strings.TrimSuffix(proto, "6")
		}
		// ss: tcp LISTEN ... local peer; udp UNCONN ...
		// netstat: tcp 0 0 local foreign LISTEN
		st := strings.ToUpper(fields[1])
		netstatStyle := len(fields) >= 6 && fields[len(fields)-1] == "LISTEN"
		if !netstatStyle {
			if st != "LISTEN" && st != "UNCONN" {
				continue
			}
		}
		var local string
		if netstatStyle {
			local = fields[3]
		} else if len(fields) >= 5 {
			local = fields[4]
		} else {
			continue
		}
		host, portStr, ok := splitHostPortFlexible(local)
		if !ok {
			continue
		}
		port, err := strconv.Atoi(portStr)
		if err != nil || port <= 0 || port > 65535 {
			continue
		}
		out = append(out, ListeningPort{Proto: proto, Local: host, Port: port})
	}
	return out
}

func splitHostPortFlexible(s string) (host, port string, ok bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", "", false
	}
	if strings.HasPrefix(s, "[") {
		idx := strings.LastIndex(s, "]:")
		if idx < 0 {
			return "", "", false
		}
		return s[1:idx], s[idx+2:], true
	}
	i := strings.LastIndex(s, ":")
	if i <= 0 {
		return "", "", false
	}
	return s[:i], s[i+1:], true
}

func sshFetchListeningPorts(ctx context.Context, client *ssh.Client) ([]ListeningPort, string, error) {
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
		out, err := sess.CombinedOutput(sshListeningPortsCmd)
		ch <- res{out, err}
	}()
	select {
	case <-ctx.Done():
		_ = sess.Close()
		return nil, "", ctx.Err()
	case r := <-ch:
		outStr := string(r.out)
		ports := parseListeningPortsFromSSOutput(outStr)
		if r.err != nil && len(ports) == 0 {
			hint := strings.TrimSpace(outStr)
			if hint == "" {
				hint = r.err.Error()
			}
			return nil, hint, fmt.Errorf("执行 ss/netstat 失败: %w", r.err)
		}
		return ports, "", nil
	}
}

func handleVCenterVMListeningPorts(c *gin.Context, app *ServerApp) {
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
	ports, stderrHint, err := sshFetchListeningPorts(ctx, client)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "stderr": stderrHint})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"guestIp":         guestIP,
		"ports":           ports,
		"stderr":          stderrHint,
		"commandHint":     "ss -tuln 或 netstat -tuln",
		"scannedAt":       time.Now().UTC().Format(time.RFC3339),
		"source":          "ssh",
		"scanFromPodHint": "由 Dashboard Pod 经 SSH 在来宾内执行；需来宾已安装 iproute/ss 或 net-tools。",
	})
}

func handleCloudHostListeningPorts(c *gin.Context, app *ServerApp) {
	id := strings.TrimSpace(c.Param("id"))
	ctx := c.Request.Context()
	host, err := getCloudHostByID(app, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	cfg := app.Cfg()
	key, _ := sshEncryptionKey(cfg)
	store := app.SSHStore()
	cloudKey := cloudHostSSHStorageKey(id)
	if !cloudHostSSHCanDial(ctx, cfg, store, cloudKey, key, host, "", "") {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "缺少 SSH 凭据：请填写全局 VCENTER_VM_SSH_* 或在主机上保存密码/私钥"})
		return
	}
	client, err := sshDialCloudHostClient(ctx, cfg, store, cloudKey, key, host, "", "")
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "SSH 连接失败: " + err.Error()})
		return
	}
	defer client.Close()
	ports, stderrHint, err := sshFetchListeningPorts(ctx, client)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "stderr": stderrHint})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"hostId":          id,
		"sshAddr":         net.JoinHostPort(strings.TrimSpace(host.SSHHost), strconv.Itoa(sshDialPortForCloud(nil, host))),
		"ports":           ports,
		"stderr":          stderrHint,
		"scannedAt":       time.Now().UTC().Format(time.RFC3339),
		"scanFromPodHint": "由 Dashboard Pod SSH 到主机后执行 ss/netstat。",
	})
}
