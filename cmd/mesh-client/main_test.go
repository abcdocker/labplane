package main

import (
	"path/filepath"
	"testing"

	"github.com/abcdocker/labplane/internal/meshclient"
)

func TestLaunchctlRunningDistinguishesLoadedAndRunning(t *testing.T) {
	if launchctlRunning("state = waiting\nactive count = 0") {
		t.Fatal("loaded but stopped agent counted as running")
	}
	if !launchctlRunning("state = running\nactive count = 1") {
		t.Fatal("active agent not counted as running")
	}
}

func TestLoadInstallConfigFallsBackToIncompleteInstallation(t *testing.T) {
	dir := t.TempDir()
	installed := filepath.Join(dir, "installed", "config.json")
	cfg := meshclient.Config{InstanceID: "instance", ClientID: "client", Platform: "https://platform.example", Server: "https://headscale.example", Hostname: "device", AuthKey: "unused", Token: "report-secret"}
	if err := meshclient.SaveConfig(installed, cfg); err != nil {
		t.Fatal(err)
	}
	got, err := loadInstallConfig(filepath.Join(dir, "temporary"), installed)
	if err != nil || got.ClientID != cfg.ClientID || got.AuthKey != cfg.AuthKey {
		t.Fatalf("repair lost persisted enrollment: %+v, %v", got, err)
	}
}
