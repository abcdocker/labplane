package internal

import "testing"

func TestMeshCollectorStatusDoesNotRewriteInstanceSettings(t *testing.T) {
	kv, err := newPlatformKVFile(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	inst := MeshInstance{ID: "mesh-a", Name: "original", TrafficCollectors: []MeshTrafficCollector{{ID: "c1", Name: "router", Host: "router.local", Port: 22, User: "ops"}}}
	if err := saveMeshSettings(kv, &meshSettingsBundle{Instances: []MeshInstance{inst}}); err != nil {
		t.Fatal(err)
	}
	before, _ := kv.Get(kvKeyMeshSettings)
	if err := saveMeshCollectorStatus(kv, "mesh-a", "c1", meshCollectorStatus{Host: "router.local", Port: 22, User: "ops", LastSnapshotAt: "2026-09-28T00:00:00Z", LastError: "SSH unreachable"}); err != nil {
		t.Fatal(err)
	}
	after, _ := kv.Get(kvKeyMeshSettings)
	if after != before {
		t.Fatal("collector status update rewrote instance configuration")
	}
	public := meshInstancePublic(inst, kv)
	collectors := public["trafficCollectors"].([]map[string]any)
	if collectors[0]["lastError"] != "SSH unreachable" {
		t.Fatalf("status missing from public response: %+v", collectors[0])
	}
}
