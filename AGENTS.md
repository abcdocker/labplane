# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

---

## 📌 项目背景 (Project Context)

本项目是一个自动化边缘网关同步工具，专为 HomeLab 和自建 Kubernetes 集群设计。

- **核心功能**：监听 K8s 集群中的 Ingress 资源，并自动将路由配置同步到云端宝塔 (Baota) 面板。
- **解决痛点**：绕过家庭宽带 80/443 端口限制，实现无缝、安全的公网 Web 访问。
- **关键特性**：Web 控制台集中监控、表单与 YAML 驱动配置、端到端 HTTPS 加密。

---

## 🛠 常用指令 (Commands)

```bash
# 代码检查
golangci-lint run

# 本地构建
go build -o labplane .

# 本地运行（会先构建 React 再启动 Go）
./run.sh

# 构建容器镜像
docker build -t labplane:latest .

# 部署到 K8s
kubectl apply -f deploy/
kubectl apply -f deploy/labplane-all.yaml  # 一键全量部署（NodePort 32080）

# Helm 安装
helm dependency build charts/labplane && helm install labplane ./charts/labplane

# 连通性检查工具（仅本地，不含于 Docker 镜像）
go run ./cmd/connectivity-check/
```

### 前端开发

```bash
cd react
npm install
npm run dev    # 开发服务器
npm run build  # 构建到 react/dist/（由 Docker 复制进镜像）
```

---

## 🏗 架构总览 (Architecture)

### 模块结构

```
labplane/
├── main.go                    # 入口：初始化 ServerApp，启动后台任务，启动 Gin Web 服务
├── cmd/connectivity-check/    # 独立 CLI 工具，验证 K8s/Baota 连通性
├── internal/                  # 全部 Go 业务逻辑（单一 package: internal，~290 个文件）
│   └── mesh_joingoing/        # Windows Tailscale 加入工具打包
├── react/                     # Vite + React + TypeScript + shadcn/ui 前端
├── deploy/                    # K8s 部署清单（RBAC、Deployment、Service、PVC、Kustomize）
├── charts/labplane/    # Helm Chart（子依赖 ingress-nginx/metallb 可选，需 helm dependency build）
├── templates/                 # Go HTML 模板（无 React 构建产物时的降级方案）
├── scripts/                   # 运维辅助脚本
├── compose.yaml               # MySQL + Redis + 控制台一键本地环境（配 scripts/init-compose-env.sh）
└── data/                      # 运行时数据目录（gitignored）
```

> **前置依赖**：MySQL 8.0+ 与 Redis 为必选（`/setup` 向导强校验）；K8s 连接可选（堡垒机/vCenter 等模块不依赖）。
>
> **internal/ 拆分路线**：单 package 已约 290 文件，新增代码应按域聚合成新子 package
> （先例：`internal/mesh_joingoing`）；存量代码在触及重构时逐步迁移，禁止一次性大规模搬移。

### 构建流程

Docker 三阶段构建：

1. **frontend** (node:20-alpine)：`npm ci && npm run build` → `react/dist/`
2. **builder** (golang:1.25.6-alpine)：`CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X github.com/abcdocker/labplane/internal.BuildVersion=${BUILD_VERSION}"` + 复制 React dist
3. **final** (distroless/static-debian12:nonroot)：仅含二进制 + helm + 静态资源，无 Shell

最终镜像暴露 `:8080`。探针端点：`GET /readyz`（就绪）、`GET /livez`（存活）、`GET /api/health`（聚合状态）。

> 品牌标识统一约定：Ingress 注解域 `labplane.io/*`、环境变量前缀 `LABPLANE_*`、
> Cookie 名 `labplane_session`、Prometheus 指标前缀 `labplane_`、K8s 标签
> `app.kubernetes.io/managed-by: labplane`，以及 leader 锁名、监控 namespace、
> ServiceAccount 和 server-side apply FieldManager 均使用 `labplane`。

---

## 🔄 核心同步流程 (Core Sync Workflow)

### Ingress → Baota 同步

**触发方式 1：周期轮询**（`internal/syncer.go`，`StartSyncer`）

每隔 `SYNC_INTERVAL_SEC`（默认 30 秒）：
1. 列出所有命名空间的 Ingress
2. 过滤带有注解 `labplane.io/baota-sync=true` 的 Ingress
3. 构建 `ProxyTarget{Domain, TargetURL, BaotaHTTPS, BaotaSSLCert}`
4. 调用 Baota API 幂等创建站点和反向代理（代理名 `k8s-{domain}`）
5. 若注解含 `baota-https=true`，追加部署证书和强制 HTTPS

**触发方式 2：事件驱动**（`internal/watcher.go`，`StartIngressWatcher`）

使用 SharedInformer 本地缓存监听 Ingress 变更，并将短时间内的连续变更合并为一次同步。
由 `internal/background_leader.go` 统一启动：多副本时仅 Leader（锁选举）运行
`StartSyncer` + `StartIngressWatcher`，其余副本禁用后台任务。

**Baota API 认证**（`internal/baota.go`）

