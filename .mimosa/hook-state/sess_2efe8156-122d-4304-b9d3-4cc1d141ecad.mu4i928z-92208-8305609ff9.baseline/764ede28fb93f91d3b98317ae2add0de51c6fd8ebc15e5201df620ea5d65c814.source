package internal

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

// BastionExtraSSHStoreKey SSH 凭据在 SSHSettingsStore 中的键（与 vCenter moRef 区分）。
func BastionExtraSSHStoreKey(extraID string) string {
	return "bastion-extra:" + strings.ToLower(strings.TrimSpace(extraID))
}

// BastionExtraRDPCredStoreKey Windows 额外主机的 RDP 密码等存在 SSHStore 中（仅加密存储，RDP 协议未用其拨号）。
func BastionExtraRDPCredStoreKey(extraID string) string {
	return "bastion-extra-rdp:" + strings.ToLower(strings.TrimSpace(extraID))
}

func mergeBastionExtraSSHStored(cfg Config, st *SSHVMStored, h *BastionExtraHost) *SSHVMStored {
	user := strings.TrimSpace(cfg.VCenterVMSshUser)
	pw := cfg.VCenterVMSshPassword
	port := 22
	insecure := cfg.VCenterVMSshInsecureHostKey
	hostKeyFingerprint := cfg.VCenterVMSshHostKeyFingerprint
	if st != nil {
		if strings.TrimSpace(st.User) != "" {
			user = strings.TrimSpace(st.User)
		}
		if st.Password != "" {
			pw = st.Password
		}
		if st.Port > 0 {
			port = st.Port
		}
		insecure = st.InsecureHostKey
		hostKeyFingerprint = st.HostKeyFingerprint
	}
	if h != nil {
		if strings.TrimSpace(h.SSHUser) != "" {
			user = strings.TrimSpace(h.SSHUser)
		}
		if h.SSHPort > 0 {
			port = h.SSHPort
		}
	}
	out := &SSHVMStored{
		User:               user,
		Password:           pw,
		PrivateKeyPEM:      "",
		KeyPassphrase:      "",
		Port:               port,
		InsecureHostKey:    insecure,
		HostKeyFingerprint: hostKeyFingerprint,
	}
	if st != nil && strings.TrimSpace(st.PrivateKeyPEM) != "" {
		out.PrivateKeyPEM = st.PrivateKeyPEM
		out.KeyPassphrase = st.KeyPassphrase
	}
	return out
}

func bastionDialSSHToExtra(ctx context.Context, app *ServerApp, extraID string, h *BastionExtraHost) (*ssh.Client, error) {
	if h == nil {
		return nil, errors.New("extra 主机配置无效")
	}
	addr := strings.TrimSpace(h.Address)
	if addr == "" {
		return nil, errors.New("extra 主机地址为空")
	}
	if strings.EqualFold(strings.TrimSpace(h.Kind), "windows") {
		return nil, errors.New("该条目为 Windows，请使用 RDP")
	}
	cfg := app.Cfg()
	key, kerr := sshEncryptionKey(cfg)
	var st *SSHVMStored
	if app.SSHStore() != nil && kerr == nil && len(key) > 0 {
		st, _ = app.SSHStore().GetVM(ctx, BastionExtraSSHStoreKey(extraID), key)
	}
	merged := mergeBastionExtraSSHStored(cfg, st, h)
	sshCfg, err := buildSSHClientConfigMerged(cfg, merged)
	if err != nil {
		return nil, err
	}
	port := h.SSHPort
	if port <= 0 {
		port = 22
	}
	_ = ctx
	return ssh.Dial("tcp", net.JoinHostPort(addr, strconv.Itoa(port)), sshCfg)
}

func bastionTrySSHPasswordDial(address string, port int, user, password, fingerprint string) error {
	user = strings.TrimSpace(user)
	if user == "" {
		return errors.New("SSH 用户名为空")
	}
	if strings.TrimSpace(password) == "" {
		return errors.New("SSH 密码为空")
	}
	if port <= 0 {
		port = 22
	}
	addr := strings.TrimSpace(address)
	if addr == "" {
		return errors.New("地址为空")
	}
	hostKeyCallback, err := pinnedSSHHostKeyCallback(false, fingerprint)
	if err != nil {
		return err
	}
	sshCfg := &ssh.ClientConfig{
		User:            user,
		Auth:            []ssh.AuthMethod{ssh.Password(password)},
		HostKeyCallback: hostKeyCallback,
		Timeout:         15 * time.Second,
	}
	c, err := ssh.Dial("tcp", net.JoinHostPort(addr, strconv.Itoa(port)), sshCfg)
	if err != nil {
		return fmt.Errorf("SSH 认证失败: %w", err)
	}
	_ = c.Close()
	return nil
}

func bastionTryRDPTCP(address string, port int) error {
	addr := strings.TrimSpace(address)
	if addr == "" {
		return errors.New("地址为空")
	}
	if port <= 0 {
		port = 3389
	}
	d := net.Dialer{Timeout: 8 * time.Second}
	conn, err := d.Dial("tcp", net.JoinHostPort(addr, strconv.Itoa(port)))
	if err != nil {
		return fmt.Errorf("无法连接 RDP 端口: %w", err)
	}
	_ = conn.Close()
	return nil
}

func bastionPersistLinuxExtraSSH(ctx context.Context, app *ServerApp, id string, h *BastionExtraHost, password string) error {
	store := app.SSHStore()
	key, err := sshEncryptionKey(app.Cfg())
	if store == nil || err != nil || len(key) == 0 {
		return errors.New("未配置 SSH_SETTINGS 与 KUBEBT_ENCRYPTION_KEY，无法保存密码")
	}
	user := strings.TrimSpace(h.SSHUser)
	if user == "" {
		user = strings.TrimSpace(app.Cfg().VCenterVMSshUser)
	}
	if user == "" {
		return errors.New("请填写 SSH 用户名或配置全局 VCENTER_VM_SSH_USER")
	}
	port := h.SSHPort
	if port <= 0 {
		port = 22
	}
	t := false
	pw := password
	fingerprint := normalizeSSHHostKeyFingerprint(h.SSHHostKeyFingerprint)
	return store.PutVM(ctx, BastionExtraSSHStoreKey(id), &sshVMPutInput{
		User:               user,
		Password:           &pw,
		Port:               &port,
		InsecureHostKey:    &t,
		HostKeyFingerprint: &fingerprint,
	}, key)
}

func bastionPersistWindowsExtraRDPSecret(ctx context.Context, app *ServerApp, id string, h *BastionExtraHost, password string) error {
	store := app.SSHStore()
	key, err := sshEncryptionKey(app.Cfg())
	if store == nil || err != nil || len(key) == 0 {
		return errors.New("未配置 SSH_SETTINGS 与 KUBEBT_ENCRYPTION_KEY，无法保存 RDP 密码")
	}
	user := strings.TrimSpace(h.RDPUser)
	port := h.RDPPort
	if port <= 0 {
		port = 3389
	}
	t := true
	pw := password
	// 用 SSH 存储格式仅保存加密字段；RDP 会话当前仍走本地下载 .rdp，密码供后续扩展或审计
	return store.PutVM(ctx, BastionExtraRDPCredStoreKey(id), &sshVMPutInput{
		User:            user,
		Password:        &pw,
		Port:            &port,
		InsecureHostKey: &t,
	}, key)
}
