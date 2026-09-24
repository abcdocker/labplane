package internal

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// bastionExtraHostPutJSON 保存策略时可选携带密码字段（不入库 policy JSON，仅校验后写入 SSH 加密存储）。
type bastionExtraHostPutJSON struct {
	ID                    string `json:"id"`
	Name                  string `json:"name"`
	Address               string `json:"address"`
	Kind                  string `json:"kind"`
	SSHPort               int    `json:"sshPort"`
	RDPPort               int    `json:"rdpPort"`
	SSHUser               string `json:"sshUser,omitempty"`
	SSHHostKeyFingerprint string `json:"sshHostKeyFingerprint,omitempty"`
	RDPUser               string `json:"rdpUser,omitempty"`
	SSHPassword           string `json:"sshPassword,omitempty"`
	RDPPassword           string `json:"rdpPassword,omitempty"`
	RDPWebURL             string `json:"rdpWebUrl,omitempty"`
}

type bastionVmRdpWebPutJSON struct {
	Moref string `json:"moref"`
	URL   string `json:"url"`
}

type bastionPolicyPutJSON struct {
	EnableACL        bool                      `json:"enableAcl"`
	UserVMs          map[string][]string       `json:"userVms"`
	ExtraHosts       []bastionExtraHostPutJSON `json:"extraHosts"`
	ManualVmGroups   []BastionManualVmGroup    `json:"manualVmGroups"`
	HiddenVmMorefs   []string                  `json:"hiddenVmMorefs"`
	VmRdpWebEmbeds   []bastionVmRdpWebPutJSON  `json:"vmRdpWebEmbeds"`
	NativeSshEnabled *bool                     `json:"nativeSshEnabled"`
	NativeSshPort    *int                      `json:"nativeSshPort"`
}

func handleGetVCenterBastionPolicy(c *gin.Context, app *ServerApp) {
	p := loadVCenterBastionPolicy(app.PlatformKV())
	c.JSON(http.StatusOK, p)
}

