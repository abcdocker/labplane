package internal

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var redisRuntimeWSUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 8192,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

const (
	redisRuntimeWSMinInterval = 200 * time.Millisecond
	redisRuntimeWSMaxInterval = 10 * time.Second
	redisRuntimeWSDefInterval = 500 * time.Millisecond
)

// handleAppRedisRuntimeWS WebSocket 推送 Redis 运行快照（与 GET /runtime 同源数据），默认约 500ms 一轮；客户端可发 JSON {"intervalMs":500} 调整（200～10000ms）。
func handleAppRedisRuntimeWS(c *gin.Context, app *ServerApp) {
	idStr := strings.TrimSpace(c.Query("instanceId"))
	if idStr == "" {
		idStr = strings.TrimSpace(c.Query("id"))
	}
	if idStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少查询参数 instanceId 或 id"})
		return
	}
	id, perr := strconv.ParseInt(idStr, 10, 64)
	if perr != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 instanceId"})
		return
	}

	interval := redisRuntimeWSDefInterval
	if v := strings.TrimSpace(c.Query("intervalMs")); v != "" {
		if ms, e := strconv.Atoi(v); e == nil && ms > 0 {
			interval = time.Duration(ms) * time.Millisecond
			if interval < redisRuntimeWSMinInterval {
				interval = redisRuntimeWSMinInterval
			}
			if interval > redisRuntimeWSMaxInterval {
				interval = redisRuntimeWSMaxInterval
			}
		}
	}

	conn, err := redisRuntimeWSUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("app-center redis runtime/ws 升级失败: %v", err)
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	ctxLoad, cancelLoad := context.WithTimeout(ctx, 15*time.Second)
	st, err := loadStoredForIDIfVisible(ctxLoad, c, app, id)
	cancelLoad()
	if err != nil {
		h := gin.H{"kind": "load"}
		if errors.Is(err, sql.ErrNoRows) {
			h["error"] = "实例不存在或已删除"
			h["code"] = "not_found"
		} else {
			h["error"] = err.Error()
			h["code"] = "load"
		}
		b, _ := json.Marshal(h)
		_ = conn.WriteMessage(websocket.TextMessage, b)
		return
	}
	rdb, closeFn, err := openAppRedisClient(ctx, app.Cfg(), st)
	if err != nil {
		_, h := mapRedisError(err)
		h["kind"] = "open"
		b, _ := json.Marshal(h)
		_ = conn.WriteMessage(websocket.TextMessage, b)
		return
	}
	defer closeFn()

	var mu sync.Mutex
	curInterval := interval

	push := func() {
		snap, err := AppRedisRuntimeSnapshot(ctx, rdb)
		if err != nil {
			_, h := mapRedisError(err)
			h["kind"] = "snapshot"
			b, e := json.Marshal(h)
			if e != nil {
				return
			}
			_ = conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
			_ = conn.WriteMessage(websocket.TextMessage, b)
			return
		}
		b, err := json.Marshal(snap)
		if err != nil {
			return
		}
		_ = conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
		if err := conn.WriteMessage(websocket.TextMessage, b); err != nil {
			cancel()
		}
	}

	// 首包立即推送
	push()

	go func() {
		for {
			mu.Lock()
			d := curInterval
			mu.Unlock()
			select {
			case <-ctx.Done():
				return
			case <-time.After(d):
				push()
			}
		}
	}()

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			cancel()
			return
		}
		var msg struct {
			IntervalMs *int `json:"intervalMs"`
		}
		if json.Unmarshal(data, &msg) != nil || msg.IntervalMs == nil {
			continue
		}
		ms := *msg.IntervalMs
		if ms < int(redisRuntimeWSMinInterval/time.Millisecond) {
			ms = int(redisRuntimeWSMinInterval / time.Millisecond)
		}
		if ms > int(redisRuntimeWSMaxInterval/time.Millisecond) {
			ms = int(redisRuntimeWSMaxInterval / time.Millisecond)
		}
		mu.Lock()
		curInterval = time.Duration(ms) * time.Millisecond
		mu.Unlock()
	}
}
