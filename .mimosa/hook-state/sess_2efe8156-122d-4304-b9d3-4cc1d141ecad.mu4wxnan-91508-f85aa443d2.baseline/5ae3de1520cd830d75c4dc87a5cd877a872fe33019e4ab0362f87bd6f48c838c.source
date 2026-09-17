import React from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
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
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGetJson } from "@/lib/api";
import type { PerfPoint, VCenterVMPerfResponse } from "./types";
import { cn } from "@/lib/utils";
import {
  VC_CPU_MEM_CRIT_PCT,
  VC_CPU_MEM_WARN_PCT,
  diskNetPeakSeries,
  lineColorByMaxPct,
  maxSeries,
  percentileSorted,
} from "./vcenterThresholdCharts";

function fmtAxisTime(iso: string): string {
  try {
    return format(new Date(iso), "M月d日 HH:mm", { locale: zhCN });
  } catch {
    return iso;
  }
}

/** vSphere 计数器名 → 中文（用于「部分计数器不可用」提示） */
function counterNameZh(name: string): string {
  const m: Record<string, string> = {
    "cpu.usage.average": "CPU 使用率（平均）",
    "mem.usage.average": "内存使用率（平均）",
    "disk.read.average": "磁盘读（平均）",
    "disk.write.average": "磁盘写（平均）",
    "datastore.read.average": "数据存储读（平均）",
    "datastore.write.average": "数据存储写（平均）",
    "virtualDisk.read.average": "虚拟磁盘读（平均）",
    "virtualDisk.write.average": "虚拟磁盘写（平均）",
    "net.received.average": "网络接收（平均）",
    "net.transmitted.average": "网络发送（平均）",
    "net.bytesRx.average": "网络接收字节（平均）",
    "net.bytesTx.average": "网络发送字节（平均）",
  };
  return m[name] ?? name;
}

function unitSuffix(unit: string | undefined): string {
  switch (unit) {
    case "percent":
      return "%";
    case "kiloBytesPerSecond":
      return " KB/s";
    case "megaBytesPerSecond":
      return " MB/s";
    default:
      return "";
  }
}

/** 合并双序列；任一侧有数据即可作为时间轴（避免仅读/写有数据时整图为空）。 */
function mergeDual(
  a: PerfPoint[] | null | undefined,
  b: PerfPoint[] | null | undefined,
  ka: string,
  kb: string
): Record<string, string | number>[] {
  if (!a?.length && !b?.length) return [];
  const base = a?.length ? a : b!;
  const primaryKey = a?.length ? ka : kb;
  const secondaryKey = a?.length ? kb : ka;
  const other = a?.length ? b : a;
  return base.map((p, i) => ({
    t: p.t,
    [primaryKey]: p.v,
    [secondaryKey]: other?.[i]?.v ?? 0,
  }));
}

const cpuCfg = {
  v: { label: "CPU 使用率", color: "hsl(221 83% 53%)" },
} satisfies ChartConfig;

const memCfg = {
  v: { label: "内存使用率", color: "hsl(262 83% 58%)" },
} satisfies ChartConfig;

const diskCfg = {
  read: { label: "读", color: "hsl(199 89% 48%)" },
  write: { label: "写", color: "hsl(280 65% 52%)" },
} satisfies ChartConfig;

const netCfg = {
  rx: { label: "接收", color: "hsl(142 71% 42%)" },
  tx: { label: "发送", color: "hsl(24 95% 53%)" },
} satisfies ChartConfig;

function PerfPctThresholdLegend() {
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-600 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-5 rounded-sm bg-emerald-400/50 dark:bg-emerald-500/40" />
        正常 &lt;{VC_CPU_MEM_WARN_PCT}%
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-5 rounded-sm bg-amber-400/60 dark:bg-amber-500/45" />
        偏高 {VC_CPU_MEM_WARN_PCT}%–{VC_CPU_MEM_CRIT_PCT}%
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-5 rounded-sm bg-red-400/55 dark:bg-red-500/40" />
        很高 ≥{VC_CPU_MEM_CRIT_PCT}%
      </span>
      <span className="text-slate-400 dark:text-slate-500">（背景分区 + 曲线颜色按窗口峰值）</span>
    </div>
  );
}

