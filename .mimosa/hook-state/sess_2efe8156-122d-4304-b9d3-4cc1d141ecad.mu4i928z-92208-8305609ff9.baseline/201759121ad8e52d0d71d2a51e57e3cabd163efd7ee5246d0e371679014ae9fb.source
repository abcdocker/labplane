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
	"golang.org/x/crypto/ssh"
)

func cloudHostSSHStorageKey(id string) string {
	return "cloud-host:" + strings.TrimSpace(id)
}

func getCloudHostByID(app *ServerApp, id string) (*CloudHost, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, fmt.Errorf("缺少 id")
	}
	hosts, err := loadCloudHosts(app)
	if err != nil {
		return nil, err
	}
	idx := findCloudHostIndex(hosts, id)
	if idx < 0 {
		return nil, fmt.Errorf("未找到主机")
	}
	return &hosts[idx], nil
}

// cloudSSHReady 是否可连 SSH：全局 VCENTER_VM_SSH_* 已配，或该 cloud-host 在存储中有完整凭据。
func cloudSSHReady(ctx context.Context, cfg Config, store SSHSettingsStore, cloudKey string, key []byte, host *CloudHost) bool {
	if host == nil || strings.TrimSpace(host.SSHHost) == "" {
		return false
	}
	if cfg.vCenterVMSshConfigured() {
		return true
	}
	if store == nil || len(key) == 0 {
		return false
	}
	rec, err := store.GetVM(ctx, cloudKey, key)
	if err != nil || rec == nil {
		return false
	}
	return rec.hasAuth() &&
		(rec.InsecureHostKey || strings.TrimSpace(rec.HostKeyFingerprint) != "")
}

