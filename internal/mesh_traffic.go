package internal

// 异地组网流量采集：SSH 到子网路由节点执行 `tailscale status --json`，
// 解析每个 peer 的 RxBytes/TxBytes（tailscaled 启动以来的累计值）与在线状态。
// headscales 服务端不经过 P2P 数据面，服务端 metrics 里没有节点间流量，
// 因此流量数据必须从路由节点侧采集。

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// MeshTrafficPeer 路由节点视角的一个对端。
type MeshTrafficPeer struct {
	HostName     string   `json:"hostName"`
	DNSName      string   `json:"dnsName,omitempty"`
	TailscaleIPs []string `json:"tailscaleIps,omitempty"`
	OS           string   `json:"os,omitempty"`
	Online       bool     `json:"online"`
	LastSeen     string   `json:"lastSeen,omitempty"`
	RxBytes      int64    `json:"rxBytes"`
	TxBytes      int64    `json:"txBytes"`
	CurAddr      string   `json:"curAddr,omitempty"` // 当前直连地址；空表示走 DERP 中继
	Relay        string   `json:"relay,omitempty"`
}

// MeshTrafficSnapshot 一次采集的完整快照。
type MeshTrafficSnapshot struct {
	CollectorID   string            `json:"collectorId"`
	CollectorName string            `json:"collectorName"`
	Host          string            `json:"host"`
	CollectedAt   string            `json:"collectedAt"`
	HostKeyFp     string            `json:"hostKeyFp,omitempty"` // TOFU 学习到的指纹
	Version       string            `json:"version,omitempty"`
	BackendState  string            `json:"backendState,omitempty"`
	SelfHostName  string            `json:"selfHostName,omitempty"`
	SelfIPs       []string          `json:"selfIps,omitempty"`
	Peers         []MeshTrafficPeer `json:"peers"`
	Error         string            `json:"error,omitempty"`
}

type tsStatusJSON struct {
	Version      string `json:"Version"`
	BackendState string `json:"BackendState"`
	Self         struct {
		HostName     string   `json:"HostName"`
		DNSName      string   `json:"DNSName"`
		TailscaleIPs []string `json:"TailscaleIPs"`
		Online       bool     `json:"Online"`
	} `json:"Self"`
	Peer map[string]struct {
		HostName     string   `json:"HostName"`
		DNSName      string   `json:"DNSName"`
		TailscaleIPs []string `json:"TailscaleIPs"`
		OS           string   `json:"OS"`
		Online       bool     `json:"Online"`
		LastSeen     string   `json:"LastSeen"`
		RxBytes      int64    `json:"RxBytes"`
		TxBytes      int64    `json:"TxBytes"`
		CurAddr      string   `json:"CurAddr"`
		Relay        string   `json:"Relay"`
	} `json:"Peer"`
}

// MeshTrafficCollector 对应 mesh_store.go 中的采集器定义（此处仅操作快照/指纹）。

