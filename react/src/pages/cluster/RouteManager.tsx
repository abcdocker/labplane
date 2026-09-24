import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Globe, Network, Pencil, Plus, RefreshCw, Trash2, Waypoints, Boxes, CircleSlash, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { YamlEditor } from "@/components/YamlEditor";
import { apiDeleteJson, apiGetJson, apiGetText, apiPostJson, ApiHttpError } from "@/lib/api";
import { cn } from "@/lib/utils";

// 路由管理面板：Ingress 与 Gateway API（Gateway/HTTPRoute/GRPCRoute/GatewayClass）
// 的全量 CRUD。Ingress 走既有 /api/ingress* 端点；Gateway API 走 /api/k8s/gwapi/*
// 动态客户端端点（v1 与 v1alpha2 CRD 均可）。响应式：<768px 卡片列表，≥768px 表格。

type GwApiType = "gatewayclasses" | "gateways" | "httproutes" | "grpcroutes";
type TabKey = "ingress" | GwApiType;

type IngressRow = {
  namespace: string;
  name: string;
  hosts: string[];
  class: string;
  createdAt: string;
  managed: boolean;
  annotationCount: number;
};

type GwApiRow = {
  type: string;
  kind: string;
  namespace: string;
  name: string;
  createdAt: string;
  condition?: { type?: string; status?: string; reason?: string };
  controller?: string;
  description?: string;
  class?: string;
  addresses?: string[];
  listeners?: number;
  hostnames?: string[];
  parents?: string[];
};

