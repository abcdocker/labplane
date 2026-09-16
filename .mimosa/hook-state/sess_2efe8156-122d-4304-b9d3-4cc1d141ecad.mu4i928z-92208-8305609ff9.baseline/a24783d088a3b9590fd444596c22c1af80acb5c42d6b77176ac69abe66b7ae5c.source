package internal

import (
	"sync"
	"time"
)

var (
	beijingLoc     *time.Location
	beijingLocOnce sync.Once
)

// BeijingLocation 返回 Asia/Shanghai；失败时回退 UTC（避免进程崩溃）。
func BeijingLocation() *time.Location {
	beijingLocOnce.Do(func() {
		loc, err := time.LoadLocation("Asia/Shanghai")
		if err != nil {
			beijingLoc = time.UTC
			return
		}
		beijingLoc = loc
	})
	return beijingLoc
}

// NowBeijingRFC3339 用于面向用户展示的 JSON 时间（东八区 RFC3339）。
func NowBeijingRFC3339() string {
	return time.Now().In(BeijingLocation()).Format(time.RFC3339Nano)
}
