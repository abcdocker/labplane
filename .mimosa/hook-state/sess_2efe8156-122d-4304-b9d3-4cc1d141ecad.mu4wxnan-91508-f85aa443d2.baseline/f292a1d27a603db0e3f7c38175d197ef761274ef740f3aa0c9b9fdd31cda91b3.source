import React, { useMemo } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { useQuery } from "@tanstack/react-query";
import { Activity, Database, Gauge, Loader2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGetJson, prometheusQueryRangeApi, type AppConfig } from "@/lib/api";
import { cn } from "@/lib/utils";

type PromMatrix = {
  status?: string;
  data?: {
    result?: Array<{ values?: [number, string][] }>;
  };
};

function parseMatrixFirstSeries(data: unknown): { t: number; v: number }[] {
  const d = data as PromMatrix;
  if (d?.status !== "success") return [];
  const vals = d?.data?.result?.[0]?.values;
  if (!vals?.length) return [];
  return vals.map(([ts, sv]) => ({
    t: ts * 1000,
    v: parseFloat(String(sv)) || 0,
  }));
}

function buildPodSelector(namespace: string, deploymentName: string) {
  const ns = namespace.trim();
  const dep = deploymentName.trim();
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `{namespace="${esc(ns)}",pod=~"${esc(dep)}-.*"}`;
}

async function queryRangeK8s(q: string, start: number, end: number, step: string) {
  return prometheusQueryRangeApi("k8s", q, start, end, step);
}

type ChartBlockProps = {
  title: string;
  subtitle: string;
  data: { t: number; v: number }[];
  color: string;
  yTick?: (v: number) => string;
};

function MiniLineChart({ title, subtitle, data, color, yTick }: ChartBlockProps) {
  const chartData = useMemo(
    () => data.map((d) => ({ ...d, label: new Date(d.t).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) })),
    [data]
  );
  const fmtY = yTick ?? ((v: number) => (Number.isFinite(v) ? v.toFixed(1) : "—"));

  if (data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 text-xs text-slate-500">
        无数据点（Prometheus 可能尚未抓取或标签不匹配）
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-800">{title}</p>
      <p className="text-[11px] text-slate-500">{subtitle}</p>
      <ChartContainer
        config={{ v: { label: title, color } }}
        className="h-[200px] w-full !aspect-auto [&_.recharts-responsive-container]:min-h-[200px]"
      >
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200/80" />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(ts) =>
              new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
            }
            tick={{ fontSize: 10, fill: "hsl(215 16% 42%)" }}
          />
          <YAxis
            width={44}
            tickFormatter={fmtY}
            tick={{ fontSize: 10, fill: "hsl(215 16% 42%)" }}
            domain={["auto", "auto"]}
          />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ChartContainer>
    </div>
  );
}

export type RedisExporterMonitorChartsProps = {
  namespace: string;
  deploymentName: string;
  /** 仅当为 true 时发起查询（例如已勾选 exporter） */
  active: boolean;
  className?: string;
};

/**
 * 使用 Prometheus 中 redis_exporter 指标绘图；需集群 Prometheus 已抓取 Pod 上 :9121/metrics。
 */
const RedisExporterMonitorCharts: React.FC<RedisExporterMonitorChartsProps> = ({
  namespace,
  deploymentName,
  active,
  className,
}) => {
  const cfgQ = useAppConfig();

  const promOk =
    cfgQ.data?.prometheusK8sConfigured === true || cfgQ.data?.prometheusConfigured === true;

  const sel = useMemo(() => buildPodSelector(namespace, deploymentName), [namespace, deploymentName]);

  const rangeQ = useQuery({
    queryKey: ["redis-exporter-range", namespace, deploymentName, sel],
    queryFn: async ({ signal }) => {
      const end = Math.floor(Date.now() / 1000);
      const start = end - 3600;
      const step = "30s";
      const [mem, clients, cmdRate] = await Promise.all([
        queryRangeK8s(`sum(redis_memory_used_bytes${sel})`, start, end, step),
        queryRangeK8s(`sum(redis_connected_clients${sel})`, start, end, step),
        queryRangeK8s(`sum(rate(redis_commands_processed_total${sel}[5m]))`, start, end, step),
      ]);
      return {
        mem: parseMatrixFirstSeries(mem),
        clients: parseMatrixFirstSeries(clients),
        cmdRate: parseMatrixFirstSeries(cmdRate),
      };
    },
    enabled: active && promOk && Boolean(namespace.trim() && deploymentName.trim()),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (!active) {
    return null;
  }

  if (cfgQ.isLoading || !cfgQ.data) {
    return null;
  }

  if (!promOk) {
    return (
      <Card className={cn("rounded-xl border border-amber-200/80 bg-amber-50/50", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-amber-950">Redis 监控（exporter）</CardTitle>
          <CardDescription className="text-xs text-amber-900/90">
            未配置 Kubernetes 用 Prometheus（<code className="rounded bg-white/60 px-1">prometheusUrlK8s</code> 或兜底{" "}
            <code className="rounded bg-white/60 px-1">prometheusUrl</code>）。配置后需让 Prometheus 抓取 Pod 上 redis-exporter 暴露的{" "}
            <code className="rounded bg-white/60 px-1">:9121/metrics</code>（已加 pod 注解时可由 Prometheus Operator 发现）。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={cn("rounded-xl border border-emerald-200/70 bg-white shadow-sm", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <Gauge className="mt-0.5 h-4 w-4 text-emerald-600" />
          <div>
            <CardTitle className="text-sm text-slate-900">监控（redis_exporter / Prometheus）</CardTitle>
            <CardDescription className="text-xs text-slate-600">
              最近 1 小时 · 命名空间 <span className="font-mono text-slate-800">{namespace}</span> · Pod{" "}
              <span className="font-mono text-slate-800">{deploymentName}-*</span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {rangeQ.isLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> 加载 Prometheus 时序…
          </div>
        )}
        {rangeQ.error && (
          <p className="text-sm text-red-600">{(rangeQ.error as Error).message}</p>
        )}
        {rangeQ.data && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="flex gap-2">
              <Database className="mt-1 h-4 w-4 shrink-0 text-sky-600" />
              <MiniLineChart
                title="内存占用"
                subtitle="redis_memory_used_bytes（sum）"
                data={rangeQ.data.mem}
                color="hsl(199 89% 48%)"
                yTick={(v) => `${(v / 1024 / 1024).toFixed(1)}MiB`}
              />
            </div>
            <div className="flex gap-2">
              <Activity className="mt-1 h-4 w-4 shrink-0 text-violet-600" />
              <MiniLineChart
                title="连接数"
                subtitle="redis_connected_clients（sum）"
                data={rangeQ.data.clients}
                color="hsl(262 70% 50%)"
                yTick={(v) => v.toFixed(0)}
              />
            </div>
            <div className="flex gap-2">
              <Gauge className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
              <MiniLineChart
                title="命令吞吐"
                subtitle="rate(redis_commands_processed_total[5m])（sum）"
                data={rangeQ.data.cmdRate}
                color="hsl(142 71% 40%)"
                yTick={(v) => v.toFixed(2)}
              />
            </div>
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-slate-500">
          指标依赖 Prometheus 中的 <code className="rounded bg-slate-100 px-1">namespace</code> /{" "}
          <code className="rounded bg-slate-100 px-1">pod</code> 标签；若图为空，请在 Prometheus「Targets」中确认已抓取该 Pod 的 redis-exporter 端口。
        </p>
      </CardContent>
    </Card>
  );
};

export default RedisExporterMonitorCharts;
