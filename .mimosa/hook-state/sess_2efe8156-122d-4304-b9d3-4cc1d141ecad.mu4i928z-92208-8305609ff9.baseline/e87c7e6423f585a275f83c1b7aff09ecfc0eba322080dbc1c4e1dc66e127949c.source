package internal

import (
	"encoding/json"
	"strings"

	"github.com/gin-gonic/gin"
)

const platformKVKeyVCenterBastionPolicy = "vcenter:bastion:policy"

// BastionExtraHost 非 vCenter 纳管主机（固定地址 SSH/RDP/SFTP），ACL 中目标 id 为 extra:<id>。
type BastionExtraHost struct {
	ID                    string `json:"id"`
	Name                  string `json:"name"`
	Address               string `json:"address"`
	Kind                  string `json:"kind"` // linux | windows
	SSHPort               int    `json:"sshPort"`
	RDPPort               int    `json:"rdpPort"`
	SSHUser               string `json:"sshUser,omitempty"` // 非空时覆盖全局 VCENTER_VM_SSH_USER
	SSHHostKeyFingerprint string `json:"sshHostKeyFingerprint,omitempty"`
	RDPUser               string `json:"rdpUser,omitempty"` // 堡垒机 RDP 用户名提示
	// RDPWebURL 非空时堡垒机「网页远程」内嵌该 HTTPS 地址（如 JumpServer 发布的 Windows RDP Web Client 链接）
	RDPWebURL string `json:"rdpWebUrl,omitempty"`
}

// BastionVmRdpWebEmbed 为 vCenter 虚拟机配置浏览器内嵌的远程桌面页（moRef -> JumpServer RDP Web 等 HTTPS URL）。
type BastionVmRdpWebEmbed struct {
	Moref string `json:"moref"`
	URL   string `json:"url"`
}

// BastionManualVmGroup 管理员配置的 VM 分组（按 moRef 归属）；用于堡垒机侧栏展示顺序与折叠。
type BastionManualVmGroup struct {
	Name   string   `json:"name"`
	Morefs []string `json:"morefs"`
}

// VCenterBastionPolicy 堡垒机 ACL：关闭 enableAcl 时与历史行为一致（凡能访问 vCenter 模块者均可连 SSH/控制台）。
type VCenterBastionPolicy struct {
	EnableACL      bool                   `json:"enableAcl"`
	UserVMs        map[string][]string    `json:"userVms"` // 登录名（小写）-> moRef 或 extra:id；列表中含 "*" 表示全部
	ExtraHosts     []BastionExtraHost     `json:"extraHosts"`
	ManualVmGroups []BastionManualVmGroup `json:"manualVmGroups"`
	// HiddenVmMorefs 中的虚拟机不在堡垒机侧栏展示（全体用户）；不影响 ACL 其它逻辑。
	HiddenVmMorefs []string `json:"hiddenVmMorefs"`
	// VmRdpWebEmbeds：按 moRef 为 Windows 虚拟机指定 JumpServer RDP Web Client 等 HTTPS 内嵌地址。
	VmRdpWebEmbeds []BastionVmRdpWebEmbed `json:"vmRdpWebEmbeds"`
	// NativeSsh*：在平台进程上监听独立 TCP 端口，提供与堡垒机 Web SSH 等效的 OpenSSH 入站（如 ssh -p 2222 user@平台域名），认证使用平台同一套账号/密码/可选 TOTP。
	NativeSshEnabled bool `json:"nativeSshEnabled"`
	// NativeSshPort 1～65535；为 0 时若启用则默认 2222。
	NativeSshPort int `json:"nativeSshPort"`
}

func bastionPolicyDefault() *VCenterBastionPolicy {
	return &VCenterBastionPolicy{EnableACL: false, UserVMs: map[string][]string{}, ExtraHosts: nil, ManualVmGroups: nil, HiddenVmMorefs: nil, VmRdpWebEmbeds: nil, NativeSshEnabled: false, NativeSshPort: 2222}
}

