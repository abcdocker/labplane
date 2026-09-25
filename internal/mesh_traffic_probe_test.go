package internal

import (
	"strings"
	"testing"
)

func TestParseTailscaleProbeNative(t *testing.T) {
	r, ok := parseTailscaleProbe("native:/usr/bin/tailscale\n1.66.4\ntailscale status placeholder\n")
	if !ok || r.Mode != "native" || r.Command != "/usr/bin/tailscale status --json" {
		t.Fatalf("native 解析错误: %+v ok=%v", r, ok)
	}
	if r.Version != "1.66.4" {
		t.Fatalf("版本解析错误: %q", r.Version)
	}
}

func TestParseTailscaleProbeNativeNoVersion(t *testing.T) {
	r, ok := parseTailscaleProbe("native:/snap/bin/tailscale\n")
	if !ok || r.Version != "" {
		t.Fatalf("无版本输出应保留空版本: %+v", r)
	}
}

func TestParseTailscaleProbeContainers(t *testing.T) {
	cases := []struct{ line, wantCmd string }{
		{"docker:/usr/bin/docker:ts-node", "/usr/bin/docker exec ts-node tailscale status --json"},
		{"podman:/usr/bin/podman:tailscale", "/usr/bin/podman exec tailscale tailscale status --json"},
		{"nerdctl:/usr/local/bin/nerdctl:ts", "/usr/local/bin/nerdctl exec ts tailscale status --json"},
		{"crictl:crictl:e1a2b3c4d5e6", "crictl exec e1a2b3c4d5e6 tailscale status --json"},
	}
	for _, c := range cases {
		r, ok := parseTailscaleProbe(c.line + "\n")
		if !ok || r.Command != c.wantCmd {
			t.Errorf("%s: got %+v ok=%v, want cmd %q", c.line, r, ok, c.wantCmd)
		}
		if !strings.Contains(c.line, r.Mode) {
			t.Errorf("%s: Mode=%q 应包含在行内", c.line, r.Mode)
		}
	}
}

func TestParseTailscaleProbeNone(t *testing.T) {
	if _, ok := parseTailscaleProbe("none\n"); ok {
		t.Fatal("none 输出不应判定为找到")
	}
	if _, ok := parseTailscaleProbe(""); ok {
		t.Fatal("空输出不应判定为找到")
	}
}