func handlePutVCenterBastionPolicy(c *gin.Context, app *ServerApp) {
	kv := app.PlatformKV()
	if kv == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未配置平台 KV，无法保存堡垒机策略"})
		return
	}
	if getDashboardRoleFromGin(c) != DashboardRoleAdmin {
		RespondAPIPermissionDenied(c)
		return
	}
	var body bastionPolicyPutJSON
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "JSON 无效: " + err.Error()})
		return
	}
	ctx := c.Request.Context()
	oldPol := loadVCenterBastionPolicy(kv)

	if body.UserVMs == nil {
		body.UserVMs = map[string][]string{}
	}
	if body.ExtraHosts == nil {
		body.ExtraHosts = nil
	}
	seenExtra := make(map[string]bool)
	hosts := make([]BastionExtraHost, 0, len(body.ExtraHosts))
	for _, row := range body.ExtraHosts {
		id := strings.TrimSpace(row.ID)
		if id == "" {
			continue
		}
		lid := strings.ToLower(id)
		if seenExtra[lid] {
			continue
		}
		seenExtra[lid] = true
		kind := strings.TrimSpace(strings.ToLower(row.Kind))
		if kind == "" {
			kind = "linux"
		}
		h := BastionExtraHost{
			ID:                    id,
			Name:                  strings.TrimSpace(row.Name),
			Address:               strings.TrimSpace(row.Address),
			Kind:                  kind,
			SSHUser:               strings.TrimSpace(row.SSHUser),
			SSHHostKeyFingerprint: normalizeSSHHostKeyFingerprint(row.SSHHostKeyFingerprint),
			RDPUser:               strings.TrimSpace(row.RDPUser),
			RDPWebURL:             strings.TrimSpace(row.RDPWebURL),
		}
		if kind == "windows" {
			h.SSHPort = 0
			h.RDPPort = 3389
		} else {
			h.RDPPort = 0
			h.SSHPort = row.SSHPort
			if h.SSHPort <= 0 {
				h.SSHPort = 22
			}
		}
		hosts = append(hosts, h)

		if strings.TrimSpace(row.SSHPassword) != "" && kind != "windows" {
			u := h.SSHUser
			if u == "" {
				u = strings.TrimSpace(app.Cfg().VCenterVMSshUser)
			}
			if err := bastionTrySSHPasswordDial(h.Address, h.SSHPort, u, row.SSHPassword, h.SSHHostKeyFingerprint); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "额外主机 " + id + " SSH 校验失败: " + err.Error()})
				return
			}
			if err := bastionPersistLinuxExtraSSH(ctx, app, id, &h, row.SSHPassword); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "额外主机 " + id + " 保存 SSH 凭据失败: " + err.Error()})
				return
			}
		}
		if strings.TrimSpace(row.RDPPassword) != "" && kind == "windows" {
			if err := bastionTryRDPTCP(h.Address, h.RDPPort); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "额外主机 " + id + " RDP 端口检测失败: " + err.Error()})
				return
			}
			if err := bastionPersistWindowsExtraRDPSecret(ctx, app, id, &h, row.RDPPassword); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "额外主机 " + id + " 保存 RDP 密码失败: " + err.Error()})
				return
			}
		}
	}

	bastionRemoveOrphanExtraSSHSecrets(ctx, app, oldPol, hosts)

	hiddenOut := make([]string, 0)
	seenH := make(map[string]bool)
	for _, x := range body.HiddenVmMorefs {
		x = strings.TrimSpace(x)
		if x == "" {
			continue
		}
		xl := strings.ToLower(x)
		if seenH[xl] {
			continue
		}
		seenH[xl] = true
		hiddenOut = append(hiddenOut, x)
	}

	if body.ManualVmGroups == nil {
		body.ManualVmGroups = []BastionManualVmGroup{}
	}
	manualOut := make([]BastionManualVmGroup, 0, len(body.ManualVmGroups))
	for _, g := range body.ManualVmGroups {
		name := strings.TrimSpace(g.Name)
		if name == "" {
			continue
		}
		seenM := make(map[string]bool)
		var mfs []string
		for _, x := range g.Morefs {
			x = strings.TrimSpace(x)
			if x == "" {
				continue
			}
			xl := strings.ToLower(x)
			if seenM[xl] {
				continue
			}
			seenM[xl] = true
			mfs = append(mfs, x)
		}
		manualOut = append(manualOut, BastionManualVmGroup{Name: name, Morefs: mfs})
	}

	norm := make(map[string][]string, len(body.UserVMs))
	for k, v := range body.UserVMs {
		k = strings.ToLower(strings.TrimSpace(k))
		if k == "" {
			continue
		}
		norm[k] = v
	}

	vmRdpOut := make([]BastionVmRdpWebEmbed, 0)
	seenRdpVM := make(map[string]bool)
	if body.VmRdpWebEmbeds != nil {
		for _, row := range body.VmRdpWebEmbeds {
			mf := strings.TrimSpace(row.Moref)
			u := strings.TrimSpace(row.URL)
			if mf == "" || u == "" {
				continue
			}
			lk := strings.ToLower(mf)
			if seenRdpVM[lk] {
				continue
			}
			seenRdpVM[lk] = true
			vmRdpOut = append(vmRdpOut, BastionVmRdpWebEmbed{Moref: mf, URL: u})
		}
	}

	prev := loadVCenterBastionPolicy(kv)
	nsEn, nsPort := prev.NativeSshEnabled, prev.NativeSshPort
	if nsPort <= 0 {
		nsPort = 2222
	}
	if body.NativeSshEnabled != nil {
		nsEn = *body.NativeSshEnabled
	}
	if body.NativeSshPort != nil && *body.NativeSshPort > 0 && *body.NativeSshPort <= 65535 {
		nsPort = *body.NativeSshPort
	}

	outPol := VCenterBastionPolicy{
		EnableACL:        body.EnableACL,
		UserVMs:          norm,
		ExtraHosts:       hosts,
		ManualVmGroups:   manualOut,
		HiddenVmMorefs:   hiddenOut,
		VmRdpWebEmbeds:   vmRdpOut,
		NativeSshEnabled: nsEn,
		NativeSshPort:    nsPort,
	}
	raw, err := json.Marshal(&outPol)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if err := kv.Set(platformKVKeyVCenterBastionPolicy, string(raw)); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	BastionNativeSshReconcileFromPolicy(app)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func bastionRemoveOrphanExtraSSHSecrets(ctx context.Context, app *ServerApp, oldPol *VCenterBastionPolicy, newHosts []BastionExtraHost) {
	store := app.SSHStore()
	key, err := sshEncryptionKey(app.Cfg())
	if store == nil || err != nil || len(key) == 0 || oldPol == nil {
		return
	}
	newIDs := make(map[string]bool)
	for _, h := range newHosts {
		newIDs[strings.ToLower(strings.TrimSpace(h.ID))] = true
	}
	for _, h := range oldPol.ExtraHosts {
		lid := strings.ToLower(strings.TrimSpace(h.ID))
		if lid == "" || newIDs[lid] {
			continue
		}
		_ = store.DeleteVM(ctx, BastionExtraSSHStoreKey(h.ID))
		_ = store.DeleteVM(ctx, BastionExtraRDPCredStoreKey(h.ID))
	}
}

