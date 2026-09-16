package internal

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

const baotaSSLMaterialKVKey = "kubebt_baota_ssl_material_v1"

type baotaSSLStoredMaterial struct {
	PEMEnc string `json:"pemEnc,omitempty"`
	KeyEnc string `json:"keyEnc,omitempty"`
}

type BaotaResolvedHTTPSMaterial struct {
	Mode     string
	CertName string
	PemPath  string
	KeyPath  string
}

// DeployBaotaSiteSSLPEM 将 PEM 证书与私钥部署到宝塔指定站点（网站 → SSL），供 DNS 证书管理等场景调用。
func DeployBaotaSiteSSLPEM(cfg Config, siteName, certPEM, keyPEM string) error {
	siteName = strings.TrimSpace(siteName)
	if siteName == "" {
		return errors.New("宝塔站点名不能为空")
	}
	if err := validateBaotaSSLMaterialContent(certPEM, keyPEM); err != nil {
		return err
	}
	pemContent := strings.TrimSpace(certPEM)
	keyContent := strings.TrimSpace(keyPEM)
	if pemContent == "" {
		return errors.New("证书 PEM 为空")
	}
	_, err := CallBaotaAPI(cfg, "/site?action=SetSSL", map[string]string{
		"siteName": siteName,
		"key":      keyContent,
		"csr":      pemContent,
		"type":     "1",
	})
	if err != nil {
		return fmt.Errorf("宝塔 SetSSL: %w", err)
	}
	return nil
}

func validateBaotaSSLMaterialContent(pemContent, keyContent string) error {
	pem := strings.TrimSpace(pemContent)
	key := strings.TrimSpace(keyContent)
	if (pem == "") != (key == "") {
		return errors.New("宝塔 HTTPS 证书 PEM/KEY 内容必须同时填写")
	}
	if pem == "" {
		return nil
	}
	if _, err := tls.X509KeyPair([]byte(pem), []byte(key)); err != nil {
		return fmt.Errorf("PEM/KEY 证书对校验失败: %w", err)
	}
	return nil
}

func baotaSSLEncryptionKey(cfg Config) ([]byte, error) {
	return deriveAESKey(cfg.EncryptionKey)
}

func hasStoredBaotaSSLMaterial(app *ServerApp) bool {
	if app == nil || app.PlatformKV() == nil {
		return false
	}
	raw, ok := app.PlatformKV().Get(baotaSSLMaterialKVKey)
	return ok && strings.TrimSpace(raw) != ""
}

func hasLegacyBaotaSSLMaterial(cfg Config) bool {
	return strings.TrimSpace(cfg.BaotaSSLPemPath) != "" && strings.TrimSpace(cfg.BaotaSSLKeyPath) != ""
}

func baotaSSLMaterialConfigured(app *ServerApp) bool {
	if app == nil {
		return false
	}
	if hasStoredBaotaSSLMaterial(app) {
		return true
	}
	return hasLegacyBaotaSSLMaterial(app.Cfg())
}

func saveStoredBaotaSSLMaterial(app *ServerApp, cfg Config, pemContent, keyContent string) error {
	if app == nil {
		return errors.New("app nil")
	}
	if err := validateBaotaSSLMaterialContent(pemContent, keyContent); err != nil {
		return err
	}
	encKey, err := baotaSSLEncryptionKey(cfg)
	if err != nil {
		return err
	}
	pemEnc, err := encryptSecret(encKey, strings.TrimSpace(pemContent))
	if err != nil {
		return err
	}
	keyEnc, err := encryptSecret(encKey, strings.TrimSpace(keyContent))
	if err != nil {
		return err
	}
	b, err := json.Marshal(baotaSSLStoredMaterial{PEMEnc: pemEnc, KeyEnc: keyEnc})
	if err != nil {
		return err
	}
	return saveStoredBaotaSSLMaterialValue(app, cfg, string(b))
}