// collectMeshTrafficViaSSH 采集单个采集器的流量快照。
// Host key 采用 TOFU：collector.HostKeyFp 为空时记录本次指纹并放行，
// 之后指纹不一致直接拒绝（防中间人）。
func collectMeshTrafficViaSSH(ctx context.Context, c MeshTrafficCollector, password string) MeshTrafficSnapshot {
	snap := MeshTrafficSnapshot{
		CollectorID: c.ID, CollectorName: c.Name, Host: c.Host,
		CollectedAt: time.Now().UTC().Format(time.RFC3339), Peers: []MeshTrafficPeer{},
	}
	port := c.Port
	if port <= 0 {
		port = 22
	}
	if strings.TrimSpace(c.Host) == "" || strings.TrimSpace(c.User) == "" {
		snap.Error = "采集器未配置主机或用户名"
		return snap
	}
	if strings.TrimSpace(password) == "" {
		snap.Error = "未配置 SSH 密码"
		return snap
	}
	var learnedFp string
	hostKeyCb := func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		fp := ssh.FingerprintSHA256(key)
		if strings.TrimSpace(c.HostKeyFp) == "" {
			learnedFp = fp
			return nil
		}
		if fp != strings.TrimSpace(c.HostKeyFp) {
			return fmt.Errorf("SSH host key 指纹不匹配（可能存在中间人），期望 %s，实际 %s", c.HostKeyFp, fp)
		}
		return nil
	}
	dialer := &net.Dialer{Timeout: 8 * time.Second}
	cfg := &ssh.ClientConfig{
		User:            c.User,
		Auth:            []ssh.AuthMethod{ssh.Password(password)},
		HostKeyCallback: hostKeyCb,
		Timeout:         8 * time.Second,
	}
	conn, err := dialer.DialContext(ctx, "tcp", fmt.Sprintf("%s:%d", c.Host, port))
	if err != nil {
		snap.Error = "连接失败: " + err.Error()
		return snap
	}
	sshConn, chans, reqs, err := ssh.NewClientConn(conn, fmt.Sprintf("%s:%d", c.Host, port), cfg)
	if err != nil {
		snap.Error = "SSH 握手失败: " + err.Error()
		return snap
	}
	defer sshConn.Close()
	snap.HostKeyFp = learnedFp
	client := ssh.NewClient(sshConn, chans, reqs)
	defer client.Close()

	sess, err := client.NewSession()
	if err != nil {
		snap.Error = "创建会话失败: " + err.Error()
		return snap
	}
	defer sess.Close()
	done := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			_ = sess.Close()
		case <-done:
		}
	}()
	cmd := strings.TrimSpace(c.Command)
	if cmd == "" {
		cmd = "tailscale status --json"
	}
	out, runErr := sess.CombinedOutput(cmd + " 2>/dev/null")
	close(done)
	var st tsStatusJSON
	if json.Unmarshal(trimToJSONObject(out), &st) != nil {
		// 普通执行失败（如群晖上 tailscale 在容器内、需 root）：用已知 SSH 密码走 sudo -S 重试
		if sess2, e2 := client.NewSession(); e2 == nil {
			defer sess2.Close()
			done2 := make(chan struct{})
			go func() {
				select {
				case <-ctx.Done():
					_ = sess2.Close()
				case <-done2:
				}
			}()
			sess2.Stdin = strings.NewReader(password + "\n")
			out2, err2 := sess2.CombinedOutput("sudo -S -p '' sh -c " + shellQuote(cmd) + " 2>/dev/null")
			close(done2)
			out, runErr = out2, err2
		}
	}
	// trimToJSONObject：群晖等设备 sshd 会在会话 stderr 混入登录横幅（如 chdir 警告），
	// CombinedOutput 拿到的内容在 JSON 前带杂质，直接 Unmarshal 会失败
	if json.Unmarshal(trimToJSONObject(out), &st) != nil {
		if runErr != nil && len(strings.TrimSpace(string(out))) == 0 {
			snap.Error = "执行采集命令失败: " + runErr.Error()
		} else {
			snap.Error = "解析 tailscale status 失败（节点未安装 tailscale 或输出异常）"
		}
		return snap
	}
	snap.Version = st.Version
	snap.BackendState = st.BackendState
	snap.SelfHostName = st.Self.HostName
	snap.SelfIPs = st.Self.TailscaleIPs
	for _, p := range st.Peer {
		snap.Peers = append(snap.Peers, MeshTrafficPeer{
			HostName: p.HostName, DNSName: p.DNSName, TailscaleIPs: p.TailscaleIPs,
			OS: p.OS, Online: p.Online, LastSeen: p.LastSeen,
			RxBytes: p.RxBytes, TxBytes: p.TxBytes, CurAddr: p.CurAddr, Relay: p.Relay,
		})
	}
	sort.Slice(snap.Peers, func(i, j int) bool {
		a, b := snap.Peers[i], snap.Peers[j]
		if a.Online != b.Online {
			return a.Online
		}
		return a.RxBytes+a.TxBytes > b.RxBytes+b.TxBytes
	})
	return snap
}

