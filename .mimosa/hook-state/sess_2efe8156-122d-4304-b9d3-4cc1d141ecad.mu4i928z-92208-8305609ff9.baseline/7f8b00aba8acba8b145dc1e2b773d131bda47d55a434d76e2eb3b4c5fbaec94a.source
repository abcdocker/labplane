package internal

import (
	"strings"

	"golang.org/x/crypto/ssh"
)

// sshSessionApplyTermEnv 在 RequestPty 之前尝试下发 TERM。
// OpenSSH 默认 AcceptEnv 常为空，会拒绝 env 请求，此时仍依赖 pty-req 中的终端名；忽略拒绝错误。
func sshSessionApplyTermEnv(sess *ssh.Session, term string) {
	if sess == nil {
		return
	}
	t := strings.TrimSpace(term)
	if t == "" {
		t = "xterm-256color"
	}
	_ = sess.Setenv("TERM", t)
}
