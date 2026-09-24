# MetalLB 与 Ingress-Nginx（可选组件）

**labplane 镜像内不包含** MetalLB 与 ingress-nginx 二进制或 Helm chart。若你的集群已具备云厂商 LoadBalancer 或自有入口方案，可跳过本文。

**可选**：在控制台以 **admin** 登录后，「集群设置」→「Ingress 与 MetalLB」可对当前已连接的集群 **自动检测** 与 **一键应用** 官方 `metallb-native.yaml`、ingress-nginx bare metal 清单，并写入 `IPAddressPool` / `L2Advertisement`；ingress 控制器 HTTP **NodePort** 默认 **31333**（Kubernetes 仅允许 **30000–32767**，不可使用宝塔 defaultPort 常见的 **38333** 等超出上限的值）。**MetalLB 地址池**可写在运行时 `metallbAddressPool`；未写时接口会根据**节点内网 IPv4** 生成**建议段**（如 `x.y.z.240-x.y.z.250`），安装时亦可**自动采用**（务必确认与 DHCP、现有服务不冲突）。运行时配置或环境变量 `LABPLANE_K8S_ADDONS_MANIFEST_MIRROR` 可选：`auto`、`ghproxy_preferred`（国内推荐）、`direct`、`ghproxy_only`；亦可填写完整 `metallbManifestUrl` / `ingressNginxManifestUrl` 指向内网镜像。与手动 `kubectl` 等价，仍须自行评估变更风险。

以下适用于：**裸金属 / 自建集群** 需要为 `Service type=LoadBalancer` 分配可达 IP，以及需要标准 **Ingress** 控制器处理 `Ingress` 资源的场景。

---

## 1. 自检：是否已安装

在可执行 `kubectl` 的环境运行：

```bash
# MetalLB（常见命名空间 metallb-system）
kubectl get pods -n metallb-system 2>/dev/null || echo "未检测到 metallb-system 命名空间"

# ingress-nginx（常见命名空间 ingress-nginx）
kubectl get pods -n ingress-nginx 2>/dev/null || echo "未检测到 ingress-nginx 命名空间"
```

若对应命名空间下已有 `Running` 的 Pod，通常表示已安装（具体以集群实际为准）。

---

## 2. MetalLB

**作用**：为 `type: LoadBalancer` 的 Service 分配**与节点二层互通**的 IP 段（常用 **L2 模式**），适合无公有云 LB 的环境。

**官方文档**：[https://metallb.io/installation/](https://metallb.io/installation/)

### 2.1 安装控制器（示例：官方原生清单）

版本号请在上游仓库 [releases](https://github.com/metallb/metallb/releases) 核对后替换下面 URL 中的标签。

```bash
# 示例：安装 MetalLB 原生清单（请替换为当前稳定版本）
export METALLB_VERSION=v0.14.9
kubectl apply -f "https://raw.githubusercontent.com/metallb/metallb/${METALLB_VERSION}/config/manifests/metallb-native.yaml"
```

等待 `metallb-system` 下控制器就绪：

```bash
kubectl wait --namespace metallb-system \
  --for=condition=ready pod \
  --selector=app=metallb \
  --timeout=120s
```

### 2.2 配置地址池与 L2 宣告（必做）

将 `addresses` 改为**你内网中空闲、且与节点同网段可达**的 IP 或范围（勿与 DHCP/网关冲突）。

保存为 `metallb-pool.yaml` 后执行 `kubectl apply -f metallb-pool.yaml`：

```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: default-pool
  namespace: metallb-system
spec:
  addresses:
    - 192.168.1.240-192.168.1.250   # 按实际修改
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: default
  namespace: metallb-system
spec:
  ipAddressPools:
    - default-pool
```

**Helm** 安装方式见官方文档；不同 MetalLB 大版本 CRD 字段可能略有差异，以当前版本说明为准。

---

## 3. Ingress-Nginx

**作用**：集群内 **Ingress** 资源的默认实现之一（Nginx 数据面），与宝塔侧「同步 Ingress」、控制台通过 Ingress 暴露服务等能力配合时，通常需要集群内存在 **IngressClass**（如 `nginx`）。

**官方文档**：[https://kubernetes.github.io/ingress-nginx/deploy/](https://kubernetes.github.io/ingress-nginx/deploy/)

### 3.1 安装（示例：官方静态清单）

控制器版本更新频繁，请打开官方 **Installation Guide** 中 **Bare-metal** / **Cloud** 对应链接，使用页面给出的 `kubectl apply -f https://...` 地址（勿长期固定过时版本）。

通用形态示例（**需自行替换为官方当前 URL**）：

```bash
kubectl apply -f <官方文档提供的 deploy.yaml 完整 URL>
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s
```

### 3.2 与 LoadBalancer / NodePort

- 若已安装 **MetalLB**，可将 ingress-nginx Service 设为 `LoadBalancer`，由 MetalLB 分配外部 IP。
- 若无 LB，常用 **NodePort** 或 **hostNetwork**（按官方与集群安全策略选择）。

---

## 4. 与本平台的关系

| 能力 | 依赖说明 |
| :--- | :--- |
| 控制台 **NodePort** 暴露（如 `deploy` 中 32080） | **不依赖** MetalLB / ingress-nginx。 |
| 应用中心等为 Service 申请 **LoadBalancer IP** | 无公有云 LB 时通常需 **MetalLB**（或等价方案）。 |
| **Ingress** 列表、与宝塔同步、部分应用创建 Ingress | 通常需集群内 **Ingress Controller**（如 **ingress-nginx**）。 |

在 Web 控制台 **Kubernetes → 集群设置** 页面可查看与本文一致的摘要与自检命令；安装与升级请在集群侧用 `kubectl` / Helm **手动**完成。

---

## 5. 参考链接

- MetalLB：[https://metallb.io/](https://metallb.io/)
- ingress-nginx：[https://kubernetes.github.io/ingress-nginx/](https://kubernetes.github.io/ingress-nginx/)