每次请求计算 HMAC token：
```
md5Key = MD5(apiKey)
request_token = MD5(Unix秒时间戳 + md5Key)
```

**删除流程**（`internal/baota_delete.go`）

UI 触发删除（`deleteBaota=true`）→ 删除反向代理 → 查站点 ID → 删除站点。
失败时 `ScheduleBaotaDeleteRetry` 以 3s/8s/20s 退避重试（最多 3 次）。

### Ingress 注解约定

| 注解键 | 说明 |
|---|---|
| `labplane.io/baota-sync: "true"` | 标记为受管 Ingress（新版，推荐） |
| `labplane.io/baota-https: "true"` | 在 Baota 侧启用 HTTPS |
| `labplane.io/ddns-port: "PORT"` | 覆盖默认后端端口 |
| `labplane.io/baota-ssl-cert-name: "CERT"` | 指定 Baota 证书名 |

---

## ⚙️ 配置体系 (Configuration)

### 双层配置

1. **环境变量** → `LoadConfig()` → `Config` struct
2. **运行时 JSON** (`{dataDir}/runtime-config.json`) → `LoadRuntimeSettings()` → `MergeRuntimeConfig()` 覆盖 Config

Web 向导（`/setup`）写入运行时 JSON，`ServerApp.Reload()` 热重载所有连接，无需重启。

### 关键环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `LABPLANE_DATA_DIR` | `./data` | 持久化数据目录（挂 PVC） |
| `BAOTA_URL` | `http://127.0.0.1:8888` | 宝塔面板地址 |
| `BAOTA_API_KEY` | — | 宝塔 API 密钥 |
| `DDNS_HOST` | `home.example.com` | 家庭公网 DDNS 域名 |
| `DEFAULT_PORT` | `38333` | 默认反向代理目标端口 |
| `SYNC_INTERVAL_SEC` | `30` | 同步间隔（秒） |
| `INGRESS_BAOTA_SYNC_ENABLED` | `false` | **必须设为 true 才会同步** |
| `DASHBOARD_HTTP_ADDR` | `:8080` | 监听地址 |
| `DASHBOARD_PASSWORD` | — | 设置后启用本地密码登录 |
| `DASHBOARD_SESSION_SECRET` | 随机 | 多副本时必须固定一致 |
| `LABPLANE_ENCRYPTION_KEY` | — | SSH 凭据 AES 加密密钥 |
| `REDIS_ADDR` | — | Redis 地址（可选，用于 HA） |
| `MYSQL_DSN` | — | MySQL DSN（可选，用于多用户/多副本） |
| `PLATFORM_PUBLIC_URL` | — | 服务公网 URL（必填） |
| `LABPLANE_ENABLE_BACKGROUND_JOBS` | `true` | 多副本时非主节点设为 false |
| `LABPLANE_GOMAXPROCS` | OS 默认 | 对齐 K8s CPU limit 时使用 |
| `LABPLANE_PERFORMANCE_MODE` | `false` | 启用 Gin release 模式 + 命名空间缓存 |
| `VCENTER_URL/USER/PASSWORD` | — | VMware vCenter 连接 |
| `HARBOR_BASE_URL/USERNAME/PASSWORD` | — | Harbor 镜像仓库 |
| `OIDC_ISSUER_URL/CLIENT_ID/CLIENT_SECRET/REDIRECT_URL` | — | OIDC 登录（Authentik 等） |

---

## 🏛 关键类型与数据结构 (Key Types)

### `ServerApp`（`internal/server_app.go`）

中央应用状态，`sync.RWMutex` 保护，包含：K8s clientset、REST config、SSH 凭据存储、vCenter 客户端、RedisLight、MySQL、PlatformKV、RuntimeSettings。

`Reload()` 重新读取运行时配置并原子替换所有连接。

### `Config`（`internal/config.go`）

~100+ 字段，涵盖 Baota、DDNS、Dashboard 认证、OIDC、Prometheus、VictoriaMetrics、vCenter、Redis、MySQL、Harbor 的全部配置。

### `RuntimeSettings`（`internal/runtime_settings.go`）

持久化到 `{dataDir}/runtime-config.json`。Web 向导写入，`MergeRuntimeConfig` 覆盖环境变量。K8s 连接模式 (`incluster` / `kubeconfig` / `none`) 在此配置。

### `PlatformKV` 接口（`internal/platform_kv_iface.go`）

`Get(k) / Set(k,v) / Snapshot()` — 三种实现：文件 JSON、MySQL、Redis 热层包装。

### `RedisLight`（`internal/redis_light.go`）

零依赖的自定义 RESP 客户端（PING/GET/SET/DEL/INCR），用于运行时配置镜像和命名空间缓存。与 `go-redis/v9`（也是依赖）并存，各有用途。

---

## 📡 vCenter VM 抓包 (Packet Capture)

VM 详情页「抓包」标签（`react/src/pages/vcenter/capture/`，demo 见 `reports/packet-capture-demo-20260921/`）。

