package internal

// AI 服务发现：确定性扫描（K8s Service 端口/名称特征、Prometheus 指标存在性、
// vCenter 资产、VictoriaLogs 就绪状态）→ 交由判读模型产出"可纳管服务报告"，
// 支持将 AI 生成的巡检剧本建议一键写入 dataDir/inspect_playbooks/。

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"gopkg.in/yaml.v3"
)

type aiDiscoveredService struct {
	Namespace     string `json:"namespace"`
	Name          string `json:"name"`
	Family        string `json:"family"`
	ServiceType   string `json:"serviceType"`
	Ports         string `json:"ports"`
	ReadyEndpoint int    `json:"readyEndpoints"`
}

type aiDiscoverInventory struct {
	Prometheus     map[string]int         `json:"prometheusFamilies"`
	VictoriaLogs   bool                   `json:"victoriaLogsConfigured"`
	Services       []aiDiscoveredService  `json:"services"`
	VCenter        map[string]any         `json:"vcenter,omitempty"`
	PlaybookFiles  []string               `json:"existingPlaybooks"`
}

// aiDiscoverServiceFamily 按端口与名称特征归类服务家族。
func aiDiscoverServiceFamily(name string, ports []int) string {
	lower := strings.ToLower(name)
	match := func(f string) bool { return strings.Contains(lower, f) }
	switch {
	case match("redis"):
		return "redis"
	case match("mysql") || match("mariadb"):
		return "mysql"
	case match("kafka"):
		return "kafka"
	case match("opensearch") || match("elastic"):
		return "elasticsearch"
	case match("mongo"):
		return "mongodb"
	case match("rabbit"):
		return "rabbitmq"
	case match("minio"):
		return "minio"
	case match("postgres"):
		return "postgres"
	case match("nginx") || match("traefik") || match("ingress"):
		return "web"
	}
	for _, p := range ports {
		switch p {
		case 6379, 9121:
			return "redis"
		case 3306, 9104:
			return "mysql"
		case 9092:
			return "kafka"
		case 9200, 9300:
			return "elasticsearch"
		case 27017:
			return "mongodb"
		case 5672:
			return "rabbitmq"
		case 9000:
			return "minio"
		case 5432:
			return "postgres"
		}
	}
	return ""
}

