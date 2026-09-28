package internal

import "testing"

func TestMeshNewUserRejectsDuplicateAcrossProviders(t *testing.T) {
	users := []HSUser{{Name: "alice", Provider: "oidc"}}
	if err := validateMeshNewUser(" ALICE ", users); err == nil {
		t.Fatal("duplicate OIDC user accepted")
	}
	if err := validateMeshNewUser("bob", users); err != nil {
		t.Fatalf("valid local user rejected: %v", err)
	}
	if err := validateMeshNewUser(" ", users); err == nil {
		t.Fatal("empty user accepted")
	}
}
