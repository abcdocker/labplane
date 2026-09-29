package internal

// 堡垒机 SSH 免密覆盖清单：全部可管主机（vCenter 虚拟机 + 额外主机）×
// 凭据/用户配置状态，供堡垒机管理页直观展示「哪些机器尚未配置免密或用户」。
// 判定语义与 sshEffectiveReady / mergeBastionExtraSSHStored 保持一致：
// 已配置 = 可建立 SSH（环境变量已配全，或已存凭据完整）且用户名明确。

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
)

type bastionSshCoverageHost struct {
	ID           string `json:"id"`
	Kind         string `json:"kind"` // vm | extra-linux | extra-windows
	Name         string `json:"name"`
	Address      string `json:"address,omitempty"`
	User         string `json:"user,omitempty"`
	HasStoredCfg bool   `json:"hasStoredCfg"`
	HasAuth      bool   `json:"hasAuth"`
	Ready        bool   `json:"ready"`
	Configured   bool   `json:"configured"` // ready 且用户名非空
}

func handleGetVCenterBastionSSHCoverage(c *gin.Context, app *ServerApp) {
	cfg := app.Cfg()
	ctx := c.Request.Context()
	key, keyErr := sshEncryptionKey(cfg)
	store := app.SSHStore()
	pol := loadVCenterBastionPolicy(app.PlatformKV())

	hosts := make([]bastionSshCoverageHost, 0, 16)

	// vCenter 虚拟机全集（快照缓存，不强拉；vCenter 未配置时为空）
	if payload, _, _, err := vcenterVMListSnapshotBytes(ctx, app, false, true); err == nil {
		var env struct {
			VMs []map[string]interface{} `json:"vms"`
		}
		if jerr := json.Unmarshal(payload, &env); jerr == nil {
			for _, vm := range env.VMs {
				moref, _ := vm["moref"].(string)
				name, _ := vm["name"].(string)
				if strings.TrimSpace(moref) == "" || bastionVmMorefHidden(pol, moref) {
					continue
				}
				h := bastionSshCoverageHost{ID: moref, Kind: "vm", Name: name, Address: moref}
				rec, gerr := store.GetVM(ctx, moref, key)
				if gerr == nil && rec != nil {
					h.HasStoredCfg = true
					h.User = strings.TrimSpace(rec.User)
					h.HasAuth = rec.hasAuth()
					h.Ready = cfg.vCenterVMSshConfigured() ||
						(rec.hasAuth() && (rec.InsecureHostKey || strings.TrimSpace(rec.HostKeyFingerprint) != ""))
					h.Configured = h.Ready && h.User != ""
				} else {
					// 无已存配置：环境变量兜底（VCENTER_VM_SSH_*）
					h.Ready = cfg.vCenterVMSshConfigured()
					h.User = cfg.VCenterVMSshUser
					h.Configured = h.Ready && strings.TrimSpace(cfg.VCenterVMSshPassword) != ""
				}
				if keyErr != nil {
					h.Ready = false
					h.Configured = false
				}
				hosts = append(hosts, h)
			}
		}
	}

	// 额外主机（linux/windows）：SSH 凭据按 BastionExtraSSHStoreKey 存储，全局 VCENTER_VM_SSH_* 兜底
	for i := range pol.ExtraHosts {
		h := pol.ExtraHosts[i]
		kind := "extra-" + strings.ToLower(strings.TrimSpace(h.Kind))
		ch := bastionSshCoverageHost{
			ID: bastionExtraTarget(h.ID), Kind: kind,
			Name: h.Name, Address: h.Address,
		}
		rec, gerr := store.GetVM(ctx, BastionExtraSSHStoreKey(h.ID), key)
		merged := mergeBastionExtraSSHStored(cfg, rec, &h)
		ch.HasStoredCfg = gerr == nil && rec != nil
		ch.User = strings.TrimSpace(merged.User)
		ch.HasAuth = merged.hasAuth()
		ch.Ready = ch.HasAuth
		ch.Configured = ch.Ready && ch.User != ""
		if gerr != nil {
			ch.Ready = false
			ch.Configured = false
		}
		hosts = append(hosts, ch)
	}

	configuredCount := 0
	missing := make([]bastionSshCoverageHost, 0, len(hosts))
	for _, h := range hosts {
		if h.Configured {
			configuredCount++
		} else {
			missing = append(missing, h)
		}
	}
	sort.Slice(hosts, func(i, j int) bool {
		if hosts[i].Configured != hosts[j].Configured {
			return !hosts[i].Configured // 未配置排前，便于处理
		}
		return hosts[i].Name < hosts[j].Name
	})
	c.JSON(http.StatusOK, gin.H{
		"hosts":     hosts,
		"summary":   gin.H{"total": len(hosts), "configured": configuredCount, "missing": len(missing)},
		"missing":   missing,
	})
}
