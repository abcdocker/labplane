package internal

import (
	"crypto/tls"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var idracVNCUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 8192,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// handleIdracVNCWS 把浏览器 WebSocket 转发到 iDRAC 的 VNC TCP 端口。
// 要求 runtime-config 中已配置 idracHost、idracVncPort、idracVncPassword（VNC 密码在 RFB 握手阶段由 noVNC 自行发送）。
func handleIdracVNCWS(c *gin.Context, app *ServerApp) {
	cfg := app.Cfg()
	host := strings.TrimSpace(cfg.IdracHost)
	if host == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "iDRAC 未配置"})
		return
	}
	port := cfg.IdracVncPort
	if port <= 0 {
		port = 5900
	}
	base, err := normalizeRedfishBase(host)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "iDRAC 地址无效: " + err.Error()})
		return
	}
	dialHost := base.Hostname()
	if dialHost == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "iDRAC 地址无效"})
		return
	}
	address := net.JoinHostPort(dialHost, strconv.Itoa(port))

	conn, err := idracVNCUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("idrac vnc: 浏览器 WebSocket 升级失败 error=%v", err)
		return
	}
	defer conn.Close()
	log.Printf("idrac vnc: 浏览器 WebSocket 已升级 host=%s port=%d", dialHost, port)

	conn.SetReadLimit(32 * 1024 * 1024)

	dialer := &net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}
	tcpConn, err := dialer.DialContext(c.Request.Context(), "tcp", address)
	if err != nil {
		log.Printf("idrac vnc: 连接 iDRAC VNC 失败 host=%s port=%d error=%v", dialHost, port, err)
		_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "连接 iDRAC VNC 失败"))
		return
	}
	defer tcpConn.Close()
	log.Printf("idrac vnc: iDRAC VNC TCP 已连接 host=%s port=%d", dialHost, port)

	// 如果目标端口是 5900 等明文 VNC，不做 TLS；若未来需要可扩展。
	_ = tls.Config{}

	errCh := make(chan error, 2)

	// 浏览器 WS -> iDRAC TCP
	go func() {
		for {
			mt, data, readErr := conn.ReadMessage()
			if readErr != nil {
				errCh <- fmt.Errorf("ws read: %w", readErr)
				return
			}
			if mt == websocket.CloseMessage {
				errCh <- fmt.Errorf("ws close")
				return
			}
			if mt != websocket.BinaryMessage {
				continue
			}
			if _, writeErr := tcpConn.Write(data); writeErr != nil {
				errCh <- fmt.Errorf("tcp write: %w", writeErr)
				return
			}
		}
	}()

	// iDRAC TCP -> 浏览器 WS
	go func() {
		buf := make([]byte, 32*1024)
		for {
			n, readErr := tcpConn.Read(buf)
			if readErr != nil {
				if readErr != io.EOF {
					errCh <- fmt.Errorf("tcp read: %w", readErr)
				} else {
					errCh <- fmt.Errorf("tcp eof")
				}
				return
			}
			if n == 0 {
				continue
			}
			if writeErr := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); writeErr != nil {
				errCh <- fmt.Errorf("ws write: %w", writeErr)
				return
			}
		}
	}()

	relayErr := <-errCh
	log.Printf("idrac vnc: 会话结束 host=%s port=%d error=%v", dialHost, port, relayErr)
	_ = conn.Close()
	_ = tcpConn.Close()
}
