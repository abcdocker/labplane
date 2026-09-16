import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, ChevronRight, FileText, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { YamlEditor } from "@/components/YamlEditor";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiDelete, apiGetJson, apiPostJson } from "@/lib/api";
import { extractErrorMessage } from "@/lib/extract-error-message";
import type { PodRow, PodsMetricsPayload } from "./types";
import { parseAge } from "./parseAge";
import { podDetailHref, podPhaseBadgeClass } from "./podPhaseStyle";
import PodLogsSheet from "./PodLogsSheet";
import { cn } from "@/lib/utils";
import { formatCpuCores, formatMemBytes } from "@/lib/k8s-metrics-format";

function podMetricKey(p: PodRow): string {
  return `${p.namespace}/${p.name}`;
}

/** 列表「申请」列：紧凑 CPU */
function fmtReqCpuMilli(m: number | undefined): string {
  if (m == null || !Number.isFinite(m) || m <= 0) return "—";
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(2)}c`;
}

/** 列表「申请」列：紧凑内存 */
function fmtReqMemCompact(bytes: number | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "—";
  const g = bytes / 1024 ** 3;
  if (g >= 1) return `${g.toFixed(2)}g`;
  return `${(bytes / 1024 ** 2).toFixed(0)}m`;
}

function alignCpuPct(useCores: number | undefined, reqMilli: number | undefined): string {
  if (reqMilli == null || reqMilli <= 0 || useCores == null || !Number.isFinite(useCores)) return "—";
  const r = useCores / (reqMilli / 1000);
  return `${Math.round(r * 100)}%`;
}

function alignMemPct(useBytes: number | undefined, reqBytes: number | undefined): string {
  if (reqBytes == null || reqBytes <= 0 || useBytes == null || !Number.isFinite(useBytes)) return "—";
  return `${Math.round((useBytes / reqBytes) * 100)}%`;
}

export type PodListBlockProps = {
  namespace: string;
  /** 为 true 时列出全集群 Pod（不传 namespace 查询参数） */
  allNamespaces?: boolean;
  /** 全集群列表使用卡片（参考宿主机列表）；命名空间内仍为表格 */
  layout?: "table" | "cards";
  /** 非空时按 selector 过滤 */
  labelSelector?: string;
  /** 与 K8s Pod phase 一致，如 Pending、Failed */
  phaseFilter?: string;
  /** 当前支持 crashloop（容器 Waiting=CrashLoopBackOff） */
  problemFilter?: string;
  /** 是否显示 Pod 页顶栏（标题与说明） */
  showPageHeader?: boolean;
  /** 是否显示「已从 Deployment/StatefulSet 筛选」提示条 */
  showLabelFilterBanner?: boolean;
  /** 是否显示「应用 YAML」创建 Pod */
  showCreateYamlButton?: boolean;
};

function PodCard({
  p,
  cpuText,
  memText,
  reqCpuMemText,
  alignCpuMemText,
  onLog,
  onEditYaml,
  onDelete,
}: {
  p: PodRow;
  cpuText: string;
  memText: string;
  reqCpuMemText: string;
  alignCpuMemText: string;
  onLog: () => void;
  onEditYaml: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="flex flex-col overflow-hidden border-slate-200/90 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="space-y-3 border-b border-slate-100 bg-gradient-to-br from-slate-50/80 to-white pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <Box className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn("shrink-0 border font-normal", podPhaseBadgeClass(p.phase))}
              >
                {p.phase}
              </Badge>
              <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                {p.namespace}
              </span>
            </div>
            <p
              className="line-clamp-2 break-words text-sm font-semibold leading-snug text-slate-900"
              title={p.name}
            >
              {p.name}
            </p>
            <p className="font-mono text-[11px] leading-tight text-slate-500" title="所属命名空间">
              命名空间 · {p.namespace}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 pt-4">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-500">节点</p>
            <p className="mt-1 font-mono text-[12px] font-medium text-slate-800">{p.node}</p>
          </div>
          <div>
            <p className="text-slate-500">重启 / Age</p>
            <p className="mt-1 tabular-nums text-slate-800">
              {p.restarts} · {parseAge(p.age)}
            </p>
          </div>
          <div>
            <p className="text-slate-500">CPU（核）</p>
            <p className="mt-1 font-mono tabular-nums text-[12px] text-slate-800">{cpuText}</p>
          </div>
          <div>
            <p className="text-slate-500">内存</p>
            <p className="mt-1 font-mono tabular-nums text-[12px] text-slate-800">{memText}</p>
          </div>
          <div className="col-span-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
            <p className="text-[10px] font-medium text-slate-500">申请（requests）</p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-800">{reqCpuMemText}</p>
            <p className="mt-1.5 text-[10px] font-medium text-slate-500">实际 / 申请</p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-800">{alignCpuMemText}</p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/50 p-3 sm:flex-row sm:flex-wrap">
        <Button className="w-full gap-1 sm:flex-1" variant="secondary" size="sm" asChild>
          <Link to={podDetailHref(p.namespace, p.name)}>
            查看详情
            <ChevronRight className="h-4 w-4 opacity-70" aria-hidden />
          </Link>
        </Button>
        <div className="flex w-full gap-1.5 sm:w-auto sm:flex-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 gap-1 text-xs"
            disabled={!p.firstContainer}
            title={!p.firstContainer ? "无可用容器名" : "查看 stdout/stderr"}
            onClick={onLog}
          >
            <FileText className="h-3.5 w-3.5" />
            日志
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={onEditYaml}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-red-600 hover:text-red-700"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

/**
 * Pod 列表与操作（日志 / YAML / 删除），供 Pod 页面与工作负载详情复用。
 */
export const PodListBlock: React.FC<PodListBlockProps> = ({
  namespace,
  allNamespaces = false,
  layout = "table",
  labelSelector = "",
  phaseFilter,
  problemFilter,
  showPageHeader = true,
  showLabelFilterBanner = true,
  showCreateYamlButton = true,
}) => {
  const queryClient = useQueryClient();
  const [yamlOpen, setYamlOpen] = useState(false);
  const [yamlDraft, setYamlDraft] = useState("");
  const [yamlMode, setYamlMode] = useState<"create" | "edit">("create");
  const [delTarget, setDelTarget] = useState<{ namespace: string; name: string } | null>(null);
  const [logTarget, setLogTarget] = useState<{
    namespace: string;
    name: string;
    container: string;
  } | null>(null);

  const podsQ = useQuery({
    queryKey: ["k8s-pods", allNamespaces ? "all" : namespace, labelSelector, phaseFilter ?? "", problemFilter ?? ""],
    queryFn: ({ signal }) => {
      const q = new URLSearchParams();
      if (!allNamespaces && namespace.trim()) q.set("namespace", namespace);
      if (labelSelector) q.set("labelSelector", labelSelector);
      if (phaseFilter) q.set("phase", phaseFilter);
      if (problemFilter) q.set("problem", problemFilter);
      const qs = q.toString();
      return apiGetJson<PodRow[]>(`/api/k8s/pods${qs ? `?${qs}` : ""}`, { signal });
    },
  });

  const metricsQ = useQuery({
    queryKey: ["k8s-pods-metrics", allNamespaces ? "all" : namespace, labelSelector, phaseFilter ?? "", problemFilter ?? ""],
    queryFn: ({ signal }) => {
      const q = new URLSearchParams();
      if (!allNamespaces && namespace.trim()) q.set("namespace", namespace);
      if (phaseFilter) q.set("phase", phaseFilter);
      if (problemFilter) q.set("problem", problemFilter);
      const qs = q.toString();
      return apiGetJson<PodsMetricsPayload>(`/api/k8s/pods/metrics${qs ? `?${qs}` : ""}`, { signal });
    },
    enabled: (podsQ.data?.length ?? 0) > 0,
    refetchInterval: 30_000,
  });

  const metricsPayload = metricsQ.data;
  const cpuMemForPod = (p: PodRow) => {
    if (!metricsPayload?.available || metricsQ.isError) {
      return { cpu: "—" as string, mem: "—" as string };
    }
    const k = podMetricKey(p);
    const cpu = metricsPayload.cpuCoresByPod?.[k];
    const mem = metricsPayload.memBytesByPod?.[k];
    return { cpu: formatCpuCores(cpu), mem: formatMemBytes(mem) };
  };

  const reqAlignForPod = (p: PodRow) => {
    const k = podMetricKey(p);
    const cpuUse = metricsPayload?.available && !metricsQ.isError ? metricsPayload.cpuCoresByPod?.[k] : undefined;
    const memUse = metricsPayload?.available && !metricsQ.isError ? metricsPayload.memBytesByPod?.[k] : undefined;
    const reqLine = `${fmtReqCpuMilli(p.cpuRequestMilli)} · ${fmtReqMemCompact(p.memRequestBytes)}`;
    const ac = alignCpuPct(cpuUse, p.cpuRequestMilli);
    const am = alignMemPct(memUse, p.memRequestBytes);
    const alignLine = `CPU ${ac} · Mem ${am}`;
    return { reqLine, alignLine };
  };

  const applyMut = useMutation({
    mutationFn: (yamlContent: string) =>
      apiPostJson("/api/k8s/apply-yaml", { yamlContent }),
    onSuccess: () => {
      setYamlOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["k8s-pods"] });
      void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: ({ namespace: ns, name }: { namespace: string; name: string }) =>
      apiDelete(
        `/api/k8s/objects/pod/${encodeURIComponent(ns)}/${encodeURIComponent(name)}`
      ),
    onSuccess: () => {
      setDelTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["k8s-pods"] });
      void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
    },
  });

  const openCreateYaml = () => {
    setYamlMode("create");
    setYamlDraft("");
    setYamlOpen(true);
  };

  const openEditYaml = async (ns: string, name: string) => {
    setYamlMode("edit");
    setYamlOpen(true);
    setYamlDraft("加载中…");
    try {
      const res = await apiGetJson<{ yaml: string }>(
        `/api/k8s/object-yaml?kind=${encodeURIComponent("Pod")}&namespace=${encodeURIComponent(ns)}&name=${encodeURIComponent(name)}`
      );
      setYamlDraft(res.yaml);
    } catch (e) {
      setYamlDraft(`# 加载失败: ${extractErrorMessage(e)}`);
    }
  };

  const podNs = (p: PodRow) => (allNamespaces ? p.namespace : namespace);

  const showCards = allNamespaces && layout === "cards";

  return (
    <div className="space-y-5">
      {showPageHeader && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              {allNamespaces ? "Pod（全集群）" : "Pod"}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
              {allNamespaces
                ? "所有命名空间中的 Pod，卡片展示；点击可进入详情或查看日志。"
                : "core/v1 Pod · 调度与生命周期"}
              {podsQ.data && podsQ.data.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {podsQ.data.length} 个
                </span>
              ) : null}
            </p>
          </div>
        </div>
      )}

      {showLabelFilterBanner && labelSelector && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          <p>
            已按与 Deployment / StatefulSet 一致的{" "}
            <code className="rounded bg-amber-100/80 px-1.5 py-0.5 font-mono text-xs">
              labelSelector
            </code>{" "}
            筛选：<span className="font-mono text-xs">{labelSelector}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {!allNamespaces && namespace ? (
              <Button variant="outline" size="sm" className="border-amber-300" asChild>
                <Link to={`/cluster/ns/${encodeURIComponent(namespace)}/pods`}>本命名空间全部</Link>
              </Button>
            ) : null}
            <Button variant="outline" size="sm" className="border-amber-300" asChild>
              <Link to={labelSelector ? `/cluster/pods?labelSelector=${encodeURIComponent(labelSelector)}` : "/cluster/pods"}>
                集群全部 Pod
              </Link>
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {showCreateYamlButton && (
          <Button type="button" variant="default" size="sm" className="h-10 gap-1.5" onClick={openCreateYaml}>
            <Plus className="h-3.5 w-3.5" />
            应用 YAML
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-10 gap-1.5 rounded-lg border-slate-200"
          onClick={() => {
            void podsQ.refetch();
            void queryClient.invalidateQueries({ queryKey: ["k8s-pods-metrics"] });
          }}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", podsQ.isFetching && "animate-spin")} />
          刷新
        </Button>
      </div>

      {podsQ.isLoading && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center text-sm text-slate-500">
          加载中…
        </div>
      )}
      {podsQ.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {extractErrorMessage(podsQ.error)}
        </div>
      )}

      {podsQ.data && podsQ.data.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          {labelSelector ? "当前 selector 下没有 Pod" : allNamespaces ? "集群中没有 Pod" : "该命名空间下没有 Pod"}
        </div>
      )}

      {metricsQ.isSuccess && metricsPayload && !metricsPayload.available && (
        <p className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
          {metricsPayload.hint?.trim() ||
            "未配置 prometheusUrlK8s（或兜底 prometheusUrl）时无法显示 CPU/内存；VictoriaMetrics vmselect 可填兼容 Prometheus 查询 API 的地址。"}
        </p>
      )}
      {metricsPayload?.available && metricsPayload.hint?.trim() ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">{metricsPayload.hint}</p>
      ) : null}

      {podsQ.data && podsQ.data.length > 0 && showCards && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {podsQ.data.map((p) => {
            const { cpu, mem } = cpuMemForPod(p);
            const { reqLine, alignLine } = reqAlignForPod(p);
            return (
            <PodCard
              key={`${p.namespace}/${p.name}`}
              p={p}
              cpuText={cpu}
              memText={mem}
              reqCpuMemText={reqLine}
              alignCpuMemText={alignLine}
              onLog={() =>
                p.firstContainer &&
                setLogTarget({
                  namespace: p.namespace,
                  name: p.name,
                  container: p.firstContainer,
                })
              }
              onEditYaml={() => void openEditYaml(p.namespace, p.name)}
              onDelete={() => setDelTarget({ namespace: p.namespace, name: p.name })}
            />
            );
          })}
        </div>
      )}

      {podsQ.data && podsQ.data.length > 0 && !showCards && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white px-4 py-3 sm:px-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pod 列表
            </span>
            <span className="text-[11px] text-slate-500">
              实际用量来自 Prometheus（5m rate / working_set）；申请来自 Pod spec requests；对齐列为 实际÷申请，约 30s 刷新
              {metricsQ.isFetching ? " · 拉取中…" : ""}
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 hover:bg-transparent">
                  <TableHead className="min-w-[200px] pl-5 text-xs font-semibold text-slate-500">
                    名称
                  </TableHead>
                  <TableHead className="w-[112px] text-xs font-semibold text-slate-500">阶段</TableHead>
                  <TableHead className="min-w-[140px] text-xs font-semibold text-slate-500">节点</TableHead>
                  <TableHead className="w-[72px] text-xs font-semibold text-slate-500">重启</TableHead>
                  <TableHead className="w-[100px] text-xs font-semibold text-slate-500">Age</TableHead>
                  <TableHead className="min-w-[108px] text-xs font-semibold text-slate-500" title="resources.requests 合计（工作容器）">
                    申请
                  </TableHead>
                  <TableHead className="w-[88px] text-xs font-semibold text-slate-500">CPU 实际</TableHead>
                  <TableHead className="min-w-[100px] text-xs font-semibold text-slate-500">内存实际</TableHead>
                  <TableHead className="min-w-[108px] text-xs font-semibold text-slate-500" title="Prometheus 用量 ÷ requests">
                    对齐
                  </TableHead>
                  <TableHead className="min-w-[220px] pr-5 text-right text-xs font-semibold text-slate-500">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {podsQ.data.map((p, idx) => {
                  const { cpu, mem } = cpuMemForPod(p);
                  const { reqLine, alignLine } = reqAlignForPod(p);
                  return (
                  <TableRow
                    key={`${p.namespace}/${p.name}`}
                    className={cn(
                      "group border-slate-100 transition-colors",
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/40",
                      "hover:bg-blue-50/50"
                    )}
                  >
                    <TableCell className="py-3.5 pl-5 align-middle">
                      <Link
                        to={podDetailHref(p.namespace, p.name)}
                        className="flex items-start gap-2.5"
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200/80 transition-colors group-hover:bg-blue-50 group-hover:text-blue-700 group-hover:ring-blue-100">
                          <Box className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 font-mono text-[13px] font-semibold text-slate-900 group-hover:text-blue-700">
                            {p.name}
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-slate-400">metadata.name</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="align-middle">
                      <Badge
                        variant="outline"
                        className={cn("border font-medium", podPhaseBadgeClass(p.phase))}
                      >
                        {p.phase}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-middle">
                      <span className="font-mono text-[12px] leading-snug text-slate-700">{p.node}</span>
                    </TableCell>
                    <TableCell className="align-middle tabular-nums text-sm text-slate-800">
                      {p.restarts}
                    </TableCell>
                    <TableCell className="align-middle text-xs text-slate-500">{parseAge(p.age)}</TableCell>
                    <TableCell className="align-middle font-mono text-[11px] tabular-nums leading-snug text-slate-700">
                      {reqLine}
                    </TableCell>
                    <TableCell className="align-middle font-mono text-[12px] tabular-nums text-slate-700">
                      {cpu}
                    </TableCell>
                    <TableCell className="align-middle font-mono text-[12px] tabular-nums text-slate-700">
                      {mem}
                    </TableCell>
                    <TableCell className="align-middle font-mono text-[11px] tabular-nums leading-snug text-slate-600">
                      {alignLine}
                    </TableCell>
                    <TableCell className="pr-5 text-right align-middle">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button variant="outline" size="sm" className="h-8 gap-1 border-slate-200 text-xs" asChild>
                          <Link to={podDetailHref(p.namespace, p.name)}>详情</Link>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 border-slate-200 text-xs text-slate-800"
                          disabled={!p.firstContainer}
                          title={!p.firstContainer ? "无可用容器名" : "查看 stdout/stderr"}
                          onClick={() =>
                            p.firstContainer &&
                            setLogTarget({
                              namespace: podNs(p),
                              name: p.name,
                              container: p.firstContainer,
                            })
                          }
                        >
                          <FileText className="h-3.5 w-3.5" />
                          日志
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-slate-600"
                          onClick={() => void openEditYaml(podNs(p), p.name)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-red-600 hover:text-red-700"
                          onClick={() => setDelTarget({ namespace: podNs(p), name: p.name })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog open={yamlOpen} onOpenChange={setYamlOpen}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] flex-col gap-3 overflow-y-auto sm:max-w-7xl">
          <DialogHeader>
            <DialogTitle>{yamlMode === "create" ? "应用 YAML（创建或更新 Pod）" : "编辑 Pod YAML"}</DialogTitle>
          </DialogHeader>
          <YamlEditor
            value={yamlDraft}
            onChange={setYamlDraft}
            readOnly={yamlDraft === "加载中…"}
            height="min(62vh, 500px)"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="secondary" onClick={() => setYamlOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={applyMut.isPending}
              onClick={() => void applyMut.mutateAsync(yamlDraft)}
            >
              {applyMut.isPending ? "提交中…" : "提交应用"}
            </Button>
          </DialogFooter>
          {applyMut.isError && (
            <p className="text-sm text-red-600">{extractErrorMessage(applyMut.error)}</p>
          )}
        </DialogContent>
      </Dialog>

      {logTarget && (
        <PodLogsSheet
          key={`${logTarget.namespace}/${logTarget.name}`}
          open
          onOpenChange={(o) => {
            if (!o) setLogTarget(null);
          }}
          namespace={logTarget.namespace}
          podName={logTarget.name}
          container={logTarget.container}
        />
      )}

      <AlertDialog open={Boolean(delTarget)} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 Pod？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除 {delTarget?.namespace}/{delTarget?.name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => delTarget && void deleteMut.mutateAsync(delTarget)}
            >
              {deleteMut.isPending ? "删除中…" : "删除"}
            </Button>
          </AlertDialogFooter>
          {deleteMut.isError && (
            <p className="text-sm text-red-600">{extractErrorMessage(deleteMut.error)}</p>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
