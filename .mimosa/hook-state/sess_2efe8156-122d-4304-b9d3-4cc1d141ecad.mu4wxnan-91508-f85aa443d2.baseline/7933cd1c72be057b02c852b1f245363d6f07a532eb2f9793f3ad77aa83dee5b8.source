package internal

import (
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func sshEncryptionKey(cfg Config) ([]byte, error) {
	return deriveAESKey(cfg.EncryptionKey)
}

// sshEffectiveReady 是否可建立 SSH：环境变量已配全，或存储中有该 VM 的完整凭据。
func sshEffectiveReady(ctx context.Context, cfg Config, store SSHSettingsStore, moref string, key []byte) bool {
	if cfg.vCenterVMSshConfigured() {
		return true
	}
	if store == nil || len(key) == 0 {
		return false
	}
	rec, err := store.GetVM(ctx, moref, key)
	if err != nil || rec == nil {
		return false
	}
	return rec.hasAuth() &&
		(rec.InsecureHostKey || strings.TrimSpace(rec.HostKeyFingerprint) != "")
}

func handleGetVCenterVMSSHSettings(c *gin.Context, cfg Config, store SSHSettingsStore) {
	moref := strings.TrimSpace(c.Param("moref"))
	if moref == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 moref"})
		return
	}
	ctx := c.Request.Context()

	key, keyErr := sshEncryptionKey(cfg)
	fromEnv := cfg.vCenterVMSshConfigured()

	out := gin.H{
		"moref":           moref,
		"fromEnv":         fromEnv,
		"backend":         string(cfg.SSHSettingsBackend),
		"writable":        store != nil && keyErr == nil,
		"encryptionReady": keyErr == nil,
	}
	if keyErr != nil {
		out["encryptionError"] = keyErr.Error()
	}

	if store == nil {
		out["stored"] = false
		out["canConnect"] = fromEnv
		if fromEnv {
			out["user"] = cfg.VCenterVMSshUser
			out["port"] = cfg.VCenterVMSshPort
			out["insecureHostKey"] = cfg.VCenterVMSshInsecureHostKey
			out["hostKeyFingerprint"] = cfg.VCenterVMSshHostKeyFingerprint
			out["passwordSet"] = strings.TrimSpace(cfg.VCenterVMSshPassword) != ""
			out["privateKeySet"] = strings.TrimSpace(cfg.VCenterVMSshPrivateKeyPath) != ""
		}
		c.JSON(http.StatusOK, out)
		return
	}

	if keyErr != nil {
		out["stored"] = false
		out["canConnect"] = fromEnv
		out["needsEncryptionKey"] = true
		c.JSON(http.StatusOK, out)
		return
	}

	rec, err := store.GetVM(ctx, moref, key)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	out["stored"] = rec != nil && (strings.TrimSpace(rec.User) != "" || rec.hasAuth())
	if rec != nil {
		out["user"] = rec.User
		if rec.Port > 0 {
			out["port"] = rec.Port
		}
		out["insecureHostKey"] = rec.InsecureHostKey
		out["hostKeyFingerprint"] = rec.HostKeyFingerprint
		out["passwordSet"] = strings.TrimSpace(rec.Password) != ""
		out["privateKeySet"] = strings.TrimSpace(rec.PrivateKeyPEM) != ""
	}
	if rec == nil || rec.Port == 0 {
		out["port"] = cfg.VCenterVMSshPort
	}
	if rec == nil || strings.TrimSpace(rec.User) == "" {
		out["user"] = cfg.VCenterVMSshUser
	}
	if rec == nil {
		out["insecureHostKey"] = cfg.VCenterVMSshInsecureHostKey
		out["hostKeyFingerprint"] = cfg.VCenterVMSshHostKeyFingerprint
	}
	out["canConnect"] = sshEffectiveReady(ctx, cfg, store, moref, key)
	c.JSON(http.StatusOK, out)
}

type sshPutBody struct {
	User               string  `json:"user"`
	Password           *string `json:"password"`
	PrivateKeyPEM      *string `json:"privateKeyPem"`
	KeyPassphrase      *string `json:"keyPassphrase"`
	Port               *int    `json:"port"`
	InsecureHostKey    *bool   `json:"insecureHostKey"`
	HostKeyFingerprint *string `json:"hostKeyFingerprint"`
}

func handlePutVCenterVMSSHSettings(c *gin.Context, cfg Config, store SSHSettingsStore) {
	if store == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未启用 SSH 存储（请设置 SSH_SETTINGS_BACKEND 与 REDIS_ADDR 或 MYSQL_DSN）"})
		return
	}
	key, err := sshEncryptionKey(cfg)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "KUBEBT_ENCRYPTION_KEY: " + err.Error()})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	if moref == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 moref"})
		return
	}
	var body sshPutBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(body.User) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "user 不能为空"})
		return
	}
	patch := &sshVMPutInput{
		User:               body.User,
		Password:           body.Password,
		PrivateKeyPEM:      body.PrivateKeyPEM,
		KeyPassphrase:      body.KeyPassphrase,
		Port:               body.Port,
		InsecureHostKey:    body.InsecureHostKey,
		HostKeyFingerprint: body.HostKeyFingerprint,
	}
	ctx := c.Request.Context()
	if err := store.PutVM(ctx, moref, patch, key); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "vCenter 虚拟机 moId="+moref+"：已更新 SSH 设置（用户 "+strings.TrimSpace(body.User)+"）")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleDeleteVCenterVMSSHSettings(c *gin.Context, cfg Config, store SSHSettingsStore) {
	if store == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未启用 SSH 存储"})
		return
	}
	moref := strings.TrimSpace(c.Param("moref"))
	if moref == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 moref"})
		return
	}
	if err := store.DeleteVM(c.Request.Context(), moref); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, "vCenter 虚拟机 moId="+moref+"：已清除 SSH 凭据")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
