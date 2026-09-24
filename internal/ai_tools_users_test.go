package internal

import (
	"strings"
	"testing"
)

func TestAiAssistantMaskAuditSecrets(t *testing.T) {
	in := `AI助手执行 authentik_create_user {"username":"zhangsan","password":"Pw!secret_123"} → 已创建。初始密码（仅此一次回显）：Abc123_-XYZ
密钥值：tskey-auth-abcdef123456`
	out := aiAssistantMaskAuditSecrets(in)
	if strings.Contains(out, "Pw!secret_123") {
		t.Fatalf("password arg not masked: %s", out)
	}
	if strings.Contains(out, "Abc123_-XYZ") {
		t.Fatalf("generated password not masked: %s", out)
	}
	if strings.Contains(out, "tskey-auth-abcdef123456") {
		t.Fatalf("preauth key not masked: %s", out)
	}
	if !strings.Contains(out, `"username":"zhangsan"`) {
		t.Fatalf("non-secret fields must be preserved: %s", out)
	}
	if !strings.Contains(out, "***") {
		t.Fatalf("expected masked markers: %s", out)
	}
}

func TestAiUserToolPassword(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 50; i++ {
		pw := aiUserToolPassword()
		if len(pw) != 16 {
			t.Fatalf("password length = %d, want 16", len(pw))
		}
		seen[pw] = true
	}
	if len(seen) < 40 {
		t.Fatalf("password generator not varied enough: %d unique in 50", len(seen))
	}
}

func TestBoolArgVariants(t *testing.T) {
	cases := []struct {
		in  map[string]any
		key string
		def bool
		want bool
	}{
		{map[string]any{"k": true}, "k", false, true},
		{map[string]any{"k": float64(1)}, "k", false, true},
		{map[string]any{"k": "true"}, "k", false, true},
		{map[string]any{"k": "FALSE"}, "k", true, false},
		{map[string]any{}, "k", true, true},
		{map[string]any{"k": float64(0)}, "k", true, false},
	}
	for i, c := range cases {
		if got := boolArg(c.in, c.key, c.def); got != c.want {
			t.Fatalf("case %d: boolArg = %v, want %v", i, got, c.want)
		}
	}
}

func TestStrListArgVariants(t *testing.T) {
	if got := strListArg(map[string]any{"g": []any{"users", " devs "}}, "g"); len(got) != 2 || got[0] != "users" || got[1] != "devs" {
		t.Fatalf("strListArg array = %v", got)
	}
	if got := strListArg(map[string]any{"g": "users,devs"}, "g"); len(got) != 2 {
		t.Fatalf("strListArg string fallback = %v", got)
	}
	if got := strListArg(map[string]any{}, "g"); got != nil {
		t.Fatalf("strListArg missing = %v", got)
	}
}
