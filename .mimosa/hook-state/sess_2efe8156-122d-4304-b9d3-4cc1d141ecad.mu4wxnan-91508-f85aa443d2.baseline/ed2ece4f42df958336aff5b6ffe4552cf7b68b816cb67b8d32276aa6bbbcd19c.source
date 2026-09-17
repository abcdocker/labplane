import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { prometheusQueryRangeApi } from "@/lib/api";
import { promRangeScalarMap } from "@/lib/prometheus-range-scalar-map";

type CpuPoint = { i: number; tsSec: number; used: number; remain: number };
type MemPoint = { i: number; tsSec: number; used: number; remain: number };

type TrendQueryResult = {
  cpuPoints: CpuPoint[];
  memPoints: MemPoint[];
  emptyHint?: string;
};

const GiB = 1024 ** 3;

function mergeUsedRemainSeries(
  cpuMap: Map<number, number>,
  memMap: Map<number, number>,
  cpuLimitCores: number,
  memLimitBytes: number,
  fetchErrors: string[]
): TrendQueryResult {
  const parts: string[] = [...fetchErrors];
  if (cpuMap.size === 0) parts.push("CPU 查询无数据点");
  if (memMap.size === 0) parts.push("内存查询无数据点");

  const tsArr = [...new Set([...cpuMap.keys(), ...memMap.keys()])].sort((a, b) => a - b);
  const cpuPoints: CpuPoint[] = [];
  const memPoints: MemPoint[] = [];

  for (const ts of tsArr) {
    const rawC = cpuMap.get(ts);
    if (rawC !== undefined && cpuLimitCores > 0 && Number.isFinite(rawC)) {
      const u = Math.min(Math.max(0, rawC), cpuLimitCores);
      cpuPoints.push({
        i: cpuPoints.length,
        tsSec: ts,
        used: u,
        remain: Math.max(0, cpuLimitCores - u),
      });
    }
    const rawM = memMap.get(ts);
    if (rawM !== undefined && memLimitBytes > 0 && Number.isFinite(rawM)) {
      const u = Math.min(Math.max(0, rawM), memLimitBytes);
      memPoints.push({
        i: memPoints.length,
        tsSec: ts,
        used: u / GiB,
        remain: Math.max(0, memLimitBytes - u) / GiB,
      });
    }
  }

  const emptyHint =
    cpuPoints.length === 0 && memPoints.length === 0 && parts.length > 0 ? parts.join("；") : undefined;
  return { cpuPoints, memPoints, emptyHint };
}

const chartCfgCpu = {
  used: { label: "已用", color: "hsl(221 83% 53%)" },
  remain: { label: "剩余", color: "hsl(214 32% 91%)" },
} satisfies ChartConfig;

const chartCfgMem = {
  used: { label: "已用", color: "hsl(262 83% 58%)" },
  remain: { label: "剩余", color: "hsl(270 20% 92%)" },
} satisfies ChartConfig;

export type CloudVmUsageSparklineProps = {
  enabled: boolean;
  cpuQuery?: string;
  memQuery?: string;
  cpuLimitCores: number;
  memLimitBytes: number;
};

