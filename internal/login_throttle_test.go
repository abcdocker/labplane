package internal

import (
	"testing"
	"time"
)

// 限流器状态为包级共享 map，各测试用独立 IP 隔离，避免相互污染。

func TestLoginThrottleCaptchaAfterThreeFailures(t *testing.T) {
	ip := "10.1.1.101"
	if loginNeedsCaptcha(ip) {
		t.Fatal("初始状态不应要求验证码")
	}
	for i := 1; i <= 2; i++ {
		needCaptcha, _ := recordLoginFailure(nil, ip)
		if needCaptcha {
			t.Fatalf("第 %d 次失败不应触发验证码", i)
		}
	}
	needCaptcha, _ := recordLoginFailure(nil, ip)
	if !needCaptcha {
		t.Fatal("第 3 次失败应触发验证码要求")
	}
	if !loginNeedsCaptcha(ip) {
		t.Fatal("触发后 loginNeedsCaptcha 应保持 true")
	}
	// 重置后恢复
	resetLoginFailures(nil, ip)
	if loginNeedsCaptcha(ip) {
		t.Fatal("reset 后不应再要求验证码")
	}
}

func TestLoginThrottleAdminAlertFiresOnce(t *testing.T) {
	ip := "10.1.1.102"
	alertCount := 0
	for i := 0; i < loginFailAdminAlertAt+5; i++ {
		if _, alert := recordLoginFailure(nil, ip); alert {
			alertCount++
		}
	}
	if alertCount != 1 {
		t.Fatalf("20 次失败应只触发一次管理员告警，实际 %d 次", alertCount)
	}
}

func TestLoginThrottleAdminPasswordBanAndExpiry(t *testing.T) {
	ip := "10.1.1.103"
	for i := 0; i < adminPasswordFailBanAt; i++ {
		recordAdminPasswordFailure(nil, ip)
	}
	if !isIPLoginBanned(ip) {
		t.Fatal("连续 5 次 admin 密码错误后应封禁 IP")
	}
	// 模拟封禁到期
	loginTrackMu.Lock()
	st := loginByIP[ip]
	st.BanUntil = time.Now().Add(-time.Second)
	loginTrackMu.Unlock()
	if isIPLoginBanned(ip) {
		t.Fatal("封禁到期后应自动解禁")
	}
	// 解禁同时应清除 admin 专项计数：再失败 4 次不应重新封禁
	for i := 0; i < adminPasswordFailBanAt-1; i++ {
		recordAdminPasswordFailure(nil, ip)
	}
	if isIPLoginBanned(ip) {
		t.Fatal("解禁后计数应清零，4 次失败不应重新封禁")
	}
}

func TestVerifyCaptchaAnswer(t *testing.T) {
	ip := "10.1.1.104"

	// 正确答案：通过且一次性消费
	id := newCaptchaID()
	storeCaptchaAnswer(id, "7", ip)
	if !verifyCaptchaAnswer(id, "7", ip) {
		t.Fatal("正确答案应通过")
	}
	if verifyCaptchaAnswer(id, "7", ip) {
		t.Fatal("验证码应一次性使用，第二次校验必须失败")
	}

	// ID 不存在
	if verifyCaptchaAnswer("nonexistent", "7", ip) {
		t.Fatal("不存在的验证码 ID 应失败")
	}

	// IP 不匹配
	id2 := newCaptchaID()
	storeCaptchaAnswer(id2, "3", ip)
	if verifyCaptchaAnswer(id2, "3", "10.9.9.9") {
		t.Fatal("换 IP 校验验证码应失败")
	}

	// 过期
	id3 := newCaptchaID()
	storeCaptchaAnswer(id3, "5", ip)
	captchaMu.Lock()
	e := captchaAnswers[id3]
	e.expires = time.Now().Add(-time.Second)
	captchaAnswers[id3] = e
	captchaMu.Unlock()
	if verifyCaptchaAnswer(id3, "5", ip) {
		t.Fatal("过期验证码应失败")
	}
}

func TestRandIntOneToNineBounds(t *testing.T) {
	for i := 0; i < 200; i++ {
		n := randIntOneToNine()
		if n < 1 || n > 9 {
			t.Fatalf("randIntOneToNine 越界: %d", n)
		}
	}
}