function DiskThroughputLegend({
  p75,
  p95,
  peak,
}: {
  p75: number;
  p95: number;
  peak: number;
}) {
  if (peak <= 0) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-600 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-5 rounded-sm bg-emerald-400/45 dark:bg-emerald-500/35" />
        相对低 ≤P75 ({p75.toFixed(0)})
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-5 rounded-sm bg-amber-400/55 dark:bg-amber-500/40" />
        P75–P95
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-5 rounded-sm bg-red-400/50 dark:bg-red-500/35" />
        &gt;P95 ({p95.toFixed(0)}) 峰值 {peak.toFixed(0)}
      </span>
      <span className="text-slate-400 dark:text-slate-500">单位同 Y 轴（常为 KB/s）</span>
    </div>
  );
}

function diskLineColorFromPeaks(peak: number, p75: number, p95: number): string {
  if (p95 <= 0 && p75 <= 0) return "hsl(199 89% 42%)";
  if (peak >= p95 && p95 > 0) return "hsl(0 72% 48%)";
  if (peak >= p75 && p75 > 0) return "hsl(32 90% 44%)";
  return "hsl(199 89% 42%)";
}

function PerfCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/90 to-white p-5 shadow-sm",
        className
      )}
    >
      <div className="mb-3">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

type TcpEstablishedResponse = {
  guestIp?: string;
  rows?: { local: string; peer: string; peerIp: string }[];
  connectionCount?: number;
  /** 来宾内 ESTABLISHED 总数；明细表仅返回至多 10 条（按对端 IP 连接数优先） */
  truncated?: boolean;
  uniquePeerIpCount?: number;
  uniquePeerIps?: string[];
  scannedAt?: string;
  stderr?: string;
};

