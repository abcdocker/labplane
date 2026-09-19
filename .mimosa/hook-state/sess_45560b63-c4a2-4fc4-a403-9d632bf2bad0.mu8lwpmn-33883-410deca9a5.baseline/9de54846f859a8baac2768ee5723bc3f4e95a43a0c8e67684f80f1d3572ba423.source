package internal

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

func handleBastionExtraSSHWS(c *gin.Context, app *ServerApp) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 id"})
		return
	}
	target := bastionExtraTarget(id)
	if vcenterBastionAbortIfForbiddenTarget(c, app, target) {
		return
	}
	pol := loadVCenterBastionPolicy(app.PlatformKV())
	h := bastionFindExtraHost(pol, id)
	if h == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到该 extra 主机"})
		return
	}

	cfg := app.Cfg()
	ctx := c.Request.Context()
	key, _ := sshEncryptionKey(cfg)
	store := app.SSHStore()
	sshReady := cfg.vCenterVMSshConfigured()
	if !sshReady && store != nil && len(key) > 0 {
		rec, _ := store.GetVM(ctx, BastionExtraSSHStoreKey(id), key)
		sshReady = rec != nil && rec.hasAuth()
	}
	if !sshReady {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未配置 SSH：请设置全局 VCENTER_VM_SSH_*，或在策略保存时填写并校验 Linux 密码写入存储"})
		return
	}

	conn, err := execUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("堡垒机 extra SSH WebSocket 升级失败: %v", err)
		return
	}
	defer conn.Close()

	doneKA := make(chan struct{})
	defer close(doneKA)
	startWebSocketBastionKeepalive(conn, doneKA)

	sshClient, err := bastionDialSSHToExtra(ctx, app, id, h)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("SSH 连接失败: "+err.Error()+"\r\n"))
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
