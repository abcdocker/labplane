/**
 * Kubernetes Prometheus 指标定义，对齐 kube-prometheus-stack 常见抓取（ksm、cAdvisor、node-exporter、控制面组件）。
 * 同一指标多条 PromQL 为回退顺序（不同发行版指标名可能略有差异）。
 */

export type K8sScalarMetricDef = {
  id: string;
  /** 面板分组：配额 / 实际用量 / 控制面 / 调度器 / 节点 / 存储 */
  section: "quota" | "usage" | "controlplane" | "scheduler" | "nodes" | "storage";
  title: string;
  subtitle?: string;
  queries: string[];
  format: "cores" | "bytes_gib" | "int" | "percent" | "seconds" | "per_sec" | "raw2";
  /** 无数据时的安装/抓取说明 */
  hint: string;
};

export type K8sChartMetricDef = {
  id: string;
  /** 与 scalar section 对齐，用于面板分组展示趋势 */
  section: "quota" | "usage" | "controlplane" | "scheduler" | "storage";
  title: string;
  subtitle?: string;
  queries: string[];
  /** Y 轴与 Tooltip 数值格式 */
  valueFormat: "cores" | "bytes_gib" | "seconds" | "per_sec" | "int";
  /** 折线/渐变主色 */
  accent: string;
  hint: string;
};

/** 用量/磁盘等有数据、仅 kube_* 无：Prometheus 已通但未 scrape 进 ksm */
const HINT_KSM_CHART_EMPTY =
  "无数据：若用量/磁盘等图表有数据而仅此类无，说明已连上 Prometheus，但该实例未把 kube-state-metrics 写入 TSDB。打开 Prometheus → Status → Targets，查含 kube-state-metrics 的 job 是否 UP 及错误（NetworkPolicy、端口、ServiceMonitor 未匹配当前 Prometheus）。";

/**
 * cAdvisor 工作负载容器统一选择器（与 Top 排行、Pod 资源效率 API、趋势图首条一致）。
 * 勿在首条查询中加 image!=""：部分 kubelet 不填 image 标签，会导致「集群用量」远小于按命名空间聚合之和。
 */
const CADVISOR_POD_CONTAINER = `namespace!="",pod!="",container!="",container!="POD"`;

/** 集群配额 / 请求上限（kube-state-metrics） */
export const K8S_SCALAR_QUOTA_USAGE: K8sScalarMetricDef[] = [
  {
    id: "alloc_cpu_cores",
    section: "quota",
    title: "CPU 可分配（集群）",
    subtitle: "Node.Status.allocatable.cpu（kube 系统预留后）",
    queries: [`sum(kube_node_status_allocatable{resource="cpu"})`],
    format: "cores",
    hint: "需 kube-state-metrics 被 Prometheus 抓取。若用量类已有数据而仅此无，多为 Targets 中 ksm 非 UP，而非平台地址错误。",
  },
  {
    id: "alloc_mem_bytes",
    section: "quota",
    title: "内存可分配（集群）",
    subtitle: "Node.Status.allocatable.memory（kube 系统预留后）",
    queries: [`sum(kube_node_status_allocatable{resource="memory"})`],
    format: "bytes_gib",
    hint: "同上；kube-state-metrics 暴露节点 allocatable memory。",
  },
  {
    id: "req_cpu_cores",
    section: "quota",
    title: "CPU 请求合计",
    subtitle: "全集群 Pod request",
    queries: [`sum(kube_pod_container_resource_requests{resource="cpu"})`],
    format: "cores",
    hint: "需 kube-state-metrics；未填 requests 的 Pod 不计入。",
  },
  {
    id: "req_mem_bytes",
    section: "quota",
    title: "内存请求合计",
    queries: [`sum(kube_pod_container_resource_requests{resource="memory"})`],
    format: "bytes_gib",
    hint: "同上。",
  },
  {
    id: "lim_cpu_cores",
    section: "quota",
    title: "CPU limits 合计",
    queries: [`sum(kube_pod_container_resource_limits{resource="cpu"})`],
    format: "cores",
    hint: "需 kube-state-metrics。",
  },
  {
    id: "lim_mem_bytes",
    section: "quota",
    title: "内存 limits 合计",
    queries: [`sum(kube_pod_container_resource_limits{resource="memory"})`],
    format: "bytes_gib",
    hint: "同上。",
  },
];

