package internal

// 全局模块显隐配置：管理员控制左侧菜单哪些模块对所有用户可见。
// 存储在 PlatformKV（Redis 热层），键: labplane_module_visibility_v1。

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
)

const kvKeyModuleVisibility = "labplane_module_visibility_v1"

func loadModuleVisibility(kv PlatformKV) map[string]bool {
	out := map[string]bool{}
	if kv == nil {
		return out
	}
	raw, ok := kv.Get(kvKeyModuleVisibility)
	if !ok || raw == "" {
		return out
	}
	var m struct {
		Items map[string]bool `json:"items"`
	}
	if json.Unmarshal([]byte(raw), &m) == nil && m.Items != nil {
		return m.Items
	}
	return out
}

func saveModuleVisibility(kv PlatformKV, items map[string]bool) {
	if kv == nil {
		return
	}
	js, err := json.Marshal(struct {
		Items map[string]bool `json:"items"`
	}{Items: items})
	if err != nil {
		return
	}
	kv.Set(kvKeyModuleVisibility, string(js))
}

// IsModuleVisible 检查指定模块是否可见（未配置时默认可见）。
func IsModuleVisible(kv PlatformKV, module string) bool {
	items := loadModuleVisibility(kv)
	v, ok := items[module]
	return !ok || v
}

// ── API Handlers ──

func handleModuleVisibilityGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		items := loadModuleVisibility(app.PlatformKV())
		c.JSON(http.StatusOK, gin.H{"modules": items})
	}
}

func handleModuleVisibilityPut(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body map[string]bool
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		saveModuleVisibility(app.PlatformKV(), body)
		c.JSON(http.StatusOK, gin.H{"message": "已保存"})
	}
}
