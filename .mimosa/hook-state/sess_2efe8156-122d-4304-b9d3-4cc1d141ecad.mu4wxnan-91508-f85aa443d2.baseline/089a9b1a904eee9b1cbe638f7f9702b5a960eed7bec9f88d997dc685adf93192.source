package internal

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const cloudHostsKVKey = "cloud_hosts_v1"

// CloudHost 非 vCenter 的公有云 / 裸金属主机；监控仅依赖 Prometheus（node_exporter），instance 与 SSH 地址一致，一般为 IP:9100。
type CloudHost struct {
	ID                    string `json:"id"`
	Name                  string `json:"name"`
	SSHHost               string `json:"sshHost"`
	SSHPort               int    `json:"sshPort"`
	SSHUser               string `json:"sshUser"`
	SSHHostKeyFingerprint string `json:"sshHostKeyFingerprint,omitempty"`
	NodeExporterInstance  string `json:"nodeExporterInstance,omitempty"` // 已废弃，保留兼容旧数据
	Comment               string `json:"comment,omitempty"`
}

func escapePromQLLabelValue(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return s
}

// cloudPrometheusInstanceLabel 与 Prometheus 中 node_exporter 的 instance 对齐：{sshHost}:9100（sshHost 通常为云主机 IP）。
func cloudPrometheusInstanceLabel(h CloudHost) string {
	host := strings.TrimSpace(h.SSHHost)
	if host == "" {
		return ""
	}
	return host + ":9100"
}

func loadCloudHosts(app *ServerApp) ([]CloudHost, error) {
	kv := app.PlatformKV()
	if kv == nil {
		return nil, errors.New("platform_kv 不可用（数据目录未就绪）")
	}
	raw, ok := kv.Get(cloudHostsKVKey)
	if !ok || strings.TrimSpace(raw) == "" {
		return []CloudHost{}, nil
	}
	var hosts []CloudHost
	if err := json.Unmarshal([]byte(raw), &hosts); err != nil {
		return nil, err
	}
	return hosts, nil
}

func saveCloudHosts(app *ServerApp, hosts []CloudHost) error {
	kv := app.PlatformKV()
	if kv == nil {
		return errors.New("platform_kv 不可用")
	}
	b, err := json.MarshalIndent(hosts, "", "  ")
	if err != nil {
		return err
	}
	if err := kv.Set(cloudHostsKVKey, string(b)); err != nil {
		return err
	}
	cfg := app.Cfg()
	if cfg.RuntimeDualWriteRedis {
		if rdb := app.Redis(); rdb != nil {
			mctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
			defer cancel()
			_ = MirrorPlatformKVToRedis(mctx, rdb, cfg, kv.Snapshot())
		}
	}
	return nil
}

func findCloudHostIndex(hosts []CloudHost, id string) int {
	for i, h := range hosts {
		if h.ID == id {
			return i
		}
	}
	return -1
}

func cloudHostAuditDiff(prev, next CloudHost, credentialUpdated bool) string {
	var parts []string
	if prev.Name != next.Name {
		parts = append(parts, fmt.Sprintf("名称 %q→%q", prev.Name, next.Name))
	}
	if prev.SSHHost != next.SSHHost {
		parts = append(parts, fmt.Sprintf("地址 %q→%q", prev.SSHHost, next.SSHHost))
	}
	if prev.SSHPort != next.SSHPort {
		parts = append(parts, fmt.Sprintf("端口 %d→%d", prev.SSHPort, next.SSHPort))
	}
	if prev.SSHUser != next.SSHUser {
		parts = append(parts, fmt.Sprintf("SSH 用户 %q→%q", prev.SSHUser, next.SSHUser))
	}
	if strings.TrimSpace(prev.Comment) != strings.TrimSpace(next.Comment) {
		parts = append(parts, "备注已更新")
	}
	if credentialUpdated {
		parts = append(parts, "SSH 凭据已更新")
	}
	if len(parts) == 0 {
		return "字段未变（或仅重试连接校验）"
	}
	return strings.Join(parts, "；")
}

func handleCloudHostsList(c *gin.Context, app *ServerApp) {
	hosts, err := loadCloudHosts(app)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"hosts": hosts})
}

type cloudHostBody struct {
	Name                  string `json:"name"`
	SSHHost               string `json:"sshHost"`
	SSHPort               int    `json:"sshPort"`
	SSHUser               string `json:"sshUser"`
	SSHHostKeyFingerprint string `json:"sshHostKeyFingerprint"`
	Comment               string `json:"comment"`
	SSHPassword           string `json:"sshPassword"`
	SSHPrivateKeyPEM      string `json:"sshPrivateKeyPem"`
}

