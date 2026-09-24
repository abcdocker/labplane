package internal

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestInspectWithRetryRecoversTransientFailure(t *testing.T) {
	attempts := 0
	err := inspectWithRetry(context.Background(), func() error {
		attempts++
		if attempts < 3 {
			return errors.New("temporary")
		}
		return nil
	})
	if err != nil || attempts != 3 {
		t.Fatalf("err=%v attempts=%d", err, attempts)
	}
}

func TestInspectBastionPolicyFactsFlagsUnsafeTargets(t *testing.T) {
	policy := &VCenterBastionPolicy{
		EnableACL: false,
		ExtraHosts: []BastionExtraHost{
			{ID: "linux", Name: "ops", Kind: "linux", Address: "10.0.0.8", SSHPort: 22},
			{ID: "win", Name: "desktop", Kind: "windows", Address: "10.0.0.9", RDPPort: 3389, RDPWebURL: "http://rdp.local"},
		},
	}
	facts := inspectBastionPolicyFacts(policy)
	joined := strings.Join(facts.Warnings, "\n")
	if !strings.Contains(joined, "ACL") || !strings.Contains(joined, "主机密钥") || !strings.Contains(joined, "HTTPS") {
		t.Fatalf("warnings missing expected safety findings: %s", joined)
	}
}

func TestInspectHeadscaleNodeFacts(t *testing.T) {
	now := time.Date(2026, 9, 22, 10, 0, 0, 0, time.UTC)
	nodes := []HSNode{
		{ID: "1", Name: "stale", Online: false, LastSeen: now.Add(-8 * 24 * time.Hour).Format(time.RFC3339), IPAddresses: []string{"100.64.0.1"}},
		{ID: "2", Name: "expired", Online: true, Expiry: now.Add(-time.Hour).Format(time.RFC3339), AvailableRoutes: []string{"10.0.0.0/24"}, IPAddresses: []string{"100.64.0.1"}},
		{ID: "3", Name: "bad-tag", Online: true, InvalidTags: []string{"tag:missing"}},
	}
	facts := inspectHeadscaleNodeFacts(nodes, now)
	if facts.Total != 3 || facts.Online != 2 || facts.Stale != 1 || facts.Expired != 1 || facts.PendingRoutes != 1 || facts.InvalidTags != 1 || facts.DuplicateAddresses != 1 {
		t.Fatalf("unexpected facts: %+v", facts)
	}
}

func TestInspectAuthentikEventFactsRedactsContextAndLabelsSystemUser(t *testing.T) {
	events := []map[string]any{
		{"action": "system_task_exception", "user": nil, "context": map[string]any{"authorization": "Bearer secret"}},
		{"action": "login_failed", "user": map[string]any{"username": "alice"}, "client_ip": "10.0.0.7"},
	}
	facts := inspectAuthentikEventFacts(events)
	if facts.SystemTaskExceptions != 1 || facts.AuthFailures != 1 {
		t.Fatalf("unexpected facts: %+v", facts)
	}
	joined := strings.Join(facts.Lines, "\n")
	if !strings.Contains(joined, "系统任务") || strings.Contains(joined, "secret") || strings.Contains(joined, "authorization") {
		t.Fatalf("event output not safely normalized: %s", joined)
	}
}
