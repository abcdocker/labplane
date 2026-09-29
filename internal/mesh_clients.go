package internal

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/abcdocker/labplane/internal/meshclient"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const meshClientKVPrefix = "labplane_mesh_client_v1_"
const meshClientActionKVPrefix = "labplane_mesh_client_actions_v1_"

type meshManagedClient struct {
	ID            string            `json:"id"`
	InstanceID    string            `json:"instanceId"`
	Name          string            `json:"name"`
	User          string            `json:"user"`
	OS            string            `json:"os"`
	Arch          string            `json:"arch"`
	TokenHash     string            `json:"-"`
	KeyID         string            `json:"keyId,omitempty"`
	CreatedAt     string            `json:"createdAt"`
	LastSeenAt    string            `json:"lastSeenAt,omitempty"`
	RevokedAt     string            `json:"revokedAt,omitempty"`
	Status        meshclient.Status `json:"status"`
	PendingAction *meshClientAction `json:"pendingAction,omitempty"`
	LastAction    *meshClientAction `json:"lastAction,omitempty"`
}

type meshClientAction struct {
	meshclient.Command
	IssuedAt    string `json:"issuedAt"`
	CompletedAt string `json:"completedAt,omitempty"`
	Error       string `json:"error,omitempty"`
}

// Storage form includes the hash; API responses use meshManagedClient without it.
type meshClientStorage struct {
	meshManagedClient
	StoredTokenHash string `json:"tokenHash"`
}

type meshClientActionState struct {
	Pending *meshClientAction `json:"pending,omitempty"`
	Last    *meshClientAction `json:"last,omitempty"`
}

func loadMeshClientActions(kv PlatformKV, instanceID, clientID string) meshClientActionState {
	raw, ok := kv.Get(meshClientActionKVPrefix + meshClientKey(instanceID, clientID))
	if !ok {
		return meshClientActionState{}
	}
	var out meshClientActionState
	_ = json.Unmarshal([]byte(raw), &out)
	return out
}

func saveMeshClientActions(kv PlatformKV, instanceID, clientID string, state meshClientActionState) error {
	raw, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return kv.Set(meshClientActionKVPrefix+meshClientKey(instanceID, clientID), string(raw))
}

func meshClientKey(instanceID, clientID string) string {
	return meshClientKVPrefix + instanceID + "_" + clientID
}

func saveManagedClient(kv PlatformKV, v meshManagedClient) error {
	v.PendingAction = nil
	v.LastAction = nil
	stored := meshClientStorage{meshManagedClient: v, StoredTokenHash: v.TokenHash}
	raw, err := json.Marshal(stored)
	if err != nil {
		return err
	}
	return kv.Set(meshClientKey(v.InstanceID, v.ID), string(raw))
}

func loadManagedClient(kv PlatformKV, instanceID, clientID string) (meshManagedClient, bool) {
	raw, ok := kv.Get(meshClientKey(instanceID, clientID))
	if !ok {
		return meshManagedClient{}, false
	}
	var v meshClientStorage
	if json.Unmarshal([]byte(raw), &v) != nil {
		return meshManagedClient{}, false
	}
	if v.InstanceID != instanceID || v.ID != clientID {
		return meshManagedClient{}, false
	}
	v.meshManagedClient.TokenHash = v.StoredTokenHash
	actions := loadMeshClientActions(kv, instanceID, clientID)
	v.PendingAction, v.LastAction = actions.Pending, actions.Last
	return v.meshManagedClient, true
}