func persistCloudHostSSHIfAny(ctx context.Context, app *ServerApp, host CloudHost, password, pem string) error {
	pw := strings.TrimSpace(password)
	pk := strings.TrimSpace(pem)
	if pw == "" && pk == "" {
		return nil
	}
	store := app.SSHStore()
	if store == nil {
		return fmt.Errorf("未启用 SSH 存储，无法保存密码或私钥（请配置 SSH_SETTINGS_BACKEND 与 KUBEBT_ENCRYPTION_KEY）")
	}
	key, err := sshEncryptionKey(app.Cfg())
	if err != nil {
		return err
	}
	cloudKey := cloudHostSSHStorageKey(host.ID)
	insecure := app.Cfg().VCenterVMSshInsecureHostKey
	fingerprint := strings.TrimSpace(host.SSHHostKeyFingerprint)
	if fingerprint == "" {
		fingerprint = app.Cfg().VCenterVMSshHostKeyFingerprint
	}
	port := host.SSHPort
	if port <= 0 {
		port = 22
	}
	patch := &sshVMPutInput{
		User:               strings.TrimSpace(host.SSHUser),
		InsecureHostKey:    &insecure,
		HostKeyFingerprint: &fingerprint,
		Port:               &port,
	}
	if pw != "" {
		patch.Password = &pw
	}
	if pk != "" {
		patch.PrivateKeyPEM = &pk
	}
	return store.PutVM(ctx, cloudKey, patch, key)
}

func handleCloudHostsCreate(c *gin.Context, app *ServerApp) {
	var body cloudHostBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求 JSON 无效: " + err.Error()})
		return
	}
	if strings.TrimSpace(body.Name) == "" || strings.TrimSpace(body.SSHHost) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name 与 sshHost 必填"})
		return
	}
	port := body.SSHPort
	if port <= 0 {
		port = 22
	}
	if port > 65535 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sshPort 无效"})
		return
	}
	cfg := app.Cfg()
	ctx := c.Request.Context()
	key, _ := sshEncryptionKey(cfg)
	store := app.SSHStore()
	h := CloudHost{
		ID:                    uuid.NewString(),
		Name:                  strings.TrimSpace(body.Name),
		SSHHost:               strings.TrimSpace(body.SSHHost),
		SSHPort:               port,
		SSHUser:               strings.TrimSpace(body.SSHUser),
		SSHHostKeyFingerprint: normalizeSSHHostKeyFingerprint(body.SSHHostKeyFingerprint),
		Comment:               strings.TrimSpace(body.Comment),
	}
	cloudKey := cloudHostSSHStorageKey(h.ID)
	if !cloudHostSSHCanDial(ctx, cfg, store, cloudKey, key, &h, body.SSHPassword, body.SSHPrivateKeyPEM) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无法校验 SSH：新增主机须填写「SSH 密码」或「私钥 PEM」；或在运行时配置中设置全局 VCENTER_VM_SSH_USER 及密码或私钥路径。仅配置 KUBEBT_ENCRYPTION_KEY/SSH 存储不会自动提供登录凭据。"})
		return
	}
	if err := trySSHDialCloudHost(ctx, cfg, store, cloudKey, key, &h, body.SSHPassword, body.SSHPrivateKeyPEM); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "SSH 连接失败，未保存: " + err.Error()})
		return
	}
	if strings.TrimSpace(body.SSHPassword) != "" || strings.TrimSpace(body.SSHPrivateKeyPEM) != "" {
		if _, err := sshEncryptionKey(cfg); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "保存 SSH 凭据需要 KUBEBT_ENCRYPTION_KEY: " + err.Error()})
			return
		}
		if store == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "保存 SSH 凭据需要配置 SSH_SETTINGS_BACKEND（file/redis/mysql）"})
			return
		}
	}
	hosts, err := loadCloudHosts(app)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	hosts = append(hosts, h)
	if err := saveCloudHosts(app, hosts); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if err := persistCloudHostSSHIfAny(ctx, app, h, body.SSHPassword, body.SSHPrivateKeyPEM); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	credNote := ""
	if strings.TrimSpace(body.SSHPassword) != "" || strings.TrimSpace(body.SSHPrivateKeyPEM) != "" {
		credNote = "；已保存 SSH 凭据"
	}
	SetAuditDetail(c, fmt.Sprintf("新增云主机「%s」%s:%d 用户 %s（id=%s）%s", h.Name, h.SSHHost, h.SSHPort, strings.TrimSpace(h.SSHUser), h.ID, credNote))
	scheduleCloudHostBootstrapAfterAdd(app, h)
	c.JSON(http.StatusOK, gin.H{"host": h})
}

