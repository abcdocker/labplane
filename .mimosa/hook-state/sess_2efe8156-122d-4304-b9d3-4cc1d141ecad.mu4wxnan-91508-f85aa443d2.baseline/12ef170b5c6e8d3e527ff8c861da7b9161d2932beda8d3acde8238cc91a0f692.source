package internal

import "testing"

func TestHarborSanitizeRepositoryListQ(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"busybox:", "busybox"},
		{"busybox：", "busybox"},
		{" busybox:  ", "busybox"},
		{"busybox:1.36", "busybox"},
		{"busybox:1.36.0", "busybox"},
		{"group/sub:1.0", "group/sub"},
		{"group/sub:bad tag", "group/sub:bad tag"},
		{"plain-name", "plain-name"},
		{"", ""},
		{":::", ""},
	}
	for _, tc := range cases {
		got := harborSanitizeRepositoryListQ(tc.in)
		if got != tc.want {
			t.Errorf("harborSanitizeRepositoryListQ(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestHarborLooksLikeDockerTag(t *testing.T) {
	if !harborLooksLikeDockerTag("1.36") || !harborLooksLikeDockerTag("latest") {
		t.Fatal("expected true")
	}
	if harborLooksLikeDockerTag("") || harborLooksLikeDockerTag("bad tag") || harborLooksLikeDockerTag("a/b") {
		t.Fatal("expected false")
	}
}
