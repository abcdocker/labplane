package internal

import (
	"testing"
)

func TestPinnedSSHHostKeyCallback(t *testing.T) {
	if _, err := pinnedSSHHostKeyCallback(false, ""); err == nil {
		t.Fatal("secure mode must reject an empty fingerprint")
	}
	if cb, err := pinnedSSHHostKeyCallback(true, ""); err != nil || cb == nil {
		t.Fatalf("explicit insecure mode should remain available: %v", err)
	}
}
