import React, { useMemo, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGetJson, type AppConfig } from "@/lib/api";
import type { VCenterHostsResponse } from "./types";
import {
  matrixToChartRows,
  promInstantScalar,
  promQueryRangeVcenter,
  promQueryVcenter,
} from "./vcenterPrometheusHelpers";
import { cn } from "@/lib/utils";

function fmtUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}天${h}时`;
  if (h > 0) return `${h}时${m}分`;
  return `${m}分`;
}

function fmtAxisTime(iso: string): string {
  try {
    return format(new Date(iso), "M/d HH:mm", { locale: zhCN });
  } catch {
    return iso;
  }
}

const chartMem: ChartConfig = { v: { label: "内存", color: "hsl(262 70% 52%)" } };
const chartDs: ChartConfig = { v: { label: "使用率", color: "hsl(199 72% 46%)" } };
const chartCpu: ChartConfig = { v: { label: "MHz", color: "hsl(221 83% 53%)" } };

/** 对齐 Grafana「VMware ESXi」看板：宿主机统计 + VM/存储时序（Prometheus scope=vcenter） */
const VCenterEsxiPrometheusDashboard: React.FC = () => {
  const cfgQ = useAppConfig();

  const [range, setRange] = useState<"1h" | "6h" | "24h">("6h");
  const [host, setHost] = useState<string>("");
  const [dcName, setDcName] = useState<string>("Frps");
  const [ds1, setDs1] = useState("datastore1");
  const [ds2, setDs2] = useState("datastore2");
  const [ds3, setDs3] = useState("backup_nfs");

  const hostsFromProm = useQuery({
    queryKey: ["vcenter-prom-hosts"],
    queryFn: async ({ signal }) => {
      const data = await promQueryVcenter(
        "max by (host_name) (vmware_host_boot_timestamp_seconds)",
        { signal }
      );
      const d = data as {
        status?: string;
        data?: { result?: Array<{ metric?: Record<string, string> }> };
      };
      if (d.status !== "success" || !d.data?.result) return [] as string[];
      const names = new Set<string>();
      for (const r of d.data.result) {
        const hn = r.metric?.host_name;
        if (hn) names.add(hn);
      }
      return Array.from(names).sort();
    },
    enabled:
      cfgQ.data?.prometheusVcenterConfigured === true ||
      cfgQ.data?.prometheusConfigured === true,
    staleTime: 120_000,
  });

  const hostsFromVc = useQuery({
    queryKey: ["vcenter-hosts-names"],
    queryFn: ({ signal }) => apiGetJson<VCenterHostsResponse>("/api/vcenter/hosts", { signal }),
    enabled: hostsFromProm.data?.length === 0 && cfgQ.isSuccess,
    staleTime: 120_000,
  });

  const hostOptions = useMemo(() => {
    const a = hostsFromProm.data ?? [];
    if (a.length) return a;
    const h = hostsFromVc.data?.hosts ?? [];
    return h.map((x) => x.name).filter(Boolean);
  }, [hostsFromProm.data, hostsFromVc.data?.hosts]);

  React.useEffect(() => {
    if (!host && hostOptions.length) {
      setHost(hostOptions[0] ?? "");
    }
  }, [host, hostOptions]);

  /** 使用等值匹配，避免 =~ 正则里 `\.` 等在 PromQL 字符串中的转义与 Prometheus 400 */
  const hostLabel = host ? `host_name=${JSON.stringify(host)}` : "";

  const windowSec = range === "1h" ? 3600 : range === "6h" ? 6 * 3600 : 24 * 3600;
  const { endSec, startSec, step } = useMemo(() => {
    const end = Math.floor(Date.now() / 1000);
    const start = end - windowSec;
    const step =
      range === "24h" ? "120" : range === "6h" ? "60" : "30";
    return { endSec: end, startSec: start, step };
  }, [range, windowSec]);

  const statsQ = useQuery({
    queryKey: ["vcenter-esxi-stats", host, hostLabel, ds1, ds2, ds3],
    queryFn: async ({ signal }) => {
      if (!hostLabel) throw new Error("未选择 ESXi");
      const qBoot = `vmware_host_boot_timestamp_seconds{${hostLabel}}`;
      const qCpu = `(vmware_host_cpu_usage{${hostLabel}}) * 100 / (vmware_host_cpu_max{${hostLabel}})`;
      const qMem = `(vmware_host_memory_usage{${hostLabel}}) * 100 / (vmware_host_memory_max{${hostLabel}})`;
      const qDs = (name: string) => {
        const lit = JSON.stringify(name);
        return `((vmware_datastore_capacity_size{${hostLabel}, ds_name=${lit}}) - (vmware_datastore_freespace_size{${hostLabel}, ds_name=${lit}})) * 100 / (vmware_datastore_capacity_size{${hostLabel}, ds_name=${lit}})`;
      };

      const [bootTs, cpu, mem, d1, d2, d3] = await Promise.all([
        promQueryVcenter(qBoot, { signal }).then(promInstantScalar),
        promQueryVcenter(qCpu, { signal }).then(promInstantScalar),
        promQueryVcenter(qMem, { signal }).then(promInstantScalar),
        promQueryVcenter(qDs(ds1), { signal }).then(promInstantScalar),
        promQueryVcenter(qDs(ds2), { signal }).then(promInstantScalar),
        promQueryVcenter(qDs(ds3), { signal }).then(promInstantScalar),
      ]);
      const nowSec = Date.now() / 1000;
      const uptime =
        bootTs != null && Number.isFinite(bootTs) ? nowSec - bootTs : null;
      return { uptime, cpu, mem, d1, d2, d3 };
    },
    enabled:
      Boolean(hostLabel) &&
      (cfgQ.data?.prometheusVcenterConfigured === true ||
        cfgQ.data?.prometheusConfigured === true),
    refetchInterval: 60_000,
  });

  const memSeriesQ = useQuery({
    queryKey: ["vcenter-chart-vm-mem", hostLabel, startSec, endSec, step],
    queryFn: ({ signal }) =>
      promQueryRangeVcenter(
        `rate(vmware_vm_mem_usage_average{${hostLabel}}[5m]) / 4`,
        startSec,
        endSec,
        step,
        { signal }
      ),
    enabled: Boolean(hostLabel) && cfgQ.isSuccess,
  });

  const dsSeriesQ = useQuery({
    queryKey: ["vcenter-chart-ds", dcName, startSec, endSec, step],
    queryFn: ({ signal }) => {
      const dc = dcName.trim();
      const lit = JSON.stringify(dc);
      /** 与 Grafana 一致：先按 dc 过滤；无 dc 时对容量/空闲先 sum by(ds_name) 再算使用率，避免标签不完全一致时减除无法匹配 */
      const q =
        dc.length > 0
          ? `((vmware_datastore_capacity_size{dc_name=${lit}}) - (vmware_datastore_freespace_size{dc_name=${lit}})) * 100 / (vmware_datastore_capacity_size{dc_name=${lit}})`
          : `((sum by (ds_name)(vmware_datastore_capacity_size) - sum by (ds_name)(vmware_datastore_freespace_size)) * 100) / sum by (ds_name)(vmware_datastore_capacity_size)`;
      return promQueryRangeVcenter(q, startSec, endSec, step, { signal });
    },
    enabled: cfgQ.isSuccess,
  });

  const vmCpuSeriesQ = useQuery({
    queryKey: ["vcenter-chart-vm-cpu", hostLabel, startSec, endSec, step],
    queryFn: ({ signal }) =>
      promQueryRangeVcenter(
        `rate(vmware_vm_cpu_usagemhz_average{${hostLabel}}[5m])`,
        startSec,
        endSec,
        step,
        { signal }
      ),
    enabled: Boolean(hostLabel) && cfgQ.isSuccess,
  });

  const memRows = useMemo(
    () => matrixToChartRows(memSeriesQ.data, "vm_name"),
    [memSeriesQ.data]
  );
  const dsRows = useMemo(
    () => matrixToChartRows(dsSeriesQ.data, "ds_name"),
    [dsSeriesQ.data]
  );
  const cpuRows = useMemo(
    () => matrixToChartRows(vmCpuSeriesQ.data, "vm_name"),
    [vmCpuSeriesQ.data]
  );

  const memKeys = useMemo(() => {
    const k = new Set<string>();
    for (const row of memRows) {
      for (const x of Object.keys(row)) {
        if (x !== "t") k.add(x);
      }
    }
    return Array.from(k).slice(0, 24);
  }, [memRows]);

  const dsKeys = useMemo(() => {
    const k = new Set<string>();
    for (const row of dsRows) {
      for (const x of Object.keys(row)) {
        if (x !== "t") k.add(x);
      }
    }
    return Array.from(k).slice(0, 32);
  }, [dsRows]);

  const cpuKeys = useMemo(() => {
    const k = new Set<string>();
    for (const row of cpuRows) {
      for (const x of Object.keys(row)) {
        if (x !== "t") k.add(x);
      }
    }
    return Array.from(k).slice(0, 24);
  }, [cpuRows]);

  const palette = [
    "hsl(262 70% 52%)",
    "hsl(199 72% 46%)",
    "hsl(142 71% 42%)",
    "hsl(32 90% 48%)",
    "hsl(350 70% 52%)",
    "hsl(280 65% 52%)",
  ];

  if (cfgQ.isLoading || !cfgQ.data) return null;
  const cfg = cfgQ.data;
  const promOk =
    cfg.prometheusVcenterConfigured === true || cfg.prometheusConfigured === true;

  if (!promOk) {
    return (
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 px-5 py-4 text-sm text-amber-950">
        <p className="font-medium">未配置 vCenter 用 Prometheus</p>
        <p className="mt-1 text-xs text-amber-900/90">
          在运行时配置中填写 <code className="rounded bg-white/70 px-1">prometheusUrlVcenter</code>（或兜底
          prometheusUrl），以便展示与 Grafana 一致的 ESXi / 虚拟机指标。
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
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-slate-900">ESXi · Prometheus 监控</h2>
        <p className="text-xs text-slate-500">
          与 Grafana「VMware ESXi」看板同源思路：按宿主机过滤 PromQL，展示宿主机利用率与 VM / 存储时序。指标名需与
          exporter（如 vmware_exporter / Telegraf）一致。
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="space-y-1">
          <Label className="text-xs">ESXi（host_name）</Label>
          <Select
            value={host || undefined}
            onValueChange={setHost}
            disabled={hostOptions.length === 0}
          >
            <SelectTrigger className="h-9 w-[220px] font-mono text-xs">
              <SelectValue placeholder={hostsFromProm.isLoading ? "加载…" : "选择主机"} />
            </SelectTrigger>
            <SelectContent>
              {hostOptions.map((h) => (
                <SelectItem key={h} value={h} className="font-mono text-xs">
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">时间范围</Label>
          <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
            <SelectTrigger className="h-9 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">最近 1 小时</SelectItem>
              <SelectItem value="6h">最近 6 小时</SelectItem>
              <SelectItem value="24h">最近 24 小时</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">数据中心 ds_name 汇总（可选）</Label>
          <Input
            className="h-9 w-[140px] font-mono text-xs"
            placeholder="如 Frps，可空"
            value={dcName}
            onChange={(e) => setDcName(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => {
            void statsQ.refetch();
            void memSeriesQ.refetch();
            void dsSeriesQ.refetch();
            void vmCpuSeriesQ.refetch();
          }}
        >
          刷新
        </Button>
        <Link
          to="/cluster/vcenter/settings"
          className="text-xs font-medium text-violet-700 hover:underline"
        >
          数据源
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatBox
          title="ESXi 运行时间"
          loading={statsQ.isLoading}
          value={
            statsQ.data?.uptime != null
              ? fmtUptime(statsQ.data.uptime)
              : "—"
          }
          sub="当前时间 − vmware_host_boot_timestamp_seconds"
        />
        <StatBox
          title="Host CPU 使用"
          loading={statsQ.isLoading}
          value={
            statsQ.data?.cpu != null ? `${statsQ.data.cpu.toFixed(1)} %` : "—"
          }
        />
        <StatBox
          title="Host Memory 使用"
          loading={statsQ.isLoading}
          value={
            statsQ.data?.mem != null ? `${statsQ.data.mem.toFixed(1)} %` : "—"
          }
        />
        <StatBox
          title={`DS ${ds1}`}
          loading={statsQ.isLoading}
          value={
            statsQ.data?.d1 != null ? `${statsQ.data.d1.toFixed(1)} %` : "—"
          }
          footer={
            <Input
              className="mt-1 h-7 font-mono text-[10px]"
              value={ds1}
              onChange={(e) => setDs1(e.target.value)}
            />
          }
        />
        <StatBox
          title={`DS ${ds2}`}
          loading={statsQ.isLoading}
          value={
            statsQ.data?.d2 != null ? `${statsQ.data.d2.toFixed(1)} %` : "—"
          }
          footer={
            <Input
              className="mt-1 h-7 font-mono text-[10px]"
              value={ds2}
              onChange={(e) => setDs2(e.target.value)}
            />
          }
        />
        <StatBox
          title={`DS ${ds3}`}
          loading={statsQ.isLoading}
          value={
            statsQ.data?.d3 != null ? `${statsQ.data.d3.toFixed(1)} %` : "—"
          }
          footer={
            <Input
              className="mt-1 h-7 font-mono text-[10px]"
              value={ds3}
              onChange={(e) => setDs3(e.target.value)}
            />
          }
        />
      </div>

      {statsQ.isError && (
        <p className="text-sm text-red-600">
          {(statsQ.error as Error).message}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-1">
        <ChartCard title="vm Memory Usage（rate/4，与 Grafana 一致）" loading={memSeriesQ.isLoading}>
          {memRows.length === 0 && !memSeriesQ.isLoading ? (
            <p className="text-xs text-slate-500">暂无序列</p>
          ) : (
            <ChartContainer config={chartMem} className="h-[280px] w-full sm:h-[320px]">
              <LineChart data={memRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80" />
                <XAxis
                  dataKey="t"
                  tickFormatter={(v) => fmtAxisTime(String(v))}
                  tick={{ fontSize: 10 }}
                  stroke="hsl(215 16% 65%)"
                />
                <YAxis tick={{ fontSize: 10 }} width={44} stroke="hsl(215 16% 65%)" />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, p) => {
                        const row = (p as { payload?: { t?: string } })?.payload;
                        return row?.t ? fmtAxisTime(String(row.t)) : "";
                      }}
                    />
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {memKeys.map((k, i) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={k}
                    stroke={palette[i % palette.length]}
                    dot={false}
                    strokeWidth={1.2}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ChartContainer>
          )}
        </ChartCard>

        <ChartCard title="Datastores Usage（按数据中心聚合）" loading={dsSeriesQ.isLoading}>
          {dsSeriesQ.isError && (
            <p className="text-xs text-red-600">
              {(dsSeriesQ.error as Error).message}
            </p>
          )}
          {dsRows.length === 0 && !dsSeriesQ.isLoading && !dsSeriesQ.isError ? (
            <p className="text-xs text-slate-500">
              暂无序列。请核对数据中心名称与 Prometheus 中{" "}
              <code className="rounded bg-slate-100 px-0.5">dc_name</code> 标签；留空时按{" "}
              <code className="rounded bg-slate-100 px-0.5">ds_name</code> 汇总。
            </p>
          ) : dsRows.length > 0 ? (
            <ChartContainer config={chartDs} className="h-[280px] w-full sm:h-[320px]">
              <LineChart data={dsRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80" />
                <XAxis
                  dataKey="t"
                  tickFormatter={(v) => fmtAxisTime(String(v))}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 10 }} width={40} domain={[0, 100]} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {dsKeys.map((k, i) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={k}
                    stroke={palette[i % palette.length]}
                    dot={false}
                    strokeWidth={1.2}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ChartContainer>
          ) : null}
        </ChartCard>

        <ChartCard title="vm CPU usage（MHz，rate 5m）" loading={vmCpuSeriesQ.isLoading}>
          {cpuRows.length === 0 && !vmCpuSeriesQ.isLoading ? (
            <p className="text-xs text-slate-500">暂无序列</p>
          ) : (
            <ChartContainer config={chartCpu} className="h-[300px] w-full sm:h-[340px]">
              <LineChart data={cpuRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80" />
                <XAxis
                  dataKey="t"
                  tickFormatter={(v) => fmtAxisTime(String(v))}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 10 }} width={48} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {cpuKeys.map((k, i) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={k}
                    stroke={palette[i % palette.length]}
                    dot={false}
                    strokeWidth={1.2}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ChartContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
};

function StatBox({
  title,
  value,
  loading,
  sub,
  footer,
}: {
  title: string;
  value: string;
  loading?: boolean;
  sub?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-medium text-slate-600">{title}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-slate-400">{sub}</p> : null}
      <p className="mt-2 font-mono text-lg font-semibold tabular-nums text-slate-900">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : (
          value
        )}
      </p>
      {footer}
    </div>
  );
}

function ChartCard({
  title,
  children,
  loading,
}: {
  title: string;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/90 to-white p-4 shadow-sm"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
      </div>
      {children}
    </div>
  );
}

export default VCenterEsxiPrometheusDashboard;
