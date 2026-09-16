import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, ChevronRight, LayoutGrid, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { YamlEditor } from "@/components/YamlEditor";
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
import { cn } from "@/lib/utils";
import type { SvcRow } from "./types";
import { K8sGraphicEditDialog } from "./k8s/K8sGraphicEditDialog";
import { normalizePortEntries, servicePortsPreview } from "./servicePortsDisplay";

const ClusterServices: React.FC = () => {
  const { namespace: nsEncoded } = useParams<{ namespace: string }>();
  const namespace = nsEncoded ? decodeURIComponent(nsEncoded) : "";
  const queryClient = useQueryClient();

  const base = `/cluster/ns/${encodeURIComponent(namespace)}`;

  const [yamlOpen, setYamlOpen] = useState(false);
  const [yamlDraft, setYamlDraft] = useState("");
  const [yamlMode, setYamlMode] = useState<"create" | "edit">("create");
  const [delName, setDelName] = useState<string | null>(null);
  const [graphicOpen, setGraphicOpen] = useState(false);
  const [graphicName, setGraphicName] = useState("");
  const [graphicSvcMode, setGraphicSvcMode] = useState<"edit" | "create">("edit");

  const svcQ = useQuery({
    queryKey: ["k8s-services", namespace],
    queryFn: ({ signal }) =>
      apiGetJson<SvcRow[]>(
        `/api/k8s/services?namespace=${encodeURIComponent(namespace)}`
      , { signal }),
    enabled: Boolean(namespace),
  });

  const applyMut = useMutation({
    mutationFn: (yamlContent: string) =>
      apiPostJson("/api/k8s/apply-yaml", { yamlContent }),
    onSuccess: () => {
      setYamlOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["k8s-services"] });
      void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (name: string) =>
      apiDelete(
        `/api/k8s/objects/service/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
      ),
    onSuccess: () => {
      setDelName(null);
      void queryClient.invalidateQueries({ queryKey: ["k8s-services"] });
      void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
    },
  });

  const openCreateYaml = () => {
    setYamlMode("create");
    setYamlDraft("");
    setYamlOpen(true);
  };

  const openEditYaml = async (name: string) => {
    setYamlMode("edit");
    setYamlOpen(true);
    setYamlDraft("加载中…");
    try {
      const res = await apiGetJson<{ yaml: string }>(
        `/api/k8s/object-yaml?kind=${encodeURIComponent("Service")}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(name)}`
      );
      setYamlDraft(res.yaml);
    } catch (e) {
      setYamlDraft(`# 加载失败: ${(e as Error).message}`);
    }
  };

  if (!namespace) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Service</h2>
        <p className="text-sm text-slate-500">
          core/v1 Service · 支持图形创建与图形编辑：标准 ClusterIP / NodePort / LoadBalancer 与 Host 网络场景（NodePort +
          Local）。列表行内「图形」为编辑已有 Service。
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="default"
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => {
            setGraphicSvcMode("create");
            setGraphicName("");
            setGraphicOpen(true);
          }}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          图形创建
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={openCreateYaml}>
          <Plus className="h-3.5 w-3.5" />
          应用 YAML
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="rounded-lg border-slate-200"
          onClick={() => void svcQ.refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          刷新
        </Button>
      </div>

      {svcQ.isLoading && <p className="text-sm text-slate-500">加载中…</p>}
      {svcQ.error && <p className="text-sm text-red-600">{(svcQ.error as Error).message}</p>}
      {svcQ.data && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white px-4 py-3 sm:px-5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Service 列表
            </span>
            <span className="text-xs text-slate-500">共 {svcQ.data.length} 条</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 hover:bg-transparent">
                  <TableHead className="min-w-[200px] pl-5 text-xs font-semibold text-slate-500">
                    名称
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500">类型</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500">Cluster IP</TableHead>
                  <TableHead className="w-[220px] max-w-[240px] text-xs font-semibold text-slate-500">
                    端口 / NodePort
                  </TableHead>
                  <TableHead className="min-w-[220px] pr-5 text-right text-xs font-semibold text-slate-500">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {svcQ.data.map((s, idx) => {
                  const portEnt = normalizePortEntries(s.portEntries);
                  const preview = servicePortsPreview(portEnt, s.ports ?? []);
                  return (
                  <TableRow
                    key={`${s.namespace}/${s.name}`}
                    className={cn(
                      "group border-slate-100 transition-colors hover:bg-blue-50/50",
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                    )}
                  >
                    <TableCell className="py-3.5 pl-5 align-middle">
                      <Link
                        to={`${base}/services/${encodeURIComponent(s.name)}`}
                        className="flex items-start gap-2.5"
                        title="打开 Service 详情与关联资源"
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200/80 transition-colors group-hover:bg-slate-200/80">
                          <Box className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 font-mono text-[13px] font-semibold text-slate-900 group-hover:text-blue-700">
                            {s.name}
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-slate-400">metadata.name</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">{s.type}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-700">{s.clusterIP}</TableCell>
                    <TableCell className="max-w-[240px] align-top">
                      <p
                        className="line-clamp-2 font-mono text-[11px] leading-snug text-slate-700"
                        title={preview.truncated ? `${preview.text}（详情见 Service 概览）` : preview.text}
                      >
                        {preview.text}
                      </p>
                      {preview.truncated ? (
                        <p className="mt-1 text-[10px] text-slate-400">更多端口请打开详情</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="pr-5 text-right align-middle">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          title="图形编辑：切换 ClusterIP / NodePort 等"
                          onClick={() => {
                            setGraphicSvcMode("edit");
                            setGraphicName(s.name);
                            setGraphicOpen(true);
                          }}
                        >
                          <LayoutGrid className="h-3.5 w-3.5" />
                          <span className="sr-only">图形</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          title="编辑 YAML"
                          onClick={() => void openEditYaml(s.name)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-red-600"
                          onClick={() => setDelName(s.name)}
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

      <K8sGraphicEditDialog
        open={graphicOpen}
        onOpenChange={(o) => {
          setGraphicOpen(o);
          if (!o) {
            setGraphicName("");
            setGraphicSvcMode("edit");
          }
        }}
        kind="Service"
        namespace={namespace}
        name={graphicName}
        serviceMode={graphicSvcMode}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ["k8s-services", namespace] });
          void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
        }}
      />

      <Dialog open={yamlOpen} onOpenChange={setYamlOpen}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] flex-col gap-3 overflow-y-auto sm:max-w-7xl">
          <DialogHeader>
            <DialogTitle>{yamlMode === "create" ? "应用 YAML（创建或更新 Service）" : "编辑 YAML"}</DialogTitle>
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
            <p className="text-sm text-red-600">{(applyMut.error as Error).message}</p>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(delName)} onOpenChange={(o) => !o && setDelName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 Service？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除 {namespace}/{delName}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => delName && void deleteMut.mutateAsync(delName)}
            >
              {deleteMut.isPending ? "删除中…" : "删除"}
            </Button>
          </AlertDialogFooter>
          {deleteMut.isError && (
            <p className="text-sm text-red-600">{(deleteMut.error as Error).message}</p>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClusterServices;
