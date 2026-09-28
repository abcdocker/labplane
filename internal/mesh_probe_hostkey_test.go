package internal

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"
)

func TestCollectMeshTrafficRejectsUnpinnedHost(t *testing.T) {
	snap := collectMeshTrafficViaSSH(context.Background(), MeshTrafficCollector{ID: "c1", Host: "127.0.0.1", Port: 22, User: "ops"}, "password")
	if !strings.Contains(snap.Error, "指纹未确认") {
		t.Fatalf("untrusted collector should fail before connecting: %+v", snap)
	}
}

func TestMeshProbeHostKeyNeedsTrustBeforePasswordAuth(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	key, err := ssh.NewPublicKey(pub)
	if err != nil {
		t.Fatal(err)
	}
	var observed string
	if err := meshProbeHostKeyCallback("", &observed)("host", nil, key); err == nil {
		t.Fatal("unknown host key must stop SSH authentication")
	}
	if observed != ssh.FingerprintSHA256(key) {
		t.Fatalf("observed fingerprint = %q", observed)
	}
	if err := meshProbeHostKeyCallback(observed, nil)("host", nil, key); err != nil {
		t.Fatalf("trusted fingerprint rejected: %v", err)
	}
	if err := meshProbeHostKeyCallback("SHA256:wrong", nil)("host", nil, key); err == nil || !strings.Contains(err.Error(), "指纹不匹配") {
		t.Fatalf("changed key not rejected: %v", err)
	}
}

func TestMeshCollectorForProbeRequiresMatchingEndpoint(t *testing.T) {
	inst := MeshInstance{TrafficCollectors: []MeshTrafficCollector{{ID: "c1", Host: "router.local", Port: 22, User: "ops", HostKeyFp: "SHA256:pinned"}}}
	if _, ok := meshCollectorForProbe(inst, "c1", "other.local", 22, "ops"); ok {
		t.Fatal("stored SSH credentials must not be used for a different host")
	}
	if _, ok := meshCollectorForProbe(inst, "c1", "router.local", 22, "root"); ok {
		t.Fatal("stored SSH credentials must not be used for a different user")
	}
	if collector, ok := meshCollectorForProbe(inst, "c1", "router.local", 22, "ops"); !ok || collector.HostKeyFp != "SHA256:pinned" {
		t.Fatalf("matching collector not found: %+v, %v", collector, ok)
	}
}

func TestUpsertMeshInstanceSavesConfirmedHostKey(t *testing.T) {
	bundle := &meshSettingsBundle{}
	_, _, err := upsertMeshInstance(bundle, meshInstancePutInput{
		Name: "test", APIURL: "https://headscale.example.com",
		TrafficCollectors: []meshTrafficCollectorPutInput{{ID: "c1", Host: "router.local", User: "ops", HostKeyFp: "SHA256:confirmed"}},
	}, func(s string) (string, error) { return s, nil }, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := bundle.Instances[0].TrafficCollectors[0].HostKeyFp; got != "SHA256:confirmed" {
		t.Fatalf("confirmed fingerprint not persisted: %q", got)
	}
}

func TestUpsertMeshInstanceCanResetPinnedHostKey(t *testing.T) {
	bundle := &meshSettingsBundle{Instances: []MeshInstance{{
		ID: "mesh-a", Name: "test", APIURL: "https://headscale.example.com",
		TrafficCollectors: []MeshTrafficCollector{{ID: "c1", Host: "router.local", Port: 22, User: "ops", HostKeyFp: "SHA256:old"}},
	}}}
	_, _, err := upsertMeshInstance(bundle, meshInstancePutInput{
		ID: "mesh-a", Name: "test", APIURL: "https://headscale.example.com",
		TrafficCollectors: []meshTrafficCollectorPutInput{{ID: "c1", Host: "router.local", Port: 22, User: "ops", HostKeyFp: "-"}},
	}, func(s string) (string, error) { return s, nil }, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := bundle.Instances[0].TrafficCollectors[0].HostKeyFp; got != "" {
		t.Fatalf("reset did not clear fingerprint: %q", got)
	}
}

func TestUpsertMeshInstanceClearsPasswordWhenEndpointChanges(t *testing.T) {
	for _, field := range []string{"host", "port", "user"} {
		t.Run(field, func(t *testing.T) {
			bundle := &meshSettingsBundle{Instances: []MeshInstance{{
				ID: "mesh-a", Name: "test", APIURL: "https://headscale.example.com",
				TrafficCollectors: []MeshTrafficCollector{{ID: "c1", Host: "router.local", Port: 22, User: "ops", PassEnc: "old-password", HostKeyFp: "SHA256:old"}},
			}}}
			input := meshTrafficCollectorPutInput{ID: "c1", Host: "router.local", Port: 22, User: "ops"}
			switch field {
			case "host":
				input.Host = "other.local"
			case "port":
				input.Port = 2222
			case "user":
				input.User = "root"
			}
			_, _, err := upsertMeshInstance(bundle, meshInstancePutInput{
				ID: "mesh-a", Name: "test", APIURL: "https://headscale.example.com",
				TrafficCollectors: []meshTrafficCollectorPutInput{input},
			}, func(s string) (string, error) { return s, nil }, nil)
			if err != nil {
				t.Fatal(err)
			}
			if got := bundle.Instances[0].TrafficCollectors[0].PassEnc; got != "" {
				t.Fatalf("old password carried to changed endpoint: %q", got)
			}
		})
	}
}
