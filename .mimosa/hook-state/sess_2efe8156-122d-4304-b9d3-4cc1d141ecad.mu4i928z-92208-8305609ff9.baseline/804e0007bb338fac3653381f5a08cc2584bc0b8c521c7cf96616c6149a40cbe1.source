import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, History, LayoutGrid } from "lucide-react";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CollapsibleManual } from "@/components/CollapsibleManual";
import { YamlEditor } from "@/components/YamlEditor";
import { JsonCodeEditor } from "@/components/JsonCodeEditor";
import { apiGetJson, apiPostJson } from "@/lib/api";
import { k8sRevisionYamlToJsonString } from "@/lib/k8sRevisionYamlToJson";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type K8sObjectRevisionMeta = {
  id: string;
  ts: string;
  user: string;
  source: string;
};

type RevisionsListRes = { revisions: K8sObjectRevisionMeta[] };

type DiffRes = {
  left: K8sObjectRevisionMeta;
  right: K8sObjectRevisionMeta;
  leftYaml: string;
  rightYaml: string;
};

type RevisionYamlRes = { yaml: string; revision: K8sObjectRevisionMeta };

/** 记录时间：本地主显示 + 详情里附带 UTC ISO */
function formatRevisionLocal(tsIso: string): string {
  try {
    return format(parseISO(tsIso), "yyyy-MM-dd HH:mm:ss", { locale: zhCN });
  } catch {
    return tsIso;
  }
}

function sourceBadgeVariant(
  source: string
): "default" | "secondary" | "outline" | "destructive" {
  const s = source.toLowerCase();
  if (s.includes("rollback")) return "destructive";
  if (s.includes("apply")) return "default";
  if (s.includes("json") || s.includes("graphic")) return "secondary";
  return "outline";
}

function linePairs(left: string, right: string): { left: string; right: string; same: boolean }[] {
  const la = left.split("\n");
  const lb = right.split("\n");
  const n = Math.max(la.length, lb.length);
  const rows: { left: string; right: string; same: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const a = la[i] ?? "";
    const b = lb[i] ?? "";
    rows.push({ left: a, right: b, same: a === b });
  }
  return rows;
}

export type K8sObjectRevisionDialogProps = {
  namespace: string;
  kind: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
};

