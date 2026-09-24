# Kubernetes Dashboard 部署与独立 Prometheus 对接说明

本文说明如何**不依赖 KubeSphere 内置监控**，在集群中部署 **Kubernetes 官方 Dashboard**，并通过命令行**自行识别**现有的 **Prometheus** 与常见**采集组件**；同时说明如何与 **labplane** 的 `prometheusUrlK8s` 等指标查询能力对接。

> **说明**：文档无法代替对你集群的实时扫描。文中「识别」一节提供可复制执行的 `kubectl` 命令，你在有权限的机器上运行后即可得到本集群的实际 Service、命名空间与标签。

---

## 1. 角色分工（避免混淆）

| 组件 | 作用 |
|------|------|
| **Kubernetes Dashboard** | 通过 K8s API 管理/查看工作负载、事件、日志等；Pod 列表上的 **CPU/内存用量**依赖集群内的 **metrics-server**（或历史版本中的 metrics-scraper）。 |
| **Prometheus** | 长期存储与时序查询（PromQL）；**完整集群指标**（节点、Pod、cAdvisor、kube-state-metrics、自定义业务等）在 Prometheus 中。 |
| **labplane** | 在「集群 → 监控」等页面**代理查询**你配置的 `prometheusUrlK8s`（或 VictoriaMetrics vmselect）；与 Dashboard **互不替代**，可并存。 |

结论：**Dashboard 管控制面操作 + 基础用量**；**完整指标**在 **Prometheus（+ Grafana）**；**labplane** 填对 Prometheus 地址即可在平台内看图/巡检。

---

## 1.1 labplane 集群设置：一键安装（国内镜像）

在 **Kubernetes 工作区 → 集群设置**（`/cluster/settings`）中，管理员可使用 **「Kubernetes Dashboard · metrics-server（国内镜像）」** 卡片完成安装与状态自检。

