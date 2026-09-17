package internal

import (
	"strings"
	"testing"
)

func TestGithubRawToJsdelivrURL(t *testing.T) {
	u := "https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/baremetal/deploy.yaml"
	got, ok := githubRawToJsdelivrURL(u)
	if !ok {
		t.Fatal("expected ok")
	}
	want := "https://cdn.jsdelivr.net/gh/kubernetes/ingress-nginx@controller-v1.10.0/deploy/static/provider/baremetal/deploy.yaml"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	_, ok2 := githubRawToJsdelivrURL("https://example.com/a")
	if ok2 {
		t.Fatal("expected false for non-github")
	}
}

func TestManifestDownloadCandidates_order(t *testing.T) {
	u := "https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy.yaml"
	c := manifestDownloadCandidates(u, ManifestMirrorGhProxyPreferred)
	if len(c) < 4 {
		t.Fatalf("expected several candidates, got %d", len(c))
	}
	if !strings.HasPrefix(c[0], "https://cdn.jsdelivr.net/gh/") {
		t.Fatalf("ghproxy_preferred should try jsdelivr first: %q", c[0])
	}
	if c[len(c)-1] != u {
		t.Fatalf("last should be direct url: %q", c[len(c)-1])
	}
	d := manifestDownloadCandidates(u, ManifestMirrorDirect)
	if len(d) != 1 || d[0] != u {
		t.Fatalf("direct: %v", d)
	}
}