func aiDiscoverCollectK8s(app *ServerApp, inv *aiDiscoverInventory) error {
	if app.K8s() == nil {
		return fmt.Errorf("K8s 未连接")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	svcList, err := app.K8s().CoreV1().Services("").List(ctx, metav1.ListOptions{Limit: 300})
	if err != nil {
		return err
	}
	epList, _ := app.K8s().CoreV1().Endpoints("").List(ctx, metav1.ListOptions{Limit: 300})
	readyBySvc := map[string]int{}
	for _, ep := range epList.Items {
		n := 0
		for _, ss := range ep.Subsets {
			for _, a := range ss.Addresses {
				if a.IP != "" {
					n++
				}
			}
		}
		readyBySvc[ep.Namespace+"/"+ep.Name] = n
	}
	for _, svc := range svcList.Items {
		ports := make([]int, 0, len(svc.Spec.Ports))
		portStrs := make([]string, 0, len(svc.Spec.Ports))
		for _, p := range svc.Spec.Ports {
			ports = append(ports, int(p.Port))
			portStrs = append(portStrs, fmt.Sprintf("%d/%s", p.Port, p.Protocol))
		}
		family := aiDiscoverServiceFamily(svc.Name, ports)
		if family == "" {
			for _, p := range svc.Spec.Ports {
				lp := strings.ToLower(p.Name)
				if strings.Contains(lp, "metric") || strings.Contains(lp, "exporter") {
					family = "metrics"
					break
				}
			}
		}
		if family == "" {
			continue // 仅保留可识别/可纳管特征的服务
		}
		inv.Services = append(inv.Services, aiDiscoveredService{
			Namespace:     svc.Namespace,
			Name:          svc.Name,
			Family:        family,
			ServiceType:   string(svc.Spec.Type),
			Ports:         strings.Join(portStrs, ","),
			ReadyEndpoint: readyBySvc[svc.Namespace+"/"+svc.Name],
		})
	}
	sort.Slice(inv.Services, func(i, j int) bool { return inv.Services[i].Namespace+inv.Services[i].Name < inv.Services[j].Namespace+inv.Services[j].Name })
	if len(inv.Services) > 40 {
		inv.Services = inv.Services[:40]
	}
	return nil
}

func aiDiscoverCollectPrometheus(app *ServerApp, inv *aiDiscoverInventory) {
	inv.Prometheus = map[string]int{}
	families := map[string]string{
		"redis":         `{__name__=~"^redis_.*"}`,
		"mysql":         `{__name__=~"^mysql_.*"}`,
		"kafka":         `{__name__=~"^kafka_.*"}`,
		"elasticsearch": `{__name__=~"^elasticsearch_.*"}`,
		"node":          `node_load5`,
		"mongo":         `{__name__=~"^mongodb_.*"}`,
	}
	for family, expr := range families {
		series, err := inspectPromInstantVector(app.Cfg(), "k8s", "count("+expr+")")
		if err != nil || len(series) == 0 {
			inv.Prometheus[family] = 0
			continue
		}
		inv.Prometheus[family] = int(series[0].Value)
	}
}

func aiDiscoverCollectVCenter(app *ServerApp, inv *aiDiscoverInventory) {
	if app.VCenter() == nil || !app.Cfg().vCenterConfigured() {
		inv.VCenter = map[string]any{"configured": false}
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	payload, _, _, err := vcenterVMListSnapshotBytes(ctx, app, false, false)
	if err != nil {
		inv.VCenter = map[string]any{"configured": true, "error": truncateErrMessage(err.Error(), 200)}
		return
	}
	var env struct {
		VMs []map[string]any `json:"vms"`
	}
	_ = json.Unmarshal(payload, &env)
	total, poweredOn := len(env.VMs), 0
	samples := make([]string, 0, 10)
	for _, vm := range env.VMs {
		name, power, ip := "", "", ""
		for k, v := range vm {
			lk := strings.ToLower(k)
			vs := fmt.Sprint(v)
			switch {
			case lk == "name" && name == "":
				name = vs
			case strings.Contains(lk, "power"):
				power = vs
			case (lk == "guestip" || lk == "ip") && ip == "":
				ip = vs
			}
		}
		if strings.Contains(strings.ToLower(power), "poweredon") || strings.EqualFold(power, "on") {
			poweredOn++
			if len(samples) < 10 && name != "" {
				entry := name
				if ip != "" && ip != "—" {
					entry += " (" + ip + ")"
				}
				samples = append(samples, entry)
			}
		}
	}
	inv.VCenter = map[string]any{
		"configured": true,
		"totalVMs":   total,
		"poweredOn":  poweredOn,
		"samples":    samples,
		"note":       "vCenter 清单来自平台缓存；ESXi/VM 层监控指标是否已接入 Prometheus 见 prometheusFamilies",
	}
}

const aiDiscoverSystemPrompt = `你是平台的服务发现顾问。用户提供了通过确定性采集得到的真实清单：K8s 服务（按端口/名称特征归类）、Prometheus 各指标家族的序列数、VictoriaLogs 配置状态、vCenter 资产摘要、已存在的巡检剧本文件。
请输出**单一 JSON 对象**（不要 Markdown 围栏外文字）：
{"summary_markdown":"中文发现报告（Markdown 表格：服务/命名空间/类型/指标覆盖/建议；再给出 Top 建议）","suggestions":[{"title":"建议标题","target":"service:redis:xxx 或 vm:host-01","reason":"判断依据（引用清单证据）","playbook_yaml":"完整 YAML 文本（可选；仅在值得新增巡检剧本时给出）"}]}
规则：
1) 只基于清单判断，不编造；prometheusFamilies 中为 0 表示该类指标未采集，应建议部署对应 exporter 而非编造结论。
2) playbook_yaml 必须严格符合以下 schema 与写法（示例片段）：
   name: redis-baseline（小写中划线）
   title: Redis 服务基线
   kind: service
   defaultScope: k8s
   steps:
     - id: rejected_conns（小写下划线）
       title: 近1h拒绝连接（中文）
       source: prometheus
       scope: k8s
       expr: increase(redis_rejected_connections_total[1h])   ← 只写指标表达式，禁止包含 > < >= <= == 等比较符
       warn: ">= 1"                                          ← 阈值必须放 warn/crit 字段
       crit: ">= 100"
   vmlog 步骤：source: vmlog、query: LogsQL 过滤（不含时间）、windowMinutes、groupBy、warn/crit 按命中条数。
   每个 step 必须有 id 与中文 title；阈值比较符只出现在 warn/crit。
3) 最多 3 条 suggestions，按价值排序；无值得新增的就不给 playbook_yaml。
4) summary_markdown 控制在 500 字内，先总结再表格。`

// handleOpsAIDiscover 执行服务发现并产出 AI 报告与剧本建议。
func handleOpsAIDiscover(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		bundle, err := loadOpsAIInspectBundle(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		ai := bundle.AI
		if !opsJudgeReady(ai) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "未启用内嵌 AI 判读模型：请在 AI 巡检配置中启用判读模型并填写 API Key"})
			return
		}
		inv := aiDiscoverInventory{VictoriaLogs: strings.TrimSpace(normalizeVictoriaLogsBase(effectiveVictoriaLogsURL(app.Runtime(), app.Cfg()))) != ""}
		if err := aiDiscoverCollectK8s(app, &inv); err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "K8s 服务扫描失败: " + err.Error()})
			return
		}
		aiDiscoverCollectPrometheus(app, &inv)
		aiDiscoverCollectVCenter(app, &inv)
		if files, err := os.ReadDir(filepath.Join(app.DataDir(), "inspect_playbooks")); err == nil {
			for _, f := range files {
				if !f.IsDir() && (strings.HasSuffix(f.Name(), ".yaml") || strings.HasSuffix(f.Name(), ".yml")) {
					inv.PlaybookFiles = append(inv.PlaybookFiles, f.Name())
				}
			}
		}

		invJSON, _ := json.Marshal(inv)
		userMsg := "以下是服务发现清单 JSON：\n" + string(invJSON) + "\n\n请按系统说明输出 JSON。"
		raw, _, err := opsInspectJudgeCall(app.PlatformKV(), app.Cfg(), ai, "discover", aiDiscoverSystemPrompt, userMsg, 0)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "inventory": inv})
			return
		}
		js := extractJSONObjectFromLLM(raw)
		if js == nil {
			c.JSON(http.StatusOK, gin.H{"inventory": inv, "ai": gin.H{"summary_markdown": strings.TrimSpace(raw), "rawModel": true}})
			return
		}
		var parsed struct {
			SummaryMarkdown string `json:"summary_markdown"`
			Suggestions     []struct {
				Title        string `json:"title"`
				Target       string `json:"target"`
				Reason       string `json:"reason"`
				PlaybookYAML string `json:"playbook_yaml"`
			} `json:"suggestions"`
		}
		if err := json.Unmarshal(js, &parsed); err != nil {
			c.JSON(http.StatusOK, gin.H{"inventory": inv, "ai": gin.H{"summary_markdown": strings.TrimSpace(raw), "rawModel": true}})
			return
		}
		c.JSON(http.StatusOK, gin.H{"inventory": inv, "ai": parsed})
	}
}

