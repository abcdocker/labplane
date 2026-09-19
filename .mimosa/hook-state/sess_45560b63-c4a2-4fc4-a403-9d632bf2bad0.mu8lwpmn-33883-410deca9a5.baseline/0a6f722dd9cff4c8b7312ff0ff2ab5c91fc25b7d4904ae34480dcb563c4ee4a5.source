package internal

import (
	"crypto/subtle"
	"fmt"
	"net"
	"strings"

	"golang.org/x/crypto/ssh"
)

func normalizeSSHHostKeyFingerprint(value string) string {
	return strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(value), "ssh-ed25519 "))
}

func pinnedSSHHostKeyCallback(insecure bool, fingerprint string) (ssh.HostKeyCallback, error) {
	if insecure {
		return ssh.InsecureIgnoreHostKey(), nil
	}
	expected := normalizeSSHHostKeyFingerprint(fingerprint)
	if expected == "" {
		return nil, fmt.Errorf("安全 SSH 连接需要配置主机密钥指纹（格式 SHA256:...）；也可临时显式启用 insecureHostKey")
	}
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		actual := ssh.FingerprintSHA256(key)
		if subtle.ConstantTimeCompare([]byte(actual), []byte(expected)) != 1 {
			return fmt.Errorf("SSH 主机密钥不匹配 host=%s expected=%s actual=%s", hostname, expected, actual)
		}
		return nil
	}, nil
}
