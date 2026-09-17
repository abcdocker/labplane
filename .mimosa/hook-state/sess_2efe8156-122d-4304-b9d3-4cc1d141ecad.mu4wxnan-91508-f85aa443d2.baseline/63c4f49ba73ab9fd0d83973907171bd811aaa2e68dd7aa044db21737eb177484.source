package internal

import (
	"bytes"
	"strings"
	"testing"
)

func TestRedisSnapshotEncryptionRoundTrip(t *testing.T) {
	cfg := Config{EncryptionKey: "unit-test-encryption-key-32-bytes"}
	plain := []byte(`{"vcenterPassword":"secret-value"}`)
	encoded, err := encryptRedisSnapshot(cfg, plain)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(encoded, []byte("secret-value")) {
		t.Fatalf("redis payload contains plaintext secret: %s", encoded)
	}
	decoded, err := decryptRedisSnapshot(cfg, string(encoded))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(decoded, plain) {
		t.Fatalf("round trip mismatch: %s", decoded)
	}
}

func TestRedisSnapshotEncryptionRequiresKey(t *testing.T) {
	_, err := encryptRedisSnapshot(Config{}, []byte(`{"secret":"value"}`))
	if err == nil || !strings.Contains(err.Error(), "KUBEBT_ENCRYPTION_KEY") {
		t.Fatalf("expected encryption key error, got %v", err)
	}
}
