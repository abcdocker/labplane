import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { apiGetJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { VCenterHostRow, VCenterHostsResponse } from "./types";
import { VCenterPercentBar } from "./VCenterPercentBar";

function hostDetailPath(moref: string): string {
  return `/cluster/vcenter/hosts/${encodeURIComponent(moref)}`;
}

function formatUptime(sec: number | undefined): string {
  const up = sec ?? 0;
  if (up <= 0) return "—";
  const days = Math.floor(up / 86400);
  const hrs = Math.floor((up % 86400) / 3600);
  if (days > 0) return `${days} 天 ${hrs} 小时`;
  return `${Math.floor(up / 60)} 分钟`;
}

function connectionLabel(state: string | undefined): string {
  const s = (state ?? "").trim();
  if (!s) return "未知";
  if (s.toLowerCase() === "connected") return "已连接";
  if (s.toLowerCase() === "disconnected") return "未连接";
  if (s.toLowerCase() === "notresponding") return "无响应";
  return s;
}

function HostStatusBadge({ connectionState }: { connectionState?: string }) {
  const s = (connectionState ?? "").toLowerCase();
  const ok = s === "connected";
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 font-normal",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-900"
      )}
    >
      {connectionLabel(connectionState)}
    </Badge>
  );
}

function HostCard({ h }: { h: VCenterHostRow }) {
  const up = formatUptime(h.uptimeSec);
  const hwLine = [h.vendor, h.model].filter(Boolean).join(" · ");

  return (
    <Card className="flex flex-col overflow-hidden border-slate-200/90 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="space-y-3 border-b border-slate-100 bg-gradient-to-br from-slate-50/80 to-white pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
            <Server className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <HostStatusBadge connectionState={h.connectionState} />
              {h.overallStatus && (
                <span className="text-[11px] text-slate-500" title="整体状态">
                  {h.overallStatus}
                </span>
              )}
            </div>
            <p
              className="line-clamp-2 break-words text-sm font-semibold leading-snug text-slate-900"
              title={h.name}
            >
              {h.name || "（未命名主机）"}
            </p>
            <p
              className="font-mono text-[11px] leading-tight text-slate-500"
              title="vCenter 主机标识，用于跳转详情"
            >
              主机 ID · {h.moref}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-500">CPU</p>
            <p className="mt-1 tabular-nums font-medium text-slate-800">
              {h.cpuCores ?? "—"} 核
            </p>
            <div className="mt-2">
              <VCenterPercentBar value={h.cpuUsagePercent ?? 0} />
              <p className="mt-1 tabular-nums text-[11px] text-slate-500">
                {h.cpuUsageMHz ?? 0} / {h.cpuCapacityMHz ?? 0} MHz
              </p>
            </div>
          </div>
          <div>
            <p className="text-slate-500">内存</p>
            <div className="mt-2">
              <VCenterPercentBar value={h.memoryUsagePercent ?? 0} />
              <p className="mt-1 tabular-nums text-[11px] text-slate-500">
                {h.memoryUsageMB ?? 0} / {h.memoryTotalMB ?? 0} MB
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-lg bg-slate-50/90 px-3 py-2 text-[11px] text-slate-600">
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">运行时间</span>
            <span className="tabular-nums text-slate-800">{up}</span>
          </div>
          {hwLine ? (
            <div className="mt-1.5 truncate border-t border-slate-200/80 pt-1.5 text-slate-500" title={hwLine}>
              {hwLine}
            </div>
          ) : null}
          {h.esxiVersion ? (
            <div className="mt-1 truncate text-slate-500" title={h.esxiVersion}>
              {h.esxiVersion}
            </div>
          ) : null}
        </div>
      </CardContent>
      <CardFooter className="border-t border-slate-100 bg-slate-50/50 p-3">
        <Button
          className="w-full gap-1"
          variant="secondary"
          asChild
        >
          <Link to={hostDetailPath(h.moref)}>
            查看详情与硬件信息
            <ChevronRight className="h-4 w-4 opacity-70" aria-hidden />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

const VCenterHosts: React.FC = () => {
  const statusQ = useQuery({
    queryKey: ["vcenter-status"],
    queryFn: ({ signal }) =>
      apiGetJson<{ configured: boolean; vcenterUrlHint?: string }>("/api/vcenter/status", { signal }),
  });

  const hostsQ = useQuery({
    queryKey: ["vcenter-hosts"],
    queryFn: ({ signal }) => apiGetJson<VCenterHostsResponse>("/api/vcenter/hosts", { signal }),
    enabled: statusQ.data?.configured === true,
  });

  const hosts = hostsQ.data?.hosts ?? [];
  const connected = hosts.filter(
    (h) => (h.connectionState ?? "").toLowerCase() === "connected"
  ).length;

  if (statusQ.isLoading) {
    return <p className="text-slate-500">加载中…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">宿主机</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            物理 ESXi 主机资源与连接状态。名称可能含表情或长文本，请使用卡片底部按钮「查看详情」进入（按主机 ID 跳转，不依赖名称）。
          </p>
        </div>
        {hostsQ.data && hosts.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm">
            <span className="text-slate-500">共计</span>
            <span className="font-semibold tabular-nums text-slate-900">{hosts.length}</span>
            <span className="text-slate-500">台</span>
            <span className="mx-1 text-slate-300">|</span>
            <span className="text-slate-500">已连接</span>
            <span className="font-semibold tabular-nums text-emerald-700">{connected}</span>
          </div>
        )}
      </div>

      {statusQ.data?.vcenterUrlHint && (
        <p className="text-sm text-slate-500">vCenter：{statusQ.data.vcenterUrlHint}</p>
      )}

      {hostsQ.isLoading && <p className="text-slate-500">加载宿主机列表…</p>}
      {hostsQ.error && (
        <p className="text-red-600">{(hostsQ.error as Error).message}</p>
      )}

      {hostsQ.data && (
        <>
          {hosts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center text-sm text-slate-500">
              未发现宿主机（或当前账号无权限）。
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {hosts.map((h) => (
                <HostCard key={h.moref} h={h} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VCenterHosts;
