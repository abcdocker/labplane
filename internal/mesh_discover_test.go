package internal

import (
	"testing"
	"time"
)

func TestMeshSitesForNodeKeepsPendingRoutes(t *testing.T) {
	node := HSNode{
		ID: "node-1", GivenName: "router", Online: true,
		IPAddresses:     []string{"100.64.0.1"},
		ApprovedRoutes:  []string{"192.168.1.0/24"},
		AvailableRoutes: []string{"192.168.1.0/24", "192.168.2.0/24"},
	}
	sites := meshSitesForNode(node, []string{"192.168.1.2"})
	if len(sites) != 2 {
		t.Fatalf("got %d sites, want both approved and pending routes: %+v", len(sites), sites)
	}
	if sites[0].Subnet != "192.168.1.0/24" || !sites[0].Approved {
		t.Fatalf("approved route wrong: %+v", sites[0])
	}
	if sites[1].Subnet != "192.168.2.0/24" || sites[1].Approved {
		t.Fatalf("pending route wrong: %+v", sites[1])
	}
}

func TestMeshSnapshotsForInstanceExcludesOtherInstance(t *testing.T) {
	inst := MeshInstance{ID: "mesh-a", TrafficCollectors: []MeshTrafficCollector{{ID: "collector-a", Host: "router.local", Port: 22, User: "ops"}}}
	cache := map[string]MeshTrafficSnapshot{
		meshTrafficCacheKey("mesh-a", "collector-a"): {InstanceID: "mesh-a", CollectorID: "collector-a", Host: "router.local", Port: 22, User: "ops", SelfHostName: "site-a"},
		meshTrafficCacheKey("mesh-b", "collector-a"): {InstanceID: "mesh-b", CollectorID: "collector-a", Host: "router.local", Port: 22, User: "ops", SelfHostName: "site-b"},
	}
	snaps := meshSnapshotsForInstance(inst, cache)
	if len(snaps) != 1 || snaps[0].CollectorID != "collector-a" {
		t.Fatalf("other instance snapshot leaked: %+v", snaps)
	}
}

func TestMeshSnapshotsForInstanceRejectsPreviousEndpoint(t *testing.T) {
	inst := MeshInstance{ID: "mesh-a", TrafficCollectors: []MeshTrafficCollector{{ID: "collector-a", Host: "new.local", Port: 22, User: "ops"}}}
	cache := map[string]MeshTrafficSnapshot{
		meshTrafficCacheKey("mesh-a", "collector-a"): {InstanceID: "mesh-a", CollectorID: "collector-a", Host: "old.local", Port: 22, User: "ops"},
	}
	if snaps := meshSnapshotsForInstance(inst, cache); len(snaps) != 0 {
		t.Fatalf("previous endpoint snapshot remained visible: %+v", snaps)
	}
}

func TestMeshSnapshotFreshness(t *testing.T) {
	now := time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)
	if meshSnapshotIsStale(MeshTrafficSnapshot{CollectedAt: now.Add(-2 * time.Minute).Format(time.RFC3339)}, now) {
		t.Fatal("recent sample stale")
	}
	if !meshSnapshotIsStale(MeshTrafficSnapshot{CollectedAt: now.Add(-11 * time.Minute).Format(time.RFC3339)}, now) {
		t.Fatal("old sample fresh")
	}
	if !meshSnapshotIsStale(MeshTrafficSnapshot{CollectedAt: "bad"}, now) {
		t.Fatal("invalid timestamp fresh")
	}
	inst := MeshInstance{ID: "a", TrafficCollectors: []MeshTrafficCollector{{ID: "c", Host: "h", User: "u"}}}
	cache := map[string]MeshTrafficSnapshot{meshTrafficCacheKey("a", "c"): {InstanceID: "a", CollectorID: "c", Host: "h", User: "u", CollectedAt: now.Add(-11 * time.Minute).Format(time.RFC3339)}}
	if got := meshFreshSnapshotsForInstance(inst, cache, now); len(got) != 0 {
		t.Fatalf("old snapshot affects live topology: %+v", got)
	}
}
