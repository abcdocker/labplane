package internal

import "testing"

func TestK8sKubeSphereSnapshotTopkQueries(t *testing.T) {
	namespaceCPU, namespaceMem, podCPU, podMem := k8sKubeSphereSnapshotTopkQueries()
	if namespaceCPU == "" || namespaceMem == "" || podCPU == "" || podMem == "" {
		t.Fatal("expected all topk queries to be populated")
	}
	if namespaceCPU == podCPU {
		t.Fatal("namespace and pod cpu queries should differ")
	}
	if namespaceMem == podMem {
		t.Fatal("namespace and pod memory queries should differ")
	}
	if want := `sum by (namespace, pod)`; !containsAll(podCPU, want) || !containsAll(podMem, want) {
		t.Fatalf("expected pod queries to group by namespace,pod: cpu=%q mem=%q", podCPU, podMem)
	}
	if want := `sum by (namespace)`; !containsAll(namespaceCPU, want) || !containsAll(namespaceMem, want) {
		t.Fatalf("expected namespace queries to group by namespace: cpu=%q mem=%q", namespaceCPU, namespaceMem)
	}
	for _, q := range []string{namespaceCPU, namespaceMem, podCPU, podMem} {
		if !containsAll(q, `namespace!=""`, `pod!=""`, `container!="POD"`) {
			t.Fatalf("expected query selectors in %q", q)
		}
	}
}

func containsAll(s string, parts ...string) bool {
	for _, p := range parts {
		if p == "" {
			continue
		}
		if !containsString(s, p) {
			return false
		}
	}
	return true
}

func containsString(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && indexString(s, sub) >= 0)
}

func indexString(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