func handleCloudHostsUpdate(c *gin.Context, app *ServerApp) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 id"})
		return
	}
	var body cloudHostBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求 JSON 无效: " + err.Error()})
		return
	}
	if strings.TrimSpace(body.Name) == "" || strings.TrimSpace(body.SSHHost) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name 与 sshHost 必填"})
		return
	}
	port := body.SSHPort
	if port <= 0 {
		port = 22
	}
	if port > 65535 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sshPort 无效"})
		return
	}
	hosts, err := loadCloudHosts(app)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	idx := findCloudHostIndex(hosts, id)
	if idx < 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到主机"})
		return
	}
	prev := hosts[idx]
	cfg := app.Cfg()
	ctx := c.Request.Context()
	key, _ := sshEncryptionKey(cfg)
	store := app.SSHStore()

	next := hosts[idx]
	next.Name = strings.TrimSpace(body.Name)
	next.SSHHost = strings.TrimSpace(body.SSHHost)
	next.SSHPort = port
	next.SSHUser = strings.TrimSpace(body.SSHUser)
	next.SSHHostKeyFingerprint = normalizeSSHHostKeyFingerprint(body.SSHHostKeyFingerprint)
	next.Comment = strings.TrimSpace(body.Comment)
	cloudKey := cloudHostSSHStorageKey(id)
	if !cloudHostSSHCanDial(ctx, cfg, store, cloudKey, key, &next, body.SSHPassword, body.SSHPrivateKeyPEM) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无法校验 SSH：请填写 sshPassword 或 sshPrivateKeyPem，或配置全局 VCENTER_VM_SSH_*，或已保存该主机凭据"})
		return
	}
	if err := trySSHDialCloudHost(ctx, cfg, store, cloudKey, key, &next, body.SSHPassword, body.SSHPrivateKeyPEM); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "SSH 连接失败，未保存: " + err.Error()})
		return
	}
	if strings.TrimSpace(body.SSHPassword) != "" || strings.TrimSpace(body.SSHPrivateKeyPEM) != "" {
		if _, err := sshEncryptionKey(cfg); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "保存 SSH 凭据需要 KUBEBT_ENCRYPTION_KEY: " + err.Error()})
			return
		}
		if store == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "保存 SSH 凭据需要配置 SSH_SETTINGS_BACKEND（file/redis/mysql）"})
			return
		}
	}
	hosts[idx] = next
	if err := saveCloudHosts(app, hosts); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if err := persistCloudHostSSHIfAny(ctx, app, hosts[idx], body.SSHPassword, body.SSHPrivateKeyPEM); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	credUp := strings.TrimSpace(body.SSHPassword) != "" || strings.TrimSpace(body.SSHPrivateKeyPEM) != ""
	SetAuditDetail(c, fmt.Sprintf("更新云主机[%s]「%s」：%s", id, next.Name, cloudHostAuditDiff(prev, next, credUp)))
	c.JSON(http.StatusOK, gin.H{"host": hosts[idx]})
}

func handleCloudHostsDelete(c *gin.Context, app *ServerApp) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 id"})
		return
	}
	hosts, err := loadCloudHosts(app)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	idx := findCloudHostIndex(hosts, id)
	if idx < 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "未找到主机"})
		return
	}
	deleted := hosts[idx]
	out := append(hosts[:idx], hosts[idx+1:]...)
	if err := saveCloudHosts(app, out); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if store := app.SSHStore(); store != nil {
		_ = store.DeleteVM(c.Request.Context(), cloudHostSSHStorageKey(id))
	}
	SetAuditDetail(c, fmt.Sprintf("删除云主机「%s」%s:%d（id=%s）", deleted.Name, deleted.SSHHost, deleted.SSHPort, deleted.ID))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// CloudHostMetricRow 列表页展示的 node_exporter 聚合指标（来自已配置的 Prometheus；与 vCenter 无关）。
