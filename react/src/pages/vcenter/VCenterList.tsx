import React, { useEffect, useMemo, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Network, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGetJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  VCenterVMRow,
  VCenterVMsResponse,
  VCenterVMsIkuaiClientStreamResponse,
} from "./types";
import { VCenterPercentBar } from "./VCenterPercentBar";
import { vcenterVmPerfRowMbps } from "./vcenterPerfMbps";
import { vcenterListMobileText } from "./vcenterList.i18n";

function vmDetailPath(moref: string): string {
  return `/cluster/vcenter/${encodeURIComponent(moref)}`;
}

function vmCpuPct(vm: VCenterVMRow): number | null {
  const on = vm.powerState === "poweredOn" || vm.powerState === "suspended";
  if (!on) return null;
  if ((vm.cpuCapacityMHz ?? 0) <= 0) return null;
  return vm.cpuUsagePercent ?? 0;
}

function vmMemPct(vm: VCenterVMRow): number | null {
  const on = vm.powerState === "poweredOn" || vm.powerState === "suspended";
  if (!on) return null;
  if ((vm.memoryMaxMB ?? 0) > 0) return vm.memoryUsagePercent ?? 0;
  if ((vm.memoryMB ?? 0) > 0) return vm.memoryUsagePercent ?? 0;
  return null;
}

/** 存储已提交占（已提交+未提交）比例；无数据或分母为 0 时返回 null */
function vmDiskPct(vm: VCenterVMRow): number | null {
  const p = vm.diskUsagePercent;
  if (p == null || !Number.isFinite(p)) return null;
  return p;
}

function powerStateBadge(powerState: string | undefined) {
  const s = (powerState ?? "").toLowerCase();
  if (s === "poweredon") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-200 bg-emerald-50 font-normal text-emerald-800"
      >
        运行中
      </Badge>
    );
  }
  if (s === "poweredoff") {
    return (
      <Badge variant="outline" className="border-slate-200 bg-slate-100 font-normal text-slate-700">
        已关机
      </Badge>
    );
  }
  if (s === "suspended") {
    return (
      <Badge
        variant="outline"
        className="border-amber-200 bg-amber-50 font-normal text-amber-900"
      >
        已挂起
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-normal">
      {powerState || "—"}
    </Badge>
  );
}

function memAllocMB(vm: VCenterVMRow): number {
  return (vm.memoryMaxMB ?? 0) > 0 ? vm.memoryMaxMB! : vm.memoryMB;
}

function formatSpec(vm: VCenterVMRow): string {
  const gib = vm.memoryMB > 0 ? (vm.memoryMB / 1024).toFixed(vm.memoryMB % 1024 === 0 ? 0 : 1) : "—";
  return `${vm.cpu} vCPU · ${gib} GiB`;
}

