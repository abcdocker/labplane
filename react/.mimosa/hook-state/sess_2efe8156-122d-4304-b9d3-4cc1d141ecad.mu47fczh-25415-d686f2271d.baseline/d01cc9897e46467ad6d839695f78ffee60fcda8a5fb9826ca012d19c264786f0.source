import React, { useMemo, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Database,
  Gauge,
  HardDrive,
  Layers,
  Network,
  Link2,
  Server,
  Cpu,
  Activity,
  PieChart,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGetJson, type AppConfig } from "@/lib/api";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { podDetailHref } from "./podPhaseStyle";
import {
  allScalarDefs,
  K8S_CHART_DEFS,
  K8S_TOPK_QUERIES,
  type K8sChartMetricDef,
  type K8sScalarMetricDef,
} from "./clusterK8sPrometheusMetrics";
import { stepForRangeMinutes } from "@/pages/ai-inspect/opsMonitoringChartHelpers";

function formatPromChartY(v: number, fmt: K8sChartMetricDef["valueFormat"]): string {
  if (!Number.isFinite(v)) return "—";
  switch (fmt) {
    case "cores":
      return `${v.toFixed(2)} 核`;
    case "bytes_gib":
      return `${(v / 1024 ** 3).toFixed(2)} Gi`;
    case "seconds":
      return v < 0.01 ? `${(v * 1000).toFixed(0)} ms` : `${v.toFixed(3)} s`;
    case "per_sec":
      return `${v.toFixed(2)} /s`;
    case "int":
      return String(Math.round(v));
    default:
      return String(v);
  }
}

function formatPromChartAxisTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatScalar(v: number | null, format: K8sScalarMetricDef["format"]): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (format) {
    case "cores":
      return `${v.toFixed(2)} 核`;
    case "bytes_gib":
      return `${(v / 1024 ** 3).toFixed(2)} Gi`;
    case "int":
      return String(Math.round(v));
    case "percent":
      return `${v.toFixed(1)}%`;
    case "seconds":
      return v < 0.01 ? `${(v * 1000).toFixed(0)} ms` : `${v.toFixed(3)} s`;
    case "per_sec":
      return `${v.toFixed(2)} /s`;
    case "raw2":
      return v.toFixed(2);
    default:
      return String(v);
  }
}

/** 单项指标无数据时的就地提示（不依赖用户滚动到汇总区） */
function DataGapHint({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-amber-200/90 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-950">
      <span className="font-semibold text-amber-900">拿不到数据：</span>
      {text}
    </p>
  );
}

function isScalarMissing(v: number | null | undefined): boolean {
  return v == null || !Number.isFinite(v);
}

const HINT_OVERVIEW_CPU_USAGE =
  "容器 CPU 用量：与 Top 排行、Pod 资源效率同源（namespace/pod 非空、container 非 POD）；不含 id=\"/\" 整机 cgroup。请确认 Prometheus 已抓取 kubelet/cAdvisor。";
const HINT_OVERVIEW_CPU_ALLOC =
  "CPU 可分配：sum(kube_node_status_allocatable{resource=\"cpu\"})，即各节点向 Pod 开放的核数（已扣 kube 系统预留）。需 kube-state-metrics。";
const HINT_OVERVIEW_CPU_REQ =
  "CPU 请求来自 kube_pod_container_resource_requests。需 kube-state-metrics；未配置 requests 的 Pod 为 0。";
const HINT_OVERVIEW_MEM_USAGE =
  "内存用量：与「命名空间 Top」「Pod 资源」卡片的 working set 同源（namespace/pod 非空、排除 POD 占位、不要求 image 标签）。旧版若仅匹配 image 非空会漏掉大量容器导致数值明显偏低。依赖 kubelet/cAdvisor 抓取。";
const HINT_OVERVIEW_MEM_ALLOC =
  "内存可分配：sum(kube_node_status_allocatable{resource=\"memory\"})，向 Pod 开放的内存（已扣 kube 预留）。需 kube-state-metrics。";
const HINT_OVERVIEW_MEM_REQ = "内存请求来自 kube_pod_container_resource_requests，需 kube-state-metrics。";
const HINT_OVERVIEW_PODS = "Running Pod 数需 kube-state-metrics（kube_pod_status_phase）。";
const HINT_OVERVIEW_POD_CAP =
  "Pod 槽位：优先 sum(kube_node_status_allocatable{resource=\"pods\"})（可调度、已扣预留）；若无再试 capacity。需 kube-state-metrics。";
const HINT_OVERVIEW_DISK =
  "磁盘来自 node-exporter 的 node_filesystem_*。请安装 node-exporter 并抓取；仅统计 mountpoint=\"/\" 且非 tmpfs，若节点根分区路径不同则无数据。";
const HINT_LEGACY_UP =
  "count(up) 无结果：Prometheus 自身可能未就绪，或查询被拒绝。请检查集群设置中的 Prometheus URL 与网络。";
const HINT_LEGACY_TSDB =
  "prometheus_tsdb_head_series 仅 Prometheus 自监控有；VictoriaMetrics vmselect 可能无此指标，属正常现象，可忽略。";

const CORE_METRICS: {
  key: string;
  title: string;
  query: string;
  icon: typeof Gauge;
  hint: string;
}[] = [
  {
    key: "apiserver",
    title: "kube-apiserver up",
    query: `max(up{job=~"kube-apiserver|apiserver"})`,
    icon: Server,
    hint: "为 apiserver 配置 ServiceMonitor 或静态抓取。",
  },
  {
    key: "etcd",
    title: "etcd up",
    query: `max(up{job=~"etcd|kube-etcd"})`,
    icon: Database,
    hint: "自建集群可启用 kubeEtcd；托管集群多不可见。",
  },
  {
    key: "kubelet",
    title: "kubelet 目标数",
    query: `count(up{job="kubelet"})`,
    icon: Cpu,
    hint: "kube-prometheus 默认抓取各节点 kubelet。",
  },
  {
    key: "controller",
    title: "kube-controller-manager up",
    query: `max(up{job=~"kube-controller-manager|controller-manager"})`,
    icon: HardDrive,
    hint: "一键安装已默认 kubeControllerManager.enabled=true；托管云控制面不可达时仍可能为 0。",
  },
];

