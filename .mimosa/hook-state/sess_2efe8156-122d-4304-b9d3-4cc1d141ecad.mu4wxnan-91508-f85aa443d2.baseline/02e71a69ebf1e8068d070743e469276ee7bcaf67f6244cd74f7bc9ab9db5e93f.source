package internal

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	toolboxIPSegmentsKVKey      = "toolbox_ip_segments_v1"
	toolboxIPScanHistoryKVKey   = "toolbox_ip_scan_history_v1"
	maxIPScanAddresses          = 512
	ipScanWorkerCount           = 48
	ipScanDialTimeout           = 280 * time.Millisecond
	maxIPScanHistoryRuns        = 80
)

var toolboxIPScanMu sync.Mutex

type toolboxIPSegmentsConfig struct {
	Segments []string `json:"segments"`
}

type ipScanResultRow struct {
	IP     string `json:"ip"`
	Status string `json:"status"` // used | likely_free
}

type ipScanRun struct {
	ID          string            `json:"id"`
	StartedAt   string            `json:"startedAt"`
	EndedAt     string            `json:"endedAt"`
	Segment     string            `json:"segment"`
	PodSourceIP string            `json:"podSourceIp,omitempty"`
	Results     []ipScanResultRow `json:"results"`
	Summary     struct {
		Total       int `json:"total"`
		Used        int `json:"used"`
		LikelyFree  int `json:"likelyFree"`
	} `json:"summary"`
	Note string `json:"note,omitempty"`
}

func outboundPodSourceIP() string {
	if v := strings.TrimSpace(os.Getenv("POD_IP")); v != "" {
		return v
	}
	conn, err := net.DialTimeout("udp", "8.8.8.8:80", 2*time.Second)
	if err != nil {
		return ""
	}
	defer conn.Close()
	if ua, ok := conn.LocalAddr().(*net.UDPAddr); ok {
		return ua.IP.String()
	}
	return ""
}

func enumerateIPv4CIDR(cidr string) ([]string, error) {
	_, ipnet, err := net.ParseCIDR(strings.TrimSpace(cidr))
	if err != nil {
		return nil, err
	}
	ip4 := ipnet.IP.To4()
	if ip4 == nil {
		return nil, fmt.Errorf("仅支持 IPv4 CIDR")
	}
	maskOnes, bits := ipnet.Mask.Size()
	if bits != 32 {
		return nil, fmt.Errorf("无效 CIDR")
	}
	size := uint64(1) << uint(32-maskOnes)
	if size > maxIPScanAddresses {
		return nil, fmt.Errorf("网段过大（最多 %d 个地址）", maxIPScanAddresses)
	}
	if maskOnes == 32 {
		return []string{ip4.String()}, nil
	}
	start := binary.BigEndian.Uint32(ip4)
	out := make([]string, 0, size)
	for i := uint64(0); i < size; i++ {
		addr := start + uint32(i)
		ip := make(net.IP, 4)
		binary.BigEndian.PutUint32(ip, addr)
		if !ipnet.Contains(ip) {
			continue
		}
		out = append(out, ip.String())
	}
	return out, nil
}

func tcpProbeHostUsed(ip string) bool {
	ports := []int{22, 80, 443, 445, 3389, 135}
	for _, p := range ports {
		addr := net.JoinHostPort(ip, strconv.Itoa(p))
		c, err := net.DialTimeout("tcp", addr, ipScanDialTimeout)
		if err == nil {
			_ = c.Close()
			return true
		}
		var ne net.Error
		if errors.As(err, &ne) && ne.Timeout() {
			continue
		}
		if errors.Is(err, syscall.ECONNREFUSED) {
			return true
		}
		var opErr *net.OpError
		if errors.As(err, &opErr) && errors.Is(opErr.Err, syscall.ECONNREFUSED) {
			return true
		}
	}
	return false
}

func runIPScanParallel(ips []string) []ipScanResultRow {
	n := len(ips)
	out := make([]ipScanResultRow, n)
	workers := ipScanWorkerCount
	if workers > n {
		workers = n
	}
	if workers < 1 {
		workers = 1
	}
	jobs := make(chan int, n)
	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for idx := range jobs {
				ip := ips[idx]
				if tcpProbeHostUsed(ip) {
					out[idx] = ipScanResultRow{IP: ip, Status: "used"}
				} else {
					out[idx] = ipScanResultRow{IP: ip, Status: "likely_free"}
				}
			}
		}()
	}
	for i := 0; i < n; i++ {
		jobs <- i
	}
	close(jobs)
	wg.Wait()
	return out
}

func loadToolboxSegments(app *ServerApp) ([]string, error) {
	kv := app.PlatformKV()
	if kv == nil {
		return nil, errors.New("platform_kv 不可用")
	}
	raw, ok := kv.Get(toolboxIPSegmentsKVKey)
	if !ok || strings.TrimSpace(raw) == "" {
		return []string{}, nil
	}
	var cfg toolboxIPSegmentsConfig
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(cfg.Segments))
	for _, s := range cfg.Segments {
		s = strings.TrimSpace(s)
		if s != "" {
			out = append(out, s)
		}
	}
	return out, nil
}