func listManagedClients(kv PlatformKV, instanceID string) []meshManagedClient {
	out := []meshManagedClient{}
	for k, raw := range kv.Snapshot() {
		if !strings.HasPrefix(k, meshClientKVPrefix+instanceID+"_") {
			continue
		}
		var v meshClientStorage
		if json.Unmarshal([]byte(raw), &v) != nil || v.InstanceID != instanceID {
			continue
		}
		actions := loadMeshClientActions(kv, instanceID, v.ID)
		v.PendingAction, v.LastAction = actions.Pending, actions.Last
		out = append(out, v.meshManagedClient)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out
}

func managedClientToken() (string, string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	token := base64.RawURLEncoding.EncodeToString(b)
	hash := sha256.Sum256([]byte(token))
	return token, hex.EncodeToString(hash[:]), nil
}

func managedClientAuthenticated(v meshManagedClient, header string) bool {
	if v.RevokedAt != "" || !strings.HasPrefix(header, "Bearer ") {
		return false
	}
	token := strings.TrimPrefix(header, "Bearer ")
	if len(token) != 43 {
		return false
	}
	h := sha256.Sum256([]byte(token))
	known, err := hex.DecodeString(v.TokenHash)
	return err == nil && len(known) == sha256.Size && subtle.ConstantTimeCompare(h[:], known) == 1
}

func validClientTarget(osName, arch string) bool {
	switch osName + "/" + arch {
	case "windows/amd64", "windows/arm64", "macos/amd64", "macos/arm64", "linux/amd64", "linux/arm64":
		return true
	default:
		return false
	}
}

func desktopClientAssetName(osName, arch string) (string, error) {
	if !validClientTarget(osName, arch) {
		return "", fmt.Errorf("unsupported desktop target")
	}
	switch osName {
	case "windows":
		return "LabPlaneMesh.exe", nil
	case "macos":
		return "LabPlaneMesh.dmg", nil
	default:
		return "", fmt.Errorf("unsupported desktop target")
	}
}

func meshClientDistDir(app *ServerApp) string {
	if base := strings.TrimSpace(os.Getenv("LABPLANE_MESH_CLIENT_DIST_DIR")); base != "" {
		return base
	}
	return filepath.Join(app.DataDir(), "mesh-client-dist")
}

func handleMeshClientDownload(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, ok := meshInstanceByID(app.PlatformKV(), c.Param("id")); !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		osName, arch := c.Query("os"), c.Query("arch")
		name, err := desktopClientAssetName(osName, arch)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		path := filepath.Join(meshClientDistDir(app), osName+"-"+arch, name)
		f, err := os.Open(path)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "桌面应用尚未构建"})
			return
		}
		defer f.Close()
		info, err := f.Stat()
		if err != nil || !info.Mode().IsRegular() {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "桌面应用不可用"})
			return
		}
		c.Header("Cache-Control", "private, no-store")
		c.FileAttachment(path, name)
	}
}

func meshClientAssets(app *ServerApp, osName, arch string) (string, string, string, error) {
	if !validClientTarget(osName, arch) {
		return "", "", "", fmt.Errorf("unsupported client target")
	}
	base := meshClientDistDir(app)
	dir := filepath.Join(base, osName+"-"+arch)
	bin := "labplane-mesh-client"
	pkg := "tailscale.tgz"
	if osName == "windows" {
		bin += ".exe"
		pkg = "tailscale.msi"
	}
	if osName == "macos" {
		pkg = "tailscale.pkg"
	}
	for _, name := range []string{bin, pkg} {
		f, err := os.Stat(filepath.Join(dir, name))
		if err != nil || !f.Mode().IsRegular() {
			return "", "", "", fmt.Errorf("client bundle assets unavailable for %s-%s", osName, arch)
		}
	}
	return dir, bin, pkg, nil
}