const SECTION_LABEL: Record<K8sScalarMetricDef["section"], string> = {
  quota: "调度配额（allocatable / requests / limits）",
  usage: "工作负载用量（cAdvisor / kube-state-metrics）",
  controlplane: "API Server（控制面）",
  scheduler: "调度器",
  nodes: "节点",
  storage: "物理磁盘（node-exporter · 根分区估算）",
};

const SECTION_ICONS: Partial<Record<K8sScalarMetricDef["section"], typeof Gauge>> = {
  quota: PieChart,
  usage: Activity,
  controlplane: Server,
  scheduler: BarChart3,
  nodes: Layers,
  storage: HardDrive,
};

type K8sPrometheusChartRow = {
  id: string;
  section: K8sChartMetricDef["section"];
  title: string;
  subtitle?: string;
  chart: { x: number; v: number }[];
  usedQuery: string;
  valueFormat: K8sChartMetricDef["valueFormat"];
  accent: string;
  missingHint: string;
};

type ClusterPromChartsApi = {
  rows?: K8sPrometheusChartRow[];
  cachedAt?: string;
  days?: number;
  warming?: boolean;
};

type ClusterPromSnapshotApi = {
  scalars?: Record<string, number | null>;
  coreUp?: Record<string, number | null>;
  legacy?: { upSeries?: number | null; tsdbSeries?: number | null };
  topk?: {
    namespaceCpu?: Array<{ metric: Record<string, string>; value: number }>;
    namespaceMem?: Array<{ metric: Record<string, string>; value: number }>;
    podCpu?: Array<{ metric: Record<string, string>; value: number }>;
    podMem?: Array<{ metric: Record<string, string>; value: number }>;
  };
  cachedAt?: string;
  warming?: boolean;
};

type PodNetWindow = "1m" | "10m" | "1d" | "3d" | "7d";

type PodNetTopRow = {
  namespace: string;
  pod: string;
  receiveBytes: number;
  transmitBytes: number;
  totalBytes: number;
  /** 当前 instant 的 TCP 套接字计数（与流量窗口无关） */
  tcpConnections?: number | null;
};

type PodNetTopApi = {
  windows?: Record<string, { pods?: PodNetTopRow[]; error?: string | null }>;
  queries?: Record<string, { receive?: string; transmit?: string }>;
  topN?: number;
  hint?: string;
  tcpConnectionsQuery?: string;
  tcpConnectionsAvailable?: boolean;
  trafficMetrics?: string[];
};

const POD_NET_WINDOW_OPTIONS: { id: PodNetWindow; label: string }[] = [
  { id: "1m", label: "最近 1 分钟" },
  { id: "10m", label: "最近 10 分钟" },
  { id: "1d", label: "最近 1 天" },
  { id: "3d", label: "最近 3 天" },
  { id: "7d", label: "最近 7 天" },
];

const HINT_POD_NET_TOP =
  "无流量数据：请确认已抓取 kubelet/cAdvisor 的 container_network_receive_bytes_total 与 container_network_transmit_bytes_total。长窗口受 TSDB 保留时长限制。";

function formatTcpConnections(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("zh-CN");
}

function formatPodNetBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(2)} TiB`;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${n.toFixed(0)} B`;
}

const SECTION_TREND_SHELL: Record<
  Exclude<K8sScalarMetricDef["section"], "nodes">,
  { ring: string; panel: string; accentBar: string }
> = {
  quota: {
    ring: "ring-violet-200/40",
    panel: "from-white via-violet-50/30 to-indigo-50/25",
    accentBar: "from-violet-500 via-indigo-500 to-blue-500",
  },
  usage: {
    ring: "ring-sky-200/50",
    panel: "from-white via-sky-50/25 to-blue-50/20",
    accentBar: "from-blue-500 via-sky-500 to-cyan-500",
  },
  controlplane: {
    ring: "ring-blue-200/50",
    panel: "from-white via-blue-50/35 to-sky-50/25",
    accentBar: "from-blue-600 via-sky-500 to-indigo-500",
  },
  scheduler: {
    ring: "ring-teal-200/45",
    panel: "from-white via-teal-50/25 to-emerald-50/20",
    accentBar: "from-teal-500 via-emerald-500 to-cyan-500",
  },
  storage: {
    ring: "ring-amber-200/45",
    panel: "from-white via-amber-50/25 to-orange-50/15",
    accentBar: "from-amber-500 via-orange-400 to-yellow-500",
  },
};

const CHART_DEF_ORDER = new Map(K8S_CHART_DEFS.map((d, i) => [d.id, i]));

