package internal

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"

	mysqldriver "github.com/go-sql-driver/mysql"
)

func mysqlAutoCreateDatabaseEnabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("KUBEBT_MYSQL_AUTOCREATE_DATABASE")))
	if v == "0" || v == "false" || v == "off" || v == "no" {
		return false
	}
	return true
}

func mysqlIsUnknownDatabaseErr(err error) bool {
	if err == nil {
		return false
	}
	var me *mysqldriver.MySQLError
	if errors.As(err, &me) && me.Number == 1049 {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unknown database") || strings.Contains(msg, "1049")
}

// mysqlValidSchemaName 库名/简单标识：字母数字下划线，长度合理（与常见 MySQL 限制一致）。
func mysqlValidSchemaName(name string) bool {
	if name == "" || len(name) > 64 {
		return false
	}
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			continue
		}
		return false
	}
	return true
}

// mysqlEnsureDatabaseExists 在 DSN 中的库不存在时，用去掉库名的 DSN 连上服务端并 CREATE DATABASE。
// 需要账号具备建库权限；可通过 KUBEBT_MYSQL_AUTOCREATE_DATABASE=false 关闭。
func mysqlEnsureDatabaseExists(fullDSN string) error {
	cfg, err := mysqldriver.ParseDSN(fullDSN)
	if err != nil {
		return fmt.Errorf("解析 DSN: %w", err)
	}
	dbName := strings.TrimSpace(cfg.DBName)
	if dbName == "" {
		return errors.New("DSN 未包含数据库名，无法自动建库")
	}
	if !mysqlValidSchemaName(dbName) {
		return fmt.Errorf("数据库名不合法（仅允许字母、数字、下划线，最长 64）")
	}
	cfg.DBName = ""
	adminDSN := cfg.FormatDSN()
	db, err := sql.Open("mysql", adminDSN)
	if err != nil {
		return err
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), mysqlPingTimeout())
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("连接 MySQL（不指定库）: %w", err)
	}
	safe := strings.ReplaceAll(dbName, "`", "")
	q := "CREATE DATABASE IF NOT EXISTS `" + safe + "` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
	if _, err := db.ExecContext(ctx, q); err != nil {
		return err
	}
	log.Printf("MySQL: 已自动创建数据库 %s，正在初始化 kubebt_* 表…", dbName)
	return nil
}
