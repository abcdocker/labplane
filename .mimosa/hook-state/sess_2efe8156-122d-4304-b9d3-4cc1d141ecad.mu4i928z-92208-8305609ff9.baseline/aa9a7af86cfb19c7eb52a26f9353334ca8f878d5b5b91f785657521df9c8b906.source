package internal

import "testing"

func TestVmlogAggregateNginxStyle_combined(t *testing.T) {
	rows := []map[string]any{
		{
			"_msg": `203.0.113.9 - - [10/Apr/2026:14:00:00 +0800] "GET https://api.example.com/v1/health HTTP/1.1" 200 42 "-" "curl/8"`,
		},
		{
			"_msg": `203.0.113.9 - - [10/Apr/2026:14:00:01 +0800] "POST /api/login HTTP/1.1" 401 12 "-" "curl/8"`,
		},
	}
	res := vmlogAggregateNginxStyle(rows, 10, "")
	if res.ParsedLines != 2 {
		t.Fatalf("parsed %d want 2", res.ParsedLines)
	}
	if res.Totals["uniqueClientIPs"].(int) != 1 {
		t.Fatalf("uniqueClientIPs %+v", res.Totals["uniqueClientIPs"])
	}
	if res.Totals["uniqueHosts"].(int) < 1 {
		t.Fatalf("uniqueHosts %+v", res.Totals["uniqueHosts"])
	}
	if res.Totals["bytesSum"].(int64) != 54 {
		t.Fatalf("bytesSum %+v", res.Totals["bytesSum"])
	}
}

func TestVmlogAggregateNginxStyle_rowFields(t *testing.T) {
	rows := []map[string]any{
		{
			"_msg":       `"GET /index.html HTTP/1.1" 200`,
			"remote_addr": "10.0.0.5",
			"http_host":  "www.example.com",
		},
	}
	res := vmlogAggregateNginxStyle(rows, 10, "")
	if res.ParsedLines != 1 {
		t.Fatalf("parsed %d", res.ParsedLines)
	}
	if res.Totals["uniqueClientIPs"].(int) != 1 {
		t.Fatalf("uniqueClientIPs %+v", res.Totals["uniqueClientIPs"])
	}
	if res.Totals["uniqueHosts"].(int) != 1 {
		t.Fatalf("uniqueHosts %+v", res.Totals["uniqueHosts"])
	}
}
