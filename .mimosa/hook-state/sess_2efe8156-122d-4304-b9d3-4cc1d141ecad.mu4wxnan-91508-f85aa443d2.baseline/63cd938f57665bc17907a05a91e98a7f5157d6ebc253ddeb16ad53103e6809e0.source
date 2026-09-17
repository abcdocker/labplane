package internal

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// LoginPasswordMaxBytes 登录/校验当前密码时允许的最大密码字节长度（防滥用与 bcrypt 侧开销）。
const LoginPasswordMaxBytes = 1024

// ErrLoginPasswordTooLong 密码超过 LoginPasswordMaxBytes。
var ErrLoginPasswordTooLong = errors.New("密码过长")

// dashboardUserAuthenticate 校验登录标识（用户名或邮箱，大小写不敏感匹配邮箱）与密码。返回库中 username 供会话使用。
func dashboardUserAuthenticate(db *sql.DB, login, password string) (dbUsername, role string, ok bool, found bool, err error) {
	if len(password) > LoginPasswordMaxBytes {
		return "", "", false, false, ErrLoginPasswordTooLong
	}
	login = strings.TrimSpace(login)
	if login == "" || db == nil {
		return "", "", false, false, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	var hash string
	var r string
	var disabled bool
	var dbUser string
	q := `SELECT password_hash, role, disabled, username FROM kubebt_dashboard_users WHERE username = ? LIMIT 1`
	err = db.QueryRowContext(ctx, q, login).Scan(&hash, &r, &disabled, &dbUser)
	if errors.Is(err, sql.ErrNoRows) {
		err = db.QueryRowContext(ctx,
			`SELECT password_hash, role, disabled, username FROM kubebt_dashboard_users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND TRIM(COALESCE(email,'')) <> '' ORDER BY id ASC LIMIT 1`,
			login).Scan(&hash, &r, &disabled, &dbUser)
		if errors.Is(err, sql.ErrNoRows) {
			return "", "", false, false, nil
		}
	}
	if err != nil {
		return "", "", false, false, err
	}
	dbUser = strings.TrimSpace(dbUser)
	found = true
	if disabled {
		return dbUser, "", false, true, nil
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return dbUser, "", false, true, nil
	}
	r = strings.TrimSpace(r)
	if r != DashboardRoleAdmin && r != DashboardRoleViewer {
		r = DashboardRoleViewer
	}
	return dbUser, r, true, true, nil
}

// DashboardMysqlUserActive 若用户在 kubebt_dashboard_users 中存在且未禁用则 true；无行（非库内账号）则 true。
func DashboardMysqlUserActive(db *sql.DB, username string) bool {
	if db == nil {
		return true
	}
	u := strings.TrimSpace(username)
	if u == "" {
		return true
	}
	var dis int
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	err := db.QueryRowContext(ctx, `SELECT disabled FROM kubebt_dashboard_users WHERE username=? LIMIT 1`, u).Scan(&dis)
	if errors.Is(err, sql.ErrNoRows) {
		return true
	}
	if err != nil {
		return true
	}
	return dis == 0
}

func hashDashboardPassword(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// verifyDashboardUserCurrentPassword 校验当前登录用户在库中的平台密码（用于敏感信息二次确认）。
func verifyDashboardUserCurrentPassword(db *sql.DB, ctx context.Context, username, password string) error {
	if db == nil {
		return errors.New("MySQL 未就绪")
	}
	u := strings.TrimSpace(username)
	if u == "" {
		return errors.New("未登录")
	}
	if len(password) > LoginPasswordMaxBytes {
		return ErrLoginPasswordTooLong
	}
	var hash string
	err := db.QueryRowContext(ctx, `SELECT password_hash FROM kubebt_dashboard_users WHERE username=? LIMIT 1`, u).Scan(&hash)
	if errors.Is(err, sql.ErrNoRows) {
		return errors.New("库内无该平台用户")
	}
	if err != nil {
		return err
	}
	hash = strings.TrimSpace(hash)
	if hash == "" {
		return errors.New("该账号未设置平台密码")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return errors.New("密码错误")
	}
	return nil
}