// handleOpsAIDiscoverApply 将 AI 建议的剧本写入 dataDir/inspect_playbooks/。
func handleOpsAIDiscoverApply(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body struct {
			Target string `json:"target"`
			YAML   string `json:"yaml"`
		}
		if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.YAML) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效：需要 yaml"})
			return
		}
		var pb InspectPlaybook
		if err := yaml.Unmarshal([]byte(body.YAML), &pb); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "YAML 解析失败: " + err.Error()})
			return
		}
		if strings.TrimSpace(pb.Name) == "" || len(pb.Steps) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "剧本缺少 name 或 steps"})
			return
		}
		if pb.Kind != "vm" && pb.Kind != "service" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "kind 仅支持 vm / service"})
			return
		}
		slug := strings.ToLower(strings.TrimSpace(pb.Name))
		if slug == "" {
			slug = strings.ToLower(strings.TrimSpace(body.Target))
		}
		slug = strings.NewReplacer(":", "-", "/", "-", " ", "-", "_", "-").Replace(slug)
		slug = strings.Map(func(r rune) rune {
			if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '.' {
				return r
			}
			return -1
		}, slug)
		slug = strings.Trim(slug, "-.")
		if slug == "" {
			slug = "suggestion"
		}
		slug = strings.ReplaceAll(slug, "_", "-")
		filename := "ai-discover-" + slug + ".yaml"
		if len(filename) > 120 {
			filename = filename[:120]
		}
		dir := filepath.Join(app.DataDir(), "inspect_playbooks")
		if err := os.MkdirAll(dir, 0o700); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		path := filepath.Join(dir, filename)
		if err := os.WriteFile(path, []byte(body.YAML), 0o600); err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		SetAuditDetail(c, "AI 服务发现：已采纳剧本 "+filename+"（kind="+pb.Kind+"，steps="+fmt.Sprint(len(pb.Steps))+"）")
		c.JSON(http.StatusOK, gin.H{"message": "剧本已保存", "file": path, "name": pb.Name})
	}
}
