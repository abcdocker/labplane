package internal

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// IdracHostConfig iDRAC Redfish 连接参数（BaseURL 为 https:// 根地址）。
type IdracHostConfig struct {
	BaseURL  string `json:"baseUrl"`
	User     string `json:"user"`
	Password string `json:"password,omitempty"`
	Insecure bool   `json:"insecure,omitempty"`
}

// IdracHostConfigFromFlat 由 IP/主机名（可带 https://）与凭据构造配置。
func IdracHostConfigFromFlat(host, user, password string, insecure bool) (IdracHostConfig, error) {
	h := strings.TrimSpace(host)
	if h == "" {
		return IdracHostConfig{}, fmt.Errorf("empty host")
	}
	u, err := normalizeRedfishBase(h)
	if err != nil {
		return IdracHostConfig{}, err
	}
	return IdracHostConfig{
		BaseURL:  u.String(),
		User:     strings.TrimSpace(user),
		Password: password,
		Insecure: insecure,
	}, nil
}

// redfishTLSSkipVerify 是否跳过 TLS 校验：显式 insecure，或用裸 IP 访问（iDRAC 证书通常无 IP SAN）。
func redfishTLSSkipVerify(cfg IdracHostConfig, base *url.URL) bool {
	if cfg.Insecure {
		return true
	}
	if base == nil {
		return false
	}
	return net.ParseIP(base.Hostname()) != nil
}

// VerifyIdracRedfish 在保存前校验 Redfish 账号（GET /redfish/v1/）。
func VerifyIdracRedfish(cfg IdracHostConfig) error {
	base, err := normalizeRedfishBase(cfg.BaseURL)
	if err != nil {
		return err
	}
	user := strings.TrimSpace(cfg.User)
	if user == "" {
		return fmt.Errorf("请填写 iDRAC 用户名")
	}
	if cfg.Password == "" {
		return fmt.Errorf("请填写 iDRAC 密码")
	}
	skipTLS := redfishTLSSkipVerify(cfg, base)
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: skipTLS,
			MinVersion:         tls.VersionTLS12,
		},
	}
	client := &http.Client{
		Timeout:   20 * time.Second,
		Transport: tr,
	}
	root := strings.TrimRight(base.String(), "/")
	req, err := http.NewRequest(http.MethodGet, root+"/redfish/v1/", nil)
	if err != nil {
		return err
	}
	req.SetBasicAuth(user, cfg.Password)
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		if !skipTLS && strings.Contains(err.Error(), "x509:") {
			return fmt.Errorf("TLS 证书校验失败（用 IP 访问时证书常不含 IP SAN）。请开启「跳过 TLS 校验」或使用与证书 CN 一致的主机名: %v", err)
		}
		return fmt.Errorf("无法连接 iDRAC，请检查 IP 与网络，或开启「跳过 TLS 校验」: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("用户名或密码错误，或账号无 Redfish 权限")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("Redfish 返回 HTTP %d", resp.StatusCode)
	}
	return nil
}

// IdracPhysicalDiskRow 单块物理盘（Redfish Drive 资源摘要）。
type IdracPhysicalDiskRow struct {
	Name               string  `json:"name"`
	Model              string  `json:"model,omitempty"`
	MediaType          string  `json:"mediaType,omitempty"`
	CapacityBytes      int64   `json:"capacityBytes,omitempty"`
	Health             string  `json:"health,omitempty"`
	State              string  `json:"state,omitempty"`
	Protocol           string  `json:"protocol,omitempty"`
	TemperatureCelsius float64 `json:"temperatureCelsius,omitempty"`
}

type IdracTelemetryPoint struct {
	Name    string  `json:"name"`
	Reading float64 `json:"reading"`
	Unit    string  `json:"unit,omitempty"`
	Health  string  `json:"health,omitempty"`
	State   string  `json:"state,omitempty"`
	// Redfish 温度阈值（°C），便于与 Grafana 面板一致展示
	UpperWarningC *float64 `json:"upperWarningC,omitempty"`
	UpperCriticalC *float64 `json:"upperCriticalC,omitempty"`
}

