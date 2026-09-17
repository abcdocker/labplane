package internal

// AI 助手会话持久化：多会话存储在 PlatformKV（MySQL），支持新建/切换/删除。

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const kvKeyAIAssistantSessions = "kubebt_ai_assistant_sessions_v1"

type AIAssistantMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type AIAssistantSession struct {
	ID        string               `json:"id"`
	Title     string               `json:"title"`
	CreatedAt string               `json:"createdAt"`
	UpdatedAt string               `json:"updatedAt"`
	Messages  []AIAssistantMessage `json:"messages"`
}

func loadAIAssistantSessions(kv PlatformKV) []AIAssistantSession {
	raw, ok := kv.Get(kvKeyAIAssistantSessions)
	if !ok || strings.TrimSpace(raw) == "" {
		return nil
	}
	var out []AIAssistantSession
	_ = json.Unmarshal([]byte(raw), &out)
	return out
}

func saveAIAssistantSessions(kv PlatformKV, sessions []AIAssistantSession) {
	js, _ := json.Marshal(sessions)
	_ = kv.Set(kvKeyAIAssistantSessions, string(js))
}

func handleAIAssistantSessionList(c *gin.Context, app *ServerApp) {
	sessions := loadAIAssistantSessions(app.PlatformKV())
	sort.Slice(sessions, func(i, j int) bool { return sessions[i].UpdatedAt > sessions[j].UpdatedAt })
	type item struct {
		ID        string `json:"id"`
		Title     string `json:"title"`
		UpdatedAt string `json:"updatedAt"`
		MsgCount  int    `json:"msgCount"`
	}
	out := make([]item, 0, len(sessions))
	for _, s := range sessions {
		out = append(out, item{ID: s.ID, Title: s.Title, UpdatedAt: s.UpdatedAt, MsgCount: len(s.Messages)})
	}
	c.JSON(http.StatusOK, gin.H{"sessions": out})
}

func handleAIAssistantSessionGet(c *gin.Context, app *ServerApp) {
	id := c.Param("id")
	for _, s := range loadAIAssistantSessions(app.PlatformKV()) {
		if s.ID == id {
			c.JSON(http.StatusOK, s)
			return
		}
	}
	c.JSON(http.StatusNotFound, gin.H{"error": "会话不存在"})
}

func handleAIAssistantSessionSave(c *gin.Context, app *ServerApp) {
	var body AIAssistantSession
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
		return
	}
	if body.ID == "" {
		body.ID = fmt.Sprintf("sess-%d", time.Now().UnixNano())
	}
	if body.CreatedAt == "" {
		body.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	body.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if body.Title == "" {
		for _, m := range body.Messages {
			if m.Role == "user" {
				body.Title = truncateErrMessage(m.Content, 40)
				break
			}
		}
	}
	sessions := loadAIAssistantSessions(app.PlatformKV())
	replaced := false
	for i, s := range sessions {
		if s.ID == body.ID {
			sessions[i] = body
			replaced = true
			break
		}
	}
	if !replaced {
		sessions = append(sessions, body)
	}
	sort.Slice(sessions, func(i, j int) bool { return sessions[i].UpdatedAt > sessions[j].UpdatedAt })
	if len(sessions) > 50 {
		sessions = sessions[:50]
	}
	saveAIAssistantSessions(app.PlatformKV(), sessions)
	c.JSON(http.StatusOK, gin.H{"id": body.ID, "title": body.Title})
}

func handleAIAssistantSessionDelete(c *gin.Context, app *ServerApp) {
	id := c.Param("id")
	sessions := loadAIAssistantSessions(app.PlatformKV())
	out := sessions[:0]
	for _, s := range sessions {
		if s.ID != id {
			out = append(out, s)
		}
	}
	saveAIAssistantSessions(app.PlatformKV(), out)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
