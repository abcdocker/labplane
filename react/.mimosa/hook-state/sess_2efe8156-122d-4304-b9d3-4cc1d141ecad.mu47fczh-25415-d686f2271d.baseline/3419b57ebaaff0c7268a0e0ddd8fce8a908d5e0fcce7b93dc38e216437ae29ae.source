import React, { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { ApiHttpError, apiDeleteJson, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { parseAge } from "./parseAge";
import { JsonCodeEditor } from "@/components/JsonCodeEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  AlertDialogAction,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** 与后端 internal/k8s_crd_handlers.go 中 crClusterNamespaceToken 一致 */
export const CLUSTER_CR_NAMESPACE_CLUSTER = "__cluster__";

type CrdRow = {
  name: string;
  group: string;
  kind: string;
  plural: string;
  scope: string;
  storageVersion: string;
  createdAt: string;
  established: boolean;
};

type CrdListRes = { items: CrdRow[] };

type CrListRes = {
  crdName: string;
  scope: string;
  gvr: { group: string; version: string; resource: string };
  items: {
    name: string;
    namespace: string;
    uid: string;
    createdAt: string;
    apiVersion?: string;
    kind?: string;
  }[];
  continue?: string;
};

type CrGetRes = {
  crdName: string;
  scope: string;
  gvr: { group: string; version: string; resource: string };
  object: Record<string, unknown>;
  yaml?: string;
  createdAt: string;
  related: {
    ownerReferences: Record<string, unknown>[];
    events: Record<string, unknown>[];
    eventsNamespace: string;
  };
  warnings?: string[];
};

function apiPathCrd(name: string) {
  return `/api/k8s/crds/${encodeURIComponent(name)}`;
}

function apiPathCrList(crd: string, qs?: string) {
  const q = qs ? `?${qs}` : "";
  return `/api/k8s/crds/${encodeURIComponent(crd)}/instances${q}`;
}

function apiPathCrOne(crd: string, namespaceSeg: string, obj: string) {
  return `/api/k8s/crds/${encodeURIComponent(crd)}/instances/${encodeURIComponent(namespaceSeg)}/${encodeURIComponent(obj)}`;
}

export function ClusterCustomResourcesLayout() {
  return (
    <div className="space-y-5 px-1 pb-2 sm:pb-10">
      <Outlet />
    </div>
  );
}

export function ClusterCustomResourceCrdList() {
  const navigate = useNavigate();
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";
  const q = useQuery({
    queryKey: ["k8s-crds"],
    queryFn: ({ signal }) => apiGetJson<CrdListRes>("/api/k8s/crds", { signal }),
  });
  const qc = useQueryClient();
  const [delName, setDelName] = useState<string | null>(null);
  const delMut = useMutation({
    mutationFn: (name: string) => apiDeleteJson(apiPathCrd(name)),
    onSuccess: async () => {
      setDelName(null);
      await qc.invalidateQueries({ queryKey: ["k8s-crds"] });
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">自定义资源（CRD）</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">
          浏览集群内{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">CustomResourceDefinition</code>{" "}
          及其实例（CR）。点击进入某 CRD 查看实例列表；实例详情含{" "}
          <strong className="font-medium text-slate-700">metadata.ownerReferences</strong> 与{" "}
          <strong className="font-medium text-slate-700">Events</strong>。删除 CRD
          会影响整类资源，请谨慎操作。
        </p>
      </div>
      {q.isLoading && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center text-sm text-slate-500">
          加载中…
        </div>
      )}
      {q.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {q.error instanceof ApiHttpError ? q.error.serverMessage : (q.error as Error).message}
        </div>
      )}
      {q.data && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>名称</TableHead>
                <TableHead>Group / Kind</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>版本</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="w-[120px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.items.map((row) => (
                <TableRow key={row.name} className="cursor-pointer hover:bg-slate-50/80">
                  <TableCell className="font-mono text-xs sm:text-sm">
                    <Link
                      to={`/cluster/custom-resources/${encodeURIComponent(row.name)}`}
                      className="text-blue-600 hover:underline"
                    >
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs text-slate-700">
                    <div className="font-mono text-[11px] text-slate-600">{row.group}</div>
                    <div>{row.kind}</div>
                  </TableCell>
                  <TableCell className="text-xs">{row.scope}</TableCell>
                  <TableCell className="font-mono text-xs">{row.storageVersion}</TableCell>
                  <TableCell className="text-xs text-slate-600">
                    <div>{row.createdAt ? parseAge(row.createdAt) : "—"}</div>
                    <div className="text-[11px] text-slate-400">{row.createdAt || ""}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    {isAdmin && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={(e) => {
                          e.preventDefault();
                          setDelName(row.name);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <AlertDialog open={Boolean(delName)} onOpenChange={() => setDelName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除 CRD？</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-xs">
              {delName} — 将移除 API 中该资源类型及其实例，集群可能进入不稳定状态。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (delName) void delMut.mutateAsync(delName);
              }}
            >
              {delMut.isPending ? "删除中…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="text-xs text-slate-500">
        <Button type="button" variant="outline" size="sm" onClick={() => void navigate("/cluster")}>
          返回集群总览
        </Button>
      </div>
    </div>
  );
}

export function ClusterCustomResourceInstances() {
  const { crdName: crdNameParam } = useParams();
  const navigate = useNavigate();
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";
  const crdName = crdNameParam ? decodeURIComponent(crdNameParam) : "";
  const [nsFilter, setNsFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createBody, setCreateBody] = useState(
    '{\n  "apiVersion": "",\n  "kind": "",\n  "metadata": { "name": "" }\n}'
  );

  const listQs = useMemo(() => {
    const p = new URLSearchParams();
    if (nsFilter.trim()) p.set("namespace", nsFilter.trim());
    return p.toString();
  }, [nsFilter]);

  const q = useQuery({
    queryKey: ["k8s-cr-instances", crdName, listQs],
    enabled: Boolean(crdName),
    queryFn: ({ signal }) => apiGetJson<CrListRes>(apiPathCrList(crdName, listQs), { signal }),
  });

  const qc = useQueryClient();
  const createMut = useMutation({
    mutationFn: async () => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(createBody) as Record<string, unknown>;
      } catch (e) {
        throw new Error("JSON 无效：" + (e as Error).message);
      }
      const qs = nsFilter.trim() ? `?namespace=${encodeURIComponent(nsFilter.trim())}` : "";
      return apiPostJson(apiPathCrList(crdName) + qs, parsed);
    },
    onSuccess: async () => {
      setCreateOpen(false);
      await qc.invalidateQueries({ queryKey: ["k8s-cr-instances", crdName] });
    },
  });

  const clusterScoped = (q.data?.scope || "").toLowerCase() === "cluster";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link to="/cluster/custom-resources" className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            CRD 列表
          </Link>
        </Button>
      </div>
      <div>
        <h2 className="font-mono text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
          {crdName || "—"}
        </h2>
        {q.data && (
          <p className="mt-1 text-xs text-slate-500">
            GVR: {q.data.gvr.group}/{q.data.gvr.version}/{q.data.gvr.resource} · Scope: {q.data.scope}
          </p>
        )}
      </div>
      {!clusterScoped && (
        <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-center">
          <label className="text-xs text-slate-600">
            命名空间过滤（留空表示全集群列出）
            <Input
              className="mt-1"
              value={nsFilter}
              onChange={(e) => setNsFilter(e.target.value)}
              placeholder="例如 monitoring"
            />
          </label>
        </div>
      )}
      {isAdmin && (
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建实例
          </Button>
        </div>
      )}
      {q.isLoading && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center text-sm text-slate-500">
          加载中…
        </div>
      )}
      {q.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {q.error instanceof ApiHttpError ? q.error.serverMessage : (q.error as Error).message}
        </div>
      )}
      {q.data && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                {!clusterScoped && <TableHead>命名空间</TableHead>}
                <TableHead>名称</TableHead>
                <TableHead>创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.items.map((row) => {
                const nsSeg = clusterScoped ? CLUSTER_CR_NAMESPACE_CLUSTER : row.namespace;
                return (
                  <TableRow key={`${row.namespace}/${row.name}`}>
                    {!clusterScoped && (
                      <TableCell className="font-mono text-xs">{row.namespace || "—"}</TableCell>
                    )}
                    <TableCell className="font-mono text-xs">
                      <Link
                        to={`/cluster/custom-resources/${encodeURIComponent(crdName)}/instances/${encodeURIComponent(nsSeg)}/${encodeURIComponent(row.name)}`}
                        className="text-blue-600 hover:underline"
                      >
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {row.createdAt ? parseAge(row.createdAt) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>创建自定义资源</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">
            提交完整 JSON（须含 apiVersion / kind / metadata.name）。命名空间级资源请在{" "}
            <code className="rounded bg-slate-100 px-1">metadata.namespace</code> 或上方过滤框中指定命名空间。
          </p>
          <JsonCodeEditor value={createBody} onChange={setCreateBody} height="min(360px, 50vh)" />
          {createMut.error && (
            <div className="text-sm text-red-600">
              {createMut.error instanceof ApiHttpError
                ? createMut.error.serverMessage
                : (createMut.error as Error).message}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void createMut.mutateAsync()}
              disabled={createMut.isPending}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => void navigate("/cluster")}>
          返回集群总览
        </Button>
      </div>
    </div>
  );
}

export function ClusterCustomResourceDetail() {
  const { crdName: crdEnc, namespace: nsEnc, objName: objEnc } = useParams();
  const navigate = useNavigate();
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";
  const crdName = crdEnc ? decodeURIComponent(crdEnc) : "";
  const namespaceSeg = nsEnc ? decodeURIComponent(nsEnc) : "";
  const objName = objEnc ? decodeURIComponent(objEnc) : "";

  const q = useQuery({
    queryKey: ["k8s-cr-one", crdName, namespaceSeg, objName],
    enabled: Boolean(crdName && namespaceSeg && objName),
    queryFn: ({ signal }) => apiGetJson<CrGetRes>(apiPathCrOne(crdName, namespaceSeg, objName), { signal }),
  });

  const [editJson, setEditJson] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (q.data?.object) {
      setEditJson(JSON.stringify(q.data.object, null, 2));
      setDirty(false);
    }
  }, [q.data?.object]);

  const qc = useQueryClient();
  const saveMut = useMutation({
    mutationFn: async () => {
      const obj = JSON.parse(editJson) as Record<string, unknown>;
      return apiPutJson(apiPathCrOne(crdName, namespaceSeg, objName), obj);
    },
    onSuccess: async () => {
      setDirty(false);
      await qc.invalidateQueries({ queryKey: ["k8s-cr-one", crdName, namespaceSeg, objName] });
    },
  });

  const delMut = useMutation({
    mutationFn: () => apiDeleteJson(apiPathCrOne(crdName, namespaceSeg, objName)),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["k8s-cr-instances", crdName] });
      void navigate(`/cluster/custom-resources/${encodeURIComponent(crdName)}`);
    },
  });

  const [delOpen, setDelOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link
            to={`/cluster/custom-resources/${encodeURIComponent(crdName)}`}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            实例列表
          </Link>
        </Button>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-slate-900 font-mono sm:text-xl">
          {objName}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          CRD: {crdName}
          {namespaceSeg === CLUSTER_CR_NAMESPACE_CLUSTER ? "" : ` · 命名空间: ${namespaceSeg}`}
        </p>
      </div>
      {q.isLoading && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center text-sm text-slate-500">
          加载中…
        </div>
      )}
      {q.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {q.error instanceof ApiHttpError ? q.error.serverMessage : (q.error as Error).message}
        </div>
      )}
      {q.data?.warnings && q.data.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          <ul className="list-disc space-y-1 pl-5">
            {q.data.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {q.data && (
        <Tabs defaultValue="related" className="w-full">
          <TabsList className="flex w-full flex-wrap gap-1 bg-slate-100/80 p-1">
            <TabsTrigger value="related">关联与事件</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="related" className="space-y-4 pt-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <p className="text-xs font-medium text-slate-500">创建时间</p>
              <p className="mt-1 text-slate-800">
                {q.data.createdAt ? parseAge(q.data.createdAt) : "—"}{" "}
                <span className="text-xs text-slate-400">({q.data.createdAt})</span>
              </p>
              <p className="mt-3 text-xs font-medium text-slate-500">Events 查询命名空间</p>
              <p className="font-mono text-xs text-slate-700">{q.data.related.eventsNamespace}</p>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-800">ownerReferences</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="text-xs">apiVersion</TableHead>
                      <TableHead className="text-xs">kind</TableHead>
                      <TableHead className="text-xs">name</TableHead>
                      <TableHead className="text-xs">uid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(q.data.related.ownerReferences || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-xs text-slate-500">
                          无
                        </TableCell>
                      </TableRow>
                    ) : (
                      q.data.related.ownerReferences.map((o, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-[11px]">{String(o.apiVersion ?? "")}</TableCell>
                          <TableCell className="text-xs">{String(o.kind ?? "")}</TableCell>
                          <TableCell className="font-mono text-xs">{String(o.name ?? "")}</TableCell>
                          <TableCell className="font-mono text-[10px] text-slate-500">
                            {String(o.uid ?? "")}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-800">Events</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80">
                      <TableHead className="text-xs">类型</TableHead>
                      <TableHead className="text-xs">原因</TableHead>
                      <TableHead className="text-xs">消息</TableHead>
                      <TableHead className="text-xs">次数</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(q.data.related.events || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-xs text-slate-500">
                          无（或缺少 list events 权限）
                        </TableCell>
                      </TableRow>
                    ) : (
                      q.data.related.events.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{String(e.type ?? "")}</TableCell>
                          <TableCell className="text-xs">{String(e.reason ?? "")}</TableCell>
                          <TableCell className="max-w-md truncate text-xs" title={String(e.message ?? "")}>
                            {String(e.message ?? "")}
                          </TableCell>
                          <TableCell className="text-xs">{String(e.count ?? "")}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="json" className="space-y-3 pt-3">
            <JsonCodeEditor
              value={editJson}
              onChange={(v) => {
                setEditJson(v);
                setDirty(true);
              }}
              readOnly={!isAdmin}
              height="min(480px, 60vh)"
            />
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!dirty || saveMut.isPending}
                  onClick={() => void saveMut.mutateAsync()}
                >
                  <Save className="mr-1 h-4 w-4" />
                  保存（PUT 全量替换）
                </Button>
                {saveMut.error && (
                  <span className="text-sm text-red-600">
                    {saveMut.error instanceof ApiHttpError
                      ? saveMut.error.serverMessage
                      : (saveMut.error as Error).message}
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => setDelOpen(true)}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  删除资源
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除该自定义资源？</AlertDialogTitle>
            <AlertDialogDescription>此操作不可恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => void delMut.mutateAsync()}
            >
              {delMut.isPending ? "删除中…" : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ClusterCustomResourcesLayout;
