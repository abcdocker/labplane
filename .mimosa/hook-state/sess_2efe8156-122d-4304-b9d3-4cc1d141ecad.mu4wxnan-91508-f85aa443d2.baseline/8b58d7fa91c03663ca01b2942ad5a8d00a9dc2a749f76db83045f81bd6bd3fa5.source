package internal

import (
	"strings"
	"testing"
)

func TestRedactLogTextForAI(t *testing.T) {
	input := `authorization: Bearer abcdefghijklmnop password=hunter2 token="secret-value" eyJhbGciOiJIUzI1NiJ9.abcdefghijklmno.abcdefghijklmnop`
	got := redactLogTextForAI(input)
	for _, secret := range []string{"abcdefghijklmnop", "hunter2", "secret-value", "eyJhbGci"} {
		if strings.Contains(got, secret) {
			t.Fatalf("redacted output still contains %q: %s", secret, got)
		}
	}
}

func TestSensitiveLogFieldName(t *testing.T) {
	for _, key := range []string{"password", "http.authorization", "api_key", "Set-Cookie"} {
		if !sensitiveLogFieldName(key) {
			t.Fatalf("expected sensitive field: %s", key)
		}
	}
	if sensitiveLogFieldName("kubernetes.pod_name") {
		t.Fatal("pod name must not be treated as secret")
	}
}