/** 实际用量（cAdvisor / kubelet 指标） */
export const K8S_SCALAR_WORKLOAD: K8sScalarMetricDef[] = [
  {
    id: "cpu_usage_cores",
    section: "usage",
    title: "CPU 实际用量",
    subtitle: "工作负载容器 rate 聚合（不含整机 cgroup）",
    queries: [
      `sum(rate(container_cpu_usage_seconds_total{${CADVISOR_POD_CONTAINER}}[5m]))`,
      `sum(rate(container_cpu_usage_seconds_total{container!="",container!="POD",image!=""}[5m]))`,
      `sum(rate(container_cpu_usage_seconds_total{container!=""}[5m]))`,
    ],
    format: "cores",
    hint: "需 Prometheus 抓取 cAdvisor（kubelet / prometheus-operator 默认 ServiceMonitor）。",
  },
  {
    id: "mem_wss_bytes",
    section: "usage",
    title: "内存 working set",
    subtitle: "工作负载容器 WSS 聚合",
    queries: [
      `sum(container_memory_working_set_bytes{${CADVISOR_POD_CONTAINER}})`,
      `sum(container_memory_working_set_bytes{container!="",container!="POD",image!=""})`,
      `sum(container_memory_working_set_bytes{container!="",container!="POD"})`,
      `sum(container_memory_working_set_bytes{container!=""})`,
    ],
    format: "bytes_gib",
    hint: "同上；与命名空间 Top、Pod 资源卡片同一套标签过滤。",
  },
  {
    id: "pods_running",
    section: "usage",
    title: "Running Pod 数",
    queries: [`sum(kube_pod_status_phase{phase="Running"})`],
    format: "int",
    hint: "需 kube-state-metrics；若用量有数仅此无，查 Prometheus Targets 中 ksm。",
  },
  {
    id: "pods_allocatable",
    section: "usage",
    title: "Pod 可调度上限（集群）",
    subtitle: "kube_node_status_allocatable{resource=\"pods\"}",
    queries: [`sum(kube_node_status_allocatable{resource="pods"})`],
    format: "int",
    hint: "各节点可调度 Pod 数之和（已扣系统预留）；与 Running 对比看槽位占用。",
  },
  {
    id: "pods_capacity",
    section: "usage",
    title: "集群 Pod 容量上限",
    subtitle: "各节点 pods capacity 之和",
    queries: [`sum(kube_node_status_capacity{resource="pods"})`],
    format: "int",
    hint: "物理上限；展示「Running/可调度」时优先用 allocatable。",
  },
];

export const K8S_SCALAR_CONTROL: K8sScalarMetricDef[] = [
  {
    id: "apiserver_qps",
    section: "controlplane",
    title: "API Server 请求速率",
    subtitle: "sum(rate(apiserver_request_total[5m]))",
    queries: [
      `sum(rate(apiserver_request_total[5m]))`,
      `sum(rate(apiserver_request_total{job=~"apiserver|kube-apiserver"}[5m]))`,
      `sum(rate(apiserver_request_total{job=~".*apiserver.*"}[5m]))`,
    ],
    format: "per_sec",
    hint: "需抓取 kube-apiserver；一键安装已默认 kubeApiServer.enabled=true。平台在集群外时请用可达 Prometheus 地址并核对 Targets。",
  },
  {
    id: "apiserver_latency_p99",
    section: "controlplane",
    title: "API Server 延迟 P99",
    subtitle: "apiserver_request_duration_seconds",
    queries: [
      `histogram_quantile(0.99, sum(rate(apiserver_request_duration_seconds_bucket[5m])) by (le))`,
      `histogram_quantile(0.99, sum(rate(apiserver_request_slo_duration_seconds_bucket[5m])) by (le))`,
    ],
    format: "seconds",
    hint: "依赖 apiserver histogram 指标；部分版本指标名不同，可 Grafana Explore 搜 apiserver_request。",
  },
];

