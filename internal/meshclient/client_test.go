package meshclient

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestParseStatusUsesLocalSelfAndBackendState(t *testing.T) {
	raw := []byte(`{"Version":"1.102.4","BackendState":"Running","Self":{"ID":"n123","HostName":"office-mac","TailscaleIPs":["100.64.0.8"],"Endpoints":["192.168.1.8:41641"],"Online":true},"Peer":{"other":{"HostName":"untrusted-peer"}}}`)
	got, err := ParseStatus(raw)
	if err != nil {
		t.Fatal(err)
	}
	if got.Hostname != "office-mac" || got.NodeID != "n123" || !got.Online || len(got.Endpoints) != 1 {
		t.Fatalf("unexpected status: %+v", got)
	}
	var roundtrip map[string]any
	if err := json.Unmarshal(raw, &roundtrip); err != nil {
		t.Fatal(err)
	}
	if got.Hostname == "untrusted-peer" {
		t.Fatal("peer was mistaken for local device")
	}
}

func TestConfigRemovesOneUseKeyWithoutLosingCredential(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	cfg := Config{InstanceID: "instance", ClientID: "client", Platform: "https://platform.example", Server: "https://headscale.example", Hostname: "device", AuthKey: "one-use", Token: "report-secret"}
	if err := SaveConfig(path, cfg); err != nil {
		t.Fatal(err)
	}
	cfg.AuthKey = ""
	if err := SaveConfig(path, cfg); err != nil {
		t.Fatal(err)
	}
	got, err := LoadConfig(path)
	if err != nil {
		t.Fatal(err)
	}
	if got.AuthKey != "" || got.Token != "report-secret" {
		t.Fatalf("wrong persisted config: %+v", got)
	}
}

func TestConfigRejectsInsecureEndpoints(t *testing.T) {
	cfg := Config{InstanceID: "instance", ClientID: "client", Platform: "http://platform.example", Server: "https://headscale.example", Hostname: "device", Token: "secret"}
	if ValidateConfig(cfg) == nil {
		t.Fatal("accepted non-TLS platform URL")
	}
}

func TestConnectReusesEnrollmentWithoutOneUseKey(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("test fixture uses a POSIX executable")
	}
	dir := t.TempDir()
	argsFile := filepath.Join(dir, "args")
	bin := filepath.Join(dir, "tailscale")
	if err := os.WriteFile(bin, []byte("#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$MESH_TEST_ARGS\"\n"), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("LABPLANE_TAILSCALE_BIN", bin)
	t.Setenv("MESH_TEST_ARGS", argsFile)
	path := filepath.Join(dir, "config.json")
	cfg := Config{InstanceID: "instance", ClientID: "client", Platform: "https://platform.example", Server: "https://headscale.example", Hostname: "device", Token: "report-secret"}
	if err := SaveConfig(path, cfg); err != nil {
		t.Fatal(err)
	}
	if err := Connect(context.Background(), path); err != nil {
		t.Fatal(err)
	}
	args, err := os.ReadFile(argsFile)
	if err != nil {
		t.Fatal(err)
	}
	got := string(args)
	if !strings.Contains(got, "--login-server=https://headscale.example") || !strings.Contains(got, "--hostname=device") || strings.Contains(got, "--auth-key") || strings.Contains(got, "--reset") {
		t.Fatalf("unexpected reconnect args: %s", got)
	}
}
