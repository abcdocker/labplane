package internal

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/abcdocker/labplane/internal/meshclient"
	"github.com/gin-gonic/gin"
)

func TestManagedClientTokenScopedAndRevocable(t *testing.T) {
	kv, err := newPlatformKVFile(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	token, hash, err := managedClientToken()
	if err != nil {
		t.Fatal(err)
	}
	v := meshManagedClient{ID: "client-a", InstanceID: "instance-a", TokenHash: hash}
	if err := saveManagedClient(kv, v); err != nil {
		t.Fatal(err)
	}
	if _, ok := loadManagedClient(kv, "instance-b", "client-a"); ok {
		t.Fatal("cross-instance lookup succeeded")
	}
	stored, ok := loadManagedClient(kv, "instance-a", "client-a")
	if !ok || !managedClientAuthenticated(stored, "Bearer "+token) {
		t.Fatal("valid credential rejected")
	}
	if managedClientAuthenticated(stored, "Bearer "+token+"x") {
		t.Fatal("modified credential accepted")
	}
	public, _ := json.Marshal(stored)
	if bytes.Contains(public, []byte(token)) || bytes.Contains(public, []byte(hash)) {
		t.Fatal("credential disclosed in API shape")
	}
	stored.RevokedAt = "2026-09-28T00:00:00Z"
	if managedClientAuthenticated(stored, "Bearer "+token) {
		t.Fatal("revoked credential accepted")
	}
}

func TestClientZipContainsNativeBinaryAndInstaller(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"labplane-mesh-client", "tailscale.tgz"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(name), 0600); err != nil {
			t.Fatal(err)
		}
	}
	cfg := meshclient.Config{InstanceID: "instance", ClientID: "client", Platform: "https://platform.example", Server: "https://headscale.example", Hostname: "device", AuthKey: "one-use", Token: "secret"}
	raw, err := makeMeshClientZip(dir, "labplane-mesh-client", "tailscale.tgz", cfg)
	if err != nil {
		t.Fatal(err)
	}
	z, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatal(err)
	}
	found := map[string]bool{}
	for _, f := range z.File {
		found[f.Name] = true
	}
	for _, name := range []string{"labplane-mesh-client", "tailscale.tgz", "config.json", "README.txt"} {
		if !found[name] {
			t.Fatalf("missing %s", name)
		}
	}
}

func TestClientReportCommandAndAcknowledgement(t *testing.T) {
	kv, err := newPlatformKVFile(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	token, hash, err := managedClientToken()
	if err != nil {
		t.Fatal(err)
	}
	v := meshManagedClient{ID: "client-a", InstanceID: "instance-a", OS: "linux", Arch: "amd64", TokenHash: hash}
	if err := saveManagedClient(kv, v); err != nil {
		t.Fatal(err)
	}
	if err := saveMeshClientActions(kv, v.InstanceID, v.ID, meshClientActionState{Pending: &meshClientAction{Command: meshclient.Command{ID: "command-a", Type: "disconnect"}, IssuedAt: "2026-09-28T00:00:00Z"}}); err != nil {
		t.Fatal(err)
	}
	app := &ServerApp{platformKV: kv}
	report := func(secret, ack string) (int, map[string]any) {
		body, _ := json.Marshal(map[string]any{"status": meshclient.Status{OS: "linux", Arch: "amd64", BackendState: "Running", Hostname: "device"}, "commandId": ack})
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Params = gin.Params{{Key: "id", Value: "instance-a"}, {Key: "cid", Value: "client-a"}}
		c.Request = httptest.NewRequest(http.MethodPost, "/report", bytes.NewReader(body))
		c.Request.Header.Set("Authorization", "Bearer "+secret)
		c.Request.Header.Set("Content-Type", "application/json")
		handleMeshClientReport(app)(c)
		var result map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &result)
		return w.Code, result
	}
	if code, _ := report("wrong", ""); code != http.StatusUnauthorized {
		t.Fatalf("unauthorized report: %d", code)
	}
	code, body := report(token, "")
	if code != http.StatusOK {
		t.Fatalf("first report: %d", code)
	}
	command, ok := body["command"].(map[string]any)
	if !ok || command["id"] != "command-a" {
		t.Fatalf("missing command: %+v", body)
	}
	code, body = report(token, "command-a")
	if code != http.StatusOK || body["command"] != nil {
		t.Fatalf("ack report: %d %+v", code, body)
	}
	stored, _ := loadManagedClient(kv, "instance-a", "client-a")
	if stored.PendingAction != nil || stored.LastAction == nil || stored.LastAction.CompletedAt == "" || stored.Status.Hostname != "device" {
		t.Fatalf("command not acknowledged: %+v", stored)
	}
}

func TestMeshInstanceClientURLIsExplicitAndHTTPS(t *testing.T) {
	b := &meshSettingsBundle{}
	v, _, err := upsertMeshInstance(b, meshInstancePutInput{Name: "public", APIURL: "https://internal.example", ClientURL: "https://headscale.example"}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if v.ClientURL != "https://headscale.example" || meshInstancePublic(v, nil)["clientUrl"] != v.ClientURL {
		t.Fatalf("client URL not retained: %+v", v)
	}
	_, _, err = upsertMeshInstance(b, meshInstancePutInput{ID: v.ID, Name: "public", APIURL: v.APIURL, ClientURL: "http://insecure.example"}, nil, nil)
	if err == nil {
		t.Fatal("insecure client URL accepted")
	}
}

func TestDesktopClientAssetName(t *testing.T) {
	for _, tc := range []struct{ os, arch, want string }{
		{"windows", "amd64", "LabPlaneMesh.exe"},
		{"windows", "arm64", "LabPlaneMesh.exe"},
		{"macos", "amd64", "LabPlaneMesh.dmg"},
		{"macos", "arm64", "LabPlaneMesh.dmg"},
	} {
		got, err := desktopClientAssetName(tc.os, tc.arch)
		if err != nil || got != tc.want {
			t.Fatalf("%s/%s: got %q, %v", tc.os, tc.arch, got, err)
		}
	}
	for _, tc := range []struct{ os, arch string }{{"linux", "amd64"}, {"windows", "386"}, {"macos", "../../../x"}} {
		if _, err := desktopClientAssetName(tc.os, tc.arch); err == nil {
			t.Fatalf("unsupported desktop target accepted: %s/%s", tc.os, tc.arch)
		}
	}
}
