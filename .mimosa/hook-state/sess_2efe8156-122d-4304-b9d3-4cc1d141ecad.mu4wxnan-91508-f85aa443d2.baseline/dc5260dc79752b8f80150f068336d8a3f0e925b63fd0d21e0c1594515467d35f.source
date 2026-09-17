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
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

func sshDialRetriable(addr string, sshCfg *ssh.ClientConfig) (*ssh.Client, error) {
	var lastErr error
	for attempt := 0; attempt < 8; attempt++ {
		if attempt > 0 {
			time.Sleep(2 * time.Second)
		}
		c, err := ssh.Dial("tcp", addr, sshCfg)
		if err == nil {
			return c, nil
		}
		lastErr = err
		s := err.Error()
		if !strings.Contains(s, "EOF") && !strings.Contains(s, "connection refused") &&
			!strings.Contains(s, "reset by peer") && !strings.Contains(s, "broken pipe") {
			break
		}
	}
	return nil, lastErr
}

// resolveCloudVMSSHAddr 平台 SSH 默认走「节点 IP + NodePort」；当控制台进程跑在集群内时，该路径常失败（外网 IP hairpin、节点不可达等），而 kubectl exec 仍正常。
// 若在集群内且可读 Service，则优先使用 ClusterIP:ServicePort（与 Pod 内 sshd 相同，不经 NodePort），与 exec 的网络语义更接近。
// 设 KUBEBT_CLOUD_VM_SSH_USE_CLUSTERIP=0 可强制始终用 NodeIP:NodePort。
func resolveCloudVMSSHAddr(ctx context.Context, k8s *kubernetes.Clientset, ns string, st *CloudVMStored) (addr string, via string, err error) {
	if k8s != nil && os.Getenv("KUBEBT_CLOUD_VM_SSH_USE_CLUSTERIP") != "0" && strings.TrimSpace(os.Getenv("KUBERNETES_SERVICE_HOST")) != "" && strings.TrimSpace(st.ServiceName) != "" {
		svc, e := k8s.CoreV1().Services(ns).Get(ctx, st.ServiceName, metav1.GetOptions{})
		if e == nil && svc.Spec.ClusterIP != "" && svc.Spec.ClusterIP != "None" {
			port := cloudVMSSHPort
			for _, p := range svc.Spec.Ports {
				if p.Name == "ssh" || p.Port == cloudVMSSHPort {
					port = p.Port
					break
				}
			}
			return net.JoinHostPort(svc.Spec.ClusterIP, strconv.Itoa(int(port))), "clusterip", nil
		}
		if e != nil {
			log.Printf("cloud-vm ssh: 读 Service %s/%s 失败，回退 NodePort: %v", ns, st.ServiceName, e)
		}
	}
	if strings.TrimSpace(st.NodeAccessIP) == "" || st.SSHPort <= 0 {
		return "", "", fmt.Errorf("节点 IP 或 NodePort 未就绪")
	}
	return net.JoinHostPort(st.NodeAccessIP, strconv.Itoa(int(st.SSHPort))), "nodeport", nil
}

