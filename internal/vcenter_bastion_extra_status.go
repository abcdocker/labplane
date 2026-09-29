package internal

// 堡垒机侧栏「额外主机」在线状态探测：并发 TCP 拨测各主机的 SSH/RDP 端口，
// 结果缓存 30 秒（重复点击/自动刷新不重复拨测）。只读操作，多副本重复执行无害。

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const bastionExtraStatusCacheTTL = 30 * time.Second

type bastionExtraStatusEntry struct {
	Reachable bool `json:"reachable"`
}

type bastionExtraStatusCache struct {
	expiresAt time.Time
	statuses  map[string]bastionExtraStatusEntry
}

var (
	bastionExtraStatusMu     sync.Mutex
	bastionExtraStatusCached *bastionExtraStatusCache
)

func bastionExtraProbePort(h BastionExtraHost) int {
	if strings.EqualFold(strings.TrimSpace(h.Kind), "windows") {
		if h.RDPPort > 0 {
			return h.RDPPort
		}
		return 3389
	}
	if h.SSHPort > 0 {
		return h.SSHPort
	}
	return 22
}

// handleBastionExtraStatus GET /api/vcenter/bastion/extra-status
// 返回全部额外主机的 TCP 可达状态（30s 缓存）；id → reachable。
func handleBastionExtraStatus(c *gin.Context, app *ServerApp) {
	pol := loadVCenterBastionPolicy(app.PlatformKV())

	bastionExtraStatusMu.Lock()
	if bastionExtraStatusCached != nil && time.Now().Before(bastionExtraStatusCached.expiresAt) {
		statuses := bastionExtraStatusCached.statuses
		bastionExtraStatusMu.Unlock()
		c.JSON(http.StatusOK, gin.H{"statuses": statuses, "cached": true})
		return
	}
	bastionExtraStatusMu.Unlock()

	statuses := make(map[string]bastionExtraStatusEntry, len(pol.ExtraHosts))
	var wg sync.WaitGroup
	var mu sync.Mutex
	for i := range pol.ExtraHosts {
		h := pol.ExtraHosts[i]
		wg.Add(1)
		go func() {
			defer wg.Done()
			addr := net.JoinHostPort(strings.TrimSpace(h.Address), strconv.Itoa(bastionExtraProbePort(h)))
			conn, err := net.DialTimeout("tcp", addr, 1500*time.Millisecond)
			if err == nil {
				_ = conn.Close()
			}
			mu.Lock()
			statuses[h.ID] = bastionExtraStatusEntry{Reachable: err == nil}
			mu.Unlock()
		}()
	}
	wg.Wait()

	bastionExtraStatusMu.Lock()
	bastionExtraStatusCached = &bastionExtraStatusCache{
		expiresAt: time.Now().Add(bastionExtraStatusCacheTTL),
		statuses:  statuses,
	}
	bastionExtraStatusMu.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"statuses": statuses,
		"cached":   false,
	})
}

// bastionExtraProbeTargetID 探测缓存键（与采集器 id 解耦，避免与资源 id 冲突）。
func bastionExtraProbeTargetID(id string) string {
	return strings.ToLower(strings.TrimSpace(id))
}
