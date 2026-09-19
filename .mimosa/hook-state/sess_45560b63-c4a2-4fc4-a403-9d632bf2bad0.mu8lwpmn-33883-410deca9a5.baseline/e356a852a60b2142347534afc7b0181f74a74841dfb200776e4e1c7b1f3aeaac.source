package internal

import "testing"

func TestNormalizeYAMLDocument_HelmSourceComment(t *testing.T) {
	in := "---\n# Source: chart/templates/NOTES.txt\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: x\n"
	got := normalizeYAMLDocument(in)
	if got == "" {
		t.Fatal("expected non-empty normalized doc")
	}
	if k := kubernetesYAMLKind(in); k != "Service" {
		t.Fatalf("kind: got %q want Service", k)
	}
}

func TestNormalizeYAMLDocument_BOM(t *testing.T) {
	in := "\uFEFF---\n# hi\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: c\n"
	if k := kubernetesYAMLKind(in); k != "ConfigMap" {
		t.Fatalf("kind: got %q want ConfigMap", k)
	}
}

func TestKubernetesYAMLKind_RegexIndented(t *testing.T) {
	in := "apiVersion: apps/v1\n  kind: Deployment\nmetadata:\n  name: d\n"
	if k := kubernetesYAMLKind(in); k != "Deployment" {
		t.Fatalf("kind: got %q want Deployment (regex fallback)", k)
	}
}

func TestSplitYAMLDocuments_CRNL(t *testing.T) {
	in := "apiVersion: v1\r\nkind: Pod\r\nmetadata:\r\n  name: p\r\n---\r\napiVersion: v1\r\nkind: Service\r\nmetadata:\r\n  name: s\r\n"
	docs := splitYAMLDocuments(in)
	if len(docs) != 2 {
		t.Fatalf("want 2 docs, got %d", len(docs))
	}
	if k := kubernetesYAMLKind(docs[0]); k != "Pod" {
		t.Fatalf("doc0 kind: %q", k)
	}
	if k := kubernetesYAMLKind(docs[1]); k != "Service" {
		t.Fatalf("doc1 kind: %q", k)
	}
}
