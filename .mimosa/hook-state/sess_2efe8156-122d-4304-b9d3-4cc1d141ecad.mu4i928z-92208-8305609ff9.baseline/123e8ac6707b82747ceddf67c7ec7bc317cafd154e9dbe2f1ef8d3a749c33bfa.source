package internal

import (
	"time"

	"github.com/gorilla/websocket"
)

const wsBastionPongWait = 2 * time.Hour
const wsBastionPingPeriod = 25 * time.Second

// startWebSocketBastionKeepalive 对浏览器侧 WebSocket 定时 Ping，并以 Pong 续期读超时（约 2 小时），减轻反向代理空闲断开。
func startWebSocketBastionKeepalive(conn *websocket.Conn, done <-chan struct{}) {
	_ = conn.SetReadDeadline(time.Now().Add(wsBastionPongWait))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(wsBastionPongWait))
		return nil
	})
	go func() {
		t := time.NewTicker(wsBastionPingPeriod)
		defer t.Stop()
		for {
			select {
			case <-done:
				return
			case <-t.C:
				_ = conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(10*time.Second))
			}
		}
	}()
}
