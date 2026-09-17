import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { apiGetJson } from "@/lib/api";
import type { K8sNodesListResponse, NodeRow, PodRow } from "./types";
import { parseAge } from "./parseAge";
import { cn } from "@/lib/utils";
import { podDetailHref, podPhaseBadgeClass } from "./podPhaseStyle";

function NodeReadyBadge({ ready }: { ready: string }) {
  const r = ready.trim();
  if (r === "True") {
    return (
      <Badge className="border-emerald-200/90 bg-emerald-50 px-2 py-0 text-[11px] font-semibold text-emerald-900 shadow-none">
        就绪
      </Badge>
    );
  }
  if (r === "False") {
    return (
      <Badge className="border-red-200/90 bg-red-50 px-2 py-0 text-[11px] font-semibold text-red-900 shadow-none">
        未就绪
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="px-2 py-0 text-[11px] font-normal text-slate-600 shadow-none">
      {r || "Unknown"}
    </Badge>
  );
}

function NodeRoleBadges({ roles }: { roles: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <Badge
          key={role}
          variant="outline"
          className="border-slate-200/90 bg-white px-1.5 py-0 text-[10px] font-medium capitalize text-slate-700 shadow-none"
        >
          {role}
        </Badge>
      ))}
    </div>
  );
}

function fmtNodeCpuCores(v: number | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  return `${v.toFixed(2)}c`;
}

function fmtNodeMemGi(v: number | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  const g = v / 1024 ** 3;
  return g >= 1 ? `${g.toFixed(2)}g` : `${(v / 1024 ** 2).toFixed(0)}m`;
}