type CloudHostMetricRow struct {
	Instance   string   `json:"instance"`
	Up         *float64 `json:"up,omitempty"`
	CPUPercent *float64 `json:"cpuPercent,omitempty"`
	MemPercent *float64 `json:"memPercent,omitempty"`
	DiskRoot   *float64 `json:"diskRootPercent,omitempty"`
	// 磁盘/网络吞吐（字节/秒，由 rate([5m]) 得到）
	DiskReadBps  *float64 `json:"diskReadBps,omitempty"`
	DiskWriteBps *float64 `json:"diskWriteBps,omitempty"`
	NetRxBps     *float64 `json:"netRxBps,omitempty"`
	NetTxBps     *float64 `json:"netTxBps,omitempty"`
	Error        string   `json:"error,omitempty"`
}

func cloudHostPrometheusMetrics(ctx context.Context, cfg Config, base string, h CloudHost) CloudHostMetricRow {
	inst := cloudPrometheusInstanceLabel(h)
	row := CloudHostMetricRow{Instance: inst}
	if inst == "" {
		row.Error = "缺少 SSH 地址，无法匹配 Prometheus instance"
		return row
	}
	esc := escapePromQLLabelValue(inst)
	qUp := fmt.Sprintf(`up{instance="%s"}`, esc)
	if v, err := prometheusInstantScalar(ctx, cfg, base, qUp); err == nil {
		row.Up = safeFloatPtr(v)
	}
	qCPU := fmt.Sprintf(`100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle",instance="%s"}[5m])))`, esc)
	if v, err := prometheusInstantScalar(ctx, cfg, base, qCPU); err == nil {
		row.CPUPercent = safeRoundedFloatPtr(v)
	}
	qMem := fmt.Sprintf(`100 * (1 - (node_memory_MemAvailable_bytes{instance="%s"} / node_memory_MemTotal_bytes{instance="%s"}))`, esc, esc)
	if v, err := prometheusInstantScalar(ctx, cfg, base, qMem); err == nil {
		row.MemPercent = safeRoundedFloatPtr(v)
	}
	qDisk := fmt.Sprintf(`100 - ((node_filesystem_avail_bytes{instance="%s",mountpoint="/"} * 100) / node_filesystem_size_bytes{instance="%s",mountpoint="/"})`, esc, esc)
	if v, err := prometheusInstantScalar(ctx, cfg, base, qDisk); err == nil {
		row.DiskRoot = safeRoundedFloatPtr(v)
	}
	// 磁盘 IO（各盘 read/write 字节率之和）
	qDR := fmt.Sprintf(`sum(rate(node_disk_read_bytes_total{instance="%s"}[5m]))`, esc)
	if v, err := prometheusInstantScalar(ctx, cfg, base, qDR); err == nil {
		row.DiskReadBps = safeFloatPtrNonNeg(v)
	}
	qDW := fmt.Sprintf(`sum(rate(node_disk_written_bytes_total{instance="%s"}[5m]))`, esc)
	if v, err := prometheusInstantScalar(ctx, cfg, base, qDW); err == nil {
		row.DiskWriteBps = safeFloatPtrNonNeg(v)
	}
	// 网络 IO（排除 lo；多网卡求和）
	qNR := fmt.Sprintf(`sum(rate(node_network_receive_bytes_total{instance="%s",device!="lo"}[5m]))`, esc)
	if v, err := prometheusInstantScalar(ctx, cfg, base, qNR); err == nil {
		row.NetRxBps = safeFloatPtrNonNeg(v)
	}
	qNT := fmt.Sprintf(`sum(rate(node_network_transmit_bytes_total{instance="%s",device!="lo"}[5m]))`, esc)
	if v, err := prometheusInstantScalar(ctx, cfg, base, qNT); err == nil {
		row.NetTxBps = safeFloatPtrNonNeg(v)
	}
	return row
}

func cloudPrometheusRowHasSeries(row CloudHostMetricRow) bool {
	if strings.TrimSpace(row.Error) != "" {
		return false
	}
	if row.CPUPercent != nil || row.MemPercent != nil || row.DiskRoot != nil {
		return true
	}
	if row.DiskReadBps != nil || row.DiskWriteBps != nil || row.NetRxBps != nil || row.NetTxBps != nil {
		return true
	}
	if row.Up != nil && !math.IsNaN(*row.Up) && !math.IsInf(*row.Up, 0) && *row.Up >= 0.99 {
		return true
	}
	return false
}

func safeFloatPtr(v float64) *float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return nil
	}
	return floatPtr(v)
}

func safeRoundedFloatPtr(v float64) *float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return nil
	}
	return floatPtr(round1(v))
}

func safeFloatPtrNonNeg(v float64) *float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return nil
	}
	if v < 0 {
		v = 0
	}
	return floatPtr(v)
}

