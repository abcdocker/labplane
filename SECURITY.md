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