export const K8sObjectRevisionDialog: React.FC<K8sObjectRevisionDialogProps> = ({
  namespace,
  kind,
  name,
  open,
  onOpenChange,
  onApplied,
}) => {
  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");
  const [rollbackId, setRollbackId] = useState<string>("");
  const [diff, setDiff] = useState<DiffRes | null>(null);
  const [confirmRollbackOpen, setConfirmRollbackOpen] = useState(false);
  const [diffView, setDiffView] = useState<"lines" | "yaml" | "json">("lines");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string>("");
  const [previewTab, setPreviewTab] = useState<"yaml" | "json">("yaml");

  const q = useQuery({
    queryKey: ["k8s-object-revisions", namespace, kind, name],
    queryFn: ({ signal }) =>
      apiGetJson<RevisionsListRes>(
        `/api/k8s/object-revisions?namespace=${encodeURIComponent(namespace)}&kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}`
      , { signal }),
    enabled: open && Boolean(namespace && kind && name),
  });

  const revs = q.data?.revisions ?? [];

  useEffect(() => {
    if (!open) {
      setDiff(null);
      setPreviewOpen(false);
      setPreviewId("");
      return;
    }
    if (revs.length === 0) {
      setLeftId("");
      setRightId("");
      setRollbackId("");
      return;
    }
    const last = revs[revs.length - 1].id;
    const prev = revs.length > 1 ? revs[revs.length - 2].id : revs[0].id;
    setLeftId((cur) => (cur && revs.some((r) => r.id === cur) ? cur : prev));
    setRightId((cur) => (cur && revs.some((r) => r.id === cur) ? cur : last));
    setRollbackId((cur) => (cur && revs.some((r) => r.id === cur) ? cur : last));
  }, [open, revs]);

  const previewQ = useQuery({
    queryKey: ["k8s-object-revision-yaml", namespace, kind, name, previewId],
    queryFn: ({ signal }) =>
      apiGetJson<RevisionYamlRes>(
        `/api/k8s/object-revisions/yaml?namespace=${encodeURIComponent(namespace)}&kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}&id=${encodeURIComponent(previewId)}`
      , { signal }),
    enabled: previewOpen && Boolean(previewId && namespace && kind && name),
  });

  const previewJson = useMemo(() => {
    const y = previewQ.data?.yaml;
    if (!y) return { ok: true as const, json: "" };
    return k8sRevisionYamlToJsonString(y);
  }, [previewQ.data?.yaml]);

  const diffRows = useMemo(() => (diff ? linePairs(diff.leftYaml, diff.rightYaml) : []), [diff]);

  const diffLeftJson = useMemo(() => {
    if (!diff) return { ok: true as const, json: "" };
    return k8sRevisionYamlToJsonString(diff.leftYaml);
  }, [diff]);

  const diffRightJson = useMemo(() => {
    if (!diff) return { ok: true as const, json: "" };
    return k8sRevisionYamlToJsonString(diff.rightYaml);
  }, [diff]);

  const diffMut = useMutation({
    mutationFn: async () => {
      if (!leftId || !rightId) throw new Error("请选择要比对的两个版本");
      if (leftId === rightId) throw new Error("请选择两个不同的版本");
      return apiGetJson<DiffRes>(
        `/api/k8s/object-revisions/diff?namespace=${encodeURIComponent(namespace)}&kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}&leftId=${encodeURIComponent(leftId)}&rightId=${encodeURIComponent(rightId)}`
      );
    },
    onSuccess: (data) => {
      setDiff(data);
      setDiffView("lines");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rollbackMut = useMutation({
    mutationFn: () =>
      apiPostJson<{ message?: string }>("/api/k8s/object-revisions/rollback", {
        namespace,
        kind,
        name,
        revisionId: rollbackId,
      }),
    onSuccess: (res) => {
      toast.success(res.message ?? "已回退");
      setConfirmRollbackOpen(false);
      onOpenChange(false);
      onApplied?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revById = useMemo(() => {
    const m = new Map<string, K8sObjectRevisionMeta>();
    for (const r of revs) m.set(r.id, r);
    return m;
  }, [revs]);

  const openPreview = (id: string) => {
    setPreviewId(id);
    setPreviewTab("yaml");
    setPreviewOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] w-full max-w-[calc(100%-2rem)] flex-col gap-3 overflow-hidden p-4 sm:max-w-7xl sm:p-6">
          <DialogHeader className="shrink-0 space-y-2 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <History className="h-5 w-5 shrink-0 text-slate-600" />
              <span>Kubernetes 变更记录</span>
              <span className="font-mono text-sm font-normal text-slate-600">
                {kind} · {namespace}/{name}
              </span>
            </DialogTitle>
            <CollapsibleManual
              storageKey="k8s.object-revision.intro"
              title="功能说明"
              variant="muted"
              className="border-slate-200/80 bg-slate-50/60 px-2 py-1.5"
              titleClassName="text-slate-700"
            >
              <p className="text-left text-xs font-normal leading-relaxed text-slate-600">
                每次「提交应用」YAML、图形编辑保存（object-json）、或「回退」成功后会自动写入一条快照，并记录
                <strong className="font-medium text-slate-800"> 写入时间（UTC，接口返回 RFC3339）</strong>
                、操作者与来源。可在下表按时间查看，并用 YAML / JSON（结构化）预览任意版本；比对支持行对齐、双栏 YAML 与双栏
                JSON。
              </p>
            </CollapsibleManual>
          </DialogHeader>

          {q.isLoading && <p className="text-sm text-slate-500">加载变更记录…</p>}
          {q.error && <p className="text-sm text-red-600">{(q.error as Error).message}</p>}

          {!q.isLoading && revs.length === 0 && (
            <p className="text-sm text-slate-600">
              暂无记录。在本资源页提交 YAML、使用图形编辑保存或应用清单后，会在此出现带时间戳的快照。
            </p>
          )}

          {revs.length > 0 && (
            <ScrollArea className="max-h-[min(36vh,320px)] pr-3">
              <div className="rounded-xl border border-slate-200/90 bg-white">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/95 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                      <th className="px-3 py-2.5">记录时间</th>
                      <th className="px-3 py-2.5">操作者</th>
                      <th className="px-3 py-2.5">来源</th>
                      <th className="px-3 py-2.5 text-right">比对 / 预览</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...revs].reverse().map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-slate-100/90 last:border-0 hover:bg-slate-50/60"
                      >
                        <td className="px-3 py-2.5 align-top">
                          <div className="font-semibold tabular-nums text-slate-900">
                            {formatRevisionLocal(r.ts)}
                          </div>
                          <div className="mt-0.5 font-mono text-[10px] text-slate-500" title="服务端存储的 RFC3339（UTC）">
                            {r.ts} · id {r.id}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-top text-slate-800">{r.user || "—"}</td>
                        <td className="px-3 py-2.5 align-top">
                          <Badge
                            variant={sourceBadgeVariant(r.source)}
                            className="text-[10px] font-medium shadow-none"
                          >
                            {r.source || "—"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 align-top text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={leftId === r.id ? "default" : "outline"}
                              className="h-7 text-[11px]"
                              onClick={() => setLeftId(r.id)}
                            >
                              左侧
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={rightId === r.id ? "default" : "outline"}
                              className="h-7 text-[11px]"
                              onClick={() => setRightId(r.id)}
                            >
                              右侧
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-7 gap-0.5 text-[11px]"
                              onClick={() => openPreview(r.id)}
                            >
                              <Eye className="h-3 w-3" />
                              预览
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}

          {revs.length > 0 && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800">版本比对</p>
                  <p className="text-[11px] text-slate-500">
                    下拉与上表「左侧 / 右侧」联动；结果可切换行对齐、YAML 双栏、JSON 双栏
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">左侧版本</span>
                    <Select value={leftId} onValueChange={setLeftId}>
                      <SelectTrigger className="h-9 bg-white text-xs">
                        <SelectValue placeholder="选择版本" />
                      </SelectTrigger>
                      <SelectContent>
                        {revs.map((r) => (
                          <SelectItem key={r.id} value={r.id} className="text-xs">
                            {formatRevisionLocal(r.ts)} · {r.user || "—"} · {r.source}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">右侧版本</span>
                    <Select value={rightId} onValueChange={setRightId}>
                      <SelectTrigger className="h-9 bg-white text-xs">
                        <SelectValue placeholder="选择版本" />
                      </SelectTrigger>
                      <SelectContent>
                        {revs.map((r) => (
                          <SelectItem key={r.id} value={r.id} className="text-xs">
                            {formatRevisionLocal(r.ts)} · {r.user || "—"} · {r.source}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={diffMut.isPending || !leftId || !rightId || leftId === rightId}
                  onClick={() => void diffMut.mutateAsync()}
                >
                  {diffMut.isPending ? "比对中…" : "生成比对"}
                </Button>
              </div>

              {diff && (
                <div className="space-y-2 rounded-xl border border-slate-200/90 bg-white p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800">比对结果</p>
                    <p className="text-[11px] text-slate-500">
                      <span className="font-mono">{formatRevisionLocal(diff.left.ts)}</span>
                      <span className="mx-1">↔</span>
                      <span className="font-mono">{formatRevisionLocal(diff.right.ts)}</span>
                    </p>
                  </div>
                  <Tabs value={diffView} onValueChange={(v) => setDiffView(v as typeof diffView)}>
                    <TabsList className="h-9 w-full justify-start bg-slate-100/90 p-1 sm:w-auto">
                      <TabsTrigger value="lines" className="text-xs">
                        行对齐
                      </TabsTrigger>
                      <TabsTrigger value="yaml" className="gap-1 text-xs">
                        <LayoutGrid className="h-3 w-3" />
                        YAML 双栏
                      </TabsTrigger>
                      <TabsTrigger value="json" className="text-xs">
                        JSON 双栏
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="lines" className="mt-2">
                      <div className="grid max-h-[min(48vh,480px)] grid-cols-2 gap-1 overflow-auto rounded-lg border border-slate-200 bg-slate-50/40 font-mono text-[11px] leading-snug">
                        <div className="border-r border-slate-200 bg-white">
                          {diffRows.map((row, i) => (
                            <div
                              key={`L${i}`}
                              className={cn(
                                "flex border-b border-slate-100",
                                row.same ? "bg-white" : "bg-amber-50/70"
                              )}
                            >
                              <span className="w-8 shrink-0 select-none border-r border-slate-100 bg-slate-50 px-0.5 text-right text-slate-400">
                                {i + 1}
                              </span>
                              <span className="min-w-0 flex-1 whitespace-pre-wrap break-all px-1 py-0.5 text-slate-800">
                                {row.left}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="bg-white">
                          {diffRows.map((row, i) => (
                            <div
                              key={`R${i}`}
                              className={cn(
                                "flex border-b border-slate-100",
                                row.same ? "bg-white" : "bg-amber-50/70"
                              )}
                            >
                              <span className="w-8 shrink-0 select-none border-r border-slate-100 bg-slate-50 px-0.5 text-right text-slate-400">
                                {i + 1}
                              </span>
                              <span className="min-w-0 flex-1 whitespace-pre-wrap break-all px-1 py-0.5 text-slate-800">
                                {row.right}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="yaml" className="mt-2">
                      <div className="grid gap-2 lg:grid-cols-2">
                        <div className="min-w-0 space-y-1">
                          <p className="text-[10px] font-medium text-slate-500">左侧 YAML（只读）</p>
                          <YamlEditor
                            value={diff.leftYaml}
                            onChange={() => {}}
                            readOnly
                            height="min(42vh, 400px)"
                            showStats={false}
                          />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <p className="text-[10px] font-medium text-slate-500">右侧 YAML（只读）</p>
                          <YamlEditor
                            value={diff.rightYaml}
                            onChange={() => {}}
                            readOnly
                            height="min(42vh, 400px)"
                            showStats={false}
                          />
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="json" className="mt-2">
                      {(!diffLeftJson.ok || !diffRightJson.ok) && (
                        <p className="mb-2 text-xs text-amber-900">
                          JSON 视图依赖 YAML 解析；一侧失败时仍显示另一侧。错误：[
                          {!diffLeftJson.ok ? (diffLeftJson as { ok: false; error: string }).error : ""}
                          {!diffLeftJson.ok && !diffRightJson.ok ? " · " : ""}
                          {!diffRightJson.ok ? (diffRightJson as { ok: false; error: string }).error : ""}
                          ]
                        </p>
                      )}
                      <div className="grid gap-2 lg:grid-cols-2">
                        <div className="min-w-0 space-y-1">
                          <p className="text-[10px] font-medium text-slate-500">左侧 JSON（结构化）</p>
                          <JsonCodeEditor
                            value={
                              diffLeftJson.ok
                                ? diffLeftJson.json
                                : `/* ${(diffLeftJson as { ok: false; error: string }).error} */`
                            }
                            onChange={() => {}}
                            readOnly
                            height="min(42vh, 400px)"
                            showStats={false}
                          />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <p className="text-[10px] font-medium text-slate-500">右侧 JSON（结构化）</p>
                          <JsonCodeEditor
                            value={
                              diffRightJson.ok
                                ? diffRightJson.json
                                : `/* ${(diffRightJson as { ok: false; error: string }).error} */`
                            }
                            onChange={() => {}}
                            readOnly
                            height="min(42vh, 400px)"
                            showStats={false}
                          />
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-800">回退到选定版本</p>
                <Select value={rollbackId} onValueChange={setRollbackId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="选择要恢复的版本" />
                  </SelectTrigger>
                  <SelectContent>
                    {revs.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="text-xs">
                        {formatRevisionLocal(r.ts)} · {r.user || "—"} · {r.source}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={!rollbackId || rollbackMut.isPending}
                  onClick={() => setConfirmRollbackOpen(true)}
                >
                  回退到此版本
                </Button>
                {rollbackId && revById.get(rollbackId) && (
                  <p className="text-[11px] text-slate-600">
                    将应用快照（记录时间{" "}
                    <span className="font-mono font-medium">
                      {formatRevisionLocal(revById.get(rollbackId)!.ts)}
                    </span>
                    ）
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="shrink-0 border-t border-slate-100 pt-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={previewOpen}
        onOpenChange={(o) => {
          setPreviewOpen(o);
          if (!o) setPreviewId("");
        }}
      >
        <DialogContent className="flex max-h-[92vh] w-full max-w-[calc(100%-2rem)] flex-col gap-3 overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              快照预览 ·{" "}
              {previewQ.data?.revision
                ? formatRevisionLocal(previewQ.data.revision.ts)
                : previewId
                  ? "加载中…"
                  : ""}
            </DialogTitle>
            {previewQ.data?.revision && (
              <p className="text-left text-xs text-slate-500">
                操作者 {previewQ.data.revision.user || "—"} · 来源{" "}
                <Badge variant={sourceBadgeVariant(previewQ.data.revision.source)} className="mx-0.5 text-[10px]">
                  {previewQ.data.revision.source}
                </Badge>
                · <span className="font-mono">{previewQ.data.revision.ts}</span>
              </p>
            )}
          </DialogHeader>
          {previewQ.isLoading && <p className="text-sm text-slate-500">加载快照…</p>}
          {previewQ.error && (
            <p className="text-sm text-red-600">{(previewQ.error as Error).message}</p>
          )}
          {previewQ.data?.yaml != null && (
            <Tabs value={previewTab} onValueChange={(v) => setPreviewTab(v as typeof previewTab)}>
              <TabsList className="h-9 w-fit">
                <TabsTrigger value="yaml" className="text-xs">
                  YAML（源码）
                </TabsTrigger>
                <TabsTrigger value="json" className="text-xs">
                  JSON（结构化）
                </TabsTrigger>
              </TabsList>
              <TabsContent value="yaml" className="mt-2">
                <YamlEditor
                  value={previewQ.data.yaml}
                  onChange={() => {}}
                  readOnly
                  height="min(60vh, 520px)"
                  showStats
                />
              </TabsContent>
              <TabsContent value="json" className="mt-2">
                {previewJson.ok ? (
                  <JsonCodeEditor
                    value={previewJson.json}
                    onChange={() => {}}
                    readOnly
                    height="min(60vh, 520px)"
                    showStats
                  />
                ) : (
                  <p className="text-sm text-red-600">
                    无法解析为 JSON：{(previewJson as { ok: false; error: string }).error}
                  </p>
                )}
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPreviewOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRollbackOpen} onOpenChange={setConfirmRollbackOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认回退？</AlertDialogTitle>
            <AlertDialogDescription>
              将把集群中的 {kind}{" "}
              <span className="font-mono">
                {namespace}/{name}
              </span>{" "}
              更新为所选历史快照（记录时间处的 YAML）。此操作与「提交应用」等效，可能影响线上工作负载。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={rollbackMut.isPending}
              onClick={() => void rollbackMut.mutateAsync()}
            >
              {rollbackMut.isPending ? "应用中…" : "确认回退"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export function K8sObjectRevisionTriggerButton(props: {
  namespace: string;
  kind: string;
  name: string;
  onApplied?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={props.className}
        onClick={() => setOpen(true)}
        title="查看带时间戳的 YAML 快照、YAML/JSON 比对与回退"
      >
        <History className="mr-1.5 h-3.5 w-3.5" />
        变更记录
      </Button>
      <K8sObjectRevisionDialog
        namespace={props.namespace}
        kind={props.kind}
        name={props.name}
        open={open}
        onOpenChange={setOpen}
        onApplied={props.onApplied}
      />
    </>
  );
}
