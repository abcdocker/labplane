/** GET /api/k8s/summary：异常/需关注 Pod 预览（Failed / Pending / Unknown / CrashLoopBackOff） */
export type K8sAnomalyPod = {
  namespace: string;
  name: string;
  phase: string;
  reason?: string;
};

export type K8sSummary = {
  namespaceCount: number;
  podCount: number;
  serviceCount: number;
  nodeCount: number;
  podsRunning?: number;
  podsFailed?: number;
  podsPending?: number;
  podsCrashLoop?: number;
  nodesNotReady?: number;
  anomalyPods?: K8sAnomalyPod[];
};

export type PodRow = {
  namespace: string;
  name: string;
  phase: string;
  node: string;
  restarts: number;
  age: string;
  /** 列表接口返回，用于快捷打开日志 */
  firstContainer?: string;
  /** GET /api/k8s/pods：工作容器 CPU requests 合计（毫核） */
  cpuRequestMilli?: number;
  /** GET /api/k8s/pods：工作容器 memory requests 合计（字节） */
  memRequestBytes?: number;
};

/** GET /api/k8s/pods/metrics — 与 Prometheus / VictoriaMetrics vmselect 兼容 */
/** GET /api/k8s/pods/resource-efficiency — requests vs Prometheus 用量、缺 limits */
export type PodResourceEfficiencyRow = {
  key: string;
  namespace: string;
  pod: string;
  node?: string;
  cpuRequestMilli: number;
  memRequestBytes: number;
  cpuLimitMilli: number;
  memLimitBytes: number;
  cpuUseCores?: number;
  memUseBytes?: number;
  cpuUseRatio?: number;
  memUseRatio?: number;
  limitsGap: boolean;
  slackCpu: boolean;
  slackMem: boolean;
  /** 后端生成的处置提示（排序：缺 limits → 浪费度高 → 实际/申请更低） */
  priorityNote?: string;
};

/** GET /api/k8s/pods/resource-efficiency 中 cluster：全 Running Pod 表字段合计与 Prometheus 合计之比 */
export type PodResourceClusterStats = {
  cpuRequestMilliTotal: number;
  memRequestBytesTotal: number;
  cpuUseCoresTotal: number;
  memUseBytesTotal: number;
  runningPodsWithCpuReq?: number;
  runningPodsWithMemReq?: number;
  runningPodsWithCpuProm?: number;
  runningPodsWithMemProm?: number;
  /** 实际 CPU 核数合计 / CPU request 合计（核）；无 Prom 或未配置时可能缺失 */
  cpuUseOverRequestRatio?: number;
  /** 实际内存 working set 合计 / memory request 合计 */
  memUseOverRequestRatio?: number;
};

export type PodResourceEfficiencyPayload = {
  ok: boolean;
  prometheus: boolean;
  prometheusHint?: string;
  scannedRunningPods: number;
  missingLimitsPods: number;
  slackShown: number;
  cluster?: PodResourceClusterStats;
  params?: Record<string, unknown>;
  rows: PodResourceEfficiencyRow[];
};

/** GET /api/k8s/workloads/resource-advisory — 控制器级：申请表 vs 5m 实际用量（可缩 requests / 补 limits） */
export type WorkloadResourceAdvisoryRow = {
  kind: string;
  namespace: string;
  name: string;
  replicasDesired?: number;
  runningPods?: number;
  cpuRequestMilliPod?: number;
  memRequestBytesPod?: number;
  cpuUseCoresAgg?: number;
  memUseBytesAgg?: number;
  cpuUseRatioAvg?: number;
  memUseRatioAvg?: number;
  risk?: boolean;
  note?: string;
  suggestedCpuRequest?: string;
  suggestedMemoryRequest?: string;
  suggestedCpuLimit?: string;
  suggestedMemoryLimit?: string;
};

export type WorkloadResourceAdvisoryPayload = {
  ok: boolean;
  prometheus?: boolean;
  prometheusHint?: string;
  rows: WorkloadResourceAdvisoryRow[];
};