// IdracMemoryModuleRow 单条内存 DIMM（Redfish Memory 资源摘要）。
type IdracMemoryModuleRow struct {
	Name             string `json:"name"`
	Manufacturer     string `json:"manufacturer,omitempty"`
	PartNumber       string `json:"partNumber,omitempty"`
	CapacityMiB      int64  `json:"capacityMiB,omitempty"`
	OperatingMHz     int    `json:"operatingMHz,omitempty"`
	DeviceType       string `json:"deviceType,omitempty"`
	Health           string `json:"health,omitempty"`
	State            string `json:"state,omitempty"`
}

type IdracTelemetrySnapshot struct {
	CollectedAt      string                `json:"collectedAt,omitempty"`
	PowerWatts       float64               `json:"powerWatts,omitempty"`
	FanRpm           float64               `json:"fanRpm,omitempty"`
	CpuTemperatureC  float64               `json:"cpuTemperatureC,omitempty"`
	DiskTemperatureC float64               `json:"diskTemperatureC,omitempty"`
	FanCount         int                   `json:"fanCount,omitempty"`
	CpuSensorCount   int                   `json:"cpuSensorCount,omitempty"`
	DiskSensorCount  int                   `json:"diskSensorCount,omitempty"`
	Fans             []IdracTelemetryPoint `json:"fans,omitempty"`
	CpuSensors       []IdracTelemetryPoint `json:"cpuSensors,omitempty"`
	DiskSensors      []IdracTelemetryPoint `json:"diskSensors,omitempty"`
	// 未归类为 CPU/硬盘 的温度点（如进风、主板、PSU 附近等）
	OtherTemperatures []IdracTelemetryPoint `json:"otherTemperatures,omitempty"`
	Note             string                `json:"note,omitempty"`
}

// IdracSystemSummary 来自 Redfish ComputerSystem（代外机型与资源摘要）。
type IdracSystemSummary struct {
	Manufacturer         string  `json:"manufacturer,omitempty"`
	Model                string  `json:"model,omitempty"`
	SerialNumber         string  `json:"serialNumber,omitempty"`
	PartNumber           string  `json:"partNumber,omitempty"`
	SKU                  string  `json:"sku,omitempty"`
	UUID                 string  `json:"uuid,omitempty"`
	HostName             string  `json:"hostName,omitempty"`
	BiosVersion          string  `json:"biosVersion,omitempty"`
	ProcessorModel       string  `json:"processorModel,omitempty"`
	ProcessorCount       int     `json:"processorCount,omitempty"`
	TotalSystemMemoryGiB float64 `json:"totalSystemMemoryGiB,omitempty"`
}

type redfishProcessorSummary struct {
	Count int    `json:"Count"`
	Model string `json:"Model"`
}

type redfishMemorySummary struct {
	TotalSystemMemoryGiB *float64 `json:"TotalSystemMemoryGiB"`
	TotalSystemMemoryMiB *float64 `json:"TotalSystemMemoryMiB"`
}

type redfishComputerSystemDoc struct {
	Manufacturer     string                  `json:"Manufacturer"`
	Model            string                  `json:"Model"`
	SerialNumber     string                  `json:"SerialNumber"`
	SKU              string                  `json:"SKU"`
	UUID             string                  `json:"UUID"`
	HostName         string                  `json:"HostName"`
	PartNumber       string                  `json:"PartNumber"`
	BiosVersion      string                  `json:"BiosVersion"`
	ProcessorSummary *redfishProcessorSummary `json:"ProcessorSummary"`
	MemorySummary    *redfishMemorySummary    `json:"MemorySummary"`
}

type odataMemberRef struct {
	ODataID string `json:"@odata.id"`
}

type odataCollection struct {
	Members []odataMemberRef `json:"Members"`
}

type redfishDriveDoc struct {
	Name               string   `json:"Name"`
	Model              string   `json:"Model"`
	MediaType          string   `json:"MediaType"`
	CapacityBytes      *int64   `json:"CapacityBytes"`
	TemperatureCelsius *float64 `json:"TemperatureCelsius"`
	Protocol           string   `json:"Protocol"`
	Status             *redfishStatus `json:"Status"`
}

type redfishStatus struct {
	Health string `json:"Health"`
	State  string `json:"State"`
}