func makeMeshClientZip(dir, bin, pkg string, cfg meshclient.Config) ([]byte, error) {
	buf := &bytes.Buffer{}
	zw := zip.NewWriter(buf)
	config, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return nil, err
	}
	write := func(name string, mode os.FileMode, src io.Reader) error {
		method := uint16(zip.Store)
		if name == "config.json" || name == "README.txt" {
			method = zip.Deflate
		}
		h := &zip.FileHeader{Name: name, Method: method}
		h.SetMode(mode)
		w, err := zw.CreateHeader(h)
		if err != nil {
			return err
		}
		_, err = io.Copy(w, src)
		return err
	}
	for _, asset := range []string{bin, pkg} {
		f, err := os.Open(filepath.Join(dir, asset))
		if err != nil {
			zw.Close()
			return nil, err
		}
		mode := os.FileMode(0644)
		if asset == bin {
			mode = 0755
		}
		err = write(asset, mode, f)
		f.Close()
		if err != nil {
			zw.Close()
			return nil, err
		}
	}
	if err := write("config.json", 0600, bytes.NewReader(config)); err != nil {
		zw.Close()
		return nil, err
	}
	readme := "LabPlane Mesh client\n\nExtract this ZIP. Run the bundled labplane-mesh-client install as administrator/root.\nThe application installs the bundled Tailscale transport, joins Headscale with a one-use key, and installs its reporting service.\nKeep this package private and delete the extracted config.json and ZIP after installation. macOS may require VPN approval in System Settings.\n"
	if err := write("README.txt", 0644, strings.NewReader(readme)); err != nil {
		zw.Close()
		return nil, err
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func handleMeshClientPackage(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		instID := c.Param("id")
		osName, arch := c.Query("os"), c.Query("arch")
		var dir, bin, pkg string
		var err error
		desktop := osName == "windows" || osName == "macos"
		if desktop {
			asset, assetErr := desktopClientAssetName(osName, arch)
			if assetErr != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": assetErr.Error()})
				return
			}
			info, statErr := os.Stat(filepath.Join(meshClientDistDir(app), osName+"-"+arch, asset))
			if statErr != nil || !info.Mode().IsRegular() {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "桌面应用尚未构建"})
				return
			}
		} else {
			dir, bin, pkg, err = meshClientAssets(app, osName, arch)
			if err != nil {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
				return
			}
		}
		cli, inst, ok, err := meshClientFor(app, instID)
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Headscale 连接不可用"})
			return
		}
		platform := strings.TrimRight(strings.TrimSpace(app.Cfg().PlatformPublicURL), "/")
		server := strings.TrimSpace(inst.ClientURL)
		if server == "" {
			server = inst.APIURL
		}
		pu, perr := url.Parse(platform)
		su, serr := url.Parse(server)
		if perr != nil || serr != nil || pu.Scheme != "https" || su.Scheme != "https" || pu.Host == "" || su.Host == "" || pu.User != nil || su.User != nil || pu.RawQuery != "" || su.RawQuery != "" || pu.Fragment != "" || su.Fragment != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "客户端要求平台和 Headscale 均使用 HTTPS 公网地址"})
			return
		}
		name := strings.TrimSpace(c.Query("hostname"))
		if !meshclient.ValidHostname(name) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "设备名无效"})
			return
		}
		userName := strings.TrimSpace(c.Query("user"))
		if userName == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请选择 Headscale 用户"})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancel()
		users, err := cli.ListUsers(ctx)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "无法读取 Headscale 用户"})
			return
		}
		var userID int64
		for _, u := range users {
			if u.Name == userName {
				userID, _ = strconv.ParseInt(u.ID, 10, 64)
				break
			}
		}
		if userID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Headscale 用户不存在"})
			return
		}
		expiry := time.Now().Add(24 * time.Hour)
		key, err := cli.CreatePreAuthKey(ctx, userID, false, false, &expiry, nil)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "创建一次性加入密钥失败"})
			return
		}
		issued := false
		defer func() {
			if issued {
				return
			}
			cleanupCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = cli.ExpirePreAuthKey(cleanupCtx, key.ID)
		}()
		token, hash, err := managedClientToken()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "无法创建设备凭据"})
			return
		}
		id := "client-" + uuid.NewString()
		cfg := meshclient.Config{InstanceID: instID, ClientID: id, Platform: platform, Server: strings.TrimRight(server, "/"), Hostname: name, AuthKey: key.Key, Token: token}
		var bundle []byte
		if desktop {
			bundle, err = json.MarshalIndent(cfg, "", "  ")
		} else {
			bundle, err = makeMeshClientZip(dir, bin, pkg, cfg)
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "生成客户端包失败"})
			return
		}
		record := meshManagedClient{ID: id, InstanceID: instID, Name: name, User: userName, OS: osName, Arch: arch, TokenHash: hash, KeyID: key.ID, CreatedAt: time.Now().Format(time.RFC3339)}
		if err := saveManagedClient(app.PlatformKV(), record); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "保存设备凭据失败"})
			return
		}
		issued = true
		SetAuditDetail(c, "发放异地组网客户端: "+name+" ("+osName+"/"+arch+")")
		c.Header("Cache-Control", "no-store")
		if desktop {
			c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", "labplane-mesh-"+name+".json"))
			c.Data(http.StatusOK, "application/json", bundle)
		} else {
			c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", "labplane-mesh-"+name+"-"+osName+"-"+arch+".zip"))
			c.Data(http.StatusOK, "application/zip", bundle)
		}
	}
}

