package internal

import (
	"database/sql"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
)

// openMySQLPoolWithRetry 首次连接 MySQL 时重试（网络抖动、RDS 启动慢）。
func openMySQLPoolWithRetry(dsn string) (*sql.DB, error) {
	dsn = strings.TrimSpace(dsn)
	if dsn == "" {
		return nil, nil
	}
	attempts := 6
	if s := strings.TrimSpace(os.Getenv("KUBEBT_MYSQL_OPEN_ATTEMPTS")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 1 && n <= 30 {
			attempts = n
		}
	}
	base := 400 * time.Millisecond
	if s := strings.TrimSpace(os.Getenv("KUBEBT_MYSQL_OPEN_BACKOFF_MS")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 100 && n <= 30000 {
			base = time.Duration(n) * time.Millisecond
		}
	}
	var lastErr error
	for i := 1; i <= attempts; i++ {
		db, err := openMySQLPool(dsn)
		if err == nil && db != nil {
			if i > 1 {
				log.Printf("MySQL: 第 %d 次尝试后连接成功", i)
			}
			return db, nil
		}
		lastErr = err
		if i < attempts {
			sh := i - 1
			if sh > 5 {
				sh = 5
			}
			d := base * time.Duration(1<<sh)
			if d > 8*time.Second {
				d = 8 * time.Second
			}
			time.Sleep(d)
		}
	}
	return nil, lastErr
}
