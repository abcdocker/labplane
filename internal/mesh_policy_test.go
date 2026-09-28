package internal

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestHeadscaleClientPolicyV028(t *testing.T) {
	meshAllowLoopbackForTest = true
	defer func() { meshAllowLoopbackForTest = false }()
	const original = `{"grants": []}`
	const updated = `{"grants": [{"src":["*"],"dst":["*"]}]}`
	current := original
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/policy" || r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("wrong policy request: %s %s", r.Method, r.URL.Path)
			w.WriteHeader(404)
			return
		}
		switch r.Method {
		case http.MethodGet:
			_ = json.NewEncoder(w).Encode(map[string]string{"policy": current, "updatedAt": "2026-09-28T00:00:00Z"})
		case http.MethodPut:
			var body map[string]string
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
			current = body["policy"]
			_ = json.NewEncoder(w).Encode(map[string]string{"policy": current})
		default:
			w.WriteHeader(405)
		}
	}))
	defer srv.Close()
	cli, err := newHeadscaleClient(srv.URL, "test-key", 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	got, err := cli.GetPolicy(context.Background())
	if err != nil || got.Policy != original {
		t.Fatalf("get: %+v %v", got, err)
	}
	if _, err := cli.SetPolicy(context.Background(), updated); err != nil {
		t.Fatal(err)
	}
	if got, _ := cli.GetPolicy(context.Background()); got.Policy != updated {
		t.Fatalf("put body not applied: %+v", got)
	}
}

func TestMeshPolicyHistoryScopedAndBounded(t *testing.T) {
	kv, err := newPlatformKVFile(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 7; i++ {
		if err := saveMeshPolicyRevision(kv, "a", meshPolicyRevision{Policy: string(rune('a' + i))}); err != nil {
			t.Fatal(err)
		}
	}
	if got := loadMeshPolicyHistory(kv, "a"); len(got) != meshPolicyHistoryLimit || got[0].Policy != "g" {
		t.Fatalf("unexpected history: %+v", got)
	}
	if got := loadMeshPolicyHistory(kv, "b"); len(got) != 0 {
		t.Fatalf("cross-instance history: %+v", got)
	}
}

func TestMeshPolicyBackupRefusesCorruptHistory(t *testing.T) {
	kv, err := newPlatformKVFile(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := kv.Set(kvKeyMeshPolicyHistoryPrefix+"a", "not-json"); err != nil {
		t.Fatal(err)
	}
	if err := saveMeshPolicyRevision(kv, "a", meshPolicyRevision{Policy: "{}"}); err == nil {
		t.Fatal("corrupt rollback history overwritten")
	}
}

func TestMeshPolicyPutRejectsStaleVersionAndBacksUpBeforeWrite(t *testing.T) {
	meshAllowLoopbackForTest = true
	defer func() { meshAllowLoopbackForTest = false }()
	current := `{"grants": []}`
	writes := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			_ = json.NewEncoder(w).Encode(map[string]string{"policy": current})
		case http.MethodPut:
			writes++
			var body map[string]string
			_ = json.NewDecoder(r.Body).Decode(&body)
			current = body["policy"]
			_ = json.NewEncoder(w).Encode(map[string]string{"policy": current})
		}
	}))
	defer srv.Close()
	kv, err := newPlatformKVFile(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	cfg := Config{EncryptionKey: "test-encryption-key"}
	key, err := meshEncryptionKey(cfg)
	if err != nil {
		t.Fatal(err)
	}
	enc, err := encryptSecret(key, "test-key")
	if err != nil {
		t.Fatal(err)
	}
	if err := saveMeshSettings(kv, &meshSettingsBundle{Instances: []MeshInstance{{ID: "a", APIURL: srv.URL, APIKeyEnc: enc}}}); err != nil {
		t.Fatal(err)
	}
	app := &ServerApp{cfg: cfg, platformKV: kv}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PUT("/:id/policy", handleMeshPolicyPut(app))
	request := func(baseHash string) int {
		body, _ := json.Marshal(map[string]string{"policy": `{"grants":[{"src":["*"],"dst":["*"]}]}`, "baseHash": baseHash})
		res := httptest.NewRecorder()
		router.ServeHTTP(res, httptest.NewRequest(http.MethodPut, "/a/policy", bytes.NewReader(body)))
		return res.Code
	}
	if got := request(meshPolicyHash("stale")); got != http.StatusConflict || writes != 0 {
		t.Fatalf("stale write: status=%d writes=%d", got, writes)
	}
	if got := request(meshPolicyHash(current)); got != http.StatusOK || writes != 1 {
		t.Fatalf("valid write: status=%d writes=%d", got, writes)
	}
	if history := loadMeshPolicyHistory(kv, "a"); len(history) != 1 || history[0].Policy != `{"grants": []}` {
		t.Fatalf("backup missing: %+v", history)
	}
}