type redfishReading struct {
	Reading           *float64       `json:"Reading"`
	ReadingCelsius    *float64       `json:"ReadingCelsius"`
	ReadingRPM        *float64       `json:"ReadingRPM"`
	ReadingUnits      string         `json:"ReadingUnits"`
	UpperThresholdNonCritical *float64 `json:"UpperThresholdNonCritical"`
	UpperThresholdCritical    *float64 `json:"UpperThresholdCritical"`
	LowerThresholdNonCritical *float64 `json:"LowerThresholdNonCritical"`
	LowerThresholdCritical    *float64 `json:"LowerThresholdCritical"`
	Status            *redfishStatus `json:"Status"`
	PhysicalContext   string         `json:"PhysicalContext"`
	SensorNumber      *int           `json:"SensorNumber"`
	Name              string         `json:"Name"`
	MemberID          string         `json:"MemberId"`
	MemberIDAlt       string         `json:"MemberID"`
	FanName           string         `json:"FanName"`
}

type redfishThermalDoc struct {
	Temperatures []redfishReading `json:"Temperatures"`
	Fans         []redfishReading `json:"Fans"`
}

type redfishPowerControl struct {
	PowerConsumedWatts *float64       `json:"PowerConsumedWatts"`
	PowerCapacityWatts *float64       `json:"PowerCapacityWatts"`
	Name               string         `json:"Name"`
	MemberID           string         `json:"MemberId"`
	Status             *redfishStatus `json:"Status"`
}

type redfishPowerSupply struct {
	LastPowerOutputWatts *float64       `json:"LastPowerOutputWatts"`
	PowerOutputWatts     *float64       `json:"PowerOutputWatts"`
	Name                 string         `json:"Name"`
	MemberID             string         `json:"MemberId"`
	Status               *redfishStatus `json:"Status"`
}

type redfishPowerDoc struct {
	PowerControl []redfishPowerControl `json:"PowerControl"`
	PowerSupplies []redfishPowerSupply `json:"PowerSupplies"`
}

type storageSubsystemDoc struct {
	Links *struct {
		Drives *struct {
			ODataID string `json:"@odata.id"`
		} `json:"Drives"`
	} `json:"Links"`
	Drives *odataCollection `json:"Drives"`
}

type redfishClient struct {
	base   *url.URL
	user   string
	pass   string
	client *http.Client
}

func normalizeRedfishBase(raw string) (*url.URL, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil, fmt.Errorf("baseUrl 为空")
	}
	if !strings.HasPrefix(s, "http://") && !strings.HasPrefix(s, "https://") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil {
		return nil, err
	}
	if u.Host == "" {
		return nil, fmt.Errorf("无效的 baseUrl")
	}
	u.Path = strings.TrimSuffix(u.Path, "/")
	u.RawQuery = ""
	u.Fragment = ""
	return u, nil
}

func (c *redfishClient) resolvePath(odataID string) string {
	odataID = strings.TrimSpace(odataID)
	if odataID == "" {
		return ""
	}
	if strings.HasPrefix(odataID, "http://") || strings.HasPrefix(odataID, "https://") {
		u, err := url.Parse(odataID)
		if err != nil {
			return ""
		}
		return u.Path
	}
	if !strings.HasPrefix(odataID, "/") {
		odataID = "/" + odataID
	}
	return odataID
}

func (c *redfishClient) getJSON(path string) ([]byte, int, error) {
	rel := path
	if !strings.HasPrefix(rel, "/") {
		rel = "/" + rel
	}
	u := *c.base
	bp := strings.TrimSuffix(c.base.Path, "/")
	if bp == "" {
		u.Path = rel
	} else {
		u.Path = bp + rel
	}
	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, 0, err
	}
	req.SetBasicAuth(c.user, c.pass)
	req.Header.Set("Accept", "application/json")
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, resp.StatusCode, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return b, resp.StatusCode, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return b, resp.StatusCode, nil
}

func (c *redfishClient) collectMemberPaths(collectionPath string) []string {
	b, code, err := c.getJSON(collectionPath)
	if err != nil || code != 200 {
		return nil
	}
	var col odataCollection
	if err := json.Unmarshal(b, &col); err != nil {
		return nil
	}
	var out []string
	for _, m := range col.Members {
		p := c.resolvePath(m.ODataID)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func (c *redfishClient) collectDriveMemberURLs(collectionPath string) []string {
	return c.collectMemberPaths(collectionPath)
}

func newIdracRedfishClient(cfg IdracHostConfig) (*redfishClient, string) {
	base, err := normalizeRedfishBase(cfg.BaseURL)
	if err != nil {
		return nil, err.Error()
	}
	user := strings.TrimSpace(cfg.User)
	if user == "" {
		return nil, "未配置 iDRAC 用户名"
	}
	skipTLS := redfishTLSSkipVerify(cfg, base)
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: skipTLS,
			MinVersion:         tls.VersionTLS12,
		},
	}
	return &redfishClient{
		base: base,
		user: user,
		pass: cfg.Password,
		client: &http.Client{
			Timeout:   25 * time.Second,
			Transport: tr,
		},
	}, ""
}

