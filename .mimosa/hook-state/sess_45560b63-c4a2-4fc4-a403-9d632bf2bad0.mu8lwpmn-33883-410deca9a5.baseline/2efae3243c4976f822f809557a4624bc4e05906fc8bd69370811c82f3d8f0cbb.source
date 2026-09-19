package internal

import (
	"strings"
	"testing"
)

func TestRewriteIngressManifestK8sRegistryImages(t *testing.T) {
	raw := `image: registry.k8s.io/ingress-nginx/kube-webhook-certgen:v1.4.0@sha256:abc
other: k8s.gcr.io/pause:3.9
`
	cfg := Config{IngressNginxSkipK8sRegistryMirror: false}
	out := string(RewriteIngressManifestK8sRegistryImages([]byte(raw), cfg))
	if strings.Contains(out, "image: registry.k8s.io/") {
		t.Fatalf("expected bare registry.k8s.io in image line replaced: %q", out)
	}
	if !strings.Contains(out, "m.daocloud.io/registry.k8s.io/ingress-nginx/") {
		t.Fatalf("expected daocloud prefix: %q", out)
	}
	if strings.Contains(out, "other: k8s.gcr.io/") {
		t.Fatalf("expected bare k8s.gcr.io line replaced: %q", out)
	}
	if !strings.Contains(out, "m.daocloud.io/k8s.gcr.io/pause") {
		t.Fatalf("expected gcr mirror: %q", out)
	}

	cfgSkip := Config{IngressNginxSkipK8sRegistryMirror: true}
	out2 := string(RewriteIngressManifestK8sRegistryImages([]byte(raw), cfgSkip))
	if out2 != raw {
		t.Fatalf("skip should not rewrite: %q", out2)
	}

	custom := Config{
		IngressNginxK8sImageMirrorPrefix: "mirror.example.com/k8s",
	}
	out3 := string(RewriteIngressManifestK8sRegistryImages([]byte("image: registry.k8s.io/x:y\n"), custom))
	if !strings.Contains(out3, "mirror.example.com/k8s/x:y") {
		t.Fatalf("custom prefix: %q", out3)
	}
}
