import React, { useMemo, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, Search } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  Tooltip as RechartsTooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import { apiGetJson, type AppConfig } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export type VCenterPrometheusMetricsResponse = {
  job: string;
  discovery: string;
  seriesCount: number;
  metricCount: number;
  okCount: number;
  hint?: string;
  metrics: Array<{
    name: string;
    value?: number;
    error?: string;
    ok: boolean;
  }>;
  generatedAt?: string;
  cacheSource?: string;
};

type ChartRow = {
  fullName: string;
  short: string;
  value: number;
};

function fmtMetricValue(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const av = Math.abs(v);
  if (av >= 1e12) return v.toExponential(3);
  if (av >= 1e9) return v.toExponential(3);
  if (av >= 1e6) return v.toExponential(3);
  if (av >= 1e4) return v.toFixed(0);
  if (av >= 100) return v.toFixed(1);
  if (av >= 1) return v.toFixed(3);
  return v.toFixed(4);
}

function shortMetricLabel(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, Math.max(0, maxLen - 1)) + "…";
}

const TREEMAP_COLORS = [
  "hsl(262 72% 58%)",
  "hsl(280 65% 52%)",
  "hsl(245 70% 55%)",
  "hsl(220 70% 52%)",
  "hsl(199 72% 46%)",
  "hsl(152 52% 40%)",
  "hsl(32 90% 48%)",
  "hsl(350 70% 52%)",
];

const barChartConfig = {
  value: { label: "sum 快照", color: "hsl(262 70% 52%)" },
} as const;

