package internal

import (
	"strings"
	"testing"
)

func validSetupPayload() *RuntimeSettings {
	return &RuntimeSettings{
		PlatformPublicURL: "http://console.example:18081",
		MySQLHost:         "127.0.0.1",
		MySQLPort:         3306,
		MySQLDatabase:     "labplane",
		MySQLUser:         "console",
		MySQLPassword:     "secret",
		RedisHost:         "127.0.0.1",
		RedisPort:         6379,
		EncryptionKey:     "0123456789abcdef",
		DashboardUser:     "admin",
	}
}

func TestValidateSetupPayloadRejectsMissingFields(t *testing.T) {
	cases := []struct {
		name  string
		mutae func(rs *RuntimeSettings)
		want  string
	}{
		{"平台地址为空", func(rs *RuntimeSettings) { rs.PlatformPublicURL = "  " }, "platformPublicUrl"},
		{"MySQL 缺失", func(rs *RuntimeSettings) { rs.MySQLHost = ""; rs.MySQLDatabase = "" }, "MySQL 未配置"},
		{"Redis 缺失", func(rs *RuntimeSettings) { rs.RedisHost = ""; rs.RedisAddr = "" }, "Redis 未配置"},
		{"加密密钥过短", func(rs *RuntimeSettings) { rs.EncryptionKey = "short" }, "encryptionKey"},
		{"管理员为空", func(rs *RuntimeSettings) { rs.DashboardUser = "" }, "dashboardUser"},
		{"开启同步但无宝塔凭据", func(rs *RuntimeSettings) { rs.IngressBaotaSyncEnabled = true }, "baotaUrl"},
	}
	for _, tc := range cases {
		rs := validSetupPayload()
		tc.mutae(rs)
		err := validateSetupPayload(rs, "valid-password-8")
		if err == nil {
			t.Fatalf("%s: 应返回错误", tc.name)
		}
		if !strings.Contains(err.Error(), tc.want) {
			t.Fatalf("%s: 错误信息 %q 应包含 %q", tc.name, err.Error(), tc.want)
		}
	}
}

func TestValidateSetupPayloadPasswordTooShort(t *testing.T) {
	if err := validateSetupPayload(validSetupPayload(), "1234567"); err == nil {
		t.Fatal("8 位以下密码应被拒绝")
	}
}

func TestValidateSetupPayloadAcceptsValid(t *testing.T) {
	rs := validSetupPayload()
	if err := validateSetupPayload(rs, "valid-password-8"); err != nil {
		t.Fatalf("合法配置不应报错: %v", err)
	}
	if rs.SyncIntervalSec != 30 {
		t.Fatalf("未填同步间隔应默认 30，实际 %d", rs.SyncIntervalSec)
	}
}

func TestValidateSetupPayloadBaotaTargetsFallback(t *testing.T) {
	rs := validSetupPayload()
	rs.IngressBaotaSyncEnabled = true
	// 单实例字段为空，但多实例列表有合法条目，应通过
	rs.BaotaURL = ""
	rs.BaotaAPIKey = ""
	rs.BaotaTargets = []RuntimeBaotaTarget{{Name: "t1", URL: "http://bt.example:8888", ApiKey: "k1"}}
	if err := validateSetupPayload(rs, "valid-password-8"); err != nil {
		t.Fatalf("多实例合法配置不应报错: %v", err)
	}
}