func redfishDriveDocs(rc *redfishClient) ([]redfishDriveDoc, string) {
	if rc == nil {
		return nil, "iDRAC 客户端未初始化"
	}
	driveSet := make(map[string]struct{})
	add := func(path string) {
		p := rc.resolvePath(path)
		if p != "" {
			driveSet[p] = struct{}{}
		}
	}

	if b, code, err := rc.getJSON("/redfish/v1/Chassis"); err == nil && code == 200 {
		var col odataCollection
		if json.Unmarshal(b, &col) == nil {
			for _, ch := range col.Members {
				chp := rc.resolvePath(ch.ODataID)
				if chp == "" {
					continue
				}
				for _, dp := range rc.collectDriveMemberURLs(chp + "/Drives") {
					add(dp)
				}
			}
		}
	}

	if b, code, err := rc.getJSON("/redfish/v1/Systems/System.Embedded.1/Storage"); err == nil && code == 200 {
		var col odataCollection
		if json.Unmarshal(b, &col) == nil {
			for _, st := range col.Members {
				stPath := rc.resolvePath(st.ODataID)
				if stPath == "" {
					continue
				}
				sb, sc, err := rc.getJSON(stPath)
				if err != nil || sc != 200 {
					continue
				}
				var sub storageSubsystemDoc
				if json.Unmarshal(sb, &sub) != nil {
					continue
				}
				if sub.Drives != nil && len(sub.Drives.Members) > 0 {
					for _, m := range sub.Drives.Members {
						add(m.ODataID)
					}
					continue
				}
				if sub.Links != nil && sub.Links.Drives != nil && strings.TrimSpace(sub.Links.Drives.ODataID) != "" {
					dcp := rc.resolvePath(sub.Links.Drives.ODataID)
					if dcp == "" {
						continue
					}
					for _, dp := range rc.collectDriveMemberURLs(dcp) {
						add(dp)
					}
				}
			}
		}
	}

	finalPaths := make([]string, 0, len(driveSet))
	for p := range driveSet {
		finalPaths = append(finalPaths, p)
	}
	if len(finalPaths) == 0 {
		return nil, "未在 Redfish 中发现 Drive 资源（请确认 iDRAC / Redfish 已启用且本服务可访问带外地址）"
	}
	sort.Strings(finalPaths)

	rows := make([]redfishDriveDoc, 0, len(finalPaths))
	for _, p := range finalPaths {
		b, code, err := rc.getJSON(p)
		if err != nil || code != 200 {
			continue
		}
		var d redfishDriveDoc
		if json.Unmarshal(b, &d) != nil {
			continue
		}
		if strings.TrimSpace(d.Name) == "" {
			d.Name = p
		}
		rows = append(rows, d)
	}
	if len(rows) == 0 {
		return nil, "已发现 Drive 链接但无法解析盘信息（权限或 Redfish 版本差异）"
	}
	return rows, ""
}

func redfishStatusFields(st *redfishStatus) (string, string) {
	if st == nil {
		return "", ""
	}
	return strings.TrimSpace(st.Health), strings.TrimSpace(st.State)
}

func readingMemberID(r redfishReading) string {
	m := strings.TrimSpace(r.MemberID)
	if m == "" {
		m = strings.TrimSpace(r.MemberIDAlt)
	}
	return m
}

// effectiveReading 兼容标准 Reading、Dell ReadingCelsius / ReadingRPM 等字段。
func effectiveReading(r redfishReading) (float64, string, bool) {
	if r.Reading != nil && !math.IsNaN(*r.Reading) && !math.IsInf(*r.Reading, 0) {
		return *r.Reading, strings.TrimSpace(r.ReadingUnits), true
	}
	if r.ReadingCelsius != nil && !math.IsNaN(*r.ReadingCelsius) && !math.IsInf(*r.ReadingCelsius, 0) {
		return *r.ReadingCelsius, "Cel", true
	}
	if r.ReadingRPM != nil && !math.IsNaN(*r.ReadingRPM) && !math.IsInf(*r.ReadingRPM, 0) {
		return *r.ReadingRPM, "RPM", true
	}
	return 0, "", false
}

