// labplane-mesh-client is the native companion that installs and manages the
// Tailscale transport and reports the device's observed state to LabPlane.
package main

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"os/user"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/abcdocker/labplane/internal/meshclient"
)

func main() {
	if len(os.Args) < 2 {
		fatal("usage: labplane-mesh-client install|join|run|status|inspect|start|connect|disconnect|validate <config.json>")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	var err error
	switch os.Args[1] {
	case "install":
		err = install(ctx)
	case "join":
		err = meshclient.Join(ctx, configPath())
	case "run":
		err = runService(ctx)
	case "status":
		v := meshclient.ReadStatus(ctx)
		raw, _ := json.MarshalIndent(v, "", "  ")
		fmt.Println(string(raw))
	case "inspect":
		v := inspectLocal(ctx)
		raw, _ := json.Marshal(v)
		fmt.Println(string(raw))
	case "start":
		err = startClientService(ctx)
	case "connect":
		err = meshclient.Connect(ctx, configPath())
	case "disconnect":
		err = meshclient.Disconnect(ctx)
	case "validate":
		if len(os.Args) != 3 {
			err = errors.New("usage: labplane-mesh-client validate <config.json>")
		} else {
			_, err = meshclient.LoadConfig(os.Args[2])
		}
	default:
		fatal("unknown command")
	}
	if err != nil && !errors.Is(err, context.Canceled) {
		fatal(err.Error())
	}
}

func fatal(s string) { fmt.Fprintln(os.Stderr, s); os.Exit(1) }

func installDir() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("ProgramData"), "LabPlaneMesh")
	case "darwin":
		return "/Library/Application Support/LabPlaneMesh"
	default:
		return "/opt/labplane-mesh"
	}
}

func configPath() string {
	if p := os.Getenv("LABPLANE_MESH_CONFIG"); p != "" {
		return p
	}
	if runtime.GOOS == "darwin" {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "Application Support", "LabPlaneMesh", "config.json")
	}
	return filepath.Join(installDir(), "config.json")
}

func macInstallUser() (*user.User, error) {
	name := os.Getenv("SUDO_USER")
	if name == "" || name == "root" {
		return nil, errors.New("on macOS, run install with sudo from the logged-in user's Terminal")
	}
	return user.Lookup(name)
}

func installedConfigPath() (string, error) {
	if runtime.GOOS != "darwin" {
		return configPath(), nil
	}
	u, err := macInstallUser()
	if err != nil {
		return "", err
	}
	return filepath.Join(u.HomeDir, "Library", "Application Support", "LabPlaneMesh", "config.json"), nil
}

func installerName() string {
	switch runtime.GOOS {
	case "windows":
		return "tailscale.msi"
	case "darwin":
		return "tailscale.pkg"
	default:
		return "tailscale.tgz"
	}
}

type localInspection struct {
	Installed          bool                             `json:"installed"`
	Complete           bool                             `json:"complete"`
	TransportInstalled bool                             `json:"transportInstalled"`
	ServiceInstalled   bool                             `json:"serviceInstalled"`
	ServiceRunning     bool                             `json:"serviceRunning"`
	Platform           string                           `json:"platform,omitempty"`
	Server             string                           `json:"server,omitempty"`
	Hostname           string                           `json:"hostname,omitempty"`
	Candidates         []meshclient.EnrollmentCandidate `json:"candidates"`
	Status             meshclient.Status                `json:"status"`
}

func inspectLocal(ctx context.Context) localInspection {
	home, _ := os.UserHomeDir()
	if runtime.GOOS == "darwin" {
		// The agent can be run from the app bundle. Inspection must use the
		// logged-in user's home rather than a privileged install context.
		home = os.Getenv("HOME")
	}
	v := localInspection{Candidates: meshclient.ScanEnrollment(home), Status: meshclient.ReadStatus(ctx)}
	agent := filepath.Join(installDir(), filepath.Base(os.Args[0]))
	if runtime.GOOS == "darwin" {
		agent = filepath.Join(installDir(), "labplane-mesh-client")
	}
	v.Installed = meshclient.DetectInstallation(agent, configPath())
	_, err := meshclient.FindTailscale()
	v.TransportInstalled = err == nil
	if v.Installed {
		if cfg, err := meshclient.LoadConfig(configPath()); err == nil {
			v.Platform, v.Server, v.Hostname = cfg.Platform, cfg.Server, cfg.Hostname
		}
	}
	v.ServiceInstalled, v.ServiceRunning = serviceState(ctx)
	v.Complete = meshclient.InstallationComplete(agent, configPath(), v.TransportInstalled, v.ServiceInstalled)
	return v
}

