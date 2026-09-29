// mesh-client-bundle builds native client executables and downloads verified
// Tailscale transport packages into data/mesh-client-dist for server delivery.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const stableURL = "https://dl.tailscale.com/stable/"

type target struct{ osName, goos, arch, upstream, output string }

func targets(version string) []target {
	return []target{
		{"windows", "windows", "amd64", "tailscale-setup-" + version + "-amd64.msi", "tailscale.msi"},
		{"windows", "windows", "arm64", "tailscale-setup-" + version + "-arm64.msi", "tailscale.msi"},
		{"macos", "darwin", "amd64", "Tailscale-" + version + "-macos.pkg", "tailscale.pkg"},
		{"macos", "darwin", "arm64", "Tailscale-" + version + "-macos.pkg", "tailscale.pkg"},
		{"linux", "linux", "amd64", "tailscale_" + version + "_amd64.tgz", "tailscale.tgz"},
		{"linux", "linux", "arm64", "tailscale_" + version + "_arm64.tgz", "tailscale.tgz"},
	}
}

func main() {
	out := flag.String("out", "data/mesh-client-dist", "bundle asset directory")
	version := flag.String("tailscale-version", "1.102.4", "pinned upstream stable version")
	flag.Parse()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	for _, t := range targets(*version) {
		dir := filepath.Join(*out, t.osName+"-"+t.arch)
		if err := os.MkdirAll(dir, 0750); err != nil {
			panic(err)
		}
		bin := "labplane-mesh-client"
		if t.goos == "windows" {
			bin += ".exe"
		}
		cmd := exec.CommandContext(ctx, "go", "build", "-trimpath", "-o", filepath.Join(dir, bin), "./cmd/mesh-client")
		cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS="+t.goos, "GOARCH="+t.arch)
		if out, err := cmd.CombinedOutput(); err != nil {
			panic(fmt.Errorf("build %s/%s: %w: %s", t.goos, t.arch, err, out))
		}
		if err := downloadVerified(ctx, stableURL+t.upstream, filepath.Join(dir, t.output)); err != nil {
			panic(err)
		}
		fmt.Println("ready:", t.osName+"-"+t.arch)
	}
}

func downloadVerified(ctx context.Context, source, dest string) error {
	checksum, err := exec.CommandContext(ctx, "curl", "--fail", "--location", "--silent", "--show-error", "--max-time", "60", source+".sha256").Output()
	if err != nil {
		return fmt.Errorf("checksum %s: %w", source, err)
	}
	if len(checksum) > 1024 {
		return errors.New("upstream checksum response too large")
	}
	want := strings.Fields(string(checksum))
	if len(want) == 0 || len(want[0]) != 64 {
		return errors.New("invalid upstream checksum")
	}
	if _, err := hex.DecodeString(want[0]); err != nil {
		return err
	}
	if f, err := os.Open(dest); err == nil {
		h := sha256.New()
		_, copyErr := io.Copy(h, f)
		f.Close()
		if copyErr == nil && strings.EqualFold(hex.EncodeToString(h.Sum(nil)), want[0]) {
			return nil
		}
	}
	data, err := os.CreateTemp(filepath.Dir(dest), ".tailscale-*")
	if err != nil {
		return err
	}
	defer os.Remove(data.Name())
	if err := data.Close(); err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, "curl", "--fail", "--location", "--silent", "--show-error", "--retry", "3", "--connect-timeout", "15", "--max-time", "300", "--output", data.Name(), source)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("download %s: %w: %s", source, err, strings.TrimSpace(string(out)))
	}
	data, err = os.Open(data.Name())
	if err != nil {
		return err
	}
	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(data, (250<<20)+1))
	data.Close()
	if err != nil {
		return err
	}
	if n > 250<<20 {
		return errors.New("Tailscale package exceeds 250 MiB limit")
	}
	if !strings.EqualFold(hex.EncodeToString(h.Sum(nil)), want[0]) {
		return errors.New("Tailscale package checksum mismatch")
	}
	return os.Rename(data.Name(), dest)
}