function formatSparkTime(tsSec: number): string {
  try {
    return new Date(tsSec * 1000).toLocaleString(undefined, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(tsSec);
  }
}

function MiniLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-slate-600">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1">
          <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** 节点资源：堆叠面积图展示相对可调度容量的已用 / 剩余；Prometheus query_range（K8s 数据源，cAdvisor）。 */
const CloudVmUsageSparkline: React.FC<CloudVmUsageSparklineProps> = ({
  enabled,
  cpuQuery,
  memQuery,
  cpuLimitCores,
  memLimitBytes,
}) => {
  const q = useQuery({
    queryKey: ["k8s-node-resource-trend", cpuQuery, memQuery, cpuLimitCores, memLimitBytes],
    queryFn: async (): Promise<TrendQueryResult> => {
      const end = Math.floor(Date.now() / 1000);
      const start = end - 45 * 60;
      const step = "2m";
      const fetchErrors: string[] = [];
      const [cRes, mRes] = await Promise.allSettled([
        prometheusQueryRangeApi("k8s", cpuQuery!, start, end, step),
        prometheusQueryRangeApi("k8s", memQuery!, start, end, step),
      ]);
      let c: unknown = null;
      let m: unknown = null;
      if (cRes.status === "fulfilled") c = cRes.value;
      else fetchErrors.push(`CPU：${cRes.reason instanceof Error ? cRes.reason.message : String(cRes.reason)}`);
      if (mRes.status === "fulfilled") m = mRes.value;
      else fetchErrors.push(`内存：${mRes.reason instanceof Error ? mRes.reason.message : String(mRes.reason)}`);

      const cpuMap = c ? promRangeScalarMap(c) : new Map<number, number>();
      const memMap = m ? promRangeScalarMap(m) : new Map<number, number>();
      return mergeUsedRemainSeries(cpuMap, memMap, cpuLimitCores, memLimitBytes, fetchErrors);
    },
    enabled:
      enabled &&
      Boolean(cpuQuery?.trim()) &&
      Boolean(memQuery?.trim()) &&
      cpuLimitCores > 0 &&
      memLimitBytes > 0,
    staleTime: 45_000,
    refetchInterval: 60_000,
    retry: false,
  });

  if (!enabled) {
    return null;
  }
  if (q.isPending || q.isLoading) {
    return <span className="text-[10px] text-slate-400">加载趋势…</span>;
  }
  if (q.isError) {
    const msg = q.error instanceof Error ? q.error.message : String(q.error);
    return (
      <span className="text-[11px] text-amber-800" title={msg}>
        查询失败
      </span>
    );
  }
  const cpuPts = q.data?.cpuPoints ?? [];
  const memPts = q.data?.memPoints ?? [];
  if (!cpuPts.length && !memPts.length) {
    const hint =
      q.data?.emptyHint ||
      "未解析到有效数据点。若 Prometheus / VM 中 instant 有数据而趋势为空，多为 cAdvisor 序列拆分或时间戳未对齐（已做合并与按秒对齐）。";
    return (
      <span
        className="inline-flex max-w-full cursor-help text-[11px] leading-snug text-slate-500 underline decoration-dotted decoration-slate-300 underline-offset-2"
        title={hint}
      >
        无趋势数据
      </span>
    );
  }

  const memLimitGiB = memLimitBytes / GiB;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <p className="text-[9px] leading-snug text-slate-500">
        来源：<span className="font-mono text-[8px]">prometheusUrlK8s</span> · kubelet cAdvisor（
        <span className="font-mono text-[8px]">container_* · id=&quot;/&quot;</span>）
      </p>
      {cpuPts.length > 0 ? (
        <div>
          <p className="mb-0.5 text-[9px] font-medium text-slate-600">CPU（核，堆叠至可调度上限）</p>
          <ChartContainer
            config={chartCfgCpu}
            className="aspect-auto h-[80px] w-full min-w-[220px] max-w-[300px]"
          >
            <AreaChart data={cpuPts} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 4" vertical={false} className="stroke-slate-200/80" />
              <XAxis dataKey="i" hide />
              <YAxis
                width={32}
                domain={[0, cpuLimitCores]}
                tickFormatter={(v) => (Number(v) < 10 ? `${Number(v).toFixed(1)}` : `${Math.round(Number(v))}`)}
                className="text-[9px]"
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, p) => {
                      const ts = (p?.[0]?.payload as CpuPoint | undefined)?.tsSec;
                      return typeof ts === "number" ? formatSparkTime(ts) : "";
                    }}
                    formatter={(value) => {
                      const n = typeof value === "number" ? value : parseFloat(String(value));
                      return Number.isFinite(n) ? `${n.toFixed(2)} 核` : "—";
                    }}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="used"
                stackId="cpu"
                stroke="var(--color-used)"
                fill="var(--color-used)"
                fillOpacity={0.88}
                strokeWidth={0}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="remain"
                stackId="cpu"
                stroke="var(--color-remain)"
                fill="var(--color-remain)"
                fillOpacity={0.95}
                strokeWidth={0}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        </div>
      ) : null}
      {memPts.length > 0 ? (
        <div>
          <p className="mb-0.5 text-[9px] font-medium text-slate-600">内存（GiB，堆叠至可调度上限）</p>
          <ChartContainer
            config={chartCfgMem}
            className="aspect-auto h-[80px] w-full min-w-[220px] max-w-[300px]"
          >
            <AreaChart data={memPts} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 4" vertical={false} className="stroke-slate-200/80" />
              <XAxis dataKey="i" hide />
              <YAxis
                width={32}
                domain={[0, memLimitGiB]}
                tickFormatter={(v) => `${Number(v).toFixed(0)}G`}
                className="text-[9px]"
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, p) => {
                      const ts = (p?.[0]?.payload as MemPoint | undefined)?.tsSec;
                      return typeof ts === "number" ? formatSparkTime(ts) : "";
                    }}
                    formatter={(value) => {
                      const n = typeof value === "number" ? value : parseFloat(String(value));
                      return Number.isFinite(n) ? `${n.toFixed(2)} GiB` : "—";
                    }}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="used"
                stackId="mem"
                stroke="var(--color-used)"
                fill="var(--color-used)"
                fillOpacity={0.88}
                strokeWidth={0}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="remain"
                stackId="mem"
                stroke="var(--color-remain)"
                fill="var(--color-remain)"
                fillOpacity={0.95}
                strokeWidth={0}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        </div>
      ) : null}
      <MiniLegend
        items={[
          { color: "hsl(221 83% 53%)", label: "CPU 已用" },
          { color: "hsl(214 32% 91%)", label: "CPU 剩余" },
          { color: "hsl(262 83% 58%)", label: "内存已用" },
          { color: "hsl(270 20% 92%)", label: "内存剩余" },
        ]}
      />
    </div>
  );
};

export default CloudVmUsageSparkline;