| 项目 | 说明 |
|------|------|
| **安装内容** | [metrics-server v0.7.2](https://github.com/kubernetes-sigs/metrics-server/releases/tag/v0.7.2) 的 `components.yaml`；[Kubernetes Dashboard v2.7.0](https://github.com/kubernetes/dashboard/tree/v2.7.0) 的 `aio/deploy/recommended.yaml`；以及平台创建的 ServiceAccount **`labplane-dashboard-admin`**（绑定 **cluster-admin**，仅便于登录演示，**生产请改为最小权限**）。 |
| **清单下载** | 与 **ingress-nginx 一键安装** 相同：由运行时 `k8sAddonsManifestMirror`（或请求体 `manifestMirror`）控制，依次尝试 jsDelivr、多条 ghproxy、直连等；单线超时约 90s 换线。 |
| **镜像改写** | `registry.k8s.io/` → `m.daocloud.io/registry.k8s.io/`；`kubernetesui/` → `m.daocloud.io/docker.io/kubernetesui/`。与 ingress 共用「跳过 K8s 镜像改写」类开关时（如 `INGRESS_NGINX_SKIP_K8S_REGISTRY_MIRROR=true`）则**不做**改写，需自备可拉取的镜像仓库。 |
| **kubelet 证书** | 页面默认勾选为 metrics-server 注入 **`--kubelet-insecure-tls`**（国内自签 kubelet 常见需要）；正规 CA 环境可取消勾选。 |
| **API** | `POST /api/k8s/addons/dashboard-monitoring/install`（管理员）；安装后轮询 Deployment 就绪，响应体含 `verification`。 |
| **仅自检** | `GET /api/k8s/addons/dashboard-monitoring/verify?maxWaitSec=180` |
| **聚合状态** | `GET /api/k8s/addons/status` 的 JSON 中增加 **`metricsServer`**、**`kubernetesDashboard`** 字段（与 ingress 状态并列）。 |

**重要**：本功能**不会**自动配置 **`prometheusUrlK8s` / `vmSelectUrlK8s`**。平台「集群 → 监控」等页的 PromQL 数据源仍在集群设置中单独维护，与 Dashboard Web UI **独立**。

**手动安装**（与平台改写规则一致的可复制步骤）见集群设置页该卡片底部文本框；亦可参考下文第 3、4 节自行 `kubectl apply` 与 `sed` 替换镜像前缀。

### 1.2 kube-prometheus-stack：平台一键安装（推荐 · 对齐监控页 PromQL）

在 **集群设置** 中另有 **「kube-prometheus-stack（全栈监控 · 国内镜像）」** 卡片：使用镜像内 **Helm**（`/app/helm`）对官方 chart 执行 `helm template`，将渲染结果中的 `quay.io` / `gcr.io` / `registry.k8s.io` / `docker.io` 等前缀改写为 DaoCloud 加速后，由 **client-go** 应用到集群。

| 项目 | 说明 |
|------|------|
| **命名空间** | `labplane-monitoring`（避免与用户已有 `monitoring` 冲突） |
| **包含** | Prometheus Operator、Prometheus、默认 **ServiceMonitor**（含 kubelet/cAdvisor）、**kube-state-metrics**、**node-exporter**；可选 Grafana / Alertmanager（勾选） |
| **托管集群** | values 中已关闭 `kubeControllerManager` / `kubeScheduler` / `kubeEtcd` 抓取，减少无效告警 |
| **API** | `POST /api/k8s/addons/kube-prometheus-stack/install`（管理员） |
| **自动数据源** | 默认将运行时 **`prometheusUrlK8s`** 设为发现的 Prometheus Service（`http://<svc>.labplane-monitoring.svc:9090`），并可清空 **`vmSelectUrlK8s`** |
| **自检** | `GET /api/k8s/addons/kube-prometheus-stack/verify?maxWaitSec=600` |
| **状态** | `GET /api/k8s/addons/status` 的 **`kubePrometheusStack`** 字段 |

若 **labplane 进程不在目标集群内**，集群 DNS 无法解析 `.svc` 时，请在安装后把 `prometheusUrlK8s` 改为 **Ingress / NodePort / 端口转发** 可达地址。

---

## 2. 在集群内识别 Prometheus 与采集器

在有 `kubectl` 且能访问目标集群的环境执行（按需加 `-n <命名空间>`）。

### 2.1 Prometheus 自定义资源（Prometheus Operator）

```bash
kubectl get prometheuses.monitoring.coreos.com -A
kubectl get prometheusagents.monitoring.coreos.com -A 2>/dev/null || true
```

有输出时：记录 **命名空间** 与 **名称**（例如 `monitoring/k8s`、`monitoring/prometheus-kube-prometheus-prometheus`）。

### 2.2 Prometheus Pod / Service（不依赖 CR 名）

```bash
kubectl get pods -A -l app.kubernetes.io/name=prometheus
kubectl get svc -A | grep -i prometheus
kubectl get svc -A | grep -E '9090|prometheus'
```

常见：Service 名含 `prometheus-k8s`、`prometheus-operated`、`kube-prometheus-stack-prometheus` 等。

### 2.3 集群内访问 URL（给 labplane / Grafana 用）

在 **平台 Pod 或同集群客户端** 内，Prometheus HTTP 根地址一般为：

```text
http://<service>.<namespace>.svc:<port>
```

示例（以你 `kubectl get svc` 为准）：

```text
http://prometheus-k8s.monitoring.svc:9090
http://kube-prometheus-stack-prometheus.monitoring.svc:9090
```

端口多为 **9090**；若 Service 为 `ClusterIP` 且无端口名，以 `kubectl get svc -n <ns> <name> -o yaml` 为准。

### 2.4 常见「采集链路」组件（对照自查）

执行下面命令，根据标签/名称判断你是否已具备「较完整」的集群指标链路：

```bash
# kube-state-metrics（Deployment/Pod 元数据、副本、状态等）
kubectl get pods -A -l app.kubernetes.io/name=kube-state-metrics
kubectl get svc -A | grep -i kube-state-metrics

# node-exporter（节点 CPU/内存/磁盘等）
kubectl get pods -A -l app.kubernetes.io/name=prometheus-node-exporter
kubectl get ds -A -l app.kubernetes.io/name=prometheus-node-exporter

# Prometheus Operator 本体
kubectl get deploy -A | grep -i prometheus-operator

# ServiceMonitor / PodMonitor（声明式采集目标）
kubectl get servicemonitor -A 2>/dev/null | head -50
kubectl get podmonitor -A 2>/dev/null | head -20
```

**对照表（kube-prometheus / kube-prometheus-stack 常见）**

| 组件 | 典型用途 |
|------|----------|
| **prometheus-operator** | 管理 Prometheus、Alertmanager、ServiceMonitor 等 CR |
| **prometheus**（StatefulSet/Pod） | 存储与查询时序数据 |
| **node-exporter**（DaemonSet） | 节点机器级指标 |
| **kube-state-metrics** | K8s 对象状态指标（Deployment、Pod、PVC…） |
| **kubelet/cAdvisor** | 容器 CPU/内存/网络等（经 kubelet 10250 或对应 ServiceMonitor） |
| **alertmanager** | 告警路由（可选） |

若缺少 **kube-state-metrics** 或 **node-exporter**，Prometheus 里集群/节点维度指标会明显不全，需要在现有栈中启用或单独安装（取决于你当前用的是 Helm chart 还是手工清单）。

---

## 3. 安装 metrics-server（Dashboard 用量条前提）

若 `kubectl top nodes` / `kubectl top pods` 不可用，先安装 [metrics-server](https://github.com/kubernetes-sigs/metrics-server)：

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

**国内节点拉取镜像**：可先下载 YAML，再将 `registry.k8s.io/` 替换为 `m.daocloud.io/registry.k8s.io/`（或其它企业内镜像前置）后再 `kubectl apply -f`。固定版本示例与 **labplane 一键安装** 对齐时为 **v0.7.2**。

部分集群需在 `metrics-server` Deployment 中增加参数（示例，按环境二选一）：

- 私有证书：`--kubelet-insecure-tls`
- 自定义 kubelet 地址等：见官方故障排查文档

验证：

```bash
kubectl top nodes
```

---

## 4. 部署 Kubernetes Dashboard

上游说明（截至 2026）：**Kubernetes Dashboard 仓库已归档、不再积极维护**；**7.0.0 起仅支持 Helm 安装**（已放弃单文件 `recommended.yaml` 方式）。若你希望使用 **SIG-UI 主推、仍在演进的 Web UI**，可考虑 **[Headlamp](https://github.com/kubernetes-sigs/headlamp)**，部署方式见该项目文档；下文仍以 **Dashboard + Helm** 为主，便于与常见教程对齐。

### 4.1 使用 Helm（推荐、与当前上游一致）

```bash
helm repo add kubernetes-dashboard https://kubernetes.github.io/dashboard/
helm repo update
helm upgrade --install kubernetes-dashboard kubernetes-dashboard/kubernetes-dashboard \
  --namespace kubernetes-dashboard --create-namespace
```

Chart 参数与 Kong 网关前置方式见 [Artifact Hub：kubernetes-dashboard](https://artifacthub.io/packages/helm/k8s-dashboard/kubernetes-dashboard) 及仓库内 `charts/kubernetes-dashboard/values.yaml`。

若内网无法 `helm repo add`，可将 chart 打包导入私有 Helm 仓库后再安装。

### 4.2 历史环境：旧版清单安装（仅适用于已锁版本的老集群）

仅在集群**固定使用 Dashboard 6.x 及以下**且仍保留 `aio/deploy/recommended.yaml` 的发行标签时，才可使用 `kubectl apply -f`；**新部署请用 4.1 的 Helm**。具体标签以 [kubernetes/dashboard releases](https://github.com/kubernetes/dashboard/releases) 为准。

安装后：

```bash
kubectl get pods -n kubernetes-dashboard
kubectl get svc -n kubernetes-dashboard
```

### 4.3 暴露访问方式（择一）

**kubectl proxy / API 代理（调试）**

新版经 **Kong** 暴露 Service，路径与 Service 名以 `kubectl get svc -n kubernetes-dashboard` 为准；亦可查阅上游 [Accessing Dashboard](https://github.com/kubernetes/dashboard/blob/master/docs/user/accessing-dashboard/README.md)。

旧版（v2 清单）典型示例：

```bash
kubectl proxy
# 路径示例（仅旧版）：https://github.com/kubernetes/dashboard/blob/master/docs/user/accessing-dashboard/README.md
```

**Ingress + TLS（生产常用）**

- 为 `kubernetes-dashboard` Service 创建 Ingress，配置证书与域名；
- 严格限制来源 IP 或前置 SSO/OIDC。

**NodePort / LoadBalancer**

- 仅建议在隔离网络中使用，并配合防火墙与强认证。

---

## 5. 登录与 RBAC（必读）

Dashboard **必须使用具有权限的 Token 或 kubeconfig**，不要使用过度放权的 ClusterRole 到生产。

### 5.1 创建只读或管理员 ServiceAccount（示例：命名空间级只读）

按需修改 Role/ClusterRole；以下为**示例**，生产请按最小权限裁剪。

```bash
kubectl create serviceaccount dashboard-user -n kubernetes-dashboard
kubectl create clusterrolebinding dashboard-user-binding \
  --clusterrole=cluster-admin \
  --serviceaccount=kubernetes-dashboard:dashboard-user
```

获取 Token（Kubernetes 1.24+ 使用 Secret 方式）：

```bash
kubectl create token dashboard-user -n kubernetes-dashboard --duration=24h
```

将 Token 粘贴到 Dashboard 登录页。

---

## 6. 与 labplane 对接 Prometheus（不用 KubeSphere 监控）

1. 用 **第 2 节**命令确认 **Prometheus 的集群内 Service URL**（含端口）。
2. 在 labplane **运行时配置**中设置：
   - `prometheusUrlK8s`：上述根地址，例如 `http://prometheus-k8s.monitoring.svc:9090`
   - 若 Prometheus 需要认证：配置 `prometheusBearerToken` 或按你环境使用 Ingress + 平台侧 TLS（与现有 `prometheusSkipTls` 等一致）。
3. 若使用 **VictoriaMetrics**，可将 vmselect 的 Prometheus 兼容根地址填到同一字段（与仓库内说明一致）。

这样 **labplane 集群监控页**走你的独立 Prometheus，与 KubeSphere 解耦。

---

## 7. 可选：Grafana 与「完整指标」可视化

Prometheus UI 适合 PromQL；日常大盘常用 **Grafana**：

- 与现有 Prometheus 同栈时，通常已有 Grafana Service，例如：
  - `http://kube-prometheus-stack-grafana.monitoring.svc:80`
- 数据源 URL 填 **Prometheus 的集群内 URL**（同上）。

---

## 8. 卸载或停用 KubeSphere 监控（谨慎）

若完全不用 KubeSphere 监控组件：

- 在 **KubeSphere 控制台**关闭监控插件，或按 KubeSphere 版本文档卸载对应 Helm Release / 资源；
- 避免与新的 `monitoring` 命名空间 Prometheus **抓取目标重复**导致数据翻倍（可通过 ServiceMonitor 的 `namespaceSelector` 与 `release` 标签管理）。

**不要在未备份**的情况下直接删除整个 `kubesphere-monitoring-system`，除非你确认无其他依赖。

---

## 9. 故障排查速查

| 现象 | 方向 |
|------|------|
| Dashboard 无 CPU/内存柱条 | 检查 **metrics-server** 与 `kubectl top` |
| labplane 提示无法查询 | 检查 `prometheusUrlK8s`、网络策略、Prometheus 是否仅监听 localhost |
| PromQL 缺指标 | 检查 **node-exporter**、**kube-state-metrics**、对应 **ServiceMonitor** 是否就绪 |
| Operator 报 Prometheus CR not found | 属 **KubeSphere / 旧监控栈** 问题，与 Dashboard 独立部署无直接关系，需按集群修复 CR 或重装监控插件 |

---

## 10. 版本与链接

- Kubernetes Dashboard：<https://github.com/kubernetes/dashboard>
- metrics-server：<https://github.com/kubernetes-sigs/metrics-server>
- Prometheus Operator：<https://github.com/prometheus-operator/prometheus-operator>
- kube-prometheus-stack（Helm）：<https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack>

将本文第 2 节命令输出（可打码）保存为附件，即可作为你集群的「Prometheus 与采集器识别结果」存档。
