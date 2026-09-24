# Changelog

本项目所有显著变更记录于此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [Semantic Versioning](https://semver.org/spec/v2.0.0.html)。

## [v2.0.0] - 2026-09-24（LabPlane 开源首发）

### Brand

- 首发品牌统一为 **LabPlane — Your HomeLab Control Plane**。
- Go module、二进制、镜像、Kubernetes 资源、Helm Chart 与前端包统一使用 `labplane`。
- Ingress 注解域使用 `labplane.io/*`，环境变量使用 `LABPLANE_*`，Cookie 使用
  `labplane_session`，Prometheus 指标与数据存储使用 `labplane_` 前缀。
- 新增分层控制平面 Logo、favicon、PWA 图标，并重构登录页品牌视觉。

### Fixed

- **构建版本注入失效**：Dockerfile 与 release workflow 现统一注入
  `github.com/abcdocker/labplane/internal.BuildVersion`，避免镜像版本恒为 `dev`。
- 前端 ESLint 7 个 error 清零（全角空白字符、空 catch 块），CI lint 恢复绿色
- 移动端布局侧栏品牌名硬编码旧名（桌面端已改、移动端遗漏）

### Security

- 新增全局安全响应头中间件：CSP（含 WebSocket / 文档中心 CDN / blob worker 白名单）、
  `X-Frame-Options: SAMEORIGIN`、`X-Content-Type-Options: nosniff`、`Referrer-Policy`
- RBAC 收窄开关（Helm）：`rbac.allowClusterSecretRead`（全命名空间 Secret 只读）、
  `rbac.readAllClusterResources`（`*/*` 兜底只读），默认保持开启不破坏现有功能，
  生产收窄指引见 README 安全章节与 `deploy/rbac.yaml` 头部注释
- README 新增安全须知：`runtime-config.json`（0600 落盘）备份访问控制、
  加密密钥丢失不可恢复提示

### Performance

- 前端首屏体积从约 2.9MB（gzip 850KB）降至约 1.16MB raw / 330KB gzip：
  - 39 个页面组件从静态 import 改为 `React.lazy` 路由级懒加载
  - AI 助手弹窗的 markdown 渲染链（react-markdown/katex）改为打开时加载
  - Vite `manualChunks` 仅对首屏稳定依赖分组，重型库随路由 chunk 自然分割

### Documentation

- README 修正 MySQL/Redis 为必选前置依赖（原文误标 Optional），新增 docker compose
  一键依赖环境路径与离线 Helm 依赖打包说明
- AGENTS.md：修正 Ingress watcher 描述（SharedInformer + 变更合并 + Leader 单活，
  早已启用）、健康检查端点（`/readyz` `/livez` `/api/health`）、i18n 增量迁移策略、
  internal/ 拆分路线与品牌标识约定
- NOTES.txt：Helm 离线安装与 MySQL/Redis 必选依赖提示

### Chores

- 清理 `.playwright-mcp/` 会话残留并加入 .gitignore
- 品牌 UI 全量统一：浏览器 title、PWA manifest、Setup/登录/移动端侧栏、
  TOTP issuer、告警邮件标题、CLI 帮助文本、生成脚本注释
