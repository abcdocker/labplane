// 平台堡垒机原生 SSH：OpenSSH 可连接（如 ssh -p 2222 用户@平台），使用与 Web 相同账号/密码/可选 TOTP 后，交互选主机并复用与 Web 终端相同的 SSH 拨号。
package internal

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/ssh"
	"golang.org/x/term"
)

const (
	bastionNativeSSHKeyFile       = "bastion_native_ssh_host_ed25519"
	bastionNativeSshKUserExt      = "kuser"
	bastionNativeSshKRoleExt      = "krole"
	bastionNativeSSHVersionString = "SSH-2.0-kube-bt-sync-bastion"
)

// ptyReqWire / winWire 与 golang.org/x/crypto/ssh 内部 pty 消息结构一致，用于 Unmarshal
type ptyReqWire struct {
	Term     string
	Columns  uint32
	Rows     uint32
	Width    uint32
	Height   uint32
	Modelist string
}

type winChangeWire struct {
	Columns uint32
	Rows    uint32
	Width   uint32
	Height  uint32
}

var (
	bastionNativeSSHMu       sync.Mutex
	bastionNativeSSHListener net.Listener
	bastionNativeSSHCachedFP string
)

// BastionNativeSSHReconcileLoop 按堡垒机策略启停 TCP SSH 入站。应在 KUBEBT_ENABLE_BACKGROUND_JOBS=true 的节点运行。
func BastionNativeSSHReconcileLoop(ctx context.Context, getApp func() *ServerApp) {
	tick := time.NewTicker(5 * time.Second)
	defer tick.Stop()
	reconcileBastionNativeSSHListener(getApp)
	for {
		select {
		case <-ctx.Done():
			bastionNativeSshCloseListener()
			return
		case <-tick.C:
			reconcileBastionNativeSSHListener(getApp)
		}
	}
}

// BastionNativeSshReconcileFromPolicy 保存策略后可调用以立即尝试绑定端口。
func BastionNativeSshReconcileFromPolicy(app *ServerApp) {
	if app == nil {
		return
	}
	reconcileBastionNativeSSHListener(func() *ServerApp { return app })
}

func reconcileBastionNativeSSHListener(getApp func() *ServerApp) {
	app := getApp()
	if app == nil {
		return
	}
	if !app.Cfg().EnableBackgroundJobs {
		bastionNativeSshCloseListener()
		return
	}
	pol := loadVCenterBastionPolicy(app.PlatformKV())
	port := pol.NativeSshPort
	if port <= 0 {
		port = 2222
	}
	if !pol.NativeSshEnabled || port < 1 || port > 65535 {
		bastionNativeSshCloseListener()
		return
	}
	bastionNativeSSHMu.Lock()
	if bastionNativeSSHListener != nil {
		if a := bastionNativeSSHListener.Addr(); a != nil {
			if _, ps, sErr := net.SplitHostPort(a.String()); sErr == nil {
				if ap, e := strconv.Atoi(ps); e == nil && ap == port {
					bastionNativeSSHMu.Unlock()
					return
				}
			}
		}
		_ = bastionNativeSSHListener.Close()
		bastionNativeSSHListener = nil
	}
	bastionNativeSSHMu.Unlock()
	addr := net.JoinHostPort("0.0.0.0", strconv.Itoa(port))
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		log.Printf("堡垒机原生 SSH: 监听 %s 失败: %v", addr, err)
		return
	}
	bastionNativeSSHMu.Lock()
	bastionNativeSSHListener = ln
	bastionNativeSSHMu.Unlock()
	log.Printf("堡垒机原生 SSH: 已监听 %s（ssh -p %d 用户名@<本机/ingress 地址>）", addr, port)
	go acceptBastionNativeSSHConns(ln, getApp)
}

func bastionNativeSshCloseListener() {
	bastionNativeSSHMu.Lock()
	defer bastionNativeSSHMu.Unlock()
	if bastionNativeSSHListener != nil {
		_ = bastionNativeSSHListener.Close()
		bastionNativeSSHListener = nil
	}
}

func acceptBastionNativeSSHConns(ln net.Listener, getApp func() *ServerApp) {
	for {
		c, err := ln.Accept()
		if err != nil {
			if ne, ok := err.(net.Error); ok && ne.Temporary() {
				time.Sleep(50 * time.Millisecond)
				continue
			}
			return
		}
		go handleBastionNativeSshClientConn(c, getApp)
	}
}

