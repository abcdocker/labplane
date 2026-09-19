import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { prometheusQueryRangeApi } from "@/lib/api";
import { formatCpuCores, formatMemBytes } from "@/lib/k8s-metrics-format";
import { promRangeScalarMap } from "@/lib/prometheus-range-scalar-map";
import { buildPodMetricsRangeQueries } from "./podMetricsPromql";

export type PodResourceNetworkTrendChartsProps = {
  namespace: string;
  podName: string;
  /** 与详情页 instant 指标一致：仅在 Prometheus 可用时拉 query_range */
  enabled: boolean;
};

type TrendRow = {
  tsSec: number;
  tick: string;
  cpu?: number;
  memBytes?: number;
  rxBps?: number;
  txBps?: number;
};

function formatTick(tsSec: number): string {
  try {
    return new Date(tsSec * 1000).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

function formatTooltipTime(tsSec: number): string {
  try {
    return new Date(tsSec * 1000).toLocaleString(undefined, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return String(tsSec);
  }
}

function mergeMapsToRows(
  cpu: Map<number, number>,
  mem: Map<number, number>,
  rx: Map<number, number>,
  tx: Map<number, number>
): TrendRow[] {
  const keys = new Set<number>([...cpu.keys(), ...mem.keys(), ...rx.keys(), ...tx.keys()]);
  return [...keys]
    .sort((a, b) => a - b)
    .map((tsSec) => ({
      tsSec,
      tick: formatTick(tsSec),
      cpu: cpu.get(tsSec),
      memBytes: mem.get(tsSec),
      rxBps: rx.get(tsSec),
      txBps: tx.get(tsSec),
    }));
}

function fmtNetBpsTooltip(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1) return `${(n * 8).toFixed(0)} b/s`;
  if (n < 1024) return `${n.toFixed(1)} B/s`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KiB/s`;
  return `${(n / 1024 ** 2).toFixed(2)} MiB/s`;
}

const chartWrap =
  "rounded-lg border border-slate-100 bg-white/90 p-2 dark:border-slate-800 dark:bg-slate-950/40";

const PodResourceNetworkTrendCharts: React.FC<PodResourceNetworkTrendChartsProps> = ({
  namespace,
  podName,
  enabled,
}) => {
  const q = useQuery({
    queryKey: ["k8s-pod-detail-metrics-range", namespace, podName],
    queryFn: async () => {
      const queries = buildPodMetricsRangeQueries(namespace, podName);
      const end = Math.floor(Date.now() / 1000);
      const start = end - 60 * 60;
      const step = "60s";
      const errs: string[] = [];
      const [cR, mR, rxR, txR] = await Promise.allSettled([
        prometheusQueryRangeApi("k8s", queries.cpu, start, end, step),
        prometheusQueryRangeApi("k8s", queries.mem, start, end, step),
        prometheusQueryRangeApi("k8s", queries.netRx, start, end, step),
        prometheusQueryRangeApi("k8s", queries.netTx, start, end, step),
      ]);
      const pick = (label: string, r: PromiseSettledResult<unknown>): unknown => {
        if (r.status === "fulfilled") return r.value;
        errs.push(`${label}：${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
        return null;
      };
      const cpuMap = promRangeScalarMap(pick("CPU", cR));
      const memMap = promRangeScalarMap(pick("内存", mR));
      const rxMap = promRangeScalarMap(pick("入站", rxR));
      const txMap = promRangeScalarMap(pick("出站", txR));
      const rows = mergeMapsToRows(cpuMap, memMap, rxMap, txMap);
      return { rows, errs };
    },
    enabled: enabled && Boolean(namespace.trim() && podName.trim()),
    staleTime: 55_000,
    refetchInterval: 60_000,
    retry: false,
  });

  if (!enabled) return null;

  if (q.isPending || q.isLoading) {
    return (
      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">正在加载近 1 小时趋势（Prometheus query_range）…</p>
    );
  }
  if (q.isError) {
    const msg = q.error instanceof Error ? q.error.message : String(q.error);
    return (
      <p className="mt-4 text-xs text-amber-800 dark:text-amber-200" title={msg}>
        趋势图加载失败：{msg}
      </p>
    );
  }

  const rows = q.data?.rows ?? [];
  const errs = q.data?.errs ?? [];
  if (!rows.length) {
    return (
      <div className="mt-4 space-y-1 text-xs text-slate-500 dark:text-slate-400">
        <p>近 1 小时内无趋势数据点（或查询无结果）。</p>
        {errs.length > 0 ? <p className="text-amber-800 dark:text-amber-200">{errs.join(" ")}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        近 1 小时趋势（步长 60s，与上方 instant 同源 PromQL）；数据来自{" "}
        <code className="rounded bg-slate-100 px-1 font-mono text-[10px] dark:bg-slate-800">POST /api/prometheus/query_range</code>
        。
      </p>
      {errs.length > 0 ? (
        <p className="text-[11px] text-amber-800 dark:text-amber-200">部分序列：{errs.join(" ")}</p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={chartWrap}>
          <p className="mb-1 px-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">CPU（核）</p>
          <div className="h-[180px] w-full [&_.recharts-surface]:outline-none">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200/80 dark:stroke-slate-700/80" />
                <XAxis dataKey="tick" tick={{ fontSize: 10 }} className="text-slate-500" interval="preserveStartEnd" />
                <YAxis
                  width={44}
                  tick={{ fontSize: 10 }}
                  className="text-slate-500"
                  tickFormatter={(v) => (Number(v) < 10 ? Number(v).toFixed(2) : String(Math.round(Number(v))))}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  labelFormatter={(_, p) => {
                    const ts = (p?.[0]?.payload as TrendRow | undefined)?.tsSec;
                    return typeof ts === "number" ? formatTooltipTime(ts) : "";
                  }}
                  formatter={(value: number) => [formatCpuCores(value), "用量"]}
                />
                <Line
                  type="monotone"
                  dataKey="cpu"
                  name="CPU"
                  stroke="hsl(221 83% 53%)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className={chartWrap}>
          <p className="mb-1 px-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">内存 working set</p>
          <div className="h-[180px] w-full [&_.recharts-surface]:outline-none">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200/80 dark:stroke-slate-700/80" />
                <XAxis dataKey="tick" tick={{ fontSize: 10 }} className="text-slate-500" interval="preserveStartEnd" />
                <YAxis
                  width={52}
                  tick={{ fontSize: 10 }}
                  className="text-slate-500"
                  tickFormatter={(v) => {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return "";
                    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)}G`;
                    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)}M`;
                    return `${(n / 1024).toFixed(0)}K`;
                  }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12 }}
                  labelFormatter={(_, p) => {
                    const ts = (p?.[0]?.payload as TrendRow | undefined)?.tsSec;
                    return typeof ts === "number" ? formatTooltipTime(ts) : "";
                  }}
                  formatter={(value: number) => [formatMemBytes(value), "用量"]}
                />
                <Line
                  type="monotone"
                  dataKey="memBytes"
                  name="内存"
                  stroke="hsl(262 83% 58%)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className={chartWrap}>
        <p className="mb-1 px-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">网络速率（字节/秒）</p>
        <div className="h-[200px] w-full [&_.recharts-surface]:outline-none">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200/80 dark:stroke-slate-700/80" />
              <XAxis dataKey="tick" tick={{ fontSize: 10 }} className="text-slate-500" interval="preserveStartEnd" />
              <YAxis
                width={56}
                tick={{ fontSize: 10 }}
                className="text-slate-500"
                tickFormatter={(v) => {
                  const n = Number(v);
                  if (!Number.isFinite(n) || n <= 0) return "0";
                  if (n < 1024) return `${n.toFixed(0)}B`;
                  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)}K`;
                  return `${(n / 1024 ** 2).toFixed(1)}M`;
                }}
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                labelFormatter={(_, p) => {
                  const ts = (p?.[0]?.payload as TrendRow | undefined)?.tsSec;
                  return typeof ts === "number" ? formatTooltipTime(ts) : "";
                }}
                formatter={(value: number) => fmtNetBpsTooltip(value)}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="rxBps"
                name="入站"
                stroke="hsl(173 58% 39%)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="txBps"
                name="出站"
                stroke="hsl(24 95% 53%)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default PodResourceNetworkTrendCharts;