export const K8S_SCALAR_SCHEDULER: K8sScalarMetricDef[] = [
  {
    id: "scheduler_attempt_rate",
    section: "scheduler",
    title: "调度尝试速率",
    queries: [`sum(rate(scheduler_schedule_attempts_total[5m]))`],
    format: "per_sec",
    hint: "需抓取 kube-scheduler（kube-prometheus-stack 中 kubeScheduler.enabled=true）。",
  },
  {
    id: "scheduler_scheduled_rate",
    section: "scheduler",
    title: "调度成功速率",
    queries: [
      `sum(rate(scheduler_schedule_attempts_total{result="scheduled"}[5m]))`,
      `sum(rate(scheduler_pod_scheduling_duration_seconds_count[5m]))`,
    ],
    format: "per_sec",
    hint: "部分集群仅有 attempts_total；无 result 标签时请看时序图总量。",
  },
  {
    id: "scheduler_latency_p99",
    section: "scheduler",
    title: "调度耗时 P99",
    queries: [
      `histogram_quantile(0.99, sum(rate(scheduler_scheduling_attempt_duration_seconds_bucket[5m])) by (le))`,
      `histogram_quantile(0.99, sum(rate(scheduler_pod_scheduling_duration_seconds_bucket[5m])) by (le))`,
    ],
    format: "seconds",
    hint: "需 kube-scheduler histogram；未启用调度器抓取则为空。",
  },
];

export const K8S_SCALAR_NODES: K8sScalarMetricDef[] = [
  {
    id: "nodes_ready",
    section: "nodes",
    title: "Ready 节点数",
    queries: [`sum(kube_node_status_condition{condition="Ready",status="true"})`],
    format: "int",
    hint: "kube-state-metrics。",
  },
  {
    id: "nodes_total",
    section: "nodes",
    title: "节点总数",
    queries: [`count(kube_node_info)`],
    format: "int",
    hint: "kube-state-metrics。",
  },
];

/** 节点磁盘（node-exporter，按根分区聚合） */
export const K8S_SCALAR_STORAGE: K8sScalarMetricDef[] = [
  {
    id: "disk_total_bytes",
    section: "storage",
    title: "磁盘总量（根分区估算）",
    subtitle: "sum(max by(instance)(size@mountpoint=/))",
    queries: [
      `sum(max by (instance) (node_filesystem_size_bytes{mountpoint="/",fstype!="tmpfs"}))`,
      `sum(max by (instance) (node_filesystem_size_bytes{fstype=~"ext4|xfs",mountpoint="/"}))`,
      `sum(max by (instance) (node_filesystem_size_bytes{mountpoint="/rootfs",fstype!="tmpfs"}))`,
      `sum(max by (instance) (node_filesystem_size_bytes{fstype=~"ext4|xfs|btrfs",mountpoint="/host"}))`,
    ],
    format: "bytes_gib",
    hint: "需 node-exporter；容器内 node-exporter 常见为 /rootfs 或 /host，已加回退查询。",
  },
  {
    id: "disk_avail_bytes",
    section: "storage",
    title: "磁盘可用（根分区估算）",
    queries: [
      `sum(max by (instance) (node_filesystem_avail_bytes{mountpoint="/",fstype!="tmpfs"}))`,
      `sum(max by (instance) (node_filesystem_avail_bytes{fstype=~"ext4|xfs",mountpoint="/"}))`,
      `sum(max by (instance) (node_filesystem_avail_bytes{mountpoint="/rootfs",fstype!="tmpfs"}))`,
      `sum(max by (instance) (node_filesystem_avail_bytes{fstype=~"ext4|xfs|btrfs",mountpoint="/host"}))`,
    ],
    format: "bytes_gib",
    hint: "同上。",
  },
];

