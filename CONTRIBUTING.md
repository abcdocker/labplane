# 贡献指南

感谢你对 LabPlane 的兴趣！我们欢迎 Issue、Pull Request 和改进建议。

## 如何贡献

### 报告问题

1. 在提交 Issue 之前，请先搜索现有 Issue，避免重复。
2. 使用对应的 Issue 模板（Bug 报告、功能请求）。
3. 对于**安全漏洞**，请遵循 [SECURITY.md](./SECURITY.md) 中的私下报告流程。

### 提交 Pull Request

1. **Fork** 本仓库并创建你的分支（`git checkout -b feat/my-feature`）。
2. 确保你的代码符合项目现有风格：
   - **Go**：遵循标准 `gofmt`，保持简洁注释。
   - **React / TypeScript**：使用项目内已有的 ESLint + Prettier（如有）配置。
3. 如果是功能改动，请在相关模块添加或更新测试。
4. 确保本地构建通过：
   - 后端：`go build ./...`
   - 前端：`cd react && npm ci && npm run build`
5. 提交信息请使用中文或英文，清晰描述改动内容。
6. 在 PR 描述中说明改动的动机、方案以及潜在影响。

### 开发环境搭建

```bash
# 1. 克隆仓库
git clone https://github.com/abcdocker/labplane.git
cd labplane

# 2. 启动后端 + 前端（一键脚本）
./run.sh

# 3. 单独开发前端（热更新）
cd react
npm ci
npm run dev
```

> 前端开发时若端口被占用，参考 `run.sh` 提示设置 `VITE_DEV_API_TARGET` 指向后端实际端口。

### 项目结构速览

```
labplane/
├── cmd/                    # 独立工具（如连通性检查）
├── internal/               # Go 后端核心代码
│   ├── *.go                # HTTP Handler、业务逻辑
│   ├── config.go           # 环境变量与运行时配置解析
│   ├── mysql_*.go          # MySQL 表结构与数据访问
│   ├── runtime_*.go        # runtime-config / platform_kv 管理
│   └── ...
├── react/                  # React + TypeScript + Vite 前端
├── deploy/                 # Kubernetes 原生部署清单
├── charts/                 # Helm Chart
├── helm/                   # 旧版 Helm（逐步迁移至 charts/）
├── docs/                   # 运维与扩展文档
└── templates/              # Go HTML 模板
```

### 代码审查

- 所有 PR 需要至少 1 位维护者的审查。
- CI 检查通过后才会被合并。
- 大型改动建议先开 Issue 讨论方案，避免返工。

## 行为准则

本项目遵循 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。参与即表示你同意遵守其中条款。

## 许可证

通过提交 PR，你同意你的贡献将在 [MIT License](./LICENSE) 下发布。
