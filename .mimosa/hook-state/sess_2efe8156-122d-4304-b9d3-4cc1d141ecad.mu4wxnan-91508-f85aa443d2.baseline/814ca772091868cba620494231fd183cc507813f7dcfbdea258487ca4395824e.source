package internal

import (
	"strings"
	"testing"
)

func TestPatchHysteria2ClientYAMLForCluster(t *testing.T) {
	in := `server: x:443
http:
  listen: 127.0.0.1:8080
socks5:
  listen: localhost:1080
`
	out := PatchHysteria2ClientYAMLForCluster(in)
	if !strings.Contains(out, "listen: 0.0.0.0:8080") || !strings.Contains(out, "listen: 0.0.0.0:1080") {
		t.Fatalf("unexpected output:\n%s", out)
	}
}

func TestExpandHysteriaShareURIToClientYAML(t *testing.T) {
	uri := "hysteria2://18c05b6d-a5a1-4cde-a016-6af03db7c5e5@154.9.254.36:21092/?insecure=1&sni=bing.com#Hysteria2"
	out := NormalizeHysteriaClientSecretYAML(uri, 8080)
	if strings.Contains(out, "#Hysteria2") {
		t.Fatalf("fragment should be stripped:\n%s", out)
	}
	if !strings.Contains(out, `server: "hysteria2://`) || !strings.Contains(out, `insecure=1`) {
		t.Fatalf("missing server line:\n%s", out)
	}
	if !strings.Contains(out, "listen: 0.0.0.0:8080") {
		t.Fatalf("expected cluster listen patch:\n%s", out)
	}
}

func TestDefaultHysteriaBinaryURLsUseAppTag(t *testing.T) {
	if !strings.Contains(defaultHysteriaLinuxAMD64URL, "/download/app/v2.6.5/") {
		t.Fatalf("amd64 default URL should use app/v2.6.5 path: %s", defaultHysteriaLinuxAMD64URL)
	}
	if !strings.Contains(defaultHysteriaLinuxARM64URL, "/download/app/v2.6.5/") {
		t.Fatalf("arm64 default URL should use app/v2.6.5 path: %s", defaultHysteriaLinuxARM64URL)
	}
}

func TestExpandHysteriaMirrorURLsIncludesPrimaryAndGitHubMirrors(t *testing.T) {
	u := "https://github.com/apernet/hysteria/releases/download/app/v2.6.5/hysteria-linux-amd64"
	got := expandHysteriaMirrorURLs(u)
	if len(got) < 3 || got[0] != u {
		t.Fatalf("unexpected: %v", got)
	}
	var hasKK bool
	for _, x := range got {
		if strings.HasPrefix(x, "https://kkgithub.com/") {
			hasKK = true
			break
		}
	}
	if !hasKK {
		t.Fatalf("expected kkgithub mirror for github.com URL: %v", got)
	}
}

func TestResolveCloudVMHysteriaDownloadPrimaries(t *testing.T) {
	a, r := resolveCloudVMHysteriaDownloadPrimaries(nil)
	if a != defaultHysteriaLinuxAMD64URL || r != defaultHysteriaLinuxARM64URL {
		t.Fatalf("nil boot: %q %q", a, r)
	}
	custom := "https://cdn.example/hy-amd64"
	a, r = resolveCloudVMHysteriaDownloadPrimaries(&CloudVMBootstrap{Hysteria2LinuxAmd64URL: custom})
	if a != custom || r != defaultHysteriaLinuxARM64URL {
		t.Fatalf("custom amd only: %q %q", a, r)
	}
}

func TestHysteriaSocksListenPortFromClientYAML(t *testing.T) {
	y := `server: "hy2://x"
socks5:
  listen: 0.0.0.0:1080
`
	if hysteriaSocksListenPortFromClientYAML(y) != 1080 {
		t.Fatalf("expected 1080")
	}
	if hysteriaSocksListenPortFromClientYAML("http:\n  listen: 0.0.0.0:8080\n") != 0 {
		t.Fatalf("http-only yaml should not yield socks port")
	}
}

func TestExpandHysteriaShareURIHy2(t *testing.T) {
	uri := "hy2://tok@example.com:443/?sni=ex.com"
	out := ExpandHysteriaShareURIToClientYAML(uri, 9090)
	if !strings.Contains(out, "hy2://") || !strings.Contains(out, "127.0.0.1:9090") {
		t.Fatalf("unexpected:\n%s", out)
	}
}
