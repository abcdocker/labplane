package internal

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	vmShipperPresetBaotaNginx = "baota-nginx"
	vmShipperPresetBaotaMysql = "baota-mysql"
	vmShipperPresetBaotaRedis = "baota-redis"
	vmShipperPresetSystem     = "system-common"
	vmShipperPresetDocker     = "docker"
	vmShipperPresetJava       = "java"
	vmShipperPresetCustom     = "custom"
)

// vmLogCollectorProfile 是新增主机日志接入的唯一注册点。
// 新系统通常只需在 vmLogCollectorProfiles 中增加一项；API 和前端会自动出现。
type vmLogCollectorProfile struct {
	ID           string   `json:"id"`
	Label        string   `json:"label"`
	Description  string   `json:"description"`
	DefaultPaths []string `json:"defaultPaths"`
	LogSource    string   `json:"logSource"`
	QuerySource  string   `json:"querySource"`
	Custom       bool     `json:"custom,omitempty"`
}

type vmLogSearchField struct {
	ID       string   `json:"id"`
	Label    string   `json:"label"`
	Group    string   `json:"group"`
	Datasets []string `json:"datasets,omitempty"`
}

func vmLogSearchFields() []vmLogSearchField {
	return []vmLogSearchField{
		{ID: "any", Label: "全部字段", Group: "常用"},
		{ID: "_msg", Label: "日志消息", Group: "常用"},
		{ID: "log_source", Label: "日志来源", Group: "常用"},
		{ID: "vm_host", Label: "虚拟机 / 主机", Group: "主机", Datasets: []string{"virtual_machine"}},
		{ID: "host", Label: "主机名", Group: "主机"},
		{ID: "filename", Label: "日志文件", Group: "主机"},
		{ID: "namespace", Label: "命名空间", Group: "容器", Datasets: []string{"container"}},
		{ID: "pod", Label: "Pod", Group: "容器", Datasets: []string{"container"}},
		{ID: "job", Label: "任务 / Job", Group: "运行时"},
		{ID: "stream", Label: "输出流", Group: "运行时"},
		{ID: "__custom__", Label: "自定义字段…", Group: "高级"},
	}
}

func vmLogCollectorProfiles() []vmLogCollectorProfile {
	return []vmLogCollectorProfile{
		{
			ID:           vmShipperPresetBaotaNginx,
			Label:        "宝塔 / Nginx",
			Description:  "采集宝塔站点访问与错误日志",
			DefaultPaths: []string{"/www/wwwlogs/*.log"},
			LogSource:    "baota-nginx",
			QuerySource:  "nginx",
		},
		{
			ID:           vmShipperPresetBaotaMysql,
			Label:        "宝塔 / MySQL",
			Description:  "采集 MySQL 错误日志",
			DefaultPaths: []string{"/www/server/data/*.err", "/var/log/mysqld.log", "/var/log/mysql/error.log"},
			LogSource:    "baota-mysql",
			QuerySource:  "appcenter",
		},
		{
			ID:           vmShipperPresetBaotaRedis,
			Label:        "宝塔 / Redis",
			Description:  "采集 Redis 服务日志",
			DefaultPaths: []string{"/www/server/redis/*.log", "/var/log/redis/redis-server.log"},
			LogSource:    "baota-redis",
			QuerySource:  "appcenter",
		},
		{
			ID:          vmShipperPresetSystem,
			Label:       "Linux 系统",
			Description: "兼容 CentOS、RHEL、Ubuntu 与 Debian 的常见系统日志",
			DefaultPaths: []string{
				"/var/log/messages",
				"/var/log/secure",
				"/var/log/syslog",
				"/var/log/auth.log",
				"/var/log/kern.log",
				"/var/log/cloud-init.log",
				"/var/log/cloud-init-output.log",
			},
			LogSource:   "system-common",
			QuerySource: "vcenter",
		},
		{
			ID:           vmShipperPresetDocker,
			Label:        "Docker 容器",
			Description:  "采集 Docker json-file 驱动产生的容器日志",
			DefaultPaths: []string{"/var/lib/docker/containers/*/*.log"},
			LogSource:    "docker",
			QuerySource:  "appcenter",
		},
		{
			ID:           vmShipperPresetJava,
			Label:        "Java 应用",
			Description:  "常见应用目录下的滚动日志；可追加实际部署路径",
			DefaultPaths: []string{"/opt/*/logs/*.log", "/data/*/logs/*.log"},
			LogSource:    "java-app",
			QuerySource:  "appcenter",
		},
		{
			ID:          vmShipperPresetCustom,
			Label:       "自定义",
			Description: "每行填写一个绝对路径，支持 * 通配符",
			LogSource:   "custom",
			QuerySource: "all",
			Custom:      true,
		},
	}
}

func vmLogCollectorProfileByID(id string) (vmLogCollectorProfile, bool) {
	id = strings.TrimSpace(id)
	for _, profile := range vmLogCollectorProfiles() {
		if profile.ID == id {
			return profile, true
		}
	}
	return vmLogCollectorProfile{}, false
}

func vmShipperPresetPaths(preset string) []string {
	profile, ok := vmLogCollectorProfileByID(preset)
	if !ok || profile.Custom {
		return nil
	}
	return append([]string(nil), profile.DefaultPaths...)
}

func vmShipperDefaultSystemPaths() []string {
	profile, ok := vmLogCollectorProfileByID(vmShipperPresetSystem)
	if !ok {
		return nil
	}
	return append([]string(nil), profile.DefaultPaths...)
}

func handleOpsVmLogSources() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"collectorProfiles": vmLogCollectorProfiles(),
			"querySources": []gin.H{
				{"id": "all", "label": "全部日志", "description": "跨全部数据源检索"},
				{"id": "container", "label": "容器日志", "description": "Kubernetes Pod 与容器 stdout/stderr"},
				{"id": "virtual_machine", "label": "虚拟机日志", "description": "Vector 采集的 Linux、宝塔与 vCenter 主机日志"},
				{"id": "nginx", "label": "访问日志", "description": "Nginx、Ingress 与站点访问日志"},
				{"id": "application", "label": "应用日志", "description": "Redis、Java、OpenClaw 等应用服务"},
				{"id": "aiinspect", "label": "监控巡检", "description": "Prometheus、Grafana、告警与巡检日志"},
				{"id": "platform", "label": "平台日志", "description": "登录、审计、会话与平台服务日志"},
			},
			"searchFields": vmLogSearchFields(),
			"contract": gin.H{
				"messageField": "_msg",
				"timeField":    "_time",
				"streamFields": []string{"vm_host", "log_source"},
				"insertPath":   "/insert/jsonline",
			},
		})
	}
}
