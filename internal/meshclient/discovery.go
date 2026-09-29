package meshclient

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// EnrollmentCandidate describes a local one-use config without exposing its secrets.
type EnrollmentCandidate struct {
	Path     string    `json:"path"`
	Hostname string    `json:"hostname"`
	Platform string    `json:"platform"`
	Modified time.Time `json:"modified"`
}

// DesktopMarker contains only public display information. On Windows it is
// stored in HKLM so an unprivileged GUI can inspect a protected installation.
type DesktopMarker struct {
	Present  bool   `json:"present"`
	Complete bool   `json:"complete"`
	Platform string `json:"platform"`
	Hostname string `json:"hostname"`
}

func MarkerFor(cfg Config) DesktopMarker {
	return DesktopMarker{Present: true, Complete: true, Platform: cfg.Platform, Hostname: cfg.Hostname}
}

// ScanEnrollment examines only the user's Downloads and Desktop directories.
// A downloaded config must retain its expected filename and a usable one-use key.
func ScanEnrollment(home string) []EnrollmentCandidate {
	found := []EnrollmentCandidate{}
	for _, folder := range []string{"Downloads", "Desktop"} {
		entries, err := os.ReadDir(filepath.Join(home, folder))
		if err != nil {
			continue
		}
		for _, entry := range entries {
			name := entry.Name()
			if !strings.HasPrefix(name, "labplane-mesh-") || !strings.HasSuffix(strings.ToLower(name), ".json") || entry.IsDir() || entry.Type()&os.ModeSymlink != 0 {
				continue
			}
			path := filepath.Join(home, folder, name)
			info, err := entry.Info()
			if err != nil || !info.Mode().IsRegular() || info.Size() > 64<<10 {
				continue
			}
			cfg, err := LoadConfig(path)
			if err != nil || cfg.AuthKey == "" {
				continue
			}
			found = append(found, EnrollmentCandidate{Path: path, Hostname: cfg.Hostname, Platform: cfg.Platform, Modified: info.ModTime()})
		}
	}
	sort.Slice(found, func(i, j int) bool { return found[i].Modified.After(found[j].Modified) })
	return found
}

// DetectInstallation requires both the native agent and its persisted device
// enrollment. A standalone Tailscale installation is not a LabPlane client.
func DetectInstallation(agentPath, configPath string) bool {
	info, err := os.Stat(agentPath)
	if err != nil || !info.Mode().IsRegular() {
		return false
	}
	_, err = LoadConfig(configPath)
	return err == nil
}

// InstallationComplete distinguishes a finished join from a partial setup.
// AuthKey is removed from the local config only after Headscale join succeeds.
func InstallationComplete(agentPath, configPath string, transportInstalled, serviceInstalled bool) bool {
	if !transportInstalled || !serviceInstalled || !DetectInstallation(agentPath, configPath) {
		return false
	}
	cfg, err := LoadConfig(configPath)
	return err == nil && cfg.AuthKey == ""
}
