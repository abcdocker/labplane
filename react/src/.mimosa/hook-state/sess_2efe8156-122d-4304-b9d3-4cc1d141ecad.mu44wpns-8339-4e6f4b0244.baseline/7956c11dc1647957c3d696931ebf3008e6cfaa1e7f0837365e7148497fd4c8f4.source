import React from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { prometheusQueryRangeApi } from "@/lib/api";
import {
  promFirstSeriesNumericPoints,
  stepForRangeMinutes,
} from "@/pages/ai-inspect/opsMonitoringChartHelpers";
import { cn } from "@/lib/utils";

/** 与常见 kubeadm/etcd 静态 Pod 配额 8GiB 对齐，用于参考线（实际配额以集群为准）。 */
const ETCD_DB_QUOTA_BYTES = 8589934592;
const WAL_WARN_SECONDS = 0.01;
const BACKEND_WARN_SECONDS = 0.025;
const ETCD_JOB = `job=~"etcd|kube-etcd"`;

const Q_HAS_LEADER = `min(etcd_server_has_leader{${ETCD_JOB}})`;
const Q_LEADER_CHANGES = `sum(increase(etcd_server_leader_changes_seen_total{${ETCD_JOB}}[15m]))`;
const Q_WAL_P99 = `histogram_quantile(0.99, sum(rate(etcd_disk_wal_fsync_duration_seconds_bucket{${ETCD_JOB}}[5m])) by (le))`;
const Q_BACKEND_P99 = `histogram_quantile(0.99, sum(rate(etcd_disk_backend_commit_duration_seconds_bucket{${ETCD_JOB}}[5m])) by (le))`;
const Q_DB_PHYSICAL = `max(etcd_debugging_mvcc_db_total_size_in_bytes{${ETCD_JOB}})`;
const Q_DB_INUSE = `max(etcd_mvcc_db_total_size_in_use_in_bytes{${ETCD_JOB}})`;
const Q_GRPC = `sum(rate(grpc_server_handled_total{${ETCD_JOB}}[5m]))`;
const Q_PEER_RTT = `histogram_quantile(0.99, sum(rate(etcd_network_peer_round_trip_time_seconds_bucket{${ETCD_JOB}}[5m])) by (le))`;

function fmtAxisMs(x: number): string {
  try {
    return format(new Date(x), "M月d日 HH:mm", { locale: zhCN });
  } catch {
    return "";
  }
}

function fmtBytes(b: number): string {
  if (!Number.isFinite(b)) return "—";
  const g = b / 1024 ** 3;
  if (g >= 1) return `${g.toFixed(2)} GiB`;
  return `${(b / 1024 ** 2).toFixed(0)} MiB`;
}

function mergeBytesSeries(
  physical: { x: number; v: number }[],
  inUse: { x: number; v: number }[]
): { x: number; physicalGiB: number; inUseGiB: number }[] {
  const m = new Map<number, { x: number; physicalGiB?: number; inUseGiB?: number }>();
  const GiB = 1024 ** 3;
  for (const p of physical) {
    m.set(p.x, { x: p.x, physicalGiB: p.v / GiB });
  }
  for (const p of inUse) {
    const row = m.get(p.x) ?? { x: p.x };
    row.inUseGiB = p.v / GiB;
    m.set(p.x, row);
  }
  return [...m.values()]
    .sort((a, b) => a.x - b.x)
    .map((row) => ({
      x: row.x,
      physicalGiB: row.physicalGiB ?? Number.NaN,
      inUseGiB: row.inUseGiB ?? Number.NaN,
    }))
    .filter((row) => Number.isFinite(row.physicalGiB) || Number.isFinite(row.inUseGiB));
}

type EtcdChartsBundle = {
  hasLeader: unknown;
  leaderChanges: unknown;
  walP99: unknown;
  backendP99: unknown;
  dbPhysical: unknown;
  dbInUse: unknown;
  grpc: unknown;
  peerRtt: unknown;
};

const chartLeaderCfg = {
  v: { label: "Has Leader (min)", color: "hsl(142 76% 36%)" },
} satisfies ChartConfig;

const chartLeaderChangesCfg = {
  v: { label: "Leader 切换 / 15m", color: "hsl(25 95% 48%)" },
} satisfies ChartConfig;

const chartLatencyCfg = {
  v: { label: "P99 延迟", color: "hsl(221 83% 53%)" },
} satisfies ChartConfig;