func handleCloudVMSSHWS(c *gin.Context, app *ServerApp) {
	if app.K8s() == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "K8s 未连接"})
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 id"})
		return
	}
	db := cloudVMDB(app)
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "需要 MySQL"})
		return
	}
	var cfgj, ns string
	err = db.QueryRow(`SELECT namespace, config_json FROM kubebt_app_cloud_vm_instances WHERE id=?`, id).Scan(&ns, &cfgj)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "不存在"})
		return
	}
	var st CloudVMStored
	if err := json.Unmarshal([]byte(cfgj), &st); err != nil {
		RespondAPIError500(c, "配置解析失败")
		return
	}
	rctx, rcancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
	readiness := computeCloudVMReadiness(rctx, app.K8s(), ns, st.DeploymentName)
	rcancel()
	if r, ok := readiness["ready"].(bool); !ok || !r {
		msg := "Pod/SSH 尚未就绪"
		if m, ok := readiness["message"].(string); ok && strings.TrimSpace(m) != "" {
			msg = m
		}
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": msg, "readiness": readiness})
		return
	}
	dctx, dcancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	addr, via, err := resolveCloudVMSSHAddr(dctx, app.K8s(), ns, &st)
	dcancel()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	if via == "clusterip" {
		log.Printf("cloud-vm ssh: 实例 %d 使用 Service ClusterIP 连接（集群内控制台）", id)
	}

	clientIP := c.ClientIP()
	platformUser := dashboardUsernameFromGin(c)
	if strings.TrimSpace(platformUser) == "" {
		platformUser = "unknown"
	}
	podName, _ := readiness["podName"].(string)

	conn, err := execUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("cloud-vm ssh: WebSocket 升级失败 id=%d: %v", id, err)
		return
	}
	defer conn.Close()

	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	mt, authRaw, err := conn.ReadMessage()
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("读取认证信息失败: "+err.Error()+"\r\n"))
		return
	}
	_ = conn.SetReadDeadline(time.Time{})
	if mt != websocket.TextMessage {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("首条消息须为文本 JSON：{\"type\":\"auth\",\"password\":\"...\"}\r\n"))
		return
	}

	var authMsg struct {
		Type          string `json:"type"`
		Password      string `json:"password"`
		CaptchaID     string `json:"captchaId"`
		CaptchaAnswer string `json:"captchaAnswer"`
	}
	if err := json.Unmarshal(authRaw, &authMsg); err != nil || strings.TrimSpace(authMsg.Type) != "auth" {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("首条消息须为 JSON：{\"type\":\"auth\",\"password\":\"...\"}；Web SSH 必须填写 root 密码。\r\n"))
		return
	}
	fc := getCloudVMSSHFailCount(id, platformUser, clientIP)
	if fc >= cloudVMSSHMaxFailsBeforeCaptcha {
		if !validateCloudVMSSHCaptcha(id, authMsg.CaptchaID, authMsg.CaptchaAnswer) {
			writeCloudVMSSHAuthError(conn, "CAPTCHA_INVALID", "已连续多次密码错误，请完成验证码后重试", fc >= cloudVMSSHMaxFailsBeforeCaptcha, fc)
			return
		}
	}
	pw := strings.TrimSpace(authMsg.Password)
	if pw == "" {
		key, kerr := sshEncryptionKey(app.Cfg())
		if kerr == nil {
			if p, e := decryptSecret(key, st.RootPasswordEnc); e == nil && strings.TrimSpace(p) != "" {
				pw = strings.TrimSpace(p)
			}
		}
	}
	if pw == "" {
		writeCloudVMSSHAuthError(conn, "PASSWORD_REQUIRED", "请输入 root 密码或在实例创建/重置时保存的 root 密码（需平台加密密钥可解密）", fc >= cloudVMSSHMaxFailsBeforeCaptcha, fc)
		return
	}

	sshCfg := &ssh.ClientConfig{
		User:            "root",
		Auth:            []ssh.AuthMethod{ssh.Password(pw)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         15 * time.Second,
	}

	sshClient, err := sshDialRetriable(addr, sshCfg)
	if err != nil {
		if isSSHAuthFailure(err) {
			n := incrCloudVMSSHFailCount(id, platformUser, clientIP)
			recordCloudVMSSHSecurityEvent(cloudVMSSHSecurityEvent{
				Namespace:    ns,
				PodName:      podName,
				InstanceID:   id,
				PlatformUser: platformUser,
				SSHUser:      "root",
				VisitorIP:    clientIP,
				PlatformIP:   inferPlatformIP(c),
				Message:      "SSH 密码错误",
			})
			writeCloudVMSSHAuthError(conn, "AUTH_FAILED", "SSH 密码错误", n >= cloudVMSSHMaxFailsBeforeCaptcha, n)
			return
		}
		hint := err.Error()
		if strings.Contains(hint, "EOF") || strings.Contains(hint, "refused") {
			hint += "（若 Pod 刚就绪，请稍候再试；首次启动会安装 openssh）"
		}
		viaHint := ""
		if via == "nodeport" {
			viaHint = "。提示：控制台若在集群内，可依赖自动走 ClusterIP；若仍失败请检查节点防火墙与 NodePort 范围。"
		}
		_ = conn.WriteMessage(websocket.TextMessage, []byte("SSH 连接 "+addr+" 失败: "+hint+viaHint+"\r\n"))
		return
	}
	clearCloudVMSSHFailCount(id, platformUser, clientIP)
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
	_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"ssh_ready"}`))
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
