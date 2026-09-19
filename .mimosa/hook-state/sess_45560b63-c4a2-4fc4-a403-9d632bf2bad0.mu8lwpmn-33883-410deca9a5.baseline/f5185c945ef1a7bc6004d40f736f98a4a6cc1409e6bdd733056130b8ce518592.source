package internal

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gopkg.in/yaml.v3"
)

// handlePrometheusConfigYAMLValidate POST /api/prometheus/validate-config-yaml
// 仅做 YAML 语法解析（用于 ConfigMap 中 prometheus 配置等保存前自检）。
func handlePrometheusConfigYAMLValidate(c *gin.Context) {
	var body struct {
		YAML string `json:"yaml"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": "请求体须为 JSON：{ \"yaml\": \"...\" }"})
		return
	}
	s := strings.TrimSpace(body.YAML)
	if s == "" {
		c.JSON(http.StatusOK, gin.H{"ok": true, "message": "empty"})
		return
	}
	var v interface{}
	if err := yaml.Unmarshal([]byte(s), &v); err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
