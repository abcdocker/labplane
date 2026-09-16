package internal

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestResolveBaotaHTTPSMaterial_Precedence(t *testing.T) {
	cfg := Config{
		BaotaSSLCertName: "global-cert",
		BaotaSSLPemPath:  "/global/site.pem",
		BaotaSSLKeyPath:  "/global/site.key",
	}
	material, err := resolveBaotaHTTPSMaterial(cfg, BaotaHTTPSConfig{
		CertName: "ingress-cert",
		PemPath:  "/ingress/site.pem",
		KeyPath:  "/ingress/site.key",
	}, false)
	if err != nil {
		t.Fatalf("resolve material: %v", err)
	}
	if material.Mode != "pem-path" {
		t.Fatalf("mode: got %q want pem-path", material.Mode)
	}
	if material.PemPath != "/ingress/site.pem" || material.KeyPath != "/ingress/site.key" {
		t.Fatalf("unexpected ingress pem/key: %#v", material)
	}
}

func TestResolveBaotaHTTPSMaterial_StoredFallback(t *testing.T) {
	cfg := Config{BaotaSSLCertName: "global-cert"}
	material, err := resolveBaotaHTTPSMaterial(cfg, BaotaHTTPSConfig{}, true)
	if err != nil {
		t.Fatalf("resolve material: %v", err)
	}
	if material.Mode != "stored" {
		t.Fatalf("mode: got %q want stored", material.Mode)
	}
}

func TestResolveBaotaHTTPSMaterial_GlobalPemFallback(t *testing.T) {
	cfg := Config{
		BaotaSSLCertName: "global-cert",
		BaotaSSLPemPath:  "/global/site.pem",
		BaotaSSLKeyPath:  "/global/site.key",
	}
	material, err := resolveBaotaHTTPSMaterial(cfg, BaotaHTTPSConfig{}, false)
	if err != nil {
		t.Fatalf("resolve material: %v", err)
	}
	if material.Mode != "pem-path" {
		t.Fatalf("mode: got %q want pem-path", material.Mode)
	}
	if material.PemPath != "/global/site.pem" || material.KeyPath != "/global/site.key" {
		t.Fatalf("unexpected global pem/key: %#v", material)
	}
}

func TestResolveBaotaHTTPSMaterial_CertNameFallback(t *testing.T) {
	cfg := Config{BaotaSSLCertName: "global-cert"}
	material, err := resolveBaotaHTTPSMaterial(cfg, BaotaHTTPSConfig{}, false)
	if err != nil {
		t.Fatalf("resolve material: %v", err)
	}
	if material.Mode != "cert-name" || material.CertName != "global-cert" {
		t.Fatalf("unexpected material: %#v", material)
	}
}

func TestResolveBaotaHTTPSMaterial_InvalidPemPair(t *testing.T) {
	_, err := resolveBaotaHTTPSMaterial(Config{}, BaotaHTTPSConfig{PemPath: "/only.pem"}, false)
	if err == nil {
		t.Fatal("expected error for incomplete ingress pem/key")
	}
}

func TestValidateBaotaSSLMaterialContent(t *testing.T) {
	pemContent, keyContent := generateTestTLSPair(t)
	if err := validateBaotaSSLMaterialContent(pemContent, keyContent); err != nil {
		t.Fatalf("expected valid pem/key pair: %v", err)
	}
	if err := validateBaotaSSLMaterialContent(pemContent, ""); err == nil {
		t.Fatal("expected error for incomplete content pair")
	}
}

func TestSaveLoadStoredBaotaSSLMaterial_FileFallback(t *testing.T) {
	tmpDir := t.TempDir()
	app := &ServerApp{dataDir: tmpDir}
	cfg := Config{EncryptionKey: "0123456789abcdef"}
	pemContent, keyContent := generateTestTLSPair(t)

	if err := saveStoredBaotaSSLMaterial(app, cfg, pemContent, keyContent); err != nil {
		t.Fatalf("save material: %v", err)
	}

	kv, err := newPlatformKVFile(tmpDir)
	if err != nil {
		t.Fatalf("open platform kv: %v", err)
	}
	raw, ok := kv.Get(baotaSSLMaterialKVKey)
	if !ok || strings.TrimSpace(raw) == "" {
		t.Fatal("expected encrypted material to be stored")
	}
	if strings.Contains(raw, "BEGIN CERTIFICATE") || strings.Contains(raw, "PRIVATE KEY") {
		t.Fatalf("expected stored value to stay encrypted, got %q", raw)
	}
	gotPEM, gotKey, ok, err := loadStoredBaotaSSLMaterial(kv, cfg)
	if err != nil {
		t.Fatalf("load material: %v", err)
	}
	if !ok {
		t.Fatal("expected stored material to exist")
	}
	if gotPEM != strings.TrimSpace(pemContent) || gotKey != strings.TrimSpace(keyContent) {
		t.Fatal("loaded material mismatch")
	}
	if _, err := osStat(filepath.Join(tmpDir, "platform_kv.json")); err != nil {
		t.Fatalf("expected platform_kv.json to be written: %v", err)
	}
}

func TestClearStoredBaotaSSLMaterial_FileFallback(t *testing.T) {
	tmpDir := t.TempDir()
	app := &ServerApp{dataDir: tmpDir}
	cfg := Config{EncryptionKey: "0123456789abcdef"}
	pemContent, keyContent := generateTestTLSPair(t)

	if err := saveStoredBaotaSSLMaterial(app, cfg, pemContent, keyContent); err != nil {
		t.Fatalf("save material: %v", err)
	}
	if err := clearStoredBaotaSSLMaterial(app, cfg); err != nil {
		t.Fatalf("clear material: %v", err)
	}

	kv, err := newPlatformKVFile(tmpDir)
	if err != nil {
		t.Fatalf("open platform kv: %v", err)
	}
	_, _, ok, err := loadStoredBaotaSSLMaterial(kv, cfg)
	if err != nil {
		t.Fatalf("load material after clear: %v", err)
	}
	if ok {
		t.Fatal("expected stored material to be cleared")
	}
}

func generateTestTLSPair(t *testing.T) (string, string) {
	t.Helper()
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	der, err := x509.CreateCertificate(rand.Reader, &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{CommonName: "localhost"},
		NotBefore: time.Now().Add(-time.Hour),
		NotAfter:  time.Now().Add(24 * time.Hour),
		KeyUsage:  x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{
			x509.ExtKeyUsageServerAuth,
		},
		DNSNames: []string{"localhost"},
	}, &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{CommonName: "localhost"},
		NotBefore: time.Now().Add(-time.Hour),
		NotAfter:  time.Now().Add(24 * time.Hour),
		KeyUsage:  x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{
			x509.ExtKeyUsageServerAuth,
		},
		DNSNames: []string{"localhost"},
	}, &priv.PublicKey, priv)
	if err != nil {
		t.Fatalf("create cert: %v", err)
	}
	keyDER, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		t.Fatalf("marshal key: %v", err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})
	return string(certPEM), string(keyPEM)
}

func osStat(path string) (bool, error) {
	_, err := os.Stat(path)
	if err != nil {
		return false, err
	}
	return true, nil
}