func readOrCreateBastionSSHHostSigner(dataDir string) (ssh.Signer, error) {
	p := filepath.Join(dataDir, bastionNativeSSHKeyFile)
	if b, err := os.ReadFile(p); err == nil {
		s, e := ssh.ParsePrivateKey(b)
		if e == nil {
			if bastionNativeSSHCachedFP == "" {
				bastionNativeSSHCachedFP = ssh.FingerprintSHA256(s.PublicKey())
			}
			return s, nil
		}
	}
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	block, err := ssh.MarshalPrivateKey(priv, "bastion@kube-bt-sync")
	if err != nil {
		return nil, err
	}
	pemBytes := pem.EncodeToMemory(block)
	_ = os.MkdirAll(dataDir, 0o700)
	if err := os.WriteFile(p, pemBytes, 0o600); err != nil {
		return nil, err
	}
	s, err := ssh.ParsePrivateKey(pemBytes)
	if err != nil {
		return nil, err
	}
	bastionNativeSSHCachedFP = ssh.FingerprintSHA256(s.PublicKey())
	return s, nil
}

func newBastionNativeSshServerConfig(app *ServerApp) (*ssh.ServerConfig, error) {
	s, err := readOrCreateBastionSSHHostSigner(app.DataDir())
	if err != nil {
		return nil, err
	}
	sc := &ssh.ServerConfig{
		ServerVersion: bastionNativeSSHVersionString,
		MaxAuthTries:  5,
		PasswordCallback: func(c ssh.ConnMetadata, password []byte) (*ssh.Permissions, error) {
			if len(password) > LoginPasswordMaxBytes {
				return nil, fmt.Errorf("password too long")
			}
			cfg := app.Cfg()
			if !cfg.DashboardAuthEnabled() || !cfg.PasswordLoginEnabled() {
				return nil, fmt.Errorf("未启用本地密码登录，无法经 SSH 入站")
			}
			u := strings.TrimSpace(c.User())
			ip, _, sErr := net.SplitHostPort(c.RemoteAddr().String())
			if sErr != nil {
				ip = c.RemoteAddr().String()
			}
			if isIPLoginBanned(ip) {
				return nil, fmt.Errorf("本 IP 暂时禁止登录")
			}
			ku, role, err := bastionNativeSshDoPasswordAuth(app, u, string(password), ip)
			if err != nil {
				if _, a := recordLoginFailure(app, ip); a {
					appendSecurityLoginBruteforceAlert(app, ip)
				}
				return nil, err
			}
			AppendAuditRecord(app, AuditRecord{
				Action: "login_ok", User: ku, IP: ip, Path: "native-ssh", Method: "ssh-password", Status: 200, Detail: "native_ssh",
			})
			OnPasswordLoginSuccess(app, ku, ip)
			return &ssh.Permissions{Extensions: map[string]string{
				bastionNativeSshKUserExt: ku, bastionNativeSshKRoleExt: role,
			}}, nil
		},
	}
	sc.AddHostKey(s)
	return sc, nil
}

func bastionNativeSshDoPasswordAuth(app *ServerApp, login, password, clientIP string) (user, role string, err error) {
	login = strings.TrimSpace(login)
	if login == "" {
		return "", "", fmt.Errorf("空用户名")
	}
	db := app.MySQLDB()
	if db != nil {
		ku, r, ok, err := bastionNativeMysqlAuthWithTotp(app, db, login, password)
		if err != nil {
			return "", "", err
		}
		if ok {
			if err := bastionNativeSshCheckIPPolicy(db, ku, clientIP, app); err != nil {
				return "", "", err
			}
			return ku, r, nil
		}
	}
	cfg := app.Cfg()
	du := strings.TrimSpace(cfg.DashboardUser)
	if du != "" && strings.EqualFold(du, login) && dashboardPasswordOk(cfg, password) {
		if e := bastionNativeSshCheckIPPolicy(db, du, clientIP, app); e != nil {
			return "", "", e
		}
		return du, DashboardRoleAdmin, nil
	}
	return "", "", fmt.Errorf("身份验证失败")
}

