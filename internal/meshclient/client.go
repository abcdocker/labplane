package meshclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

// Config is issued once by LabPlane. AuthKey is a one-use Headscale key; Token
// authenticates heartbeats independently and must remain private on the device.
type Config struct {
	InstanceID string `json:"instanceId"`
	ClientID   string `json:"clientId"`
	Platform   string `json:"platform"`
	Server     string `json:"server"`
	Hostname   string `json:"hostname"`
	AuthKey    string `json:"authKey,omitempty"`
	Token      string `json:"token"`
}

type Status struct {
	Hostname      string   `json:"hostname"`
	OS            string   `json:"os"`
	Arch          string   `json:"arch"`
	ClientVersion string   `json:"clientVersion,omitempty"`
	BackendState  string   `json:"backendState"`
	NodeID        string   `json:"nodeId,omitempty"`
	TailscaleIPs  []string `json:"tailscaleIps,omitempty"`
	Endpoints     []string `json:"endpoints,omitempty"`
	Online        bool     `json:"online"`
	Error         string   `json:"error,omitempty"`
}

type Command struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Hostname string `json:"hostname,omitempty"`
}

type reportRequest struct {
	Status       Status `json:"status"`
	CommandID    string `json:"commandId,omitempty"`
	CommandError string `json:"commandError,omitempty"`
}

type reportResponse struct {
	Command *Command `json:"command,omitempty"`
}