/** 基于 sum 快照的柱状图 / 矩形树图；明细表在单独标签 */
const VCenterPrometheusPanel: React.FC = () => {
  const cfgQ = useAppConfig();

  const [job, setJob] = useState("vmware_vcenter");
  const [filter, setFilter] = useState("");

  const metricsQ = useQuery({
    queryKey: ["vcenter-prometheus-metrics", job],
    queryFn: ({ signal }) =>
      apiGetJson<VCenterPrometheusMetricsResponse>(
        `/api/prometheus/vcenter-metrics?job=${encodeURIComponent(job)}`
      , { signal }),
    enabled:
      cfgQ.data?.prometheusVcenterConfigured === true ||
      cfgQ.data?.prometheusConfigured === true,
    staleTime: 10 * 60_000,
  });

  const filtered = useMemo(() => {
    const rows = metricsQ.data?.metrics ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [metricsQ.data?.metrics, filter]);

  const chartRows: ChartRow[] = useMemo(() => {
    return filtered
      .filter((r) => r.ok && r.value != null && Number.isFinite(r.value))
      .map((r) => ({
        fullName: r.name,
        short: shortMetricLabel(r.name, 46),
        value: r.value as number,
      }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }, [filtered]);

  /** Recharts Treemap flat：data 为子节点数组（库内会包一层 root） */
  const treemapFlatData = useMemo(
    () =>
      chartRows.map((r) => ({
        name: shortMetricLabel(r.fullName, 30),
        fullName: r.fullName,
        value: Math.max(Math.abs(r.value), Number.EPSILON),
        originalSum: r.value,
      })),
    [chartRows]
  );

  const barChartHeightPx = useMemo(() => {
    const n = chartRows.length;
    if (n === 0) return 280;
    return Math.min(3600, Math.max(320, n * 26 + 100));
  }, [chartRows.length]);

  if (cfgQ.isLoading || !cfgQ.data) return null;
  const cfg = cfgQ.data;

  const promOk = cfg.prometheusVcenterConfigured === true || cfg.prometheusConfigured === true;
  if (!promOk) {
    return (
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 px-5 py-4 text-sm text-amber-950">
        <p className="font-medium">未配置 vCenter 用 Prometheus</p>
        <p className="mt-1 text-xs text-amber-900/90">
          在运行时配置中填写 <code className="rounded bg-white/70 px-1">prometheusUrlVcenter</code>（或兜底
          prometheusUrl），并确保 Prometheus 已抓取 <code className="rounded bg-white/70 px-1">job=&quot;vmware_vcenter&quot;</code>{" "}
          等指标。
        </p>
        <Link
          to="/cluster/vcenter/settings"
          className="mt-2 inline-block text-sm font-semibold text-amber-950 underline underline-offset-2"
        >
          vCenter 设置 / 监控
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">vCenter · Prometheus 全量指标</h2>
          <p className="text-xs text-slate-500">
            使用同一套快照数据：<strong className="font-semibold text-slate-700">柱长 / 块面积</strong>对应各指标的{" "}
            <code className="rounded bg-slate-100 px-1">sum(...)</code> 数值（非仅罗列名称）。最多 200 个指标名参与聚合。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500">job</label>
            <Input
              className="h-8 w-[140px] font-mono text-xs"
              value={job}
              onChange={(e) => setJob(e.target.value.trim() || "vmware_vcenter")}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            disabled={metricsQ.isFetching}
            onClick={() => void metricsQ.refetch()}
          >
            {metricsQ.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            刷新
          </Button>
          <Link to="/cluster/vcenter/settings" className="text-xs font-medium text-violet-700 hover:underline">
            数据源
          </Link>
        </div>
      </div>

      {metricsQ.isLoading && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在从 Prometheus 拉取快照并绘图…
        </p>
      )}
      {metricsQ.isError && (
        <p className="text-sm text-red-600">
          {(metricsQ.error as Error).message}
          <Link to="/cluster/vcenter/settings" className="ml-2 text-violet-700 underline">
            检查配置
          </Link>
        </p>
      )}

      {metricsQ.data && (
        <>
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            <span>
              序列数: <strong className="text-slate-900">{metricsQ.data.seriesCount}</strong>
            </span>
            <span>
              指标名: <strong className="text-slate-900">{metricsQ.data.metricCount}</strong>
            </span>
            <span>
              聚合成功: <strong className="text-emerald-700">{metricsQ.data.okCount}</strong>
            </span>
            <span className="text-slate-400">
              发现方式: {metricsQ.data.discovery === "job" ? `job=${metricsQ.data.job}` : "vmware_* 前缀回退"}
            </span>
            {metricsQ.data.generatedAt && (
              <span className="text-slate-400">快照: {metricsQ.data.generatedAt}</span>
            )}
          </div>

          <div className="relative max-w-xl">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="筛选指标（图表与明细同步）…"
              className="h-9 pl-8 font-mono text-xs"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          {chartRows.length === 0 ? (
            <p className="text-sm text-slate-500">
              当前筛选下没有可绘图的数值（需聚合成功且为有限数）。可清空筛选或检查 Prometheus 是否有数据。
            </p>
          ) : (
            <Tabs defaultValue="bars" className="w-full gap-3">
              <TabsList className="h-9 w-full max-w-md justify-start sm:w-auto">
                <TabsTrigger value="bars" className="text-xs">
                  柱状对比
                </TabsTrigger>
                <TabsTrigger value="treemap" className="text-xs">
                  矩形树图（占比）
                </TabsTrigger>
                <TabsTrigger value="table" className="text-xs">
                  明细表
                </TabsTrigger>
              </TabsList>

              <TabsContent value="bars" className="mt-0 outline-none">
                <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
                  横向柱长 = 该指标的 <code className="rounded bg-slate-100 px-0.5">sum</code> 快照；已按绝对值从大到小排序。存在负值时以 0 为参考线。
                </p>
                <div
                  className="overflow-auto rounded-xl border border-slate-200 bg-white"
                  style={{ maxHeight: "min(72vh, 900px)" }}
                >
                  <ChartContainer
                    config={barChartConfig}
                    className={cn(
                      "w-full min-w-[min(100%,520px)] !aspect-auto",
                      "[&_.recharts-surface]:outline-none"
                    )}
                    style={{ height: barChartHeightPx, minHeight: 280 }}
                  >
                    <BarChart
                      layout="vertical"
                      data={chartRows}
                      margin={{ top: 8, right: 20, left: 4, bottom: 8 }}
                      barCategoryGap={6}
                    >
                      <CartesianGrid strokeDasharray="3 4" horizontal={false} className="stroke-slate-200/90" />
                      <XAxis
                        type="number"
                        domain={["auto", "auto"]}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => fmtMetricValue(Number(v))}
                        tick={{ fontSize: 10, fill: "hsl(215 16% 42%)" }}
                      />
                      <YAxis
                        type="category"
                        dataKey="short"
                        width={288}
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                        tick={{ fontSize: 9, fill: "hsl(215 16% 32%)" }}
                      />
                      <ReferenceLine
                        x={0}
                        stroke="hsl(215 16% 78%)"
                        strokeWidth={1}
                        ifOverflow="visible"
                      />
                      <Bar
                        dataKey="value"
                        name="sum"
                        fill="var(--color-value)"
                        radius={[0, 5, 5, 0]}
                        maxBarSize={22}
                      />
                      <RechartsTooltip
                        cursor={{ fill: "hsl(214 32% 97% / 0.75)" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const row = payload[0].payload as ChartRow;
                          return (
                            <div className="max-w-sm rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs shadow-lg">
                              <p className="break-all font-mono text-[10px] leading-snug text-slate-600">
                                {row.fullName}
                              </p>
                              <p className="mt-1 font-semibold tabular-nums text-violet-900">
                                {fmtMetricValue(row.value)}
                              </p>
                            </div>
                          );
                        }}
                      />
                    </BarChart>
                  </ChartContainer>
                </div>
              </TabsContent>

              <TabsContent value="treemap" className="mt-0 outline-none">
                <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
                  块面积 ∝ 指标 <code className="rounded bg-slate-100 px-0.5">|sum|</code>，便于一眼看出哪些指标占总量主导；悬停可看完整指标名与符号。
                </p>
                <div className="h-[min(56vh,480px)] min-h-[280px] w-full overflow-hidden rounded-xl border border-slate-200 bg-white p-1">
                  <ChartContainer
                    config={{
                      size: { label: "占比", color: "hsl(262 70% 52%)" },
                    }}
                    className="h-full w-full !aspect-auto [&_.recharts-responsive-container]:h-full"
                  >
                    <Treemap
                      type="flat"
                      data={treemapFlatData}
                      dataKey="value"
                      nameKey="name"
                      stroke="hsl(214 32% 98%)"
                      colorPanel={TREEMAP_COLORS as unknown as []}
                      aspectRatio={4 / 3}
                    >
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const item = payload[0].payload as {
                            fullName?: string;
                            name?: string;
                            value?: number;
                            originalSum?: number;
                          };
                          return (
                            <div className="max-w-sm rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs shadow-lg">
                              <p className="break-all font-mono text-[10px] leading-snug text-slate-600">
                                {item.fullName ?? item.name}
                              </p>
                              <p className="mt-1 font-semibold tabular-nums text-violet-900">
                                sum（原始）: {fmtMetricValue(Number(item.originalSum ?? 0))}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                块面积 ∝ |sum|：{fmtMetricValue(Number(item.value))}
                              </p>
                            </div>
                          );
                        }}
                      />
                    </Treemap>
                  </ChartContainer>
                </div>
              </TabsContent>

              <TabsContent value="table" className="mt-0 outline-none">
                <div className="max-h-[min(50vh,480px)] overflow-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-100/95 text-slate-600 backdrop-blur">
                      <tr>
                        <th className="border-b border-slate-200 px-3 py-2 font-semibold">指标</th>
                        <th className="border-b border-slate-200 px-3 py-2 font-semibold">sum 快照</th>
                        <th className="border-b border-slate-200 px-3 py-2 font-semibold">说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row) => (
                        <tr key={row.name} className="border-b border-slate-50 hover:bg-slate-50/80">
                          <td className="max-w-[min(40vw,320px)] truncate px-3 py-1.5 font-mono text-[11px] text-slate-900">
                            {row.name}
                          </td>
                          <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-slate-800">
                            {row.ok && row.value != null && Number.isFinite(row.value)
                              ? fmtMetricValue(row.value)
                              : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-amber-800">
                            {!row.ok && row.error ? row.error : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          )}

          {metricsQ.data.hint && (
            <p className="text-[11px] leading-relaxed text-slate-500">{metricsQ.data.hint}</p>
          )}
        </>
      )}
    </div>
  );
};

export default VCenterPrometheusPanel;
