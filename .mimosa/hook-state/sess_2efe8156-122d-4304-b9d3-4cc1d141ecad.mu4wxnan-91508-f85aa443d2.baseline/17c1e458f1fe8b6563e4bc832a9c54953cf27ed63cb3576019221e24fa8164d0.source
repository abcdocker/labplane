package internal

import (
	"strings"
	"testing"
)

func TestRewriteKubePrometheusRenderedImages_PrometheusOrgUsesDirectQuay(t *testing.T) {
	raw := []byte(`image: quay.io/prometheus/alertmanager:v0.27.0
image: quay.io/prometheus/node-exporter:v1.8.2
image: quay.io/prometheus-operator/prometheus-operator:v0.76.0
`)
	out := string(RewriteKubePrometheusRenderedImages(raw))
	if strings.Contains(out, "quay.m.daocloud.io/prometheus/") {
		t.Fatalf("prometheus org images should not stay on DaoCloud mirror, got:\n%s", out)
	}
	if !strings.Contains(out, "quay.io/prometheus/alertmanager") {
		t.Fatalf("expected direct quay for alertmanager, got:\n%s", out)
	}
	if !strings.Contains(out, "quay.io/prometheus/node-exporter") {
		t.Fatalf("expected direct quay for node-exporter, got:\n%s", out)
	}
	if !strings.Contains(out, "quay.m.daocloud.io/prometheus-operator/") {
		t.Fatalf("prometheus-operator org should remain mirrored, got:\n%s", out)
	}
}
