package internal

import (
	"strings"

	"gopkg.in/yaml.v3"
)

// 内置巡检剧本。指标名取自平台监控中心已在用的 PromQL 家族
// （Telegraf vmware_* 为主，vsphere_* 作为兜底分支）；
// 可在 dataDir/inspect_playbooks/ 下放同名 YAML 覆盖或新增剧本。

const builtinPlaybookVMHostBaselineYAML = `name: vm-host-baseline
title: 虚拟机层基线（vCenter / 宿主机 / 数据存储）
kind: vm
defaultScope: vcenter
description: 检查 ESXi 宿主机内存、数据存储容量与 VM CPU 用量，并扫描宿主机系统日志中的 OOM / 崩溃事件。
steps:
  - id: host_mem_usage
    title: ESXi 宿主机内存使用率
    source: prometheus
    scope: vcenter
    expr: >-
      (max by (host_name) (vmware_host_memory_usage / clamp_min(vmware_host_memory_max, 1)) * 100)
      or
      (max by (host_name) (vsphere_host_mem_usage_avg / clamp_min(vsphere_host_mem_max_avg, 1)) * 100)
    warn: ">= 80"
    crit: ">= 90"
    unit: "%"
  - id: datastore_usage
    title: 数据存储使用率
    source: prometheus
    scope: vcenter
    expr: >-
      ((1 - vmware_datastore_freespace_size / clamp_min(vmware_datastore_capacity_size, 1)) * 100)
      or
      ((1 - vsphere_datastore_freespace_size / clamp_min(vsphere_datastore_capacity_size, 1)) * 100)
    warn: ">= 80"
    crit: ">= 90"
    unit: "%"
  - id: vm_cpu_top
    title: VM CPU 用量 TopN（参考值，无阈值）
    source: prometheus
    scope: vcenter
    expr: >-
      sum by (vm_name) (rate(vmware_vm_cpu_usagemhz_average[5m]))
      or
      sum by (vmname) (rate(vsphere_vm_cpu_usagemhz_average[5m]))
    topN: 10
    unit: MHz
  - id: host_oom_events
    title: 宿主机 OOM 事件
    source: vmlog
    query: '"Out of memory: Killed process"'
    windowMinutes: 1440
    groupBy: host
    warn: ">= 1"
    sampleLimit: 5
  - id: host_crash_events
    title: 段错误 / 进程崩溃
    source: vmlog
    query: '"segfault" or "core dumped"'
    windowMinutes: 1440
    groupBy: host
    warn: ">= 3"
    sampleLimit: 5
  - id: systemd_unit_failed
    title: systemd 单元启动失败
    source: vmlog
    query: '"Failed to start"'
    windowMinutes: 360
    groupBy: host
    warn: ">= 3"
    sampleLimit: 5
`

const builtinPlaybookServiceRedisYAML = `name: service-redis
title: Redis 服务基线（exporter 指标 + 服务日志）
kind: service
defaultScope: k8s
description: 检查 Redis exporter 存活、拒绝连接、命中率、键驱逐，并扫描服务日志中的错误关键词。
steps:
  - id: redis_up
    title: Redis exporter 存活
    source: prometheus
    scope: k8s
    expr: 'up{job=~".*redis.*"}'
    crit: "< 1"
  - id: redis_rejected_conns
    title: 近 1h 拒绝连接数
    source: prometheus
    scope: k8s
    expr: 'increase(redis_rejected_connections_total[1h])'
    warn: ">= 1"
  - id: redis_hit_ratio
    title: 缓存命中率（10m）
    source: prometheus
    scope: k8s
    expr: >-
      rate(redis_keyspace_hits_total[10m])
      / clamp_min(rate(redis_keyspace_hits_total[10m]) + rate(redis_keyspace_misses_total[10m]), 1)
    warn: "< 0.8"
    unit: "%"
  - id: redis_evicted_keys
    title: 近 1h 键驱逐数
    source: prometheus
    scope: k8s
    expr: 'increase(redis_evicted_keys_total[1h])'
    warn: ">= 100"
  - id: redis_error_logs
    title: Redis 服务错误日志
    source: vmlog
    query: 'app:redis AND ("MISCONF" or "READONLY" or "error")'
    windowMinutes: 30
    groupBy: host
    warn: ">= 10"
    sampleLimit: 5
`

const builtinPlaybookServiceMySQLYAML = `name: service-mysql
title: MySQL 服务基线（exporter 指标 + 服务日志）
kind: service
defaultScope: k8s
description: 检查 MySQL exporter 存活、活跃线程、慢查询增量、主从延迟，并扫描服务错误日志。
steps:
  - id: mysql_up
    title: MySQL exporter 存活
    source: prometheus
    scope: k8s
    expr: 'up{job=~".*mysql.*"}'
    crit: "< 1"
  - id: mysql_threads_running
    title: 活跃线程数
    source: prometheus
    scope: k8s
    expr: 'mysql_global_status_threads_running'
    warn: ">= 50"
    crit: ">= 100"
  - id: mysql_slow_queries
    title: 近 1h 慢查询增量
    source: prometheus
    scope: k8s
    expr: 'increase(mysql_global_status_slow_queries[1h])'
    warn: ">= 10"
  - id: mysql_slave_lag
    title: 主从复制延迟
    source: prometheus
    scope: k8s
    expr: 'mysql_slave_status_seconds_behind_master'
    warn: ">= 60"
    crit: ">= 300"
    unit: s
  - id: mysql_error_logs
    title: MySQL 服务错误日志
    source: vmlog
    query: 'app:mysql AND ("ERROR" or "error")'
    windowMinutes: 30
    groupBy: host
    warn: ">= 10"
    sampleLimit: 5
`

func builtinInspectPlaybooks() []InspectPlaybook {
	out := make([]InspectPlaybook, 0, 3)
	for _, raw := range []string{
		builtinPlaybookVMHostBaselineYAML,
		builtinPlaybookServiceRedisYAML,
		builtinPlaybookServiceMySQLYAML,
	} {
		var pb InspectPlaybook
		if err := yaml.Unmarshal([]byte(raw), &pb); err == nil && strings.TrimSpace(pb.Name) != "" {
			out = append(out, pb)
		}
	}
	return out
}
