import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ChevronLeft, Loader2, Ship } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGetJson, type HarborAdminDashboardResponse } from "@/lib/api";
import { describeSitePath } from "@/lib/site-path-descriptions";
import { formatHarborStatCell } from "@/lib/harbor-stat-format";

type SiteStatsResponse = {
  startedAt?: string;
  totalHttpRequests?: number;
  topPaths?: { path: string; count: number }[];
  topClientIPs?: { ip: string; count: number }[];
  loginFailsByIP?: { ip: string; count: number }[];
  totalLoginFailIPs?: number;
  note?: string;
};

export default function SiteStats() {
  const { status } = useAuth();
  const q = useQuery({
    queryKey: ["audit-site-stats"],
    queryFn: ({ signal }) => apiGetJson<SiteStatsResponse>("/api/audit/site-stats", { signal }),
    enabled: status?.role === "admin",
    staleTime: 20_000,
  });

  const harborQ = useQuery({
    queryKey: ["audit-harbor-dashboard"],
    queryFn: ({ signal }) => apiGetJson<HarborAdminDashboardResponse>("/api/audit/harbor-dashboard", { signal }),
    enabled: status?.role === "admin",
    staleTime: 15_000,
  });

  if (status?.role !== "admin") {
    return <Navigate to="/account/settings" replace />;
  }

  const d = q.data;
  const hp = harborQ.data?.platform;
  const remote = harborQ.data?.remoteStatistics;
  const remoteProj =
    remote && typeof remote === "object" && "total_project_count" in remote
      ? remote.total_project_count
      : undefined;
  const remoteRepo =
    remote && typeof remote === "object" && "total_repo_count" in remote ? remote.total_repo_count : undefined;
  const hits = hp?.cacheHits ?? 0;
  const misses = hp?.cacheMisses ?? 0;
  const ratioDenom = hits + misses;
  const hitRatio = ratioDenom > 0 ? ((100 * hits) / ratioDenom).toFixed(1) : null;

  return (
    <div className="mx-auto w-full max-w-[min(100%,72rem)] pb-12">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="gap-1">
          <Link to="/account/audit">
            <ChevronLeft className="h-4 w-4" />
            平台审计
          </Link>
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-5 py-6 shadow-sm sm:px-8">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-slate-900">站点统计</h1>
            <p className="mt-1 text-sm text-slate-600">
              进程内自启动以来累计（重启清零）。含 HTTP 请求量、路径与客户端 IP 分布、登录失败按 IP 汇总。
            </p>
            {d?.note ? <p className="mt-2 text-xs text-slate-500">{d.note}</p> : null}
          </div>
        </div>
      </div>

      {q.isLoading ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中…
        </p>
      ) : q.isError ? (
        <p className="mt-8 text-sm text-red-600">{(q.error as Error).message}</p>
      ) : (
        <div className="mt-8 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">累计 HTTP 请求（进程内）</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {d?.totalHttpRequests ?? 0}
              </p>
              {d?.startedAt ? (
                <p className="mt-1 text-[11px] text-slate-500">自 {new Date(d.startedAt).toLocaleString()}</p>
              ) : null}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">登录失败 IP 数（进程内）</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {d?.totalLoginFailIPs ?? 0}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">访问最多的路径（Top 30）</h2>
            <ul className="mt-3 max-h-[360px] space-y-2 overflow-y-auto text-[11px] text-slate-700">
              {(d?.topPaths ?? []).map((row, i) => (
                <li key={`${row.path}-${i}`} className="border-b border-slate-50 pb-2">
                  <div className="flex justify-between gap-2 font-mono">
                    <span className="min-w-0 break-all">{row.path}</span>
                    <span className="shrink-0 tabular-nums text-slate-500">{row.count}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                    {describeSitePath(row.path)}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">访问最多的客户端 IP</h2>
              <ul className="mt-3 max-h-[280px] space-y-1.5 overflow-y-auto font-mono text-[11px] text-slate-700">
                {(d?.topClientIPs ?? []).map((row, i) => (
                  <li key={`${row.ip}-${i}`} className="flex justify-between gap-2 border-b border-slate-50 pb-1">
                    <span>{row.ip}</span>
                    <span className="tabular-nums text-slate-500">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">登录失败最多的 IP</h2>
              <ul className="mt-3 max-h-[280px] space-y-1.5 overflow-y-auto font-mono text-[11px] text-slate-700">
                {(d?.loginFailsByIP ?? []).map((row, i) => (
                  <li key={`${row.ip}-${i}`} className="flex justify-between gap-2 border-b border-slate-50 pb-1">
                    <span>{row.ip}</span>
                    <span className="tabular-nums text-slate-500">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <section id="harbor-platform" className="mt-12 scroll-mt-24">
        <div className="rounded-2xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50/90 via-white to-sky-50/40 px-5 py-6 shadow-sm sm:px-8">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white">
              <Ship className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-slate-900">Harbor 统计与日志</h2>
              <p className="mt-1 text-sm text-slate-600">进程内代理指标、缓存命中率与最近访问记录。</p>
            </div>
          </div>
        </div>

        {harborQ.isLoading ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载 Harbor 面板…
          </p>
        ) : harborQ.isError ? (
          <p className="mt-6 text-sm text-red-600">{(harborQ.error as Error).message}</p>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">Harbor 代理请求（进程内）</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{hp?.harborProxyCalls ?? 0}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">Redis 缓存命中 / 未命中</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                  {hits} / {misses}
                </p>
                {hitRatio != null ? (
                  <p className="mt-1 text-[11px] text-slate-500">命中率 {hitRatio}%（仅统计启用 Redis 缓存的路径）</p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-500">尚无缓存样本</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">Harbor 列表 / 统计（Redis）</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{hp?.cacheTtlSec ?? 0}s</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {hp?.harborListCacheEnabled
                    ? "已写入 Redis"
                    : hp?.redisAvailable
                      ? "未启用（TTL=0）"
                      : "未连接 Redis"}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">单条缓存上限 {hp?.cacheMaxBodyMB ?? "—"} MB</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">缓存世代 / 已配置 Harbor</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{hp?.cacheGeneration ?? 0}</p>
                <p className="mt-1 text-[11px] text-slate-500">{hp?.harborConfigured ? "凭据已填" : "未配置"}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Harbor 全局统计</h3>
                {harborQ.data?.remoteStatisticsFallback ? (
                  <Badge variant="outline" className="border-slate-200 text-[10px] font-normal text-slate-600">
                    项目列表汇总
                  </Badge>
                ) : null}
              </div>
              {!hp?.harborConfigured ? (
                <p className="mt-3 text-sm text-amber-800">运行时未配置 Harbor，无远端汇总。</p>
              ) : harborQ.data?.remoteError && remoteProj === undefined && remoteRepo === undefined ? (
                <p className="mt-3 text-sm text-red-700">{harborQ.data.remoteError}</p>
              ) : remoteProj === undefined && remoteRepo === undefined ? (
                <p className="mt-3 text-sm text-slate-500">无数据。</p>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                    <p className="text-[11px] font-medium text-slate-500">项目总数</p>
                    <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900">
                      {formatHarborStatCell(remoteProj)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                    <p className="text-[11px] font-medium text-slate-500">镜像仓库</p>
                    <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-slate-900">
                      {formatHarborStatCell(remoteRepo)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Harbor 访问日志（最近 {harborQ.data?.logs?.length ?? 0} 条）</h3>
              <p className="mt-1 text-xs text-slate-500">进程内环形缓冲，服务重启后清空；含项目/仓库/制品列表与 statistics 代理。</p>
              <div className="mt-3 max-h-[min(70vh,520px)] overflow-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-2 font-medium">时间</th>
                      <th className="py-2 pr-2 font-medium">用户</th>
                      <th className="py-2 pr-2 font-medium">API</th>
                      <th className="py-2 pr-2 font-medium">Harbor 路径</th>
                      <th className="py-2 pr-2 font-medium">状态</th>
                      <th className="py-2 pr-2 font-medium">耗时</th>
                      <th className="py-2 font-medium">缓存</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-800">
                    {(harborQ.data?.logs ?? []).map((row, i) => (
                      <tr key={`${row.ts}-${i}`} className="border-b border-slate-50 align-top">
                        <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums text-slate-500">
                          {row.ts ? new Date(row.ts).toLocaleString() : "—"}
                        </td>
                        <td className="max-w-[100px] truncate py-1.5 pr-2 font-mono text-[10px]">{row.user || "—"}</td>
                        <td className="max-w-[140px] truncate py-1.5 pr-2 font-mono text-[10px]" title={row.apiRoute}>
                          {row.apiRoute || "—"}
                        </td>
                        <td className="max-w-[min(240px,28vw)] truncate py-1.5 pr-2 font-mono text-[10px]" title={row.harborPath}>
                          {row.harborPath || "—"}
                        </td>
                        <td className="py-1.5 pr-2 tabular-nums">{row.status ?? "—"}</td>
                        <td className="py-1.5 pr-2 tabular-nums">{row.durationMs != null ? `${row.durationMs}ms` : "—"}</td>
                        <td className="py-1.5">
                          {row.fromCache ? (
                            <Badge className="border-0 bg-emerald-100 text-[10px] font-normal text-emerald-900">命中</Badge>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(harborQ.data?.logs ?? []).length === 0 ? (
                  <p className="mt-4 text-center text-sm text-slate-500">暂无记录（打开「集群 → Harbor 仓库」后会在此累积）</p>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