/** 时序图统一时间窗（天）— 与 Prometheus retention 对齐；步长由 stepForRangeMinutes 推导 */
export const K8S_CHART_RANGE_DAYS = 7;

/** 趋势图顺序与后端 cluster-charts 一致：工作负载 → 配额 → 控制面 → 调度器 → 磁盘 */
export const K8S_CHART_DEFS: K8sChartMetricDef[] = [
  {
    id: "chart_cpu_usage",
    section: "usage",
    title: "集群 CPU 实际用量",
    subtitle: "容器聚合核数（非固定值，随负载变化）",
    queries: [
      `sum(rate(container_cpu_usage_seconds_total{${CADVISOR_POD_CONTAINER}}[5m]))`,
      `sum(rate(container_cpu_usage_seconds_total{container!="",container!="POD",image!=""}[5m]))`,
      `sum(rate(container_cpu_usage_seconds_total{container!=""}[5m]))`,
    ],
    valueFormat: "cores",
    accent: "#ea580c",
    hint: "无数据：检查 kubelet/cAdvisor 抓取。",
  },
  {
    id: "chart_mem_wss",
    section: "usage",
    title: "集群内存 working set",
    queries: [
      `sum(container_memory_working_set_bytes{${CADVISOR_POD_CONTAINER}})`,
      `sum(container_memory_working_set_bytes{container!="",container!="POD",image!=""})`,
      `sum(container_memory_working_set_bytes{container!="",container!="POD"})`,
    ],
    valueFormat: "bytes_gib",
    accent: "#db2777",
    hint: "无数据：同上。",
  },
  {
    id: "chart_pods_running_series",
    section: "usage",
    title: "Running Pod 数量",
    queries: [`sum(kube_pod_status_phase{phase="Running"})`],
    valueFormat: "int",
    accent: "#16a34a",
    hint: HINT_KSM_CHART_EMPTY,
  },
  {
    id: "chart_pods_capacity_series",
    section: "usage",
    title: "集群 Pod 容量上限",
    subtitle: "各节点 pods capacity 之和",
    queries: [`sum(kube_node_status_capacity{resource="pods"})`],
    valueFormat: "int",
    accent: "#475569",
    hint: HINT_KSM_CHART_EMPTY,
  },
  {
    id: "chart_alloc_cpu_series",
    section: "quota",
    title: "CPU 可分配（集群）",
    subtitle: "kube_node_status_allocatable 快照随时间",
    queries: [`sum(kube_node_status_allocatable{resource="cpu"})`],
    valueFormat: "cores",
    accent: "#2563eb",
    hint: "无数据：查询结果中无 kube_node_*（kube-prometheus 卡片可看「指标探测」）。若用量等有数仅此无，查 Prometheus Targets 中 kube-state-metrics 是否 UP。",
  },
  {
    id: "chart_req_cpu_series",
    section: "quota",
    title: "CPU 请求合计",
    subtitle: "全集群 Pod requests 随时间",
    queries: [`sum(kube_pod_container_resource_requests{resource="cpu"})`],
    valueFormat: "cores",
    accent: "#0284c7",
    hint: HINT_KSM_CHART_EMPTY,
  },
  {
    id: "chart_lim_cpu_series",
    section: "quota",
    title: "CPU limits 合计",
    subtitle: "全集群 Pod limits",
    queries: [`sum(kube_pod_container_resource_limits{resource="cpu"})`],
    valueFormat: "cores",
    accent: "#6d28d9",
    hint: HINT_KSM_CHART_EMPTY,
  },
  {
    id: "chart_alloc_mem_series",
    section: "quota",
    title: "内存可分配（集群）",
    queries: [`sum(kube_node_status_allocatable{resource="memory"})`],
    valueFormat: "bytes_gib",
    accent: "#7c2d12",
    hint: HINT_KSM_CHART_EMPTY,
  },
  {
    id: "chart_req_mem_series",
    section: "quota",
    title: "内存请求合计",
    queries: [`sum(kube_pod_container_resource_requests{resource="memory"})`],
    valueFormat: "bytes_gib",
    accent: "#be185d",
    hint: HINT_KSM_CHART_EMPTY,
  },
  {
    id: "chart_lim_mem_series",
    section: "quota",
    title: "内存 limits 合计",
    queries: [`sum(kube_pod_container_resource_limits{resource="memory"})`],
    valueFormat: "bytes_gib",
    accent: "#9333ea",
    hint: HINT_KSM_CHART_EMPTY,
  },
  {
    id: "chart_apiserver_qps",
    section: "controlplane",
    title: "API Server 请求速率",
    subtitle: "rate 窗口 5m，图上每点为当时刻速率",
    queries: [
      `sum(rate(apiserver_request_total[5m]))`,
      `sum(rate(apiserver_request_total{job=~".*apiserver.*"}[5m]))`,
      `sum(rate(apiserver_request_total{job=~"kube-apiserver|apiserver"}[5m]))`,
    ],
    valueFormat: "per_sec",
    accent: "#4f46e5",
    hint: "无数据：启用 apiserver ServiceMonitor；平台在集群外时请用可访问的 Prometheus 地址并确认 Targets 中 apiserver 为 UP。",
  },
  {
    id: "chart_apiserver_latency",
    section: "controlplane",
    title: "API Server 请求延迟 P99",
    subtitle: "histogram_quantile 0.99",
    queries: [
      `histogram_quantile(0.99, sum(rate(apiserver_request_duration_seconds_bucket[5m])) by (le))`,
      `histogram_quantile(0.99, sum(rate(apiserver_request_slo_duration_seconds_bucket[5m])) by (le))`,
    ],
    valueFormat: "seconds",
    accent: "#7c3aed",
    hint: "无数据：同即时指标说明。",
  },
  {
    id: "chart_scheduler_rate",
    section: "scheduler",
    title: "调度器调度速率",
    subtitle: "scheduler_schedule_attempts_total",
    queries: [`sum(rate(scheduler_schedule_attempts_total[5m]))`],
    valueFormat: "per_sec",
    accent: "#0d9488",
    hint: "无数据：helm kube-prometheus-stack 设置 kubeScheduler.enabled=true。",
  },
  {
    id: "chart_scheduler_latency",
    section: "scheduler",
    title: "调度器调度耗时 P99",
    queries: [
      `histogram_quantile(0.99, sum(rate(scheduler_scheduling_attempt_duration_seconds_bucket[5m])) by (le))`,
    ],
    valueFormat: "seconds",
    accent: "#059669",
    hint: "无数据：抓取 kube-scheduler metrics。",
  },
  {
    id: "chart_scheduler_scheduled_rate",
    section: "scheduler",
    title: "调度成功速率",
    subtitle: "scheduled 或 pod_scheduling_duration 计数",
    queries: [
      `sum(rate(scheduler_schedule_attempts_total{result="scheduled"}[5m]))`,
      `sum(rate(scheduler_pod_scheduling_duration_seconds_count[5m]))`,
    ],
    valueFormat: "per_sec",
    accent: "#0f766e",
    hint: "无数据：抓取 kube-scheduler；部分集群仅有 attempts 总量。",
  },
  {
    id: "chart_disk_total_series",
    section: "storage",
    title: "磁盘总量（根分区估算）",
    subtitle: "node_filesystem_size_bytes @ /",
    queries: [
      `sum(max by (instance) (node_filesystem_size_bytes{mountpoint="/",fstype!="tmpfs"}))`,
      `sum(max by (instance) (node_filesystem_size_bytes{fstype=~"ext4|xfs",mountpoint="/"}))`,
      `sum(max by (instance) (node_filesystem_size_bytes{mountpoint="/rootfs",fstype!="tmpfs"}))`,
      `sum(max by (instance) (node_filesystem_size_bytes{fstype=~"ext4|xfs|btrfs",mountpoint="/host"}))`,
    ],
    valueFormat: "bytes_gib",
    accent: "#b45309",
    hint: "无数据：node-exporter；已含 /rootfs、/host 等回退 mountpoint。",
  },
  {
    id: "chart_disk_avail_series",
    section: "storage",
    title: "磁盘可用（根分区估算）",
    queries: [
      `sum(max by (instance) (node_filesystem_avail_bytes{mountpoint="/",fstype!="tmpfs"}))`,
      `sum(max by (instance) (node_filesystem_avail_bytes{fstype=~"ext4|xfs",mountpoint="/"}))`,
      `sum(max by (instance) (node_filesystem_avail_bytes{mountpoint="/rootfs",fstype!="tmpfs"}))`,
      `sum(max by (instance) (node_filesystem_avail_bytes{fstype=~"ext4|xfs|btrfs",mountpoint="/host"}))`,
    ],
    valueFormat: "bytes_gib",
    accent: "#ca8a04",
    hint: "无数据：同上。",
  },
];