const chartDbCfg = {
  physicalGiB: { label: "物理文件大小", color: "hsl(262 83% 48%)" },
  inUseGiB: { label: "逻辑使用量", color: "hsl(199 89% 48%)" },
} satisfies ChartConfig;

const chartGrpcCfg = {
  v: { label: "gRPC 处理速率", color: "hsl(280 65% 52%)" },
} satisfies ChartConfig;

const chartRttCfg = {
  v: { label: "Peer RTT P99", color: "hsl(340 75% 52%)" },
} satisfies ChartConfig;

async function fetchEtcdChartsBundle(
  rangeMinutes: number,
  signal: AbortSignal | undefined
): Promise<EtcdChartsBundle> {
  const end = Math.floor(Date.now() / 1000);
  const start = end - rangeMinutes * 60;
  const step = stepForRangeMinutes(rangeMinutes);
  const opt = signal ? { signal } : undefined;
  const [
    hasLeader,
    leaderChanges,
    walP99,
    backendP99,
    dbPhysical,
    dbInUse,
    grpc,
    peerRtt,
  ] = await Promise.all([
    prometheusQueryRangeApi("k8s", Q_HAS_LEADER, start, end, step, opt),
    prometheusQueryRangeApi("k8s", Q_LEADER_CHANGES, start, end, step, opt),
    prometheusQueryRangeApi("k8s", Q_WAL_P99, start, end, step, opt),
    prometheusQueryRangeApi("k8s", Q_BACKEND_P99, start, end, step, opt),
    prometheusQueryRangeApi("k8s", Q_DB_PHYSICAL, start, end, step, opt),
    prometheusQueryRangeApi("k8s", Q_DB_INUSE, start, end, step, opt),
    prometheusQueryRangeApi("k8s", Q_GRPC, start, end, step, opt),
    prometheusQueryRangeApi("k8s", Q_PEER_RTT, start, end, step, opt),
  ]);
  return {
    hasLeader,
    leaderChanges,
    walP99,
    backendP99,
    dbPhysical,
    dbInUse,
    grpc,
    peerRtt,
  };
}

function lineDataFromProm(data: unknown): { x: number; v: number; t: string }[] {
  return promFirstSeriesNumericPoints(data).map((p) => ({
    ...p,
    t: fmtAxisMs(p.x),
  }));
}

function lastFiniteV(pts: { v: number }[]): number | undefined {
  for (let i = pts.length - 1; i >= 0; i--) {
    if (Number.isFinite(pts[i].v)) return pts[i].v;
  }
  return undefined;
}

type Props = {
  /** 与 /api/k8s/etcd/summary 一致：已配置 K8s Prometheus 且无错误时可拉取时序 */
  promReady: boolean;
};

const RANGE_OPTIONS: { id: number; label: string }[] = [
  { id: 60, label: "最近 1 小时" },
  { id: 360, label: "最近 6 小时" },
  { id: 1440, label: "最近 24 小时" },
  { id: 4320, label: "最近 3 天" },
];