/** Python 版：Prometheus 瞬时值为字节/秒 时的展示 */
function formatIkuaiBps(n: number | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n.toFixed(0)} B/s`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KiB/s`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB/s`;
}

/** 拓扑表：Go 版为 KiB/s；Python 版为 B/s（见 formatIkuaiBps） */
function formatIkuaiLanCell(
  n: number | undefined,
  exporterKind: "modern" | "legacy" | undefined
): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (exporterKind === "modern") {
    if (n >= 1024) return `${(n / 1024).toFixed(2)} MiB/s`;
    if (n >= 100) return `${n.toFixed(0)} KiB/s`;
    return `${n.toFixed(2)} KiB/s`;
  }
  return formatIkuaiBps(n);
}

function primaryGuestIp(vm: VCenterVMRow): string {
  const s = (vm.ip ?? "").trim();
  if (!s || s === "—") return "";
  return s;
}

function safeDecodeIkuaiLabel(s: string): string {
  const t = (s || "").replace(/\+/g, " ");
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

const VCenterList: React.FC = () => {
  const [filter, setFilter] = useState("");
  const [lanTopologyOpen, setLanTopologyOpen] = useState(false);
  const queryClient = useQueryClient();

  const statusQ = useQuery({
    queryKey: ["vcenter-status"],
    queryFn: ({ signal }) =>
      apiGetJson<{ configured: boolean; vcenterUrlHint?: string }>(
        "/api/vcenter/status"
      , { signal }),
  });

  const appCfgQ = useAppConfig();
  const vcStaleMs = Math.max(
    30_000,
    (appCfgQ.data?.vcenterCacheTtlSec ?? 120) * 1000
  );

  const vmsQ = useQuery({
    queryKey: ["vcenter-vms"],
    queryFn: ({ signal }) => apiGetJson<VCenterVMsResponse>("/api/vcenter/vms", { signal }),
    enabled: statusQ.data?.configured === true,
    staleTime: vcStaleMs,
    refetchOnWindowFocus: false,
  });

  const promForVc =
    appCfgQ.data?.prometheusVcenterConfigured === true ||
    appCfgQ.data?.prometheusConfigured === true;

  const ikuaiStreamQ = useQuery({
    queryKey: ["vcenter-vms-ikuai-client-stream"],
    queryFn: ({ signal }) =>
      apiGetJson<VCenterVMsIkuaiClientStreamResponse>(
        "/api/vcenter/vms/ikuai-client-stream?unit=bytes",
        { signal }
      ),
    enabled: statusQ.data?.configured === true && (vmsQ.data?.vms?.length ?? 0) > 0 && promForVc,
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const vmsConfigured = statusQ.data?.configured === true;
  useEffect(() => {
    if (!vmsConfigured) return;
    const id = window.setInterval(() => {
      void queryClient.fetchQuery({
        queryKey: ["vcenter-vms"],
        queryFn: ({ signal }) =>
          apiGetJson<VCenterVMsResponse>("/api/vcenter/vms?refresh=1", { signal }),
      });
    }, 22_000);
    return () => clearInterval(id);
  }, [vmsConfigured, queryClient]);

  const allVms = vmsQ.data?.vms ?? [];

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allVms;
    return allVms.filter((vm) => {
      const name = (vm.name ?? "").toLowerCase();
      const id = (vm.moref ?? "").toLowerCase();
      const ip = (vm.ip ?? "").toLowerCase();
      const guest = (vm.guestId ?? "").toLowerCase();
      return (
        name.includes(q) ||
        id.includes(q) ||
        ip.includes(q) ||
        guest.includes(q)
      );
    });
  }, [allVms, filter]);

  const poweredOn = useMemo(
    () =>
      allVms.filter((v) => (v.powerState ?? "").toLowerCase() === "poweredon")
        .length,
    [allVms]
  );

  if (statusQ.isLoading) {
    return <p className="text-slate-500">加载中…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            云主机（虚拟机）
          </h2>
          <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-600 md:hidden">
            <summary className="flex min-h-11 cursor-pointer select-none items-center font-medium text-slate-700">
              {vcenterListMobileText.metricHelpTitle}
            </summary>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {vcenterListMobileText.metricHelpDescription}
            </p>
          </details>
          <p className="mt-1 hidden max-w-5xl text-sm leading-5 text-slate-500 md:block">
            列表展示 vCenter 中的虚拟机；<strong className="font-medium text-slate-700">电源状态约每 22 秒</strong>向 vCenter 拉取刷新（
            <span className="font-mono text-xs">?refresh=1</span>
            ），便于捕获重启、关机、挂起等变化。
            <strong className="font-medium text-slate-700"> 存储承诺</strong>为 vCenter 摘要中的薄置备已提交占（已提交 + 未提交）百分比，与来宾机{" "}
            <span className="font-mono text-xs">df</span> 不同。
            若已配置 Prometheus 并抓取 <span className="font-mono text-xs">ikuai_exporter</span>，「爱快」列按虚拟机{" "}
            <strong>私网 IP</strong>与 iKuai LAN 客户端表对齐（约 15 秒刷新）；拓扑表内 Go 版为 <strong>KiB/s</strong>。可点「爱快 LAN 拓扑」查看全表设备。
            名称可能含表情或长文本，请使用右侧「实例 ID」或「详情」进入，不依赖名称链接。
          </p>
        </div>
        {allVms.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
            <span className="text-slate-500">共计</span>
            <span className="font-semibold tabular-nums text-slate-900">
              {allVms.length}
            </span>
            <span className="text-slate-500">台</span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-500">运行中</span>
            <span className="font-semibold tabular-nums text-emerald-700">
              {poweredOn}
            </span>
          </div>
        )}
      </div>

      {statusQ.data?.vcenterUrlHint && (
        <p className="text-sm text-slate-500">
          vCenter：{statusQ.data.vcenterUrlHint}
        </p>
      )}

      {vmsQ.isLoading && <p className="text-slate-500">加载虚拟机列表…</p>}
      {vmsQ.error && (
        <p className="text-red-600">{(vmsQ.error as Error).message}</p>
      )}

      {vmsQ.data && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="搜索名称、实例 ID、IP、GuestId…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-10 border-slate-200 bg-white pl-9"
                aria-label="筛选虚拟机"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="shrink-0 text-xs text-slate-500">
                显示{" "}
                <span className="font-medium tabular-nums text-slate-800">
                  {filtered.length}
                </span>{" "}
                / {allVms.length} 台
              </p>
              {promForVc && (
                <>
                  <Button variant="outline" size="sm" className="h-8 border-slate-200 bg-white text-xs" asChild>
                    <Link to="/cluster/vcenter/router">爱快监控图</Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 border-slate-200 bg-white text-xs"
                    onClick={() => setLanTopologyOpen(true)}
                  >
                    <Network className="h-3.5 w-3.5" />
                    爱快 LAN 拓扑
                  </Button>
                </>
              )}
            </div>
          </div>
          {allVms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-8 text-center text-sm text-slate-500">
              未发现虚拟机（或当前账号无权限）。
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-amber-50/40 px-6 py-8 text-center text-sm text-amber-950">
              无匹配结果，请调整搜索关键词。
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:hidden">
                {filtered.map((vm) => {
                  const on = (vm.powerState ?? "").toLowerCase() === "poweredon";
                  const guestIp = primaryGuestIp(vm);
                  const ikuaiRate =
                    on && guestIp && ikuaiStreamQ.data?.ratesByIp
                      ? ikuaiStreamQ.data.ratesByIp[guestIp]
                      : undefined;
                  const ikuaiNet = on
                    ? vcenterVmPerfRowMbps(ikuaiRate)
                    : { downloadMbps: "—", uploadMbps: "—" };
                  const ikuaiLoading = promForVc && on && ikuaiStreamQ.isLoading;
                  const ikuaiErr = promForVc && ikuaiStreamQ.isError;

                  return (
                    <article
                      key={vm.moref}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                        <div className="min-w-0">
                          <h3
                            className="line-clamp-2 break-words text-sm font-semibold leading-snug text-slate-900"
                            title={vm.name}
                          >
                            {vm.name || vcenterListMobileText.unnamed}
                          </h3>
                          <p className="mt-1 truncate font-mono text-[10px] text-slate-500" title={vm.moref}>
                            {vm.moref}
                          </p>
                        </div>
                        <div className="shrink-0">{powerStateBadge(vm.powerState)}</div>
                      </div>

                      <div className="space-y-4 px-4 py-3.5">
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                          <div className="min-w-0">
                            <dt className="text-slate-500">{vcenterListMobileText.privateIp}</dt>
                            <dd
                              className="mt-0.5 truncate font-mono font-medium text-slate-800"
                              title={vm.ip || ""}
                            >
                              {vm.ip || "—"}
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-slate-500">{vcenterListMobileText.spec}</dt>
                            <dd className="mt-0.5 truncate font-medium text-slate-800">
                              {formatSpec(vm)}
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-slate-500">{vcenterListMobileText.status}</dt>
                            <dd className="mt-0.5 truncate font-medium text-slate-800">
                              {vm.overallStatus ?? "—"}
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-slate-500">{vcenterListMobileText.system}</dt>
                            <dd
                              className="mt-0.5 truncate font-medium text-slate-800"
                              title={vm.guestId}
                            >
                              {vm.guestId || "—"}
                            </dd>
                          </div>
                        </dl>

                        <div className="grid grid-cols-2 gap-3 border-y border-slate-100 py-3">
                          <div className="min-w-0 space-y-1.5">
                            <p className="text-xs font-medium text-slate-700">{vcenterListMobileText.cpu}</p>
                            <VCenterPercentBar value={vmCpuPct(vm)} />
                            <p className="truncate text-[10px] tabular-nums text-slate-500">
                              {vm.cpuUsageMHz ?? 0} / {vm.cpuCapacityMHz ?? 0} MHz
                            </p>
                          </div>
                          <div className="min-w-0 space-y-1.5">
                            <p className="text-xs font-medium text-slate-700">{vcenterListMobileText.memory}</p>
                            <VCenterPercentBar value={vmMemPct(vm)} />
                            <p className="truncate text-[10px] tabular-nums text-slate-500">
                              {vm.memoryUsageMB ?? 0} / {memAllocMB(vm)} MB
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          {promForVc ? (
                            <p
                              className="min-w-0 truncate font-mono text-[11px] tabular-nums text-sky-800"
                              title={
                                ikuaiErr
                                  ? vcenterListMobileText.ikuaiLoadFailed
                                  : guestIp
                                    ? `${vcenterListMobileText.ikuaiClientPrefix} ${guestIp}`
                                    : vcenterListMobileText.ikuaiNoGuestIp
                              }
                            >
                              {vcenterListMobileText.ikuaiDownload} {ikuaiLoading || ikuaiErr ? "—" : ikuaiNet.downloadMbps}
                              <span className="mx-1.5 text-slate-300">|</span>
                              {vcenterListMobileText.ikuaiUpload} {ikuaiLoading || ikuaiErr ? "—" : ikuaiNet.uploadMbps}
                            </p>
                          ) : (
                            <span />
                          )}
                          <Button variant="outline" size="sm" className="min-h-11 shrink-0 gap-1 px-3" asChild>
                            <Link to={vmDetailPath(vm.moref)}>
                              {vcenterListMobileText.viewDetail}
                              <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 bg-slate-50/95 hover:bg-slate-50/95">
                      <TableHead className="sticky top-0 z-10 min-w-[140px] max-w-[240px] bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        名称
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        实例 ID
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        电源
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        状态
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 min-w-[120px] bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        CPU
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 min-w-[120px] bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        内存
                      </TableHead>
                      {promForVc && (
                        <>
                          <TableHead
                            className="sticky top-0 z-10 whitespace-nowrap bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm"
                            title="爱快：按私网 IP 匹配；KiB/s→十进制 Mbps，与左侧列同一换算"
                          >
                            爱快↓
                          </TableHead>
                          <TableHead
                            className="sticky top-0 z-10 whitespace-nowrap bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm"
                            title="爱快：按私网 IP 匹配；KiB/s→十进制 Mbps"
                          >
                            爱快↑
                          </TableHead>
                        </>
                      )}
                      <TableHead
                        className="sticky top-0 z-10 min-w-[120px] bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm"
                        title="薄置备存储承诺比（vSphere 已提交/已提交+未承诺）；厚置备或无未承诺时为 —，与来宾 df 不同"
                      >
                        存储承诺
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        规格
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 min-w-[100px] max-w-[140px] bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        私网 IP
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 min-w-[100px] max-w-[160px] bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        系统
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 w-[100px] bg-slate-50/95 text-right font-semibold text-slate-800 backdrop-blur-sm">
                        操作
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((vm, i) => {
                      const on = (vm.powerState ?? "").toLowerCase() === "poweredon";
                      const guestIp = primaryGuestIp(vm);
                      const ikuaiRate =
                        on && guestIp && ikuaiStreamQ.data?.ratesByIp
                          ? ikuaiStreamQ.data.ratesByIp[guestIp]
                          : undefined;
                      const ikuaiNet = on ? vcenterVmPerfRowMbps(ikuaiRate) : { downloadMbps: "—", uploadMbps: "—" };
                      const ikuaiLoading = promForVc && on && ikuaiStreamQ.isLoading;
                      const ikuaiErr = promForVc && ikuaiStreamQ.isError;
                      return (
                      <TableRow
                        key={vm.moref}
                        className={cn(
                          "border-slate-100",
                          i % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                        )}
                      >
                        <TableCell className="max-w-[240px] align-top">
                          <p
                            className="line-clamp-2 break-words text-sm font-medium leading-snug text-slate-900"
                            title={vm.name}
                          >
                            {vm.name || "（未命名）"}
                          </p>
                        </TableCell>
                        <TableCell className="align-top font-mono text-[11px] text-slate-600">
                          {vm.moref}
                        </TableCell>
                        <TableCell className="align-top">
                          {powerStateBadge(vm.powerState)}
                        </TableCell>
                        <TableCell className="align-top text-xs text-slate-600">
                          {vm.overallStatus ?? "—"}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="min-w-[110px] space-y-1">
                            <VCenterPercentBar value={vmCpuPct(vm)} />
                            <p className="whitespace-nowrap text-[11px] text-slate-500">
                              {vm.cpuUsageMHz ?? 0} / {vm.cpuCapacityMHz ?? 0}{" "}
                              MHz
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="min-w-[110px] space-y-1">
                            <VCenterPercentBar value={vmMemPct(vm)} />
                            <p className="whitespace-nowrap text-[11px] text-slate-500">
                              {vm.memoryUsageMB ?? 0} / {memAllocMB(vm)} MB
                            </p>
                          </div>
                        </TableCell>
                        {promForVc && (
                          <>
                            <TableCell
                              className="align-top font-mono text-xs tabular-nums text-sky-800"
                              title={
                                ikuaiErr
                                  ? "爱快数据拉取失败（请确认 Prometheus 已抓取 ikuai_exporter）"
                                  : guestIp
                                    ? `iKuai 客户端 IP ${guestIp}`
                                    : "无 Guest IP，无法与爱快表对齐"
                              }
                            >
                              {!on
                                ? "—"
                                : !guestIp
                                  ? "—"
                                  : ikuaiLoading
                                    ? "…"
                                    : ikuaiErr
                                      ? "—"
                                      : ikuaiNet.downloadMbps}
                            </TableCell>
                            <TableCell
                              className="align-top font-mono text-xs tabular-nums text-sky-800"
                              title={
                                ikuaiErr
                                  ? "爱快数据拉取失败（请确认 Prometheus 已抓取 ikuai_exporter）"
                                  : guestIp
                                    ? `iKuai 客户端 IP ${guestIp}`
                                    : "无 Guest IP，无法与爱快表对齐"
                              }
                            >
                              {!on
                                ? "—"
                                : !guestIp
                                  ? "—"
                                  : ikuaiLoading
                                    ? "…"
                                    : ikuaiErr
                                      ? "—"
                                      : ikuaiNet.uploadMbps}
                            </TableCell>
                          </>
                        )}
                        <TableCell
                          className="align-top"
                          title="薄置备：已提交÷(已提交+未承诺)×100%，随实际占用升高；厚置备或未报告未承诺时无此项（非 df 磁盘占用）"
                        >
                          <div className="min-w-[110px] space-y-1">
                            <VCenterPercentBar value={vmDiskPct(vm)} />
                            {vmDiskPct(vm) != null ? (
                              <p className="whitespace-nowrap text-[11px] text-slate-500">
                                {vm.diskUsagePercent!.toFixed(1)}%
                              </p>
                            ) : (
                              <p className="text-[11px] text-slate-400">—</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap align-top text-xs text-slate-700">
                          {formatSpec(vm)}
                        </TableCell>
                        <TableCell className="max-w-[140px] align-top font-mono text-xs text-slate-700">
                          <span className="block truncate" title={vm.ip || ""}>
                            {vm.ip || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[160px] align-top text-xs text-slate-600">
                          <span className="line-clamp-2 break-all" title={vm.guestId}>
                            {vm.guestId || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <Button variant="ghost" size="sm" className="h-8 gap-0.5 px-2" asChild>
                            <Link to={vmDetailPath(vm.moref)}>
                              详情
                              <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                    })}
                  </TableBody>
                </Table>
              </div>
              </div>
            </>
          )}
        </>
      )}

      <Dialog open={lanTopologyOpen} onOpenChange={setLanTopologyOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden border-slate-200 p-0 sm:max-w-4xl">
          <DialogHeader className="border-b border-slate-100 px-6 py-4 text-left">
            <DialogTitle className="text-base font-semibold text-slate-900">
              爱快 LAN 客户端（Prometheus / ikuai_exporter）
            </DialogTitle>
            {ikuaiStreamQ.data?.note && (
              <p className="pt-1 text-xs font-normal text-slate-500">{ikuaiStreamQ.data.note}</p>
            )}
            {ikuaiStreamQ.isError && (
              <p className="pt-1 text-xs font-normal text-red-600">
                {(ikuaiStreamQ.error as Error)?.message ?? "请求失败"}
              </p>
            )}
          </DialogHeader>
          <div className="max-h-[calc(85vh-7rem)] overflow-auto px-6 pb-6">
            {ikuaiStreamQ.isLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">加载中…</p>
            ) : ikuaiStreamQ.data?.prometheusConfigured === false ? (
              <p className="py-8 text-center text-sm text-slate-500">
                未配置 Prometheus（请填写 prometheusUrlVcenter 或兜底 prometheusUrl）。
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="text-slate-800">IP</TableHead>
                    <TableHead className="text-slate-800">主机名</TableHead>
                    <TableHead className="text-slate-800">备注</TableHead>
                    <TableHead className="font-mono text-slate-800">MAC</TableHead>
                    <TableHead className="text-slate-800">类型</TableHead>
                    <TableHead className="text-right text-slate-800">下行</TableHead>
                    <TableHead className="text-right text-slate-800">上行</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(ikuaiStreamQ.data?.devices ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-slate-500">
                        暂无设备行（或 exporter 未返回 ip_addr 标签）。
                      </TableCell>
                    </TableRow>
                  ) : (
                    (ikuaiStreamQ.data?.devices ?? []).map((d) => (
                      <TableRow key={d.ip} className="border-slate-100">
                        <TableCell className="font-mono text-xs text-slate-800">{d.ip}</TableCell>
                        <TableCell className="max-w-[140px] truncate text-xs" title={d.hostname}>
                          {safeDecodeIkuaiLabel(d.hostname || "") || "—"}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate text-xs" title={d.comment}>
                          {d.comment || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-slate-600">
                          {d.mac || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{d.clientType || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-slate-800">
                          {formatIkuaiLanCell(d.download, ikuaiStreamQ.data?.exporterKind)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-slate-800">
                          {formatIkuaiLanCell(d.upload, ikuaiStreamQ.data?.exporterKind)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VCenterList;