/** Top 排行（即时 vector） */
export const K8S_TOPK_QUERIES = {
  namespaceCpu: {
    title: "命名空间 CPU 用量 Top 8",
    q: `topk(8, sum by (namespace) (rate(container_cpu_usage_seconds_total{${CADVISOR_POD_CONTAINER}}[5m])))`,
    format: "cores" as const,
    hint: "需 cAdvisor；无 namespace 标签时检查 kubelet 指标标签。",
  },
  namespaceMem: {
    title: "命名空间内存 working set Top 8",
    q: `topk(8, sum by (namespace) (container_memory_working_set_bytes{${CADVISOR_POD_CONTAINER}}))`,
    format: "bytes_gib" as const,
    hint: "同上。",
  },
  podCpu: {
    title: "Pod CPU 用量 Top 8",
    q: `topk(8, sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{${CADVISOR_POD_CONTAINER}}[5m])))`,
    format: "cores" as const,
    hint: "需 cAdvisor；无 pod 标签时检查 kubelet/cAdvisor 指标标签。",
  },
  podMem: {
    title: "Pod 内存 working set Top 8",
    q: `topk(8, sum by (namespace, pod) (container_memory_working_set_bytes{${CADVISOR_POD_CONTAINER}}))`,
    format: "bytes_gib" as const,
    hint: "同上。",
  },
};