**后端文件**（均 `internal/vm_capture_*.go`，依赖 `github.com/google/gopacket`）：
`_engine.go`（SSH + `sudo -n tcpdump -i any -U -s N -w -` 流式回传，TeeReader 同时落盘与旁路解码）、`_analyze.go`（协议识别：RESP/SSH/HTTP/TLS-SNI/DNS/ICMP/ARP）、`_risk.go`（规则风险引擎）、`_decode.go`（pcap → 包列表/协议树/Hex）、`_ai.go`（AI 三件套）、`_handlers.go`（路由）。

**API**（`/api/vcenter/vms/:moref/captures`，全部 AdminOnly + bastion ACL + 审计）：
`GET ''`（列表/用量）、`GET /preflight`、`POST ''`（开始）、`POST /interpret`（AI 解读 BPF）、`GET|POST|DELETE /file/:name[/stop|/decode|/download|/ai-report|/ai-chat]`。

**限制**（常量在 `_engine.go`）：每 VM 1 并发、全局 3 并发、snaplen ≤1600、单文件 ≤128MiB、时长 ≤300s、保留 7 天 + 总配额 2GiB（`dataDir/captures/`，pcap 0600，sidecar `.meta.json` / `.ai.json`）。

**AI 分层**：统计/风险事实全部由 gopacket 解码 + 规则引擎产生（复用巡检 `OpsAIInspectConfig` 判读模型做文案增强，模型未启用时纯规则降级）；送入模型的上下文只含脱敏统计——**载荷与口令原文永不进入 AI 输入、日志或 finding 文本**（RESP AUTH 只报长度）。BPF 经黑名单字符校验（拒绝引号/反引号/$;/&|<> 等）后以单引号包裹执行，防 shell 注入。

**前端**：`VmCapturePanel.tsx`（预检/表单/实时双栏/历史表，运行态 1s 轮询 status 接口增量拉取预览行）、`PcapViewerDialog.tsx`（源文件三栏 + AI 报告 + 追问，「查看包 #N」可从报告跳回源文件视图并高亮）。

---

## 🔐 认证体系 (Auth)

### Session Token

HMAC-SHA256 签名，Cookie 名 `labplane_session`。
Payload：`user|role|expUnix|nonce|buildVersion`（base64 raw URL）。
**新部署后 BuildVersion 变更，所有旧 Token 自动失效。**

### 登录流程

1. 检查 IP 暴力破解状态（3 次失败要求验证码，20 次封禁 IP）
2. MySQL 平台用户（bcrypt）→ fallback 到环境变量 `DASHBOARD_USER/PASSWORD`
3. TOTP 已启用时返回中间步骤 Token
4. 检查用户 IP 白名单策略
5. 写入 Session Nonce 到 PlatformKV（单会话强制，可配置 allow_multi）

### 角色

- `admin`：完全访问
- `viewer`：只读，`/api/config` 响应中敏感字段被脱敏

---

## 🚀 K8s 部署要点 (Deployment)

### RBAC 权限

ClusterRole 需要：Ingress/Service/Pod/Deployment/StatefulSet/DaemonSet/PVC/ConfigMap/Secret 的读写权限，以及 Pod Exec、Pod Log 权限。

### 资源配置（生产推荐）

```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 1000m
    memory: 512Mi
```

### 健康检查

```yaml
readinessProbe:
  httpGet: { path: /api/health, port: 8080 }
  initialDelaySeconds: 5
  periodSeconds: 10
livenessProbe:
  httpGet: { path: /api/health, port: 8080 }
  initialDelaySeconds: 15
  periodSeconds: 30
```

### 多副本 HA

- 所有副本设置相同的 `DASHBOARD_SESSION_SECRET`
- 非主节点设 `LABPLANE_ENABLE_BACKGROUND_JOBS=false`（禁用 Baota 同步、告警等后台任务）
- 配置 MySQL + Redis 实现跨副本配置热同步（每 10 秒检测版本号变化，自动 Reload）

---

## 👨‍💻 开发者行为准则 (AI Assistant Rules)

1. **K8s 原生**：使用 `client-go` 官方库；状态追踪优先 `Informer/Lister`，禁止低效轮询。
2. **容错与限流**：所有外部 API 调用（Baota、K8s、vCenter）必须实现指数退避重试 + 超时控制。
3. **可观测性先行**：Ingress 变更检测、同步失败、证书更新等关键流程必须包含结构化日志。
4. **安全红线**：严禁在代码或日志中明文硬编码/打印 Baota API Key 或 TLS 私钥。
5. **并发控制**：批量同步任务使用 Goroutines 并发，必须引入 Rate Limiter 避免触发 Baota 限流。
6. **YAML 规范**：输出的 K8s 部署清单必须包含 `resources.requests` 和 `resources.limits`。
7. **前端规范**：i18n 采用增量迁移策略——新增/重构的模块使用 `react/src/i18n/` 下的 i18n 文件（先例：`i18n/setup.ts`、`i18n/mobile.ts`）；存量页面的硬编码中文在触及重构时迁移，不做一次性全量迁移。所有新组件必须使用 `dark:` 前缀支持暗色主题；路由级页面组件必须 `React.lazy`（先例见 `App.tsx`），防止重库进入首屏 chunk。