func handleCloudHostsMetricsSnapshot(c *gin.Context, app *ServerApp) {
	cfg := app.Cfg()
	base := GetPrometheusURLForScope(cfg, "cloud")
	promOk := strings.TrimSpace(base) != ""
	ctx := c.Request.Context()
	hosts, err := loadCloudHosts(app)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	out := make(map[string]CloudHostMetricRow, len(hosts))
	for _, h := range hosts {
		inst := cloudPrometheusInstanceLabel(h)
		if inst == "" {
			out[h.ID] = CloudHostMetricRow{Error: "缺少 SSH 地址，无法匹配 Prometheus 中的 instance"}
			continue
		}
		if !promOk {
			out[h.ID] = CloudHostMetricRow{
				Instance: inst,
				Error:    "未配置 Prometheus：请在运行时配置 prometheusUrlCloud（或兜底 prometheusUrl），与 vCenter 无关",
			}
			continue
		}
		row := cloudHostPrometheusMetrics(ctx, cfg, base, h)
		if !cloudPrometheusRowHasSeries(row) {
			row.Error = fmt.Sprintf("Prometheus 中无此主机数据：请确认已抓取 node_exporter，且 scrape 的 instance 与列表 SSH 地址一致（当前期望 %s）", inst)
		}
		out[h.ID] = row
	}
	c.JSON(http.StatusOK, gin.H{"metrics": out, "prometheusConfigured": promOk})
}

func floatPtr(f float64) *float64 { return &f }

func round1(f float64) float64 {
	return math.Round(f*10) / 10
}

func prometheusInstantScalar(ctx context.Context, cfg Config, baseURL, query string) (float64, error) {
	u, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil {
		return 0, err
	}
	u.Path = strings.TrimSuffix(u.Path, "/") + "/api/v1/query"
	qv := url.Values{}
	qv.Set("query", query)
	u.RawQuery = qv.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return 0, err
	}
	if tok := strings.TrimSpace(cfg.PrometheusBearerToken); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := prometheusHTTPClient(cfg).Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return 0, fmt.Errorf("prometheus http %d", resp.StatusCode)
	}
	var wrap struct {
		Status string `json:"status"`
		Data   struct {
			Result []struct {
				Value []interface{} `json:"value"`
			} `json:"result"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &wrap); err != nil {
		return 0, err
	}
	if wrap.Status != "success" || len(wrap.Data.Result) == 0 {
		return math.NaN(), nil
	}
	v := wrap.Data.Result[0].Value
	if len(v) < 2 {
		return math.NaN(), nil
	}
	s, ok := v[1].(string)
	if !ok {
		return math.NaN(), nil
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return math.NaN(), nil
	}
	return f, nil
}

func registerCloudHostRoutes(api *gin.RouterGroup, app *ServerApp) {
	api.GET("/cloud-hosts", func(c *gin.Context) { handleCloudHostsList(c, app) })
	api.POST("/cloud-hosts", func(c *gin.Context) { handleCloudHostsCreate(c, app) })
	api.GET("/cloud-hosts/metrics-snapshot", func(c *gin.Context) { handleCloudHostsMetricsSnapshot(c, app) })
	api.GET("/cloud-hosts/:id/listening-ports", func(c *gin.Context) { handleCloudHostListeningPorts(c, app) })
	api.GET("/cloud-hosts/:id/ssh/ws", func(c *gin.Context) { handleCloudHostSSHWS(c, app) })
	api.GET("/cloud-hosts/:id/ssh-settings", func(c *gin.Context) { handleGetCloudHostSSHSettings(c, app) })
	api.PUT("/cloud-hosts/:id/ssh-settings", func(c *gin.Context) { handlePutCloudHostSSHSettings(c, app) })
	api.DELETE("/cloud-hosts/:id/ssh-settings", func(c *gin.Context) { handleDeleteCloudHostSSHSettings(c, app) })
	api.GET("/cloud-hosts/:id/sftp/list", func(c *gin.Context) { handleCloudHostSFTPList(c, app) })
	api.GET("/cloud-hosts/:id/sftp/download", func(c *gin.Context) { handleCloudHostSFTPDownload(c, app) })
	api.POST("/cloud-hosts/:id/sftp/upload", func(c *gin.Context) { handleCloudHostSFTPUpload(c, app) })
	api.PUT("/cloud-hosts/:id", func(c *gin.Context) { handleCloudHostsUpdate(c, app) })
	api.DELETE("/cloud-hosts/:id", func(c *gin.Context) { handleCloudHostsDelete(c, app) })
}
