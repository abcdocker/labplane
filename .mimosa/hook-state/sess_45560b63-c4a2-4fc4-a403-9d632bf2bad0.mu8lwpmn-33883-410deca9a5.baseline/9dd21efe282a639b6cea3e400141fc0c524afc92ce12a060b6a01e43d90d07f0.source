package internal

import "testing"

func TestVmShipperNormalizeVectorDownloadBaseURL(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"", ""},
		{"https://d.example.com/file/kube-bt-sync", "https://d.example.com/file/kube-bt-sync"},
		{
			"https://d.example.com/file/kube-bt-sync/vector-0.36.1-x86_64-unknown-linux-gnu.tar.gz",
			"https://d.example.com/file/kube-bt-sync",
		},
		{
			"https://d.example.com/file/kube-bt-sync/vector-0.36.1-x86_64-unknown-linux-gnu.tar.gz/",
			"https://d.example.com/file/kube-bt-sync",
		},
		{"https://example.com/static/other.tar.gz", "https://example.com/static/other.tar.gz"},
	}
	for _, tc := range cases {
		got := vmShipperNormalizeVectorDownloadBaseURL(tc.in)
		if got != tc.want {
			t.Fatalf("normalize(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