func serviceRunning(ctx context.Context) bool {
	_, running := serviceState(ctx)
	return running
}

func serviceState(ctx context.Context) (bool, bool) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.CommandContext(ctx, "sc.exe", "query", "LabPlaneMesh")
	case "darwin":
		cmd = exec.CommandContext(ctx, "launchctl", "print", "gui/"+strconv.Itoa(os.Getuid())+"/cn.labplane.mesh-client")
	case "linux":
		installed := exec.CommandContext(ctx, "systemctl", "cat", "labplane-mesh-client.service").Run() == nil
		running := exec.CommandContext(ctx, "systemctl", "is-active", "--quiet", "labplane-mesh-client.service").Run() == nil
		return installed, running
	default:
		return false, false
	}
	out, err := cmd.CombinedOutput()
	if err != nil {
		return false, false
	}
	if runtime.GOOS == "windows" {
		return true, strings.Contains(string(out), "RUNNING")
	}
	if runtime.GOOS == "darwin" {
		return true, launchctlRunning(string(out))
	}
	return true, true
}

func launchctlRunning(output string) bool {
	return strings.Contains(output, "state = running")
}

func startClientService(ctx context.Context) error {
	switch runtime.GOOS {
	case "windows":
		if err := runCommand(ctx, "sc.exe", "start", "Tailscale"); err != nil && !transportReady(ctx) {
			return err
		}
		if err := runCommand(ctx, "sc.exe", "start", "LabPlaneMesh"); err != nil && !serviceRunning(ctx) {
			return err
		}
		return nil
	case "darwin":
		if err := runCommand(ctx, "/usr/bin/open", "-a", "Tailscale"); err != nil {
			return err
		}
		return runCommand(ctx, "launchctl", "kickstart", "gui/"+strconv.Itoa(os.Getuid())+"/cn.labplane.mesh-client")
	case "linux":
		if err := runCommand(ctx, "systemctl", "start", "labplane-tailscaled.service"); err != nil {
			return err
		}
		return runCommand(ctx, "systemctl", "start", "labplane-mesh-client.service")
	default:
		return errors.New("unsupported OS")
	}
}