function NodeResourceCell({ n, promOk }: { n: NodeRow; promOk: boolean }) {
  const pctCpu = n.cpuUsagePercent;
  const pctMem = n.memUsagePercent;
  const cpuBar = promOk && pctCpu != null && Number.isFinite(pctCpu);
  const memBar = promOk && pctMem != null && Number.isFinite(pctMem);

  if (!promOk) {
    return <div className="min-w-[140px] max-w-[260px] text-xs text-slate-400">—</div>;
  }

  if (!cpuBar && !memBar) {
    return <div className="min-w-[140px] max-w-[260px] text-xs text-slate-400">暂无</div>;
  }

  return (
    <div className="flex min-w-[168px] max-w-[min(100%,300px)] flex-col gap-1.5 py-0.5">
      <p className="text-[9px] leading-tight text-slate-400" title="占用率 = 工作负载容器用量 ÷ Node.Status.allocatable（kube 预留后）">
        工作负载 / 可分配（非整机 cgroup）
      </p>
      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-[10px] font-medium text-slate-500">CPU</span>
        {cpuBar ? (
          <>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-sky-500 transition-[width]"
                style={{ width: `${Math.min(100, Math.max(0, pctCpu!))}%` }}
              />
            </div>
            <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-slate-700">
              {pctCpu!.toFixed(0)}%
            </span>
          </>
        ) : (
          <span className="flex-1 text-[10px] text-slate-400">—</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="w-8 shrink-0 text-[10px] font-medium text-slate-500">内存</span>
        {memBar ? (
          <>
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-violet-500 transition-[width]"
                style={{ width: `${Math.min(100, Math.max(0, pctMem!))}%` }}
              />
            </div>
            <span className="w-9 shrink-0 text-right text-[10px] tabular-nums text-slate-700">
              {pctMem!.toFixed(0)}%
            </span>
          </>
        ) : (
          <span className="flex-1 text-[10px] text-slate-400">—</span>
        )}
      </div>
      <p className="font-mono text-[9px] leading-tight text-slate-500">
        {fmtNodeCpuCores(n.cpuUsedCores)} / {fmtNodeCpuCores(n.cpuAllocCores)} · {fmtNodeMemGi(n.memUsedBytes)} /{" "}
        {fmtNodeMemGi(n.memAllocBytes)}
      </p>
    </div>
  );
}

type NodeDetailDialogProps = {
  node: NodeRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

function PodTableRows({
  pods,
  onRowNavigate,
}: {
  pods: PodRow[];
  onRowNavigate: (p: PodRow) => void;
}) {
  return (
    <>
      {pods.map((p) => (
        <TableRow
          key={`${p.namespace}/${p.name}`}
          className="cursor-pointer hover:bg-slate-50/90"
          onClick={() => onRowNavigate(p)}
        >
          <TableCell className="font-mono text-xs">{p.namespace}</TableCell>
          <TableCell className="font-mono text-xs">{p.name}</TableCell>
          <TableCell>
            <Badge variant="outline" className={cn("text-[10px] font-normal", podPhaseBadgeClass(p.phase))}>
              {p.phase}
            </Badge>
          </TableCell>
          <TableCell className="whitespace-nowrap text-xs text-slate-600">{parseAge(p.age)}</TableCell>
          <TableCell className="tabular-nums text-xs">{p.restarts}</TableCell>
          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onRowNavigate(p)}
            >
              Pod 详情
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function NodeDetailDialog({ node, open, onOpenChange }: NodeDetailDialogProps) {
  const navigate = useNavigate();
  const name = node?.name ?? "";
  const podsQ = useQuery({
    queryKey: ["k8s-pods-on-node", name],
    queryFn: ({ signal }) =>
      apiGetJson<PodRow[]>(`/api/k8s/pods?node=${encodeURIComponent(name)}`, { signal }),
    enabled: open && name.length > 0,
    staleTime: 15_000,
  });

  const runningPods =
    podsQ.data?.filter((p) => String(p.phase).toLowerCase() === "running") ?? [];
  const otherPods = podsQ.data?.filter((p) => String(p.phase).toLowerCase() !== "running") ?? [];
  const total = podsQ.data?.length ?? 0;

  const goPodDetail = (p: PodRow) => {
    onOpenChange(false);
    navigate(podDetailHref(p.namespace, p.name));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,760px)] w-[min(96vw,48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-6 py-4 text-left">
          <DialogTitle className="font-mono text-base">节点与 Pod · {name}</DialogTitle>
          {node ? (
            <p className="mt-1 text-xs font-normal text-slate-500">
              就绪 {node.ready} · 角色 {node.roles.join(", ")} · 内网 {node.internalIP || "—"} ·{" "}
              {parseAge(node.age)}
            </p>
          ) : null}
          {!podsQ.isLoading && podsQ.data ? (
            <p className="mt-2 text-xs text-slate-600">
              以下列表为调度到该节点的 Pod（<span className="font-mono">spec.nodeName</span> ={" "}
              <span className="font-mono">{name}</span>
              ），共 <strong className="tabular-nums text-slate-800">{total}</strong> 个
              {total > 0 ? (
                <>
                  （Running <span className="tabular-nums">{runningPods.length}</span>
                  {otherPods.length > 0 ? (
                    <>
                      ，其他 <span className="tabular-nums">{otherPods.length}</span>
                    </>
                  ) : null}
                  ）
                </>
              ) : null}
              。点击行可打开 Pod 详情页。
            </p>
          ) : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <p className="mb-2 text-xs font-semibold text-slate-800">所属 Pod</p>
          {podsQ.isLoading && <p className="text-sm text-slate-500">加载 Pod 列表…</p>}
          {podsQ.error && (
            <p className="text-sm text-red-600">{(podsQ.error as Error).message}</p>
          )}
          {podsQ.data && podsQ.data.length === 0 && (
            <p className="text-sm text-slate-500">当前节点上无 Pod（或未绑定节点名）。</p>
          )}
          {podsQ.data && podsQ.data.length > 0 && (
            <div className="space-y-4">
              {runningPods.length > 0 ? (
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                    Running（{runningPods.length}）
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs">命名空间</TableHead>
                          <TableHead className="text-xs">名称</TableHead>
                          <TableHead className="w-[88px] text-xs">阶段</TableHead>
                          <TableHead className="w-[100px] text-xs">Age</TableHead>
                          <TableHead className="w-[56px] text-xs">重启</TableHead>
                          <TableHead className="w-[96px] text-right text-xs">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <PodTableRows pods={runningPods} onRowNavigate={goPodDetail} />
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}
              {otherPods.length > 0 ? (
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-600">
                    其他阶段（{otherPods.length}）
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs">命名空间</TableHead>
                          <TableHead className="text-xs">名称</TableHead>
                          <TableHead className="w-[88px] text-xs">阶段</TableHead>
                          <TableHead className="w-[100px] text-xs">Age</TableHead>
                          <TableHead className="w-[56px] text-xs">重启</TableHead>
                          <TableHead className="w-[96px] text-right text-xs">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <PodTableRows pods={otherPods} onRowNavigate={goPodDetail} />
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ClusterNodes: React.FC = () => {
  const [detailNode, setDetailNode] = useState<NodeRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const nodesQ = useQuery({
    queryKey: ["k8s-nodes"],
    queryFn: ({ signal }) => apiGetJson<K8sNodesListResponse>("/api/k8s/nodes", { signal }),
    refetchInterval: 30_000,
  });

  const list = nodesQ.data?.nodes ?? [];
  const promOk = nodesQ.data?.prometheusConfigured === true;
  const hint = (nodesQ.data?.metricsHint ?? "").trim();

  const openDetail = (n: NodeRow) => {
    setDetailNode(n);
    setDetailOpen(true);
  };

  return (
    <>
      <NodeDetailDialog
        node={detailNode}
        open={detailOpen}
        onOpenChange={(v) => {
          setDetailOpen(v);
          if (!v) setDetailNode(null);
        }}
      />

      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">节点</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          资源列：可分配 = <span className="font-mono text-xs">Node.Status.allocatable</span>（kube 系统预留后）；用量为工作负载容器聚合，进度条 = 用量 ÷ 可分配。
        </p>
      </div>

      {nodesQ.isLoading && <p className="text-sm text-slate-500">加载中…</p>}
      {nodesQ.error && <p className="text-sm text-red-600">{(nodesQ.error as Error).message}</p>}

      {nodesQ.data && !promOk && list.length > 0 ? (
        <div className="mb-4 rounded-2xl border border-slate-200/90 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
          未配置 <code className="rounded-md bg-white px-1.5 py-0.5 font-mono text-xs">prometheusUrlK8s</code>{" "}
          时资源列为「—」；配置后可显示 CPU/内存占用进度条（约 30s 刷新）。
        </div>
      ) : null}
      {promOk && hint ? (
        <div className="mb-4 rounded-2xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          <span className="font-semibold">部分监控查询失败</span>：{hint}
        </div>
      ) : null}

      {nodesQ.data && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.04]">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-200/90 bg-slate-50/95 hover:bg-slate-50/95">
                  <TableHead className="h-12 min-w-[140px] text-xs font-semibold uppercase tracking-wide text-slate-600">
                    名称
                  </TableHead>
                  <TableHead className="h-12 w-[88px] text-xs font-semibold uppercase tracking-wide text-slate-600">
                    就绪
                  </TableHead>
                  <TableHead className="h-12 min-w-[100px] text-xs font-semibold uppercase tracking-wide text-slate-600">
                    角色
                  </TableHead>
                  <TableHead className="h-12 min-w-[120px] text-xs font-semibold uppercase tracking-wide text-slate-600">
                    内网 IP
                  </TableHead>
                  <TableHead className="h-12 min-w-[260px] text-xs font-semibold uppercase tracking-wide text-slate-600 lg:min-w-[300px]">
                    资源（可分配）
                  </TableHead>
                  <TableHead className="h-12 min-w-[100px] text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Kubelet
                  </TableHead>
                  <TableHead className="h-12 w-[72px] text-right text-xs font-semibold uppercase tracking-wide text-slate-600 tabular-nums">
                    Pod
                  </TableHead>
                  <TableHead className="h-12 min-w-[100px] text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Age
                  </TableHead>
                  <TableHead className="h-12 w-[104px] text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((n, idx) => (
                  <TableRow
                    key={n.name}
                    className={cn(
                      "cursor-pointer border-b border-slate-100/90 transition-colors last:border-0",
                      "hover:bg-sky-50/40",
                      idx % 2 === 1 ? "bg-slate-50/35" : "bg-white",
                    )}
                    onClick={() => openDetail(n)}
                  >
                    <TableCell className="align-middle py-3 font-mono text-xs font-semibold text-slate-900">
                      {n.name}
                    </TableCell>
                    <TableCell className="align-middle py-3">
                      <NodeReadyBadge ready={n.ready} />
                    </TableCell>
                    <TableCell className="align-middle py-3">
                      <NodeRoleBadges roles={n.roles} />
                    </TableCell>
                    <TableCell className="align-middle py-3 font-mono text-xs text-slate-800">
                      {n.internalIP || "—"}
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <NodeResourceCell n={n} promOk={promOk} />
                    </TableCell>
                    <TableCell className="align-middle py-3 text-xs text-slate-700">{n.kubelet}</TableCell>
                    <TableCell className="align-middle py-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {typeof n.podCount === "number" ? n.podCount : "—"}
                    </TableCell>
                    <TableCell className="align-middle whitespace-nowrap py-3 text-xs text-slate-600">
                      {parseAge(n.age)}
                    </TableCell>
                    <TableCell className="align-middle py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 border-slate-200 bg-white text-xs font-medium shadow-sm hover:bg-slate-50"
                        onClick={() => openDetail(n)}
                      >
                        节点与 Pod
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </>
  );
};

export default ClusterNodes;