export const ClusterEtcdMonitorCharts: React.FC<Props> = ({ promReady }) => {
  const [rangeMinutes, setRangeMinutes] = React.useState(360);

  const chartsQ = useQuery({
    queryKey: ["k8s", "etcd", "prometheus-charts", rangeMinutes],
    queryFn: ({ signal }) => fetchEtcdChartsBundle(rangeMinutes, signal),
    enabled: promReady,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const hasLeaderPts = React.useMemo(
    () => lineDataFromProm(chartsQ.data?.hasLeader),
    [chartsQ.data?.hasLeader]
  );
  const leaderChPts = React.useMemo(
    () => lineDataFromProm(chartsQ.data?.leaderChanges),
    [chartsQ.data?.leaderChanges]
  );
  const walPts = React.useMemo(() => lineDataFromProm(chartsQ.data?.walP99), [chartsQ.data?.walP99]);
  const backendPts = React.useMemo(
    () => lineDataFromProm(chartsQ.data?.backendP99),
    [chartsQ.data?.backendP99]
  );
  const dbPts = React.useMemo(() => {
    const a = promFirstSeriesNumericPoints(chartsQ.data?.dbPhysical);
    const b = promFirstSeriesNumericPoints(chartsQ.data?.dbInUse);
    return mergeBytesSeries(a, b).map((p) => ({ ...p, t: fmtAxisMs(p.x) }));
  }, [chartsQ.data?.dbPhysical, chartsQ.data?.dbInUse]);
  const grpcPts = React.useMemo(() => lineDataFromProm(chartsQ.data?.grpc), [chartsQ.data?.grpc]);
  const rttPts = React.useMemo(() => lineDataFromProm(chartsQ.data?.peerRtt), [chartsQ.data?.peerRtt]);

  const lastHasLeader = lastFiniteV(hasLeaderPts);
  const noLeader = lastHasLeader !== undefined && lastHasLeader < 1;

  if (!promReady) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Prometheus 时序监控</h2>
        <Select
          value={String(rangeMinutes)}
          onValueChange={(v) => setRangeMinutes(Number(v) || 360)}
        >
          <SelectTrigger className="h-9 w-[180px] text-xs">
            <SelectValue placeholder="时间窗" />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.id} value={String(o.id)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {chartsQ.isError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
          图表数据加载失败：{(chartsQ.error as Error).message}
        </p>
      ) : null}

      {chartsQ.isFetching && !chartsQ.data ? (
        <p className="text-sm text-slate-500">正在加载 Prometheus 时序…</p>
      ) : null}

      {/* 1. 集群可用性与选主 */}
      <div
        className={cn(
          "rounded-2xl border-2 p-4 shadow-sm sm:p-5",
          noLeader
            ? "border-red-400 bg-red-50/90 dark:border-red-700 dark:bg-red-950/40"
            : "border-sky-300/80 bg-gradient-to-b from-sky-50/90 to-white dark:border-sky-800/60 dark:from-sky-950/30 dark:to-slate-900/40"
        )}
      >
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              集群可用性与选主状态
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              <code className="rounded bg-white/80 px-1 font-mono text-[10px] dark:bg-black/30">etcd_server_has_leader</code>{" "}
              取各成员最小值：任一为 0 即表示集群无主、无法安全写入。
              <code className="ml-1 rounded bg-white/80 px-1 font-mono text-[10px] dark:bg-black/30">increase(...[15m])</code>{" "}
              反映 15m 内选主次数，正常应接近 0。
            </p>
          </div>
          {lastHasLeader !== undefined ? (
            <div
              className={cn(
                "rounded-lg border px-3 py-2 text-center",
                noLeader
                  ? "border-red-600 bg-red-600 text-white"
                  : "border-emerald-600 bg-emerald-600 text-white"
              )}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide opacity-90">当前 Has Leader (min)</p>
              <p className="text-2xl font-bold tabular-nums">{lastHasLeader.toFixed(0)}</p>
            </div>
          ) : null}
        </div>
        {noLeader ? (
          <p className="mb-3 rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-sm font-medium text-red-950 dark:border-red-800 dark:bg-red-900/50 dark:text-red-100">
            检测到 Has Leader 为 0：集群可能已无法处理写入，请立即检查 etcd Pod、网络与磁盘。
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="mb-2 text-xs font-medium text-slate-700 dark:text-slate-300">Has Leader（是否有主）</p>
            <ChartContainer config={chartLeaderCfg} className="h-[220px] w-full !aspect-auto">
              <LineChart data={hasLeaderPts} margin={{ top: 6, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 6" vertical={false} className="stroke-slate-200/80 dark:stroke-slate-600/80" />
                <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtAxisMs} hide />
                <YAxis domain={[0, 1.05]} width={36} tick={{ fontSize: 10 }} tickFormatter={(v) => String(v)} />
                <ReferenceLine y={1} stroke="hsl(142 76% 36%)" strokeDasharray="4 4" />
                <ReferenceLine y={0} stroke="hsl(0 84% 45%)" strokeDasharray="4 4" />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, p) => {
                        const x = (p?.[0]?.payload as { x?: number })?.x;
                        return x != null ? fmtAxisMs(x) : "";
                      }}
                    />
                  }
                />
                <Line type="monotone" dataKey="v" stroke="var(--color-v)" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ChartContainer>
            <p className="mt-1 font-mono text-[10px] text-slate-500">{Q_HAS_LEADER}</p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="mb-2 text-xs font-medium text-slate-700 dark:text-slate-300">Leader 切换（15m 窗口）</p>
            <ChartContainer config={chartLeaderChangesCfg} className="h-[220px] w-full !aspect-auto">
              <LineChart data={leaderChPts} margin={{ top: 6, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 6" vertical={false} className="stroke-slate-200/80 dark:stroke-slate-600/80" />
                <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtAxisMs} hide />
                <YAxis width={44} tick={{ fontSize: 10 }} />
                <ReferenceLine y={0} stroke="hsl(215 16% 72%)" strokeDasharray="3 3" />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, p) => {
                        const x = (p?.[0]?.payload as { x?: number })?.x;
                        return x != null ? fmtAxisMs(x) : "";
                      }}
                    />
                  }
                />
                <Line type="monotone" dataKey="v" stroke="var(--color-v)" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ChartContainer>
            <p className="mt-1 font-mono text-[10px] text-slate-500">{Q_LEADER_CHANGES}</p>
          </div>
        </div>
      </div>

      {/* 2. 磁盘延迟 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">WAL 落盘延迟 P99</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            纵轴为秒（tooltip 显示毫秒）。橙色虚线：10ms 建议上限。
          </p>
          <ChartContainer config={chartLatencyCfg} className="mt-2 h-[220px] w-full !aspect-auto">
            <LineChart data={walPts} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 6" vertical={false} className="stroke-slate-200/80 dark:stroke-slate-600/80" />
              <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtAxisMs} hide />
              <YAxis
                width={52}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${(Number(v) * 1000).toFixed(0)}ms`}
              />
              <ReferenceLine y={WAL_WARN_SECONDS} stroke="hsl(25 95% 48%)" strokeDasharray="5 5" label={{ value: "10ms", fill: "hsl(25 95% 40%)", fontSize: 10 }} />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const v = Number((payload[0].payload as { v?: number }).v);
                  const ms = Number.isFinite(v) ? (v * 1000).toFixed(2) : "—";
                  const x = (payload[0].payload as { x?: number }).x;
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-md dark:border-slate-600 dark:bg-slate-800">
                      <p className="text-slate-500">{x != null ? fmtAxisMs(x) : ""}</p>
                      <p className="font-mono font-semibold tabular-nums">{ms} ms</p>
                    </div>
                  );
                }}
              />
              <Line type="monotone" dataKey="v" stroke="var(--color-v)" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
          <p className="mt-1 font-mono text-[10px] text-slate-500">{Q_WAL_P99}</p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Backend 提交延迟 P99</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            boltdb 提交耗时；橙色虚线：25ms 建议上限。
          </p>
          <ChartContainer config={chartLatencyCfg} className="mt-2 h-[220px] w-full !aspect-auto">
            <LineChart data={backendPts} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 6" vertical={false} className="stroke-slate-200/80 dark:stroke-slate-600/80" />
              <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtAxisMs} hide />
              <YAxis
                width={52}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${(Number(v) * 1000).toFixed(0)}ms`}
              />
              <ReferenceLine
                y={BACKEND_WARN_SECONDS}
                stroke="hsl(25 95% 48%)"
                strokeDasharray="5 5"
                label={{ value: "25ms", fill: "hsl(25 95% 40%)", fontSize: 10 }}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const v = Number((payload[0].payload as { v?: number }).v);
                  const ms = Number.isFinite(v) ? (v * 1000).toFixed(2) : "—";
                  const x = (payload[0].payload as { x?: number }).x;
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-md dark:border-slate-600 dark:bg-slate-800">
                      <p className="text-slate-500">{x != null ? fmtAxisMs(x) : ""}</p>
                      <p className="font-mono font-semibold tabular-nums">{ms} ms</p>
                    </div>
                  );
                }}
              />
              <Line type="monotone" dataKey="v" stroke="var(--color-v)" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
          <p className="mt-1 font-mono text-[10px] text-slate-500">{Q_BACKEND_P99}</p>
        </div>
      </div>

      {/* 3. 存储 */}
      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">数据库大小与使用量</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          物理文件{" "}
          <code className="rounded bg-slate-100 px-0.5 font-mono text-[10px] dark:bg-slate-800">etcd_debugging_mvcc_db_total_size_in_bytes</code>{" "}
          与逻辑使用{" "}
          <code className="rounded bg-slate-100 px-0.5 font-mono text-[10px] dark:bg-slate-800">etcd_mvcc_db_total_size_in_use_in_bytes</code>
          ；差值可视为碎片。灰线：常见 8GiB 配额参考（{fmtBytes(ETCD_DB_QUOTA_BYTES)}）。
        </p>
        <ChartContainer config={chartDbCfg} className="mt-2 h-[260px] w-full !aspect-auto">
          <LineChart data={dbPts} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="4 6" vertical={false} className="stroke-slate-200/80 dark:stroke-slate-600/80" />
            <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtAxisMs} hide />
            <YAxis
              width={56}
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `${Number(v).toFixed(1)}G`}
              label={{ value: "GiB", angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(215 16% 45%)" }}
            />
            <ReferenceLine
              y={ETCD_DB_QUOTA_BYTES / 1024 ** 3}
              stroke="hsl(215 16% 65%)"
              strokeDasharray="6 4"
              label={{ value: "8GiB 配额", fill: "hsl(215 16% 40%)", fontSize: 10 }}
            />
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as {
                  x?: number;
                  physicalGiB?: number;
                  inUseGiB?: number;
                };
                const pg = row.physicalGiB;
                const iu = row.inUseGiB;
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-md dark:border-slate-600 dark:bg-slate-800">
                    <p className="text-slate-500">{row.x != null ? fmtAxisMs(row.x) : ""}</p>
                    {Number.isFinite(pg) ? (
                      <p className="tabular-nums">物理：{(pg as number).toFixed(3)} GiB</p>
                    ) : null}
                    {Number.isFinite(iu) ? (
                      <p className="tabular-nums">逻辑：{(iu as number).toFixed(3)} GiB</p>
                    ) : null}
                    {Number.isFinite(pg) && Number.isFinite(iu) ? (
                      <p className="text-slate-500">碎片约：{(((pg as number) - (iu as number)) * 1024).toFixed(0)} MiB</p>
                    ) : null}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="physicalGiB"
              stroke="var(--color-physicalGiB)"
              dot={false}
              strokeWidth={2}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="inUseGiB"
              stroke="var(--color-inUseGiB)"
              dot={false}
              strokeWidth={2}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
        <p className="mt-1 font-mono text-[10px] text-slate-500">
          {Q_DB_PHYSICAL} · {Q_DB_INUSE}
        </p>
      </div>

      {/* 4. 网络与 RPC */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">客户端 gRPC 吞吐</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            <code className="rounded bg-slate-100 px-0.5 font-mono text-[10px] dark:bg-slate-800">grpc_server_handled_total</code>{" "}
            的 5m rate 之和（含 Range/Put 等），反映 apiserver 等对 etcd 的压力。
          </p>
          <ChartContainer config={chartGrpcCfg} className="mt-2 h-[220px] w-full !aspect-auto">
            <LineChart data={grpcPts} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 6" vertical={false} className="stroke-slate-200/80 dark:stroke-slate-600/80" />
              <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtAxisMs} hide />
              <YAxis width={52} tick={{ fontSize: 10 }} tickFormatter={(v) => v.toFixed(1)} />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const v = Number((payload[0].payload as { v?: number }).v);
                  const x = (payload[0].payload as { x?: number }).x;
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-md dark:border-slate-600 dark:bg-slate-800">
                      <p className="text-slate-500">{x != null ? fmtAxisMs(x) : ""}</p>
                      <p className="font-mono font-semibold tabular-nums">{Number.isFinite(v) ? v.toFixed(3) : "—"} /s</p>
                    </div>
                  );
                }}
              />
              <Line type="monotone" dataKey="v" stroke="var(--color-v)" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
          <p className="mt-1 font-mono text-[10px] text-slate-500">{Q_GRPC}</p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">节点间 Peer RTT（P99）</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            成员间 RTT 过高易误判选主；无多成员或未暴露 bucket 时可能无数据。
          </p>
          <ChartContainer config={chartRttCfg} className="mt-2 h-[220px] w-full !aspect-auto">
            <LineChart data={rttPts} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 6" vertical={false} className="stroke-slate-200/80 dark:stroke-slate-600/80" />
              <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmtAxisMs} hide />
              <YAxis
                width={52}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${(Number(v) * 1000).toFixed(0)}ms`}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const v = Number((payload[0].payload as { v?: number }).v);
                  const ms = Number.isFinite(v) ? (v * 1000).toFixed(2) : "—";
                  const x = (payload[0].payload as { x?: number }).x;
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-md dark:border-slate-600 dark:bg-slate-800">
                      <p className="text-slate-500">{x != null ? fmtAxisMs(x) : ""}</p>
                      <p className="font-mono font-semibold tabular-nums">{ms} ms</p>
                    </div>
                  );
                }}
              />
              <Line type="monotone" dataKey="v" stroke="var(--color-v)" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
          <p className="mt-1 font-mono text-[10px] text-slate-500">{Q_PEER_RTT}</p>
        </div>
      </div>
    </div>
  );
};
