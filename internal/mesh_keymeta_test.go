package internal

import (
	"testing"
	"time"
)

func TestMeshKeyMetaIsScopedToInstance(t *testing.T) {
	kv, err := newPlatformKVFile(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	saveMeshKeyMeta(kv, map[string]meshKeyMeta{
		meshKeyMetaID("a", "1"): {Note: "A", FullEnc: "secret-a"},
		meshKeyMetaID("b", "1"): {Note: "B", FullEnc: "secret-b"},
	})
	if got, _ := meshKeyMetaFor(kv, "a", "1"); got.Note != "A" || got.FullEnc != "secret-a" {
		t.Fatalf("a: %+v", got)
	}
	if got, _ := meshKeyMetaFor(kv, "b", "1"); got.Note != "B" || got.FullEnc != "secret-b" {
		t.Fatalf("b: %+v", got)
	}
	pruneMeshKeyMeta(kv, "a", []string{"1"})
	if _, ok := meshKeyMetaFor(kv, "a", "1"); ok {
		t.Fatal("a metadata survived delete")
	}
	if got, _ := meshKeyMetaFor(kv, "b", "1"); got.Note != "B" {
		t.Fatalf("b metadata deleted: %+v", got)
	}
}

func TestLegacyMeshKeyMetaCannotCrossInstances(t *testing.T) {
	kv, err := newPlatformKVFile(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := saveMeshSettings(kv, &meshSettingsBundle{Instances: []MeshInstance{{ID: "a"}, {ID: "b"}}}); err != nil {
		t.Fatal(err)
	}
	saveMeshKeyMeta(kv, map[string]meshKeyMeta{"1": {FullEnc: "legacy-secret"}})
	if _, ok := meshKeyMetaFor(kv, "a", "1"); ok {
		t.Fatal("ambiguous legacy metadata exposed")
	}
	if _, ok := meshKeyMetaFor(kv, "b", "1"); ok {
		t.Fatal("ambiguous legacy metadata exposed")
	}
}

func TestLegacyMeshKeyMetaMigratesBeforeSecondInstance(t *testing.T) {
	kv, err := newPlatformKVFile(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	saveMeshKeyMeta(kv, map[string]meshKeyMeta{"1": {FullEnc: "legacy-secret"}})
	if err := migrateLegacyMeshKeyMeta(kv, "a"); err != nil {
		t.Fatal(err)
	}
	if err := saveMeshSettings(kv, &meshSettingsBundle{Instances: []MeshInstance{{ID: "a"}, {ID: "b"}}}); err != nil {
		t.Fatal(err)
	}
	if got, ok := meshKeyMetaFor(kv, "a", "1"); !ok || got.FullEnc != "legacy-secret" {
		t.Fatalf("migration lost key: %+v", got)
	}
	if _, ok := meshKeyMetaFor(kv, "b", "1"); ok {
		t.Fatal("migrated key leaked")
	}
}

func TestMeshJoinReportRequiresMatchingInstance(t *testing.T) {
	kv, err := newPlatformKVFile(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	saveMeshKeyMeta(kv, map[string]meshKeyMeta{meshKeyMetaID("a", "1"): {FullEnc: "encrypted"}})
	if candidates := meshJoinReportCandidates(kv, "b"); len(candidates) != 0 {
		t.Fatalf("other instance candidates: %+v", candidates)
	}
}

func TestMeshJoinReportRequiresActiveKey(t *testing.T) {
	now := time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC)
	keys := []HSPreAuthKey{{ID: "1", Expiration: now.Add(time.Hour).Format(time.RFC3339)}}
	if !meshPreAuthKeyValidForReport(keys, "1", now) {
		t.Fatal("active key rejected")
	}
	if meshPreAuthKeyValidForReport(keys, "2", now) {
		t.Fatal("missing key accepted")
	}
	keys[0].Expiration = now.Add(-time.Second).Format(time.RFC3339)
	if meshPreAuthKeyValidForReport(keys, "1", now) {
		t.Fatal("expired key accepted")
	}
}
