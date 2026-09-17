package internal

import "testing"

func TestEnsureKubernetesYAMLGVK_FromLastApplied(t *testing.T) {
	// KubeSphere / 控制台常见：无顶格 apiVersion/kind，仅 metadata+spec+status，GVK 在 last-applied JSON 中
	in := `metadata:
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: |
      {"apiVersion":"apps/v1","kind":"Deployment","metadata":{"name":"rustdesk-server","namespace":"tools"},"spec":{"replicas":1}}
  name: rustdesk-server
  namespace: tools
spec:
  replicas: 1
`
	out := ensureKubernetesYAMLGVK(in)
	if got := kubernetesYAMLKind(out); got != "Deployment" {
		t.Fatalf("kind: got %q want Deployment; out:\n%s", got, out)
	}
}

func TestEnsureKubernetesYAMLGVK_DeploymentShapeWithoutHeader(t *testing.T) {
	in := `metadata:
  name: app
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: x
  strategy:
    type: RollingUpdate
  template:
    metadata:
      labels:
        app: x
    spec:
      containers:
      - name: c
        image: nginx
`
	out := ensureKubernetesYAMLGVK(in)
	if got := kubernetesYAMLKind(out); got != "Deployment" {
		t.Fatalf("kind: got %q want Deployment", got)
	}
}
