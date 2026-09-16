/** AI 巡检 · VictoriaLogs 日志查询：类型、筛选项常量、时间格式化（与 AiInspectLogs 页配套的一份模块）。 */

export type VmLogDiscovered = {
  namespace: string;
  service: string;
  suggestedUrl: string;
  port: number;
  hint: string;
};

export type VmLogStatus = {
  configured: boolean;
  baseUrlHint: string;
  defaultPort: number;
  docsUrl: string;
  helmChartsUrl: string;
  discovered: VmLogDiscovered[];
  retentionDays?: number;
  maxWindowMinutes?: number;
  retentionHint?: string;
  vmLogVectorDownloadConfigured?: boolean;
  vmLogVectorDownloadBaseUrlHint?: string;
  /** 是否配置了 GeoLite2-Country.mmdb（用于 Nginx 地区统计） */
  nginxGeoLiteConfigured?: boolean;
  nginxGeoHint?: string;
};

export type VmLogNamespacesRes = { namespaces: string[] };

export type VmLogNginxNamedCount = { name?: string; count?: number };

export type VmLogNginxTotals = {
  scannedLines?: number;
  parsedRequests?: number;
  uniqueClientIPs?: number;
  uniquePaths?: number;
  uniqueHosts?: number;
  uniqueRegions?: number;
  bytesSum?: number;
  bytesLines?: number;
  /** 与 parsedRequests 相同：本窗口内成功解析的 HTTP 请求条数（作连接/请求量参考） */
  connectionSamples?: number;
};

export type VmLogNginxAgg = {
  topClientIPs?: VmLogNginxNamedCount[];
  topPaths?: VmLogNginxNamedCount[];
  topHosts?: VmLogNginxNamedCount[];
  topRegions?: VmLogNginxNamedCount[];
  statusCodes?: VmLogNginxNamedCount[];
  methods?: VmLogNginxNamedCount[];
  totals?: VmLogNginxTotals;
  /** maxmind-country | maxmind-unavailable | heuristic */
  geoSource?: string;
  parsedLines?: number;
  scannedLines?: number;
};

export type VmLogFieldPair = { key: string; value: string };

export type LogHealthStatus = "ok" | "warn" | "fail" | "skip";
export type LogPriority = "high" | "medium" | "low" | "none";
export type LogOverviewScope = "project_config" | "pod" | "nginx" | "platform";

export type VmLogSummary = {
  status: LogHealthStatus;
  hasError: boolean;
  priority: LogPriority;
  priorityReason?: string;
  totalCount: number;
  errorCount: number;
  warnCount: number;
  lastSeenAt?: string;
};

export type VmLogOverviewItem = VmLogSummary & {
  scope: LogOverviewScope;
  label: string;
};

export type VmLogOverviewRes = {
  windowMinutes: number;
  windowStart?: string;
  windowEnd?: string;
  refreshedAt: string;
  totalFetched: number;
  truncated?: boolean;
  scanWarning?: string;
  items: VmLogOverviewItem[];
};

export type VmLogDetailRow = {
  time?: string;
  scope: LogOverviewScope | string;
  namespace?: string;
  pod?: string;
  source?: string;
  msg?: string;
  fields?: VmLogFieldPair[];
  status: LogHealthStatus;
  hasError: boolean;
  priority: LogPriority;
  priorityReason?: string;
};

export type VmLogDetailsRes = {
  scope: LogOverviewScope;
  category?: string;
  k8sNamespace?: string;
  k8sPodName?: string;
  keyword?: string;
  keywordField?: string;
  windowMinutes: number;
  windowStart?: string;
  windowEnd?: string;
  refreshedAt: string;
  totalFetched: number;
  totalMatched: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  truncated?: boolean;
  scanWarning?: string;
  summary: VmLogSummary;
  rows: VmLogDetailRow[];
};

export type VmLogStats = {
  category: string;
  k8sNamespace: string;
  k8sPodName?: string;
  keyword: string;
  keywordField?: string;
  windowMinutes: number;
  windowStart?: string;
  windowEnd?: string;
  bucketMinutes: number;
  refreshedAt: string;
  totalFetched: number;
  totalMatched: number;
  matchedWithTs: number;
  truncated?: boolean;
  scanWarning?: string;
  summary?: VmLogSummary;
  buckets: { ts: number; label: string; count: number }[];
  recent: {
    time?: string;
    msg?: string;
    namespace?: string;
    pod?: string;
    source?: string;
    fields?: VmLogFieldPair[];
  }[];
  nginxAgg?: VmLogNginxAgg;
};