var validHostname = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$`)

func ValidHostname(name string) bool { return validHostname.MatchString(name) }

type tailscaleStatus struct {
	Version      string `json:"Version"`
	BackendState string `json:"BackendState"`
	Self         *struct {
		ID           string   `json:"ID"`
		HostName     string   `json:"HostName"`
		TailscaleIPs []string `json:"TailscaleIPs"`
		Endpoints    []string `json:"Endpoints"`
		Online       bool     `json:"Online"`
	} `json:"Self"`
}

func ParseStatus(raw []byte) (Status, error) {
	var in tailscaleStatus
	if err := json.Unmarshal(raw, &in); err != nil {
		return Status{}, fmt.Errorf("parse tailscale status: %w", err)
	}
	out := Status{OS: runtime.GOOS, Arch: runtime.GOARCH, ClientVersion: in.Version, BackendState: in.BackendState}
	if in.Self != nil {
		out.NodeID = in.Self.ID
		out.Hostname = in.Self.HostName
		out.TailscaleIPs = in.Self.TailscaleIPs
		out.Endpoints = in.Self.Endpoints
		out.Online = in.Self.Online && in.BackendState == "Running"
	}
	return out, nil
}

func ValidateConfig(cfg Config) error {
	for _, v := range []string{cfg.InstanceID, cfg.ClientID, cfg.Token} {
		if v == "" || len(v) > 256 || strings.ContainsAny(v, "/\\\r\n") {
			return errors.New("invalid client credentials")
		}
	}
	for _, raw := range []string{cfg.Platform, cfg.Server} {
		u, err := url.Parse(raw)
		if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			return errors.New("platform and server require HTTPS URLs")
		}
	}
	if !ValidHostname(cfg.Hostname) {
		return errors.New("invalid hostname")
	}
	return nil
}

func LoadConfig(path string) (Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	var cfg Config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return Config{}, err
	}
	return cfg, ValidateConfig(cfg)
}

func SaveConfig(path string, cfg Config) error {
	if err := ValidateConfig(cfg); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".mesh-client-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(raw); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

func tailscalePath() (string, error) {
	if p := os.Getenv("LABPLANE_TAILSCALE_BIN"); p != "" {
		return p, nil
	}
	if runtime.GOOS == "darwin" {
		p := "/Applications/Tailscale.app/Contents/MacOS/Tailscale"
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	if runtime.GOOS == "windows" {
		p := filepath.Join(os.Getenv("ProgramFiles"), "Tailscale", "tailscale.exe")
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	if runtime.GOOS == "linux" {
		p := "/opt/labplane-mesh/tailscale"
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return exec.LookPath("tailscale")
}

// FindTailscale resolves an existing transport binary without starting it.
func FindTailscale() (string, error) {
	path, err := tailscalePath()
	if err != nil {
		return "", err
	}
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		return "", errors.New("tailscale executable not found")
	}
	return path, nil
}

func command(ctx context.Context, args ...string) ([]byte, error) {
	bin, err := tailscalePath()
	if err != nil {
		return nil, errors.New("tailscale is not installed; run install first")
	}
	c := exec.CommandContext(ctx, bin, args...)
	if runtime.GOOS == "darwin" {
		c.Env = append(os.Environ(), "TAILSCALE_BE_CLI=1")
	}
	return c.CombinedOutput()
}

func ReadStatus(ctx context.Context) Status {
	c, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	raw, err := command(c, "status", "--json")
	if err != nil {
		return Status{OS: runtime.GOOS, Arch: runtime.GOARCH, BackendState: "Unavailable", Error: "tailscale status unavailable"}
	}
	s, err := ParseStatus(raw)
	if err != nil {
		return Status{OS: runtime.GOOS, Arch: runtime.GOARCH, BackendState: "Invalid", Error: "invalid tailscale status"}
	}
	return s
}

func Join(ctx context.Context, path string) error {
	cfg, err := LoadConfig(path)
	if err != nil {
		return err
	}
	if cfg.AuthKey == "" {
		return errors.New("one-use join key already consumed")
	}
	c, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	// One-use key is passed directly to the CLI only for this short-lived call.
	// Never include command output in errors: it can echo credentials.
	args := []string{"up", "--login-server=" + cfg.Server, "--auth-key=" + cfg.AuthKey, "--hostname=" + cfg.Hostname, "--accept-routes"}
	if runtime.GOOS == "windows" {
		args = append(args, "--unattended=true")
	}
	_, err = command(c, args...)
	if err != nil {
		return errors.New("tailscale join failed; check VPN approval and daemon state")
	}
	status := Status{}
	for attempt := 0; attempt < 15; attempt++ {
		status = ReadStatus(ctx)
		if status.BackendState == "Running" && len(status.TailscaleIPs) > 0 {
			break
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	if status.BackendState != "Running" || len(status.TailscaleIPs) == 0 {
		return errors.New("tailscale join has not reached Running state; keep VPN approved and retry join")
	}
	cfg.AuthKey = ""
	if err := SaveConfig(path, cfg); err != nil {
		return fmt.Errorf("joined but cannot remove one-use key: %w", err)
	}
	_, _ = Report(ctx, cfg, status, "", "")
	return nil
}

// Connect resumes an already enrolled node without resetting its machine identity.
func Connect(ctx context.Context, path string) error {
	cfg, err := LoadConfig(path)
	if err != nil {
		return err
	}
	c, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	args := []string{"up", "--login-server=" + cfg.Server, "--hostname=" + cfg.Hostname, "--accept-routes"}
	if runtime.GOOS == "windows" {
		args = append(args, "--unattended=true")
	}
	if _, err := command(c, args...); err != nil {
		return errors.New("tailscale reconnect failed; check VPN approval and daemon state")
	}
	return nil
}

func Report(ctx context.Context, cfg Config, status Status, commandID, commandError string) (*Command, error) {
	if err := ValidateConfig(cfg); err != nil {
		return nil, err
	}
	raw, err := json.Marshal(reportRequest{Status: status, CommandID: commandID, CommandError: commandError})
	if err != nil {
		return nil, err
	}
	endpoint := strings.TrimRight(cfg.Platform, "/") + "/api/ops/mesh/instances/" + url.PathEscape(cfg.InstanceID) + "/clients/" + url.PathEscape(cfg.ClientID) + "/report"
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(c, http.MethodPost, endpoint, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.Token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("report rejected: HTTP %d", resp.StatusCode)
	}
	var result reportResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&result); err != nil {
		return nil, err
	}
	return result.Command, nil
}

func Run(ctx context.Context, cfg Config) error {
	if err := ValidateConfig(cfg); err != nil {
		return err
	}
	retryDelay := 5 * time.Second
	for {
		command, err := Report(ctx, cfg, ReadStatus(ctx), "", "")
		wait := time.Minute
		if err != nil {
			log.Printf("mesh client report: %v", err)
			wait = retryDelay
			retryDelay *= 2
			if retryDelay > 5*time.Minute {
				retryDelay = 5 * time.Minute
			}
		} else {
			retryDelay = 5 * time.Second
		}
		if err == nil && command != nil {
			commandErr := ExecuteCommand(ctx, *command)
			message := ""
			if commandErr != nil {
				message = commandErr.Error()
				log.Printf("mesh client command %s: %v", command.Type, commandErr)
			}
			_, _ = Report(ctx, cfg, ReadStatus(ctx), command.ID, message)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(wait):
		}
	}
}

func ExecuteCommand(ctx context.Context, commandValue Command) error {
	c, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	var args []string
	switch commandValue.Type {
	case "connect":
		args = []string{"up"}
	case "disconnect":
		args = []string{"down"}
	case "rename":
		if !ValidHostname(commandValue.Hostname) {
			return errors.New("invalid requested hostname")
		}
		args = []string{"set", "--hostname=" + commandValue.Hostname}
	default:
		return errors.New("unsupported command")
	}
	if _, err := command(c, args...); err != nil {
		return errors.New("tailscale command failed")
	}
	return nil
}

func Disconnect(ctx context.Context) error {
	c, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	if _, err := command(c, "down"); err != nil {
		return errors.New("tailscale disconnect failed")
	}
	return nil
}
