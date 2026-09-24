package internal

// vm_capture_handlers.go 抓包 HTTP API。全部端点仅 admin（pcap 含敏感数据），
// 复用堡垒机 bastion ACL 与平台审计；静态子路径（preflight/interpret/file）与
// 任何参数段不冲突，注册顺序无需依赖 httprouter 的静态优先规则。

import (
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func registerVCenterVMCaptureRoutes(api *gin.RouterGroup, app *ServerApp) {
	g := api.Group("/vcenter/vms/:moref/captures")
	g.Use(AdminOnlyMiddleware(app))
	g.GET("", func(c *gin.Context) { handleVMCaptureList(c, app) })
	g.GET("/preflight", func(c *gin.Context) { handleVMCapturePreflight(c, app) })
	g.POST("", func(c *gin.Context) { handleVMCaptureStart(c, app) })
	g.POST("/interpret", func(c *gin.Context) { handleVMCaptureInterpret(c, app) })
	g.GET("/file/:name", func(c *gin.Context) { handleVMCaptureStatus(c, app) })
	g.GET("/file/:name/decode", func(c *gin.Context) { handleVMCaptureDecode(c, app) })
	g.GET("/file/:name/download", func(c *gin.Context) { handleVMCaptureDownload(c, app) })
	g.POST("/file/:name/stop", func(c *gin.Context) { handleVMCaptureStop(c, app) })
	g.POST("/file/:name/ai-report", func(c *gin.Context) { handleVMCaptureAIReport(c, app) })
	g.POST("/file/:name/ai-chat", func(c *gin.Context) { handleVMCaptureAIChat(c, app) })
	g.DELETE("/file/:name", func(c *gin.Context) { handleVMCaptureDelete(c, app) })
}

// vmSectionAfter 提取标记之后（到下一个标记或结尾）的文本段。
func vmSectionAfter(out, startMarker, endMarker string) string {
	i := strings.Index(out, startMarker)
	if i < 0 {
		return ""
	}
	rest := out[i+len(startMarker):]
	if endMarker != "" {
		if j := strings.Index(rest, endMarker); j >= 0 {
			rest = rest[:j]
		}
	}
	return strings.TrimSpace(rest)
}

func vmCaptureAudit(c *gin.Context, app *ServerApp, action, detail string) {
	AppendAuditRecord(app, AuditRecord{
		Action: action,
		IP:     AuditClientIP(c, app.Cfg()),
		User:   dashboardUsernameFromGin(c),
		Method: c.Request.Method,
		Path:   c.Request.URL.Path,
		Detail: detail,
	})
}

func handleVMCapturePreflight(c *gin.Context, app *ServerApp) {
	moref := strings.TrimSpace(c.Param("moref"))
	if vcenterBastionAbortIfForbidden(c, app, moref) {
		return
	}
	resp := gin.H{"checkedAt": time.Now().UTC().Format(time.RFC3339)}
	// AI 引擎状态（不依赖 SSH）
	aiReady, aiModel := false, ""
	if bundle, err := loadOpsAIInspectBundle(app.PlatformKV()); err == nil {
		aiReady = opsJudgeReady(bundle.AI)
		j := bundle.AI.JudgeModel
		normalizeInspectJudgeConfig(&j)
		aiModel = j.Model
	}
	resp["aiReady"] = aiReady
	resp["aiModel"] = aiModel

	t0 := time.Now()
	client, guestIP, err := vmCaptureResolveSSH(c.Request.Context(), app, moref)
	rttMs := time.Since(t0).Milliseconds()
	if err != nil {
		resp["sshOk"] = false
		resp["sshError"] = err.Error()
		resp["tcpdumpOk"] = false
		resp["sudoOk"] = false
		c.JSON(http.StatusOK, resp)
		return
	}
	defer client.Close()
	resp["sshOk"] = true
	resp["guestIp"] = guestIP
	resp["rttMs"] = rttMs

	out, _ := vmCaptureRunOnce(c.Request.Context(), client,
		`echo "SECTION_TCPDUMP"; command -v tcpdump 2>/dev/null || echo NOT_FOUND; tcpdump --version 2>&1 | head -n 1; echo "SECTION_SUDO"; sudo -n true 2>/dev/null && echo SUDO_OK || echo SUDO_FAIL`,
		20*time.Second)
	tcpdumpBody := vmSectionAfter(out, "SECTION_TCPDUMP", "SECTION_SUDO")
	sudoBody := vmSectionAfter(out, "SECTION_SUDO", "")
	tcpdumpOk := strings.Contains(tcpdumpBody, "tcpdump") && !strings.Contains(tcpdumpBody, "NOT_FOUND")
	sudoOk := strings.Contains(sudoBody, "SUDO_OK")
	version := ""
	for _, ln := range strings.Split(tcpdumpBody, "\n") {
		if strings.Contains(ln, "libpcap") || strings.Contains(ln, "tcpdump version") {
			version = strings.TrimSpace(ln)
			break
		}
	}
	resp["tcpdumpOk"] = tcpdumpOk
	resp["tcpdumpVersion"] = version
	resp["sudoOk"] = sudoOk
	if !sudoOk {
		resp["hint"] = "来宾用户需要 sudo -n 免密（NOPASSWD）才能运行 tcpdump"
	}
	c.JSON(http.StatusOK, resp)
}

func handleVMCaptureStart(c *gin.Context, app *ServerApp) {
	moref := strings.TrimSpace(c.Param("moref"))
	if vcenterBastionAbortIfForbidden(c, app, moref) {
		return
	}
	var opts vmCaptureOptions
	if err := c.ShouldBindJSON(&opts); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效: " + err.Error()})
		return
	}
	s, err := vmCaptures.start(app, moref, opts)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	vmCaptureAudit(c, app, "vm_capture_start",
		fmt.Sprintf("vm=%s file=%s bpf=%q iface=%s snaplen=%d maxMiB=%d durationSec=%d",
			s.VMName, s.Name, s.BPF, s.Iface, s.Snaplen, s.MaxBytes>>20, int(s.MaxDuration.Seconds())))
	c.JSON(http.StatusOK, s.statusDTO(0))
}

