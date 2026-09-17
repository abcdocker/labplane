package internal

import "testing"

func TestVmLogCollectorProfilesAreUniqueAndUsable(t *testing.T) {
	seen := map[string]bool{}
	for _, profile := range vmLogCollectorProfiles() {
		if profile.ID == "" || profile.Label == "" || profile.LogSource == "" {
			t.Fatalf("invalid collector profile: %#v", profile)
		}
		if seen[profile.ID] {
			t.Fatalf("duplicate collector profile id: %s", profile.ID)
		}
		seen[profile.ID] = true
		if profile.Custom && len(profile.DefaultPaths) != 0 {
			t.Fatalf("custom profile must not define default paths: %#v", profile)
		}
	}
	for _, required := range []string{
		vmShipperPresetBaotaNginx,
		vmShipperPresetSystem,
		vmShipperPresetDocker,
		vmShipperPresetCustom,
	} {
		if !seen[required] {
			t.Fatalf("missing required collector profile %q", required)
		}
	}
}

func TestVmShipperPresetPathsReturnsCopy(t *testing.T) {
	first := vmShipperPresetPaths(vmShipperPresetSystem)
	if len(first) == 0 {
		t.Fatal("system profile should have default paths")
	}
	first[0] = "/changed"
	second := vmShipperPresetPaths(vmShipperPresetSystem)
	if second[0] == "/changed" {
		t.Fatal("preset paths must return a defensive copy")
	}
	if got := vmShipperPresetPaths(vmShipperPresetCustom); len(got) != 0 {
		t.Fatalf("custom profile should not return default paths: %#v", got)
	}
}

func TestVmLogSearchHelpers(t *testing.T) {
	if got := normalizeVmLogQuerySource(" NGINX "); got != "nginx" {
		t.Fatalf("normalize source: got %q", got)
	}
	if got := normalizeVmLogQuerySource("unknown"); got != "all" {
		t.Fatalf("unknown source should fall back to all: got %q", got)
	}
	for input, want := range map[string]string{
		"container":       "kubernetes",
		"virtual_machine": "vcenter",
		"application":     "appcenter",
	} {
		if got := normalizeVmLogQuerySource(input); got != want {
			t.Fatalf("normalize source %q: got %q want %q", input, got, want)
		}
	}
	row := map[string]any{
		"_msg":       "request failed with timeout",
		"vm_host":    "web-prod-01",
		"_time":      "2026-06-27T01:02:03Z",
		"log_source": "java-app",
	}
	if got := vmlogRowHost(row); got != "web-prod-01" {
		t.Fatalf("host: got %q", got)
	}
	if !vmlogMatchesLevel("platform", "error", row) {
		t.Fatal("failed log should match error level")
	}
	if vmlogMatchesLevel("platform", "ok", row) {
		t.Fatal("failed log must not match ok level")
	}
	if got := vmlogKeywordQuery(`foo) OR *`, "needle"); got != `"needle"` {
		t.Fatalf("unsafe custom field must fall back to all-field query: %q", got)
	}
	if got := vmlogKeywordQuery("trace_id", "abc"); got != `trace_id:"abc"` {
		t.Fatalf("custom field query: %q", got)
	}
	stats := vmlogSearchFieldStats([]map[string]any{
		row,
		{"_msg": "ok", "vm_host": "web-prod-01", "log_source": "java-app"},
	})
	foundHost := false
	for _, stat := range stats {
		if stat["id"] == "vm_host" {
			foundHost = true
			if stat["count"] != 2 {
				t.Fatalf("vm_host count: %#v", stat["count"])
			}
		}
	}
	if !foundHost {
		t.Fatal("vm_host field stats missing")
	}
}
