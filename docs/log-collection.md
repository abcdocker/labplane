# 日志采集接入约定

日志链路统一为：

```text
业务系统日志文件 / stdout
  → Vector（采集、补充来源字段）
  → VictoriaLogs /insert/jsonline
  → labplane /api/ops/vmlog/search
  → 日志查询页
```

## 统一字段

| 字段 | 必填 | 说明 |
|---|---:|---|
| `_time` | 是 | 日志时间，由 VictoriaLogs 或采集器写入 |
| `_msg` | 是 | 原始日志正文 |
| `log_source` | 是 | 稳定的系统来源 ID，例如 `baota-nginx` |
| `vm_host` | 主机日志必填 | 稳定的主机名或资产名 |
| `kubernetes.namespace_name` | Pod 日志建议 | Kubernetes 命名空间 |
| `kubernetes.pod_name` | Pod 日志建议 | Pod 名称 |

`log_source` 和 `vm_host` 是流字段。不要把请求 ID、用户 ID等高基数字段设为流字段。

## 新增一种主机系统

只需在 `internal/ops_vmlog_sources.go` 的 `vmLogCollectorProfiles()` 增加一个 profile：

```go
{
    ID:           "my-service",
    Label:        "我的服务",
    Description:  "采集我的服务运行日志",
    DefaultPaths: []string{"/opt/my-service/logs/*.log"},
    LogSource:    "my-service",
    QuerySource:  "appcenter",
},
```

保存并发布后，“日志采集”页会自动出现该模板。脚本生成、SSH 安装、运行状态检查和入库验证沿用通用 Vector 流程，不需要再改 React。

如果只是临时接入，直接在页面选择“自定义”，填写日志绝对路径即可。

## API

- `GET /api/ops/vmlog/sources`：查询来源、采集模板和字段约定。
- `POST /api/ops/vmlog/search`：统一日志搜索；支持容器、虚拟机、访问、应用、巡检、平台等数据集，以及级别、主机、命名空间、Pod、字段、关键词、时间窗和分页。
- `POST /api/ops/vmlog/openclaw-analyze`：按照当前数据集和字段筛选结果生成 AI 日志分析。
- `POST /api/ops/vmlog/vm-shipper/script`：生成 Vector 配置和安装脚本。
- `POST /api/ops/vmlog/vm-shipper/apply`：使用已保存 SSH 凭据后台安装。

查询页左侧字段列表来自当前结果的字段统计。除预置字段外，可选择“自定义字段”并填写
`trace_id`、`http.status_code` 等 VictoriaLogs 字段名；字段名会在服务端校验后再拼入 LogsQL。
