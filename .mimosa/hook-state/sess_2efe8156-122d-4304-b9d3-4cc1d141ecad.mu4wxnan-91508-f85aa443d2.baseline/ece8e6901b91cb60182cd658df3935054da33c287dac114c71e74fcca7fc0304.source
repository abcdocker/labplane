import React, { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, FileText, Loader2 } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGetJson, type AuditLogsResponse, type AuditRecord, type AuditSummaryResponse } from "@/lib/api";
import {
  auditModuleBadgeClass,
  auditModuleLabel,
  formatAuditTime,
  formatAuditTitle,
} from "@/lib/audit-display";
import { cn } from "@/lib/utils";

type Tab = "all" | "auth" | "k8s" | "vcenter" | "appcenter" | "baota" | "other";

function rowTab(r: AuditRecord): Tab {
  const a = r.action || "";
  if (a === "login_ok" || a === "login_fail" || a === "logout" || a === "security_ip_ban" || a === "security_probe")
    return "auth";
  const p = r.path || "";
  if (p.includes("/k8s/") || p.includes("/ingress/")) return "k8s";
  if (p.includes("/vcenter/")) return "vcenter";
  if (p.includes("/app-center/") || p.includes("/app-center")) return "appcenter";
  if (p.includes("/baota") || p.includes("baota")) return "baota";
  if (p.includes("/settings/runtime") || p.includes("/admin/") || p.includes("/cloud-hosts")) return "other";
  return "other";
}

export default function PlatformAudit() {
  const { status } = useAuth();
  const [tab, setTab] = useState<Tab>("all");

  const q = useQuery({
    queryKey: ["audit-logs-full"],
    queryFn: ({ signal }) => apiGetJson<AuditLogsResponse>("/api/audit/logs?limit=20000", { signal }),
    enabled: status?.role === "admin",
    staleTime: 30_000,
  });

  const summaryQ = useQuery({
    queryKey: ["audit-summary"],
    queryFn: ({ signal }) => apiGetJson<AuditSummaryResponse>("/api/audit/summary", { signal }),
    enabled: status?.role === "admin",
    staleTime: 15_000,
  });

  const filtered = useMemo(() => {
    const logs = q.data?.logs ?? [];
    if (tab === "all") return logs;
    return logs.filter((r) => rowTab(r) === tab);
  }, [q.data?.logs, tab]);

  if (status?.role !== "admin") {
    return <Navigate to="/account/settings" replace />;
  }

  return (
    <div className="mx-auto w-full max-w-[min(100%,72rem)] pb-12">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link to="/account/settings">
            <ChevronLeft className="h-4 w-4" />
            账户与平台
          </Link>
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-5 py-6 shadow-sm sm:px-8">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-slate-900">平台审计</h1>
            <p className="mt-1 text-sm text-slate-600">
              汇总登录、配置变更与资源操作（不含 Prometheus 自动查询）。服务端{" "}
              <code className="rounded bg-slate-100 px-1 text-xs">audit.jsonl</code>，默认保留{" "}
              {q.data?.retentionDays ?? 30} 天并定时裁剪。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/account/site-stats"
                className="inline-flex items-center rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-900 hover:bg-teal-100"
              >
                站点统计
              </Link>
              <Link
                to="/account/site-stats#harbor-platform"
                className="inline-flex items-center rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-900 hover:bg-cyan-100"
              >
                Harbor 统计与日志
              </Link>
            </div>
            {summaryQ.data ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                  <span className="text-slate-500">活跃会话槽</span>
                  <p className="font-mono text-sm font-semibold text-slate-900">
                    {summaryQ.data.activeSessionNonceCount ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                  <span className="text-slate-500">审计文件大小</span>
                  <p className="font-mono text-sm font-semibold text-slate-900">
                    {summaryQ.data.auditFileBytes != null
                      ? `${(summaryQ.data.auditFileBytes / 1024).toFixed(1)} KB`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                  <span className="text-slate-500">保留策略</span>
                  <p className="font-mono text-sm font-semibold text-slate-900">
                    {summaryQ.data.auditRetentionDays ?? 30} 天
                  </p>
                </div>
              </div>
            ) : summaryQ.isLoading ? (
              <p className="mt-3 text-xs text-slate-500">加载摘要…</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Select value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="筛选模块" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部模块</SelectItem>
            <SelectItem value="auth">登录与安全</SelectItem>
            <SelectItem value="k8s">Kubernetes / Ingress</SelectItem>
            <SelectItem value="vcenter">vCenter / 虚拟机</SelectItem>
            <SelectItem value="appcenter">应用中心</SelectItem>
            <SelectItem value="baota">宝塔</SelectItem>
            <SelectItem value="other">平台 / 运行时 / 其他</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500">
          共 <span className="font-mono font-medium text-slate-800">{filtered.length}</span> 条
        </p>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {q.isLoading ? (
          <p className="flex items-center gap-2 p-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载审计记录…
          </p>
        ) : q.isError ? (
          <p className="p-8 text-sm text-red-600">{(q.error as Error).message}</p>
        ) : filtered.length === 0 ? (
          <p className="p-8 text-sm text-slate-500">该分类下暂无记录</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {[...filtered].reverse().map((row, i) => (
              <li key={`${row.ts}-${i}`} className="px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug text-slate-900">{formatAuditTitle(row)}</p>
                    {row.detail ? (
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{row.detail}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span className="tabular-nums">{formatAuditTime(row.ts)}</span>
                      {row.user ? (
                        <>
                          <span className="text-slate-300">·</span>
                          <span>用户 {row.user}</span>
                        </>
                      ) : null}
                      {row.ip ? (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono">{row.ip}</span>
                        </>
                      ) : null}
                      {row.action === "api" && row.status ? (
                        <>
                          <span className="text-slate-300">·</span>
                          <span>HTTP {row.status}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 border font-normal", auditModuleBadgeClass(auditModuleLabel(row)))}
                  >
                    {auditModuleLabel(row)}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
