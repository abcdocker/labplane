/** 命名空间工作流下的资源类型（与 URL 段一致） */
export type ClusterScopedResource =
  | "pods"
  | "deployments"
  | "statefulsets"
  | "daemonsets"
  | "services"
  | "ingresses"
  | "pvcs"
  | "configmaps"
  | "secrets";

export const SCOPED_RESOURCE_KEYS: ClusterScopedResource[] = [
  "pods",
  "deployments",
  "statefulsets",
  "daemonsets",
  "services",
  "ingresses",
  "pvcs",
  "configmaps",
  "secrets",
];

/** 命名空间工作区：按 NS 筛选，不含 Pod（Pod 使用全集群或「本命名空间 Pod」入口） */
export type NamespaceWorkspaceResource = Exclude<ClusterScopedResource, "pods">;

export const NAMESPACE_WORKSPACE_KEYS: NamespaceWorkspaceResource[] = [
  "deployments",
  "statefulsets",
  "daemonsets",
  "services",
  "ingresses",
  "pvcs",
  "configmaps",
  "secrets",
];

export const WORKSPACE_NAV_GROUPS: {
  title: string;
  items: NamespaceWorkspaceResource[];
}[] = [
  { title: "工作负载", items: ["deployments", "statefulsets", "daemonsets"] },
  { title: "网络", items: ["services", "ingresses"] },
  { title: "存储", items: ["pvcs"] },
  { title: "配置与密钥", items: ["configmaps", "secrets"] },
];

export const RESOURCE_TAB_META: {
  key: ClusterScopedResource;
  /** 主标题 */
  title: string;
  /** API 与说明（尽量详细） */
  detail: string;
}[] = [
  {
    key: "pods",
    title: "Pod",
    detail: "core/v1 Pod · 最小调度单元 · 容器组",
  },
  {
    key: "deployments",
    title: "Deployment",
    detail: "apps/v1 Deployment · 无状态副本集 · 与 ReplicaSet / Pod 关联",
  },
  {
    key: "statefulsets",
    title: "StatefulSet",
    detail: "apps/v1 StatefulSet · 有状态副本集 · 稳定网络标识",
  },
  {
    key: "daemonsets",
    title: "DaemonSet",
    detail: "apps/v1 DaemonSet · 每节点一组 Pod · 日志采集与网络插件常见",
  },
  {
    key: "services",
    title: "Service",
    detail: "core/v1 Service · ClusterIP / NodePort / LB · 服务发现与负载均衡",
  },
  {
    key: "ingresses",
    title: "Ingress",
    detail: "networking.k8s.io/v1 Ingress · HTTP 路由 · 与后端 Service 关联",
  },
  {
    key: "pvcs",
    title: "PVC",
    detail: "core/v1 PersistentVolumeClaim · 持久卷声明 · 存储请求",
  },
  {
    key: "configmaps",
    title: "ConfigMap",
    detail: "core/v1 ConfigMap · 非敏感配置 · data/binaryData",
  },
  {
    key: "secrets",
    title: "Secret",
    detail: "core/v1 Secret · 敏感数据 · data/stringData",
  },
];

export function resourceTabMeta(key: ClusterScopedResource) {
  return RESOURCE_TAB_META.find((x) => x.key === key)!;
}

/** 命名空间选择页 ?resource= 默认：Pod（进入命名空间后优先看 Pod） */
export function parseResourceSearchParam(v: string | null): ClusterScopedResource {
  if (v && SCOPED_RESOURCE_KEYS.includes(v as ClusterScopedResource)) {
    return v as ClusterScopedResource;
  }
  return "pods";
}