function K8sPrometheusTrendCard({ c }: { c: K8sPrometheusChartRow }) {
  const h = 224;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100/90 bg-white p-4 shadow-[0_8px_32px_-10px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03] transition-shadow hover:shadow-[0_12px_40px_-10px_rgba(15,23,42,0.1)] dark:border-slate-700/80 dark:bg-slate-950/85 dark:ring-white/[0.05]">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100/90 pb-2.5 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">{c.title}</p>
          {c.subtitle ? (
            <p className="mt-0.5 text-[10px] leading-snug text-slate-500 dark:text-slate-400">{c.subtitle}</p>
          ) : null}
        </div>
        <span
          className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white shadow-sm dark:ring-slate-900"
          style={{ backgroundColor: c.accent }}
          aria-hidden
        />
      </div>
      {c.usedQuery ? (
        <p className="mt-1.5 line-clamp-2 font-mono text-[9px] leading-relaxed text-slate-400 break-all dark:text-slate-500">
          {c.usedQuery}
        </p>
      ) : null}
      {c.chart.length === 0 ? (
        <div className="mt-2.5">
          <DataGapHint text={c.missingHint} />
        </div>
      ) : (
        <div className="mt-2.5 w-full [&_.recharts-surface]:overflow-visible" style={{ height: h }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={c.chart} margin={{ top: 10, right: 8, left: 0, bottom: 2 }}>
              <defs>
                <linearGradient id={`k8s-grad-${c.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.accent} stopOpacity={0.42} />
                  <stop offset="55%" stopColor={c.accent} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={c.accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e2e8f0" opacity={0.9} className="dark:stroke-slate-700/80" />
              <XAxis
                type="number"
                dataKey="x"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(ms) => formatPromChartAxisTime(ms as number)}
                tick={{ fontSize: 9, fill: "#64748b" }}
                minTickGap={28}
                axisLine={{ stroke: "#cbd5e1" }}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#64748b" }}
                width={52}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatPromChartY(v as number, c.valueFormat)}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as { x: number; v: number };
                  return (
                    <div className="rounded-full border-0 bg-blue-600 px-3 py-2 text-xs text-white shadow-lg shadow-blue-600/30">
                      <p className="font-mono text-[10px] text-blue-100">{formatPromChartAxisTime(p.x)}</p>
                      <p className="mt-0.5 text-sm font-bold tabular-nums">{formatPromChartY(p.v, c.valueFormat)}</p>
                    </div>
                  );
                }}
              />
              <Area
                type="natural"
                dataKey="v"
                name={c.title}
                stroke={c.accent}
                strokeWidth={2.5}
                fill={`url(#k8s-grad-${c.id})`}
                dot={false}
                activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff", fill: c.accent }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

const NS_RANK_PALETTE = ["#4f46e5", "#6366f1", "#7c3aed", "#8b5cf6", "#a855f7", "#c026d3", "#db2777", "#e11d48"];

type RankRow = { metric: Record<string, string>; value: number };

function formatRankValue(v: number, format: "cores" | "bytes_gib"): string {
  if (format === "cores") return `${v.toFixed(3)} 核`;
  return `${(v / 1024 ** 3).toFixed(2)} Gi`;
}

function formatRankLabel(row: RankRow, kind: "namespace" | "pod"): string {
  const ns = row.metric.namespace?.trim() || "?";
  if (kind === "namespace") return ns;
  const pod = row.metric.pod?.trim() || "?";
  return `${ns}/${pod}`;
}

function RankTopSummaryCard({
  title,
  row,
  hint,
  format,
  rankKind,
  accentFrom,
  accentTo,
  warming,
}: {
  title: string;
  row?: RankRow | null;
  hint: string;
  format: "cores" | "bytes_gib";
  rankKind: "namespace" | "pod";
  accentFrom: string;
  accentTo: string;
  warming?: boolean;
}) {
  const label = row ? formatRankLabel(row, rankKind) : "—";
  const entityLabel = rankKind === "pod" ? "Pod" : "命名空间";

  return (
    <div
      className="overflow-hidden rounded-3xl border border-slate-100/90 shadow-[0_8px_36px_-12px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03] dark:border-slate-700/80 dark:shadow-none"
      style={{
        background: `linear-gradient(135deg, ${accentFrom}14 0%, transparent 58%), linear-gradient(to bottom, rgba(255,255,255,0.98), rgba(248,250,252,0.95))`,
      }}
    >
      <div className="border-b border-slate-100/80 px-4 py-3.5 dark:border-slate-800">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-[11px] text-slate-500">当前即时快照中的 {entityLabel} 第一名</p>
      </div>
      <div className="space-y-3 px-4 py-4">
        {!row ? (
          warming ? (
            <p className="rounded-lg border border-sky-200/80 bg-sky-50/80 px-2.5 py-2 text-[11px] leading-relaxed text-sky-900">
              后台加载中…
            </p>
          ) : (
            <DataGapHint text={hint} />
          )
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <span
                className="inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm"
                style={{ background: `linear-gradient(135deg, ${accentFrom}, ${accentTo})` }}
              >
                Top1
              </span>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[12px] font-semibold tabular-nums text-slate-900">
                {formatRankValue(row.value, format)}
              </span>
            </div>
            <p className="break-all font-mono text-[13px] font-semibold text-slate-900">{label}</p>
          </>
        )}
      </div>
    </div>
  );
}

function WorkloadRankStatsCard({
  title,
  query,
  hint,
  rows,
  format,
  accentFrom,
  accentTo,
  rankKind,
  warming,
}: {
  title: string;
  query: string;
  hint: string;
  rows: RankRow[];
  format: "cores" | "bytes_gib";
  accentFrom: string;
  accentTo: string;
  rankKind: "namespace" | "pod";
  /** 服务端快照写入 Redis 中：无行时不展示「拿不到数据」类排查文案 */
  warming?: boolean;
}) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.value - a.value).slice(0, 8), [rows]);
  const maxV = sorted[0]?.value ?? 0;
  const sumTop = useMemo(() => sorted.reduce((s, r) => s + r.value, 0), [sorted]);
  const entityLabel = rankKind === "pod" ? "Pod" : "命名空间";

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-100/90 bg-gradient-to-br from-white via-slate-50/40 to-slate-100/30 shadow-[0_8px_36px_-12px_rgba(15,23,42,0.09)] ring-1 ring-slate-900/[0.03]">
      <div
        className="relative border-b border-slate-200/70 px-4 py-3.5"
        style={{
          background: `linear-gradient(135deg, ${accentFrom}12 0%, transparent 55%), linear-gradient(to bottom, rgba(255,255,255,0.85), rgba(248,250,252,0.9))`,
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="mt-1 text-[11px] text-slate-600">
              Top {sorted.length} {entityLabel} · 合计{" "}
              <span className="font-mono font-semibold text-slate-800">{formatRankValue(sumTop, format)}</span>
            </p>
          </div>
          <div
            className="rounded-lg px-2 py-1 text-[10px] font-medium text-white shadow-sm"
            style={{ background: `linear-gradient(135deg, ${accentFrom}, ${accentTo})` }}
          >
            实时排行
          </div>
        </div>
        <pre className="mt-2 line-clamp-2 font-mono text-[9px] leading-relaxed text-slate-400 break-all">{query}</pre>
      </div>
      <div className="space-y-3.5 px-4 py-4">
        {!sorted.length ? (
          warming ? (
            <p className="rounded-lg border border-sky-200/80 bg-sky-50/80 px-2.5 py-2 text-[11px] leading-relaxed text-sky-900">
              后台加载中…
            </p>
          ) : (
            <DataGapHint text={hint} />
          )
        ) : (
          sorted.map((row, i) => {
            const pct = maxV > 0 ? Math.min(100, (row.value / maxV) * 100) : 0;
            const col = NS_RANK_PALETTE[i % NS_RANK_PALETTE.length];
            const label = formatRankLabel(row, rankKind);
            return (
              <div key={`${label}-${i}`} className="group">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-bold text-white shadow-sm">
                      {i + 1}
                    </span>
                    <span className="truncate font-mono text-slate-800" title={label}>
                      {label}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-900">
                    {formatRankValue(row.value, format)}
                  </span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/40 dark:bg-slate-800 dark:ring-slate-700/50">
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${col}, ${col}dd)`,
                      boxShadow: `0 2px 12px ${col}55`,
                    }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const ClusterPrometheusPanel: React.FC<{ compactIntro?: boolean }> = ({ compactIntro }) => {
  const [chartDays, setChartDays] = useState(7);
  const [podNetWindow, setPodNetWindow] = useState<PodNetWindow>("1d");
  const cfgQ = useAppConfig();

  const promEnabled = cfgQ.data?.prometheusK8sConfigured === true || cfgQ.data?.prometheusConfigured === true;

  const scalarDefs = useMemo(() => allScalarDefs(), []);

  const bySection = useMemo(() => {
    const m = new Map<K8sScalarMetricDef["section"], K8sScalarMetricDef[]>();
    for (const d of scalarDefs) {
      const list = m.get(d.section) ?? [];
      list.push(d);
      m.set(d.section, list);
    }
    return m;
  }, [scalarDefs]);

  const snapshotQ = useQuery({
    queryKey: ["cluster-prometheus-snapshot"],
    queryFn: ({ signal }) => apiGetJson<ClusterPromSnapshotApi>("/api/k8s/prometheus/cluster-snapshot", { signal }),
    enabled: promEnabled,
    staleTime: 0,
    refetchInterval: (q) => (q.state.data?.warming === true ? 2500 : 120_000),
  });

  const podNetTopQ = useQuery({
    queryKey: ["cluster-prometheus-pod-network-top"],
    queryFn: ({ signal }) => apiGetJson<PodNetTopApi>("/api/k8s/prometheus/pod-network-top", { signal }),
    enabled: promEnabled,
    staleTime: 90_000,
    refetchInterval: 180_000,
  });

  const chartRangeMinutes = chartDays * 24 * 60;

  const chartsQ = useQuery({
    queryKey: ["cluster-prometheus-charts", chartDays],
    queryFn: ({ signal }) => apiGetJson<ClusterPromChartsApi>(`/api/k8s/prometheus/cluster-charts?days=${chartDays}`, { signal }),
    enabled: promEnabled,
    staleTime: 0,
    refetchInterval: (q) => (q.state.data?.warming === true ? 2500 : 120_000),
  });

  const chartRows: K8sPrometheusChartRow[] = useMemo(() => {
    const raw = chartsQ.data?.rows ?? [];
    return raw.map((r) => ({
      ...r,
      section: r.section as K8sPrometheusChartRow["section"],
      chart: Array.isArray(r.chart) ? r.chart : [],
    }));
  }, [chartsQ.data?.rows]);

  const chartsWarming =
    chartsQ.data?.warming === true &&
    (chartRows.length === 0 || chartRows.every((r) => !r.chart || r.chart.length === 0));

  if (cfgQ.isLoading || !cfgQ.data) {
    return null;
  }
  const cfg = cfgQ.data;
  if (!cfg.k8sConfigured) {
    return null;
  }

  if (!promEnabled) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 px-5 py-4 text-sm text-amber-950">
          <p className="font-medium">未配置 Prometheus</p>
          <p className="mt-1 text-xs text-amber-900/90">
            本页需可访问的 Kubernetes Prometheus（或 VictoriaMetrics vmselect）。推荐 kube-prometheus-stack 以补齐 ksm、cAdvisor、控制面抓取。
          </p>
          <Link
            to="/cluster/settings"
            className="mt-2 inline-block text-sm font-semibold text-amber-950 underline underline-offset-2"
          >
            前往 Cluster settings → Monitoring
          </Link>
        </div>
      </div>
    );
  }

  const scalars = snapshotQ.data?.scalars ?? {};
  const coreVals = snapshotQ.data?.coreUp ?? {};
  const legacy = snapshotQ.data?.legacy ?? { upSeries: null, tsdbSeries: null };
  const instantWarming =
    snapshotQ.data?.warming === true && (!snapshotQ.data?.cachedAt || snapshotQ.data.cachedAt === "");

  const namespaceCpuRows = [...(snapshotQ.data?.topk?.namespaceCpu ?? [])].sort((a, b) => b.value - a.value);
  const namespaceMemRows = [...(snapshotQ.data?.topk?.namespaceMem ?? [])].sort((a, b) => b.value - a.value);
  const podCpuRows = [...(snapshotQ.data?.topk?.podCpu ?? [])].sort((a, b) => b.value - a.value);
  const podMemRows = [...(snapshotQ.data?.topk?.podMem ?? [])].sort((a, b) => b.value - a.value);
  const cpuTopPod = podCpuRows[0] ?? null;
  const memTopPod = podMemRows[0] ?? null;

  const allocCpu = scalars.alloc_cpu_cores;
  const reqCpu = scalars.req_cpu_cores;
  const allocMem = scalars.alloc_mem_bytes;
  const reqMem = scalars.req_mem_bytes;
  const useCpu = scalars.cpu_usage_cores;
  const useMem = scalars.mem_wss_bytes;
  const podsRun = scalars.pods_running;
  const podsAllocSlots = scalars.pods_allocatable;
  const podsCapSlots = scalars.pods_capacity;
  const podsDenomSlots = podsAllocSlots ?? podsCapSlots;
  const podsDenomIsAllocatable = podsAllocSlots != null && Number.isFinite(podsAllocSlots);

  const ratio = (a: number | null | undefined, b: number | null | undefined) =>
    a != null && b != null && b > 0 && Number.isFinite(a) && Number.isFinite(b) ? (a / b) * 100 : null;

  const trendSections: Array<Exclude<K8sScalarMetricDef["section"], "nodes">> = [
    "usage",
    "quota",
    "controlplane",
    "scheduler",
    "storage",
  ];
  const nodeDefs = bySection.get("nodes") ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          {compactIntro ? (
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Metrics</p>
          ) : null}
          <h2
            className={cn(
              "font-bold tracking-tight text-slate-900 dark:text-slate-50",
              compactIntro ? "text-base" : "text-lg"
            )}
          >
            {compactIntro ? "监控 · Prometheus" : "Prometheus · 集群负载与控制面"}
          </h2>
          {!compactIntro ? (
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              指标来自 kube-state-metrics、kubelet/cAdvisor、node-exporter、apiserver、scheduler 等常见抓取。
              趋势按<strong>工作负载 → 配额 → 控制面 → 调度器 → 磁盘</strong>分组；数据由<strong>服务端</strong>聚合后缓存（Redis），趋势可选 1～7 天。
              「—」或无曲线时见各块「拿不到数据」说明。
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">趋势</span>
            <Select
              value={String(chartDays)}
              onValueChange={(v) => setChartDays(Math.min(7, Math.max(1, Number.parseInt(v, 10) || 7)))}
            >
              <SelectTrigger className="h-9 w-[7.75rem] rounded-xl border-slate-200 bg-white text-xs shadow-sm dark:border-slate-600 dark:bg-slate-900">
                <SelectValue placeholder="天数" />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <SelectItem key={d} value={String(d)} className="text-xs">
                    最近 {d} 天
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Link to="/cluster/settings" className="text-xs font-medium text-blue-600 hover:underline">
            数据源设置
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100/90 bg-gradient-to-br from-white via-slate-50/50 to-blue-50/20 px-5 py-5 shadow-[0_8px_36px_-12px_rgba(15,23,42,0.07)] dark:border-slate-700/80 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900/80 dark:shadow-none">
        <h3 className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          {compactIntro ? "资源一览" : "集群资源一览（可分配 vs 请求 vs 实际）"}
        </h3>
        <p className="mb-3 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          可分配 / 可调度槽位 = 向 Pod 开放（kube 在节点上预留后）；用量 = 与「命名空间 Top」「Pod 资源」同一套 cAdvisor
          标签过滤后的工作负载容器聚合，非整机 cgroup。
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2 rounded-2xl border border-slate-100/90 bg-white px-4 py-3 text-xs shadow-sm dark:border-slate-700/80 dark:bg-slate-950/60">
            <p className="font-semibold text-slate-600 dark:text-slate-300">CPU</p>
            <p className="mt-1 font-mono text-sm text-slate-900">
              用量 {formatScalar(useCpu, "cores")} / 可分配 {formatScalar(allocCpu, "cores")}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              请求 {formatScalar(reqCpu, "cores")}
              {ratio(useCpu, allocCpu) != null ? ` · 用量占可分配 ${ratio(useCpu, allocCpu)!.toFixed(1)}%` : ""}
            </p>
            {!instantWarming && isScalarMissing(useCpu) ? <DataGapHint text={HINT_OVERVIEW_CPU_USAGE} /> : null}
            {!instantWarming && isScalarMissing(allocCpu) ? <DataGapHint text={HINT_OVERVIEW_CPU_ALLOC} /> : null}
            {!instantWarming && !isScalarMissing(allocCpu) && isScalarMissing(reqCpu) ? (
              <DataGapHint text={HINT_OVERVIEW_CPU_REQ} />
            ) : null}
          </div>
          <div className="space-y-2 rounded-2xl border border-slate-100/90 bg-white px-4 py-3 text-xs shadow-sm dark:border-slate-700/80 dark:bg-slate-950/60">
            <p className="font-semibold text-slate-600 dark:text-slate-300">内存</p>
            <p className="mt-1 font-mono text-sm text-slate-900">
              用量 {formatScalar(useMem, "bytes_gib")} / 可分配 {formatScalar(allocMem, "bytes_gib")}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              请求 {formatScalar(reqMem, "bytes_gib")}
              {ratio(useMem, allocMem) != null ? ` · 用量占可分配 ${ratio(useMem, allocMem)!.toFixed(1)}%` : ""}
            </p>
            {!instantWarming && isScalarMissing(useMem) ? <DataGapHint text={HINT_OVERVIEW_MEM_USAGE} /> : null}
            {!instantWarming && isScalarMissing(allocMem) ? <DataGapHint text={HINT_OVERVIEW_MEM_ALLOC} /> : null}
            {!instantWarming && !isScalarMissing(allocMem) && isScalarMissing(reqMem) ? (
              <DataGapHint text={HINT_OVERVIEW_MEM_REQ} />
            ) : null}
          </div>
          <div className="space-y-2 rounded-2xl border border-slate-100/90 bg-white px-4 py-3 text-xs shadow-sm dark:border-slate-700/80 dark:bg-slate-950/60">
            <p className="font-semibold text-slate-600 dark:text-slate-300">容器组（Pod）</p>
            <p className="mt-1 font-mono text-sm text-slate-900">
              Running {formatScalar(podsRun, "int")} / {podsDenomIsAllocatable ? "可调度" : "容量"}{" "}
              {formatScalar(podsDenomSlots, "int")}
            </p>
            {ratio(podsRun, podsDenomSlots) != null ? (
              <p className="mt-1 text-[11px] text-slate-500">
                占{podsDenomIsAllocatable ? "可调度槽位" : "容量"} {ratio(podsRun, podsDenomSlots)!.toFixed(1)}%
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-500">需同时有 Running 与可调度槽位（或容量）数据</p>
            )}
            {!instantWarming && isScalarMissing(podsRun) ? <DataGapHint text={HINT_OVERVIEW_PODS} /> : null}
            {!instantWarming && isScalarMissing(podsDenomSlots) ? <DataGapHint text={HINT_OVERVIEW_POD_CAP} /> : null}
          </div>
          <div className="space-y-2 rounded-2xl border border-slate-100/90 bg-white px-4 py-3 text-xs shadow-sm dark:border-slate-700/80 dark:bg-slate-950/60">
            <p className="font-semibold text-slate-600 dark:text-slate-300">磁盘（根分区估算）</p>
            <p className="mt-1 font-mono text-sm text-slate-900">
              可用 {formatScalar(scalars.disk_avail_bytes, "bytes_gib")} / 总{" "}
              {formatScalar(scalars.disk_total_bytes, "bytes_gib")}
            </p>
            {scalars.disk_total_bytes != null &&
            scalars.disk_avail_bytes != null &&
            scalars.disk_total_bytes > 0 ? (
              <p className="mt-1 text-[11px] text-slate-500">
                已用约{" "}
                {(
                  ((scalars.disk_total_bytes - scalars.disk_avail_bytes) / scalars.disk_total_bytes) *
                  100
                ).toFixed(1)}
                %
              </p>
            ) : null}
            {!instantWarming &&
            (isScalarMissing(scalars.disk_total_bytes) || isScalarMissing(scalars.disk_avail_bytes)) ? (
              <DataGapHint text={HINT_OVERVIEW_DISK} />
            ) : null}
          </div>
        </div>
      </div>

      {snapshotQ.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50/90 px-4 py-2.5 text-xs text-red-950">
          <span className="font-semibold">即时指标加载失败：</span>
          {(snapshotQ.error as Error).message}
          <Link to="/cluster/settings" className="ml-2 font-medium text-red-900 underline">
            检查配置
          </Link>
        </div>
      ) : null}
      {instantWarming ? (
        <div className="rounded-xl border border-sky-200/90 bg-sky-50/90 px-4 py-2.5 text-xs leading-relaxed text-sky-950">
          <span className="font-semibold text-sky-900">即时指标后台加载中：</span>
          服务端正在写入 Redis 缓存（首次进入或缓存过期）。下方卡片会在就绪后自动刷新，无需整页等待。
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-100/90 bg-gradient-to-br from-white via-slate-50/40 to-indigo-50/15 p-5 shadow-[0_8px_36px_-12px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03] sm:p-6 dark:border-slate-700/80 dark:from-slate-950 dark:via-slate-950 dark:to-indigo-950/20 dark:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">资源排行汇总</h3>
            <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-slate-600">
              当前即时快照中的 Pod / 命名空间 CPU 与内存占用排行；条形长度为相对 Top1 的占比，右侧为绝对值。
            </p>
          </div>
          {snapshotQ.data?.cachedAt ? (
            <p className="text-[10px] text-slate-400">快照 {snapshotQ.data.cachedAt.slice(0, 19).replace("T", " ")}</p>
          ) : null}
        </div>
        {snapshotQ.isError ? (
          <div className="mt-4">
            <DataGapHint text="资源排行与上方即时指标同源；即时指标请求失败时已显示错误条，请修复后刷新。" />
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="grid gap-4 xl:grid-cols-2">
              <RankTopSummaryCard
                title="CPU Top1 Pod"
                row={cpuTopPod}
                hint={K8S_TOPK_QUERIES.podCpu.hint}
                format="cores"
                rankKind="pod"
                accentFrom="#0f766e"
                accentTo="#14b8a6"
                warming={instantWarming}
              />
              <RankTopSummaryCard
                title="内存 Top1 Pod"
                row={memTopPod}
                hint={K8S_TOPK_QUERIES.podMem.hint}
                format="bytes_gib"
                rankKind="pod"
                accentFrom="#be185d"
                accentTo="#ec4899"
                warming={instantWarming}
              />
            </div>
            <div className="grid gap-5 2xl:grid-cols-2">
              <WorkloadRankStatsCard
                title={K8S_TOPK_QUERIES.podCpu.title}
                query={K8S_TOPK_QUERIES.podCpu.q}
                hint={K8S_TOPK_QUERIES.podCpu.hint}
                rows={podCpuRows}
                format="cores"
                rankKind="pod"
                accentFrom="#0f766e"
                accentTo="#14b8a6"
                warming={instantWarming}
              />
              <WorkloadRankStatsCard
                title={K8S_TOPK_QUERIES.podMem.title}
                query={K8S_TOPK_QUERIES.podMem.q}
                hint={K8S_TOPK_QUERIES.podMem.hint}
                rows={podMemRows}
                format="bytes_gib"
                rankKind="pod"
                accentFrom="#be185d"
                accentTo="#ec4899"
                warming={instantWarming}
              />
              <WorkloadRankStatsCard
                title={K8S_TOPK_QUERIES.namespaceCpu.title}
                query={K8S_TOPK_QUERIES.namespaceCpu.q}
                hint={K8S_TOPK_QUERIES.namespaceCpu.hint}
                rows={namespaceCpuRows}
                format="cores"
                rankKind="namespace"
                accentFrom="#4f46e5"
                accentTo="#6366f1"
                warming={instantWarming}
              />
              <WorkloadRankStatsCard
                title={K8S_TOPK_QUERIES.namespaceMem.title}
                query={K8S_TOPK_QUERIES.namespaceMem.q}
                hint={K8S_TOPK_QUERIES.namespaceMem.hint}
                rows={namespaceMemRows}
                format="bytes_gib"
                rankKind="namespace"
                accentFrom="#db2777"
                accentTo="#e11d48"
                warming={instantWarming}
              />
            </div>
          </div>
        )}
      </div>

      <Card className="overflow-hidden border-slate-200/90 bg-gradient-to-br from-white via-slate-50/80 to-sky-50/30 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.12)] dark:border-slate-700/90 dark:from-slate-950 dark:via-slate-950 dark:to-sky-950/20 dark:shadow-none">
        <CardHeader className="space-y-0 border-b border-slate-200/70 bg-white/60 pb-4 pt-5 dark:border-slate-800 dark:bg-slate-950/50 sm:flex sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="flex gap-3 pr-2">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-600/25">
              <Network className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-50">
                Pod 网络流量 Top
              </CardTitle>
              <CardDescription className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                核心只需 <span className="font-mono text-[10px] text-slate-500">container_network_receive_bytes_total</span> 与{" "}
                <span className="font-mono text-[10px] text-slate-500">container_network_transmit_bytes_total</span>；各窗口用{" "}
                <span className="font-mono text-[10px] text-slate-500">increase(...[range])</span> 估算<strong>累计字节</strong>，排行按{" "}
                <strong className="text-slate-800 dark:text-slate-200">下载+上传</strong>。
                <strong className="text-slate-800 dark:text-slate-200">连接数</strong>列仅在 Prometheus 能查到{" "}
                <span className="font-mono text-[10px]">container_network_tcp_open_sockets</span> 等套接字指标时出现；仅有 bytes
                类 counter 时表格会自动隐藏该列。一次请求拉齐 1m / 10m / 1d / 3d / 7d，切换窗口不重复查询。
              </CardDescription>
              {podNetTopQ.data?.tcpConnectionsQuery ? (
                <p className="mt-2 line-clamp-2 font-mono text-[9px] leading-snug text-slate-400 dark:text-slate-500">
                  连接数 PromQL：{podNetTopQ.data.tcpConnectionsQuery}
                </p>
              ) : null}
              {podNetTopQ.data?.hint ? (
                <p className="mt-1.5 text-[10px] leading-snug text-slate-500 dark:text-slate-500">{podNetTopQ.data.hint}</p>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex shrink-0 flex-col gap-1.5 sm:mt-0 sm:items-end">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              流量统计范围
            </span>
            <Select value={podNetWindow} onValueChange={(v) => setPodNetWindow(v as PodNetWindow)}>
              <SelectTrigger className="h-9 w-[min(100vw-2rem,12.5rem)] rounded-xl border-slate-200 bg-white/95 text-xs shadow-sm dark:border-slate-600 dark:bg-slate-900/95">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POD_NET_WINDOW_OPTIONS.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-5 pt-4 sm:px-6">
          {podNetTopQ.isLoading ? (
            <p className="text-center text-sm text-slate-500">加载 Pod 网络排行…</p>
          ) : podNetTopQ.isError ? (
            <DataGapHint
              text={`Pod 网络排行加载失败：${(podNetTopQ.error as Error).message}。请确认已配置 prometheusUrlK8s 且进程可访问 Prometheus API。`}
            />
          ) : (() => {
              const w = podNetTopQ.data?.windows?.[podNetWindow];
              const rows = w?.pods ?? [];
              const winErr = w?.error?.trim();
              const showConn = podNetTopQ.data?.tcpConnectionsAvailable === true;
              if (winErr) {
                return <DataGapHint text={`本时间窗口查询失败：${winErr}`} />;
              }
              if (rows.length === 0) {
                return <DataGapHint text={HINT_POD_NET_TOP} />;
              }
              return (
                <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-inner dark:border-slate-700 dark:bg-slate-950/80">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-0 bg-gradient-to-r from-slate-100/95 to-sky-50/50 hover:bg-transparent dark:from-slate-800/95 dark:to-slate-900/50">
                          <TableHead className="w-11 min-w-[2.5rem] py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            #
                          </TableHead>
                          <TableHead className="min-w-[10rem] py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Pod
                          </TableHead>
                          <TableHead className="min-w-[5.5rem] py-3 text-right text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                            下载
                          </TableHead>
                          <TableHead className="min-w-[5.5rem] py-3 text-right text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                            上传
                          </TableHead>
                          <TableHead className="min-w-[5.5rem] py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                            合计
                          </TableHead>
                          {showConn ? (
                            <TableHead className="min-w-[5.5rem] py-3 text-right text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                              <span className="inline-flex items-center justify-end gap-1 normal-case">
                                <Link2 className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                                连接数
                              </span>
                            </TableHead>
                          ) : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, idx) => (
                          <TableRow
                            key={`${r.namespace}/${r.pod}`}
                            className={cn(
                              "border-slate-100/90 transition-colors hover:bg-sky-50/50 dark:border-slate-800/80 dark:hover:bg-slate-800/50",
                              idx % 2 === 1 && "bg-slate-50/35 dark:bg-slate-900/40"
                            )}
                          >
                            <TableCell className="py-2.5 font-mono text-xs font-medium text-slate-400 dark:text-slate-500">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="max-w-[min(100vw,22rem)] py-2.5">
                              <Link
                                to={podDetailHref(r.namespace, r.pod)}
                                className="block truncate font-mono text-xs font-semibold text-blue-700 hover:underline dark:text-sky-400"
                                title={`${r.namespace}/${r.pod}`}
                              >
                                <span className="text-slate-500 dark:text-slate-400">{r.namespace}</span>
                                <span className="text-slate-400 dark:text-slate-600">/</span>
                                <span className="text-slate-900 dark:text-slate-100">{r.pod}</span>
                              </Link>
                            </TableCell>
                            <TableCell className="py-2.5 text-right font-mono text-xs tabular-nums text-emerald-900/90 dark:text-emerald-100/90">
                              {formatPodNetBytes(r.receiveBytes)}
                            </TableCell>
                            <TableCell className="py-2.5 text-right font-mono text-xs tabular-nums text-amber-900/90 dark:text-amber-100/90">
                              {formatPodNetBytes(r.transmitBytes)}
                            </TableCell>
                            <TableCell className="py-2.5 text-right font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                              {formatPodNetBytes(r.totalBytes)}
                            </TableCell>
                            {showConn ? (
                              <TableCell className="py-2.5 text-right font-mono text-xs font-medium tabular-nums text-sky-800 dark:text-sky-200">
                                {formatTcpConnections(r.tcpConnections)}
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })()}
        </CardContent>
      </Card>

      {chartsQ.isError ? (
        <DataGapHint
          text={`分项趋势（工作负载、配额、API Server、调度器、磁盘）加载失败：${(chartsQ.error as Error).message}。请检查 Kubernetes Prometheus 配置、Redis 与网络。`}
        />
      ) : null}
      {chartsWarming ? (
        <div className="rounded-xl border border-sky-200/90 bg-sky-50/90 px-4 py-2.5 text-xs leading-relaxed text-sky-950">
          <span className="font-semibold text-sky-900">趋势数据后台加载中：</span>
          服务端正在写入 Redis 缓存（若首次查询或缓存过期）。下方图表会在就绪后自动出现，无需刷新页面。
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">核心组件 up / 抓取</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CORE_METRICS.map((row) => {
            const v = coreVals[row.key];
            const ok = v != null && Number.isFinite(v as number) && (v as number) > 0;
            const display =
              v != null && Number.isFinite(v as number)
                ? row.key === "kubelet"
                  ? String(Math.round(v as number))
                  : (v as number) > 0
                    ? "1"
                    : "0"
                : "—";
            return (
              <div key={row.key} className="flex flex-col gap-2">
                <StatCard title={row.title} value={display} icon={row.icon} color={ok ? "green" : "amber"} variant="soft" />
                {!ok && !instantWarming ? <DataGapHint text={row.hint} /> : null}
              </div>
            );
          })}
        </div>
      </div>

      {nodeDefs.length ? (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Layers className="h-4 w-4 text-slate-500" />
            {SECTION_LABEL.nodes}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {nodeDefs.map((d) => {
              const v = scalars[d.id];
              const has = v != null && Number.isFinite(v as number);
              return (
                <div key={d.id} className="flex flex-col gap-2">
                  <StatCard
                    title={d.title}
                    value={formatScalar(v ?? null, d.format)}
                    icon={Gauge}
                    color={has ? "blue" : "amber"}
                    variant="soft"
                  />
                  {!has && !instantWarming ? <DataGapHint text={d.hint} /> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {trendSections.map((sec) => {
        const shell = SECTION_TREND_SHELL[sec];
        const Icon = SECTION_ICONS[sec] ?? Gauge;
        const chartsForSec = chartRows
          .filter((c) => c.section === sec)
          .sort((a, b) => (CHART_DEF_ORDER.get(a.id) ?? 0) - (CHART_DEF_ORDER.get(b.id) ?? 0));

        return (
          <div
            key={sec}
            className={cn(
              "rounded-3xl border border-slate-100/90 p-5 shadow-[0_8px_36px_-12px_rgba(15,23,42,0.06)] ring-1 backdrop-blur-[1px] dark:border-slate-700/80 dark:shadow-none sm:p-6",
              shell.ring,
              `bg-gradient-to-br ${shell.panel}`
            )}
          >
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className={cn("h-10 w-1 shrink-0 rounded-full bg-gradient-to-b shadow-sm", shell.accentBar)} />
              <div className="min-w-0 flex-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Icon className="h-4 w-4 text-slate-600" />
                  {SECTION_LABEL[sec]}
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  最近 {chartDays} 天趋势 · 步长约 {stepForRangeMinutes(chartRangeMinutes)}
                  {chartsQ.data?.cachedAt ? (
                    <span className="ml-1 text-slate-400">· 缓存 {chartsQ.data.cachedAt.slice(0, 19).replace("T", " ")}</span>
                  ) : null}
                </p>
              </div>
            </div>
            {chartsQ.isPending ? (
              <p className="text-xs text-slate-500">加载趋势数据…</p>
            ) : chartsQ.isError ? (
              <p className="text-[11px] text-slate-500">趋势未加载（见上方错误说明）。</p>
            ) : chartsWarming ? null : chartsForSec.length === 0 ? (
              <DataGapHint text="该分组暂无图表定义。" />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {chartsForSec.map((c) => (
                  <K8sPrometheusTrendCard key={c.id} c={c} />
                ))}
              </div>
            )}
            {sec === "quota" && (ratio(reqCpu, allocCpu) != null || ratio(reqMem, allocMem) != null) ? (
              <p className="mt-4 rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2 text-[11px] text-slate-600">
                <span className="font-medium text-slate-800">即时快照（与顶部一览同源）：</span>
                CPU 请求占可分配 {ratio(reqCpu, allocCpu) != null ? `${ratio(reqCpu, allocCpu)!.toFixed(2)}%` : "—"}
                {" · "}
                内存请求占可分配 {ratio(reqMem, allocMem) != null ? `${ratio(reqMem, allocMem)!.toFixed(2)}%` : "—"}
              </p>
            ) : null}
          </div>
        );
      })}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Prometheus 自监控</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <StatCard
              title="count(up)"
              value={legacy.upSeries != null ? String(Math.round(legacy.upSeries)) : "—"}
              icon={Gauge}
              color="blue"
              variant="soft"
            />
            {!instantWarming && (legacy.upSeries == null || !Number.isFinite(legacy.upSeries)) ? (
              <DataGapHint text={HINT_LEGACY_UP} />
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <StatCard
              title="TSDB head series"
              value={legacy.tsdbSeries != null ? String(Math.round(legacy.tsdbSeries)) : "—"}
              icon={Database}
              color="purple"
              variant="soft"
            />
            {!instantWarming && (legacy.tsdbSeries == null || !Number.isFinite(legacy.tsdbSeries)) ? (
              <DataGapHint text={HINT_LEGACY_TSDB} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClusterPrometheusPanel;