func handleVMCaptureInterpret(c *gin.Context, app *ServerApp) {
	moref := strings.TrimSpace(c.Param("moref"))
	if vcenterBastionAbortIfForbidden(c, app, moref) {
		return
	}
	var opts vmCaptureOptions
	if err := c.ShouldBindJSON(&opts); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效: " + err.Error()})
		return
	}
	if opts.Iface == "" {
		opts.Iface = "any"
	}
	if opts.Snaplen <= 0 {
		opts.Snaplen = vmCaptureMaxSnaplen
	}
	if opts.MaxMiB <= 0 {
		opts.MaxMiB = 128
	}
	if opts.DurationSec <= 0 {
		opts.DurationSec = 300
	}
	if err := vmCaptureNormalizeOptions(&opts); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, vmCaptureInterpret(app, opts))
}

func handleVMCaptureList(c *gin.Context, app *ServerApp) {
	moref := strings.TrimSpace(c.Param("moref"))
	if vcenterBastionAbortIfForbidden(c, app, moref) {
		return
	}
	running, files, err := vmCaptures.list(app, moref)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	dir := vmCaptureDir(app.DataDir())
	for i := range files {
		if _, err := os.Stat(dir + "/" + files[i].Name + ".ai.json"); err == nil {
			files[i].AIReady = true
		}
	}
	used, quota := vmCaptureUsage(app.DataDir())
	c.JSON(http.StatusOK, gin.H{
		"running":    running,
		"files":      files,
		"usedBytes":  used,
		"quotaBytes": quota,
		"retainDays": vmCaptureRetainDays,
	})
}

// runningSessionByName 找该 VM 运行中的会话（名称匹配）。
func runningSessionByName(moref, name string) *vmCaptureSession {
	vmCaptures.mu.Lock()
	defer vmCaptures.mu.Unlock()
	if s, ok := vmCaptures.sessions[moref]; ok && s.Name == name {
		return s
	}
	return nil
}

func handleVMCaptureStatus(c *gin.Context, app *ServerApp) {
	moref := strings.TrimSpace(c.Param("moref"))
	name := strings.TrimSpace(c.Param("name"))
	if vcenterBastionAbortIfForbidden(c, app, moref) {
		return
	}
	after := 0
	if v := c.Query("after"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			after = n
		}
	}
	if s := runningSessionByName(moref, name); s != nil {
		c.JSON(http.StatusOK, gin.H{"running": true, "session": s.statusDTO(after)})
		return
	}
	meta, _, err := vmCaptureMetaForName(app.DataDir(), moref, name)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "抓包文件不存在或已清理"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"running": false, "meta": meta})
}

