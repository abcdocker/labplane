package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/object"
	"github.com/vmware/govmomi/vim25/mo"
	"github.com/vmware/govmomi/vim25/types"
	"golang.org/x/crypto/ssh"
)

func vcenterVMPrimaryGuestIP(ctx context.Context, client *govmomi.Client, moref string) (string, error) {
	vm := object.NewVirtualMachine(client.Client, types.ManagedObjectReference{Type: "VirtualMachine", Value: moref})
	var m mo.VirtualMachine
	if err := vm.Properties(ctx, vm.Reference(), []string{"summary"}, &m); err != nil {
		return "", err
	}
	if m.Summary.Guest != nil {
		ip := strings.TrimSpace(m.Summary.Guest.IpAddress)
		if ip != "" {
			return ip, nil
		}
	}
	return "", fmt.Errorf("虚拟机未上报 Guest IP（需 VMware Tools 与网络），无法 SSH")
}

// buildSSHClientConfigMerged 合并环境变量与（可选）存储中的单台 VM 覆盖。
func buildSSHClientConfigMerged(cfg Config, st *SSHVMStored) (*ssh.ClientConfig, error) {
	user := strings.TrimSpace(cfg.VCenterVMSshUser)
	pw := cfg.VCenterVMSshPassword
	keyPath := strings.TrimSpace(cfg.VCenterVMSshPrivateKeyPath)
	keyPass := cfg.VCenterVMSshKeyPassphrase
	insecure := cfg.VCenterVMSshInsecureHostKey
	hostKeyFingerprint := cfg.VCenterVMSshHostKeyFingerprint
	if st != nil {
		if strings.TrimSpace(st.User) != "" {
			user = strings.TrimSpace(st.User)
		}
		if st.Password != "" {
			pw = st.Password
		}
		if st.KeyPassphrase != "" {
			keyPass = st.KeyPassphrase
		}
		insecure = st.InsecureHostKey
		if strings.TrimSpace(st.HostKeyFingerprint) != "" {
			hostKeyFingerprint = st.HostKeyFingerprint
		}
	}
	if user == "" {
		return nil, fmt.Errorf("SSH 用户名为空（环境变量或已保存配置）")
	}
	var methods []ssh.AuthMethod
	if st != nil && strings.TrimSpace(st.PrivateKeyPEM) != "" {
		pem := []byte(strings.TrimSpace(st.PrivateKeyPEM))
		var signer ssh.Signer
		var err error
		if keyPass != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(pem, []byte(keyPass))
		} else {
			signer, err = ssh.ParsePrivateKey(pem)
		}
		if err != nil {
			return nil, fmt.Errorf("解析已保存的私钥 PEM: %w", err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	} else if keyPath != "" {
		keyPEM, err := os.ReadFile(keyPath)
		if err != nil {
			return nil, fmt.Errorf("读取私钥 %s: %w", keyPath, err)
		}
		var signer ssh.Signer
		if keyPass != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(keyPEM, []byte(keyPass))
		} else {
			signer, err = ssh.ParsePrivateKey(keyPEM)
		}
		if err != nil {
			return nil, fmt.Errorf("解析私钥: %w", err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}
	if pw != "" {
		methods = append(methods, ssh.Password(pw))
	}
	if len(methods) == 0 {
		return nil, fmt.Errorf("请配置私钥（文件路径或页面粘贴 PEM）或密码")
	}
	hostKeyCallback, err := pinnedSSHHostKeyCallback(insecure, hostKeyFingerprint)
	if err != nil {
		return nil, err
	}
	return &ssh.ClientConfig{
		User:            user,
		Auth:            methods,
		HostKeyCallback: hostKeyCallback,
		Timeout:         15 * time.Second,
	}, nil
}

// sshDialVCenterVMClient 通过 vCenter 解析 Guest IP 后 SSH 拨号（凭据与 /api/vcenter/vms/:moref/ssh/ws 一致）。
func sshDialVCenterVMClient(ctx context.Context, vc *vCenterClient, cfg Config, store SSHSettingsStore, moref string, key []byte) (*ssh.Client, error) {
	if vc == nil {
		return nil, fmt.Errorf("vCenter 未初始化")
	}
	if !vc.cfg.vCenterConfigured() {
		return nil, fmt.Errorf("vCenter 未配置")
	}
	moref = strings.TrimSpace(moref)
	if moref == "" {
		return nil, fmt.Errorf("缺少虚拟机 moRef")
	}
	var st *SSHVMStored
	if store != nil && len(key) > 0 {
		var err error
		st, err = store.GetVM(ctx, moref, key)
		if err != nil {
			return nil, err
		}
	}
	sshCfg, err := buildSSHClientConfigMerged(cfg, st)
	if err != nil {
		return nil, err
	}
	var guestIP string
	err = vc.WithClientRetry(ctx, func(govClient *govmomi.Client) error {
		var e error
		guestIP, e = vcenterVMPrimaryGuestIP(ctx, govClient, moref)
		return e
	})
	if err != nil {
		return nil, err
	}
	port := cfg.VCenterVMSshPort
	if st != nil && st.Port > 0 {
		port = st.Port
	}
	addr := net.JoinHostPort(guestIP, strconv.Itoa(port))
	_ = ctx
	return ssh.Dial("tcp", addr, sshCfg)
}

func handleVCenterVMSSHWS(c *gin.Context, vc *vCenterClient, cfg Config, store SSHSettingsStore, app *ServerApp) {
	if !vc.cfg.vCenterConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vCenter 未配置"})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	if vcenterBastionAbortIfForbidden(c, app, moref) {
		return
	}
	ctx := c.Request.Context()

	key, kerr := sshEncryptionKey(cfg)
	var st *SSHVMStored
	if store != nil && kerr == nil {
		st, _ = store.GetVM(ctx, moref, key)
	}
	if !sshEffectiveReady(ctx, cfg, store, moref, key) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未配置 SSH：请在环境变量中设置 VCENTER_VM_SSH_*，或在启用 Redis/MySQL 存储后在页面保存该虚拟机凭据"})
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

	conn, err := execUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("vCenter SSH WebSocket 升级失败: %v", err)
		return
	}
	defer conn.Close()

	doneKA := make(chan struct{})
	defer close(doneKA)
	startWebSocketBastionKeepalive(conn, doneKA)

	sshCfg, err := buildSSHClientConfigMerged(cfg, st)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("SSH 配置: "+err.Error()+"\r\n"))
		return
	}
	port := cfg.VCenterVMSshPort
	if st != nil && st.Port > 0 {
		port = st.Port
	}
	addr := net.JoinHostPort(guestIP, strconv.Itoa(port))
	sshClient, err := ssh.Dial("tcp", addr, sshCfg)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("SSH 连接 "+addr+" 失败: "+err.Error()+"\r\n"))
		return
	}
	defer sshClient.Close()

	sess, err := sshClient.NewSession()
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(err.Error()+"\r\n"))
		return
	}
	defer sess.Close()

	stdin, err := sess.StdinPipe()
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(err.Error()+"\r\n"))
		return
	}
	stdout, err := sess.StdoutPipe()
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(err.Error()+"\r\n"))
		return
	}

	sshSessionApplyTermEnv(sess, "xterm-256color")

	if err := sess.RequestPty("xterm-256color", 24, 80, ssh.TerminalModes{}); err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("PTY: "+err.Error()+"\r\n"))
		return
	}
	if err := sess.Shell(); err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("Shell: "+err.Error()+"\r\n"))
		return
	}

	outWriter := &wsBinaryWriter{conn: conn}
	var sessMu sync.Mutex

	done := make(chan struct{})
	go func() {
		defer close(done)
		_, _ = io.Copy(outWriter, stdout)
	}()

	go func() {
		defer stdin.Close()
		for {
			messageType, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if messageType == websocket.TextMessage {
				var msg struct {
					Type string `json:"type"`
					Cols uint16 `json:"cols"`
					Rows uint16 `json:"rows"`
				}
				if json.Unmarshal(data, &msg) == nil && msg.Type == "resize" && msg.Cols > 0 && msg.Rows > 0 {
					sessMu.Lock()
					_ = sess.WindowChange(int(msg.Rows), int(msg.Cols))
					sessMu.Unlock()
				}
				continue
			}
			if messageType == websocket.BinaryMessage && len(data) > 0 {
				_, _ = stdin.Write(data)
			}
		}
	}()

	_ = sess.Wait()
	_ = conn.WriteMessage(websocket.TextMessage, []byte("\r\n\x1b[33m[SSH 会话结束]\x1b[0m\r\n"))
	<-done
}