func redfishTelemetryPointFromReading(r redfishReading, fallbackUnit string) (IdracTelemetryPoint, bool) {
	val, ru, ok := effectiveReading(r)
	if !ok {
		return IdracTelemetryPoint{}, false
	}
	name := strings.TrimSpace(r.Name)
	if name == "" {
		name = strings.TrimSpace(r.FanName)
	}
	if name == "" {
		name = readingMemberID(r)
	}
	if name == "" {
		name = strings.TrimSpace(r.PhysicalContext)
	}
	unit := strings.TrimSpace(ru)
	if unit == "" {
		unit = fallbackUnit
	}
	health, state := redfishStatusFields(r.Status)
	uNorm := normalizeTelemetryUnit(unit)
	pt := IdracTelemetryPoint{
		Name:    name,
		Reading: roundTelemetry1(val),
		Unit:    uNorm,
		Health:  health,
		State:   state,
	}
	if uNorm == "°C" {
		if r.UpperThresholdNonCritical != nil && !math.IsNaN(*r.UpperThresholdNonCritical) {
			v := roundTelemetry1(*r.UpperThresholdNonCritical)
			pt.UpperWarningC = &v
		}
		if r.UpperThresholdCritical != nil && !math.IsNaN(*r.UpperThresholdCritical) {
			v := roundTelemetry1(*r.UpperThresholdCritical)
			pt.UpperCriticalC = &v
		}
	}
	return pt, true
}

func normalizeTelemetryUnit(unit string) string {
	u := strings.TrimSpace(unit)
	switch strings.ToLower(u) {
	case "rpm":
		return "RPM"
	case "c", "degc", "celsius", "cel", "°c":
		return "°C"
	default:
		return u
	}
}

func roundTelemetry1(v float64) float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0
	}
	return math.Round(v*10) / 10
}

func redfishTextLooksLikeCPU(s string) bool {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return false
	}
	if strings.Contains(s, "inlet") || strings.Contains(s, "intake") || strings.Contains(s, "exhaust") {
		return false
	}
	return strings.Contains(s, "cpu") || strings.Contains(s, "proc") || strings.Contains(s, "processor")
}

func redfishTextLooksLikeDisk(s string) bool {
	s = strings.ToLower(strings.TrimSpace(s))
	for _, kw := range []string{"disk", "drive", "hdd", "ssd", "nvme", "pdisk", "storage", "backplane"} {
		if strings.Contains(s, kw) {
			return true
		}
	}
	return false
}

func redfishReadingIsCPU(r redfishReading) bool {
	return redfishTextLooksLikeCPU(strings.Join([]string{r.Name, readingMemberID(r), r.PhysicalContext}, " "))
}

func redfishReadingIsDisk(r redfishReading) bool {
	return redfishTextLooksLikeDisk(strings.Join([]string{r.Name, readingMemberID(r), r.PhysicalContext}, " "))
}

func sortTelemetryPoints(points []IdracTelemetryPoint) {
	sort.Slice(points, func(i, j int) bool {
		return strings.ToLower(points[i].Name) < strings.ToLower(points[j].Name)
	})
}

func maxTelemetryReading(points []IdracTelemetryPoint) float64 {
	if len(points) == 0 {
		return 0
	}
	mx := points[0].Reading
	for i := 1; i < len(points); i++ {
		if points[i].Reading > mx {
			mx = points[i].Reading
		}
	}
	return roundTelemetry1(mx)
}

func avgTelemetryReading(points []IdracTelemetryPoint) float64 {
	if len(points) == 0 {
		return 0
	}
	total := 0.0
	count := 0
	for _, p := range points {
		if p.Reading <= 0 || math.IsNaN(p.Reading) || math.IsInf(p.Reading, 0) {
			continue
		}
		total += p.Reading
		count++
	}
	if count == 0 {
		return 0
	}
	return roundTelemetry1(total / float64(count))
}

