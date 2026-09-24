# AI 巡检基础设施域扩展设计

## 目标

在现有统一 AI 巡检引擎中，把 vCenter、堡垒机、Headscale 与 Authentik 建成一等巡检域。每个域具有独立开关、立即巡检入口和报告历史，同时保留现有“平台级”聚合巡检与定时任务。

## 已有能力与边界

- vCenter 已有虚拟机资源、VM 事件与宿主机告警采集器；本次主要补齐独立执行和独立展示。
- 堡垒机、Headscale、Authentik 已有管理客户端和数据存储，不新建第二套连接配置。
- 规则引擎生成事实、状态和风险；判读模型只接收脱敏摘要，不接收密码、Token、SSH 私钥、会话内容或 Authentik 原始事件上下文。
- 只读角色维持现有限制；配置、立即执行和报告接口仍为管理员权限。
- 不改变历史 KV key。历史报告缺少 `domain` 时按 `platform` 读取。

## 体系结构

巡检执行请求增加 `domain`：`platform | vcenter | bastion | headscale | authentik`。`platform` 运行所有已启用采集器；指定域只运行该域，并生成 `InspectionReport.Domain` 对应的独立历史记录。定时任务继续执行 `platform`，避免四套调度器和重复模型调用。

每个采集器返回 `InspectionSection`，状态仅为 `ok | warn | fail | skip`。平台报告组合这些 section；独立报告只包含目标域的 section。API 列表支持 `?domain=` 服务端过滤，旧报告兼容为 `platform`。

## 域规则

### vCenter

复用现有 `inspectCollectVCenterSection` 与 `inspectCollectVCenterEventsSection`。未配置或 API 不可用为 `warn/fail`；资源压力、事件和宿主机告警沿用现有阈值。独立报告同时包含资源和事件两段。

### 堡垒机

读取 `VCenterBastionPolicy`，检查 ACL 是否启用、ACL 是否存在悬空目标、原生 SSH 端口配置、额外 SSH/RDP 主机 TCP 可达性、Linux 主机密钥固定策略及 RDP Web URL 的 HTTPS 安全性。连接检查使用短超时和巡检总 context；报告只显示目标名称、地址、端口及结论，不读取或输出凭据。

### Headscale

遍历已启用实例，执行健康检查并读取节点。统计在线率、过期节点、长时间离线节点、待审批路由、无效标签和重复地址；单实例失败不阻断其他实例。API Key 只在客户端构造时解密，绝不进入 Markdown 或 AI 输入。

### Authentik

遍历已启用实例，读取系统状态、对象计数和最近 50 条事件。聚合 `system_task_exception`、认证失败与高风险事件；事件用户为空时统一显示“系统任务”，并提取安全的 action/app/model 摘要。不得把事件原始 context、authorization、Token、Cookie 或凭据字段传入报告和模型。

## 配置与接口

- `OpsAIInspectConfig` 新增 `inspectBastion`、`inspectHeadscale`、`inspectAuthentik`；vCenter 继续使用现有开关。
- `POST /api/ops/inspect/run` 接受可选 JSON `{ "domain": "..." }`；空 body 保持平台巡检兼容。
- `GET /api/ops/inspect/reports?domain=...` 在分页前过滤。
- 任务快照和报告返回 `domain`，便于前端跳转正确页签。

## 前端

巡检配置页增加三个开关，并增加四张域卡片；每张卡片提供状态说明和“立即巡检”。报告页增加 vCenter、堡垒机、Headscale、Authentik 页签，复用统一报告卡片，按 domain 请求历史。所有新增组件支持暗色主题和窄屏布局。

## 测试与验收

- Go 单测覆盖域名规范化、历史报告兼容与过滤、堡垒机安全规则、Headscale 节点规则、Authentik 事件脱敏和异常聚合。
- 前端测试覆盖页签、配置开关和立即巡检请求域。
- 运行 Go test/build/vet、前端 test/typecheck/build。
- 手动验证平台巡检仍可运行，四个域可分别执行并进入对应报告页；未配置的域返回可理解的 `skip/warn`，不会导致整次任务失败。
