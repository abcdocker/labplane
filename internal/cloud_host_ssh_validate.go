package internal

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"strings"

	"golang.org/x/crypto/ssh"
)

// cloudHostSSHCanDial 判断是否具备凭据可尝试 SSH（全局或请求体或已存）。
func cloudHostSSHCanDial(ctx context.Context, cfg Config, store SSHSettingsStore, cloudKey string, key []byte, host *CloudHost, password, privateKeyPem string) bool {
	if cfg.vCenterVMSshConfigured() {
		return true
	}
	if strings.TrimSpace(password) != "" || strings.TrimSpace(privateKeyPem) != "" {
		return true
	}
	if store != nil && len(key) > 0 {
		rec, _ := store.GetVM(ctx, cloudKey, key)
		if rec != nil && rec.hasAuth() {
			return true
		}
	}
	return false
}

// sshDialCloudHostClient 建立 SSH 客户端（与终端/SFTP 相同凭据逻辑）。
func sshDialCloudHostClient(ctx context.Context, cfg Config, store SSHSettingsStore, cloudKey string, key []byte, host *CloudHost, password, privateKeyPem string) (*ssh.Client, error) {
	if host == nil || strings.TrimSpace(host.SSHHost) == "" {
		return nil, fmt.Errorf("SSH 地址为空")
	}
	var st *SSHVMStored
	if strings.TrimSpace(password) != "" || strings.TrimSpace(privateKeyPem) != "" {
		st = &SSHVMStored{
			User:               host.SSHUser,
			Password:           password,
			PrivateKeyPEM:      privateKeyPem,
			Port:               host.SSHPort,
			InsecureHostKey:    cfg.VCenterVMSshInsecureHostKey,
			HostKeyFingerprint: cfg.VCenterVMSshHostKeyFingerprint,
		}
	} else if store != nil && len(key) > 0 {
		var err error
		st, err = store.GetVM(ctx, cloudKey, key)
		if err != nil {
			return nil, err
		}
	}
	sshCfg, err := buildSSHClientConfigForCloudHost(cfg, st, host)
	if err != nil {
		return nil, err
	}
	port := sshDialPortForCloud(st, host)
	addr := net.JoinHostPort(strings.TrimSpace(host.SSHHost), strconv.Itoa(port))
	_ = ctx // ssh.ClientConfig.Timeout 已控制握手超时
	return ssh.Dial("tcp", addr, sshCfg)
}

// trySSHDialCloudHost 在保存前校验能否登录 SSH。
func trySSHDialCloudHost(ctx context.Context, cfg Config, store SSHSettingsStore, cloudKey string, key []byte, host *CloudHost, password, privateKeyPem string) error {
	client, err := sshDialCloudHostClient(ctx, cfg, store, cloudKey, key, host, password, privateKeyPem)
	if err != nil {
		return err
	}
	defer client.Close()
	sess, err := client.NewSession()
	if err != nil {
		return err
	}
	defer sess.Close()
	if err := sess.Run("true"); err != nil {
		return fmt.Errorf("SSH 会话执行失败（请检查用户名/密码或私钥）: %w", err)
	}
	return nil
}