// collectMeshTrafficAll 并发采集实例下全部采集器，并把成功快照写入 KV 缓存。
func collectMeshTrafficAll(app *ServerApp, inst MeshInstance) []MeshTrafficSnapshot {
	key, err := meshEncryptionKey(app.Cfg())
	if err != nil {
		key = nil
	}
	collectors := inst.TrafficCollectors
	snaps := make([]MeshTrafficSnapshot, len(collectors))
	var wg sync.WaitGroup
	for i, c := range collectors {
		wg.Add(1)
		go func(i int, c MeshTrafficCollector) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
			defer cancel()
			pass := ""
			if key != nil {
				pass, _ = decryptSecret(key, c.PassEnc)
			}
			snaps[i] = collectMeshTrafficViaSSH(ctx, c, pass)
		}(i, c)
	}
	wg.Wait()
	// 回写运行时状态 + 缓存最近快照
	cur := loadMeshSettings(app.PlatformKV())
	now := time.Now().UTC().Format(time.RFC3339)
	for i, c := range collectors {
		for ci := range cur.Instances {
			if cur.Instances[ci].ID != inst.ID {
				continue
			}
			for j := range cur.Instances[ci].TrafficCollectors {
				tc := &cur.Instances[ci].TrafficCollectors[j]
				if tc.ID != c.ID {
					continue
				}
				tc.LastSnapshotAt = now
				tc.LastError = snaps[i].Error
				if snaps[i].Error == "" && snaps[i].HostKeyFp != "" && strings.TrimSpace(tc.HostKeyFp) == "" {
					tc.HostKeyFp = snaps[i].HostKeyFp
				}
			}
		}
	}
	_ = saveMeshSettings(app.PlatformKV(), cur)
	cache := loadMeshTrafficCache(app.PlatformKV())
	for _, s := range snaps {
		if s.Error == "" {
			cache[s.CollectorID] = s
		}
	}
	saveMeshTrafficCache(app.PlatformKV(), cache)
	appendMeshTrafficHistory(app.PlatformKV(), snaps)
	return snaps
}

const kvKeyMeshTraffic = "labplane_mesh_traffic_v1"
const kvKeyMeshTrafficHistory = "labplane_mesh_traffic_history_v1"

// meshTrafficHistoryMaxPerCollector 每采集器保留的历史快照上限（约 4h@1min 间隔）。
const meshTrafficHistoryMaxPerCollector = 240

// loadMeshTrafficHistory 读取流量历史序列（供前端画趋势图）。
func loadMeshTrafficHistory(kv PlatformKV) map[string][]MeshTrafficSnapshot {
	out := map[string][]MeshTrafficSnapshot{}
	if kv == nil {
		return out
	}
	raw, ok := kv.Get(kvKeyMeshTrafficHistory)
	if !ok || strings.TrimSpace(raw) == "" {
		return out
	}
	var h struct {
		Items map[string][]MeshTrafficSnapshot `json:"items"`
	}
	if json.Unmarshal([]byte(raw), &h) == nil && h.Items != nil {
		return h.Items
	}
	return out
}

// appendMeshTrafficHistory 追加本次成功的快照到历史序列并按上限裁剪。
func appendMeshTrafficHistory(kv PlatformKV, snaps []MeshTrafficSnapshot) {
	if kv == nil {
		return
	}
	hist := loadMeshTrafficHistory(kv)
	for _, s := range snaps {
		if s.Error != "" {
			continue
		}
		items := append(hist[s.CollectorID], s)
		if len(items) > meshTrafficHistoryMaxPerCollector {
			items = items[len(items)-meshTrafficHistoryMaxPerCollector:]
		}
		hist[s.CollectorID] = items
	}
	js, err := json.Marshal(struct {
		Items map[string][]MeshTrafficSnapshot `json:"items"`
	}{Items: hist})
	if err != nil {
		return
	}
	_ = kv.Set(kvKeyMeshTrafficHistory, string(js))
}

// shellQuote 单引号转义，用于把采集命令安全地包进远端 sh -c。
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// trimToJSONObject 裁掉 JSON 前的杂质（登录横幅/chdir 警告等），从第一个 '{' 开始返回。
func trimToJSONObject(b []byte) []byte {
	if i := bytes.IndexByte(b, '{'); i > 0 {
		return b[i:]
	}
	return b
}

