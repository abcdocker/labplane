package meshdesktop

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWindowsExecutableCarriesOnlyExpectedInstallerAssets(t *testing.T) {
	dir := t.TempDir()
	template := filepath.Join(dir, "gui.exe")
	client := filepath.Join(dir, "agent.exe")
	msi := filepath.Join(dir, "tailscale.msi")
	for path, data := range map[string]string{template: "PE-template", client: "native-agent", msi: "installer"} {
		if err := os.WriteFile(path, []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
	}
	output := filepath.Join(dir, "LabPlaneMesh.exe")
	if err := PackWindowsExecutable(template, client, msi, output); err != nil {
		t.Fatal(err)
	}
	extracted := filepath.Join(dir, "extracted")
	if err := ExtractWindowsPayload(output, extracted); err != nil {
		t.Fatal(err)
	}
	for name, want := range map[string]string{"labplane-mesh-client.exe": "native-agent", "tailscale.msi": "installer"} {
		got, err := os.ReadFile(filepath.Join(extracted, name))
		if err != nil || string(got) != want {
			t.Fatalf("%s: got %q, %v", name, got, err)
		}
	}
}