export type LogCategoryId = "all" | "kubernetes" | "nginx" | "vcenter" | "appcenter" | "aiinspect" | "platform";

export type LogCategory = {
  id: LogCategoryId;
  label: string;
  short: string;
  ingest: { title: string; steps: string[] }[];
};

export function formatLocalDateTime(input?: string | number | Date | null): string {
  if (input == null || input === "") return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatAxisTime(tsMs: number, windowMinutes: number): string {
  const d = new Date(tsMs);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(windowMinutes <= 120 ? { second: "2-digit" as const } : {}),
  });
}

export function formatBucketRange(tsSec: number, bucketMinutes: number): string {
  const start = new Date(tsSec * 1000);
  const end = new Date(start.getTime() + bucketMinutes * 60 * 1000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";
  return `${formatLocalDateTime(start)} - ${formatLocalDateTime(end)}`;
}

/** datetime-local → ISO，供 VictoriaLogs 时间窗（RFC3339）。 */
export function localInputToISO(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function parseAbsoluteRange(
  startLocal: string,
  endLocal: string
): { startTime: string; endTime: string } | null {
  const startTime = localInputToISO(startLocal);
  const endTime = localInputToISO(endLocal);
  if (!startTime || !endTime) return null;
  if (new Date(endTime).getTime() <= new Date(startTime).getTime()) return null;
  return { startTime, endTime };
}

export const VM_LOG_CATEGORIES: LogCategory[] = [
  {
    id: "all",
    label: "全部日志",
    short: "不做来源分类过滤，展示时间窗内 VictoriaLogs 返回的全部条目（仍受单次拉取条数上限约束，超长窗口为抽样趋势）。",
    ingest: [
      {
        title: "何时用「全部」",
        steps: [
          "适合快速浏览 VMLog 入库总量或排查未知来源；其它 Tab 按 Kubernetes / vCenter / 应用中心等规则做**关键词与字段粗筛**（非 VL 服务端流式隔离）。",
          "更精筛请用「包含关键词」或在 VictoriaLogs 侧用 LogsQL / 流字段（如 vm_host、kubernetes.namespace_name）。",
        ],
      },
    ],
  },
  {
    id: "nginx",
    label: "Nginx / 访问",
    short: "访问类日志（文件名或 log_source 含 nginx、wwwlogs、access，或 _msg 呈 HTTP 请求行）。可选限定 K8s 命名空间与 Pod。整行 combined 在 _msg 时，统计页展示类 ELK 大盘：地区/域名/URI/状态码/方法/字节量与 Top IP；配置 GeoLite2-Country.mmdb 可显示国家中文名。",
    ingest: [
      {
        title: "与「Kubernetes」的区别",
        steps: [
          "本 Tab 只保留偏 **Nginx / access** 的条目，便于做访问画像；底层仍来自同一 VictoriaLogs。",
          "虚拟机上的站点日志常见整行写入 _msg；Ingress / Sidecar 访问日志同理。非 combined 单行时 Top IP/URI 图可能为 0。",
        ],
      },
      {
        title: "命名空间 + Pod",
        steps: [
          "选择命名空间后，列表与趋势与 **kubernetes.namespace_name** 对齐；Pod 填子串时在服务端对拉取结果再过滤（与 LogsQL 精确短语可并用）。",
        ],
      },
    ],
  },
  {
    id: "kubernetes",
    label: "Kubernetes",
    short: "集群 Pod / 容器日志（需采集端写入 kubernetes.* 等字段）。",
    ingest: [
      {
        title: "Helm 与采集",
        steps: [
          "使用 VictoriaMetrics 官方 helm-charts 部署 VictoriaLogs，在「Cluster Settings → VictoriaLogs」中填写 Service 内网 URL。",
          "用 vlagent / Vector 等采集容器 stdout，并保留 kubernetes.namespace_name、kubernetes.pod_name 等字段；本页按命名空间筛选依赖这些字段。",
        ],
      },
    ],
  },
  {
    id: "vcenter",
    label: "vCenter / 虚拟机",
    short: "ESXi、客户机或 vSphere 相关日志（服务端按内容关键词粗筛：vmware、esxi、vcenter 等）。",
    ingest: [
      {
        title: "架构：虚拟机 / 中间件 → VictoriaLogs",
        steps: [
          "采集助手远程安装可选：① **云主机**（登记固定 IP:端口）；② **vCenter 虚拟机**（选 moRef，平台按 VMware Tools 上报的 Guest IP SSH，凭据与虚拟机详情「SSH」页相同：全局 VCENTER_VM_SSH_* 或逐台保存密码/密钥）。无需再把 vCenter 虚拟机重复登记到云主机列表。",
          "VictoriaLogs 建议部署在 **Kubernetes 集群内**（与本平台同集群时，日志查询页填内网 Service:9428）。",
          "**虚拟机上的宝塔、Nginx、MySQL、Redis** 等文本日志需由 **采集 Agent** 推到 VL；请在 **AI 巡检 → 日志采集** 使用「采集助手」生成 **Vector** 安装脚本（或管理员一键 SSH 下发）。",
          "脚本下载 Vector 时会**优先走国内常用 GitHub 镜像线**（ghproxy 等），超时后自动换线，最后回源官方 release，降低直连 github.com 超时概率。",
          "推送接口为 VL 的 HTTP **insert/jsonline**，并携带流字段 **vm_host**、**log_source**，便于 LogsQL 筛选（如 vm_host:web1 AND log_source:baota-nginx）。",
          "若 VL 仅集群内 DNS（*.svc.cluster.local）可达，虚拟机无法直连：请为 VL 暴露 **NodePort / Ingress / 内网 LB**，并在助手中填写虚拟机可访问的 **http(s)://IP:端口**（无 /select 路径，与运行时 victoriaLogsUrl 根地址一致）。",
        ],
      },
      {
        title: "宝塔面板常见路径（BT）",
        steps: [
          "**Nginx 站点日志**：`/www/wwwlogs/*.log`（含 access / error，按站点域名分文件）。",
          "**MySQL**：常见 `/www/server/data/*.err`；部分环境为 `/var/log/mysqld.log` 或 `/var/log/mysql/error.log`，以 `find /www/server -name '*.err'` 或面板里「数据库」配置为准。",
          "**Redis（编译安装）**：`/www/server/redis/*.log`；系统包安装时可能是 `/var/log/redis/redis-server.log`。",
          "路径含通配符 `*` 时，Vector 会按 glob 多文件采集；权限不足时请用 **root SSH**（宝塔默认 root 密码在面板可改）或给运行用户读权限。",
        ],
      },
      {
        title: "普通用户 + sudo（非 root SSH）",
        steps: [
          "助手生成的远程脚本会安装 systemd 与 `/etc/vector/`，需要 **root** 或 **`sudo -n` 无密码**（非交互）。",
          "若仅用普通用户 SSH：请在目标机配置 `NOPASSWD`（例如限定 `/usr/bin/systemctl`、`/usr/local/bin/vector`、写 `/etc/vector`），或改用 **root 凭据**（云主机或 vCenter 虚拟机 SSH 设置中保存）。",
          "平台 **不会** 在远程执行中交互输入 sudo 密码；密码仅用于 SSH 认证（与云主机 / vCenter SSH 终端一致）。",
        ],
      },
      {
        title: "格式转换 / 多行 JSON",
        steps: [
          "纯文本行日志可直接用当前 Vector 模板（整行写入 `_msg`）。",
          "若为 **JSON 行**、**多行 stack**、**二进制**，请在虚拟机编辑 `/etc/vector/kube-bt-vmlog.toml`，增加官方 **remap / parse_json / reduce** 等 transform；也可改用 **Fluent Bit → VL** 等链路。",
          "助手当前不自动安装除 Vector 外的组件；需要时可自行在脚本基础上追加 `yum`/`apt` 依赖。",
        ],
      },
    ],
  },
  {
    id: "appcenter",
    label: "应用中心",
    short: "Redis、OpenClaw、云主机等（按 redis、openclaw、cloud-vm 等关键词粗筛）。",
    ingest: [
      {
        title: "应用日志",
        steps: [
          "集群内应用走容器日志采集；非 K8s 云主机与「vCenter / 虚拟机」类似，经 syslog/Agent 入库。",
        ],
      },
    ],
  },
  {
    id: "aiinspect",
    label: "AI 巡检",
    short: "监控、告警、OpenClaw 等（按 grafana、prometheus、alert、inspect 等粗筛）。",
    ingest: [
      {
        title: "运维组件",
        steps: [
          "Grafana / Alertmanager / 巡检 Pod 的 stdout 进入 VL 后即可在本类中聚合；可为日志增加 component 标签以便更精筛。",
        ],
      },
    ],
  },
  {
    id: "platform",
    label: "平台与账户",
    short: "登录、审计、会话等（按 audit、login、oauth 等粗筛）。",
    ingest: [
      {
        title: "平台类",
        steps: [
          "控制台审计仍以「账户 → 平台审计」为准；若导出到 VL，请保留 http_route、user 等字段。",
        ],
      },
    ],
  },
];

export const VM_LOG_REFRESH_OPTIONS = [
  { sec: 0, label: "不自动刷新" },
  { sec: 15, label: "每 15 秒" },
  { sec: 30, label: "每 30 秒" },
  { sec: 60, label: "每 60 秒" },
];

export const VM_LOG_WINDOW_OPTIONS_ALL = [
  { m: 15, label: "最近 15 分钟" },
  { m: 60, label: "最近 1 小时" },
  { m: 360, label: "最近 6 小时" },
  { m: 1440, label: "最近 24 小时" },
  { m: 10080, label: "最近 7 天" },
  { m: 43200, label: "最近 30 天" },
  { m: 129600, label: "最近 90 天" },
  { m: 259200, label: "最近 180 天" },
];

export const VM_LOG_BUCKET_OPTIONS = [
  { m: 1, label: "1 分钟桶" },
  { m: 5, label: "5 分钟桶" },
  { m: 15, label: "15 分钟桶" },
];

export const VM_LOG_KEYWORD_FIELD_OPTIONS = [
  { value: "any", label: "全部字段" },
  { value: "_msg", label: "仅消息 _msg" },
  { value: "filename", label: "文件名 filename" },
  { value: "host", label: "主机 host" },
  { value: "job", label: "任务 job" },
  { value: "vm_host", label: "虚拟机 vm_host" },
  { value: "log_source", label: "来源 log_source" },
  { value: "source", label: "摘要来源 source" },
  { value: "namespace", label: "命名空间 namespace" },
  { value: "pod", label: "Pod kubernetes.pod_name" },
];

export const VM_LOG_MAIN_TABS: { id: LogOverviewScope; label: string; short: string }[] = [
  {
    id: "project_config",
    label: "项目配置",
    short: "查看 VictoriaLogs、保留期、GeoLite 与采集相关配置的健康状态。",
  },
  {
    id: "pod",
    label: "Pod",
    short: "Kubernetes Pod / 容器日志的趋势、状态与分页明细。",
  },
  {
    id: "nginx",
    label: "Nginx",
    short: "Nginx 访问日志的趋势、访问聚合与分页明细。",
  },
  {
    id: "platform",
    label: "平台日志",
    short: "平台登录、审计、会话等日志的趋势与分页明细。",
  },
];

export type VmLogAIAnalyzeRes = {
  ok?: boolean;
  message?: string;
  summaryMarkdown?: string;
  newIssues?: { fingerprint: string; title: string; kind: string }[];
  newIssueDetails?: {
    fingerprint?: string;
    title?: string;
    classification?: string;
    evidence?: string;
    recommendation?: string;
  }[];
  knownIssueCount?: number;
  latencyMs?: number;
  matchedLines?: number;
  totalFetched?: number;
  parseError?: boolean;
  rawModel?: string;
  truncated?: boolean;
  scanWarning?: string;
};

export type VmLogAIAnalyzeRowRes = {
  ok?: boolean;
  summaryMarkdown?: string;
  latencyMs?: number;
  error?: string;
};
