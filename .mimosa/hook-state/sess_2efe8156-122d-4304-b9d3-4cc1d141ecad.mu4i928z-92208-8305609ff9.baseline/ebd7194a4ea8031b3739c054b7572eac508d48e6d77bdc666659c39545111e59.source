package internal

import (
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	sigyaml "sigs.k8s.io/yaml"
)

func TestReformatConfigMapYAMLForDisplay_multilineDataUsesLiteralBlock(t *testing.T) {
	cm := &corev1.ConfigMap{
		TypeMeta: metav1.TypeMeta{APIVersion: "v1", Kind: "ConfigMap"},
		ObjectMeta: metav1.ObjectMeta{
			Name:      "prometheus-config",
			Namespace: "tools",
		},
		Data: map[string]string{
			"prometheus.yml": "global:\n  scrape_interval: 15s\nscrape_configs:\n- job_name: \"x\"\n",
		},
	}
	raw, err := sigyaml.Marshal(cm)
	if err != nil {
		t.Fatal(err)
	}
	out, err := reformatConfigMapYAMLForDisplay(raw)
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	if !strings.Contains(s, "prometheus.yml: |") {
		t.Fatalf("expected literal block after prometheus.yml, got:\n%s", s)
	}
	if !strings.Contains(s, "scrape_interval: 15s") {
		t.Fatalf("expected decoded content lines, got:\n%s", s)
	}
}

// sigs.k8s.io/yaml 经 JSON 再转 YAML 时，长文本常落成「双引号 + \\n 转义」单行；解析后应改为 | 块。
func TestReformatConfigMapYAMLForDisplay_doubleQuotedEscapesBecomeLiteral(t *testing.T) {
	raw := `apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: tools
data:
  prometheus.yml: "global:\n  scrape_interval: 15s\n  scrape_timeout: 15s\n"
`
	out, err := reformatConfigMapYAMLForDisplay([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	if !strings.Contains(s, "prometheus.yml: |") {
		t.Fatalf("expected literal block, got:\n%s", s)
	}
	if strings.Contains(s, `\n`) {
		t.Fatalf("did not expect literal backslash-n in output, got:\n%s", s)
	}
	if !strings.Contains(s, "scrape_timeout: 15s") {
		t.Fatalf("expected real newlines in body, got:\n%s", s)
	}
}

// 单引号 YAML 中 \n 为两字面字符（非换行），模拟部分导出行；prometheus.yml 键应还原为 | 多行
func TestReformConfigMapYAML_escapedNewlinesInLongLineWithPrometheusKey(t *testing.T) {
	raw := `apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: tools
data:
  prometheus.yml: 'global:\n  scrape_interval: 15s\n  scrape_timeout: 15s\n'
`
	out, err := reformatConfigMapYAMLForDisplay([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	if !strings.Contains(s, "prometheus.yml: |") {
		t.Fatalf("expected literal block for prometheus key, got:\n%s", s)
	}
	if !strings.Contains(s, "scrape_interval: 15s") {
		t.Fatalf("expected unescaped line content, got:\n%s", s)
	}
}

// 与集群对象一致的多行 data 在 WithData 路径下会重建 data:，不依赖上面 YAML 的引号形态。
func TestReformatConfigMapYAMLWithData_overridesUgliness(t *testing.T) {
	ugly := `apiVersion: v1
kind: ConfigMap
metadata:
  name: x
  namespace: tools
data:
  prometheus.yml: "should be replaced"
  other.txt: "ok"
`
	lines := "global:\n  scrape_interval: 15s\n- job: x\n"
	out, err := reformatConfigMapYAMLForDisplayWithData([]byte(ugly), map[string]string{
		"other.txt":      "ok",
		"prometheus.yml": lines,
	})
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	if !strings.Contains(s, "prometheus.yml: |") {
		t.Fatalf("expected | block, got:\n%s", s)
	}
	if !strings.Contains(s, "scrape_interval: 15s") {
		t.Fatalf("expected body from o.Data, got:\n%s", s)
	}
}