func saveStoredBaotaSSLMaterialValue(app *ServerApp, cfg Config, value string) error {
	kv, cleanup, err := baotaSSLWritableKV(app, cfg)
	if err != nil {
		return err
	}
	if cleanup != nil {
		defer cleanup()
	}
	if kv == nil {
		return errors.New("platform kv 未就绪")
	}
	if err := kv.Set(baotaSSLMaterialKVKey, value); err != nil {
		return err
	}
	mirrorBaotaSSLMaterialIfDualWrite(app, cfg, kv)
	return nil
}

func clearStoredBaotaSSLMaterial(app *ServerApp, cfg Config) error {
	if app == nil {
		return nil
	}
	return saveStoredBaotaSSLMaterialValue(app, cfg, "")
}

func baotaSSLWritableKV(app *ServerApp, cfg Config) (PlatformKV, func(), error) {
	if app == nil {
		return nil, nil, errors.New("app nil")
	}
	if strings.TrimSpace(cfg.MySQLDSN) != "" {
		db, err := OpenMySQLPoolForRuntimeWrite(cfg.MySQLDSN)
		if err != nil {
			return nil, nil, fmt.Errorf("MySQL 不可用或表结构初始化失败: %w", err)
		}
		kv, err := newPlatformKVMySQL(db)
		if err != nil {
			_ = db.Close()
			return nil, nil, err
		}
		return kv, func() { _ = db.Close() }, nil
	}
	kv, err := newPlatformKVFile(app.DataDir())
	if err != nil {
		return nil, nil, err
	}
	return kv, nil, nil
}

