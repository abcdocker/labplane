package internal

import (
	"fmt"
	"strconv"
	"strings"
)

// redisEnterpriseArgsShell 生产环境常用参数，供 sh -c 内联 redis-server 使用（前导空格）。
func redisEnterpriseArgsShell(opts RedisK8sDeployOpts) string {
	tb := opts.TcpBacklog
	if tb <= 0 {
		tb = 511
	}
	tk := opts.TcpKeepalive
	if tk <= 0 {
		tk = 60
	}
	timeout := opts.ClientTimeoutSec
	if timeout < 0 {
		timeout = 0
	}
	mc := opts.MaxClients
	if mc <= 0 {
		mc = 10000
	}
	hz := opts.Hz
	if hz <= 0 {
		hz = 10
	}
	lazyEv := "yes"
	if !opts.LazyfreeLazyEviction {
		lazyEv = "no"
	}
	lazyEx := "yes"
	if !opts.LazyfreeLazyExpire {
		lazyEx = "no"
	}
	s := fmt.Sprintf(
		` --tcp-backlog %d --tcp-keepalive %d --timeout %d --maxclients %d --hz %d --lazyfree-lazy-eviction %s --lazyfree-lazy-expire %s`,
		tb, tk, timeout, mc, hz, lazyEv, lazyEx,
	)
	if opts.IOThreads > 0 {
		s += fmt.Sprintf(` --io-threads %d --io-threads-do-reads yes`, opts.IOThreads)
	}
	return s
}

// redisEnterpriseArgsArgv exec 形式 redis-server 的附加参数（在 --appendonly 等之后追加）。
func redisEnterpriseArgsArgv(opts RedisK8sDeployOpts) []string {
	tb := opts.TcpBacklog
	if tb <= 0 {
		tb = 511
	}
	tk := opts.TcpKeepalive
	if tk <= 0 {
		tk = 60
	}
	timeout := opts.ClientTimeoutSec
	if timeout < 0 {
		timeout = 0
	}
	mc := opts.MaxClients
	if mc <= 0 {
		mc = 10000
	}
	hz := opts.Hz
	if hz <= 0 {
		hz = 10
	}
	lazyEv := "yes"
	if !opts.LazyfreeLazyEviction {
		lazyEv = "no"
	}
	lazyEx := "yes"
	if !opts.LazyfreeLazyExpire {
		lazyEx = "no"
	}
	out := []string{
		"--tcp-backlog", strconv.FormatInt(int64(tb), 10),
		"--tcp-keepalive", strconv.FormatInt(int64(tk), 10),
		"--timeout", strconv.Itoa(timeout),
		"--maxclients", strconv.FormatInt(int64(mc), 10),
		"--hz", strconv.Itoa(hz),
		"--lazyfree-lazy-eviction", lazyEv,
		"--lazyfree-lazy-expire", lazyEx,
	}
	if opts.IOThreads > 0 {
		out = append(out, "--io-threads", strconv.Itoa(opts.IOThreads), "--io-threads-do-reads", "yes")
	}
	return out
}

// redisRdbArgv 生成 --save 参数；空切片表示不覆盖 redis 默认 save。
func redisRdbArgv(opts RedisK8sDeployOpts) []string {
	lines := opts.RdbSaveLines
	if len(lines) == 0 {
		return nil
	}
	if len(lines) == 1 {
		x := strings.TrimSpace(strings.ToLower(lines[0]))
		if x == "" || x == "none" || x == "off" || x == `""` {
			return []string{"--save", ""}
		}
	}
	var out []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		low := strings.ToLower(line)
		if low == "none" || low == "off" {
			return []string{"--save", ""}
		}
		f := strings.Fields(line)
		if len(f) < 2 {
			continue
		}
		out = append(out, "--save", f[0], f[1])
	}
	return out
}

// redisRdbShellFragment 供 sh -c 内联 redis-server 使用的 --save 片段（前导空格）。
func redisRdbShellFragment(opts RedisK8sDeployOpts) string {
	lines := opts.RdbSaveLines
	if len(lines) == 0 {
		return ""
	}
	if len(lines) == 1 {
		x := strings.TrimSpace(strings.ToLower(lines[0]))
		if x == "" || x == "none" || x == "off" || x == `""` {
			return ` --save ''`
		}
	}
	var b strings.Builder
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		low := strings.ToLower(line)
		if low == "none" || low == "off" {
			return ` --save ''`
		}
		f := strings.Fields(line)
		if len(f) < 2 {
			continue
		}
		b.WriteString(fmt.Sprintf(` --save %s %s`, shellQuoteForSh(f[0]), shellQuoteForSh(f[1])))
	}
	return b.String()
}

func redisExtraArgsShellFragment(opts RedisK8sDeployOpts) string {
	if len(opts.ExtraRedisServerArgs) == 0 {
		return ""
	}
	var b strings.Builder
	for _, a := range opts.ExtraRedisServerArgs {
		a = strings.TrimSpace(a)
		if a == "" {
			continue
		}
		b.WriteString(" ")
		b.WriteString(shellQuoteForSh(a))
	}
	return b.String()
}

func redisExtraArgsArgv(opts RedisK8sDeployOpts) []string {
	if len(opts.ExtraRedisServerArgs) == 0 {
		return nil
	}
	var out []string
	for _, a := range opts.ExtraRedisServerArgs {
		a = strings.TrimSpace(a)
		if a == "" {
			continue
		}
		out = append(out, strings.Fields(a)...)
	}
	return out
}
