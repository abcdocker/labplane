package internal

import (
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
)

// ComposeMySQLDSN 由主机、端口、库、用户、密码生成 go-sql-driver 兼容 DSN。
func ComposeMySQLDSN(host string, port int, user, password, database string) string {
	host = strings.TrimSpace(host)
	user = strings.TrimSpace(user)
	database = strings.TrimSpace(database)
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	var userinfo string
	if password != "" {
		userinfo = url.UserPassword(user, password).String()
	} else {
		userinfo = user
	}
	return fmt.Sprintf("%s@tcp(%s)/%s?parseTime=true&charset=utf8mb4", userinfo, addr, database)
}

// FinalizeConnectionStrings 若填写了分字段 MySQL/Redis，则写入 MySQLDSN、RedisAddr。
func FinalizeConnectionStrings(c *Config) {
	if strings.TrimSpace(c.MySQLHost) != "" && c.MySQLPort > 0 &&
		strings.TrimSpace(c.MySQLDatabase) != "" && strings.TrimSpace(c.MySQLUser) != "" {
		c.MySQLDSN = ComposeMySQLDSN(c.MySQLHost, c.MySQLPort, c.MySQLUser, c.MySQLPassword, c.MySQLDatabase)
	}
	// Redis: 优先使用已提供的 redisAddr（支持集群/哨兵多地址），否则从 host+port 拼接
	if strings.TrimSpace(c.RedisAddr) == "" {
		if strings.TrimSpace(c.RedisHost) != "" && c.RedisPort > 0 {
			c.RedisAddr = net.JoinHostPort(strings.TrimSpace(c.RedisHost), strconv.Itoa(c.RedisPort))
		}
	}
}
