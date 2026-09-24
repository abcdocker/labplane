package internal

import "testing"

func TestBaotaHTTPSFromAnnotations(t *testing.T) {
	cfg := BaotaHTTPSFromAnnotations(map[string]string{
		"labplane.io/baota-https":         "true",
		"labplane.io/baota-ssl-cert-name": "modern-cert",
		"labplane.io/baota-ssl-pem-path":  "/modern/site.pem",
		"labplane.io/baota-ssl-key-path":  "/modern/site.key",
	})
	if !cfg.Enable {
		t.Fatal("expected https enabled")
	}
	if cfg.CertName != "modern-cert" {
		t.Fatalf("cert name: got %q want modern-cert", cfg.CertName)
	}
	if cfg.PemPath != "/modern/site.pem" {
		t.Fatalf("pem path: got %q want modern pem", cfg.PemPath)
	}
	if cfg.KeyPath != "/modern/site.key" {
		t.Fatalf("key path: got %q want modern key", cfg.KeyPath)
	}
}
