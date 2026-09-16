import React from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, ChevronRight, FolderTree, Layers, RefreshCw, Server, WifiOff } from "lucide-react";
import { apiGetJson, ApiHttpError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ClusterPrometheusPanel from "./ClusterPrometheusPanel";
import ClusterOverviewPodsWorkloadPanel from "./ClusterOverviewPodsWorkloadPanel";
import { podDetailHref, podPhaseBadgeClass } from "./podPhaseStyle";
import type { K8sAnomalyPod, K8sSummary } from "./types";

function MetricCell({
  label,
  value,
  danger,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-100/90 bg-white px-3 py-3 text-center shadow-[0_4px_24px_-8px_rgba(15,23,42,0.08)] dark:border-slate-700/80 dark:bg-slate-950/70 dark:shadow-none",
        danger && "border-amber-200/90 bg-amber-50/80 shadow-[0_4px_20px_-8px_rgba(245,158,11,0.25)] dark:border-amber-900/50 dark:bg-amber-950/30"
      )}
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">{value}</div>
    </div>
  );
}

const ClusterOverview: React.FC = () => {
  const qc = useQueryClient();
  const summaryQ = useQuery({
    queryKey: ["k8s-summary"],
    queryFn: ({ signal }) => apiGetJson<K8sSummary>("/api/k8s/summary", { signal }),
    retry: 1,
  });

  const s = summaryQ.data;
  const anomalies: K8sAnomalyPod[] = s?.anomalyPods ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-100/90 bg-white/95 p-5 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.1)] dark:border-slate-700/80 dark:bg-slate-950/75 dark:shadow-none sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Kubernetes</p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl">集群概览</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              连接状态、资源计数、异常 Pod 与「重启 + 资源」合并视图；下方可展开 Prometheus 详情。
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-10 gap-2 rounded-xl border-0 bg-blue-600 px-4 font-semibold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700"
            disabled={summaryQ.isFetching}
            onClick={() => void qc.invalidateQueries({ queryKey: ["k8s-summary"] })}
          >
            <RefreshCw className={cn("h-4 w-4", summaryQ.isFetching && "animate-spin")} />
            刷新摘要
          </Button>
        </div>
      </div>

      {summaryQ.isLoading && (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-8 text-center text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-400">
          加载中…
        </p>
      )}

      {summaryQ.isError && (() => {
        const err = summaryQ.error;
        const serverMsg =
          err instanceof ApiHttpError ? err.serverMessage : (err as Error).message;
        const is503 = err instanceof ApiHttpError && err.status === 503;
        return (
          <Card className="border-red-200/90 bg-red-50/90 dark:border-red-900/50 dark:bg-red-950/35">
            <CardContent className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
              <div className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-950/60">
                  <WifiOff className="h-5 w-5 text-red-600 dark:text-red-400" />
                </span>
                <div>
                  <p className="font-medium text-red-950 dark:text-red-100">
                    {is503 ? "K8s API 不可用" : "加载失败"}
                  </p>
                  <p className="mt-1 text-sm text-red-800/90 dark:text-red-200/80">{serverMsg}</p>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" className="h-9" asChild>
                <Link to="/cluster/settings">集群设置</Link>
              </Button>
            </CardContent>
          </Card>
        );
      })()}

      {s && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            {/* 集群态 */}
            <Card className="gap-0 overflow-hidden rounded-3xl border-slate-100/90 bg-white py-0 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.08)] lg:col-span-2 dark:border-slate-700/80 dark:bg-slate-950/70 dark:shadow-none">
              <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-slate-100/80 bg-slate-50/40 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm dark:bg-blue-950/50 dark:text-blue-300">
                    <Server className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <CardTitle className="text-base">集群</CardTitle>
                    <p className="text-xs text-muted-foreground">核心资源计数</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="h-9 gap-0.5 rounded-xl text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" asChild>
                  <Link to="/cluster/nodes">
                    节点
                    <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-5">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <MetricCell label="命名空间" value={s.namespaceCount} />
                  <MetricCell label="Pod" value={s.podCount} />
                  <MetricCell label="Service" value={s.serviceCount} />
                  <MetricCell label="节点" value={s.nodeCount} />
                  <MetricCell label="Running" value={s.podsRunning ?? "—"} />
                  <MetricCell label="Failed" value={s.podsFailed ?? 0} danger={(s.podsFailed ?? 0) > 0} />
                  <MetricCell label="Pending" value={s.podsPending ?? 0} danger={(s.podsPending ?? 0) > 0} />
                  <MetricCell label="CrashLoop" value={s.podsCrashLoop ?? 0} danger={(s.podsCrashLoop ?? 0) > 0} />
                </div>
                {(s.nodesNotReady ?? 0) > 0 ? (
                  <p className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100/90">
                    NotReady 节点 {s.nodesNotReady} ·{" "}
                    <Link to="/cluster/nodes" className="font-medium text-primary underline-offset-2 hover:underline">
                      查看节点
                    </Link>
                  </p>
                ) : null}
              </CardContent>
              <CardFooter className="justify-end border-t border-slate-100/80 bg-slate-50/30 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/30">
                <Button variant="link" size="sm" className="h-auto p-0 text-xs font-semibold text-blue-600 dark:text-blue-400" asChild>
                  <Link to="/cluster/settings">Prometheus / 凭据等集群设置</Link>
                </Button>
              </CardFooter>
            </Card>

            {/* 命名空间 */}
            <Card className="gap-0 overflow-hidden rounded-3xl border-slate-100/90 bg-white py-0 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.08)] dark:border-slate-700/80 dark:bg-slate-950/70 dark:shadow-none">
              <CardHeader className="border-b border-slate-100/80 bg-slate-50/40 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 shadow-sm dark:bg-sky-950/50 dark:text-sky-300">
                    <FolderTree className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <CardTitle className="text-base">命名空间</CardTitle>
                    <p className="text-xs text-muted-foreground">按 NS 浏览工作负载</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between px-5 py-6">
                <div>
                  <p className="text-4xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">{s.namespaceCount}</p>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">命名空间总数</p>
                </div>
                <Button
                  size="sm"
                  className="mt-6 h-10 w-full gap-1.5 rounded-xl border-0 bg-blue-600 font-semibold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700"
                  asChild
                >
                  <Link to="/cluster/ns">
                    <Layers className="h-4 w-4" />
                    进入命名空间
                    <ChevronRight className="h-3.5 w-3.5 opacity-90" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* 异常 Pod */}
          <Card className="gap-0 overflow-hidden rounded-3xl border-slate-100/90 bg-white py-0 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.08)] dark:border-slate-700/80 dark:bg-slate-950/70 dark:shadow-none">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 border-b border-slate-100/80 bg-slate-50/40 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 shadow-sm dark:bg-rose-950/50 dark:text-rose-300">
                  <Box className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <CardTitle className="text-base">异常 Pod</CardTitle>
                  <p className="text-xs text-muted-foreground">Failed / Pending / Unknown / CrashLoop</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg border-slate-200 bg-white text-xs text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900/50 dark:hover:bg-slate-800"
                  asChild
                >
                  <Link to="/cluster/pods">全部</Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg border-slate-200 bg-white text-xs text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900/50 dark:hover:bg-slate-800"
                  asChild
                >
                  <Link to="/cluster/pods?phase=Failed">Failed</Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg border-slate-200 bg-white text-xs text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900/50 dark:hover:bg-slate-800"
                  asChild
                >
                  <Link to="/cluster/pods?phase=Pending">Pending</Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg border-slate-200 bg-white text-xs text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900/50 dark:hover:bg-slate-800"
                  asChild
                >
                  <Link to="/cluster/pods?problem=crashloop">CrashLoop</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0 pt-0">
              {anomalies.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">暂无异常 Pod</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-4 text-xs font-medium text-muted-foreground">命名空间</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">名称</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">阶段</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">原因</TableHead>
                        <TableHead className="w-14 pr-4 text-right text-xs font-medium text-muted-foreground" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {anomalies.map((p) => (
                        <TableRow key={`${p.namespace}/${p.name}`} className="border-slate-100/80 hover:bg-slate-50/80 dark:border-slate-800/80 dark:hover:bg-slate-900/40">
                          <TableCell className="max-w-[140px] truncate pl-4 font-mono text-xs">{p.namespace}</TableCell>
                          <TableCell className="max-w-[200px] truncate font-mono text-xs">
                            <Link
                              to={podDetailHref(p.namespace, p.name)}
                              className="font-medium text-primary hover:underline"
                            >
                              {p.name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium",
                                podPhaseBadgeClass(p.phase)
                              )}
                            >
                              {p.phase}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={p.reason}>
                            {p.reason ?? "—"}
                          </TableCell>
                          <TableCell className="pr-4 text-right">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
                              <Link to={podDetailHref(p.namespace, p.name)}>详情</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {anomalies.length > 0 ? (
                <p className="border-t border-slate-100/80 bg-slate-50/40 px-5 py-2.5 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900/25 dark:text-slate-400">
                  最多展示 48 条；更多请用上方快捷入口或 Pod 列表。
                </p>
              ) : null}
            </CardContent>
          </Card>

          <ClusterOverviewPodsWorkloadPanel />
        </>
      )}

      <div className="pt-1">
        <ClusterPrometheusPanel compactIntro />
      </div>
    </div>
  );
};

export default ClusterOverview;