func mirrorBaotaSSLMaterialIfDualWrite(app *ServerApp, cfg Config, kv PlatformKV) {
	if app == nil || kv == nil || !cfg.RuntimeDualWriteRedis {
		return
	}
	rdb := app.Redis()
	if rdb == nil {
		if rr, err := dialRedisLight(cfg); err == nil && rr != nil {
			rdb = rr
			defer rr.Close()
		} else {
			return
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	_ = MirrorPlatformKVToRedis(ctx, rdb, cfg, kv.Snapshot())
}

func loadStoredBaotaSSLMaterial(kv PlatformKV, cfg Config) (pemContent, keyContent string, ok bool, err error) {
	if kv == nil {
		return "", "", false, nil
	}
	raw, found := kv.Get(baotaSSLMaterialKVKey)
	if !found || strings.TrimSpace(raw) == "" {
		return "", "", false, nil
	}
	var stored baotaSSLStoredMaterial
	if err := json.Unmarshal([]byte(raw), &stored); err != nil {
		return "", "", false, err
	}
	encKey, err := baotaSSLEncryptionKey(cfg)
	if err != nil {
		return "", "", false, err
	}
	pemContent, err = decryptSecret(encKey, stored.PEMEnc)
	if err != nil {
		return "", "", false, err
	}
	keyContent, err = decryptSecret(encKey, stored.KeyEnc)
	if err != nil {
		return "", "", false, err
	}
	if err := validateBaotaSSLMaterialContent(pemContent, keyContent); err != nil {
		return "", "", false, err
	}
	return strings.TrimSpace(pemContent), strings.TrimSpace(keyContent), true, nil
}

func resolveBaotaHTTPSMaterial(cfg Config, override BaotaHTTPSConfig, hasStored bool) (BaotaResolvedHTTPSMaterial, error) {
	pemPath := strings.TrimSpace(override.PemPath)
	keyPath := strings.TrimSpace(override.KeyPath)
	if pemPath != "" || keyPath != "" {
		if err := validateBaotaSSLMaterialPaths(pemPath, keyPath); err != nil {
			return BaotaResolvedHTTPSMaterial{}, fmt.Errorf("Ingress 注解证书路径无效: %w", err)
		}
		return BaotaResolvedHTTPSMaterial{Mode: "pem-path", PemPath: pemPath, KeyPath: keyPath}, nil
	}
	certName := strings.TrimSpace(override.CertName)
	if certName != "" {
		return BaotaResolvedHTTPSMaterial{Mode: "cert-name", CertName: certName}, nil
	}
	if hasStored {
		return BaotaResolvedHTTPSMaterial{Mode: "stored"}, nil
	}
	pemPath = strings.TrimSpace(cfg.BaotaSSLPemPath)
	keyPath = strings.TrimSpace(cfg.BaotaSSLKeyPath)
	if pemPath != "" || keyPath != "" {
		if err := validateBaotaSSLMaterialPaths(pemPath, keyPath); err != nil {
			return BaotaResolvedHTTPSMaterial{}, err
		}
		return BaotaResolvedHTTPSMaterial{Mode: "pem-path", PemPath: pemPath, KeyPath: keyPath}, nil
	}
	certName = strings.TrimSpace(cfg.BaotaSSLCertName)
	if certName != "" {
		return BaotaResolvedHTTPSMaterial{Mode: "cert-name", CertName: certName}, nil
	}
	return BaotaResolvedHTTPSMaterial{}, errors.New("未配置宝塔 HTTPS 证书来源：请上传 PEM/KEY 内容、设置 BAOTA_SSL_CERT_NAME，或在 Ingress 注解中覆盖")
}

func loadBaotaHTTPSMaterial(app *ServerApp, cfg Config, material BaotaResolvedHTTPSMaterial) (pemContent, keyContent string, err error) {
	if material.Mode == "stored" {
		if app == nil {
			return "", "", errors.New("app nil")
		}
		pemContent, keyContent, ok, err := loadStoredBaotaSSLMaterial(app.PlatformKV(), cfg)
		if err != nil {
			return "", "", fmt.Errorf("读取已保存的宝塔 HTTPS 证书失败: %w", err)
		}
		if !ok {
			return "", "", errors.New("未找到已保存的宝塔 HTTPS 证书内容")
		}
		return pemContent, keyContent, nil
	}
	pemBytes, err := os.ReadFile(material.PemPath)
	if err != nil {
		return "", "", fmt.Errorf("读取 PEM 证书失败: %w", err)
	}
	keyBytes, err := os.ReadFile(material.KeyPath)
	if err != nil {
		return "", "", fmt.Errorf("读取 KEY 私钥失败: %w", err)
	}
	pemContent = strings.TrimSpace(string(pemBytes))
	keyContent = strings.TrimSpace(string(keyBytes))
	if pemContent == "" || keyContent == "" {
		return "", "", errors.New("PEM/KEY 文件不能为空")
	}
	if _, err := tls.X509KeyPair([]byte(pemContent), []byte(keyContent)); err != nil {
		return "", "", fmt.Errorf("PEM/KEY 证书对校验失败: %w", err)
	}
	return pemContent, keyContent, nil
}

// EnsureBaotaHTTPS 在宝塔站点上部署证书并启用 HTTPS 访问，保留现有 HTTP 访问。
func EnsureBaotaHTTPS(app *ServerApp, cfg Config, domain string, override BaotaHTTPSConfig) error {
	domain = strings.TrimSpace(domain)
	if domain == "" {
		return nil
	}
	material, err := resolveBaotaHTTPSMaterial(cfg, override, hasStoredBaotaSSLMaterial(app))
	if err != nil {
		return err
	}
	if material.Mode == "cert-name" {
		_, err := CallBaotaAPI(cfg, "/ssl?action=SetCertToSite", map[string]string{
			"siteName": domain,
			"certName": material.CertName,
		})
		if err != nil {
			return fmt.Errorf("部署证书夹证书(SetCertToSite): %w", err)
		}
		return nil
	}
	pemContent, keyContent, err := loadBaotaHTTPSMaterial(app, cfg, material)
	if err != nil {
		return err
	}
	_, err = CallBaotaAPI(cfg, "/site?action=SetSSL", map[string]string{
		"siteName": domain,
		"key":      keyContent,
		"csr":      pemContent,
		"type":     "1",
	})
	if err != nil {
		return fmt.Errorf("部署 PEM/KEY 证书(SetSSL): %w", err)
	}
	return nil
}
