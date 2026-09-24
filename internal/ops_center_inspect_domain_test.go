package internal

import "testing"

func TestNormalizeInspectionDomain(t *testing.T) {
	tests := map[string]string{
		"":           "platform",
		" PLATFORM ": "platform",
		"VCenter":    "vcenter",
		"bastion":    "bastion",
		"headscale":  "headscale",
		"authentik":  "authentik",
		"unknown":    "",
	}
	for input, want := range tests {
		if got := normalizeInspectionDomain(input); got != want {
			t.Fatalf("normalizeInspectionDomain(%q)=%q, want %q", input, got, want)
		}
	}
}

func TestFilterInspectReportsByDomainTreatsLegacyAsPlatform(t *testing.T) {
	reports := []InspectionReport{
		{ID: "legacy"},
		{ID: "vc", Domain: "vcenter"},
		{ID: "mesh", Domain: "headscale"},
	}
	platform := filterInspectReportsByDomain(reports, "platform")
	if len(platform) != 1 || platform[0].ID != "legacy" {
		t.Fatalf("platform reports=%v", platform)
	}
	vc := filterInspectReportsByDomain(reports, "vcenter")
	if len(vc) != 1 || vc[0].ID != "vc" {
		t.Fatalf("vcenter reports=%v", vc)
	}
}