func install(ctx context.Context) error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	source := filepath.Dir(self)
	config, err := installedConfigPath()
	if err != nil {
		return err
	}
	cfg, err := loadInstallConfig(source, config)
	if err != nil {
		return fmt.Errorf("package config: %w", err)
	}
	installMode := os.FileMode(0700)
	if runtime.GOOS == "darwin" {
		installMode = 0755
	}
	if err := os.MkdirAll(installDir(), installMode); err != nil {
		return fmt.Errorf("administrator privileges required: %w", err)
	}
	if runtime.GOOS == "darwin" {
		if err := os.Chmod(installDir(), 0755); err != nil {
			return err
		}
	}
	installed := filepath.Join(installDir(), filepath.Base(self))
	if filepath.Clean(self) != filepath.Clean(installed) {
		if err := copyFile(self, installed, 0755); err != nil {
			return err
		}
	}
	if runtime.GOOS == "windows" {
		if err := runCommand(ctx, "icacls.exe", installDir(), "/inheritance:r", "/grant:r", "*S-1-5-18:(OI)(CI)F", "*S-1-5-32-544:(OI)(CI)F"); err != nil {
			return fmt.Errorf("secure client directory: %w", err)
		}
	}
	if err := meshclient.SaveConfig(config, cfg); err != nil {
		return err
	}
	if runtime.GOOS == "darwin" {
		u, err := macInstallUser()
		if err != nil {
			return err
		}
		uid, _ := strconv.Atoi(u.Uid)
		gid, _ := strconv.Atoi(u.Gid)
		if err := os.Chown(filepath.Dir(config), uid, gid); err != nil {
			return err
		}
		if err := os.Chown(config, uid, gid); err != nil {
			return err
		}
	}
	if runtime.GOOS == "windows" {
		if err := meshclient.BeginDesktopInstall(cfg); err != nil {
			return fmt.Errorf("record installation progress: %w", err)
		}
	}
	if err := installTailscale(ctx, filepath.Join(source, installerName())); err != nil {
		return err
	}
	if err := startTransport(ctx); err != nil {
		return err
	}
	if err := installService(ctx, installed); err != nil {
		return err
	}
	ready := false
	for attempt := 0; attempt < 30; attempt++ {
		if transportReady(ctx) {
			ready = true
			break
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	if !ready {
		return errors.New("Tailscale transport is not ready; approve VPN access if prompted, then run labplane-mesh-client join")
	}
	if cfg.AuthKey != "" {
		if runtime.GOOS == "darwin" {
			u, err := macInstallUser()
			if err != nil {
				return err
			}
			if err := runCommand(ctx, "sudo", "-u", u.Username, installed, "join"); err != nil {
				return err
			}
		} else if err := meshclient.Join(ctx, config); err != nil {
			return err
		}
	}
	if runtime.GOOS == "windows" {
		if err := meshclient.WriteDesktopMarker(cfg); err != nil {
			return fmt.Errorf("record completed installation: %w", err)
		}
	}
	fmt.Println("LabPlane Mesh client installed and connected")
	return nil
}

func loadInstallConfig(sourceDir, installedPath string) (meshclient.Config, error) {
	source := filepath.Join(sourceDir, "config.json")
	cfg, err := meshclient.LoadConfig(source)
	if err == nil || !errors.Is(err, os.ErrNotExist) {
		return cfg, err
	}
	return meshclient.LoadConfig(installedPath)
}

func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err = io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func runCommand(ctx context.Context, bin string, args ...string) error {
	c, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(c, bin, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s failed: %w: %s", filepath.Base(bin), err, strings.TrimSpace(string(out)))
	}
	return nil
}

func installTailscale(ctx context.Context, pkg string) error {
	if runtime.GOOS == "windows" || runtime.GOOS == "darwin" {
		if _, err := meshclient.FindTailscale(); err == nil {
			return nil
		}
	}
	if _, err := os.Stat(pkg); err != nil {
		return fmt.Errorf("bundled Tailscale installer missing: %w", err)
	}
	switch runtime.GOOS {
	case "windows":
		return runCommand(ctx, "msiexec.exe", "/i", pkg, "/qn", "/norestart")
	case "darwin":
		return runCommand(ctx, "/usr/sbin/installer", "-pkg", pkg, "-target", "/")
	case "linux":
		return installLinuxTransport(pkg)
	default:
		return errors.New("unsupported OS")
	}
}

func installLinuxTransport(pkg string) error {
	f, err := os.Open(pkg)
	if err != nil {
		return err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	found := map[string]bool{}
	for {
		h, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}
		base := filepath.Base(h.Name)
		if h.Typeflag != tar.TypeReg || (base != "tailscale" && base != "tailscaled") {
			continue
		}
		if found[base] {
			return fmt.Errorf("duplicate %s in package", base)
		}
		found[base] = true
		dst := filepath.Join(installDir(), base)
		out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
		if err != nil {
			return err
		}
		if _, err = io.CopyN(out, tr, h.Size); err != nil {
			out.Close()
			return err
		}
		if err = out.Close(); err != nil {
			return err
		}
	}
	if !found["tailscale"] || !found["tailscaled"] {
		return errors.New("Tailscale package lacks required binaries")
	}
	if err := os.MkdirAll("/etc/systemd/system", 0755); err != nil {
		return err
	}
	unit := "[Unit]\nDescription=Tailscale transport for LabPlane Mesh\nAfter=network-online.target\nWants=network-online.target\n[Service]\nType=simple\nExecStart=" + filepath.Join(installDir(), "tailscaled") + " --state=" + filepath.Join(installDir(), "tailscaled.state") + "\nRestart=on-failure\n[Install]\nWantedBy=multi-user.target\n"
	return os.WriteFile("/etc/systemd/system/labplane-tailscaled.service", []byte(unit), 0644)
}

func startTransport(ctx context.Context) error {
	if transportReady(ctx) {
		return nil
	}
	switch runtime.GOOS {
	case "windows":
		_ = runCommand(ctx, "sc.exe", "start", "Tailscale")
		return nil
	case "darwin":
		u, err := macInstallUser()
		if err != nil {
			return err
		}
		_ = runCommand(ctx, "sudo", "-u", u.Username, "/usr/bin/open", "-a", "Tailscale")
		return nil
	case "linux":
		if err := runCommand(ctx, "systemctl", "daemon-reload"); err != nil {
			return err
		}
		return runCommand(ctx, "systemctl", "enable", "--now", "labplane-tailscaled.service")
	default:
		return errors.New("unsupported OS")
	}
}

func transportReady(ctx context.Context) bool {
	if runtime.GOOS == "darwin" {
		u, err := macInstallUser()
		if err != nil {
			return false
		}
		c, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		cmd := exec.CommandContext(c, "sudo", "-u", u.Username, "/usr/bin/env", "TAILSCALE_BE_CLI=1", "/Applications/Tailscale.app/Contents/MacOS/Tailscale", "status", "--json")
		raw, err := cmd.Output()
		if err != nil {
			return false
		}
		var status struct {
			BackendState string `json:"BackendState"`
		}
		return json.Unmarshal(raw, &status) == nil && status.BackendState != ""
	}
	state := meshclient.ReadStatus(ctx).BackendState
	return state != "Unavailable" && state != "Invalid"
}

func installService(ctx context.Context, bin string) error {
	switch runtime.GOOS {
	case "windows":
		_ = runCommand(ctx, "sc.exe", "stop", "LabPlaneMesh")
		_ = runCommand(ctx, "sc.exe", "delete", "LabPlaneMesh")
		if err := runCommand(ctx, "sc.exe", "create", "LabPlaneMesh", "binPath=", "\""+bin+"\" run", "start=", "auto"); err != nil {
			return err
		}
		return runCommand(ctx, "sc.exe", "start", "LabPlaneMesh")
	case "darwin":
		u, err := macInstallUser()
		if err != nil {
			return err
		}
		uid, _ := strconv.Atoi(u.Uid)
		gid, _ := strconv.Atoi(u.Gid)
		plist := `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>cn.labplane.mesh-client</string><key>ProgramArguments</key><array><string>` + bin + `</string><string>run</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/></dict></plist>`
		path := filepath.Join(u.HomeDir, "Library", "LaunchAgents", "cn.labplane.mesh-client.plist")
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			return err
		}
		if err := os.WriteFile(path, []byte(plist), 0644); err != nil {
			return err
		}
		if err := os.Chown(path, uid, gid); err != nil {
			return err
		}
		domain := "gui/" + u.Uid
		_ = runCommand(ctx, "launchctl", "bootout", domain, path)
		return runCommand(ctx, "launchctl", "bootstrap", domain, path)
	case "linux":
		unit := "[Unit]\nDescription=LabPlane Mesh client reporting\nAfter=network-online.target labplane-tailscaled.service\nWants=network-online.target\n[Service]\nType=simple\nExecStart=" + bin + " run\nRestart=always\nRestartSec=10\n[Install]\nWantedBy=multi-user.target\n"
		if err := os.WriteFile("/etc/systemd/system/labplane-mesh-client.service", []byte(unit), 0644); err != nil {
			return err
		}
		if err := runCommand(ctx, "systemctl", "daemon-reload"); err != nil {
			return err
		}
		return runCommand(ctx, "systemctl", "enable", "--now", "labplane-mesh-client.service")
	default:
		return errors.New("unsupported OS")
	}
}