// FetchIdracSystemSummary 读取 Redfish Systems 资源（优先 System.Embedded.1）。
func FetchIdracSystemSummary(cfg IdracHostConfig) (*IdracSystemSummary, string) {
	rc, msg := newIdracRedfishClient(cfg)
	if rc == nil {
		return nil, msg
	}
	tryPaths := []string{"/redfish/v1/Systems/System.Embedded.1"}
	if b, code, err := rc.getJSON("/redfish/v1/Systems"); err == nil && code == 200 {
		var col odataCollection
		if json.Unmarshal(b, &col) == nil {
			for _, m := range col.Members {
				p := rc.resolvePath(m.ODataID)
				if p == "" {
					continue
				}
				if p == "/redfish/v1/Systems/System.Embedded.1" {
					continue
				}
				tryPaths = append(tryPaths, p)
				break
			}
		}
	}
	for _, path := range tryPaths {
		b, code, err := rc.getJSON(path)
		if err != nil || code != 200 {
			continue
		}
		var sys redfishComputerSystemDoc
		if json.Unmarshal(b, &sys) != nil {
			continue
		}
		if strings.TrimSpace(sys.Model) == "" && strings.TrimSpace(sys.Manufacturer) == "" && strings.TrimSpace(sys.SerialNumber) == "" {
			continue
		}
		out := &IdracSystemSummary{
			Manufacturer: strings.TrimSpace(sys.Manufacturer),
			Model:          strings.TrimSpace(sys.Model),
			SerialNumber:   strings.TrimSpace(sys.SerialNumber),
			PartNumber:     strings.TrimSpace(sys.PartNumber),
			SKU:            strings.TrimSpace(sys.SKU),
			UUID:           strings.TrimSpace(sys.UUID),
			HostName:       strings.TrimSpace(sys.HostName),
			BiosVersion:    strings.TrimSpace(sys.BiosVersion),
		}
		if sys.ProcessorSummary != nil {
			out.ProcessorModel = strings.TrimSpace(sys.ProcessorSummary.Model)
			out.ProcessorCount = sys.ProcessorSummary.Count
		}
		if sys.MemorySummary != nil {
			if sys.MemorySummary.TotalSystemMemoryGiB != nil && *sys.MemorySummary.TotalSystemMemoryGiB > 0 {
				out.TotalSystemMemoryGiB = roundTelemetry1(*sys.MemorySummary.TotalSystemMemoryGiB)
			} else if sys.MemorySummary.TotalSystemMemoryMiB != nil && *sys.MemorySummary.TotalSystemMemoryMiB > 0 {
				out.TotalSystemMemoryGiB = roundTelemetry1(*sys.MemorySummary.TotalSystemMemoryMiB / 1024)
			}
		}
		return out, ""
	}
	return nil, "无法从 Redfish Systems 读取机型/序列号（请确认账号权限与 Redfish 版本）"
}

func powerValueFromDoc(doc redfishPowerDoc) float64 {
	vals := make([]float64, 0, len(doc.PowerControl))
	for _, p := range doc.PowerControl {
		if p.PowerConsumedWatts != nil && !math.IsNaN(*p.PowerConsumedWatts) && !math.IsInf(*p.PowerConsumedWatts, 0) {
			vals = append(vals, *p.PowerConsumedWatts)
		}
	}
	if len(vals) == 0 {
		for _, p := range doc.PowerSupplies {
			if p.LastPowerOutputWatts != nil && !math.IsNaN(*p.LastPowerOutputWatts) && !math.IsInf(*p.LastPowerOutputWatts, 0) {
				vals = append(vals, *p.LastPowerOutputWatts)
				continue
			}
			if p.PowerOutputWatts != nil && !math.IsNaN(*p.PowerOutputWatts) && !math.IsInf(*p.PowerOutputWatts, 0) {
				vals = append(vals, *p.PowerOutputWatts)
			}
		}
	}
	if len(vals) == 0 {
		return 0
	}
	total := 0.0
	for _, v := range vals {
		total += v
	}
	return roundTelemetry1(total)
}

