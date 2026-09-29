// mesh-desktop-bundle builds the reusable graphical Windows and macOS installers.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/abcdocker/labplane/internal/meshdesktop"
)

func main() {
	out := flag.String("out", "data/mesh-client-dist", "existing Tailscale asset directory")
	platform := flag.String("platform", "all", "all, windows, or macos")
	flag.Parse()
	if *platform != "all" && *platform != "windows" && *platform != "macos" {
		panic("platform must be all, windows, or macos")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 35*time.Minute)
	defer cancel()
	for _, arch := range []string{"amd64", "arm64"} {
		if *platform == "all" || *platform == "windows" {
			if err := buildWindows(ctx, *out, arch); err != nil {
				panic(err)
			}
		}
		if *platform == "all" || *platform == "macos" {
			if err := buildMac(ctx, *out, arch); err != nil {
				panic(err)
			}
		}
	}
}

func run(ctx context.Context, env []string, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	if env != nil {
		cmd.Env = append(os.Environ(), env...)
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s %s: %w: %s", name, strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return nil
}

func buildWindows(ctx context.Context, base, arch string) error {
	dir := filepath.Join(base, "windows-"+arch)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(dir, "tailscale.msi")); err != nil {
		return fmt.Errorf("missing verified Tailscale MSI for windows/%s: %w", arch, err)
	}
	tmp, err := os.MkdirTemp("", "labplane-win-bundle-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmp)
	env := []string{"GOOS=windows", "GOARCH=" + arch, "CGO_ENABLED=0"}
	template := filepath.Join(tmp, "gui.exe")
	if err := run(ctx, env, "go", "build", "-trimpath", "-ldflags=-H=windowsgui", "-o", template, "./cmd/mesh-client-desktop"); err != nil {
		return err
	}
	agent := filepath.Join(dir, "labplane-mesh-client.exe")
	if err := run(ctx, env, "go", "build", "-trimpath", "-o", agent, "./cmd/mesh-client"); err != nil {
		return err
	}
	output := filepath.Join(dir, "LabPlaneMesh.exe")
	if err := meshdesktop.PackWindowsExecutable(template, agent, filepath.Join(dir, "tailscale.msi"), output); err != nil {
		return err
	}
	fmt.Println("ready:", output)
	return nil
}

func buildMac(ctx context.Context, base, arch string) error {
	if runtime.GOOS != "darwin" {
		return errors.New("macOS DMG must be built on macOS")
	}
	dir := filepath.Join(base, "macos-"+arch)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return err
	}
	pkg := filepath.Join(dir, "tailscale.pkg")
	if _, err := os.Stat(pkg); err != nil {
		return fmt.Errorf("missing verified Tailscale PKG for macos/%s: %w", arch, err)
	}
	tmp, err := os.MkdirTemp("", "labplane-mac-bundle-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmp)
	app := filepath.Join(tmp, "LabPlaneMesh.app")
	macosDir := filepath.Join(app, "Contents", "MacOS")
	resources := filepath.Join(app, "Contents", "Resources")
	if err := os.MkdirAll(macosDir, 0755); err != nil {
		return err
	}
	if err := os.MkdirAll(resources, 0755); err != nil {
		return err
	}
	if err := run(ctx, nil, "clang", "-fobjc-arc", "-target", swiftArch(arch)+"-apple-macosx13.0", "-framework", "Cocoa", "-framework", "UniformTypeIdentifiers", "-o", filepath.Join(macosDir, "LabPlaneMesh"), "client/desktop/macos/LabPlaneMesh.m"); err != nil {
		return err
	}
	agent := filepath.Join(resources, "labplane-mesh-client")
	if err := run(ctx, []string{"GOOS=darwin", "GOARCH=" + arch, "CGO_ENABLED=0"}, "go", "build", "-trimpath", "-o", agent, "./cmd/mesh-client"); err != nil {
		return err
	}
	if err := copyFile(pkg, filepath.Join(resources, "tailscale.pkg"), 0644); err != nil {
		return err
	}
	iconset := filepath.Join(tmp, "AppIcon.iconset")
	if err := os.MkdirAll(iconset, 0755); err != nil {
		return err
	}
	for _, icon := range []struct {
		name string
		size string
	}{
		{"icon_16x16.png", "16"}, {"icon_16x16@2x.png", "32"},
		{"icon_32x32.png", "32"}, {"icon_32x32@2x.png", "64"},
		{"icon_128x128.png", "128"}, {"icon_128x128@2x.png", "256"},
		{"icon_256x256.png", "256"}, {"icon_256x256@2x.png", "512"},
		{"icon_512x512.png", "512"}, {"icon_512x512@2x.png", "1024"},
	} {
		if err := run(ctx, nil, "sips", "-z", icon.size, icon.size, "client/desktop/assets/AppIcon.png", "--out", filepath.Join(iconset, icon.name)); err != nil {
			return err
		}
	}
	if err := run(ctx, nil, "iconutil", "-c", "icns", "-o", filepath.Join(resources, "AppIcon.icns"), iconset); err != nil {
		return err
	}
	info := `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>cn.labplane.mesh-desktop</string><key>CFBundleName</key><string>LabPlane Mesh</string><key>CFBundleDisplayName</key><string>LabPlane Mesh</string><key>CFBundleExecutable</key><string>LabPlaneMesh</string><key>CFBundleIconFile</key><string>AppIcon</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>CFBundleShortVersionString</key><string>1.0.0</string><key>LSMinimumSystemVersion</key><string>13.0</string><key>NSHighResolutionCapable</key><true/></dict></plist>`
	if err := os.WriteFile(filepath.Join(app, "Contents", "Info.plist"), []byte(info), 0644); err != nil {
		return err
	}
	if err := run(ctx, nil, "codesign", "--force", "--deep", "--sign", "-", app); err != nil {
		return err
	}
	output := filepath.Join(dir, "LabPlaneMesh.dmg")
	if err := run(ctx, nil, "hdiutil", "create", "-quiet", "-ov", "-volname", "LabPlane Mesh", "-srcfolder", app, "-format", "UDZO", output); err != nil {
		return err
	}
	fmt.Println("ready:", output)
	return nil
}

func swiftArch(arch string) string {
	if arch == "amd64" {
		return "x86_64"
	}
	return "arm64"
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
	_, err = io.Copy(out, in)
	closeErr := out.Close()
	if err != nil {
		return err
	}
	return closeErr
}
