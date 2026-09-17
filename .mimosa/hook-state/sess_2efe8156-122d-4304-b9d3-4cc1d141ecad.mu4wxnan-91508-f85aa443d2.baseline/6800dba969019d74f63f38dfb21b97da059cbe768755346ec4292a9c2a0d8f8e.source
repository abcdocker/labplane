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
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

var execUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type terminalSizeQueue struct {
	ch chan *remotecommand.TerminalSize
}

func (q *terminalSizeQueue) Next() *remotecommand.TerminalSize {
	return <-q.ch
}

type wsBinaryWriter struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (w *wsBinaryWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	err := w.conn.WriteMessage(websocket.BinaryMessage, p)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

const k8sExecTTYTerm = "xterm-256color"

// wrapExecCommandWithTTYEnv 为单 argv 的交互 shell 注入 TERM/LC_ALL，使 clear、tput、Ctrl+L 等依赖 terminfo 的行为可用。
// 已是多参数 argv（如 redis-cli）时原样返回。
func wrapExecCommandWithTTYEnv(command []string) []string {
	if len(command) != 1 {
		return command
	}
	sh := strings.TrimSpace(command[0])
	if sh == "" {
		return command
	}
	q := sh
	if strings.ContainsAny(sh, ` '";&|()$`) {
		q = "'" + strings.ReplaceAll(sh, "'", `'"'"'`) + "'"
	}
	return []string{"/bin/sh", "-c", "export TERM=" + k8sExecTTYTerm + " LC_ALL=C.UTF-8; exec " + q}
}

// StreamK8sPodExecTTY 将 Pod exec（TTY）流式输出到 WebSocket；mergeStderr 为 true 时 stderr 与 stdout 合并（便于 redis-cli 等）。
func StreamK8sPodExecTTY(conn *websocket.Conn, k8s *kubernetes.Clientset, restCfg *rest.Config, ns, podName, container string, command []string, mergeStderr bool) error {
	stdinR, stdinW := io.Pipe()
	sizes := make(chan *remotecommand.TerminalSize, 64)
	sizes <- &remotecommand.TerminalSize{Width: 80, Height: 24}

	go func() {
		defer stdinW.Close()
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
					sizes <- &remotecommand.TerminalSize{Width: msg.Cols, Height: msg.Rows}
				}
				continue
			}
			if messageType == websocket.BinaryMessage && len(data) > 0 {
				_, _ = stdinW.Write(data)
			}
		}
	}()

	stdout := &wsBinaryWriter{conn: conn}
	stderrW := io.Writer(io.Discard)
	if mergeStderr {
		stderrW = stdout
	}

	execCmd := wrapExecCommandWithTTYEnv(command)

	req := k8s.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(podName).
		Namespace(ns).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: container,
			Command:   execCmd,
			Stdin:     true,
			Stdout:    true,
			Stderr:    true,
			TTY:       true,
		}, scheme.ParameterCodec)

	executor, err := remotecommand.NewSPDYExecutor(restCfg, "POST", req.URL())
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("无法创建 exec 连接: "+err.Error()))
		return err
	}

	err = executor.Stream(remotecommand.StreamOptions{
		Stdin:             stdinR,
		Stdout:            stdout,
		Stderr:            stderrW,
		Tty:               true,
		TerminalSizeQueue: &terminalSizeQueue{ch: sizes},
	})
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("\r\n[会话结束] "+err.Error()+"\r\n"))
	}
	return err
}

func handleK8sPodExecWS(c *gin.Context, k8s *kubernetes.Clientset, restCfg *rest.Config) {
	if !GuardK8sREST(c, k8s, restCfg) {
		return
	}
	ns := c.Param("namespace")
	name := c.Param("name")
	container := c.Query("container")
	shell := c.DefaultQuery("shell", "/bin/sh")
	if container == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 query: container"})
		return
	}

	conn, err := execUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket 升级失败: %v", err)
		return
	}
	defer conn.Close()

	_ = StreamK8sPodExecTTY(conn, k8s, restCfg, ns, name, container, []string{shell}, false)
}