func buildSSHClientConfigForCloudHost(cfg Config, st *SSHVMStored, host *CloudHost) (*ssh.ClientConfig, error) {
	user := strings.TrimSpace(host.SSHUser)
	if st != nil && strings.TrimSpace(st.User) != "" {
		user = strings.TrimSpace(st.User)
	}
	if user == "" {
		user = strings.TrimSpace(cfg.VCenterVMSshUser)
	}
	if user == "" {
		return nil, fmt.Errorf("SSH 用户名为空（填写主机「SSH 用户」、全局 VCENTER_VM_SSH_USER 或已保存凭据）")
	}

	pw := cfg.VCenterVMSshPassword
	keyPath := strings.TrimSpace(cfg.VCenterVMSshPrivateKeyPath)
	keyPass := cfg.VCenterVMSshKeyPassphrase
	insecure := cfg.VCenterVMSshInsecureHostKey
	hostKeyFingerprint := strings.TrimSpace(host.SSHHostKeyFingerprint)
	if hostKeyFingerprint == "" {
		hostKeyFingerprint = cfg.VCenterVMSshHostKeyFingerprint
	}
	if st != nil {
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
		return nil, fmt.Errorf("请配置私钥（文件路径或页面粘贴 PEM）或密码（全局或本机已保存凭据）")
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

func sshDialPortForCloud(st *SSHVMStored, host *CloudHost) int {
	port := 22
	if host != nil && host.SSHPort > 0 {
		port = host.SSHPort
	}
	if st != nil && st.Port > 0 {
		port = st.Port
	}
	return port
}

func handleCloudHostSSHWS(c *gin.Context, app *ServerApp) {
	id := strings.TrimSpace(c.Param("id"))
	ctx := c.Request.Context()

	host, err := getCloudHostByID(app, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	store := app.SSHStore()
	key, kerr := sshEncryptionKey(app.Cfg())
	cloudKey := cloudHostSSHStorageKey(id)
	var st *SSHVMStored
	if store != nil && kerr == nil {
		st, _ = store.GetVM(ctx, cloudKey, key)
	}
	if !cloudSSHReady(ctx, app.Cfg(), store, cloudKey, key, host) {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "未配置 SSH：请设置全局 VCENTER_VM_SSH_USER 与密码/私钥，或在启用 SSH 存储与 KUBEBT_ENCRYPTION_KEY 后于页面保存该主机凭据",
		})
		return
	}

	sshCfg, err := buildSSHClientConfigForCloudHost(app.Cfg(), st, host)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	port := sshDialPortForCloud(st, host)
	addr := net.JoinHostPort(strings.TrimSpace(host.SSHHost), strconv.Itoa(port))

	conn, err := execUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("公有云 SSH WebSocket 升级失败: %v", err)
		return
	}
	defer conn.Close()

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

func handleGetCloudHostSSHSettings(c *gin.Context, app *ServerApp) {
	id := strings.TrimSpace(c.Param("id"))
	ctx := c.Request.Context()

	host, err := getCloudHostByID(app, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	key, keyErr := sshEncryptionKey(app.Cfg())
	store := app.SSHStore()
	cloudKey := cloudHostSSHStorageKey(id)
	fromEnv := app.Cfg().vCenterVMSshConfigured()

	out := gin.H{
		"id":              id,
		"sshHost":         host.SSHHost,
		"sshPort":         host.SSHPort,
		"sshUserHint":     host.SSHUser,
		"fromEnv":         fromEnv,
		"backend":         string(app.Cfg().SSHSettingsBackend),
		"writable":        store != nil && keyErr == nil,
		"encryptionReady": keyErr == nil,
	}
	if keyErr != nil {
		out["encryptionError"] = keyErr.Error()
	}

	if store == nil {
		out["stored"] = false
		out["canConnect"] = cloudSSHReady(ctx, app.Cfg(), store, cloudKey, key, host)
		c.JSON(http.StatusOK, out)
		return
	}

	if keyErr != nil {
		out["stored"] = false
		out["canConnect"] = cloudSSHReady(ctx, app.Cfg(), store, cloudKey, key, host)
		out["needsEncryptionKey"] = true
		c.JSON(http.StatusOK, out)
		return
	}

	rec, err := store.GetVM(ctx, cloudKey, key)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	out["stored"] = rec != nil && (strings.TrimSpace(rec.User) != "" || rec.hasAuth())
	if rec != nil {
		out["user"] = rec.User
		if rec.Port > 0 {
			out["port"] = rec.Port
		}
		out["insecureHostKey"] = rec.InsecureHostKey
		out["hostKeyFingerprint"] = rec.HostKeyFingerprint
		out["passwordSet"] = strings.TrimSpace(rec.Password) != ""
		out["privateKeySet"] = strings.TrimSpace(rec.PrivateKeyPEM) != ""
	}
	if rec == nil || rec.Port == 0 {
		if host.SSHPort > 0 {
			out["port"] = host.SSHPort
		} else {
			out["port"] = 22
		}
	}
	if rec == nil || strings.TrimSpace(rec.User) == "" {
		out["user"] = host.SSHUser
	}
	if rec == nil {
		out["insecureHostKey"] = app.Cfg().VCenterVMSshInsecureHostKey
		out["hostKeyFingerprint"] = app.Cfg().VCenterVMSshHostKeyFingerprint
	}
	out["canConnect"] = cloudSSHReady(ctx, app.Cfg(), store, cloudKey, key, host)
	c.JSON(http.StatusOK, out)
}

func handlePutCloudHostSSHSettings(c *gin.Context, app *ServerApp) {
	store := app.SSHStore()
	if store == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未启用 SSH 存储（请设置 SSH_SETTINGS_BACKEND=file 与 SSH_SETTINGS_DIR，或按文档配置 Redis/MySQL）"})
		return
	}
	key, err := sshEncryptionKey(app.Cfg())
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "KUBEBT_ENCRYPTION_KEY: " + err.Error()})
		return
	}
	id := strings.TrimSpace(c.Param("id"))
	ch, err := getCloudHostByID(app, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	var body sshPutBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(body.User) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user 不能为空"})
		return
	}
	patch := &sshVMPutInput{
		User:               body.User,
		Password:           body.Password,
		PrivateKeyPEM:      body.PrivateKeyPEM,
		KeyPassphrase:      body.KeyPassphrase,
		Port:               body.Port,
		InsecureHostKey:    body.InsecureHostKey,
		HostKeyFingerprint: body.HostKeyFingerprint,
	}
	ctx := c.Request.Context()
	cloudKey := cloudHostSSHStorageKey(id)
	if err := store.PutVM(ctx, cloudKey, patch, key); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	label := ch.Name + "（" + id + "）"
	SetAuditDetail(c, "云主机 "+label+"：已更新 SSH 设置（用户 "+strings.TrimSpace(body.User)+"）")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleDeleteCloudHostSSHSettings(c *gin.Context, app *ServerApp) {
	store := app.SSHStore()
	if store == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未启用 SSH 存储"})
		return
	}
	id := strings.TrimSpace(c.Param("id"))
	ch, err := getCloudHostByID(app, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	cloudKey := cloudHostSSHStorageKey(id)
	if err := store.DeleteVM(c.Request.Context(), cloudKey); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	label := ch.Name + "（" + id + "）"
	SetAuditDetail(c, "云主机 "+label+"：已清除 SSH 凭据")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
