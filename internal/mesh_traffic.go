package internal

// 异地组网流量采集：SSH 到子网路由节点执行 `tailscale status --json`，
// 解析每个 peer 的 RxBytes/TxBytes（tailscaled 启动以来的累计值）与在线状态。
// headscales 服务端不经过 P2P 数据面，服务端 metrics 里没有节点间流量，
// 因此流量数据必须从路由节点侧采集。

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"sort"
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
	out, err := sess.CombinedOutput("tailscale status --json 2>/dev/null || sudo -n tailscale status --json 2>/dev/null")
	close(done)
	if err != nil && len(strings.TrimSpace(string(out))) == 0 {
		snap.Error = "执行 tailscale status 失败: " + err.Error()
		return snap
	}
	var st tsStatusJSON
	if err := json.Unmarshal(out, &st); err != nil {
		snap.Error = "解析 tailscale status 失败（节点未安装 tailscale 或输出异常）"
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
	return snaps
}

const kvKeyMeshTraffic = "kubebt_mesh_traffic_v1"

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