// FetchIdracTelemetrySnapshot 通过 iDRAC Redfish 抓取功耗、风扇与温度快照。
func FetchIdracTelemetrySnapshot(cfg IdracHostConfig) (*IdracTelemetrySnapshot, string) {
	rc, msg := newIdracRedfishClient(cfg)
	if rc == nil {
		return nil, msg
	}
	chassisPaths := rc.collectMemberPaths("/redfish/v1/Chassis")
	if len(chassisPaths) == 0 {
		return nil, "未在 Redfish 中发现 Chassis 资源（请确认 iDRAC / Redfish 已启用且本服务可访问带外地址）"
	}
	sort.Strings(chassisPaths)

	snapshot := &IdracTelemetrySnapshot{
		CollectedAt: time.Now().UTC().Format(time.RFC3339),
	}
	notes := []string{}
	powerFound := false

	for _, chPath := range chassisPaths {
		if b, code, err := rc.getJSON(chPath + "/Power"); err == nil && code == 200 {
			var doc redfishPowerDoc
			if json.Unmarshal(b, &doc) == nil {
				if watts := powerValueFromDoc(doc); watts > 0 {
					snapshot.PowerWatts += watts
					powerFound = true
				}
			}
		}
		if b, code, err := rc.getJSON(chPath + "/Thermal"); err == nil && code == 200 {
			var doc redfishThermalDoc
			if json.Unmarshal(b, &doc) == nil {
				for _, fan := range doc.Fans {
					if p, ok := redfishTelemetryPointFromReading(fan, "RPM"); ok {
						snapshot.Fans = append(snapshot.Fans, p)
					}
				}
				for _, temp := range doc.Temperatures {
					p, ok := redfishTelemetryPointFromReading(temp, "°C")
					if !ok {
						continue
					}
					switch {
					case redfishReadingIsCPU(temp):
						snapshot.CpuSensors = append(snapshot.CpuSensors, p)
					case redfishReadingIsDisk(temp):
						snapshot.DiskSensors = append(snapshot.DiskSensors, p)
					default:
						snapshot.OtherTemperatures = append(snapshot.OtherTemperatures, p)
					}
				}
			}
		}
	}

	if docs, errMsg := redfishDriveDocs(rc); errMsg == "" {
		for _, d := range docs {
			if d.TemperatureCelsius == nil || math.IsNaN(*d.TemperatureCelsius) || math.IsInf(*d.TemperatureCelsius, 0) {
				continue
			}
			health, state := redfishStatusFields(d.Status)
			name := strings.TrimSpace(d.Name)
			if name == "" {
				name = strings.TrimSpace(d.Model)
			}
			snapshot.DiskSensors = append(snapshot.DiskSensors, IdracTelemetryPoint{
				Name:    name,
				Reading: roundTelemetry1(*d.TemperatureCelsius),
				Unit:    "°C",
				Health:  health,
				State:   state,
			})
		}
	} else {
		notes = append(notes, errMsg)
	}

	sortTelemetryPoints(snapshot.Fans)
	sortTelemetryPoints(snapshot.CpuSensors)
	sortTelemetryPoints(snapshot.DiskSensors)
	sortTelemetryPoints(snapshot.OtherTemperatures)

	snapshot.FanCount = len(snapshot.Fans)
	snapshot.CpuSensorCount = len(snapshot.CpuSensors)
	snapshot.DiskSensorCount = len(snapshot.DiskSensors)
	if powerFound {
		snapshot.PowerWatts = roundTelemetry1(snapshot.PowerWatts)
	}
	if len(snapshot.Fans) > 0 {
		snapshot.FanRpm = avgTelemetryReading(snapshot.Fans)
	}
	if len(snapshot.CpuSensors) > 0 {
		snapshot.CpuTemperatureC = maxTelemetryReading(snapshot.CpuSensors)
	}
	if len(snapshot.DiskSensors) > 0 {
		snapshot.DiskTemperatureC = maxTelemetryReading(snapshot.DiskSensors)
	}
	if len(notes) > 0 {
		snapshot.Note = strings.Join(notes, "；")
	}

	if !powerFound && len(snapshot.Fans) == 0 && len(snapshot.CpuSensors) == 0 && len(snapshot.DiskSensors) == 0 && len(snapshot.OtherTemperatures) == 0 {
		return nil, "未在 Redfish 中发现功耗 / 风扇 / 温度传感器"
	}
	return snapshot, ""
}

