export type VCenterVMRow = {
  moref: string;
  name: string;
  powerState: string;
  guestId: string;
  cpu: number;
  memoryMB: number;
  ip: string;
  overallStatus?: string;
  cpuUsageMHz?: number;
  cpuCapacityMHz?: number;
  cpuUsagePercent?: number;
  memoryUsageMB?: number;
  memoryMaxMB?: number;
  memoryUsagePercent?: number;
  /** vCenter Summary.Storage：仅当存在未承诺(uncommitted)字节时，已提交/(已提交+未提交)×100；非来宾机 df 使用率 */
  diskUsagePercent?: number;
  uptimeSec?: number;
};

export type VCenterVMsResponse = { vms: VCenterVMRow[] };

/** GET /api/vcenter/vms/perf-snapshot — 与详情页资源监控同源计数器，实时窗口最新点 */
export type VCenterVMPerfRateRow = {
  diskRead: number;
  diskWrite: number;
  netRx: number;
  netTx: number;
  diskReadUnit?: string;
  diskWriteUnit?: string;
  netRxUnit?: string;
  netTxUnit?: string;
};

export type VCenterVMsPerfSnapshotProbe = {
  moref?: string;
  chosen?: string;
  reason?: string;
  historicalOk?: boolean;
  realtimeOk?: boolean;
  historicalSamples?: number;
  realtimeSamples?: number;
  currentSupported?: boolean;
  refreshRateSec?: number;
  summarySupported?: boolean;
  providerSummaryErr?: string;
};

export type VCenterVMsPerfSnapshotResponse = {
  rates: Record<string, VCenterVMPerfRateRow>;
  note?: string;
  probe?: VCenterVMsPerfSnapshotProbe;
};

/** GET /api/vcenter/vms/io-prometheus — Telegraf vSphere 等指标，按虚拟机「名称」与 vmname 标签匹配 */
export type VCenterVMsIoPrometheusResponse = {
  prometheusConfigured: boolean;
  ratesByName: Record<string, VCenterVMPerfRateRow>;
  needVcenterFallback?: boolean;
  note?: string;
  queriesUsed?: Partial<{
    diskRead: string;
    diskWrite: string;
    netRx: string;
    netTx: string;
  }>;
};

/** GET /api/vcenter/vms/ikuai-client-stream — yw9381/ikuai_exporter，按私网 IP 与虚拟机 guest IP 对齐 */
export type VCenterIkuaiLanDeviceRow = {
  ip: string;
  mac?: string;
  hostname?: string;
  comment?: string;
  clientType?: string;
  download: number;
  upload?: number;
};

export type VCenterVMsIkuaiClientStreamResponse = {
  prometheusConfigured: boolean;
  exporterKind?: "modern" | "legacy";
  ratesByIp: Record<string, VCenterVMPerfRateRow>;
  devices: VCenterIkuaiLanDeviceRow[];
  note?: string;
  queriesUsed?: Partial<{
    downloadByIp: string;
    uploadByIp: string;
    topology: string;
  }>;
};

export type VCenterHostRow = {
  moref: string;
  name: string;
  connectionState?: string;
  overallStatus?: string;
  cpuCores?: number;
  cpuMhzPerCore?: number;
  cpuUsageMHz?: number;
  cpuCapacityMHz?: number;
  cpuUsagePercent?: number;
  memoryTotalMB?: number;
  memoryUsageMB?: number;
  memoryUsagePercent?: number;
  uptimeSec?: number;
  esxiVersion?: string;
  vendor?: string;
  model?: string;
};

export type VCenterHostsResponse = { hosts: VCenterHostRow[] };

/** GET /api/vcenter/hosts/:moref — 仅名称与管理网 IP，监控走 Prometheus（job=vmware_vcenter） */
export type VCenterHostDetailRow = Pick<VCenterHostRow, "moref" | "name"> & {
  managementVmkIp?: string;
};

export type VCenterHostDetailResponse = { host: VCenterHostDetailRow };

export type PerfPoint = { t: string; v: number };

/** GET /api/vcenter/vms/:moref/metrics?days=1..7 — vCenter 历史性能序列 */
export type VCenterVMPerfResponse = {
  moref: string;
  days: number;
  rangeFrom: string;
  rangeTo: string;
  intervalSec: number;
  note?: string;
  missing?: string[];
  series: {
    cpu?: PerfPoint[] | null;
    memory?: PerfPoint[] | null;
    diskRead?: PerfPoint[] | null;
    diskWrite?: PerfPoint[] | null;
    netRx?: PerfPoint[] | null;
    netTx?: PerfPoint[] | null;
  };
  units?: Partial<{
    cpu: string;
    memory: string;
    diskRead: string;
    diskWrite: string;
    netRx: string;
    netTx: string;
  }>;
  /** 磁盘/网络使用近 1 小时实时统计回退时返回 */
  diskNetRealtime?: {
    rangeFrom: string;
    rangeTo: string;
    intervalSec: number;
  };
};

export type VCenterVMGuestSummary = {
  ip?: string;
  hostname?: string;
  guestFullName?: string;
  toolsRunningStatus?: string;
  toolsVersionStatus?: string;
};

export type VCenterVMStorageSummary = {
  committedBytes?: number;
  uncommittedBytes?: number;
  unsharedBytes?: number;
};

export type VCenterVMNetRow = {
  network?: string;
  mac?: string;
  ips?: string[] | string;
};

/** POST /api/vcenter/vms/:moref/power — 异步返回 taskId，客户端轮询 GET /api/vcenter/tasks/:taskId */
export type VCenterPowerPostResponse = {
  ok?: boolean;
  action?: string;
  taskId?: string;
};

/** GET /api/vcenter/tasks/:taskId */
export type VCenterTaskStatusResponse = {
  state: string;
  progress?: number;
  description?: string;
  error?: string;
};

export type VCenterVMDiskRow = {
  key: number;
  label?: string;
  capacityKB: number;
  unitNumber?: number;
  controllerKey?: number;
  fileName?: string;
};

/** GET /api/vcenter/vms/:moref 常用字段 */
export type VCenterVMDetailResponse = {
  name?: string;
  powerState?: string;
  cpu?: number;
  memoryMB?: number;
  uuid?: string;
  template?: boolean;
  cpuHotAddEnabled?: boolean;
  memoryHotAddEnabled?: boolean;
  disks?: VCenterVMDiskRow[];
  guest?: VCenterVMGuestSummary;
  storage?: VCenterVMStorageSummary;
  networkInterfaces?: VCenterVMNetRow[];
};

export type VCenterWebmksResponse = {
  ready: boolean;
  powerState: string;
  proxyPath: string;
  hint?: string;
};
