import React, { useMemo, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import {
  Area,
  AreaChart,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  matrixToChartRows,
  promInstantScalar,
  promInstantVector,
  promQueryRangeVcenter,
  promQueryVcenter,
} from "./vcenterPrometheusHelpers";
import { cn } from "@/lib/utils";

/** Telegraf 插件历史拼写（与 exporter HELP 一致） */
const M_DS_UNCOMMITTED = "vmware_datastore_uncommited_size";
const M_DS_PROVISIONED = "vmware_datastore_provisoned_size";

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

function bytesToGiB(b: number): string {
  if (!Number.isFinite(b) || b <= 0) return "—";
  return (b / 1024 ** 3).toFixed(1);
}

/** vmware_host_mem_active_average：指标为 KB（与 vSphere 性能计数器一致） */
function fmtHostMemKb(kb: number): string {
  if (!Number.isFinite(kb)) return "—";
  const mib = kb / 1024;
  const gib = kb / 1024 / 1024;
  if (gib >= 1) return `${gib.toFixed(2)} GiB`;
  if (mib >= 1) return `${mib.toFixed(1)} MiB`;
  return `${Math.round(kb)} KiB`;
}

function fmtHostMemAxisKb(kb: number): string {
  if (!Number.isFinite(kb) || kb <= 0) return "0";
  const gib = kb / 1024 / 1024;
  if (gib >= 1) return `${gib >= 10 ? Math.round(gib) : gib.toFixed(1)} GiB`;
  const mib = kb / 1024;
  return `${mib >= 10 ? Math.round(mib) : mib.toFixed(1)} MiB`;
}

function fmtMhz(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("zh-CN")} MHz`;
}

function fmtKbs(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const x = Math.abs(n) >= 100 ? Math.round(n).toLocaleString("zh-CN") : n.toFixed(1);
  return `${x} KB/s`;
}

function fmtHostPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

function hostTooltipPair(value: unknown, name: unknown, formatted: string) {
  return (
    <div className="flex w-full min-w-[9rem] items-center justify-between gap-3 font-mono text-xs tabular-nums">
      <span className="text-muted-foreground">{String(name)}</span>
      <span className="font-medium text-foreground">{formatted}</span>
    </div>
  );
}

function sensorStateLabel(v: number): { text: string; cls: string } {
  if (v <= 0) return { text: "红", cls: "text-red-700 dark:text-red-400" };
  if (v === 1) return { text: "黄", cls: "text-amber-800 dark:text-amber-300" };
  if (v === 2) return { text: "绿", cls: "text-emerald-800 dark:text-emerald-400" };
  return { text: "未知", cls: "text-slate-600" };
}

/** 相对最高转速的百分比：低→冷色，高→暖色高亮 */
function fanPctVisual(pct: number): { bar: string; glow: string; text: string } {
  if (pct < 22)
    return {
      bar: "bg-slate-400 dark:bg-slate-500",
      glow: "",
      text: "text-slate-600 dark:text-slate-300",
    };
  if (pct < 45)
    return {
      bar: "bg-sky-500",
      glow: "shadow-[0_0_10px_rgba(14,165,233,0.45)]",
      text: "text-sky-700 dark:text-sky-300",
    };
  if (pct < 68)
    return {
      bar: "bg-emerald-500",
      glow: "shadow-[0_0_10px_rgba(16,185,129,0.4)]",
      text: "text-emerald-800 dark:text-emerald-300",
    };
  if (pct < 88)
    return {
      bar: "bg-amber-500",
      glow: "shadow-[0_0_12px_rgba(245,158,11,0.5)]",
      text: "text-amber-900 dark:text-amber-200",
    };
  return {
    bar: "bg-rose-600",
    glow: "shadow-[0_0_14px_rgba(225,29,72,0.55)]",
    text: "text-rose-800 dark:text-rose-200",
  };
}

function tempHeatColors(c: number): { bar: string; glow: string; text: string } {
  if (c < 40)
    return {
      bar: "bg-cyan-500",
      glow: "shadow-[0_0_10px_rgba(6,182,212,0.4)]",
      text: "text-cyan-800 dark:text-cyan-200",
    };
  if (c < 52)
    return {
      bar: "bg-emerald-500",
      glow: "shadow-[0_0_10px_rgba(16,185,129,0.42)]",
      text: "text-emerald-800 dark:text-emerald-200",
    };
  if (c < 65)
    return {
      bar: "bg-amber-500",
      glow: "shadow-[0_0_12px_rgba(245,158,11,0.5)]",
      text: "text-amber-950 dark:text-amber-200",
    };
  return {
    bar: "bg-red-600",
    glow: "shadow-[0_0_14px_rgba(220,38,38,0.55)]",
    text: "text-red-900 dark:text-red-200",
  };
}

function diskLatencyColors(ms: number): { bar: string; glow: string; text: string } {
  if (ms <= 8)
    return {
      bar: "bg-emerald-500",
      glow: "shadow-[0_0_10px_rgba(16,185,129,0.42)]",
      text: "text-emerald-800 dark:text-emerald-200",
    };
  if (ms <= 20)
    return {
      bar: "bg-teal-500",
      glow: "shadow-[0_0_10px_rgba(20,184,166,0.38)]",
      text: "text-teal-900 dark:text-teal-200",
    };
  if (ms <= 45)
    return {
      bar: "bg-amber-500",
      glow: "shadow-[0_0_12px_rgba(245,158,11,0.5)]",
      text: "text-amber-950 dark:text-amber-200",
    };
  return {
    bar: "bg-red-600",
    glow: "shadow-[0_0_14px_rgba(220,38,38,0.55)]",
    text: "text-red-900 dark:text-red-200",
  };
}

function compactSensorLabel(name: string): string {
  return name.replace(/^System Board 1\s+/i, "").replace(/^Processor\s+/i, "P");
}

const chartHostPct: ChartConfig = {
  cpu: { label: "CPU %", color: "hsl(199 89% 48%)" },
  mem: { label: "内存 %", color: "hsl(280 65% 52%)" },
};
const chartVmMem: ChartConfig = { v: { label: "内存", color: "hsl(262 70% 52%)" } };
const chartVmCpu: ChartConfig = { v: { label: "MHz/s", color: "hsl(221 83% 53%)" } };
const chartDs: ChartConfig = { v: { label: "使用率%", color: "hsl(142 71% 40%)" } };
const chartHostDisk: ChartConfig = {
  read: { label: "读 KB/s", color: "hsl(199 72% 46%)" },
  write: { label: "写 KB/s", color: "hsl(280 65% 52%)" },
};
const chartHostNet: ChartConfig = {
  rx: { label: "Rx KB/s", color: "hsl(142 71% 42%)" },
  tx: { label: "Tx KB/s", color: "hsl(32 90% 48%)" },
};
const chartHostMhz: ChartConfig = { mhz: { label: "MHz", color: "hsl(221 83% 53%)" } };
const chartVmReady: ChartConfig = { v: { label: "ready/s", color: "hsl(350 70% 48%)" } };
const chartVmNet: ChartConfig = { v: { label: "KB/s", color: "hsl(199 72% 46%)" } };

type ExtendedDsRow = {
  ds: string;
  usedPct: number;
  capGiB: number;
  freeGiB: number;
  provGiB: number;
  uncommGiB: number;
  hosts: number;
  vms: number;
  accessible: string;
  dsType: string;
  maintMode: string;
};

function vecByDs(vec: ReturnType<typeof promInstantVector>): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of vec) {
    const ds = r.metric["ds_name"]?.trim();
    if (!ds) continue;
    m.set(ds, r.value);
  }
  return m;
}

function vecDsPickLabelWhereOne(
  vec: ReturnType<typeof promInstantVector>,
  labelKey: "mode" | "ds_type"
): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of vec) {
    if ((r.value ?? 0) < 1) continue;
    const ds = r.metric["ds_name"]?.trim();
    const lv = r.metric[labelKey]?.trim();
    if (ds && lv) m.set(ds, lv);
  }
  return m;
}

async function buildDatastoreExtendedRows(
  hostLabel: string,
  signal: AbortSignal
): Promise<ExtendedDsRow[]> {
  const dcRes = await promQueryVcenter(`max by (dc_name)(vmware_host_cpu_usage{${hostLabel}})`, { signal });
  const dcRows = promInstantVector(dcRes);
  const dcName = dcRows[0]?.metric?.dc_name?.trim() ?? "";

  const trySuffix = async (suffix: string) => {
    const capD = await promQueryVcenter(`vmware_datastore_capacity_size${suffix}`, { signal });
    const freeD = await promQueryVcenter(`vmware_datastore_freespace_size${suffix}`, { signal });
    const capVec = promInstantVector(capD);
    const freeVec = promInstantVector(freeD);
    return { capVec, freeVec };
  };

  let { capVec, freeVec } = await trySuffix(`{${hostLabel}}`);
  if (capVec.length === 0 && dcName) {
    const lit = JSON.stringify(dcName);
    ({ capVec, freeVec } = await trySuffix(`{dc_name=${lit}}`));
  }

  const suffix =
    capVec.some((r) => r.metric["host_name"]) || freeVec.some((r) => r.metric["host_name"])
      ? `{${hostLabel}}`
      : dcName
        ? `{dc_name=${JSON.stringify(dcName)}}`
        : `{${hostLabel}}`;

  const [
    provD,
    uncommD,
    hostsD,
    vmsD,
    accD,
    typeD,
    maintD,
  ] = await Promise.all([
    promQueryVcenter(`${M_DS_PROVISIONED}${suffix}`, { signal }),
    promQueryVcenter(`${M_DS_UNCOMMITTED}${suffix}`, { signal }),
    promQueryVcenter(`vmware_datastore_hosts${suffix}`, { signal }),
    promQueryVcenter(`vmware_datastore_vms${suffix}`, { signal }),
    promQueryVcenter(`vmware_datastore_accessible${suffix}`, { signal }),
    promQueryVcenter(`vmware_datastore_type${suffix}`, { signal }),
    promQueryVcenter(`vmware_datastore_maintenance_mode${suffix}`, { signal }),
  ]);

  const provBy = vecByDs(promInstantVector(provD));
  const uncommBy = vecByDs(promInstantVector(uncommD));
  const hostsBy = vecByDs(promInstantVector(hostsD));
  const vmsBy = vecByDs(promInstantVector(vmsD));
  const accBy = new Map<string, string>();
  for (const r of promInstantVector(accD)) {
    const ds = r.metric["ds_name"]?.trim();
    if (ds) accBy.set(ds, r.value >= 1 ? "是" : "否");
  }
  const typeBy = vecDsPickLabelWhereOne(promInstantVector(typeD), "ds_type");
  const maintBy = vecDsPickLabelWhereOne(promInstantVector(maintD), "mode");

  const capBy = new Map<string, number>();
  const freeBy = new Map<string, number>();
  for (const r of capVec) {
    const ds = r.metric["ds_name"]?.trim();
    if (ds) capBy.set(ds, r.value);
  }
  for (const r of freeVec) {
    const ds = r.metric["ds_name"]?.trim();
    if (ds) freeBy.set(ds, r.value);
  }

  const keys = new Set([...capBy.keys(), ...freeBy.keys()]);
  const out: ExtendedDsRow[] = [];
  for (const ds of keys) {
    const cap = capBy.get(ds) ?? 0;
    const free = freeBy.get(ds) ?? 0;
    if (cap <= 0) continue;
    out.push({
      ds,
      usedPct: ((cap - free) / cap) * 100,
      capGiB: cap / 1024 ** 3,
      freeGiB: free / 1024 ** 3,
      provGiB: (provBy.get(ds) ?? 0) / 1024 ** 3,
      uncommGiB: (uncommBy.get(ds) ?? 0) / 1024 ** 3,
      hosts: hostsBy.get(ds) ?? 0,
      vms: vmsBy.get(ds) ?? 0,
      accessible: accBy.get(ds) ?? "—",
      dsType: typeBy.get(ds) ?? "—",
      maintMode: maintBy.get(ds) ?? "—",
    });
  }
  return out.sort((a, b) => b.usedPct - a.usedPct);
}

/**
 * 单台 ESXi：vmware_vcenter 指标尽量全覆盖（数据存储扩展、宿主机状态/传感器、VM 快照与性能等）。
 */
export const VCenterHostPrometheusDetail: React.FC<{
  moref: string;
  hostName: string;
  managementVmkIp?: string;
}> = ({ moref, hostName, managementVmkIp }) => {
  const cfgQ = useAppConfig();
  const [range, setRange] = useState<"1h" | "6h" | "24h" | "3d">("6h");

  const hostLabel = hostName ? `host_name=${JSON.stringify(hostName)}` : "";

  const windowSec =
    range === "1h" ? 3600 : range === "6h" ? 6 * 3600 : range === "24h" ? 86400 : 3 * 86400;
  const { endSec, startSec, step } = useMemo(() => {
    const end = Math.floor(Date.now() / 1000);
    const start = end - windowSec;
    const step =
      range === "1h" ? "30" : range === "6h" ? "60" : range === "24h" ? "120" : "300";
    return { endSec: end, startSec: start, step };
  }, [range, windowSec]);

  const promEnabled =
    cfgQ.data?.prometheusVcenterConfigured === true || cfgQ.data?.prometheusConfigured === true;

  const statsQ = useQuery({
    queryKey: ["vcenter-host-prom-stats", hostLabel],
    queryFn: async ({ signal }) => {
      if (!hostLabel) throw new Error("缺少 host_name");
      const qBoot = `vmware_host_boot_timestamp_seconds{${hostLabel}}`;
      const qCpu = `(vmware_host_cpu_usage{${hostLabel}}) * 100 / (vmware_host_cpu_max{${hostLabel}})`;
      const qMem = `(vmware_host_memory_usage{${hostLabel}}) * 100 / (vmware_host_memory_max{${hostLabel}})`;
      const qVm = `count(vmware_vm_cpu_usagemhz_average{${hostLabel}})`;
      const [bootTs, cpu, mem, vmN] = await Promise.all([
        promQueryVcenter(qBoot, { signal }).then(promInstantScalar),
        promQueryVcenter(qCpu, { signal }).then(promInstantScalar),
        promQueryVcenter(qMem, { signal }).then(promInstantScalar),
        promQueryVcenter(qVm, { signal }).then(promInstantScalar),
      ]);
      const nowSec = Date.now() / 1000;
      const uptime = bootTs != null && Number.isFinite(bootTs) ? nowSec - bootTs : null;
      return { uptime, cpu, mem, vmN };
    },
    enabled: Boolean(hostLabel) && promEnabled,
    refetchInterval: 60_000,
  });

  const hostVitalsQ = useQuery({
    queryKey: ["vcenter-host-prom-vitals", hostLabel],
    queryFn: async ({ signal }) => {
      if (!hostLabel) return null;
      const [
        numCpu,
        maint,
        prod,
        hw,
        pwr,
        conn,
        standby,
      ] = await Promise.all([
        promQueryVcenter(`vmware_host_num_cpu{${hostLabel}}`, { signal }).then(promInstantScalar),
        promQueryVcenter(`vmware_host_maintenance_mode{${hostLabel}}`, { signal }).then(promInstantScalar),
        promQueryVcenter(`vmware_host_product_info{${hostLabel}}`, { signal }),
        promQueryVcenter(`vmware_host_hardware_info{${hostLabel}}`, { signal }),
        promQueryVcenter(`vmware_host_power_state{${hostLabel}}`, { signal }),
        promQueryVcenter(`vmware_host_connection_state{${hostLabel}}`, { signal }),
        promQueryVcenter(`vmware_host_standby_mode{${hostLabel}}`, { signal }),
      ]);
      const prodV = promInstantVector(prod)[0];
      const hwV = promInstantVector(hw)[0];
      let connection = "—";
      for (const r of promInstantVector(conn)) {
        if (r.value >= 1 && r.metric["state"]) {
          connection = r.metric["state"] ?? "—";
          break;
        }
      }
      let standbyMode = "—";
      for (const r of promInstantVector(standby)) {
        if (r.metric["standby_mode_state"]) {
          standbyMode = r.metric["standby_mode_state"] ?? "—";
          break;
        }
      }
      return {
        numCpu,
        maintMode: maint === 1 ? "是" : maint === 0 ? "否" : "—",
        version: prodV?.metric["version"]?.trim() || "—",
        build: prodV?.metric["build"]?.trim() || "—",
        hwModel: hwV?.metric["hardware_model"]?.trim() || "—",
        hwCpu: hwV?.metric["hardware_cpu_model"]?.trim() || "—",
        powerOn: promInstantVector(pwr)[0]?.value === 1 ? "开机" : "关机/其它",
        connection,
        standbyMode,
      };
    },
    enabled: Boolean(hostLabel) && promEnabled,
    staleTime: 60_000,
  });

  const dsExtendedQ = useQuery({
    queryKey: ["vcenter-host-prom-ds-ext", hostLabel],
    queryFn: ({ signal }) => buildDatastoreExtendedRows(hostLabel, signal),
    enabled: Boolean(hostLabel) && promEnabled,
    staleTime: 60_000,
  });

  const sensorsStateQ = useQuery({
    queryKey: ["vcenter-host-prom-sensor-state", hostLabel],
    queryFn: async ({ signal }) => {
      if (!hostLabel) return [];
      const d = await promQueryVcenter(`vmware_host_sensor_state{${hostLabel}}`, { signal });
      const rows = promInstantVector(d).map((r) => ({
        name: r.metric["name"] ?? "—",
        type: r.metric["type"] ?? "",
        value: r.value,
        ...sensorStateLabel(r.value),
      }));
      rows.sort((a, b) => a.value - b.value);
      return rows;
    },
    enabled: Boolean(hostLabel) && promEnabled,
    staleTime: 60_000,
  });

  const sensorsFanQ = useQuery({
    queryKey: ["vcenter-host-prom-sensor-fan", hostLabel],
    queryFn: async ({ signal }) => {
      if (!hostLabel) return [];
      const d = await promQueryVcenter(`vmware_host_sensor_fan{${hostLabel}}`, { signal });
      return promInstantVector(d)
        .map((r) => ({ name: r.metric["name"] ?? "—", rpm: r.value }))
        .sort((a, b) => b.rpm - a.rpm);
    },
    enabled: Boolean(hostLabel) && promEnabled,
    staleTime: 60_000,
  });

  const sensorsTempQ = useQuery({
    queryKey: ["vcenter-host-prom-sensor-temp", hostLabel],
    queryFn: async ({ signal }) => {
      if (!hostLabel) return [];
      const d = await promQueryVcenter(`vmware_host_sensor_temperature{${hostLabel}}`, { signal });
      return promInstantVector(d)
        .map((r) => ({ name: r.metric["name"] ?? "—", c: r.value }))
        .sort((a, b) => b.c - a.c);
    },
    enabled: Boolean(hostLabel) && promEnabled,
    staleTime: 60_000,
  });

  const sensorsPowerQ = useQuery({
    queryKey: ["vcenter-host-prom-sensor-power", hostLabel],
    queryFn: async ({ signal }) => {
      if (!hostLabel) return { watts: [] as { name: string; v: number }[], volt: [] as { name: string; v: number }[], amp: [] as { name: string; v: number }[] };
      const [w, v, a] = await Promise.all([
        promQueryVcenter(`vmware_host_sensor_power_watt{${hostLabel}}`, { signal }),
        promQueryVcenter(`vmware_host_sensor_power_voltage{${hostLabel}}`, { signal }),
        promQueryVcenter(`vmware_host_sensor_power_current{${hostLabel}}`, { signal }),
      ]);
      return {
        watts: promInstantVector(w).map((r) => ({ name: r.metric["name"] ?? "—", v: r.value })),
        volt: promInstantVector(v).map((r) => ({ name: r.metric["name"] ?? "—", v: r.value })),
        amp: promInstantVector(a).map((r) => ({ name: r.metric["name"] ?? "—", v: r.value })),
      };
    },
    enabled: Boolean(hostLabel) && promEnabled,
    staleTime: 60_000,
  });

  const vmSnapshotsQ = useQuery({
    queryKey: ["vcenter-host-prom-vm-snaps", hostLabel],
    queryFn: async ({ signal }) => {
      if (!hostLabel) return [];
      const d = await promQueryVcenter(`vmware_vm_snapshots{${hostLabel}}`, { signal });
      return promInstantVector(d)
        .map((r) => ({
          vm: r.metric["vm_name"] ?? "—",
          n: r.value,
        }))
        .sort((a, b) => b.n - a.n);
    },
    enabled: Boolean(hostLabel) && promEnabled,
    staleTime: 60_000,
  });

  const vmSnapTimeQ = useQuery({
    queryKey: ["vcenter-host-prom-vm-snap-ts", hostLabel],
    queryFn: async ({ signal }) => {
      if (!hostLabel) return [];
      const d = await promQueryVcenter(`vmware_vm_snapshot_timestamp_seconds{${hostLabel}}`, { signal });
      return promInstantVector(d)
        .map((r) => ({
          vm: r.metric["vm_name"] ?? "—",
          snap: r.metric["vm_snapshot_name"] ?? "—",
          ts: r.value,
        }))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 40);
    },
    enabled: Boolean(hostLabel) && promEnabled,
    staleTime: 60_000,
  });

  const vmDiskLatencyQ = useQuery({
    queryKey: ["vcenter-host-prom-vm-disk-lat", hostLabel],
    queryFn: async ({ signal }) => {
      if (!hostLabel) return [];
      const d = await promQueryVcenter(`vmware_vm_disk_maxTotalLatency_latest{${hostLabel}}`, { signal });
      return promInstantVector(d)
        .map((r) => ({ vm: r.metric["vm_name"] ?? "—", ms: r.value }))
        .filter((x) => x.ms > 0)
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 24);
    },
    enabled: Boolean(hostLabel) && promEnabled,
    staleTime: 60_000,
  });

  const hostPctSeriesQ = useQuery({
    queryKey: ["vcenter-host-prom-pct-range", hostLabel, startSec, endSec, step],
    queryFn: async ({ signal }) => {
      if (!hostLabel) return [];
      const qCpu = `(vmware_host_cpu_usage{${hostLabel}}) * 100 / (vmware_host_cpu_max{${hostLabel}})`;
      const qMem = `(vmware_host_memory_usage{${hostLabel}}) * 100 / (vmware_host_memory_max{${hostLabel}})`;
      const [dCpu, dMem] = await Promise.all([
        promQueryRangeVcenter(qCpu, startSec, endSec, step, { signal }),
        promQueryRangeVcenter(qMem, startSec, endSec, step, { signal }),
      ]);
      const cpuRows = matrixToChartRows(dCpu, "host_name");
      const memRows = matrixToChartRows(dMem, "host_name");
      const ts = new Map<number, Record<string, number | string>>();
      for (const row of cpuRows) {
        const t = row.t as string;
        const tsSec = Math.floor(new Date(t).getTime() / 1000);
        if (!ts.has(tsSec)) ts.set(tsSec, { t });
        for (const [k, v] of Object.entries(row)) {
          if (k === "t" || typeof v !== "number") continue;
          (ts.get(tsSec) as Record<string, number>)["cpu"] = v;
          break;
        }
      }
      for (const row of memRows) {
        const t = row.t as string;
        const tsSec = Math.floor(new Date(t).getTime() / 1000);
        if (!ts.has(tsSec)) ts.set(tsSec, { t });
        for (const [k, v] of Object.entries(row)) {
          if (k === "t" || typeof v !== "number") continue;
          (ts.get(tsSec) as Record<string, number>)["mem"] = v;
          break;
        }
      }
      return Array.from(ts.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, r]) => r);
    },
    enabled: Boolean(hostLabel) && promEnabled,
  });

  const hostMhzSeriesQ = useQuery({
    queryKey: ["vcenter-host-prom-mhz", hostLabel, startSec, endSec, step],
    queryFn: ({ signal }) =>
      promQueryRangeVcenter(
        `vmware_host_cpu_usagemhz_average{${hostLabel}}`,
        startSec,
        endSec,
        step,
        { signal }
      ),
    enabled: Boolean(hostLabel) && promEnabled,
  });

  const hostDiskSeriesQ = useQuery({
    queryKey: ["vcenter-host-prom-disk", hostLabel, startSec, endSec, step],
    queryFn: async ({ signal }) => {
      if (!hostLabel) return [];
      const [rd, wr] = await Promise.all([
        promQueryRangeVcenter(
          `vmware_host_disk_read_average{${hostLabel}}`,
          startSec,
          endSec,
          step,
          { signal }
        ),
        promQueryRangeVcenter(
          `vmware_host_disk_write_average{${hostLabel}}`,
          startSec,
          endSec,
          step,
          { signal }
        ),
      ]);
      const a = matrixToChartRows(rd, "host_name");
      const b = matrixToChartRows(wr, "host_name");
      const ts = new Map<number, Record<string, number | string>>();
      const mergeCol = (rows: Record<string, string | number>[], key: string) => {
        for (const row of rows) {
          const t = row.t as string;
          const tsSec = Math.floor(new Date(t).getTime() / 1000);
          if (!ts.has(tsSec)) ts.set(tsSec, { t });
          for (const [, v] of Object.entries(row)) {
            if (typeof v === "number") {
              (ts.get(tsSec) as Record<string, number>)[key] = v;
              break;
            }
          }
        }
      };
      mergeCol(a, "read");
      mergeCol(b, "write");
      return Array.from(ts.entries())
        .sort((x, y) => x[0] - y[0])
        .map(([, r]) => r);
    },
    enabled: Boolean(hostLabel) && promEnabled,
  });

  const hostNetSeriesQ = useQuery({
    queryKey: ["vcenter-host-prom-net", hostLabel, startSec, endSec, step],
    queryFn: async ({ signal }) => {
      if (!hostLabel) return [];
      const [rx, tx] = await Promise.all([
        promQueryRangeVcenter(
          `vmware_host_net_bytesRx_average{${hostLabel}}`,
          startSec,
          endSec,
          step,
          { signal }
        ),
        promQueryRangeVcenter(
          `vmware_host_net_bytesTx_average{${hostLabel}}`,
          startSec,
          endSec,
          step,
          { signal }
        ),
      ]);
      const a = matrixToChartRows(rx, "host_name");
      const b = matrixToChartRows(tx, "host_name");
      const ts = new Map<number, Record<string, number | string>>();
      const mergeCol = (rows: Record<string, string | number>[], key: string) => {
        for (const row of rows) {
          const t = row.t as string;
          const tsSec = Math.floor(new Date(t).getTime() / 1000);
          if (!ts.has(tsSec)) ts.set(tsSec, { t });
          for (const [, v] of Object.entries(row)) {
            if (typeof v === "number") {
              (ts.get(tsSec) as Record<string, number>)[key] = v;
              break;
            }
          }
        }
      };
      mergeCol(a, "rx");
      mergeCol(b, "tx");
      return Array.from(ts.entries())
        .sort((x, y) => x[0] - y[0])
        .map(([, r]) => r);
    },
    enabled: Boolean(hostLabel) && promEnabled,
  });

  const hostMemActiveSeriesQ = useQuery({
    queryKey: ["vcenter-host-prom-mem-active", hostLabel, startSec, endSec, step],
    queryFn: ({ signal }) =>
      promQueryRangeVcenter(
        `vmware_host_mem_active_average{${hostLabel}}`,
        startSec,
        endSec,
        step,
        { signal }
      ),
    enabled: Boolean(hostLabel) && promEnabled,
  });

  const vmMemSeriesQ = useQuery({
    queryKey: ["vcenter-host-prom-vm-mem", hostLabel, startSec, endSec, step],
    queryFn: ({ signal }) =>
      promQueryRangeVcenter(
        `rate(vmware_vm_mem_usage_average{${hostLabel}}[5m]) / 4`,
        startSec,
        endSec,
        step,
        { signal }
      ),
    enabled: Boolean(hostLabel) && promEnabled,
  });

  const vmCpuSeriesQ = useQuery({
    queryKey: ["vcenter-host-prom-vm-cpu", hostLabel, startSec, endSec, step],
    queryFn: ({ signal }) =>
      promQueryRangeVcenter(
        `rate(vmware_vm_cpu_usagemhz_average{${hostLabel}}[5m])`,
        startSec,
        endSec,
        step,
        { signal }
      ),
    enabled: Boolean(hostLabel) && promEnabled,
  });

  const vmCpuReadySeriesQ = useQuery({
    queryKey: ["vcenter-host-prom-vm-cpu-ready", hostLabel, startSec, endSec, step],
    queryFn: ({ signal }) =>
      promQueryRangeVcenter(
        `rate(vmware_vm_cpu_ready_summation{${hostLabel}}[5m])`,
        startSec,
        endSec,
        step,
        { signal }
      ),
    enabled: Boolean(hostLabel) && promEnabled,
  });

  const vmNetRxSeriesQ = useQuery({
    queryKey: ["vcenter-host-prom-vm-net-rx", hostLabel, startSec, endSec, step],
    queryFn: ({ signal }) =>
      promQueryRangeVcenter(
        `rate(vmware_vm_net_received_average{${hostLabel}}[5m])`,
        startSec,
        endSec,
        step,
        { signal }
      ),
    enabled: Boolean(hostLabel) && promEnabled,
  });

  const vmMemConsumedSeriesQ = useQuery({
    queryKey: ["vcenter-host-prom-vm-mem-cons", hostLabel, startSec, endSec, step],
    queryFn: ({ signal }) =>
      promQueryRangeVcenter(
        `rate(vmware_vm_mem_consumed_average{${hostLabel}}[5m])`,
        startSec,
        endSec,
        step,
        { signal }
      ),
    enabled: Boolean(hostLabel) && promEnabled,
  });

  const vmDiskRwSeriesQ = useQuery({
    queryKey: ["vcenter-host-prom-vm-disk-rw", hostLabel, startSec, endSec, step],
    queryFn: async ({ signal }) => {
      if (!hostLabel) return [];
      const [rd, wr] = await Promise.all([
        promQueryRangeVcenter(
          `rate(vmware_vm_disk_read_average{${hostLabel}}[5m])`,
          startSec,
          endSec,
          step,
          { signal }
        ),
        promQueryRangeVcenter(
          `rate(vmware_vm_disk_write_average{${hostLabel}}[5m])`,
          startSec,
          endSec,
          step,
          { signal }
        ),
      ]);
      const rowsR = matrixToChartRows(rd, "vm_name");
      const rowsW = matrixToChartRows(wr, "vm_name");
      const ts = new Map<number, Record<string, number | string>>();
      for (const row of rowsR) {
        const tsSec = Math.floor(new Date(String(row.t)).getTime() / 1000);
        if (!Number.isFinite(tsSec)) continue;
        if (!ts.has(tsSec)) ts.set(tsSec, { t: row.t });
        const tr = ts.get(tsSec)!;
        for (const [k, v] of Object.entries(row)) {
          if (k === "t" || typeof v !== "number") continue;
          tr[`${k}·读`] = v;
        }
      }
      for (const row of rowsW) {
        const tsSec = Math.floor(new Date(String(row.t)).getTime() / 1000);
        if (!Number.isFinite(tsSec)) continue;
        if (!ts.has(tsSec)) ts.set(tsSec, { t: row.t });
        const tr = ts.get(tsSec)!;
        for (const [k, v] of Object.entries(row)) {
          if (k === "t" || typeof v !== "number") continue;
          tr[`${k}·写`] = v;
        }
      }
      return Array.from(ts.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, r]) => r);
    },
    enabled: Boolean(hostLabel) && promEnabled,
  });

  const dsUsageSeriesQ = useQuery({
    queryKey: ["vcenter-host-prom-ds-usage", hostLabel, startSec, endSec, step],
    queryFn: async ({ signal }) => {
      if (!hostLabel) return { status: "success", data: { resultType: "matrix", result: [] } };
      const hostTry = `((vmware_datastore_capacity_size{${hostLabel}}) - (vmware_datastore_freespace_size{${hostLabel}})) * 100 / (vmware_datastore_capacity_size{${hostLabel}})`;
      const d = await promQueryRangeVcenter(hostTry, startSec, endSec, step, { signal });
      const dr = d as { status?: string; data?: { result?: unknown[] } };
      if (dr?.status === "success" && (dr.data?.result?.length ?? 0) > 0) return d;
      const dcRes = await promQueryVcenter(`max by (dc_name)(vmware_host_cpu_usage{${hostLabel}})`, { signal });
      const dc = promInstantVector(dcRes)[0]?.metric?.dc_name?.trim();
      if (!dc) return d;
      const lit = JSON.stringify(dc);
      return promQueryRangeVcenter(
        `((vmware_datastore_capacity_size{dc_name=${lit}}) - (vmware_datastore_freespace_size{dc_name=${lit}})) * 100 / (vmware_datastore_capacity_size{dc_name=${lit}})`,
        startSec,
        endSec,
        step,
        { signal }
      );
    },
    enabled: Boolean(hostLabel) && promEnabled,
  });

  const mhzRows = useMemo(() => matrixToChartRows(hostMhzSeriesQ.data, "host_name"), [hostMhzSeriesQ.data]);
  const memActiveRows = useMemo(() => matrixToChartRows(hostMemActiveSeriesQ.data, "host_name"), [hostMemActiveSeriesQ.data]);
  const memRows = useMemo(() => matrixToChartRows(vmMemSeriesQ.data, "vm_name"), [vmMemSeriesQ.data]);
  const cpuRows = useMemo(() => matrixToChartRows(vmCpuSeriesQ.data, "vm_name"), [vmCpuSeriesQ.data]);
  const dsRows = useMemo(() => matrixToChartRows(dsUsageSeriesQ.data, "ds_name"), [dsUsageSeriesQ.data]);
  const vmReadyRows = useMemo(() => matrixToChartRows(vmCpuReadySeriesQ.data, "vm_name"), [vmCpuReadySeriesQ.data]);
  const vmNetRxRows = useMemo(() => matrixToChartRows(vmNetRxSeriesQ.data, "vm_name"), [vmNetRxSeriesQ.data]);
  const vmMemConsRows = useMemo(() => matrixToChartRows(vmMemConsumedSeriesQ.data, "vm_name"), [vmMemConsumedSeriesQ.data]);
  const vmDiskRwRows = useMemo(() => vmDiskRwSeriesQ.data ?? [], [vmDiskRwSeriesQ.data]);

  const chartKeys = (rows: Record<string, string | number>[], max = 28) => {
    const k = new Set<string>();
    for (const row of rows) {
      for (const x of Object.keys(row)) {
        if (x !== "t") k.add(x);
      }
    }
    return Array.from(k).slice(0, max);
  };

  const memKeys = useMemo(() => chartKeys(memRows, 32), [memRows]);
  const cpuKeys = useMemo(() => chartKeys(cpuRows, 32), [cpuRows]);
  const dsKeys = useMemo(() => chartKeys(dsRows, 24), [dsRows]);
  const readyKeys = useMemo(() => chartKeys(vmReadyRows, 24), [vmReadyRows]);
  const netVmKeys = useMemo(() => chartKeys(vmNetRxRows, 24), [vmNetRxRows]);
  const memConsKeys = useMemo(() => chartKeys(vmMemConsRows, 20), [vmMemConsRows]);
  const diskRwKeys = useMemo(() => chartKeys(vmDiskRwRows, 40), [vmDiskRwRows]);
  const mhzKeys = useMemo(() => chartKeys(mhzRows, 4), [mhzRows]);
  const memActKeys = useMemo(() => chartKeys(memActiveRows, 4), [memActiveRows]);

  const badSensors = useMemo(
    () => (sensorsStateQ.data ?? []).filter((s) => s.value < 2).slice(0, 12),
    [sensorsStateQ.data]
  );

  const fanHeatRows = useMemo(() => {
    const list = sensorsFanQ.data ?? [];
    const maxRpm = Math.max(1, ...list.map((x) => x.rpm));
    return list.map((f) => {
      const relPct = (f.rpm / maxRpm) * 100;
      const vis = fanPctVisual(relPct);
      return { ...f, relPct, ...vis, shortLabel: compactSensorLabel(f.name) };
    });
  }, [sensorsFanQ.data]);

  const tempHeatRows = useMemo(() => {
    const list = sensorsTempQ.data ?? [];
    return list.map((t) => {
      const vis = tempHeatColors(t.c);
      const thermPct = Math.min(100, (t.c / 85) * 100);
      return { ...t, ...vis, thermPct, shortLabel: compactSensorLabel(t.name) };
    });
  }, [sensorsTempQ.data]);

  const diskLatencyHeatRows = useMemo(() => {
    const list = vmDiskLatencyQ.data ?? [];
    if (!list.length) return [];
    const peakMs = Math.max(30, ...list.map((x) => x.ms));
    return list.map((r) => {
      const vis = diskLatencyColors(r.ms);
      const stressPct = Math.min(100, (r.ms / peakMs) * 100);
      return { ...r, ...vis, stressPct };
    });
  }, [vmDiskLatencyQ.data]);

  const palette = [
    "hsl(262 70% 52%)",
    "hsl(199 72% 46%)",
    "hsl(142 71% 42%)",
    "hsl(32 90% 48%)",
    "hsl(350 70% 52%)",
    "hsl(280 65% 52%)",
  ];

  const refetchAll = () => {
    void statsQ.refetch();
    void hostVitalsQ.refetch();
    void dsExtendedQ.refetch();
    void sensorsStateQ.refetch();
    void sensorsFanQ.refetch();
    void sensorsTempQ.refetch();
    void sensorsPowerQ.refetch();
    void vmSnapshotsQ.refetch();
    void vmSnapTimeQ.refetch();
    void vmDiskLatencyQ.refetch();
    void hostPctSeriesQ.refetch();
    void hostMhzSeriesQ.refetch();
    void hostDiskSeriesQ.refetch();
    void hostNetSeriesQ.refetch();
    void hostMemActiveSeriesQ.refetch();
    void vmMemSeriesQ.refetch();
    void vmCpuSeriesQ.refetch();
    void vmCpuReadySeriesQ.refetch();
    void vmNetRxSeriesQ.refetch();
    void vmMemConsumedSeriesQ.refetch();
    void vmDiskRwSeriesQ.refetch();
    void dsUsageSeriesQ.refetch();
  };

  if (!cfgQ.data) return null;

  if (!promEnabled) {
    return (
      <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-5 py-4 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-medium">未配置 vCenter 用 Prometheus</p>
        <p className="mt-1 text-xs opacity-90">
          请在运行时配置填写 <code className="rounded bg-white/70 px-1 dark:bg-black/30">prometheusUrlVcenter</code>
          ，并确保抓取 <code className="rounded bg-white/70 px-1 dark:bg-black/30">job=&quot;vmware_vcenter&quot;</code>（Telegraf
          VMware / vSphere 输入）。
        </p>
        <Link
          to="/cluster/vcenter/settings"
          className="mt-2 inline-block text-sm font-semibold text-amber-950 underline underline-offset-2 dark:text-amber-50"
        >
          vCenter 设置
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white shadow-lg">
        <div className="border-b border-white/10 px-5 py-4 sm:px-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            VMware vCenter · Prometheus
          </p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{hostName}</h3>
              <p className="mt-1 font-mono text-[11px] text-slate-400">
                moRef HostSystem/{moref}
                {managementVmkIp?.trim() ? (
                  <span className="ml-2 text-slate-300">· 管理网 {managementVmkIp.trim()}</span>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-400">范围</Label>
                <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
                  <SelectTrigger className="h-9 w-[120px] border-white/15 bg-white/5 text-xs text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1h">1 小时</SelectItem>
                    <SelectItem value="6h">6 小时</SelectItem>
                    <SelectItem value="24h">24 小时</SelectItem>
                    <SelectItem value="3d">3 天</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 border-0 bg-white/10 text-white hover:bg-white/20"
                onClick={() => refetchAll()}
              >
                刷新
              </Button>
              <Link
                to="/cluster/vcenter/settings"
                className="pb-2 text-xs font-medium text-violet-300 hover:text-violet-200 hover:underline"
              >
                数据源
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
          <HeroStat
            title="运行时间"
            loading={statsQ.isLoading}
            value={statsQ.data?.uptime != null ? fmtUptime(statsQ.data.uptime) : "—"}
            hint="boot_timestamp"
          />
          <HeroStat
            title="Host CPU"
            loading={statsQ.isLoading}
            value={statsQ.data?.cpu != null ? fmtHostPct(statsQ.data.cpu, 1) : "—"}
          />
          <HeroStat
            title="Host 内存"
            loading={statsQ.isLoading}
            value={statsQ.data?.mem != null ? fmtHostPct(statsQ.data.mem, 1) : "—"}
          />
          <HeroStat
            title="虚拟机数"
            loading={statsQ.isLoading}
            value={
              statsQ.data?.vmN != null && Number.isFinite(statsQ.data.vmN)
                ? `${Math.round(statsQ.data.vmN)} 台`
                : "—"
            }
            hint="vmware_vm_cpu_usagemhz_average"
          />
        </div>
      </div>

      {statsQ.isError && (
        <p className="text-sm text-red-600 dark:text-red-400">{(statsQ.error as Error).message}</p>
      )}

      <Panel title="宿主机状态与硬件（即时）" loading={hostVitalsQ.isLoading}>
        {hostVitalsQ.data ? (
          <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <VitalKV label="物理机" value={hostVitalsQ.data.hwModel} />
            <VitalKV label="CPU 型号" value={hostVitalsQ.data.hwCpu} className="sm:col-span-2" />
            <VitalKV label="ESXi 版本" value={hostVitalsQ.data.version} />
            <VitalKV label="Build" value={hostVitalsQ.data.build} />
            <VitalKV
              label="CPU 颗数"
              value={
                hostVitalsQ.data.numCpu != null ? `${Math.round(hostVitalsQ.data.numCpu)} 颗` : "—"
              }
            />
            <VitalKV label="电源" value={hostVitalsQ.data.powerOn} />
            <VitalKV label="连接" value={hostVitalsQ.data.connection} />
            <VitalKV label="维护模式" value={hostVitalsQ.data.maintMode} />
            <VitalKV label="待机" value={hostVitalsQ.data.standbyMode} />
          </div>
        ) : (
          <p className="text-xs text-slate-500">—</p>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="宿主机 CPU / 内存占用率（%）" loading={hostPctSeriesQ.isLoading}>
          {hostPctSeriesQ.data && hostPctSeriesQ.data.length === 0 && !hostPctSeriesQ.isLoading ? (
            <p className="text-xs text-slate-500">暂无序列。</p>
          ) : (
            <ChartContainer config={chartHostPct} className="h-[240px] w-full">
              <AreaChart data={hostPctSeriesQ.data ?? []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillCpuHost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(199 89% 48%)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(199 89% 48%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fillMemHost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(280 65% 52%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(280 65% 52%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80 dark:stroke-slate-700/80" />
                <XAxis dataKey="t" tickFormatter={(v) => fmtAxisTime(String(v))} tick={{ fontSize: 10 }} />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 10 }}
                  width={44}
                  tickFormatter={(v) => `${v}%`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, p) => {
                        const row = (p as { payload?: { t?: string } })?.payload;
                        return row?.t ? fmtAxisTime(String(row.t)) : "";
                      }}
                      formatter={(value, name) =>
                        hostTooltipPair(value, name, fmtHostPct(Number(value), 1))
                      }
                    />
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="cpu" name="CPU %" stroke="var(--color-cpu)" fill="url(#fillCpuHost)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="mem" name="内存 %" stroke="var(--color-mem)" fill="url(#fillMemHost)" strokeWidth={1.5} />
              </AreaChart>
            </ChartContainer>
          )}
        </Panel>

        <Panel title="宿主机 CPU（MHz）" loading={hostMhzSeriesQ.isLoading}>
          {mhzRows.length === 0 && !hostMhzSeriesQ.isLoading ? (
            <p className="text-xs text-slate-500">暂无</p>
          ) : (
            <ChartContainer config={chartHostMhz} className="h-[240px] w-full">
              <LineChart data={mhzRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80 dark:stroke-slate-700/80" />
                <XAxis dataKey="t" tickFormatter={(v) => fmtAxisTime(String(v))} tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 9 }}
                  width={56}
                  tickFormatter={(v) => `${Math.round(Number(v)).toLocaleString("zh-CN")} MHz`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) =>
                        hostTooltipPair(value, name, fmtMhz(Number(value)))
                      }
                    />
                  }
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {mhzKeys.map((k, i) => (
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
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="宿主机磁盘吞吐（KB/s）" loading={hostDiskSeriesQ.isLoading}>
          {(hostDiskSeriesQ.data ?? []).length === 0 && !hostDiskSeriesQ.isLoading ? (
            <p className="text-xs text-slate-500">暂无</p>
          ) : (
            <ChartContainer config={chartHostDisk} className="h-[220px] w-full">
              <LineChart data={hostDiskSeriesQ.data ?? []} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80 dark:stroke-slate-700/80" />
                <XAxis dataKey="t" tickFormatter={(v) => fmtAxisTime(String(v))} tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 9 }}
                  width={52}
                  tickFormatter={(v) => fmtKbs(Number(v))}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) =>
                        hostTooltipPair(value, name, fmtKbs(Number(value)))
                      }
                    />
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="read" name="读" stroke="var(--color-read)" dot={false} strokeWidth={1.2} />
                <Line type="monotone" dataKey="write" name="写" stroke="var(--color-write)" dot={false} strokeWidth={1.2} />
              </LineChart>
            </ChartContainer>
          )}
        </Panel>
        <Panel title="宿主机网络吞吐（KB/s）" loading={hostNetSeriesQ.isLoading}>
          {(hostNetSeriesQ.data ?? []).length === 0 && !hostNetSeriesQ.isLoading ? (
            <p className="text-xs text-slate-500">暂无</p>
          ) : (
            <ChartContainer config={chartHostNet} className="h-[220px] w-full">
              <LineChart data={hostNetSeriesQ.data ?? []} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80 dark:stroke-slate-700/80" />
                <XAxis dataKey="t" tickFormatter={(v) => fmtAxisTime(String(v))} tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 9 }}
                  width={52}
                  tickFormatter={(v) => fmtKbs(Number(v))}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) =>
                        hostTooltipPair(value, name, fmtKbs(Number(value)))
                      }
                    />
                  }
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="rx" name="Rx" stroke="var(--color-rx)" dot={false} strokeWidth={1.2} />
                <Line type="monotone" dataKey="tx" name="Tx" stroke="var(--color-tx)" dot={false} strokeWidth={1.2} />
              </LineChart>
            </ChartContainer>
          )}
        </Panel>
      </div>

      <Panel title="宿主机活动内存（KiB / MiB / GiB）" loading={hostMemActiveSeriesQ.isLoading}>
        {memActiveRows.length === 0 && !hostMemActiveSeriesQ.isLoading ? (
          <p className="text-xs text-slate-500">暂无</p>
        ) : (
          <ChartContainer config={chartHostMhz} className="h-[220px] w-full">
            <LineChart data={memActiveRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80 dark:stroke-slate-700/80" />
              <XAxis dataKey="t" tickFormatter={(v) => fmtAxisTime(String(v))} tick={{ fontSize: 10 }} />
              <YAxis
                tick={{ fontSize: 9 }}
                width={58}
                tickFormatter={(v) => fmtHostMemAxisKb(Number(v))}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) =>
                      hostTooltipPair(value, name, fmtHostMemKb(Number(value)))
                    }
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {memActKeys.map((k, i) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  name={k}
                  stroke={palette[i % palette.length]}
                  dot={false}
                  strokeWidth={1.1}
                  connectNulls
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </Panel>

      <Panel title="数据存储（容量 / 置备 / 未提交 / VM 数 / 类型 / 维护 / 可访问）" loading={dsExtendedQ.isLoading}>
        {!dsExtendedQ.data?.length && !dsExtendedQ.isLoading ? (
          <p className="text-xs text-slate-500">
            无数据存储序列。若指标仅有 <code className="rounded bg-slate-100 px-0.5 dark:bg-slate-800">dc_name</code> 无{" "}
            <code className="rounded bg-slate-100 px-0.5 dark:bg-slate-800">host_name</code>，将按主机所在数据中心展示该 DC 下全部数据存储。
          </p>
        ) : (
          <div className="max-h-[360px] overflow-auto rounded-lg border border-slate-100 dark:border-slate-800">
            <table className="w-full min-w-[880px] text-left text-[11px]">
              <thead className="sticky top-0 bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-2 py-2 font-medium">数据存储</th>
                  <th className="px-2 py-2 font-medium">已用</th>
                  <th className="px-2 py-2 font-medium">容量</th>
                  <th className="px-2 py-2 font-medium">空闲</th>
                  <th className="px-2 py-2 font-medium">置备</th>
                  <th className="px-2 py-2 font-medium">未提交</th>
                  <th className="px-2 py-2 font-medium">主机</th>
                  <th className="px-2 py-2 font-medium">VM</th>
                  <th className="px-2 py-2 font-medium">类型</th>
                  <th className="px-2 py-2 font-medium">维护</th>
                  <th className="px-2 py-2 font-medium">可访问</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono dark:divide-slate-800">
                {(dsExtendedQ.data ?? []).map((r) => (
                  <tr key={r.ds} className="text-slate-800 dark:text-slate-200">
                    <td className="px-2 py-1">{r.ds}</td>
                    <td className="px-2 py-1">{fmtHostPct(r.usedPct, 1)}</td>
                    <td className="px-2 py-1">{r.capGiB.toFixed(1)} GiB</td>
                    <td className="px-2 py-1">{r.freeGiB.toFixed(1)} GiB</td>
                    <td className="px-2 py-1">{r.provGiB > 0 ? `${r.provGiB.toFixed(1)} GiB` : "—"}</td>
                    <td className="px-2 py-1">{r.uncommGiB > 0 ? `${r.uncommGiB.toFixed(1)} GiB` : "—"}</td>
                    <td className="px-2 py-1">{r.hosts > 0 ? `${r.hosts} 台` : "—"}</td>
                    <td className="px-2 py-1">{r.vms > 0 ? `${r.vms} 台` : "—"}</td>
                    <td className="px-2 py-1">{r.dsType}</td>
                    <td className="px-2 py-1">{r.maintMode}</td>
                    <td className="px-2 py-1">{r.accessible}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="数据存储使用率趋势（%）" loading={dsUsageSeriesQ.isLoading}>
        {dsRows.length === 0 && !dsUsageSeriesQ.isLoading ? (
          <p className="text-xs text-slate-500">暂无</p>
        ) : (
          <ChartContainer config={chartDs} className="h-[260px] w-full">
            <LineChart data={dsRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80 dark:stroke-slate-700/80" />
              <XAxis dataKey="t" tickFormatter={(v) => fmtAxisTime(String(v))} tick={{ fontSize: 10 }} />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10 }}
                width={44}
                tickFormatter={(v) => `${v}%`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) =>
                      hostTooltipPair(value, name, fmtHostPct(Number(value), 1))
                    }
                  />
                }
              />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              {dsKeys.map((k, i) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  name={k}
                  stroke={palette[i % palette.length]}
                  dot={false}
                  strokeWidth={1}
                  connectNulls
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="传感器状态（vmware_host_sensor_state，0红/1黄/2绿/3未知）" loading={sensorsStateQ.isLoading}>
          {badSensors.length > 0 ? (
            <p className="mb-2 text-xs text-amber-800 dark:text-amber-200">
              非绿色（优先）：{badSensors.map((s) => s.name).join(" · ")}
            </p>
          ) : null}
          <div className="max-h-[220px] overflow-auto text-xs">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="py-1 text-left font-medium">名称</th>
                  <th className="py-1 text-left font-medium">类型</th>
                  <th className="py-1 text-right font-medium">值</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(sensorsStateQ.data ?? []).slice(0, 80).map((s, i) => (
                  <tr key={`${s.name}-${i}`}>
                    <td className="max-w-[200px] truncate py-0.5 pr-2">{s.name}</td>
                    <td className="text-slate-500">{s.type}</td>
                    <td className={`text-right font-mono ${s.cls}`}>
                      {s.value.toFixed(0)} · {s.text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="grid gap-5">
          <Panel title="风扇" loading={sensorsFanQ.isLoading}>
            <div className="max-h-[200px] space-y-0.5 overflow-auto pr-0.5">
              {fanHeatRows.map((f, i) => (
                <HeatBarRow
                  key={`${f.name}-${i}`}
                  label={f.shortLabel}
                  title={`${f.name} · ${Math.round(f.rpm)} RPM`}
                  widthPct={f.relPct}
                  barClass={f.bar}
                  glowClass={f.glow}
                  valueClass={f.text}
                >
                  {Math.round(f.relPct)}%
                </HeatBarRow>
              ))}
            </div>
          </Panel>
          <Panel title="温度" loading={sensorsTempQ.isLoading}>
            <div className="max-h-[200px] space-y-0.5 overflow-auto pr-0.5">
              {tempHeatRows.map((t, i) => (
                <HeatBarRow
                  key={`${t.name}-${i}`}
                  label={t.shortLabel}
                  title={`${t.name} · ${t.c.toFixed(1)}°C`}
                  widthPct={t.thermPct}
                  barClass={t.bar}
                  glowClass={t.glow}
                  valueClass={t.text}
                >
                  {Math.round(t.thermPct)}%
                </HeatBarRow>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="功耗 / 电压 / 电流（传感器）" loading={sensorsPowerQ.isLoading}>
        <div className="grid gap-4 sm:grid-cols-3 text-[11px]">
          <div>
            <p className="mb-1 font-medium text-slate-700 dark:text-slate-300">功率</p>
            {(sensorsPowerQ.data?.watts ?? []).map((x, i) => (
              <div key={i} className="flex justify-between gap-2 border-b border-slate-100 py-0.5 dark:border-slate-800">
                <span className="truncate">{x.name}</span>
                <span className="font-mono tabular-nums">{x.v.toFixed(0)} W</span>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-1 font-medium text-slate-700 dark:text-slate-300">电压</p>
            {(sensorsPowerQ.data?.volt ?? []).map((x, i) => (
              <div key={i} className="flex justify-between gap-2 border-b border-slate-100 py-0.5 dark:border-slate-800">
                <span className="truncate">{x.name}</span>
                <span className="font-mono tabular-nums">{x.v.toFixed(1)} V</span>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-1 font-medium text-slate-700 dark:text-slate-300">电流</p>
            {(sensorsPowerQ.data?.amp ?? []).map((x, i) => (
              <div key={i} className="flex justify-between gap-2 border-b border-slate-100 py-0.5 dark:border-slate-800">
                <span className="truncate">{x.name}</span>
                <span className="font-mono tabular-nums">{x.v.toFixed(2)} A</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="虚拟机快照数量" loading={vmSnapshotsQ.isLoading}>
          <div className="max-h-[200px] overflow-auto font-mono text-[11px]">
            {(vmSnapshotsQ.data ?? []).map((r, i) => (
              <div key={`${r.vm}-${i}`} className="flex justify-between border-b border-slate-100 py-0.5 dark:border-slate-800">
                <span className="truncate pr-2">{r.vm}</span>
                <span>{r.n.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="磁盘延迟" loading={vmDiskLatencyQ.isLoading}>
          <div className="max-h-[220px] space-y-0.5 overflow-auto pr-0.5">
            {diskLatencyHeatRows.map((r, i) => (
              <HeatBarRow
                key={`${r.vm}-${i}`}
                label={r.vm}
                title={`${r.vm} · ${Math.round(r.ms)} ms`}
                widthPct={r.stressPct}
                barClass={r.bar}
                glowClass={r.glow}
                valueClass={r.text}
              >
                {Math.round(r.stressPct)}%
              </HeatBarRow>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="快照时间（最近 40 条）" loading={vmSnapTimeQ.isLoading}>
        <div className="max-h-[240px] overflow-auto text-[11px]">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="py-1 text-left font-medium">虚拟机</th>
                <th className="py-1 text-left font-medium">快照名</th>
                <th className="py-1 text-right font-medium">时间</th>
              </tr>
            </thead>
            <tbody>
              {(vmSnapTimeQ.data ?? []).map((r, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-0.5 font-mono">{r.vm}</td>
                  <td className="max-w-[220px] truncate py-0.5">{r.snap}</td>
                  <td className="py-0.5 text-right font-mono text-slate-600">
                    {Number.isFinite(r.ts) ? new Date(r.ts * 1000).toLocaleString("zh-CN", { hour12: false }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="虚拟机 CPU（MHz/s，rate 5m）" loading={vmCpuSeriesQ.isLoading}>
          {cpuRows.length === 0 && !vmCpuSeriesQ.isLoading ? (
            <p className="text-xs text-slate-500">暂无</p>
          ) : (
            <ChartContainer config={chartVmCpu} className="h-[280px] w-full">
              <LineChart data={cpuRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80 dark:stroke-slate-700/80" />
                <XAxis dataKey="t" tickFormatter={(v) => fmtAxisTime(String(v))} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={48} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                {cpuKeys.map((k, i) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={k}
                    stroke={palette[i % palette.length]}
                    dot={false}
                    strokeWidth={1}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ChartContainer>
          )}
        </Panel>

        <Panel title="虚拟机 CPU ready（rate 5m）" loading={vmCpuReadySeriesQ.isLoading}>
          {vmReadyRows.length === 0 && !vmCpuReadySeriesQ.isLoading ? (
            <p className="text-xs text-slate-500">暂无</p>
          ) : (
            <ChartContainer config={chartVmReady} className="h-[280px] w-full">
              <LineChart data={vmReadyRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80 dark:stroke-slate-700/80" />
                <XAxis dataKey="t" tickFormatter={(v) => fmtAxisTime(String(v))} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={44} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                {readyKeys.map((k, i) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={k}
                    stroke={palette[i % palette.length]}
                    dot={false}
                    strokeWidth={1}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ChartContainer>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="虚拟机内存（rate/4）" loading={vmMemSeriesQ.isLoading}>
          {memRows.length === 0 && !vmMemSeriesQ.isLoading ? (
            <p className="text-xs text-slate-500">暂无</p>
          ) : (
            <ChartContainer config={chartVmMem} className="h-[280px] w-full">
              <LineChart data={memRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80 dark:stroke-slate-700/80" />
                <XAxis dataKey="t" tickFormatter={(v) => fmtAxisTime(String(v))} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={44} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                {memKeys.map((k, i) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={k}
                    stroke={palette[i % palette.length]}
                    dot={false}
                    strokeWidth={1}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ChartContainer>
          )}
        </Panel>
        <Panel title="虚拟机 mem_consumed（rate 5m）" loading={vmMemConsumedSeriesQ.isLoading}>
          {vmMemConsRows.length === 0 && !vmMemConsumedSeriesQ.isLoading ? (
            <p className="text-xs text-slate-500">暂无</p>
          ) : (
            <ChartContainer config={chartVmMem} className="h-[280px] w-full">
              <LineChart data={vmMemConsRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80 dark:stroke-slate-700/80" />
                <XAxis dataKey="t" tickFormatter={(v) => fmtAxisTime(String(v))} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={48} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                {memConsKeys.map((k, i) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={k}
                    stroke={palette[i % palette.length]}
                    dot={false}
                    strokeWidth={1}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ChartContainer>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="虚拟机网络接收（rate 5m）" loading={vmNetRxSeriesQ.isLoading}>
          {vmNetRxRows.length === 0 && !vmNetRxSeriesQ.isLoading ? (
            <p className="text-xs text-slate-500">暂无</p>
          ) : (
            <ChartContainer config={chartVmNet} className="h-[260px] w-full">
              <LineChart data={vmNetRxRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80 dark:stroke-slate-700/80" />
                <XAxis dataKey="t" tickFormatter={(v) => fmtAxisTime(String(v))} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={44} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                {netVmKeys.map((k, i) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={k}
                    stroke={palette[i % palette.length]}
                    dot={false}
                    strokeWidth={1}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ChartContainer>
          )}
        </Panel>
        <Panel title="虚拟机磁盘读/写（rate 5m，键名 虚拟机·读/写）" loading={vmDiskRwSeriesQ.isLoading}>
          {vmDiskRwRows.length === 0 && !vmDiskRwSeriesQ.isLoading ? (
            <p className="text-xs text-slate-500">暂无</p>
          ) : (
            <ChartContainer config={chartVmNet} className="h-[260px] w-full">
              <LineChart data={vmDiskRwRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80 dark:stroke-slate-700/80" />
                <XAxis dataKey="t" tickFormatter={(v) => fmtAxisTime(String(v))} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={44} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend wrapperStyle={{ fontSize: 8 }} />
                {diskRwKeys.map((k, i) => (
                  <Line
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={k}
                    stroke={palette[i % palette.length]}
                    dot={false}
                    strokeWidth={0.9}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ChartContainer>
          )}
        </Panel>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        数据存储扩展使用与 Telegraf 一致的指标名（含{" "}
        <code className="rounded bg-slate-100 px-0.5 dark:bg-slate-800">{M_DS_PROVISIONED}</code> /{" "}
        <code className="rounded bg-slate-100 px-0.5 dark:bg-slate-800">{M_DS_UNCOMMITTED}</code>
        拼写）。若序列无 <code className="rounded bg-slate-100 px-0.5 dark:bg-slate-800">host_name</code>
        ，则按宿主机 <code className="rounded bg-slate-100 px-0.5 dark:bg-slate-800">dc_name</code> 回退展示该 DC 下数据存储。
      </p>
    </div>
  );
};

function HeatBarRow({
  label,
  title,
  widthPct,
  barClass,
  glowClass,
  valueClass,
  children,
}: {
  label: string;
  title?: string;
  widthPct: number;
  barClass: string;
  glowClass: string;
  valueClass: string;
  children: React.ReactNode;
}) {
  const w = Math.max(5, Math.min(100, widthPct));
  return (
    <div className="flex items-center gap-2 py-0.5" title={title}>
      <span className="w-[32%] max-w-[7.5rem] shrink-0 truncate text-[10px] tracking-tight text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200/90 ring-1 ring-slate-900/[0.05] dark:bg-slate-800/90 dark:ring-white/[0.06]">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            barClass,
            glowClass || undefined
          )}
          style={{ width: `${w}%` }}
        />
      </div>
      <span className={cn("w-8 shrink-0 text-right text-[10px] font-semibold tabular-nums", valueClass)}>{children}</span>
    </div>
  );
}

function HeroStat({
  title,
  value,
  loading,
  hint,
}: {
  title: string;
  value: string;
  loading?: boolean;
  hint?: string;
}) {
  return (
    <div className="bg-slate-950/40 px-4 py-3 sm:px-5">
      <p className="text-[11px] font-medium text-slate-400">{title}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p> : null}
      <p className="mt-2 font-mono text-lg font-semibold tabular-nums">
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-slate-500" /> : value}
      </p>
    </div>
  );
}

function VitalKV({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-slate-100 bg-white/80 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950/40", className)}>
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 break-words text-slate-900 dark:text-slate-100">{value || "—"}</p>
    </div>
  );
}

function Panel({
  title,
  children,
  loading,
  className,
}: {
  title: string;
  children: React.ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/90 to-white p-4 shadow-sm dark:border-slate-800 dark:from-slate-900/80 dark:to-slate-950/80",
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
      </div>
      {children}
    </div>
  );
}
