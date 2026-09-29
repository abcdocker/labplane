package meshclient

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestScanEnrollmentSelectsNewestValidConfig(t *testing.T) {
	home := t.TempDir()
	for _, dir := range []string{"Downloads", "Desktop", "Documents"} {
		if err := os.Mkdir(filepath.Join(home, dir), 0700); err != nil {
			t.Fatal(err)
		}
	}
	cfg := Config{InstanceID: "instance", ClientID: "client", Platform: "https://platform.example", Server: "https://headscale.example", Hostname: "device", AuthKey: "one-use", Token: "report-secret"}
	old := filepath.Join(home, "Downloads", "labplane-mesh-old.json")
	if err := SaveConfig(old, cfg); err != nil {
		t.Fatal(err)
	}
	newer := filepath.Join(home, "Desktop", "labplane-mesh-new.json")
	if err := SaveConfig(newer, cfg); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(newer, time.Now().Add(time.Hour), time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	invalid := filepath.Join(home, "Downloads", "labplane-mesh-invalid.json")
	if err := os.WriteFile(invalid, []byte("{bad"), 0600); err != nil {
		t.Fatal(err)
	}
	ignored := filepath.Join(home, "Documents", "labplane-mesh-ignored.json")
	if err := SaveConfig(ignored, cfg); err != nil {
		t.Fatal(err)
	}
	got := ScanEnrollment(home)
	if len(got) != 2 || got[0].Path != newer || got[1].Path != old {
		t.Fatalf("unexpected candidates: %+v", got)
	}
}

func TestScanEnrollmentIgnoresConsumedKey(t *testing.T) {
	home := t.TempDir()
	if err := os.Mkdir(filepath.Join(home, "Downloads"), 0700); err != nil {
		t.Fatal(err)
	}
	cfg := Config{InstanceID: "instance", ClientID: "client", Platform: "https://platform.example", Server: "https://headscale.example", Hostname: "device", Token: "report-secret"}
	if err := SaveConfig(filepath.Join(home, "Downloads", "labplane-mesh-device.json"), cfg); err != nil {
		t.Fatal(err)
	}
	if got := ScanEnrollment(home); got == nil || len(got) != 0 {
		t.Fatalf("expected empty candidate list, got: %+v", got)
	}
}

func TestDetectInstallationRequiresAgentAndValidConfig(t *testing.T) {
	dir := t.TempDir()
	agent := filepath.Join(dir, "labplane-mesh-client")
	config := filepath.Join(dir, "config.json")
	if DetectInstallation(agent, config) {
		t.Fatal("missing files counted as installed")
	}
	if err := os.WriteFile(agent, []byte("binary"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(config, []byte("invalid"), 0600); err != nil {
		t.Fatal(err)
	}
	if DetectInstallation(agent, config) {
		t.Fatal("invalid config counted as installed")
	}
	cfg := Config{InstanceID: "instance", ClientID: "client", Platform: "https://platform.example", Server: "https://headscale.example", Hostname: "device", Token: "report-secret"}
	if err := SaveConfig(config, cfg); err != nil {
		t.Fatal(err)
	}
	if !DetectInstallation(agent, config) {
		t.Fatal("valid installed client not detected")
	}
}

func TestFindTailscaleRejectsMissingOverride(t *testing.T) {
	t.Setenv("LABPLANE_TAILSCALE_BIN", filepath.Join(t.TempDir(), "missing-tailscale"))
	if _, err := FindTailscale(); err == nil {
		t.Fatal("missing overridden transport counted as installed")
	}
}

func TestInstallationCompleteRequiresFinishedJoinAndService(t *testing.T) {
	dir := t.TempDir()
	agent := filepath.Join(dir, "labplane-mesh-client")
	config := filepath.Join(dir, "config.json")
	if err := os.WriteFile(agent, []byte("binary"), 0700); err != nil {
		t.Fatal(err)
	}
	cfg := Config{InstanceID: "instance", ClientID: "client", Platform: "https://platform.example", Server: "https://headscale.example", Hostname: "device", AuthKey: "unused-one-use-key", Token: "report-secret"}
	if err := SaveConfig(config, cfg); err != nil {
		t.Fatal(err)
	}
	if InstallationComplete(agent, config, true, true) {
		t.Fatal("unfinished Headscale join counted as complete")
	}
	cfg.AuthKey = ""
	if err := SaveConfig(config, cfg); err != nil {
		t.Fatal(err)
	}
	if InstallationComplete(agent, config, true, false) || InstallationComplete(agent, config, false, true) {
		t.Fatal("missing service or transport counted as complete")
	}
	if !InstallationComplete(agent, config, true, true) {
		t.Fatal("healthy installation counted as incomplete")
	}
}

func TestDesktopMarkerContainsNoEnrollmentSecrets(t *testing.T) {
	cfg := Config{InstanceID: "instance", ClientID: "client", Platform: "https://platform.example", Server: "https://headscale.example", Hostname: "device", AuthKey: "one-use-secret", Token: "report-secret"}
	marker := MarkerFor(cfg)
	raw, err := json.Marshal(marker)
	if err != nil {
		t.Fatal(err)
	}
	if marker.Platform != cfg.Platform || marker.Hostname != cfg.Hostname || string(raw) == "" {
		t.Fatalf("bad marker: %+v", marker)
	}
	if strings.Contains(string(raw), "one-use-secret") || strings.Contains(string(raw), "report-secret") {
		t.Fatal("marker leaked credentials")
	}
}