func loadVCenterBastionPolicy(kv PlatformKV) *VCenterBastionPolicy {
	def := bastionPolicyDefault()
	if kv == nil {
		return def
	}
	raw, ok := kv.Get(platformKVKeyVCenterBastionPolicy)
	if !ok || strings.TrimSpace(raw) == "" {
		return def
	}
	var p VCenterBastionPolicy
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return def
	}
	if p.UserVMs == nil {
		p.UserVMs = map[string][]string{}
	}
	if p.ExtraHosts == nil {
		p.ExtraHosts = []BastionExtraHost{}
	}
	if p.ManualVmGroups == nil {
		p.ManualVmGroups = []BastionManualVmGroup{}
	}
	if p.HiddenVmMorefs == nil {
		p.HiddenVmMorefs = []string{}
	}
	if p.VmRdpWebEmbeds == nil {
		p.VmRdpWebEmbeds = []BastionVmRdpWebEmbed{}
	}
	if p.NativeSshPort == 0 {
		p.NativeSshPort = 2222
	}
	for i := range p.ExtraHosts {
		if strings.TrimSpace(strings.ToLower(p.ExtraHosts[i].Kind)) == "windows" {
			p.ExtraHosts[i].RDPPort = 3389
		}
	}
	return &p
}

func bastionRdpWebURLForVM(policy *VCenterBastionPolicy, moref string) string {
	if policy == nil {
		return ""
	}
	m := strings.TrimSpace(moref)
	if m == "" {
		return ""
	}
	for _, e := range policy.VmRdpWebEmbeds {
		if strings.EqualFold(strings.TrimSpace(e.Moref), m) {
			return strings.TrimSpace(e.URL)
		}
	}
	return ""
}

func bastionVmMorefHidden(pol *VCenterBastionPolicy, moref string) bool {
	if pol == nil || len(pol.HiddenVmMorefs) == 0 {
		return false
	}
	m := strings.TrimSpace(moref)
	if m == "" {
		return false
	}
	for _, x := range pol.HiddenVmMorefs {
		if strings.EqualFold(strings.TrimSpace(x), m) {
			return true
		}
	}
	return false
}

func bastionManualGroupNameFor(policy *VCenterBastionPolicy, moref string) string {
	if policy == nil {
		return ""
	}
	m := strings.TrimSpace(moref)
	if m == "" {
		return ""
	}
	for _, g := range policy.ManualVmGroups {
		name := strings.TrimSpace(g.Name)
		if name == "" {
			continue
		}
		for _, x := range g.Morefs {
			if strings.EqualFold(strings.TrimSpace(x), m) {
				return name
			}
		}
	}
	return ""
}

func bastionExtraTarget(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return ""
	}
	return "extra:" + strings.ToLower(id)
}

func bastionFindExtraHost(policy *VCenterBastionPolicy, id string) *BastionExtraHost {
	if policy == nil {
		return nil
	}
	id = strings.TrimSpace(strings.ToLower(id))
	for i := range policy.ExtraHosts {
		h := &policy.ExtraHosts[i]
		if strings.EqualFold(strings.TrimSpace(h.ID), id) {
			return h
		}
	}
	return nil
}

func bastionMayAccess(policy *VCenterBastionPolicy, username, moref string, isAdmin bool) bool {
	if isAdmin {
		return true
	}
	if policy == nil || !policy.EnableACL {
		return true
	}
	moref = strings.TrimSpace(moref)
	if moref == "" {
		return false
	}
	u := strings.ToLower(strings.TrimSpace(username))
	list := policy.UserVMs[u]
	if len(list) == 0 {
		return false
	}
	for _, v := range list {
		v = strings.TrimSpace(v)
		if v == "*" {
			return true
		}
		if v == moref {
			return true
		}
	}
	return false
}

// vcenterBastionAbortIfForbiddenTarget 校验 moRef（如 vm-1）或 extra:xxx。
func vcenterBastionAbortIfForbiddenTarget(c *gin.Context, app *ServerApp, target string) bool {
	target = strings.TrimSpace(target)
	if target == "" {
		return false
	}
	pol := loadVCenterBastionPolicy(app.PlatformKV())
	user := dashboardUsernameFromGin(c)
	admin := getDashboardRoleFromGin(c) == DashboardRoleAdmin
	if bastionMayAccess(pol, user, target, admin) {
		return false
	}
	RespondAPIPermissionDenied(c)
	return true
}

// vcenterBastionAbortIfForbidden 若堡垒机策略拒绝访问则写入 403 并返回 true。
func vcenterBastionAbortIfForbidden(c *gin.Context, app *ServerApp, moref string) bool {
	return vcenterBastionAbortIfForbiddenTarget(c, app, strings.TrimSpace(moref))
}
