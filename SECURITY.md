# 安全政策

## 支持的版本

以下版本当前正在接受安全更新：

| 版本 | 支持状态 |
| :--- | :--- |
| latest / main | ✅ 支持 |
| 低于最新发布的 tag | ❌ 仅最新版本受支持 |

## 报告漏洞

**请不要通过公开的 GitHub Issue 报告安全漏洞。**

如果您发现了安全漏洞或敏感信息泄露（例如代码中的硬编码密钥、凭据或配置错误），请通过以下方式之一私下报告：

1. **GitHub 私有漏洞报告（首选）**：使用 [GitHub Security Advisories](../../security/advisories/new) 提交，维护者会收到通知并可在私有频道沟通。
2. **电子邮件**：发送至维护者邮箱（待填写：`security@example.com` 占位，公开前请替换为实际邮箱或删除本条）。

请在报告中包含以下信息：

- 漏洞类型（例如：信息泄露、注入、权限绕过等）
- 受影响的文件或组件
- 重现步骤或概念验证（PoC）
- 建议的修复方案（如有）

## 披露政策

- 收到报告后，维护者将在 **5 个工作日内**确认收到。
- 在漏洞修复发布之前，报告者和维护者将共同保密漏洞细节。
- 修复完成后，我们将发布安全公告并致谢报告者（如果您希望公开署名）。

## 安全最佳实践（部署建议）

### 1. 敏感配置通过 Secret / 环境变量注入

切勿将密码、API Key、私钥等直接写入镜像或 ConfigMap。建议：
- 使用 Kubernetes `Secret` + `envFrom` / `valueFrom` 注入。
- 生产环境禁用 `/setup` 向导（可通过网络策略限制），改用环境变量或 CI 预置配置。

### 2. 启用 HTTPS

- 通过 Ingress + cert-manager 或外部负载均衡提供 TLS 终止。
- 设置 `DASHBOARD_COOKIE_SECURE=true`。

### 3. 设置会话密钥

- 多副本部署时务必显式设置 `DASHBOARD_SESSION_SECRET`，否则 Pod 重启后会话失效。

### 4. 限制可信代理

- 设置 `DASHBOARD_TRUSTED_PROXIES` 为实际的上游代理 CIDR（如 Ingress Controller 的 Pod CIDR）。
- 裸机或公网直连时保持默认（不信任 X-Forwarded-For），防止 IP 伪造。

### 5. 网络隔离

- 使用 NetworkPolicy 限制本服务仅能与必要的 MySQL、Redis、vCenter、宝塔等端点通信。
- 后台 Job 副本（`LABPLANE_ENABLE_BACKGROUND_JOBS=true`）应限制为单副本，避免重复执行同步与巡检。

### 6. 数据目录权限

- PVC 挂载的数据目录建议 `fsGroup: 65532`（与镜像内 `nonroot` 用户一致）。
- SSH 凭据目录（`SSH_SETTINGS_DIR`）建议设置为 `0700` 权限。

## 已知安全注意事项

- **SSH 私钥**：当前 `SSH_SETTINGS_BACKEND=file` 模式下，私钥以文件形式存储在 PVC 上；请确保 PVC 的访问控制和备份策略符合安全要求。
- **运行时配置**：`runtime-config.json` 以 0600 权限原子写入，包含数据库凭据与加密密钥（登录密码为 bcrypt 哈希）；请确保其所在卷与快照/备份不被未授权读取。
- **vCenter / 宝塔凭据**：控制台管理员可查看和修改这些凭据；建议为控制台用户启用强密码或 OIDC，并限制管理员数量。

## 安全扫描已知误报定性

2026-09-24 Mimosa 深度扫描（sealed：`scan-2026-09-24T14-47-19.782Z-3ec0cca3bbb9`，124 条 finding）人工分流结论如下，后续扫描复现同类告警时可直接对照：

**确认为误报，无需修复：**

- `third_party/oss-mirror/`（Excalidraw 前端构建产物）：扫描器把 vendored 的压缩前端 JS 当作服务端代码分析，其中的 code-injection / command-injection / SSRF / mongo-sort-injection 告警全部为误报。建议未来为扫描器配置该目录排除。
- `internal/baota.go`、`internal/baota_delete.go`：MD5 为宝塔面板 API 规定的签名算法（`request_token = MD5(request_time + MD5(api_key))`），算法由上游厂商指定，替换为强哈希会导致对接失败；代理名截断处的 MD5 仅为生成定长标识，非安全用途。
- `internal/upyun_cloud_api.go`：又拍云 REST API 协议要求密码以 MD5 摘要参与 Basic Auth，同样为上游厂商协议约束。
- `internal/k8s_addons_kube_prometheus.go`、`internal/k8s_workload_linked_patch.go`：`exec.CommandContext` 直接分参调用（helm/kubectl），无 shell 字符串拼接，命令注入告警为误报。
- `internal/mysql_platform.go`：SQL 全部使用 `?` 参数化占位符，HTTP 输入 → SQL 执行的污点告警为误报。
- `internal/ssh_settings_store.go` `path()`：moref 经路径分隔符替换 + `..` 剥离映射为文件名，无法逃出数据目录。
- `internal/vm_capture_*`：抓包文件名经 `vmCaptureSafeName` 严格正则白名单 + moref 前缀绑定校验，无路径穿越。

**已修复（2026-09-24）：**

- `internal/ops_center_grafana.go` `readGrafanaDashboardFile`：此前 `uid` 路径参数未做字符集校验，登录用户可借 `../` 穿越读取 dataDir 下任意 `.json`（含 `runtime-config.json`）。现已按 Grafana UID 字符集白名单（`^[A-Za-z0-9_-]{1,64}$`）校验，与同步写入端同源。