// StartMeshTrafficWorker 后台定时 SSH 采集流量快照并写入 Redis 热层，
// 页面打开即读热数据，无需等待采集。interval <=0 不启动；实例禁用或无采集器则跳过；
// 采集失败静默记录到采集器 lastError。多副本重复执行无害（只读操作）。
// 同时 best-effort 缓存 headscale 版本与精简 metrics（9090 不可达时页面回退热缓存）。
func StartMeshTrafficWorker(ctx context.Context, app *ServerApp, interval time.Duration) {
	if interval <= 0 {
		return
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				b := loadMeshSettings(app.PlatformKV())
				for i := range b.Instances {
					inst := b.Instances[i]
					if !inst.Enabled {
						continue
					}
					if len(inst.TrafficCollectors) > 0 {
						_ = collectMeshTrafficAll(app, inst)
					}
					// 密钥 used 翻转检测：页面关闭时也能记录"使用时间"
					if cli, _, ok, _ := meshClientFor(app, inst.ID); ok {
						if keys, err := cli.ListPreAuthKeys(ctx, ""); err == nil {
							reconcileKeyMeta(app.PlatformKV(), keys)
						}
					}
					if v := fetchHeadscaleVersion(app.Cfg(), inst); v != "" {
						saveMeshVersion(app.PlatformKV(), inst.ID, v)
					}
					if samples, err := fetchHeadscaleSamples(app.Cfg(), inst); err == nil {
						saveMeshMetricsCache(app.PlatformKV(), inst.ID, pickMeshMetrics(samples))
					}
				}
			}
		}
	}()
}

// ── headscale 版本 / 精简 metrics 热缓存 ──

const kvKeyMeshVersions = "labplane_mesh_versions_v1"
const kvKeyMeshMetricsCache = "labplane_mesh_metrics_cache_v1"