func handleVMCaptureStop(c *gin.Context, app *ServerApp) {
	moref := strings.TrimSpace(c.Param("moref"))
	name := strings.TrimSpace(c.Param("name"))
	if vcenterBastionAbortIfForbidden(c, app, moref) {
		return
	}
	s := runningSessionByName(moref, name)
	if s == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有运行中的抓包会话"})
		return
	}
	s.stop("manual")
	dto := s.statusDTO(0)
	vmCaptureAudit(c, app, "vm_capture_stop", fmt.Sprintf("vm=%s file=%s packets=%d", s.VMName, name, s.packetCount()))
	c.JSON(http.StatusOK, gin.H{"running": false, "session": dto})
}

func handleVMCaptureDecode(c *gin.Context, app *ServerApp) {
	moref := strings.TrimSpace(c.Param("moref"))
	name := strings.TrimSpace(c.Param("name"))
	if vcenterBastionAbortIfForbidden(c, app, moref) {
		return
	}
	meta, path, err := vmCaptureMetaForName(app.DataDir(), moref, name)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "抓包文件不存在或已清理"})
		return
	}
	limit := 200
	if v := c.Query("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	packet := 0
	if v := c.Query("packet"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			packet = n
		}
	}
	res, err := vmCaptureDecodePcap(path, limit, packet)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"meta": meta, "decode": res})
}

func handleVMCaptureDownload(c *gin.Context, app *ServerApp) {
	moref := strings.TrimSpace(c.Param("moref"))
	name := strings.TrimSpace(c.Param("name"))
	if vcenterBastionAbortIfForbidden(c, app, moref) {
		return
	}
	_, path, err := vmCaptureMetaForName(app.DataDir(), moref, name)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "抓包文件不存在或已清理"})
		return
	}
	vmCaptureAudit(c, app, "vm_capture_download", fmt.Sprintf("file=%s vm=%s", name, moref))
	c.FileAttachment(path, name)
}

func handleVMCaptureAIReport(c *gin.Context, app *ServerApp) {
	moref := strings.TrimSpace(c.Param("moref"))
	name := strings.TrimSpace(c.Param("name"))
	if vcenterBastionAbortIfForbidden(c, app, moref) {
		return
	}
	meta, path, err := vmCaptureMetaForName(app.DataDir(), moref, name)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "抓包文件不存在或已清理"})
		return
	}
	regen := c.Query("regen") == "1"
	report, err := vmCaptureAIReportForFile(app, path, meta, regen)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	if regen {
		vmCaptureAudit(c, app, "vm_capture_ai_report", "file="+name)
	}
	c.JSON(http.StatusOK, report)
}

func handleVMCaptureAIChat(c *gin.Context, app *ServerApp) {
	moref := strings.TrimSpace(c.Param("moref"))
	name := strings.TrimSpace(c.Param("name"))
	if vcenterBastionAbortIfForbidden(c, app, moref) {
		return
	}
	var body struct {
		Question string              `json:"question"`
		History  []vmCaptureChatTurn `json:"history"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Question) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效：需要 question"})
		return
	}
	meta, path, err := vmCaptureMetaForName(app.DataDir(), moref, name)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "抓包文件不存在或已清理"})
		return
	}
	report, err := vmCaptureAIReportForFile(app, path, meta, false)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	answer, aiUsed, err := vmCaptureAIChat(app, path, meta, report, body.Question, body.History)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI 追问失败: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"answer": answer, "aiUsed": aiUsed})
}

func handleVMCaptureDelete(c *gin.Context, app *ServerApp) {
	moref := strings.TrimSpace(c.Param("moref"))
	name := strings.TrimSpace(c.Param("name"))
	if vcenterBastionAbortIfForbidden(c, app, moref) {
		return
	}
	if s := runningSessionByName(moref, name); s != nil {
		s.stop("manual")
		s.waitDone(3 * time.Second) // 等待 sidecar 落盘，避免删除后被重写
	}
	meta, path, err := vmCaptureMetaForName(app.DataDir(), moref, name)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "抓包文件不存在或已清理"})
		return
	}
	_ = os.Remove(path)
	_ = os.Remove(path + ".meta.json")
	_ = os.Remove(path + ".ai.json")
	vmCaptureAudit(c, app, "vm_capture_delete", fmt.Sprintf("file=%s vm=%s bytes=%d", name, meta.VMName, meta.Bytes))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