func handleGetVCenterBastionVMs(c *gin.Context, app *ServerApp) {
	ctx := c.Request.Context()
	force := c.Query("refresh") == "1" || c.Query("refresh") == "true"
	payload, _, folderPathPending, err := vcenterVMListSnapshotBytes(ctx, app, force, true)
	if err != nil {
		if errors.Is(err, errVCenterNotConfiguredForVMList) {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "vCenter 未配置"})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "列出虚拟机失败: " + err.Error()})
		return
	}
	var envelope struct {
		VMs               []map[string]interface{} `json:"vms"`
		FolderPathPending bool                     `json:"folderPathPending"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	pol := loadVCenterBastionPolicy(app.PlatformKV())
	user := dashboardUsernameFromGin(c)
	admin := getDashboardRoleFromGin(c) == DashboardRoleAdmin
	wantPolicy := c.Query("policy") == "1" || c.Query("policy") == "true"
	if wantPolicy && !admin {
		RespondAPIPermissionDenied(c)
		return
	}
	policyEdit := admin && wantPolicy
	filtered := make([]map[string]interface{}, 0, len(envelope.VMs))
	for _, vm := range envelope.VMs {
		moref, _ := vm["moref"].(string)
		if bastionMayAccess(pol, user, moref, admin) {
			filtered = append(filtered, vm)
		}
	}
	if !policyEdit {
		tmp := make([]map[string]interface{}, 0, len(filtered))
		for _, vm := range filtered {
			moref, _ := vm["moref"].(string)
			if bastionVmMorefHidden(pol, moref) {
				continue
			}
			tmp = append(tmp, vm)
		}
		filtered = tmp
	}
	for i := range filtered {
		moref, _ := filtered[i]["moref"].(string)
		if mg := bastionManualGroupNameFor(pol, moref); mg != "" {
			filtered[i]["manualGroup"] = mg
		}
		if u := bastionRdpWebURLForVM(pol, moref); u != "" {
			filtered[i]["rdpWebUrl"] = u
		}
	}
	extras := make([]gin.H, 0)
	for i := range pol.ExtraHosts {
		h := pol.ExtraHosts[i]
		tid := bastionExtraTarget(h.ID)
		if !bastionMayAccess(pol, user, tid, admin) {
			continue
		}
		rdpPort := h.RDPPort
		if strings.TrimSpace(strings.ToLower(h.Kind)) == "windows" {
			rdpPort = 3389
		}
		eh := gin.H{
			"id":      h.ID,
			"name":    h.Name,
			"address": h.Address,
			"kind":    h.Kind,
			"sshPort": h.SSHPort,
			"rdpPort": rdpPort,
			"sshUser": h.SSHUser,
			"rdpUser": h.RDPUser,
		}
		if strings.TrimSpace(h.RDPWebURL) != "" {
			eh["rdpWebUrl"] = strings.TrimSpace(h.RDPWebURL)
		}
		extras = append(extras, eh)
	}
	out, err := json.Marshal(gin.H{
		"vms":               filtered,
		"extraHosts":        extras,
		"folderPathPending": folderPathPending || envelope.FolderPathPending,
	})
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.Header("X-VCenter-Bastion-Filter", "1")
	c.Data(http.StatusOK, "application/json", out)
}
