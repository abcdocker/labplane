package internal

// 堡垒机 RustDesk 主机清单：供侧栏展示与一键唤起（rustdesk:// 深链）。
// 连接密码不落平台（由目标主机永久密码/用户手工输入保障），故所有堡垒机用户可见。

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// handleGetBastionRustDeskHosts GET /api/vcenter/bastion/rustdesk
// 返回策略中的 RustDesk 主机清单（id/name/rustdeskId/note），供全部堡垒机用户侧栏展示。
func handleGetBastionRustDeskHosts(c *gin.Context, app *ServerApp) {
	pol := loadVCenterBastionPolicy(app.PlatformKV())
	hosts := pol.RustDeskHosts
	if hosts == nil {
		hosts = []BastionRustDeskHost{}
	}
	c.JSON(http.StatusOK, gin.H{"hosts": hosts})
}