// FetchIdracMemoryModules 枚举 Systems/*/Memory 下的 DIMM 摘要。
func FetchIdracMemoryModules(cfg IdracHostConfig) ([]IdracMemoryModuleRow, string) {
	rc, msg := newIdracRedfishClient(cfg)
	if rc == nil {
		return nil, msg
	}
	trySystems := []string{"/redfish/v1/Systems/System.Embedded.1"}
	if b, code, err := rc.getJSON("/redfish/v1/Systems"); err == nil && code == 200 {
		var col odataCollection
		if json.Unmarshal(b, &col) == nil {
			for _, m := range col.Members {
				p := rc.resolvePath(m.ODataID)
				if p == "" || p == "/redfish/v1/Systems/System.Embedded.1" {
					continue
				}
				trySystems = append(trySystems, p)
				break
			}
		}
	}
	for _, sp := range trySystems {
		b, code, err := rc.getJSON(sp + "/Memory")
		if err != nil || code != 200 {
			continue
		}
		var col odataCollection
		if json.Unmarshal(b, &col) != nil || len(col.Members) == 0 {
			continue
		}
		rows := make([]IdracMemoryModuleRow, 0, len(col.Members))
		for _, mem := range col.Members {
			mp := rc.resolvePath(mem.ODataID)
			if mp == "" {
				continue
			}
			mb, mc, err := rc.getJSON(mp)
			if err != nil || mc != 200 {
				continue
			}
			var mo struct {
				Name              string         `json:"Name"`
				Manufacturer      string         `json:"Manufacturer"`
				PartNumber        string         `json:"PartNumber"`
				CapacityMiB       *int64         `json:"CapacityMiB"`
				OperatingSpeedMhz *int           `json:"OperatingSpeedMhz"`
				MemoryDeviceType  string         `json:"MemoryDeviceType"`
				Status            *redfishStatus `json:"Status"`
			}
			if json.Unmarshal(mb, &mo) != nil {
				continue
			}
			if strings.TrimSpace(mo.Name) == "" && (mo.CapacityMiB == nil || *mo.CapacityMiB <= 0) {
				continue
			}
			h, st := redfishStatusFields(mo.Status)
			row := IdracMemoryModuleRow{
				Name:         strings.TrimSpace(mo.Name),
				Manufacturer: strings.TrimSpace(mo.Manufacturer),
				PartNumber:   strings.TrimSpace(mo.PartNumber),
				DeviceType:   strings.TrimSpace(mo.MemoryDeviceType),
				Health:       h,
				State:        st,
			}
			if mo.OperatingSpeedMhz != nil {
				row.OperatingMHz = *mo.OperatingSpeedMhz
			}
			if mo.CapacityMiB != nil && *mo.CapacityMiB > 0 {
				row.CapacityMiB = *mo.CapacityMiB
			}
			rows = append(rows, row)
		}
		if len(rows) > 0 {
			return rows, ""
		}
	}
	return nil, "未在 Redfish 中读取到 Memory 集合（权限、机型或 iDRAC 版本可能不支持）"
}

// FetchIdracPhysicalDisks 通过 iDRAC Redfish 枚举物理盘（Chassis Drives + System Storage Drives）。
func FetchIdracPhysicalDisks(cfg IdracHostConfig) ([]IdracPhysicalDiskRow, string) {
	rc, msg := newIdracRedfishClient(cfg)
	if rc == nil {
		return nil, msg
	}
	docs, errMsg := redfishDriveDocs(rc)
	if errMsg != "" {
		return nil, errMsg
	}
	rows := make([]IdracPhysicalDiskRow, 0, len(docs))
	for _, d := range docs {
		r := IdracPhysicalDiskRow{
			Name:      strings.TrimSpace(d.Name),
			Model:     strings.TrimSpace(d.Model),
			MediaType: strings.TrimSpace(d.MediaType),
			Protocol:  strings.TrimSpace(d.Protocol),
		}
		if d.CapacityBytes != nil {
			r.CapacityBytes = *d.CapacityBytes
		}
		if d.Status != nil {
			r.Health = strings.TrimSpace(d.Status.Health)
			r.State = strings.TrimSpace(d.Status.State)
		}
		if r.Name == "" {
			r.Name = strings.TrimSpace(d.Model)
		}
		if d.TemperatureCelsius != nil && !math.IsNaN(*d.TemperatureCelsius) && !math.IsInf(*d.TemperatureCelsius, 0) {
			r.TemperatureCelsius = roundTelemetry1(*d.TemperatureCelsius)
		}
		rows = append(rows, r)
	}
	if len(rows) == 0 {
		return nil, "已发现 Drive 链接但无法解析盘信息（权限或 Redfish 版本差异）"
	}
	return rows, ""
}