export type WorkloadLinkedCRPatchResult = {
  apiVersion?: string;
  kind?: string;
  name?: string;
  namespace?: string;
  clustered?: boolean;
  ok?: boolean;
  message?: string;
};

export type WorkloadLinkedHelmResult = {
  attempted?: boolean;
  ok?: boolean;
  message?: string;
  command?: string;
};

export type WorkloadLinkedSyncPayload = {
  crPatches?: WorkloadLinkedCRPatchResult[];
  helm?: WorkloadLinkedHelmResult;
};

/** GET /api/k8s/pod-restart-insights — 高重启 Pod + Events 粗分类 */
export type PodRestartInsightRow = {
  namespace: string;
  name: string;
  phase: string;
  restarts: number;
  oomKilledSuspect?: boolean;
  evictedSuspect?: boolean;
  backOffSuspect?: boolean;
  recentReasons?: string[];
  topOwnerKind?: string;
  topOwnerName?: string;
  helmRelease?: string;
  hints?: string[];
};

export type PodRestartInsightsPayload = {
  ok: boolean;
  items: PodRestartInsightRow[];
};

/** GET /api/k8s/pod-restarts — includeEventHints=1 时与 PodRestartInsightRow 字段对齐 */
export type PodRestartRow = {
  namespace: string;
  name: string;
  phase: string;
  restarts: number;
  primaryContainer?: string;
  oomKilledSuspect?: boolean;
  evictedSuspect?: boolean;
  backOffSuspect?: boolean;
  recentReasons?: string[];
  topOwnerKind?: string;
  topOwnerName?: string;
  helmRelease?: string;
  hints?: string[];
};

export type PodRestartsPayload = {
  ok: boolean;
  minRestarts: number;
  includeEventHints?: boolean;
  items: PodRestartRow[];
};

export type PodsMetricsPayload = {
  available: boolean;
  hint?: string;
  backend?: string;
  cpuCoresByPod?: Record<string, number>;
  memBytesByPod?: Record<string, number>;
  /** 指定 pod 查询时：各工作容器 CPU（核，5m rate） */
  cpuCoresByContainer?: Record<string, number>;
  /** 指定 pod 查询时：各容器 working set 字节 */
  memBytesByContainer?: Record<string, number>;
  /** 入站速率（字节/秒），rate 5m */
  netRxBpsByPod?: Record<string, number>;
  /** 出站速率（字节/秒），rate 5m */
  netTxBpsByPod?: Record<string, number>;
};

/** GET /api/k8s/services 每条端口的结构化字段（与 ports[] 字符串并列） */
export type ServicePortEntry = {
  name: string;
  port: number;
  protocol: string;
  target: string;
  nodePort?: number;
};

export type SvcRow = {
  namespace: string;
  name: string;
  /** 服务端 metadata.labels 序列化字符串 */
  labels?: string;
  type: string;
  clusterIP: string;
  /** 服务端格式化：name:port/PROTO→target，NodePort / LB 时带 (NodePort n) */
  ports: string[];
  /** 结构化端口，便于表格与列表摘要 */
  portEntries?: ServicePortEntry[];
  age: string;
};

export type NodeRow = {
  name: string;
  ready: string;
  roles: string[];
  internalIP: string;
  kubelet: string;
  age: string;
  /** 可调度 CPU（核），来自 Node allocatable */
  cpuAllocCores?: number;
  memAllocBytes?: number;
  /** Prometheus kubelet/cAdvisor，与 allocatable 对比得占用率 */
  cpuUsedCores?: number;
  memUsedBytes?: number;
  cpuUsagePercent?: number;
  memUsagePercent?: number;
  /** Prometheus query_range 用：节点 cAdvisor 用量（核·秒/s 与 working_set 字节） */
  cpuSparkQuery?: string;
  memSparkQuery?: string;
  /** 已调度到该节点的 Pod 数（spec.nodeName），与节点列表同次请求聚合 */
  podCount?: number;
};

/** GET /api/k8s/nodes */
export type K8sNodesListResponse = {
  nodes: NodeRow[];
  prometheusConfigured?: boolean;
  metricsHint?: string;
};