export const VCenterPerfMonitor: React.FC<{
  moref: string;
}> = ({ moref }) => {
  const [days, setDays] = React.useState(7);

  const metricsPath = `/api/vcenter/vms/${encodeURIComponent(moref)}/metrics?days=${days}`;

  const tcpQ = useQuery({
    queryKey: ["vcenter-vm-tcp-established", moref],
    queryFn: ({ signal }) =>
      apiGetJson<TcpEstablishedResponse>(
        `/api/vcenter/vms/${encodeURIComponent(moref)}/tcp-established`,
        { signal }
      ),
    enabled: moref.length > 0,
    retry: false,
    staleTime: 20_000,
  });

  const q = useQuery({
    queryKey: ["vcenter-perf", "vm", moref, days],
    queryFn: ({ signal }) => apiGetJson<VCenterVMPerfResponse>(metricsPath, { signal }),
    enabled: moref.length > 0,
  });

  const u = q.data?.units ?? {};
  const s = q.data?.series;

  const cpuPts = s?.cpu ?? [];
  const memPts = s?.memory ?? [];
  const diskData = mergeDual(s?.diskRead, s?.diskWrite, "read", "write");
  const netData = mergeDual(s?.netRx, s?.netTx, "rx", "tx");

  const cpuMax = React.useMemo(() => maxSeries(cpuPts), [cpuPts]);
  const memMax = React.useMemo(() => maxSeries(memPts), [memPts]);
  const diskPeaks = React.useMemo(() => diskNetPeakSeries(diskData), [diskData]);
  const diskSorted = React.useMemo(
    () => [...diskPeaks].filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b),
    [diskPeaks]
  );
  const diskP75 = diskSorted.length ? percentileSorted(diskSorted, 0.75) : 0;
  const diskP95 = diskSorted.length ? percentileSorted(diskSorted, 0.95) : 0;
  const diskPeak = diskSorted.length ? diskSorted[diskSorted.length - 1]! : 0;
  const diskYMax = React.useMemo(
    () => Math.max(diskPeak * 1.12, diskP95 * 1.08, 1),
    [diskPeak, diskP95]
  );

  const allChartsEmpty =
    !!q.data &&
    cpuPts.length === 0 &&
    memPts.length === 0 &&
    diskData.length === 0 &&
    netData.length === 0;

  const pctTick = (unit: string | undefined) => (v: number) =>
    `${v.toFixed(0)}${unitSuffix(unit)}`;
  const rateTick = (unit: string | undefined) => (v: number) =>
    `${v.toFixed(0)}${unitSuffix(unit)}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-800">历史性能（vCenter 统计）</p>
          <p className="mt-0.5 text-xs text-slate-500">
            仅展示 CPU、内存、磁盘 IO、网络 IO；时间范围由 vCenter 统计档位决定。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">最近</span>
          <Select
            value={String(days)}
            onValueChange={(v) => setDays(Number(v))}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="天数" />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d} 天
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {q.data?.note ? (
        <p
          className={
            allChartsEmpty
              ? "rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950"
              : "rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-2.5 text-xs leading-relaxed text-slate-600"
          }
        >
          {q.data.note}
        </p>
      ) : null}

      {q.data?.missing && q.data.missing.length > 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          部分计数器不可用：{q.data.missing.map(counterNameZh).join("、")}
        </p>
      ) : null}

      {q.data && (
        <div className="space-y-1">
          <p className="font-mono text-[11px] text-slate-500">
            {q.data.rangeFrom} — {q.data.rangeTo} · 采样间隔 {q.data.intervalSec} 秒
          </p>
        </div>
      )}

      {q.isLoading && (
        <p className="text-sm text-slate-500">加载性能数据…</p>
      )}
      {q.error && (
        <p className="text-sm text-red-600">
          {(q.error as Error).message}
        </p>
      )}

      <PerfCard
        title="TCP 已建立连接（来宾内采集）"
        subtitle="统计来宾内 ESTABLISHED 总数；明细与对端 IP 列表至多 10 条（按对端 IP 连接数优先）。由 Dashboard 经 SSH 执行 ss/netstat，需已保存该虚拟机 SSH 凭据且来宾可登录。"
        className="lg:col-span-2"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={tcpQ.isFetching}
            onClick={() => void tcpQ.refetch()}
          >
            {tcpQ.isFetching ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                扫描中…
              </>
            ) : (
              "重新扫描"
            )}
          </Button>
          {tcpQ.data?.scannedAt ? (
            <span className="text-[11px] text-slate-500">最近扫描 {tcpQ.data.scannedAt}</span>
          ) : null}
        </div>
        {tcpQ.isLoading && !tcpQ.data ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在通过 SSH 采集…
          </p>
        ) : null}
        {tcpQ.isError ? (
          <p className="text-sm text-amber-900">
            {(tcpQ.error as Error).message}
            <span className="mt-1 block text-xs text-slate-600">
              若提示未配置 SSH，请到本虚拟机「概况与网络」保存凭据后再试。
            </span>
          </p>
        ) : null}
        {tcpQ.data && !tcpQ.isError ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 text-sm text-slate-800">
              <span>
                Guest IP：<span className="font-mono tabular-nums">{tcpQ.data.guestIp ?? "—"}</span>
              </span>
              <span className="text-slate-300">|</span>
              <span>
                <strong className="tabular-nums">{tcpQ.data.connectionCount ?? 0}</strong> 条已建立连接
              </span>
              <span className="text-slate-300">|</span>
              <span>
                <strong className="tabular-nums">{tcpQ.data.uniquePeerIpCount ?? 0}</strong> 个不同对端 IP
                {tcpQ.data.truncated ? "（明细 Top10 内）" : ""}
              </span>
            </div>
            {tcpQ.data.truncated ? (
              <p className="text-xs text-slate-600">
                明细表仅展示 Top 10 条连接（按对端 IP 出现次数排序）；当前共{" "}
                <strong className="tabular-nums">{tcpQ.data.connectionCount ?? 0}</strong> 条已建立。
              </p>
            ) : null}
            {tcpQ.data.stderr ? (
              <p className="text-xs text-amber-800">{tcpQ.data.stderr}</p>
            ) : null}
            {(tcpQ.data.uniquePeerIps ?? []).length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600">
                  对端 IP（去重{tcpQ.data.truncated ? "，仅含明细 Top10" : ""}）
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(tcpQ.data.uniquePeerIps ?? []).map((ip) => (
                    <span
                      key={ip}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-800"
                    >
                      {ip}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">当前无已建立 TCP 连接（或对端均为本机回环）。</p>
            )}
            {(tcpQ.data.rows ?? []).length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">本端地址</TableHead>
                      <TableHead className="text-xs">对端地址</TableHead>
                      <TableHead className="text-xs">对端 IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(tcpQ.data.rows ?? []).map((r, idx) => (
                      <TableRow key={`${r.local}-${r.peer}-${idx}`}>
                        <TableCell className="max-w-[200px] break-all font-mono text-xs">{r.local}</TableCell>
                        <TableCell className="max-w-[220px] break-all font-mono text-xs">{r.peer}</TableCell>
                        <TableCell className="font-mono text-xs">{r.peerIp}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        ) : null}
      </PerfCard>

      {q.data && !q.isLoading && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <PerfPctThresholdLegend />
          </div>
          <PerfCard title="CPU 使用率" subtitle={`时间序列平均（${unitSuffix(u.cpu) || "%"}）· 窗口峰值 ${cpuMax.toFixed(1)}%`}>
            {cpuPts.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                无数据
              </p>
            ) : (
              <ChartContainer config={cpuCfg} className="h-[220px] w-full">
                <LineChart
                  data={cpuPts}
                  margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="4 6"
                    vertical={false}
                    className="stroke-slate-200/80 dark:stroke-slate-600/80"
                  />
                  <ReferenceArea
                    y1={0}
                    y2={VC_CPU_MEM_WARN_PCT}
                    fill="rgb(34 197 94 / 0.09)"
                    strokeOpacity={0}
                  />
                  <ReferenceArea
                    y1={VC_CPU_MEM_WARN_PCT}
                    y2={VC_CPU_MEM_CRIT_PCT}
                    fill="rgb(245 158 11 / 0.11)"
                    strokeOpacity={0}
                  />
                  <ReferenceArea
                    y1={VC_CPU_MEM_CRIT_PCT}
                    y2={100}
                    fill="rgb(239 68 68 / 0.11)"
                    strokeOpacity={0}
                  />
                  <XAxis
                    dataKey="t"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={28}
                    tick={{ fontSize: 10, fill: "hsl(215 16% 42%)" }}
                    tickFormatter={fmtAxisTime}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tick={{ fontSize: 10 }}
                    tickFormatter={pctTick(u.cpu)}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke={lineColorByMaxPct(cpuMax)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </PerfCard>

          <PerfCard title="内存使用率" subtitle={`时间序列平均（${unitSuffix(u.memory) || "%"}）· 窗口峰值 ${memMax.toFixed(1)}%`}>
            {memPts.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                无数据
              </p>
            ) : (
              <ChartContainer config={memCfg} className="h-[220px] w-full">
                <LineChart
                  data={memPts}
                  margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="4 6"
                    vertical={false}
                    className="stroke-slate-200/80 dark:stroke-slate-600/80"
                  />
                  <ReferenceArea
                    y1={0}
                    y2={VC_CPU_MEM_WARN_PCT}
                    fill="rgb(34 197 94 / 0.09)"
                    strokeOpacity={0}
                  />
                  <ReferenceArea
                    y1={VC_CPU_MEM_WARN_PCT}
                    y2={VC_CPU_MEM_CRIT_PCT}
                    fill="rgb(245 158 11 / 0.11)"
                    strokeOpacity={0}
                  />
                  <ReferenceArea
                    y1={VC_CPU_MEM_CRIT_PCT}
                    y2={100}
                    fill="rgb(239 68 68 / 0.11)"
                    strokeOpacity={0}
                  />
                  <XAxis
                    dataKey="t"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={28}
                    tick={{ fontSize: 10 }}
                    tickFormatter={fmtAxisTime}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={pctTick(u.memory)}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="v"
                    stroke={lineColorByMaxPct(memMax)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </PerfCard>

          <PerfCard
            title="磁盘 IO"
            subtitle="读 / 写（vSphere 平均速率）；背景按本窗口「读 + 写」合计分位着色"
            className="lg:col-span-2"
          >
            {diskData.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                无数据
              </p>
            ) : (
              <>
                <DiskThroughputLegend p75={diskP75} p95={diskP95} peak={diskPeak} />
                <ChartContainer config={diskCfg} className="h-[240px] w-full">
                  <LineChart
                    data={diskData}
                    margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="4 6"
                      vertical={false}
                      className="stroke-slate-200/80 dark:stroke-slate-600/80"
                    />
                    {diskSorted.length > 0 && diskPeak > 0 ? (
                      <>
                        <ReferenceArea
                          y1={0}
                          y2={Math.min(diskP75, diskYMax)}
                          fill="rgb(34 197 94 / 0.07)"
                          strokeOpacity={0}
                        />
                        <ReferenceArea
                          y1={Math.min(diskP75, diskYMax)}
                          y2={Math.min(diskP95, diskYMax)}
                          fill="rgb(245 158 11 / 0.09)"
                          strokeOpacity={0}
                        />
                        <ReferenceArea
                          y1={Math.min(diskP95, diskYMax)}
                          y2={diskYMax}
                          fill="rgb(239 68 68 / 0.09)"
                          strokeOpacity={0}
                        />
                      </>
                    ) : null}
                    <XAxis
                      dataKey="t"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={28}
                      tick={{ fontSize: 10 }}
                      tickFormatter={fmtAxisTime}
                    />
                    <YAxis
                      domain={[0, diskYMax]}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      tickFormatter={rateTick(u.diskRead)}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(value) =>
                        value === "read"
                          ? "读"
                          : value === "write"
                            ? "写"
                            : value
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="read"
                      stroke={
                        diskPeak >= diskP95 && diskP95 > 0
                          ? diskLineColorFromPeaks(diskPeak, diskP75, diskP95)
                          : "var(--color-read)"
                      }
                      strokeWidth={diskPeak >= diskP95 && diskP95 > 0 ? 2.4 : 2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="write"
                      stroke={
                        diskPeak >= diskP95 && diskP95 > 0
                          ? diskLineColorFromPeaks(diskPeak, diskP75, diskP95)
                          : "var(--color-write)"
                      }
                      strokeWidth={diskPeak >= diskP95 && diskP95 > 0 ? 2.4 : 2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ChartContainer>
              </>
            )}
          </PerfCard>

          <PerfCard
            title="网络 IO"
            subtitle="接收 / 发送（vSphere 平均速率）"
            className="lg:col-span-2"
          >
            {netData.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                无数据
              </p>
            ) : (
              <ChartContainer config={netCfg} className="h-[240px] w-full">
                <LineChart
                  data={netData}
                  margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="4 6"
                    vertical={false}
                    className="stroke-slate-200/80"
                  />
                  <XAxis
                    dataKey="t"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={28}
                    tick={{ fontSize: 10 }}
                    tickFormatter={fmtAxisTime}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={rateTick(u.netRx)}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value) =>
                      value === "rx"
                        ? "接收"
                        : value === "tx"
                          ? "发送"
                          : value
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="rx"
                    stroke="var(--color-rx)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="tx"
                    stroke="var(--color-tx)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </PerfCard>
        </div>
      )}
    </div>
  );
};
