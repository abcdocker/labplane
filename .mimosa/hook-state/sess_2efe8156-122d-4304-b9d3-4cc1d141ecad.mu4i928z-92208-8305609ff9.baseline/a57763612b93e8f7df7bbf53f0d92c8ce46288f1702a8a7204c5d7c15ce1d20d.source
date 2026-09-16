package internal

import (
	"context"
	"database/sql"
	"errors"
	"net"
	"strings"
)

// DashboardRequestGate 单次查询门禁结果（禁用 + 登录 IP 白名单）。
type DashboardRequestGate int

const (
	DashboardGateAllow DashboardRequestGate = iota
	DashboardGateDisabled
	DashboardGateIPForbidden
)

// DashboardUserRequestGate 一次查询完成禁用与 allowed_login_ips 校验；无行时放行（与仅运行时账号一致）。
// username 与 DashboardMysqlUserActive 一致按库内 username 精确匹配。
func DashboardUserRequestGate(db *sql.DB, ctx context.Context, username, clientIP string) (DashboardRequestGate, error) {
	if db == nil {
		return DashboardGateAllow, nil
	}
	u := strings.TrimSpace(username)
	if u == "" {
		return DashboardGateAllow, nil
	}
	var dis int
	var ips sql.NullString
	err := db.QueryRowContext(ctx,
		`SELECT disabled, COALESCE(allowed_login_ips,'') FROM kubebt_dashboard_users WHERE username = ? LIMIT 1`,
		u,
	).Scan(&dis, &ips)
	if errors.Is(err, sql.ErrNoRows) {
		return DashboardGateAllow, nil
	}
	if err != nil {
		return DashboardGateAllow, err
	}
	if dis != 0 {
		return DashboardGateDisabled, nil
	}
	raw := strings.TrimSpace(ips.String)
	if raw == "" {
		return DashboardGateAllow, nil
	}
	if ClientIPMatchesAllowlist(clientIP, raw) {
		return DashboardGateAllow, nil
	}
	return DashboardGateIPForbidden, nil
}

// LoadDashboardUserLoginPolicy 读取平台用户的登录 IP 与多会话策略；无行时（仅运行时账号）返回零值表示不限制。
func LoadDashboardUserLoginPolicy(db *sql.DB, ctx context.Context, username string) (allowMultiIP bool, allowedIPsRaw string, err error) {
	if db == nil {
		return false, "", nil
	}
	u := strings.TrimSpace(username)
	if u == "" {
		return false, "", nil
	}
	var mul sql.NullInt64
	var ips sql.NullString
	e := db.QueryRowContext(ctx,
		`SELECT COALESCE(allow_multi_ip_login,0), COALESCE(allowed_login_ips,'') FROM kubebt_dashboard_users WHERE LOWER(username) = LOWER(?) LIMIT 1`,
		u,
	).Scan(&mul, &ips)
	if errors.Is(e, sql.ErrNoRows) {
		return false, "", nil
	}
	if e != nil {
		return false, "", e
	}
	return mul.Valid && mul.Int64 != 0, strings.TrimSpace(ips.String), nil
}

// DashboardUserClientIPAllowed 若配置了 allowed_login_ips 则校验 clientIP（与 AuditClientIP 一致）；空配置表示不限制。
func DashboardUserClientIPAllowed(db *sql.DB, ctx context.Context, username, clientIP string) (bool, error) {
	_, raw, err := LoadDashboardUserLoginPolicy(db, ctx, username)
	if err != nil || raw == "" {
		return true, err
	}
	return ClientIPMatchesAllowlist(clientIP, raw), nil
}

// ClientIPMatchesAllowlist 解析多行/逗号分隔的 IPv4/IPv6 或 CIDR，任一匹配即 true。
func ClientIPMatchesAllowlist(clientIP, raw string) bool {
	ip := net.ParseIP(strings.TrimSpace(clientIP))
	if ip == nil {
		return false
	}
	tokens := splitLoginIPTokens(raw)
	if len(tokens) == 0 {
		return true
	}
	for _, t := range tokens {
		if strings.Contains(t, "/") {
			_, n, err := net.ParseCIDR(t)
			if err != nil {
				continue
			}
			if n.Contains(ip) {
				return true
			}
			continue
		}
		x := net.ParseIP(t)
		if x != nil && x.Equal(ip) {
			return true
		}
	}
	return false
}

func splitLoginIPTokens(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var out []string
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		for _, p := range strings.FieldsFunc(line, func(r rune) bool {
			return r == ',' || r == ';' || r == ' '
		}) {
			p = strings.TrimSpace(p)
			if p != "" {
				out = append(out, p)
			}
		}
	}
	return out
}

// ValidateAllowedLoginIPsText 保存前校验；空串合法。
func ValidateAllowedLoginIPsText(raw string) error {
	tokens := splitLoginIPTokens(raw)
	for _, t := range tokens {
		if strings.Contains(t, "/") {
			if _, _, err := net.ParseCIDR(t); err != nil {
				return errors.New("无效的 CIDR: " + t)
			}
			continue
		}
		if net.ParseIP(t) == nil {
			return errors.New("无效的 IP: " + t)
		}
	}
	return nil
}

// NormalizeClientIPForSessionKey 用作多会话 map 的键（IPv4 优先压缩形式）。
func NormalizeClientIPForSessionKey(clientIP string) string {
	s := strings.TrimSpace(clientIP)
	if s == "" {
		return "_"
	}
	if i := strings.IndexByte(s, '%'); i >= 0 {
		s = s[:i]
	}
	ip := net.ParseIP(s)
	if ip == nil {
		return s
	}
	if v4 := ip.To4(); v4 != nil {
		return v4.String()
	}
	return ip.String()
}

