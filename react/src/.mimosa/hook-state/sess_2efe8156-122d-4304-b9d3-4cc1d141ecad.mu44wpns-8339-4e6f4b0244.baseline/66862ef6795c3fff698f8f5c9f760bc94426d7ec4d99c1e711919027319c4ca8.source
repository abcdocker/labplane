import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { ArrowLeft, Loader2, RefreshCw, Router } from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAppConfig } from "@/hooks/use-app-config";
import {
  matrixToChartRowsByLabel,
  promInstantVector,
  promQueryRangeVcenter,
  promQueryVcenter,
} from "./vcenterPrometheusHelpers";

const chartCpu: ChartConfig = { v: { label: "CPU %", color: "hsl(142 71% 42%)" } };
const chartKibPerSec: ChartConfig = { v: { label: "KiB/s", color: "hsl(199 72% 46%)" } };

export type IkuaiExporterKind = "modern" | "legacy";

function fmtAxisTime(iso: string): string {
  try {
    return format(new Date(iso), "M/d HH:mm", { locale: zhCN });
  } catch {
    return iso;
  }
}

function instLabels(instance: string): string {
  const i = instance.trim();
  if (!i) return "";
  return `instance=${JSON.stringify(i)}`;
}

function safeDecodeLabel(s: string): string {
  const t = (s || "").replace(/\+/g, " ");
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

/** Go 版：ikuai_network_*_kbytes_per_second，按 1024 字节/秒 → KiB/s，≥1024 写作 MiB/s */
function fmtKbsPerSec(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1024) return `${(n / 1024).toFixed(2)} MiB/s`;
  if (n >= 100) return `${n.toFixed(0)} KiB/s`;
  return `${n.toFixed(2)} KiB/s`;
}

/** Python 版等：字节/秒 */
function fmtBps(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n.toFixed(0)} B/s`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KiB/s`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB/s`;
}

function fmtBytesHuman(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${n.toFixed(0)} B`;
}

function fmtUptimeSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}天${h}时`;
  if (h > 0) return `${h}时${m}分`;
  return `${m}分`;
}

const PIE_COLORS = [
  "hsl(199 72% 46%)",
  "hsl(262 70% 52%)",
  "hsl(32 90% 48%)",
  "hsl(142 71% 42%)",
  "hsl(350 70% 52%)",
  "hsl(280 65% 52%)",
  "hsl(221 83% 53%)",
  "hsl(168 76% 36%)",
];

const CATEGORY_ZH: Record<string, string> = {
  Common: "常用协议",
  Download: "网络下载",
  Unknown: "未知应用",
  Video: "网络视频",
  IM: "网络通讯",
  Others: "其他应用",
  Test: "测速软件",
  Game: "网络游戏",
  HTTP: "HTTP",
  Transport: "文件传输",
};

/** 与 ikuai_app_flow_histogram 的 category 标签一致 */
function categoryLabel(cat: string): string {
  return CATEGORY_ZH[cat] ?? cat;
}

/**
 * 爱快路由器监控：优先 Go 版指标（ikuai_cpu_usage_ratio、ikuai_network_*、ikuai_device_info、
 * ikuai_app_flow_histogram 等）；若无则回退 yw9381 Python 版（ikuai_sys_stat_*、ikuai_client_* 等）。
 */
const VCenterIkuaiRouterPage: React.FC = () => {
  const cfgQ = useAppConfig();
  const [range, setRange] = useState<"1h" | "6h" | "24h">("6h");
  const [instance, setInstance] = useState("");

  const promOk =
    cfgQ.data?.prometheusVcenterConfigured === true ||
    cfgQ.data?.prometheusConfigured === true;

  const instancesQ = useQuery({
    queryKey: ["ikuai-prom-instances"],
    queryFn: async ({ signal }) => {
      const tryUp = await promQueryVcenter(`max by (instance, job) (ikuai_up)`, { signal });
      let rows = promInstantVector(tryUp);
      let kind: IkuaiExporterKind = "modern";
      if (rows.length === 0) {
        const d = await promQueryVcenter(`max by (instance, job) (ikuai_device_count)`, { signal });
        rows = promInstantVector(d);
      }
      if (rows.length === 0) {
        const leg = await promQueryVcenter(`max by (instance, job) (ikuai_sys_stat_cpu_used)`, {
          signal,
        });
        rows = promInstantVector(leg);
        kind = "legacy";
      }
      const dedup = new Map<string, { instance: string; job: string }>();
      for (const r of rows) {
        const inst = r.metric["instance"] ?? "";
        if (inst) dedup.set(inst, { instance: inst, job: r.metric["job"] ?? "" });
      }
      const list = Array.from(dedup.values()).sort((a, b) => a.instance.localeCompare(b.instance));
      return { list, kind };
    },
    enabled: promOk && cfgQ.isSuccess,
    staleTime: 120_000,
  });

  const exporterKind = instancesQ.data?.kind ?? "modern";

  useEffect(() => {
    const lst = instancesQ.data?.list ?? [];
    if (!instance && lst.length > 0) {
      setInstance(lst[0].instance);
    }
  }, [instance, instancesQ.data]);

  const il = instLabels(instance);
  const windowSec = range === "1h" ? 3600 : range === "6h" ? 6 * 3600 : 24 * 3600;
  const { endSec, startSec, step } = useMemo(() => {
    const end = Math.floor(Date.now() / 1000);
    const start = end - windowSec;
    const step = range === "24h" ? "120" : range === "6h" ? "60" : "30";
    return { endSec: end, startSec: start, step };
  }, [range, windowSec]);

  const kpisQ = useQuery({
    queryKey: ["ikuai-kpis", il, exporterKind],
    queryFn: async ({ signal }) => {
      if (!il) throw new Error("未选择 instance");
      if (exporterKind === "modern") {
        const [
          verD,
          cpuD,
          memUseD,
          memSzD,
          dhcpD,
          devCntD,
          connD,
          recvHD,
          sendHD,
          upD,
          uptimeD,
          wanInfoD,
        ] = await Promise.all([
          promQueryVcenter(`ikuai_version{${il}}`, { signal }),
          promQueryVcenter(`avg(ikuai_cpu_usage_ratio{${il}})`, { signal }),
          promQueryVcenter(`ikuai_memory_usage_bytes{${il}}`, { signal }),
          promQueryVcenter(`ikuai_memory_size_bytes{${il}}`, { signal }),
          promQueryVcenter(`ikuai_dhcp_addrpool_num{${il}}`, { signal }),
          promQueryVcenter(`ikuai_device_count{${il}}`, { signal }),
          promQueryVcenter(`ikuai_network_conn_count{${il},id="host"}`, { signal }),
          promQueryVcenter(`ikuai_network_recv_kbytes_per_second{${il},id="host"}`, { signal }),
          promQueryVcenter(`ikuai_network_send_kbytes_per_second{${il},id="host"}`, { signal }),
          promQueryVcenter(`ikuai_up{${il},id="host"}`, { signal }),
          promQueryVcenter(`ikuai_uptime{${il},id="host"}`, { signal }),
          promQueryVcenter(`ikuai_iface_info{${il},interface="wan1"}`, { signal }),
        ]);
        const verRows = promInstantVector(verD);
        const m0 = verRows[0]?.metric ?? {};
        const verStr =
          (m0["verstring"] || m0["version"] || "").trim() || "—";
        const cpu = promInstantVector(cpuD)[0]?.value ?? null;
        const memUse = promInstantVector(memUseD)[0]?.value ?? null;
        const memSz = promInstantVector(memSzD)[0]?.value ?? null;
        const memPct =
          memUse != null && memSz != null && memSz > 0 ? (memUse / memSz) * 100 : null;
        const dhcp = promInstantVector(dhcpD)[0]?.value ?? null;
        const devCnt = promInstantVector(devCntD)[0]?.value ?? null;
        const conn = promInstantVector(connD)[0]?.value ?? null;
        const recvH = promInstantVector(recvHD)[0]?.value ?? null;
        const sendH = promInstantVector(sendHD)[0]?.value ?? null;
        const upOk = promInstantVector(upD)[0]?.value ?? null;
        const uptime = promInstantVector(uptimeD)[0]?.value ?? null;
        const wanIp = (promInstantVector(wanInfoD)[0]?.metric["ip_addr"] ?? "").trim() || "—";
        return {
          exporterKind: "modern" as const,
          version: verStr,
          cpu,
          memUsedPct: memPct,
          memTotalRaw: memSz,
          memUseRaw: memUse,
          dhcp,
          devCnt,
          conn,
          down: recvH,
          up: sendH,
          temp: null as number | null,
          upOk,
          uptime,
          wanIp,
        };
      }
      const qVer = `ikuai_version_system_str{${il}}`;
      const qCpu = `ikuai_sys_stat_cpu_used{${il}}`;
      const qMemU = `ikuai_sys_stat_memory{${il},type="used"}`;
      const qMemT = `ikuai_sys_stat_memory{${il},type="total"}`;
      const qConn = `ikuai_sys_stat_stream{${il},type="connect_num"}`;
      const qDown = `ikuai_sys_stat_stream{${il},type="download"}`;
      const qUp = `ikuai_sys_stat_stream{${il},type="upload"}`;
      const qTemp = `ikuai_sys_stat_cpu_temp{${il}}`;
      const [verData, cpuD, memU, memT, connD, downD, upD, tempD] = await Promise.all([
        promQueryVcenter(qVer, { signal }),
        promQueryVcenter(qCpu, { signal }),
        promQueryVcenter(qMemU, { signal }),
        promQueryVcenter(qMemT, { signal }),
        promQueryVcenter(qConn, { signal }),
        promQueryVcenter(qDown, { signal }),
        promQueryVcenter(qUp, { signal }),
        promQueryVcenter(qTemp, { signal }),
      ]);
      const verRows = promInstantVector(verData);
      const verStr =
        (verRows[0]?.metric?.["now_str"] || verRows[0]?.metric?.["now"] || "").trim() || "—";
      return {
        exporterKind: "legacy" as const,
        version: verStr,
        cpu: promInstantVector(cpuD)[0]?.value ?? null,
        memUsedPct: promInstantVector(memU)[0]?.value ?? null,
        memTotalRaw: promInstantVector(memT)[0]?.value ?? null,
        memUseRaw: null as number | null,
        dhcp: null as number | null,
        devCnt: null as number | null,
        conn: promInstantVector(connD)[0]?.value ?? null,
        down: promInstantVector(downD)[0]?.value ?? null,
        up: promInstantVector(upD)[0]?.value ?? null,
        temp: promInstantVector(tempD)[0]?.value ?? null,
        upOk: null as number | null,
        uptime: null as number | null,
        wanIp: "—",
      };
    },
    enabled:
      Boolean(il) &&
      promOk &&
      cfgQ.isSuccess &&
      instancesQ.isSuccess &&
      (instancesQ.data?.list.length ?? 0) > 0,
    refetchInterval: 20_000,
  });

  const protocolQ = useQuery({
    queryKey: ["ikuai-protocol-pie", il, exporterKind],
    queryFn: async ({ signal }) => {
      if (!il) return [];
      if (exporterKind === "modern") {
        const data = await promQueryVcenter(
          `sum by (category) (ikuai_app_flow_histogram_sum{${il}})`,
          { signal }
        );
        return promInstantVector(data);
      }
      const data = await promQueryVcenter(`ikuai_protocol_appflow{${il}}`, { signal });
      return promInstantVector(data);
    },
    enabled: Boolean(il) && promOk && cfgQ.isSuccess && instancesQ.isSuccess,
    refetchInterval: 60_000,
  });

  const joinRecv =
    `(ikuai_network_recv_kbytes_per_second{id=~"device/.*",${il}}) * on(instance,job,id) group_left(ip_addr,mac,hostname,comment) (ikuai_device_info{${il}})`;
  const joinSend =
    `(ikuai_network_send_kbytes_per_second{id=~"device/.*",${il}}) * on(instance,job,id) group_left(ip_addr,mac,hostname,comment) (ikuai_device_info{${il}})`;

  const clientsTableQ = useQuery({
    queryKey: ["ikuai-clients-table", il, exporterKind],
    queryFn: async ({ signal }) => {
      if (!il) return [];
      if (exporterKind === "modern") {
        const qDl = `max by (ip_addr, mac, hostname, comment) (${joinRecv})`;
        const qUl = `max by (ip_addr, mac, hostname, comment) (${joinSend})`;
        const qCn = `ikuai_network_conn_count{${il},id=~"device/.*"}`;
        const [dlD, ulD, cnD] = await Promise.all([
          promQueryVcenter(qDl, { signal }),
          promQueryVcenter(qUl, { signal }),
          promQueryVcenter(qCn, { signal }),
        ]);
        const dl = promInstantVector(dlD);
        const ul = promInstantVector(ulD);
        const cnRaw = promInstantVector(cnD);
        const cnByMac = new Map<string, number>();
        for (const r of cnRaw) {
          const id = r.metric["id"] ?? "";
          const mac = id.replace(/^device\//i, "").toLowerCase();
          if (mac) cnByMac.set(mac, r.value);
        }
        const ulByIp = new Map<string, number>();
        for (const r of ul) {
          const ip = r.metric["ip_addr"] ?? "";
          if (ip) ulByIp.set(ip, r.value);
        }
        const rows = dl.map((r) => {
          const ip = r.metric["ip_addr"] ?? "";
          const mac = (r.metric["mac"] ?? "").toLowerCase();
          return {
            ip,
            mac: r.metric["mac"] ?? "",
            hostname: r.metric["hostname"] ?? "",
            comment: r.metric["comment"] ?? "",
            download: r.value,
            upload: ulByIp.get(ip) ?? 0,
            connections: Math.round(cnByMac.get(mac) ?? 0),
          };
        });
        rows.sort((a, b) => b.download - a.download);
        return rows.slice(0, 80);
      }
      const qDl = `max by (ip_addr, mac, hostname, comment) (ikuai_client_download{${il}})`;
      const qUl = `max by (ip_addr, mac, hostname, comment) (ikuai_client_upload{${il}})`;
      const qCn = `max by (ip_addr, mac, hostname, comment) (ikuai_client_connect_num{${il}})`;
      const [dlD, ulD, cnD] = await Promise.all([
        promQueryVcenter(qDl, { signal }),
        promQueryVcenter(qUl, { signal }),
        promQueryVcenter(qCn, { signal }),
      ]);
      const dl = promInstantVector(dlD);
      const ul = promInstantVector(ulD);
      const cn = promInstantVector(cnD);
      const ulByIp = new Map<string, number>();
      const cnByIp = new Map<string, number>();
      for (const r of ul) {
        const ip = r.metric["ip_addr"] ?? "";
        if (ip) ulByIp.set(ip, r.value);
      }
      for (const r of cn) {
        const ip = r.metric["ip_addr"] ?? "";
        if (ip) cnByIp.set(ip, r.value);
      }
      const rows = dl.map((r) => {
        const ip = r.metric["ip_addr"] ?? "";
        return {
          ip,
          mac: r.metric["mac"] ?? "",
          hostname: r.metric["hostname"] ?? "",
          comment: r.metric["comment"] ?? "",
          download: r.value,
          upload: ulByIp.get(ip) ?? 0,
          connections: Math.round(cnByIp.get(ip) ?? 0),
        };
      });
      rows.sort((a, b) => b.download - a.download);
      return rows.slice(0, 80);
    },
    enabled: Boolean(il) && promOk && cfgQ.isSuccess && instancesQ.isSuccess,
    refetchInterval: 20_000,
  });

  const cpuSeriesQ = useQuery({
    queryKey: ["ikuai-chart-cpu", il, exporterKind, startSec, endSec, step],
    queryFn: ({ signal }) => {
      const q =
        exporterKind === "modern"
          ? `ikuai_cpu_usage_ratio{${il}}`
          : `ikuai_sys_stat_cpu_used{${il}}`;
      return promQueryRangeVcenter(q, startSec, endSec, step, { signal });
    },
    enabled: Boolean(il) && promOk && instancesQ.isSuccess,
  });

  const streamSeriesQ = useQuery({
    queryKey: ["ikuai-chart-stream", il, exporterKind, startSec, endSec, step],
    queryFn: ({ signal }) => {
      if (exporterKind === "modern") {
        return promQueryRangeVcenter(
          `ikuai_network_recv_kbytes_per_second{${il},id=~"iface/.*|host"}`,
          startSec,
          endSec,
          step,
          { signal }
        );
      }
      return promQueryRangeVcenter(
        `ikuai_sys_stat_stream{${il}}`,
        startSec,
        endSec,
        step,
        { signal }
      );
    },
    enabled: Boolean(il) && promOk && instancesQ.isSuccess,
  });

  const sendLineQ = useQuery({
    queryKey: ["ikuai-chart-send-line", il, exporterKind, startSec, endSec, step],
    queryFn: ({ signal }) => {
      if (exporterKind !== "modern") return { status: "success", data: { result: [] } };
      return promQueryRangeVcenter(
        `ikuai_network_send_kbytes_per_second{${il},id=~"iface/.*|host"}`,
        startSec,
        endSec,
        step,
        { signal }
      );
    },
    enabled: Boolean(il) && promOk && instancesQ.isSuccess && exporterKind === "modern",
  });

  const ifaceDownQ = useQuery({
    queryKey: ["ikuai-chart-iface-dl", il, exporterKind, startSec, endSec, step],
    queryFn: ({ signal }) => {
      if (exporterKind === "modern") {
        return promQueryRangeVcenter(
          `ikuai_network_recv_kbytes_per_second{${il},id=~"iface/.*"}`,
          startSec,
          endSec,
          step,
          { signal }
        );
      }
      return promQueryRangeVcenter(
        `ikuai_iface_stream_download{${il}}`,
        startSec,
        endSec,
        step,
        { signal }
      );
    },
    enabled: Boolean(il) && promOk && instancesQ.isSuccess,
  });


  const topIpQ = useQuery({
    queryKey: ["ikuai-chart-topip", il, exporterKind, joinRecv, startSec, endSec, step],
    queryFn: ({ signal }) => {
      if (exporterKind === "modern") {
        return promQueryRangeVcenter(
          `topk(10, max by (ip_addr) ((${joinRecv})))`,
          startSec,
          endSec,
          step,
          { signal }
        );
      }
      return promQueryRangeVcenter(
        `topk(10, max by (ip_addr) (ikuai_client_download{${il}}))`,
        startSec,
        endSec,
        step,
        { signal }
      );
    },
    enabled: Boolean(il) && promOk && instancesQ.isSuccess,
  });

  const memPctSeriesQ = useQuery({
    queryKey: ["ikuai-chart-mem-pct", il, startSec, endSec, step],
    queryFn: ({ signal }) => {
      if (exporterKind !== "modern") {
        return promQueryRangeVcenter(
          `ikuai_sys_stat_memory{${il},type="used"}`,
          startSec,
          endSec,
          step,
          { signal }
        );
      }
      return promQueryRangeVcenter(
        `(ikuai_memory_usage_bytes{${il}} / ikuai_memory_size_bytes{${il}}) * 100`,
        startSec,
        endSec,
        step,
        { signal }
      );
    },
    enabled: Boolean(il) && promOk && instancesQ.isSuccess,
  });

  const streamRows = useMemo(() => {
    const key = exporterKind === "modern" ? "id" : "type";
    return matrixToChartRowsByLabel(streamSeriesQ.data, key);
  }, [streamSeriesQ.data, exporterKind]);

  const streamKeys = useMemo(() => {
    const k = new Set<string>();
    for (const row of streamRows) {
      for (const x of Object.keys(row)) {
        if (x !== "t") k.add(x);
      }
    }
    return Array.from(k);
  }, [streamRows]);

  const sendRows = useMemo(
    () => matrixToChartRowsByLabel(sendLineQ.data, "id"),
    [sendLineQ.data]
  );
  const sendKeys = useMemo(() => {
    const k = new Set<string>();
    for (const row of sendRows) {
      for (const x of Object.keys(row)) {
        if (x !== "t") k.add(x);
      }
    }
    return Array.from(k);
  }, [sendRows]);

  const ifaceRows = useMemo(() => {
    const key = exporterKind === "modern" ? "id" : "interface";
    return matrixToChartRowsByLabel(ifaceDownQ.data, key);
  }, [ifaceDownQ.data, exporterKind]);

  const ifaceKeys = useMemo(() => {
    const k = new Set<string>();
    for (const row of ifaceRows) {
      for (const x of Object.keys(row)) {
        if (x !== "t") k.add(x);
      }
    }
    return Array.from(k).slice(0, 16);
  }, [ifaceRows]);

  const cpuRows = useMemo(() => {
    const key = exporterKind === "modern" ? "id" : "instance";
    return matrixToChartRowsByLabel(cpuSeriesQ.data, key);
  }, [cpuSeriesQ.data, exporterKind]);

  const topIpRows = useMemo(
    () => matrixToChartRowsByLabel(topIpQ.data, "ip_addr"),
    [topIpQ.data]
  );
  const topIpKeys = useMemo(() => {
    const k = new Set<string>();
    for (const row of topIpRows) {
      for (const x of Object.keys(row)) {
        if (x !== "t") k.add(x);
      }
    }
    return Array.from(k).slice(0, 12);
  }, [topIpRows]);

  const memRows = useMemo(
    () => matrixToChartRowsByLabel(memPctSeriesQ.data, "instance"),
    [memPctSeriesQ.data]
  );

  const pieData = useMemo(() => {
    const raw = protocolQ.data ?? [];
    const filtered = raw.filter((x) => x.value > 0);
    if (exporterKind === "modern") {
      return filtered
        .map((x) => ({
          name: categoryLabel(x.metric["category"] || ""),
          value: x.value,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 14);
    }
    return filtered
      .map((x) => ({
        name: safeDecodeLabel(x.metric["name_cn"] || x.metric["name_en"] || "其他"),
        value: x.value,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 14);
  }, [protocolQ.data, exporterKind]);

  const palette = useMemo(
    () => ["hsl(199 72% 46%)", "hsl(142 71% 42%)", "hsl(32 90% 48%)", "hsl(262 70% 52%)", "hsl(350 70% 52%)"],
    []
  );

  const speedFmt = (n: number) =>
    exporterKind === "modern" ? fmtKbsPerSec(n) : fmtBps(n);

  if (cfgQ.isLoading || !cfgQ.data) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载配置…
      </div>
    );
  }

  if (!promOk) {
    return (
      <div className="space-y-4">
        <Link
          to="/cluster/vcenter"
          className="inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          返回虚拟机列表
        </Link>
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 px-5 py-4 text-sm text-amber-950">
          <p className="font-medium">未配置 vCenter 用 Prometheus</p>
          <p className="mt-1 text-xs text-amber-900/90">
            请填写 <code className="rounded bg-white/70 px-1">prometheusUrlVcenter</code> 或兜底{" "}
            <code className="rounded bg-white/70 px-1">prometheusUrl</code>，并确保已抓取 ikuai exporter（Go 版{" "}
            <code className="rounded bg-white/70 px-1">ikuai_*</code> 或 Python 版 <code className="rounded bg-white/70 px-1">ikuai_client_*</code>）。
          </p>
          <Link
            to="/cluster/vcenter/settings"
            className="mt-2 inline-block text-sm font-semibold text-amber-950 underline"
          >
            vCenter 设置
          </Link>
        </div>
      </div>
    );
  }

  const instList = instancesQ.data?.list ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/cluster/vcenter"
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-violet-700 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            虚拟机列表
          </Link>
          <div className="flex items-center gap-2">
            <Router className="h-7 w-7 text-sky-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">爱快路由器监控</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            自动识别指标族：检测到 <span className="font-mono text-xs">ikuai_up</span> /{" "}
            <span className="font-mono text-xs">ikuai_device_count</span> 时按{" "}
            <strong>Go 版</strong>（<span className="font-mono text-xs">ikuai_network_*_kbytes_per_second</span>、
            <span className="font-mono text-xs">ikuai_app_flow_histogram</span> 等）绘图；否则回退{" "}
            <strong>Python 版</strong> yw9381/exporter。Go 版速率按 <strong>KiB/s</strong>（1024 字节/秒）理解，与
            宽带口头「100M」的 <strong>Mbps</strong>（兆比特/秒，小写 b）不同：不要用小写 m 代替 MiB（小写 m 在 SI
            里是「毫」）。约算：100 Mbps 理论上限 ≈ 100÷8 ≈ 12.5 MB/s（十进制字节）≈ 11.9 MiB/s；与本页数值换算：
            Mbps ≈ KiB/s×8192÷10⁶。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => {
            void instancesQ.refetch();
            void kpisQ.refetch();
            void protocolQ.refetch();
            void clientsTableQ.refetch();
            void cpuSeriesQ.refetch();
            void streamSeriesQ.refetch();
            void sendLineQ.refetch();
            void ifaceDownQ.refetch();
            void topIpQ.refetch();
            void memPctSeriesQ.refetch();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-1">
          <Label className="text-xs">采集目标（instance）</Label>
          <Select
            value={instance || undefined}
            onValueChange={setInstance}
            disabled={instList.length === 0 && !instancesQ.isLoading}
          >
            <SelectTrigger className="h-9 w-[min(100vw-3rem,320px)] font-mono text-xs">
              <SelectValue
                placeholder={instancesQ.isLoading ? "探测中…" : "未找到 ikuai 指标"}
              />
            </SelectTrigger>
            <SelectContent>
              {instList.map((x) => (
                <SelectItem key={x.instance} value={x.instance} className="font-mono text-xs">
                  {x.instance}
                  {x.job ? <span className="ml-2 text-slate-400">job={x.job}</span> : null}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">时间范围</Label>
          <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
            <SelectTrigger className="h-9 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">最近 1 小时</SelectItem>
              <SelectItem value="6h">最近 6 小时</SelectItem>
              <SelectItem value="24h">最近 24 小时</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-slate-500">
          当前：<span className="font-semibold text-slate-700">{exporterKind === "modern" ? "Go 版指标" : "Python 版指标"}</span>
        </p>
        <Link
          to="/cluster/vcenter/settings"
          className="text-xs font-medium text-violet-700 hover:underline"
        >
          Prometheus 数据源
        </Link>
      </div>

      {instancesQ.isError && (
        <p className="text-sm text-red-600">{(instancesQ.error as Error).message}</p>
      )}
      {!instancesQ.isLoading && instList.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
          未发现 <span className="font-mono text-xs">ikuai_up</span> /{" "}
          <span className="font-mono text-xs">ikuai_device_count</span> /{" "}
          <span className="font-mono text-xs">ikuai_sys_stat_cpu_used</span>。请确认 Prometheus 已抓取 exporter。
        </div>
      )}

      {il && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[11px] font-medium text-slate-500">系统版本</p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900" title={kpisQ.data?.version}>
                {kpisQ.isLoading ? "…" : kpisQ.data?.version ?? "—"}
              </p>
            </div>
            {exporterKind === "modern" && (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-[11px] font-medium text-slate-500">在线</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {kpisQ.isLoading ? "…" : kpisQ.data?.upOk === 1 ? "已连接" : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-[11px] font-medium text-slate-500">运行时间</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                    {kpisQ.isLoading || kpisQ.data?.uptime == null
                      ? "…"
                      : fmtUptimeSec(kpisQ.data.uptime)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-[11px] font-medium text-slate-500">WAN 公网 IP</p>
                  <p className="mt-1 font-mono text-xs font-semibold text-slate-900">
                    {kpisQ.isLoading ? "…" : kpisQ.data?.wanIp ?? "—"}
                  </p>
                </div>
              </>
            )}
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[11px] font-medium text-slate-500">
                {exporterKind === "modern" ? "CPU（各核均值）" : "CPU 使用"}
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                {kpisQ.isLoading ? "…" : kpisQ.data?.cpu != null ? `${kpisQ.data.cpu.toFixed(1)}%` : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[11px] font-medium text-slate-500">内存使用</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                {kpisQ.isLoading
                  ? "…"
                  : kpisQ.data?.memUsedPct != null
                    ? `${kpisQ.data.memUsedPct.toFixed(1)}%`
                    : "—"}
              </p>
              {exporterKind === "modern" &&
              kpisQ.data?.memTotalRaw != null &&
              Number.isFinite(kpisQ.data.memTotalRaw) ? (
                <p className="mt-0.5 text-[10px] text-slate-500">
                  已用 {fmtBytesHuman(kpisQ.data.memUseRaw ?? 0)} / 共{" "}
                  {fmtBytesHuman(kpisQ.data.memTotalRaw)}
                </p>
              ) : kpisQ.data?.memTotalRaw != null && Number.isFinite(kpisQ.data.memTotalRaw) ? (
                <p className="mt-0.5 text-[10px] text-slate-500">
                  总内存约 {fmtBytesHuman(kpisQ.data.memTotalRaw)}
                </p>
              ) : null}
            </div>
            {exporterKind === "modern" && (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-[11px] font-medium text-slate-500">DHCP 池剩余</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {kpisQ.isLoading ? "…" : kpisQ.data?.dhcp != null ? Math.round(kpisQ.data.dhcp) : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-[11px] font-medium text-slate-500">内网终端</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {kpisQ.isLoading ? "…" : kpisQ.data?.devCnt != null ? Math.round(kpisQ.data.devCnt) : "—"}
                  </p>
                </div>
              </>
            )}
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[11px] font-medium text-slate-500">连接数（host）</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                {kpisQ.isLoading
                  ? "…"
                  : kpisQ.data?.conn != null
                    ? Math.round(kpisQ.data.conn).toLocaleString()
                    : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-[11px] font-medium text-slate-500">
                {exporterKind === "modern" ? "主机下行 / 上行 (KiB/s)" : "系统下行 / 上行"}
              </p>
              <p className="mt-1 text-xs font-mono tabular-nums text-slate-800">
                {kpisQ.isLoading ? "…" : speedFmt(kpisQ.data?.down ?? NaN)}
              </p>
              <p className="text-xs font-mono tabular-nums text-slate-600">
                {kpisQ.isLoading ? "" : speedFmt(kpisQ.data?.up ?? NaN)}
              </p>
            </div>
            {exporterKind === "legacy" && (
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-[11px] font-medium text-slate-500">CPU 温度</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                  {kpisQ.isLoading
                    ? "…"
                    : kpisQ.data?.temp != null
                      ? `${kpisQ.data.temp.toFixed(0)}°C`
                      : "—"}
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">应用流量分布</h3>
              <p className="text-[11px] text-slate-500">
                {exporterKind === "modern"
                  ? "sum by (category)(ikuai_app_flow_histogram_sum) — 与 exporter 近 30 分钟直方图一致"
                  : "ikuai_protocol_appflow（Python）"}
              </p>
              {protocolQ.isLoading ? (
                <p className="py-12 text-center text-sm text-slate-500">加载中…</p>
              ) : pieData.length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-500">暂无数据</p>
              ) : (
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={96}
                        paddingAngle={1}
                        label={(e: { name?: string; percent?: number }) => {
                          const p = ((e.percent ?? 0) * 100).toFixed(0);
                          return `${e.name ?? ""} ${p}%`;
                        }}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => [v.toFixed(0), exporterKind === "modern" ? "sum" : "值"]}
                        contentStyle={{ fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">设备流量（实时）</h3>
              <p className="text-[11px] text-slate-500">
                {exporterKind === "modern"
                  ? "ikuai_network_*_kbytes_per_second × ikuai_device_info"
                  : "ikuai_client_*"}
              </p>
              <div className="mt-2 max-h-[320px] overflow-auto rounded-lg border border-slate-100">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs">IP</TableHead>
                      <TableHead className="text-xs">备注/主机名</TableHead>
                      <TableHead className="text-xs">连接</TableHead>
                      <TableHead className="text-right text-xs">上行</TableHead>
                      <TableHead className="text-right text-xs">下行</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientsTableQ.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-xs text-slate-500">
                          加载中…
                        </TableCell>
                      </TableRow>
                    ) : (clientsTableQ.data?.length ?? 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-xs text-slate-500">
                          无终端数据
                        </TableCell>
                      </TableRow>
                    ) : (
                      (clientsTableQ.data ?? []).map((r) => (
                        <TableRow key={r.ip} className="text-xs">
                          <TableCell className="font-mono">{r.ip}</TableCell>
                          <TableCell className="max-w-[160px] truncate" title={r.comment || r.hostname}>
                            {safeDecodeLabel(r.comment || r.hostname) || "—"}
                          </TableCell>
                          <TableCell className="tabular-nums">{r.connections}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {speedFmt(r.upload)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {speedFmt(r.download)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              {exporterKind === "modern" ? "CPU 占用（按 id）" : "路由器 CPU 使用率"}
            </h3>
            <p className="text-[11px] text-slate-500">
              {exporterKind === "modern" ? "ikuai_cpu_usage_ratio" : "ikuai_sys_stat_cpu_used"}
            </p>
            {cpuSeriesQ.isLoading ? (
              <p className="py-16 text-center text-sm text-slate-500">加载中…</p>
            ) : cpuRows.length === 0 ? (
              <p className="py-16 text-center text-xs text-slate-500">暂无序列</p>
            ) : (
              <ChartContainer config={chartCpu} className="h-[260px] w-full">
                <LineChart data={cpuRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80" />
                  <XAxis
                    dataKey="t"
                    tickFormatter={(v) => fmtAxisTime(String(v))}
                    tick={{ fontSize: 10 }}
                    stroke="hsl(215 16% 65%)"
                  />
                  <YAxis tick={{ fontSize: 10 }} width={40} stroke="hsl(215 16% 65%)" domain={[0, "auto"]} />
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
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {Object.keys(cpuRows[0] ?? {})
                    .filter((k) => k !== "t")
                    .map((key, idx) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={key}
                        stroke={palette[idx % palette.length]}
                        dot={false}
                        strokeWidth={1.6}
                      />
                    ))}
                </LineChart>
              </ChartContainer>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              {exporterKind === "modern" ? "内存使用占比 %" : "内存使用（legacy type=used）"}
            </h3>
            <p className="text-[11px] text-slate-500">
              {exporterKind === "modern"
                ? "(ikuai_memory_usage_bytes / ikuai_memory_size_bytes) * 100"
                : "ikuai_sys_stat_memory{type=used}"}
            </p>
            {memPctSeriesQ.isLoading ? (
              <p className="py-16 text-center text-sm text-slate-500">加载中…</p>
            ) : memRows.length === 0 ? (
              <p className="py-16 text-center text-xs text-slate-500">暂无序列</p>
            ) : (
              <ChartContainer config={chartCpu} className="h-[220px] w-full">
                <LineChart data={memRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80" />
                  <XAxis
                    dataKey="t"
                    tickFormatter={(v) => fmtAxisTime(String(v))}
                    tick={{ fontSize: 10 }}
                    stroke="hsl(215 16% 65%)"
                  />
                  <YAxis tick={{ fontSize: 10 }} width={40} stroke="hsl(215 16% 65%)" domain={[0, "auto"]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {Object.keys(memRows[0] ?? {})
                    .filter((k) => k !== "t")
                    .map((key, idx) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={key}
                        stroke={palette[(idx + 2) % palette.length]}
                        dot={false}
                        strokeWidth={1.8}
                      />
                    ))}
                </LineChart>
              </ChartContainer>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              {exporterKind === "modern" ? "下行速率 KiB/s（WAN/LAN/host）" : "系统实时流量（按 type）"}
            </h3>
            <p className="text-[11px] text-slate-500">
              {exporterKind === "modern"
                ? "ikuai_network_recv_kbytes_per_second"
                : "ikuai_sys_stat_stream"}
            </p>
            {streamSeriesQ.isLoading ? (
              <p className="py-16 text-center text-sm text-slate-500">加载中…</p>
            ) : streamRows.length === 0 ? (
              <p className="py-16 text-center text-xs text-slate-500">暂无序列</p>
            ) : (
              <ChartContainer config={chartKibPerSec} className="h-[300px] w-full">
                <LineChart data={streamRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80" />
                  <XAxis
                    dataKey="t"
                    tickFormatter={(v) => fmtAxisTime(String(v))}
                    tick={{ fontSize: 10 }}
                    stroke="hsl(215 16% 65%)"
                  />
                  <YAxis tick={{ fontSize: 10 }} width={48} stroke="hsl(215 16% 65%)" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {streamKeys.map((key, idx) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={key}
                      stroke={palette[idx % palette.length]}
                      dot={false}
                      strokeWidth={1.8}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
            )}
          </div>

          {exporterKind === "modern" && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">上行速率 KiB/s（WAN/LAN/host）</h3>
              <p className="text-[11px] text-slate-500">ikuai_network_send_kbytes_per_second</p>
              {sendLineQ.isLoading ? (
                <p className="py-16 text-center text-sm text-slate-500">加载中…</p>
              ) : sendRows.length === 0 ? (
                <p className="py-16 text-center text-xs text-slate-500">暂无序列</p>
              ) : (
                <ChartContainer config={chartKibPerSec} className="h-[300px] w-full">
                  <LineChart data={sendRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80" />
                    <XAxis
                      dataKey="t"
                      tickFormatter={(v) => fmtAxisTime(String(v))}
                      tick={{ fontSize: 10 }}
                      stroke="hsl(215 16% 65%)"
                    />
                    <YAxis tick={{ fontSize: 10 }} width={48} stroke="hsl(215 16% 65%)" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {sendKeys.map((key, idx) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={key}
                        stroke={palette[idx % palette.length]}
                        dot={false}
                        strokeWidth={1.8}
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              {exporterKind === "modern" ? "线路下行 KiB/s（iface）" : "线路实时下行（ikuai_iface_stream_download）"}
            </h3>
            <p className="text-[11px] text-slate-500">
              {exporterKind === "modern"
                ? "ikuai_network_recv_kbytes_per_second{id=~\"iface/.*\"}"
                : "ikuai_iface_stream_download"}
            </p>
            {ifaceDownQ.isLoading ? (
              <p className="py-16 text-center text-sm text-slate-500">加载中…</p>
            ) : ifaceRows.length === 0 ? (
              <p className="py-16 text-center text-xs text-slate-500">暂无序列</p>
            ) : (
              <ChartContainer config={chartKibPerSec} className="h-[300px] w-full">
                <LineChart data={ifaceRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80" />
                  <XAxis
                    dataKey="t"
                    tickFormatter={(v) => fmtAxisTime(String(v))}
                    tick={{ fontSize: 10 }}
                    stroke="hsl(215 16% 65%)"
                  />
                  <YAxis tick={{ fontSize: 10 }} width={48} stroke="hsl(215 16% 65%)" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {ifaceKeys.map((key, idx) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={key}
                      stroke={palette[idx % palette.length]}
                      dot={false}
                      strokeWidth={1.8}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">终端下行 Top IP（KiB/s）</h3>
            <p className="text-[11px] text-slate-500">
              {exporterKind === "modern"
                ? "topk(10, max by (ip_addr)(recv×device_info))，与上方面板同为 KiB/s"
                : "topk(10, max by (ip_addr)(ikuai_client_download))"}
            </p>
            {topIpQ.isLoading ? (
              <p className="py-16 text-center text-sm text-slate-500">加载中…</p>
            ) : topIpRows.length === 0 ? (
              <p className="py-16 text-center text-xs text-slate-500">暂无序列</p>
            ) : (
              <ChartContainer config={chartKibPerSec} className="h-[300px] w-full">
                <LineChart data={topIpRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80" />
                  <XAxis
                    dataKey="t"
                    tickFormatter={(v) => fmtAxisTime(String(v))}
                    tick={{ fontSize: 10 }}
                    stroke="hsl(215 16% 65%)"
                  />
                  <YAxis tick={{ fontSize: 10 }} width={44} stroke="hsl(215 16% 65%)" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {topIpKeys.map((key, idx) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={key}
                      stroke={palette[idx % palette.length]}
                      dot={false}
                      strokeWidth={1.8}
                    />
                  ))}
                </LineChart>
              </ChartContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default VCenterIkuaiRouterPage;