/** 与本页 PromQL 配套的常见安装说明（可复制到运维文档） */
export const CLUSTER_PROMETHEUS_INSTALL_HINT = `推荐用 Helm 安装 kube-prometheus-stack（Prometheus Operator、kube-state-metrics、node-exporter、默认 ServiceMonitor）。

示例：
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install kube-prom prometheus-community/kube-prometheus-stack -n monitoring --create-namespace

按需开启：
- kubeScheduler.enabled=true
- kubeControllerManager.enabled=true
- kubeEtcd.enabled=true（自建控制面；托管集群通常关闭）

本页指标依赖上述组件被 Prometheus 抓取；某项为「—」时按各卡片 hint 查 Targets 与指标名。`;

/** @deprecated 使用 CLUSTER_PROMETHEUS_INSTALL_HINT */
export const KUBE_PROMETHEUS_INSTALL_HINT = CLUSTER_PROMETHEUS_INSTALL_HINT;

export function allScalarDefs(): K8sScalarMetricDef[] {
  return [
    ...K8S_SCALAR_QUOTA_USAGE,
    ...K8S_SCALAR_WORKLOAD,
    ...K8S_SCALAR_CONTROL,
    ...K8S_SCALAR_SCHEDULER,
    ...K8S_SCALAR_NODES,
    ...K8S_SCALAR_STORAGE,
  ];
}
