# LabPlane 全量品牌迁移设计

## 目标

将尚未上线的项目从 `homelab-console` / `kube-bt-sync` 一次性硬切换为 **LabPlane**，覆盖产品文案、代码标识、运行配置、部署资源、前端视觉、登录页、图标与文档，不保留旧标识兼容层。

品牌口号：**Your HomeLab Control Plane**。

## 品牌系统

- 产品名：`LabPlane`
- 机器标识、二进制、镜像、Chart、Kubernetes 资源前缀：`labplane`
- Go module：`github.com/abcdocker/labplane`
- 环境变量前缀：`LABPLANE_`
- Ingress 注解域：`labplane.io/*`
- Cookie：`labplane_session`
- Prometheus 指标前缀：`labplane_`
- 数据表、KV、缓存等内部前缀：`labplane_`
- 主色：紫罗兰 `#7C3AED`，辅助色：青色 `#22D3EE`
- 图形语言：抽象控制平面、网格与连接节点，避免字面化飞机图案；扁平、清晰、适配亮色与暗色背景。

## 范围

1. Go module、import、编译 ldflags、日志、默认值、会话与存储标识。
2. Docker、Compose、Kubernetes、Helm、CI 工作流及脚本。
3. React 页面标题、PWA manifest、Service Worker、导航与所有品牌展示。
4. 登录页视觉改造；保留现有密码、验证码、TOTP、OIDC 与错误处理行为。
5. 维护一个可直接使用的 SVG 标志，并由它生成 favicon、Apple Touch Icon 与 PWA 位图。
6. README、AGENTS、示例配置和运维文档。

## 非目标

- 不改变业务 API 路径或功能语义。
- 不迁移或重构现有领域模块。
- 不自动发布镜像、部署集群或创建远端 GitHub 仓库。
- 不兼容旧 Cookie、旧环境变量、旧注解、旧指标或旧持久化键；项目未上线，可直接采用新标识。

## 登录页设计

登录页采用“控制平面”视觉：品牌标志、简洁的拓扑背景、明确的产品定位与聚焦的认证卡片。响应式布局在桌面端提供品牌说明区，在移动端收敛为单卡片；完整支持暗色模式、键盘操作和现有可访问性语义。

## 验收标准

- 受控源码、配置、部署文件和 README 中不再出现旧品牌标识。
- Go 测试、vet、构建通过。
- React lint/typecheck（如已配置）与生产构建通过。
- Helm lint/template 及 Kubernetes 清单解析通过。
- 新二进制可以实际启动，并通过存活探针验证。
- 生成的 favicon/PWA 图标与代码内 Logo 均展示 LabPlane 视觉。