func bastionNativeSshCheckIPPolicy(db *sql.DB, userForPolicy, clientIP string, app *ServerApp) error {
	if db == nil {
		return nil
	}
	u := strings.TrimSpace(userForPolicy)
	if u == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	ok, err := DashboardUserClientIPAllowed(db, ctx, u, clientIP)
	if err != nil {
		return fmt.Errorf("IP 策略校验失败: %w", err)
	}
	if !ok {
		return fmt.Errorf("本 IP 不在该账号的允许范围内")
	}
	return nil
}

func isSixDigits(s string) bool {
	if len(s) != 6 {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// bastionNativeMysqlAuthWithTotp：全量密码 或 密码|XXXXXX 或 密码后接 6 位 TOTP；未在库中的登录名返回 ok=false
func bastionNativeMysqlAuthWithTotp(app *ServerApp, db *sql.DB, login, pass string) (string, string, bool, error) {
	du, r, ok, found, e := dashboardUserAuthenticate(db, login, pass)
	if e != nil {
		if errors.Is(e, ErrLoginPasswordTooLong) {
			return "", "", false, e
		}
		return "", "", false, e
	}
	if found && ok {
		return du, r, true, nil
	}
	if !found {
		return "", "", false, nil
	}
	// 在库但密码不对：试 TOTP 两种写法
	var base, totpCode string
	if i := strings.Index(pass, "|"); i > 0 && i < len(pass)-1 {
		base = pass[:i]
		totpCode = strings.TrimSpace(pass[i+1:])
	} else if len(pass) > 6 && isSixDigits(pass[len(pass)-6:]) {
		base = pass[:len(pass)-6]
		totpCode = pass[len(pass)-6:]
	} else {
		return "", "", false, fmt.Errorf("凭据错误")
	}
	if !isSixDigits(totpCode) {
		return "", "", false, fmt.Errorf("凭据错误")
	}
	u, r, ok, _, err := dashboardUserAuthenticate(db, login, base)
	if err != nil {
		return "", "", false, err
	}
	if !ok {
		return "", "", false, fmt.Errorf("凭据错误")
	}
	en, _, mErr := dashboardUserTotpMeta(db, u)
	if mErr != nil {
		return "", "", false, mErr
	}
	if !en {
		return u, r, false, fmt.Errorf("凭据错误")
	}
	encKey, e2 := totpEncryptionKey(app.Cfg())
	if e2 != nil {
		return "", "", false, e2
	}
	plain, e3 := totpSecretPlainForUser(app, app.Cfg(), encKey, u)
	if e3 != nil || strings.TrimSpace(plain) == "" {
		return "", "", false, fmt.Errorf("TOTP 不可读，无法完成 SSH 登录")
	}
	if !ValidateTOTPCode(plain, totpCode) {
		return u, r, false, fmt.Errorf("两步验证码错误")
	}
	return u, r, true, nil
}

func handleBastionNativeSshClientConn(nconn net.Conn, getApp func() *ServerApp) {
	defer nconn.Close()
	app := getApp()
	if app == nil {
		return
	}
	cfg, err := newBastionNativeSshServerConfig(app)
	if err != nil {
		log.Printf("堡垒机原生 SSH: ServerConfig: %v", err)
		return
	}
	sconn, chans, reqs, err := ssh.NewServerConn(nconn, cfg)
	if err != nil {
		return
	}
	defer sconn.Close()
	go ssh.DiscardRequests(reqs)
	perm := sconn.Permissions
	ku, kr := "", DashboardRoleViewer
	if perm != nil {
		ku = perm.Extensions[bastionNativeSshKUserExt]
		kr = perm.Extensions[bastionNativeSshKRoleExt]
	}
	for ch := range chans {
		go handleBastionNativeSshNewChannel(ch, app, ku, kr)
	}
}

type nativeSshTarget struct {
	kind string
	id   string
	name string
}

func handleBastionNativeSshNewChannel(newCh ssh.NewChannel, app *ServerApp, ku, kr string) {
	if newCh.ChannelType() != "session" {
		_ = newCh.Reject(ssh.UnknownChannelType, "仅支持 session 通道")
		return
	}
	ch, requests, err := newCh.Accept()
	if err != nil {
		return
	}
	admin := kr == DashboardRoleAdmin
	go func() {
		defer ch.Close()
		termName := "xterm-256color"
		termW, termH := 80, 24
		// 必须在处理 shell 的循环中保持消费 channel request：OpenSSH 在 shell/PTY 后仍会发送
		// window-change 等。若在菜单或下游 PTY 转发中阻塞不读 requests，会阻塞 mux 并表现为 Broken pipe。
		shellStarted := false
		for req := range requests {
			switch req.Type {
			case "pty-req":
				var p ptyReqWire
				_ = ssh.Unmarshal(req.Payload, &p)
				if p.Columns > 0 {
					termW = int(p.Columns)
				}
				if p.Rows > 0 {
					termH = int(p.Rows)
				}
				if strings.TrimSpace(p.Term) != "" {
					termName = p.Term
				}
				_ = req.Reply(true, nil)
			case "shell":
				if !shellStarted {
					shellStarted = true
					_ = req.Reply(true, nil)
					u0 := strings.TrimSpace(ku)
					go bastionNativeSshRunMenuAndForward(ch, app, u0, admin, termName, termH, termW)
				} else if req.WantReply {
					_ = req.Reply(false, nil)
				}
			case "window-change":
				// 尺寸变更通常 WantReply 为 false；有应答位时给成功以避免客户端阻塞
				if req.WantReply {
					_ = req.Reply(true, nil)
				}
			default:
				if req.WantReply {
					_ = req.Reply(false, nil)
				}
			}
		}
	}()
}

func bastionNativeSshRunMenuAndForward(
	ch ssh.Channel,
	app *ServerApp,
	ku string,
	admin bool,
	termName string,
	rows, cols int,
) {
	u := strings.ToLower(strings.TrimSpace(ku))
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	targets, err := nativeSshBuildMenuTargets(ctx, app, u, admin)
	if err != nil {
		_, _ = io.WriteString(ch, "\r\n\x1b[31m列主机失败: "+err.Error()+"\x1b[0m\r\n")
		return
	}
	if len(targets) == 0 {
		_, _ = io.WriteString(ch, "\r\n无可用目标（vCenter/ACL/隐藏策略）。\r\n")
		return
	}
	var b strings.Builder
	b.WriteString("\r\n\x1b[33m 可用目标（与 Web 堡垒机一致，输入序号回车，q 退出）\x1b[0m\r\n")
	for i, t := range targets {
		lab := t.name
		if lab == "" {
			lab = t.id
		}
		kind := "vm"
		if t.kind == "extra" {
			kind = "linux.extra"
		}
		_, _ = b.WriteString(fmt.Sprintf("  %2d) [%s] %s  (%s)\r\n", i+1, kind, lab, t.id))
	}
	b.WriteString(`说明：已开 TOTP 时密码写为 密码+6 位 或 密码|6 位` + "\r\n")
	_, _ = ch.Write([]byte(b.String()))
	tr := term.NewTerminal(ch, "")
	_ = tr.SetSize(cols, rows)
	ln, rErr := tr.ReadLine()
	if rErr != nil {
		return
	}
	ln = strings.TrimSpace(ln)
	if strings.EqualFold(ln, "q") || ln == "exit" {
		_, _ = io.WriteString(ch, "再见.\r\n")
		return
	}
	idx, pErr := strconv.Atoi(ln)
	if pErr != nil || idx < 1 || idx > len(targets) {
		_, _ = io.WriteString(ch, "无效序号.\r\n")
		return
	}
	tg := targets[idx-1]
	cfg := app.Cfg()
	key, kerr := sshEncryptionKey(cfg)
	if kerr != nil {
		_, _ = io.WriteString(ch, "KUBEBT_ENCRYPTION_KEY 未配置: "+kerr.Error()+"\r\n")
		return
	}
	var rcli *ssh.Client
	var dialErr error
	if tg.kind == "vm" {
		vc := app.VCenter()
		if vc == nil || !vc.cfg.vCenterConfigured() {
			_, _ = io.WriteString(ch, "vCenter 未就绪.\r\n")
			return
		}
		rcli, dialErr = sshDialVCenterVMClient(ctx, vc, cfg, app.SSHStore(), tg.id, key)
	} else {
		pol := loadVCenterBastionPolicy(app.PlatformKV())
		h := bastionFindExtraHost(pol, tg.id)
		if h == nil {
			_, _ = io.WriteString(ch, "未找到该 extra 主机.\r\n")
			return
		}
		rcli, dialErr = bastionDialSSHToExtra(ctx, app, tg.id, h)
	}
	if dialErr != nil {
		_, _ = io.WriteString(ch, "\r\n\x1b[31m连接失败: "+dialErr.Error()+"\x1b[0m\r\n")
		return
	}
	defer rcli.Close()
	_, _ = io.WriteString(ch, "\r\n\x1b[32m已连至目标，Ctrl+D 或 exit 可断开。\x1b[0m\r\n")
	_ = bastionNativeSshPtyCopy(ch, rcli, termName, rows, cols)
}

func bastionNativeSshPtyCopy(ch ssh.Channel, rcli *ssh.Client, termName string, rows, cols int) error {
	sess, err := rcli.NewSession()
	if err != nil {
		return err
	}
	defer sess.Close()
	sshSessionApplyTermEnv(sess, termName)
	if err := sess.RequestPty(termName, rows, cols, ssh.TerminalModes{}); err != nil {
		return err
	}
	if err := sess.Shell(); err != nil {
		return err
	}
	sin, _ := sess.StdinPipe()
	sout, _ := sess.StdoutPipe()
	done := make(chan struct{})
	go func() {
		_, _ = io.Copy(sin, ch)
		_ = sin.Close()
	}()
	go func() {
		_, _ = io.Copy(ch, sout)
		close(done)
	}()
	_ = sess.Wait()
	<-done
	_, _ = io.WriteString(ch, "\r\n\x1b[33m[会话结束]\x1b[0m\r\n")
	return nil
}

func nativeSshBuildMenuTargets(ctx context.Context, app *ServerApp, userLower string, isAdmin bool) ([]nativeSshTarget, error) {
	pol := loadVCenterBastionPolicy(app.PlatformKV())
	var out []nativeSshTarget
	vc := app.VCenter()
	if vc != nil && vc.cfg.vCenterConfigured() {
		raw, _, _, err := vcenterVMListSnapshotBytes(ctx, app, false, true)
		if err == nil {
			var env struct {
				VMs []map[string]interface{} `json:"vms"`
			}
			if e := json.Unmarshal(raw, &env); e == nil {
				for _, vm := range env.VMs {
					moref, _ := vm["moref"].(string)
					name, _ := vm["name"].(string)
					if moref == "" {
						continue
					}
					if !bastionMayAccess(pol, userLower, moref, isAdmin) {
						continue
					}
					if bastionVmMorefHidden(pol, moref) {
						continue
					}
					out = append(out, nativeSshTarget{kind: "vm", id: moref, name: name})
				}
			}
		}
	}
	for i := range pol.ExtraHosts {
		h := pol.ExtraHosts[i]
		if strings.EqualFold(strings.TrimSpace(h.Kind), "windows") {
			continue
		}
		tid := bastionExtraTarget(h.ID)
		if !bastionMayAccess(pol, userLower, tid, isAdmin) {
			continue
		}
		out = append(out, nativeSshTarget{kind: "extra", id: h.ID, name: h.Name})
	}
	return out, nil
}

// handleGetBastionNativeSshInfo 返回原生 SSH 端口与主机公钥指纹（不暴露敏感信息）。
func handleGetBastionNativeSshInfo(c *gin.Context, app *ServerApp) {
	pol := loadVCenterBastionPolicy(app.PlatformKV())
	port := pol.NativeSshPort
	if port <= 0 {
		port = 2222
	}
	_, _ = readOrCreateBastionSSHHostSigner(app.DataDir()) // 确保指纹已计算
	ver := "SSH-2.0-kube-bt-sync-bastion (OpenSSH 兼容)"
	c.JSON(http.StatusOK, gin.H{
		"enabled":             pol.NativeSshEnabled,
		"port":                port,
		"hostKeyFingerprint":  bastionNativeSSHCachedFP,
		"serverVersionBanner": ver,
		"hint": `使用: ssh -o StrictHostKeyChecking=accept-new -p ` + fmt.Sprintf("%d", port) + ` 用户名@<与访问 Web 相同的公网/内网或 Ingress 的 IP/域名>；密码与平台登录一致。已开 TOTP 时可用 密码|6位码 或 密码+6 位。`,
	})
}