type meshVersionEntry struct {
	Version   string    `json:"version"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type meshMetricsCacheEntry struct {
	Samples     []HSMetricSample `json:"samples"`
	CollectedAt time.Time        `json:"collectedAt"`
}

func loadMeshVersions(kv PlatformKV) map[string]meshVersionEntry {
	out := map[string]meshVersionEntry{}
	if kv == nil {
		return out
	}
	raw, ok := kv.Get(kvKeyMeshVersions)
	if !ok || strings.TrimSpace(raw) == "" {
		return out
	}
	var m struct {
		Items map[string]meshVersionEntry `json:"items"`
	}
	if json.Unmarshal([]byte(raw), &m) == nil && m.Items != nil {
		return m.Items
	}
	return out
}

func saveMeshVersion(kv PlatformKV, instID, version string) {
	if kv == nil || version == "" {
		return
	}
	items := loadMeshVersions(kv)
	items[instID] = meshVersionEntry{Version: version, UpdatedAt: time.Now()}
	if js, err := json.Marshal(struct {
		Items map[string]meshVersionEntry `json:"items"`
	}{Items: items}); err == nil {
		_ = kv.Set(kvKeyMeshVersions, string(js))
	}
}

func loadMeshMetricsCache(kv PlatformKV) map[string]meshMetricsCacheEntry {
	out := map[string]meshMetricsCacheEntry{}
	if kv == nil {
		return out
	}
	raw, ok := kv.Get(kvKeyMeshMetricsCache)
	if !ok || strings.TrimSpace(raw) == "" {
		return out
	}
	var m struct {
		Items map[string]meshMetricsCacheEntry `json:"items"`
	}
	if json.Unmarshal([]byte(raw), &m) == nil && m.Items != nil {
		return m.Items
	}
	return out
}

func saveMeshMetricsCache(kv PlatformKV, instID string, samples []HSMetricSample) {
	if kv == nil || len(samples) == 0 {
		return
	}
	items := loadMeshMetricsCache(kv)
	items[instID] = meshMetricsCacheEntry{Samples: samples, CollectedAt: time.Now()}
	if js, err := json.Marshal(struct {
		Items map[string]meshMetricsCacheEntry `json:"items"`
	}{Items: items}); err == nil {
		_ = kv.Set(kvKeyMeshMetricsCache, string(js))
	}
}

// fetchHeadscaleSamples 拉取实例 /metrics（best-effort，短超时）。
func fetchHeadscaleSamples(cfg Config, inst MeshInstance) ([]HSMetricSample, error) {
	key, err := meshEncryptionKey(cfg)
	if err != nil {
		return nil, err
	}
	apiKey, _ := decryptSecret(key, inst.APIKeyEnc)
	mURL := strings.TrimSpace(inst.MetricsURL)
	if mURL == "" {
		mURL = deriveMetricsURL(inst.APIURL)
	}
	if mURL == "" {
		return nil, fmt.Errorf("无法推导 metrics 地址")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	return FetchMetrics(ctx, mURL, apiKey, 4*time.Second)
}

// fetchHeadscaleVersion 从 /metrics build info 提取版本号（best-effort）。
func fetchHeadscaleVersion(cfg Config, inst MeshInstance) string {
	samples, err := fetchHeadscaleSamples(cfg, inst)
	if err != nil {
		return ""
	}
	for _, s := range samples {
		if s.Name == "headscale_build_info" {
			return s.Labels["version"]
		}
	}
	return ""
}

// TailscaleProbeResult 自动扫描结果：Mode = native | docker | podman | nerdctl | crictl | none。
type TailscaleProbeResult struct {
	Mode    string `json:"mode"`
	Command string `json:"command"`
	Version string `json:"version,omitempty"`
	Raw     string `json:"raw,omitempty"`
}

// tailscaleProbeScript 节点内执行的探测脚本：
// 1) 原生二进制——扩展 PATH 后按常见路径逐一试探（覆盖 deb/rpm、snap、手动安装）；
// 2) 容器化运行——依次尝试 docker / podman / nerdctl / crictl（k8s containerd），
//    每个运行时在无权限时自动 `sudo -n` 重试（群晖等 root 场景由外层 sudo -S 兜底）。
const tailscaleProbeScript = `
export PATH="$PATH:/usr/local/bin:/usr/sbin:/sbin:/snap/bin:/opt/bin:/usr/lib/tailscale/bin"
for c in tailscale /usr/bin/tailscale /usr/local/bin/tailscale /usr/sbin/tailscale /sbin/tailscale /opt/tailscale/bin/tailscale /usr/lib/tailscale/bin/tailscale /snap/bin/tailscale "$HOME/tailscale"; do
  if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then
    echo "native:$c"
    "$c" version 2>/dev/null | head -n 1
    exit 0
  fi
done
for R in docker podman nerdctl; do
  command -v "$R" >/dev/null 2>&1 || continue
  OUT=$("$R" ps --format "{{.Names}} {{.Image}}" 2>/dev/null)
  [ -z "$OUT" ] && OUT=$(sudo -n "$R" ps --format "{{.Names}} {{.Image}}" 2>/dev/null)
  echo "$OUT" | grep -i tailscale | head -n 3 | while read n img; do echo "$R:$R:$n"; done
done
if command -v crictl >/dev/null 2>&1; then
  OUT=$(crictl ps -a 2>/dev/null)
  [ -z "$OUT" ] && OUT=$(sudo -n crictl ps -a 2>/dev/null)
  echo "$OUT" | grep -i tailscale | head -n 3 | while read id rest; do echo "crictl:crictl:$id"; done
fi
if command -v systemctl >/dev/null 2>&1 && systemctl is-active tailscaled >/dev/null 2>&1; then
  echo "native:tailscale"
  tailscale version 2>/dev/null | head -n 1
  exit 0
fi
echo "none"
`

// parseTailscaleProbe 解析探测输出。容器行格式 `runtime:binary:container`，
// runtime ∈ docker/podman/nerdctl/crictl；原生行为 `native:path`（下一行为版本，可缺省）。
func parseTailscaleProbe(out string) (TailscaleProbeResult, bool) {
	var best TailscaleProbeResult
	found := false
	lines := strings.Split(out, "\n")
	for i, ln := range lines {
		ln = strings.TrimSpace(ln)
		switch {
		case strings.HasPrefix(ln, "native:"):
			path := strings.TrimPrefix(ln, "native:")
			best = TailscaleProbeResult{Mode: "native", Command: path + " status --json"}
			if i+1 < len(lines) {
				v := strings.TrimSpace(lines[i+1])
				if v != "" && !strings.HasPrefix(v, "native:") && !strings.HasPrefix(v, "none:") &&
					!isContainerProbeLine(v) {
					best.Version = v
				}
			}
			found = true
		case isContainerProbeLine(ln):
			runtime := ln[:strings.Index(ln, ":")]
			rest := strings.TrimPrefix(ln, runtime+":")
			parts := strings.SplitN(rest, ":", 2)
			if len(parts) == 2 {
				best = TailscaleProbeResult{Mode: runtime, Command: parts[0] + " exec " + parts[1] + " tailscale status --json"}
				found = true
			}
		}
	}
	return best, found
}

func isContainerProbeLine(ln string) bool {
	for _, p := range []string{"docker:", "podman:", "nerdctl:", "crictl:"} {
		if strings.HasPrefix(ln, p) {
			return true
		}
	}
	return false
}

// ProbeTailscaleInstall SSH 登录节点探测 tailscale 安装方式并生成采集命令。
// 先以普通用户执行探测脚本；群晖等需要 root 的场景自动用密码走 sudo -S 重试。
// HostKey 校验采用 TOFU-宽松模式（仅读取状态，不写入配置），指纹以正式采集首次学习为准。
func ProbeTailscaleInstall(ctx context.Context, host string, port int, user, password string) TailscaleProbeResult {
	res := TailscaleProbeResult{Mode: "none"}
	script := tailscaleProbeScript
	run := func(sudo bool) string {
		cfg := &ssh.ClientConfig{
			User:            user,
			Auth:            []ssh.AuthMethod{ssh.Password(password)},
			HostKeyCallback: ssh.InsecureIgnoreHostKey(),
			Timeout:         6 * time.Second,
		}
		conn, err := (&net.Dialer{Timeout: 6 * time.Second}).DialContext(ctx, "tcp", net.JoinHostPort(host, strconv.Itoa(port)))
		if err != nil {
			return "SSH 连接失败: " + err.Error()
		}
		sshConn, chans, reqs, err := ssh.NewClientConn(conn, net.JoinHostPort(host, strconv.Itoa(port)), cfg)
		if err != nil {
			return "SSH 握手失败: " + err.Error()
		}
		defer sshConn.Close()
		client := ssh.NewClient(sshConn, chans, reqs)
		defer client.Close()
		sess, err := client.NewSession()
		if err != nil {
			return "创建会话失败: " + err.Error()
		}
		defer sess.Close()
		if sudo {
			sess.Stdin = strings.NewReader(password + "\n")
			out, _ := sess.CombinedOutput("sudo -S -p '' sh -c " + shellQuote(script) + " 2>/dev/null")
			return string(out)
		}
		out, _ := sess.CombinedOutput(script + " 2>/dev/null")
		return string(out)
	}

	raw := run(false)
	if r, ok := parseTailscaleProbe(raw); ok {
		res = r
	}
	if res.Mode == "none" {
		// 需要提权的场景（群晖 docker、非 root 用户）用 sudo 重试一次
		raw2 := run(true)
		if r, ok := parseTailscaleProbe(raw2); ok {
			res = r
		} else if trimmed := strings.TrimSpace(raw2); trimmed != "" && len(trimmed) > len(strings.TrimSpace(raw)) {
			raw = raw2
		}
	}
	if len(res.Raw) == 0 {
		raw = strings.TrimSpace(raw)
		if len(raw) > 240 {
			raw = raw[:240]
		}
		res.Raw = raw
	}
	if res.Mode == "none" && strings.HasPrefix(res.Raw, "SSH ") {
		// 连接/握手失败：把错误放到 Command 空位，Raw 已带原因
		res.Raw = strings.TrimSpace(res.Raw)
	}
	return res
}

type meshTrafficCache struct {
	Snapshots map[string]MeshTrafficSnapshot `json:"snapshots"`
}

func loadMeshTrafficCache(kv PlatformKV) map[string]MeshTrafficSnapshot {
	out := map[string]MeshTrafficSnapshot{}
	if kv == nil {
		return out
	}
	raw, ok := kv.Get(kvKeyMeshTraffic)
	if !ok || strings.TrimSpace(raw) == "" {
		return out
	}
	var c meshTrafficCache
	if json.Unmarshal([]byte(raw), &c) == nil && c.Snapshots != nil {
		return c.Snapshots
	}
	return out
}

func saveMeshTrafficCache(kv PlatformKV, m map[string]MeshTrafficSnapshot) {
	if kv == nil {
		return
	}
	js, err := json.Marshal(meshTrafficCache{Snapshots: m})
	if err != nil {
		return
	}
	_ = kv.Set(kvKeyMeshTraffic, string(js))
}