func handleMeshClientsList(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, ok := meshInstanceByID(app.PlatformKV(), c.Param("id")); !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"clients": listManagedClients(app.PlatformKV(), c.Param("id"))})
	}
}

func handleMeshClientRevoke(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		v, ok := loadManagedClient(app.PlatformKV(), c.Param("id"), c.Param("cid"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "客户端不存在"})
			return
		}
		v.RevokedAt = time.Now().Format(time.RFC3339)
		if err := saveManagedClient(app.PlatformKV(), v); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "撤销失败"})
			return
		}
		_ = saveMeshClientActions(app.PlatformKV(), v.InstanceID, v.ID, meshClientActionState{Last: v.LastAction})
		SetAuditDetail(c, "撤销异地组网客户端上报凭据: "+v.Name)
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func handleMeshClientAction(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		v, ok := loadManagedClient(app.PlatformKV(), c.Param("id"), c.Param("cid"))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "客户端不存在"})
			return
		}
		if v.RevokedAt != "" {
			c.JSON(http.StatusConflict, gin.H{"error": "客户端凭据已撤销"})
			return
		}
		if v.PendingAction != nil {
			c.JSON(http.StatusConflict, gin.H{"error": "已有待执行操作"})
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
		var body struct {
			Type     string `json:"type"`
			Hostname string `json:"hostname"`
		}
		if c.ShouldBindJSON(&body) != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		switch body.Type {
		case "connect", "disconnect":
			body.Hostname = ""
		case "rename":
			if !meshclient.ValidHostname(body.Hostname) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "设备名无效"})
				return
			}
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的操作"})
			return
		}
		v.PendingAction = &meshClientAction{Command: meshclient.Command{ID: uuid.NewString(), Type: body.Type, Hostname: body.Hostname}, IssuedAt: time.Now().Format(time.RFC3339)}
		if err := saveMeshClientActions(app.PlatformKV(), v.InstanceID, v.ID, meshClientActionState{Pending: v.PendingAction, Last: v.LastAction}); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "保存操作失败"})
			return
		}
		SetAuditDetail(c, "异地组网客户端操作: "+v.Name+" "+body.Type)
		c.JSON(http.StatusOK, gin.H{"action": v.PendingAction})
	}
}

// Public route: this must be registered before /api's session middleware.
func handleMeshClientReport(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8192)
		v, ok := loadManagedClient(app.PlatformKV(), c.Param("id"), c.Param("cid"))
		if !ok || !managedClientAuthenticated(v, c.GetHeader("Authorization")) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid client credential"})
			return
		}
		var body struct {
			Status       meshclient.Status `json:"status"`
			CommandID    string            `json:"commandId"`
			CommandError string            `json:"commandError"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid report"})
			return
		}
		status := body.Status
		if len(status.Hostname) > 253 || len(status.BackendState) > 64 || len(status.TailscaleIPs) > 8 || len(status.Endpoints) > 32 || len(status.Error) > 256 || len(status.NodeID) > 128 || len(status.ClientVersion) > 128 || status.OS != v.OS || status.Arch != v.Arch || len(body.CommandID) > 128 || len(body.CommandError) > 256 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid client status"})
			return
		}
		for _, s := range append(status.TailscaleIPs, status.Endpoints...) {
			if len(s) > 256 {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid endpoint"})
				return
			}
		}
		v.Status = status
		v.LastSeenAt = time.Now().Format(time.RFC3339)
		if v.PendingAction != nil && body.CommandID == v.PendingAction.ID {
			completed := *v.PendingAction
			completed.CompletedAt = v.LastSeenAt
			completed.Error = body.CommandError
			v.LastAction = &completed
			v.PendingAction = nil
			if err := saveMeshClientActions(app.PlatformKV(), v.InstanceID, v.ID, meshClientActionState{Last: v.LastAction}); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot acknowledge command"})
				return
			}
		}
		if err := saveManagedClient(app.PlatformKV(), v); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot store status"})
			return
		}
		var next *meshclient.Command
		if v.PendingAction != nil {
			next = &v.PendingAction.Command
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "command": next})
	}
}