const ageFrom = (iso?: string) => {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

const SAMPLES: Record<TabKey, string> = {
  ingress: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: demo-ingress
  namespace: default
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - host: demo.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: demo-svc
                port:
                  number: 80
`,
  gateways: `apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: demo-gateway
  namespace: default
spec:
  gatewayClassName: nginx
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces:
          from: Same
`,
  httproutes: `apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: demo-route
  namespace: default
spec:
  parentRefs:
    - name: demo-gateway
  hostnames:
    - demo.example.com
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: demo-svc
          port: 80
`,
  grpcroutes: `apiVersion: gateway.networking.k8s.io/v1alpha2
kind: GRPCRoute
metadata:
  name: demo-grpc
  namespace: default
spec:
  parentRefs:
    - name: demo-gateway
  hostnames:
    - grpc.example.com
  rules:
    - backendRefs:
        - name: demo-grpc-svc
          port: 9000
`,
  gatewayclasses: `apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: demo-class
spec:
  controllerName: example.com/gateway-controller
`,
};

const TAB_DEFS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }>; namespaced: boolean }[] = [
  { key: "ingress", label: "Ingress", icon: Globe, namespaced: true },
  { key: "gateways", label: "Gateway", icon: Network, namespaced: true },
  { key: "httproutes", label: "HTTPRoute", icon: Waypoints, namespaced: true },
  { key: "grpcroutes", label: "GRPCRoute", icon: Waypoints, namespaced: true },
  { key: "gatewayclasses", label: "GatewayClass", icon: Boxes, namespaced: false },
];

const errText = (e: unknown) => (e instanceof ApiHttpError ? e.serverMessage : e instanceof Error ? e.message : String(e));

function ConditionBadge({ row }: { row: GwApiRow }) {
  const c = row.condition;
  if (!c) return <Badge variant="secondary" className="text-[11px]">未知</Badge>;
  const ok = c.status === "True";
  return (
    <Badge
      variant="secondary"
      className={cn("text-[11px]", ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800")}
    >
      {c.type}: {c.status}
      {c.reason && !ok ? ` (${c.reason})` : ""}
    </Badge>
  );
}

const RouteManager: React.FC = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("ingress");
  const [nsFilter, setNsFilter] = useState("all");
  const [search, setSearch] = useState("");
  /** 编辑（或创建）中的 YAML 与目标对象 */
  const [editor, setEditor] = useState<{ open: boolean; mode: "create" | "edit"; tab: TabKey; yaml: string; target: string }>({
    open: false, mode: "create", tab: "ingress", yaml: "", target: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<{ tab: TabKey; ns: string; name: string; managed?: boolean } | null>(null);
  const [deleteBaota, setDeleteBaota] = useState(false);

  const namesQ = useQuery({
    queryKey: ["namespaces"],
    queryFn: () => apiGetJson<string[]>("/api/namespaces"),
    staleTime: 60_000,
  });

  const gwStatusQ = useQuery({
    queryKey: ["gwapi-status"],
    queryFn: () => apiGetJson<{ available: boolean; version?: string; error?: string }>("/api/k8s/gwapi/status"),
    staleTime: 60_000,
  });

  const ingressQ = useQuery({
    queryKey: ["route-mgr-ingresses"],
    queryFn: () => apiGetJson<IngressRow[]>("/api/ingresses"),
    enabled: tab === "ingress",
  });

  const useGwList = (t: GwApiType) =>
    useQuery({
      queryKey: ["route-mgr-gwapi", t, nsFilter],
      queryFn: () =>
        apiGetJson<{ items: GwApiRow[] }>(
          `/api/k8s/gwapi/list?type=${t}${t !== "gatewayclasses" && nsFilter !== "all" ? `&namespace=${encodeURIComponent(nsFilter)}` : ""}`,
        ),
      enabled: tab === t,
    });

  // Hooks 顺序：Tab 固定 5 个，全部无条件调用，按 enabled 控制请求
  const gwQ1 = useGwList("gateways");
  const gwQ2 = useGwList("httproutes");
  const gwQ3 = useGwList("grpcroutes");
  const gwQ4 = useGwList("gatewayclasses");

  const activeQ =
    tab === "ingress" ? ingressQ
      : tab === "gateways" ? gwQ1
        : tab === "httproutes" ? gwQ2
          : tab === "grpcroutes" ? gwQ3
            : gwQ4;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["route-mgr-ingresses"] });
    void queryClient.invalidateQueries({ queryKey: ["route-mgr-gwapi"] });
  };

  const openEditor = async (mode: "create" | "edit", t: TabKey, row?: { ns?: string; name?: string }) => {
    if (mode === "create") {
      setEditor({ open: true, mode, tab: t, yaml: SAMPLES[t], target: "" });
      return;
    }
    if (!row?.name) return;
    try {
      const yaml = t === "ingress"
        ? await apiGetText(`/api/ingress/raw?ns=${encodeURIComponent(row.ns ?? "")}&name=${encodeURIComponent(row.name)}`)
        : await apiGetText(
          `/api/k8s/gwapi/yaml?type=${t}&namespace=${encodeURIComponent(row.ns ?? "cluster")}&name=${encodeURIComponent(row.name)}`,
        );
      setEditor({ open: true, mode, tab: t, yaml, target: `${row.ns ? row.ns + "/" : ""}${row.name}` });
    } catch (e) {
      toast.error("读取 YAML 失败：" + errText(e));
    }
  };

  const applyMut = useMutation({
    mutationFn: async () => {
      if (editor.tab === "ingress") {
        return apiPostJson<{ message?: string }>("/api/ingress/yaml", { yamlContent: editor.yaml });
      }
      return apiPostJson<{ message?: string }>("/api/k8s/gwapi/apply", {
        yaml: editor.yaml,
        defaultNamespace: nsFilter !== "all" ? nsFilter : "default",
      });
    },
    onSuccess: (res) => {
      toast.success(res.message || "已应用");
      setEditor((s) => ({ ...s, open: false }));
      invalidate();
    },
    onError: (e) => toast.error("应用失败：" + errText(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) return;
      if (deleteTarget.tab === "ingress") {
        return apiPostJson<{ message?: string }>("/api/ingress/delete", {
          namespace: deleteTarget.ns,
          name: deleteTarget.name,
          deleteBaota,
        });
      }
      return apiDeleteJson<{ message?: string }>(
        `/api/k8s/gwapi/resource/${deleteTarget.tab}/${deleteTarget.tab === "gatewayclasses" ? "cluster" : deleteTarget.ns}/${deleteTarget.name}`,
      );
    },
    onSuccess: (res) => {
      toast.success(res?.message || "已删除");
      setDeleteTarget(null);
      setDeleteBaota(false);
      invalidate();
    },
    onError: (e) => toast.error("删除失败：" + errText(e)),
  });

  const rows = useMemo(() => {
    const kw = search.trim().toLowerCase();
    const list = (activeQ.data as unknown) ?? [];
    const arr: (IngressRow | GwApiRow)[] = Array.isArray(list) ? list : ((list as { items?: (IngressRow | GwApiRow)[] }).items ?? []);
    return arr.filter((r) => {
      const ns = (r as IngressRow).namespace || "";
      if (tab !== "gatewayclasses" && nsFilter !== "all" && ns && ns !== nsFilter) return false;
      if (!kw) return true;
      const hay = `${ns} ${r.name} ${(r as IngressRow).hosts?.join(" ") ?? ""} ${(r as GwApiRow).hostnames?.join(" ") ?? ""}`.toLowerCase();
      return hay.includes(kw);
    });
  }, [activeQ.data, nsFilter, search, tab]);

  const activeDef = TAB_DEFS.find((d) => d.key === tab)!;
  const gwUnavailable = tab !== "ingress" && gwStatusQ.data?.available === false;

  const renderSummary = (r: IngressRow | GwApiRow) => {
    if (tab === "ingress") {
      const ing = r as IngressRow;
      return (
        <div className="space-y-1 text-xs text-slate-500">
          <p className="truncate">{ing.hosts?.length ? ing.hosts.join("、") : "（无 host）"}</p>
          <p className="flex items-center gap-1.5">
            <span className="font-mono">{ing.class || "默认"}</span>
            {ing.managed ? <Badge className="bg-sky-100 text-sky-700" variant="secondary">宝塔托管</Badge> : null}
          </p>
        </div>
      );
    }
    const gw = r as GwApiRow;
    return (
      <div className="space-y-1 text-xs text-slate-500">
        {tab === "gatewayclasses" ? (
          <p className="truncate font-mono">{gw.controller || "—"}</p>
        ) : tab === "gateways" ? (
          <p className="truncate">{gw.class || "—"}{gw.addresses?.length ? ` · ${gw.addresses.join(", ")}` : ""}</p>
        ) : (
          <p className="truncate">
            {gw.hostnames?.length ? gw.hostnames.join("、") : "（无 hostname）"}
            {gw.parents?.length ? ` → ${gw.parents.join(", ")}` : ""}
          </p>
        )}
        <ConditionBadge row={gw} />
      </div>
    );
  };

  const renderActions = (r: IngressRow | GwApiRow) => {
    const ns = (r as IngressRow).namespace || "";
    return (
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs"
          onClick={() => void openEditor("edit", tab, { ns, name: r.name })}>
          <Pencil className="h-3 w-3" /> 编辑
        </Button>
        <Button type="button" size="sm" variant="outline"
          className="h-7 gap-1 border-red-200 px-2 text-xs text-red-600 hover:bg-red-50"
          onClick={() => setDeleteTarget({ tab, ns, name: r.name, managed: (r as IngressRow).managed })}>
          <Trash2 className="h-3 w-3" /> 删除
        </Button>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4">
      {/* 标题栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Waypoints className="h-5 w-5 text-blue-600" />
          <h1 className="text-lg font-bold text-slate-900">路由管理</h1>
          <span className="hidden text-xs text-slate-400 sm:inline">Ingress 与 Gateway API 全量 CRUD</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeDef.namespaced ? (
            <Select value={nsFilter} onValueChange={setNsFilter}>
              <SelectTrigger className="h-8 w-[150px] text-xs sm:w-[180px]">
                <SelectValue placeholder="命名空间" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">全部命名空间</SelectItem>
                {(namesQ.data ?? []).map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索名称 / host…"
            className="h-8 w-[140px] text-xs sm:w-[200px]"
          />
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs"
            onClick={() => void activeQ.refetch()}>
            <RefreshCw className={cn("h-3.5 w-3.5", activeQ.isFetching && "animate-spin")} /> 刷新
          </Button>
          <Button type="button" size="sm" className="h-8 gap-1 text-xs"
            onClick={() => void openEditor("create", tab)}>
            <Plus className="h-3.5 w-3.5" /> 创建
          </Button>
        </div>
      </div>

      {/* 资源类型 Tabs：小屏横向滚动 */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <div className="overflow-x-auto pb-0.5 [scrollbar-width:none]">
          <TabsList className="inline-flex min-w-full gap-1 sm:w-auto sm:min-w-0">
            {TAB_DEFS.map((d) => (
              <TabsTrigger key={d.key} value={d.key} className="gap-1.5 text-xs">
                <d.icon className="h-3.5 w-3.5" />
                {d.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {gwUnavailable ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            集群未检测到 Gateway API CRD（gateway.networking.k8s.io）。请先安装 Gateway API（如
            <code className="mx-1 rounded bg-amber-100 px-1">kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.1.0/standard-install.yaml</code>
            ）或由集群管理员确认版本；{gwStatusQ.data?.error ? `探测错误：${gwStatusQ.data.error}` : "安装后刷新本页即可。"}
          </span>
        </div>
      ) : null}

      {/* 列表：移动端卡片 / 桌面端表格 */}
      {activeQ.isLoading ? (
        <div className="py-10 text-center text-sm text-slate-400">加载中…</div>
      ) : activeQ.isError ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-red-600">
          <CircleSlash className="h-4 w-4" /> 加载失败：{errText(activeQ.error)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
          暂无 {activeDef.label} 资源{nsFilter !== "all" && activeDef.namespaced ? `（命名空间 ${nsFilter}）` : ""}
        </div>
      ) : (
        <>
          {/* 移动端卡片 */}
          <div className="grid gap-3 md:hidden">
            {rows.map((r, i) => (
              <div key={`${(r as IngressRow).namespace}-${r.name}-${i}`} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{r.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {(r as IngressRow).namespace ? `${(r as IngressRow).namespace} · ` : ""}创建于 {ageFrom(r.createdAt)}前
                    </p>
                  </div>
                </div>
                <div className="mt-2">{renderSummary(r)}</div>
                <div className="mt-3 border-t border-slate-100 pt-2.5">{renderActions(r)}</div>
              </div>
            ))}
          </div>
          {/* 桌面端表格 */}
          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2.5 font-medium">名称</th>
                  <th className="px-3 py-2.5 font-medium">{tab === "gatewayclasses" ? "控制器 / 条件" : "摘要"}</th>
                  <th className="px-3 py-2.5 font-medium">状态</th>
                  <th className="px-3 py-2.5 font-medium">创建时间</th>
                  <th className="px-3 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const gw = r as GwApiRow;
                  const cond = gw.condition;
                  return (
                    <tr key={`${(r as IngressRow).namespace}-${r.name}-${i}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-900">{r.name}</p>
                        {(r as IngressRow).namespace ? (
                          <p className="text-[11px] text-slate-400">{(r as IngressRow).namespace}</p>
                        ) : null}
                      </td>
                      <td className="max-w-[380px] px-3 py-2.5">{renderSummary(r)}</td>
                      <td className="px-3 py-2.5">
                        {tab === "ingress" ? (
                          <Badge variant="secondary" className="text-[11px]">
                            {(r as IngressRow).managed ? "宝塔托管" : "原生"}
                          </Badge>
                        ) : cond ? (
                          <ConditionBadge row={gw} />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500" title={r.createdAt}>
                        {ageFrom(r.createdAt)}前
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end">{renderActions(r)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* YAML 创建 / 编辑 */}
      <Dialog open={editor.open} onOpenChange={(o) => setEditor((s) => ({ ...s, open: o }))}>
        <DialogContent className="flex max-h-[92vh] w-[min(96vw,860px)] flex-col gap-3 overflow-hidden sm:max-w-[860px]">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editor.mode === "create" ? `创建 ${TAB_DEFS.find((d) => d.key === editor.tab)?.label}` : `编辑 ${editor.target}`}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <YamlEditor value={editor.yaml} onChange={(v) => setEditor((s) => ({ ...s, yaml: v }))} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditor((s) => ({ ...s, open: false }))}>取消</Button>
            <Button type="button" disabled={applyMut.isPending || !editor.yaml.trim()} onClick={() => applyMut.mutate()}>
              {applyMut.isPending ? "应用中…" : "应用"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 {TAB_DEFS.find((d) => d.key === deleteTarget?.tab)?.label}？</AlertDialogTitle>
            <AlertDialogDescription>
              即将删除 <span className="font-mono text-slate-900">{deleteTarget?.ns ? `${deleteTarget.ns}/` : ""}{deleteTarget?.name}</span>，该操作不可恢复。
              {deleteTarget?.tab === "ingress" ? "若该 Ingress 由宝塔同步创建，可同时清理云端站点。" : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteTarget?.tab === "ingress" ? (
            <div className="flex items-center gap-2">
              <Checkbox id="rm-del-baota" checked={deleteBaota} onCheckedChange={(v) => setDeleteBaota(v === true)} />
              <Label htmlFor="rm-del-baota" className="text-sm text-slate-600">同时删除宝塔侧站点与反向代理</Label>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button
              type="button"
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate()}
            >
              {deleteMut.isPending ? "删除中…" : "确认删除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RouteManager;