func saveToolboxSegments(app *ServerApp, segments []string) error {
	kv := app.PlatformKV()
	if kv == nil {
		return errors.New("platform_kv 不可用")
	}
	cfg := toolboxIPSegmentsConfig{Segments: segments}
	b, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	if err := kv.Set(toolboxIPSegmentsKVKey, string(b)); err != nil {
		return err
	}
	mirrorPlatformKVIfDualWrite(app)
	return nil
}

func loadIPScanHistory(app *ServerApp) ([]ipScanRun, error) {
	kv := app.PlatformKV()
	if kv == nil {
		return nil, errors.New("platform_kv 不可用")
	}
	raw, ok := kv.Get(toolboxIPScanHistoryKVKey)
	if !ok || strings.TrimSpace(raw) == "" {
		return []ipScanRun{}, nil
	}
	var runs []ipScanRun
	if err := json.Unmarshal([]byte(raw), &runs); err != nil {
		return nil, err
	}
	return runs, nil
}

func appendIPScanHistory(app *ServerApp, run ipScanRun) error {
	kv := app.PlatformKV()
	if kv == nil {
		return errors.New("platform_kv 不可用")
	}
	runs, err := loadIPScanHistory(app)
	if err != nil {
		runs = []ipScanRun{}
	}
	next := append([]ipScanRun{run}, runs...)
	if len(next) > maxIPScanHistoryRuns {
		next = next[:maxIPScanHistoryRuns]
	}
	b, err := json.Marshal(next)
	if err != nil {
		return err
	}
	if err := kv.Set(toolboxIPScanHistoryKVKey, string(b)); err != nil {
		return err
	}
	mirrorPlatformKVIfDualWrite(app)
	return nil
}

func mirrorPlatformKVIfDualWrite(app *ServerApp) {
	cfg := app.Cfg()
	if !cfg.RuntimeDualWriteRedis {
		return
	}
	kv := app.PlatformKV()
	rdb := app.Redis()
	if kv == nil || rdb == nil {
		return
	}
	mctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	_ = MirrorPlatformKVToRedis(mctx, rdb, cfg, kv.Snapshot())
}

func handleToolboxIPScanConfigGet(c *gin.Context, app *ServerApp) {
	segs, err := loadToolboxSegments(app)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"segments": segs})
}

type toolboxIPScanConfigPut struct {
	Segments []string `json:"segments"`
}

func handleToolboxIPScanConfigPut(c *gin.Context, app *ServerApp) {
	var body toolboxIPScanConfigPut
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求 JSON 无效: " + err.Error()})
		return
	}
	norm := make([]string, 0, len(body.Segments))
	for _, s := range body.Segments {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, _, err := net.ParseCIDR(s); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("无效 CIDR: %s (%v)", s, err)})
			return
		}
		norm = append(norm, s)
	}
	if err := saveToolboxSegments(app, norm); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"segments": norm})
}

type toolboxIPScanRunBody struct {
	Segment string `json:"segment"`
}

func handleToolboxIPScanRun(c *gin.Context, app *ServerApp) {
	var body toolboxIPScanRunBody
	_ = c.ShouldBindJSON(&body)
	seg := strings.TrimSpace(body.Segment)
	if seg == "" {
		segs, err := loadToolboxSegments(app)
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		if len(segs) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请先保存至少一个网段，或在请求中指定 segment"})
			return
		}
		seg = segs[0]
	}
	if _, _, err := net.ParseCIDR(seg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 CIDR: " + err.Error()})
		return
	}
	if !toolboxIPScanMu.TryLock() {
		c.JSON(http.StatusConflict, gin.H{"error": "已有扫描任务在执行，请稍后再试"})
		return
	}
	defer toolboxIPScanMu.Unlock()

	ips, err := enumerateIPv4CIDR(seg)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	started := time.Now().In(BeijingLocation())
	run := ipScanRun{
		ID:          uuid.NewString(),
		StartedAt:   started.Format(time.RFC3339Nano),
		Segment:     seg,
		PodSourceIP: outboundPodSourceIP(),
		Note:        "在 Pod 内发起 TCP 探测（常见端口）；无 ICMP。若目标防火墙丢弃探测包，可能被标为「疑似空闲」。",
	}
	run.Results = runIPScanParallel(ips)
	for _, r := range run.Results {
		switch r.Status {
		case "used":
			run.Summary.Used++
		case "likely_free":
			run.Summary.LikelyFree++
		}
	}
	run.Summary.Total = len(run.Results)
	run.EndedAt = time.Now().In(BeijingLocation()).Format(time.RFC3339Nano)

	if err := appendIPScanHistory(app, run); err != nil {
		RespondAPIError500(c, "保存历史失败: " + err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"run": run})
}

func handleToolboxIPScanHistory(c *gin.Context, app *ServerApp) {
	runs, err := loadIPScanHistory(app)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"runs": runs})
}

func registerToolboxRoutes(api *gin.RouterGroup, app *ServerApp) {
	api.GET("/toolbox/ip-scan/config", func(c *gin.Context) { handleToolboxIPScanConfigGet(c, app) })
	api.PUT("/toolbox/ip-scan/config", func(c *gin.Context) { handleToolboxIPScanConfigPut(c, app) })
	api.POST("/toolbox/ip-scan/run", func(c *gin.Context) { handleToolboxIPScanRun(c, app) })
	api.GET("/toolbox/ip-scan/history", func(c *gin.Context) { handleToolboxIPScanHistory(c, app) })
}
