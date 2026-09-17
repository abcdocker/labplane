import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, CheckCircle2, ExternalLink, Globe, KeyRound,
  Loader2, Network, Pencil, Plus, RefreshCw, Router, Route as RouteIcon,
  Server, Trash2, Wifi, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiDeleteJson, apiGetJson, apiPostJson, apiPutJson, ApiHttpError } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ──────────────────────────── 类型 ────────────────────────────

type TrafficCollector = {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  passSet?: boolean;
  command?: string;
  hostKeyFp?: string;
  lastSnapshotAt?: string;
  lastError?: string;
};

type MeshInstance = {
  id: string;
  name: string;
  region?: string;
  apiUrl: string;
  apiKeySet: boolean;
  metricsUrl?: string;
  headplaneUrl?: string;
  enabled: boolean;
  notes?: string;
  trafficCollectors: TrafficCollector[];
  createdAt: string;
  updatedAt: string;
};

type HSUser = {
  id: string; name: string; displayName?: string; email?: string;
  provider?: string; createdAt?: string;
};

type HSNode = {
  id: string; name: string; givenName: string; ipAddresses: string[];
  user?: HSUser; online: boolean; lastSeen?: string; expiry?: string;
  createdAt?: string; registerMethod?: string;
  approvedRoutes?: string[]; availableRoutes?: string[]; subnetRoutes?: string[];
  tags?: string[];
};

type HSPreAuthKey = {
  id: string; key: string; reusable: boolean; ephemeral: boolean; used: boolean;
  expiration?: string; createdAt?: string; user?: HSUser; aclTags?: string[];
};

type DiscoveredNode = HSNode & { os?: string; clientVersion?: string };

type MeshSite = {
  subnet: string; router: string; routerId: string; approved: boolean;
  online: boolean; lastSeen?: string; tailscaleIp?: string;
};

type MeshLink = {
  from: string; to: string; via: string; curAddr?: string; relay?: string;
  rxBytes: number; txBytes: number; seenAt?: string;
};

type CollectorSuggestion = { routerId: string; name: string; host: string; port: number };

type Discover = {
  instance: MeshInstance;
  health: boolean;
  error?: string;
  version?: string;
  users?: HSUser[];
  nodes?: DiscoveredNode[];
  nodesError?: string;
  sites?: MeshSite[];
  links?: MeshLink[];
  preAuthKeys?: HSPreAuthKey[];
  collectorSuggestions?: CollectorSuggestion[];
};

type TrafficPeer = {
  hostName: string; dnsName?: string; tailscaleIps?: string[]; os?: string;
  online: boolean; lastSeen?: string; rxBytes: number; txBytes: number;
  curAddr?: string; relay?: string;
};

type TrafficSnapshot = {
  collectorId: string; collectorName: string; host: string; collectedAt: string;
  hostKeyFp?: string; version?: string; backendState?: string;
  selfHostName?: string; selfIps?: string[];
  peers: TrafficPeer[]; error?: string;
};

type MetricSample = { name: string; value: number; labels?: Record<string, string> };

// ──────────────────────────── 工具 ────────────────────────────

const emptyInstance = (): MeshInstance => ({
  id: "",
  name: "",
  region: "",
  apiUrl: "",
  apiKeySet: false,
  metricsUrl: "",
  headplaneUrl: "",
  enabled: true,
  notes: "",
  trafficCollectors: [],
  createdAt: "",
  updatedAt: "",
});

const fmtBytes = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const fmtTime = (iso?: string) => {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(t).toLocaleDateString();
};

const apiErr = (e: unknown) => (e instanceof ApiHttpError ? e.serverMessage : e instanceof Error ? e.message : String(e));

// ──────────────────────────── 页面 ────────────────────────────

const MeshPage: React.FC = () => {
  const qc = useQueryClient();
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";

  const instancesQ = useQuery({
    queryKey: ["mesh-instances"],
    queryFn: () => apiGetJson<{ instances: MeshInstance[] }>("/api/ops/mesh/instances"),
  });
  const instances = useMemo(() => instancesQ.data?.instances ?? [], [instancesQ.data]);
  const [selectedId, setSelectedId] = useState("");
  const selected = instances.find((i) => i.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && instances.length > 0) setSelectedId(instances[0].id);
    if (selectedId && instances.length > 0 && !instances.some((i) => i.id === selectedId)) {
      setSelectedId(instances[0].id);
    }
  }, [instances, selectedId]);

  // ── 实例编辑 ──
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<MeshInstance>(emptyInstance());
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [collectorPassInput, setCollectorPassInput] = useState<Record<string, string>>({});

  const openCreate = () => {
    setDraft(emptyInstance());
    setApiKeyInput("");
    setCollectorPassInput({});
    setEditorOpen(true);
  };
  const openEdit = (inst: MeshInstance, extraCollector?: { name: string; host: string; port: number }) => {
    const draftCollected = { ...inst, trafficCollectors: (inst.trafficCollectors ?? []).map((c) => ({ ...c })) };
    if (extraCollector) {
      draftCollected.trafficCollectors = [
        ...(draftCollected.trafficCollectors ?? []),
        { id: `tc-${Date.now()}`, name: extraCollector.name, host: extraCollector.host, port: extraCollector.port || 22, user: "root", passSet: false },
      ];
    }
    setDraft(draftCollected);
    setApiKeyInput("");
    setCollectorPassInput({});
    setEditorOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: () =>
      apiPutJson("/api/ops/mesh/instances", {
        id: draft.id || undefined,
        name: draft.name,
        region: draft.region,
        apiUrl: draft.apiUrl,
        apiKey: apiKeyInput || undefined,
        metricsUrl: draft.metricsUrl,
        headplaneUrl: draft.headplaneUrl,
        enabled: draft.enabled,
        notes: draft.notes,
        trafficCollectors: (draft.trafficCollectors ?? []).map((c) => ({
          id: c.id || undefined,
          name: c.name,
          host: c.host,
          port: c.port,
          user: c.user,
          password: collectorPassInput[c.id] ?? undefined,
          command: c.command ?? "",
        })),
      }),
    onSuccess: () => {
      toast.success("实例已保存");
      setEditorOpen(false);
      void qc.invalidateQueries({ queryKey: ["mesh-instances"] });
      void qc.invalidateQueries({ queryKey: ["mesh-summary"] });
    },
    onError: (e) => toast.error(apiErr(e)),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiDeleteJson(`/api/ops/mesh/instances/${id}`),
    onSuccess: () => {
      toast.success("实例已删除");
      setSelectedId("");
      void qc.invalidateQueries({ queryKey: ["mesh-instances"] });
      void qc.invalidateQueries({ queryKey: ["mesh-summary"] });
    },
    onError: (e) => toast.error(apiErr(e)),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => apiPostJson<{ message?: string; nodesCount?: number; usersCount?: number }>(`/api/ops/mesh/instances/${id}/test`, {}),
    onSuccess: (res) => toast.success(`${res.message ?? "连接成功"}（节点 ${res.nodesCount ?? "?"} · 用户 ${res.usersCount ?? "?"}）`),
    onError: (e) => toast.error(apiErr(e)),
  });

  if (!instancesQ.isLoading && instances.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader isAdmin={isAdmin} onAdd={isAdmin ? openCreate : undefined} />
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Network className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-600">还没有异地组网控制面实例。</p>
          <p className="mt-1 text-xs text-slate-400">
            添加 Headscale 实例后，可在此管理节点、子网路由（router）、预授权密钥与站点间流量监控。
          </p>
          {isAdmin ? (
            <Button type="button" size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> 添加 Headscale 实例
            </Button>
          ) : null}
        </div>
        {editorOpen ? <InstanceEditor /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader isAdmin={isAdmin} onAdd={isAdmin ? openCreate : undefined} />

      {instancesQ.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> 加载实例…</p>
      ) : null}

      {instances.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          {/* 实例列表 */}
          <div className="space-y-2">
            {instances.map((inst) => (
              <button
                key={inst.id}
                type="button"
                onClick={() => setSelectedId(inst.id)}
                className={cn(
                  "w-full rounded-xl border px-3.5 py-3 text-left transition-colors",
                  inst.id === selectedId
                    ? "border-indigo-300 bg-indigo-50/70"
                    : "border-slate-200 bg-white hover:border-slate-300",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Server className="h-4 w-4 text-indigo-600" /> {inst.name}
                  </span>
                  {!inst.enabled ? <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">停用</span> : null}
                </div>
                {inst.region ? <p className="mt-0.5 text-xs text-slate-500">{inst.region}</p> : null}
                <p className="mt-1 truncate font-mono text-[10px] text-slate-400">{inst.apiUrl}</p>
              </button>
            ))}
            {isAdmin ? (
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={openCreate}>
                <Plus className="mr-1 h-3.5 w-3.5" /> 添加实例
              </Button>
            ) : null}
          </div>

          {/* 实例详情 */}
          {selected ? (
            <InstanceDetail
              key={selected.id}
              inst={selected}
              isAdmin={isAdmin}
              onEdit={() => openEdit(selected)}
              onAddCollector={(s) => openEdit(selected, s)}
            />
          ) : null}
        </div>
      ) : null}

      {editorOpen ? <InstanceEditor /> : null}
    </div>
  );

  // ── 实例新增/编辑弹窗（闭包使用上方 state，故定义在组件函数体内）──
  function InstanceEditor() {
    const updCollector = (idx: number, patch: Partial<TrafficCollector>) =>
      setDraft((d) => {
        const cs = [...(d.trafficCollectors ?? [])];
        cs[idx] = { ...cs[idx], ...patch };
        return { ...d, trafficCollectors: cs };
      });
    return (
      <Dialog open onOpenChange={(o) => { if (!o) setEditorOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? "编辑实例" : "添加 Headscale 实例"}</DialogTitle>
            <DialogDescription>
              API 地址建议填写控制面可达地址；若公网域名前有 WAF/网关，可改用直连地址。API Key 仅加密存储、不回显。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>名称 *</Label>
              <Input value={draft.name} placeholder="公网控制面" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>区域 / 备注（站点）</Label>
              <Input value={draft.region ?? ""} placeholder="腾讯云公网 / 威海 ops / 北京 ukx-nas" onChange={(e) => setDraft((d) => ({ ...d, region: e.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>API 地址 *（Headscale server_url）</Label>
              <Input value={draft.apiUrl} placeholder="https://headscale.example.com" onChange={(e) => setDraft((d) => ({ ...d, apiUrl: e.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>API Key {draft.apiKeySet ? "（已保存，留空保留；填 - 清除）" : ""}</Label>
              <Input type="password" value={apiKeyInput} autoComplete="off" placeholder="hskey-api-…" onChange={(e) => setApiKeyInput(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Metrics 地址（可选，默认 http://&lt;host&gt;:9090/metrics）</Label>
              <Input value={draft.metricsUrl ?? ""} placeholder="http://x.x.x.x:9090/metrics" onChange={(e) => setDraft((d) => ({ ...d, metricsUrl: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Headplane 地址（可选，用于跳转）</Label>
              <Input value={draft.headplaneUrl ?? ""} placeholder="https://headplane.example.com" onChange={(e) => setDraft((d) => ({ ...d, headplaneUrl: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))} />
              <Label>启用该实例（停用后不在 Dashboard 汇总中探测）</Label>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>备注</Label>
              <Textarea rows={2} value={draft.notes ?? ""} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
            </div>
          </div>

          {/* 流量采集器 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-800">流量采集器（SSH 到子网路由节点取 tailscale 流量计数）</Label>
              <Button type="button" variant="secondary" size="sm"
                onClick={() => setDraft((d) => ({
                  ...d,
                  trafficCollectors: [...(d.trafficCollectors ?? []), { id: `tc-${Date.now()}`, name: "", host: "", port: 22, user: "root", passSet: false }],
                }))}>
                <Plus className="mr-1 h-3.5 w-3.5" /> 添加采集器
              </Button>
            </div>
            {(draft.trafficCollectors ?? []).map((c, idx) => (
              <div key={c.id} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <div className="grid gap-2 sm:grid-cols-12">
                  <div className="space-y-1 sm:col-span-3">
                    <Label className="text-xs">名称</Label>
                    <Input className="h-8 text-xs" value={c.name} placeholder="ops 路由节点" onChange={(e) => updCollector(idx, { name: e.target.value })} />
                  </div>
                  <div className="space-y-1 sm:col-span-3">
                    <Label className="text-xs">主机</Label>
                    <Input className="h-8 text-xs" value={c.host} placeholder="100.64.0.1" onChange={(e) => updCollector(idx, { host: e.target.value })} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">端口</Label>
                    <Input className="h-8 text-xs" type="number" value={c.port || 22} onChange={(e) => updCollector(idx, { port: parseInt(e.target.value, 10) || 22 })} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">用户</Label>
                    <Input className="h-8 text-xs" value={c.user} placeholder="root" onChange={(e) => updCollector(idx, { user: e.target.value })} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">密码 {c.passSet ? "（已存）" : ""}</Label>
                    <Input className="h-8 text-xs" type="password" autoComplete="off" value={collectorPassInput[c.id] ?? ""} onChange={(e) => setCollectorPassInput((m) => ({ ...m, [c.id]: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">采集命令（可选，默认 tailscale status --json）</Label>
                  <Input className="h-8 font-mono text-[11px]" value={c.command ?? ""} placeholder="容器化部署示例：/usr/local/bin/docker exec tailscale-router tailscale status --json" onChange={(e) => updCollector(idx, { command: e.target.value })} />
                </div>
                <div className="flex items-center justify-end">
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-red-600"
                    onClick={() => setDraft((d) => ({ ...d, trafficCollectors: (d.trafficCollectors ?? []).filter((x) => x.id !== c.id) }))}>
                    <Trash2 className="mr-1 h-3 w-3" /> 移除
                  </Button>
                </div>
              </div>
            ))}
            <p className="text-[11px] text-slate-500">
              采集器在路由节点上执行采集命令解析 <code className="rounded bg-slate-100 px-1">tailscale status --json</code>；
              普通执行失败时自动用已存 SSH 密码走 <code className="rounded bg-slate-100 px-1">sudo -S</code> 重试（群晖等容器化部署适用）。
              首次连接自动记录 host key 指纹，之后指纹变化将拒绝连接。
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>取消</Button>
            <Button type="button" disabled={saveMut.isPending || !draft.name.trim() || !draft.apiUrl.trim()} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} 保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
};

// ──────────────────────────── 子组件 ────────────────────────────

const PageHeader: React.FC<{ isAdmin: boolean; onAdd?: () => void }> = ({ isAdmin, onAdd }) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
        <Network className="h-6 w-6 text-indigo-600" /> 异地组网
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Headscale 控制面管理：节点、子网路由（router）、预授权密钥与站点间流量监控；登录用户经 Authentik（OIDC）注册。
      </p>
    </div>
    {isAdmin && onAdd ? (
      <Button type="button" size="sm" onClick={onAdd}><Plus className="mr-1 h-4 w-4" /> 添加实例</Button>
    ) : null}
  </div>
);

const InstanceDetail: React.FC<{
  inst: MeshInstance;
  isAdmin: boolean;
  onEdit: () => void;
  onAddCollector: (s: CollectorSuggestion) => void;
}> = ({ inst, isAdmin, onEdit, onAddCollector }) => {
  const qc = useQueryClient();
  const discoverQ = useQuery({
    queryKey: ["mesh-discover", inst.id],
    queryFn: () => apiGetJson<Discover>(`/api/ops/mesh/instances/${inst.id}/discover`),
  });
  const ov = discoverQ.data;
  const nodes = ov?.nodes ?? [];

  const [confirmDel, setConfirmDel] = useState(false);
  const delMut = useMutation({
    mutationFn: () => apiDeleteJson(`/api/ops/mesh/instances/${inst.id}`),
    onSuccess: () => {
      toast.success("实例已删除");
      void qc.invalidateQueries({ queryKey: ["mesh-instances"] });
      void qc.invalidateQueries({ queryKey: ["mesh-summary"] });
    },
    onError: (e) => toast.error(apiErr(e)),
  });

  // 自动发现：刷新控制面聚合 + 静默触发一次流量采集（有采集器时）
  const collectSilentMut = useMutation({
    mutationFn: () => apiPostJson(`/api/ops/mesh/instances/${inst.id}/traffic`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["mesh-traffic", inst.id] });
      void qc.invalidateQueries({ queryKey: ["mesh-discover", inst.id] });
      void qc.invalidateQueries({ queryKey: ["mesh-instances"] });
    },
    onError: () => { /* 静默：采集失败不阻塞发现 */ },
  });
  const runDiscover = () => {
    discoverQ.refetch();
    if (isAdmin && (inst.trafficCollectors ?? []).length > 0) collectSilentMut.mutate();
  };

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-slate-900">{inst.name}</h2>
            {ov ? (
              ov.health ? (
                <span className="flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700"><CheckCircle2 className="h-3 w-3" /> 健康{ov.version ? ` · v${ov.version}` : ""}</span>
              ) : (
                <span className="flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700"><AlertTriangle className="h-3 w-3" /> 不可达</span>
              )
            ) : null}
          </div>
          <p className="truncate font-mono text-[11px] text-slate-400">{inst.apiUrl}{inst.headplaneUrl ? " · headplane 可用" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={runDiscover}
            disabled={discoverQ.isFetching || collectSilentMut.isPending}>
            <RefreshCw className={cn("mr-1 h-3 w-3", (discoverQ.isFetching || collectSilentMut.isPending) && "animate-spin")} /> 自动发现
          </Button>
          {inst.headplaneUrl ? (
            <a href={inst.headplaneUrl} target="_blank" rel="noreferrer">
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs"><ExternalLink className="mr-1 h-3 w-3" /> Headplane</Button>
            </a>
          ) : null}
          {isAdmin ? (
            <>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onEdit}><Pencil className="mr-1 h-3 w-3" /> 编辑</Button>
              {confirmDel ? (
                <Button type="button" size="sm" variant="destructive" className="h-7 text-xs" disabled={delMut.isPending}
                  onClick={() => { delMut.mutate(); setConfirmDel(false); }}>
                  确认删除？
                </Button>
              ) : (
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => setConfirmDel(true)}>
                  <Trash2 className="mr-1 h-3 w-3" />
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>

      <div className="p-4">
        <Tabs defaultValue="topology">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="topology"><Network className="mr-1 h-3.5 w-3.5" /> 拓扑总览</TabsTrigger>
            <TabsTrigger value="nodes"><Server className="mr-1 h-3.5 w-3.5" /> 节点与路由</TabsTrigger>
            <TabsTrigger value="keys"><KeyRound className="mr-1 h-3.5 w-3.5" /> 预授权密钥</TabsTrigger>
            <TabsTrigger value="traffic"><Activity className="mr-1 h-3.5 w-3.5" /> 流量监控</TabsTrigger>
            <TabsTrigger value="service"><Globe className="mr-1 h-3.5 w-3.5" /> 服务信息</TabsTrigger>
          </TabsList>

          {/* 拓扑总览 */}
          <TabsContent value="topology" className="mt-3">
            <TopologyPanel discover={ov} isAdmin={isAdmin} onAddCollector={onAddCollector} />
          </TabsContent>

          {/* 节点与路由 */}
          <TabsContent value="nodes" className="mt-3">
            {ov?.nodesError ? <p className="mb-2 text-xs text-red-600">节点加载失败：{ov.nodesError}</p> : null}
            <NodesTable nodes={nodes} instanceId={inst.id} isAdmin={isAdmin} />
          </TabsContent>

          {/* 密钥 */}
          <TabsContent value="keys" className="mt-3">
            <PreAuthKeysPanel instanceId={inst.id} isAdmin={isAdmin} keys={ov?.preAuthKeys ?? []} users={ov?.users ?? []} onChanged={() => discoverQ.refetch()} />
          </TabsContent>

          {/* 流量监控 */}
          <TabsContent value="traffic" className="mt-3">
            <TrafficPanel instance={inst} isAdmin={isAdmin} />
          </TabsContent>

          {/* 服务信息 */}
          <TabsContent value="service" className="mt-3">
            <ServicePanel discover={ov} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// ── 拓扑总览（自动发现）──

const TopologyPanel: React.FC<{ discover?: Discover; isAdmin: boolean; onAddCollector: (s: CollectorSuggestion) => void }> = ({ discover, isAdmin, onAddCollector }) => {
  if (!discover) {
    return <p className="flex items-center gap-2 py-6 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> 发现中…</p>;
  }
  if (!discover.health) {
    return <p className="rounded-xl border border-red-200 bg-red-50/70 px-3 py-3 text-xs text-red-700">控制面不可达：{discover.error}</p>;
  }
  const sites = discover.sites ?? [];
  const links = discover.links ?? [];
  const suggestions = discover.collectorSuggestions ?? [];
  const nodes = discover.nodes ?? [];
  const online = nodes.filter((n) => n.online).length;
  const withOs = nodes.filter((n) => n.os).length;

  return (
    <div className="space-y-4">
      {/* 汇总条 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCard icon={<Server className="h-4 w-4" />} label="节点" value={String(nodes.length)} />
        <StatCard icon={<Wifi className="h-4 w-4" />} label="在线" value={String(online)} tone="emerald" />
        <StatCard icon={<Router className="h-4 w-4" />} label="站点/子网" value={String(sites.length)} tone="sky" />
        <StatCard icon={<Activity className="h-4 w-4" />} label="链路" value={String(links.length)} tone="violet" />
        <StatCard icon={<Globe className="h-4 w-4" />} label="已识别设备类型" value={`${withOs}/${nodes.length}`} />
      </div>

      {/* 站点 */}
      <div>
        <p className="mb-2 text-xs font-semibold text-slate-800">站点（子网路由器）</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((s) => (
            <div key={s.subnet + s.routerId} className={cn("rounded-xl border p-3", s.approved ? "border-sky-200 bg-sky-50/50" : "border-amber-200 bg-amber-50/50")}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-slate-900">{s.subnet}</span>
                {s.online ? <span className="flex items-center gap-1 text-[10px] text-emerald-700"><Wifi className="h-3 w-3" /> 在线</span> : <span className="text-[10px] text-slate-400">离线</span>}
              </div>
              <p className="mt-1 text-[11px] text-slate-600">
                路由器 <span className="font-medium">{s.router}</span>
                {s.tailscaleIp ? <span className="ml-1 font-mono text-[10px] text-slate-400">{s.tailscaleIp}</span> : null}
              </p>
              <p className="mt-0.5 text-[10px]">
                {s.approved ? (
                  <span className="text-sky-700">已审批 · 加入 {fmtTime(s.lastSeen)}</span>
                ) : (
                  <span className="text-amber-700">已宣告待审批</span>
                )}
              </p>
            </div>
          ))}
          {sites.length === 0 ? <p className="text-xs text-slate-400">未发现子网路由器（无站点宣告）。</p> : null}
        </div>
      </div>

      {/* 链路 */}
      <div>
        <p className="mb-2 text-xs font-semibold text-slate-800">站点间链路（来自路由节点侧采集）</p>
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-1.5 font-medium">起点</th>
                <th className="px-3 py-1.5 font-medium">对端</th>
                <th className="px-3 py-1.5 font-medium">路径</th>
                <th className="px-3 py-1.5 font-medium">收 ↓ / 发 ↑</th>
                <th className="px-3 py-1.5 font-medium">采样时间</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l, i) => (
                <tr key={`${l.from}-${l.to}-${i}`} className="border-t border-slate-50">
                  <td className="px-3 py-1.5 font-medium text-slate-800">{l.from}</td>
                  <td className="px-3 py-1.5 font-medium text-slate-800">{l.to}</td>
                  <td className="px-3 py-1.5">
                    {l.via === "direct" ? (
                      <span className="font-mono text-[10px] text-emerald-700" title={l.curAddr}>直连 {l.curAddr}</span>
                    ) : (
                      <span className="text-[10px] text-amber-700">DERP {l.relay}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-slate-600">{fmtBytes(l.rxBytes)} / {fmtBytes(l.txBytes)}</td>
                  <td className="px-3 py-1.5 text-slate-400">{fmtTime(l.seenAt)}</td>
                </tr>
              ))}
              {links.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                  暂无链路数据：请先在「流量监控」配置采集器并采集一次（拓扑按钮「自动发现」会同时触发采集）。
                </td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* 采集器建议 */}
      {isAdmin && suggestions.length > 0 ? (
        <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-3">
          <p className="text-xs font-semibold text-indigo-900">建议添加的流量采集器</p>
          <p className="mt-0.5 text-[11px] text-indigo-700/80">以下子网路由器尚未配置采集节点侧流量的 SSH 采集器：</p>
          <ul className="mt-2 space-y-1.5">
            {suggestions.map((s) => (
              <li key={s.routerId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 px-2.5 py-1.5">
                <span className="text-xs text-slate-800">{s.name} <span className="ml-1 font-mono text-[10px] text-slate-400">{s.host}:{s.port}</span></span>
                <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => onAddCollector(s)}>
                  <Plus className="mr-1 h-3 w-3" /> 添加到实例
                </Button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-indigo-700/70">
            添加后补一个 SSH 密码即可；若节点是容器化 tailscale（如群晖），在「采集命令」里填 docker exec 形式的命令。
          </p>
        </div>
      ) : null}
    </div>
  );
};

// ── 节点表（含路由管理）──

const NodesTable: React.FC<{ nodes: DiscoveredNode[]; instanceId: string; isAdmin: boolean }> = ({ nodes, instanceId, isAdmin }) => {
  const qc = useQueryClient();
  const [routeEditId, setRouteEditId] = useState("");
  const [routesDraft, setRoutesDraft] = useState("");
  const [confirmNodeId, setConfirmNodeId] = useState("");

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["mesh-overview", instanceId] });
    void qc.invalidateQueries({ queryKey: ["mesh-summary"] });
  };

  const routesMut = useMutation({
    mutationFn: (p: { nid: string; routes: string[] }) => apiPostJson(`/api/ops/mesh/instances/${instanceId}/nodes/${p.nid}/routes`, { routes: p.routes }),
    onSuccess: () => { toast.success("路由已更新"); setRouteEditId(""); invalidate(); },
    onError: (e) => toast.error(apiErr(e)),
  });
  const nodeMut = useMutation({
    mutationFn: (p: { nid: string; action: "expire" | "delete" }) =>
      p.action === "expire"
        ? apiPostJson(`/api/ops/mesh/instances/${instanceId}/nodes/${p.nid}/expire`, {})
        : apiDeleteJson(`/api/ops/mesh/instances/${instanceId}/nodes/${p.nid}`),
    onSuccess: (_r, p) => { toast.success(p.action === "expire" ? "节点密钥已过期" : "节点已删除"); setConfirmNodeId(""); invalidate(); },
    onError: (e) => toast.error(apiErr(e)),
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full min-w-[860px] text-left text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">节点</th>
            <th className="px-3 py-2 font-medium">Tailscale IP</th>
            <th className="px-3 py-2 font-medium">类型</th>
            <th className="px-3 py-2 font-medium">用户</th>
            <th className="px-3 py-2 font-medium">状态</th>
            <th className="px-3 py-2 font-medium">子网路由（router）</th>
            <th className="px-3 py-2 font-medium">最近在线</th>
            <th className="px-3 py-2 font-medium">加入时间</th>
            {isAdmin ? <th className="px-3 py-2 font-medium">操作</th> : null}
          </tr>
        </thead>
        <tbody>
          {nodes.map((n) => (
            <tr key={n.id} className="border-t border-slate-50 align-top hover:bg-slate-50/60">
              <td className="px-3 py-2 font-medium text-slate-900">
                {n.givenName || n.name}
                {(n.tags ?? []).length > 0 ? (
                  <span className="ml-1 rounded bg-indigo-50 px-1 text-[10px] text-indigo-700">{(n.tags ?? []).join(",")}</span>
                ) : null}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{(n.ipAddresses ?? []).filter((ip) => ip.startsWith("100.")).join(", ") || "—"}</td>
              <td className="px-3 py-2">
                {n.os ? (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">{n.os}</span>
                ) : (
                  <span className="text-[10px] text-slate-300" title="由流量采集器自动补齐">待采集</span>
                )}
                {n.registerMethod === "REGISTER_METHOD_OIDC" ? (
                  <span className="ml-1 rounded bg-violet-50 px-1 text-[10px] text-violet-700">OIDC</span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-slate-600">{n.user?.name ?? "—"}</td>
              <td className="px-3 py-2">
                {n.online ? (
                  <span className="flex items-center gap-1 text-emerald-700"><Wifi className="h-3 w-3" /> 在线</span>
                ) : (
                  <span className="flex items-center gap-1 text-slate-400"><WifiOff className="h-3 w-3" /> 离线</span>
                )}
              </td>
              <td className="px-3 py-2">
                {(n.approvedRoutes ?? []).length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {(n.approvedRoutes ?? []).map((r) => (
                      <span key={r} className="flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 font-mono text-[10px] text-sky-800"><RouteIcon className="h-3 w-3" /> {r}</span>
                    ))}
                  </div>
                ) : (n.availableRoutes ?? []).length > 0 ? (
                  <span className="text-[10px] text-amber-700">已宣告待审批：{(n.availableRoutes ?? []).join(", ")}</span>
                ) : (
                  <span className="text-[10px] text-slate-300">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-slate-500">{fmtTime(n.lastSeen)}</td>
              <td className="px-3 py-2 text-slate-500" title={n.createdAt ?? ""}>{fmtTime(n.createdAt)}</td>
              {isAdmin ? (
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(n.availableRoutes ?? []).length > 0 ? (
                      <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]"
                        onClick={() => { setRouteEditId(n.id); setRoutesDraft((n.availableRoutes ?? []).join("\n")); }}>
                        <Router className="mr-1 h-3 w-3" /> 路由
                      </Button>
                    ) : null}
                    {confirmNodeId === n.id ? (
                      <Button type="button" size="sm" variant="destructive" className="h-6 px-2 text-[11px]"
                        onClick={() => nodeMut.mutate({ nid: n.id, action: "delete" })}>
                        确认删除？
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-slate-500"
                        onClick={() => setConfirmNodeId(n.id)}>删除</Button>
                    )}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
          {nodes.length === 0 ? (
            <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">暂无节点</td></tr>
          ) : null}
        </tbody>
      </table>

      <Dialog open={routeEditId !== ""} onOpenChange={(o) => { if (!o) setRouteEditId(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Router className="h-4 w-4 text-sky-600" /> 管理子网路由</DialogTitle>
            <DialogDescription>
              每行一条 CIDR。提交为<strong>覆盖式审批</strong>：不在列表中的已宣告路由将被取消；清空则全部取消审批。
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={4} className="font-mono text-xs" value={routesDraft} onChange={(e) => setRoutesDraft(e.target.value)} placeholder={"192.168.21.0/24"} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRouteEditId("")}>取消</Button>
            <Button type="button" disabled={routesMut.isPending}
              onClick={() => routesMut.mutate({
                nid: routeEditId,
                routes: routesDraft.split("\n").map((s) => s.trim()).filter(Boolean),
              })}>
              {routesMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} 提交审批
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── 预授权密钥 ──

const PreAuthKeysPanel: React.FC<{
  instanceId: string; isAdmin: boolean; keys: HSPreAuthKey[]; users: HSUser[]; onChanged: () => void;
}> = ({ instanceId, isAdmin, keys, users, onChanged }) => {
  const [user, setUser] = useState(users[0]?.name ?? "");
  const [reusable, setReusable] = useState(false);
  const [ephemeral, setEphemeral] = useState(false);
  const [hours, setHours] = useState(1);
  const [created, setCreated] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user && users.length > 0) setUser(users[0].name);
  }, [users, user]);

  const createMut = useMutation({
    mutationFn: () => apiPostJson<{ key?: HSPreAuthKey }>(`/api/ops/mesh/instances/${instanceId}/keys`, { user, reusable, ephemeral, hours }),
    onSuccess: (res) => {
      if (res.key?.key) setCreated(res.key.key);
      toast.success("密钥已创建（仅此次展示完整值）");
      onChanged();
    },
    onError: (e) => toast.error(apiErr(e)),
  });
  const expireMut = useMutation({
    mutationFn: (p: { user: string; key: string }) => apiPostJson(`/api/ops/mesh/instances/${instanceId}/keys/expire`, p),
    onSuccess: () => { toast.success("密钥已过期"); onChanged(); },
    onError: (e) => toast.error(apiErr(e)),
  });

  return (
    <div className="space-y-4">
      {isAdmin ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <div className="space-y-1">
            <Label className="text-xs">用户</Label>
            <select className="h-8 rounded border border-slate-200 bg-white px-2 text-xs" value={user} onChange={(e) => setUser(e.target.value)}>
              {users.map((u) => <option key={u.id} value={u.name}>{u.name}{u.provider === "oidc" ? "（OIDC）" : ""}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">有效期（小时）</Label>
            <Input className="h-8 w-24 text-xs" type="number" min={1} value={hours} onChange={(e) => setHours(parseInt(e.target.value, 10) || 1)} />
          </div>
          <label className="flex items-center gap-1.5 pb-1.5 text-xs text-slate-700">
            <input type="checkbox" checked={reusable} onChange={(e) => setReusable(e.target.checked)} /> 可复用
          </label>
          <label className="flex items-center gap-1.5 pb-1.5 text-xs text-slate-700">
            <input type="checkbox" checked={ephemeral} onChange={(e) => setEphemeral(e.target.checked)} /> 临时节点
          </label>
          <Button type="button" size="sm" className="h-8" disabled={createMut.isPending || !user} onClick={() => { setCopied(false); createMut.mutate(); }}>
            {createMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />} 创建密钥
          </Button>
        </div>
      ) : null}

      {created ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-emerald-900">{created}</code>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => { void navigator.clipboard.writeText(created).catch(() => {}); setCopied(true); }}>
            {copied ? "已复制" : "复制"}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreated("")}>关闭</Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Key（打码）</th>
              <th className="px-3 py-2 font-medium">用户</th>
              <th className="px-3 py-2 font-medium">属性</th>
              <th className="px-3 py-2 font-medium">过期时间</th>
              <th className="px-3 py-2 font-medium">创建时间</th>
              {isAdmin ? <th className="px-3 py-2 font-medium">操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const expired = k.expiration ? Date.parse(k.expiration) < Date.now() : false;
              return (
                <tr key={k.id} className="border-t border-slate-50">
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-700">{k.key}</td>
                  <td className="px-3 py-2 text-slate-600">{k.user?.name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="mr-1 rounded bg-slate-100 px-1 text-[10px] text-slate-600">{k.reusable ? "可复用" : "一次性"}</span>
                    {k.ephemeral ? <span className="mr-1 rounded bg-violet-50 px-1 text-[10px] text-violet-700">临时</span> : null}
                    {k.used ? <span className="rounded bg-amber-50 px-1 text-[10px] text-amber-700">已使用</span> : null}
                  </td>
                  <td className={cn("px-3 py-2", expired ? "text-red-500" : "text-slate-600")}>
                    {k.expiration ? new Date(k.expiration).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{fmtTime(k.createdAt)}</td>
                  {isAdmin ? (
                    <td className="px-3 py-2">
                      {!expired ? (
                        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-red-600"
                          onClick={() => expireMut.mutate({ user: k.user?.name ?? "", key: k.key })}>
                          使过期
                        </Button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
            {keys.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">暂无预授权密钥</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── 流量监控 ──

const TrafficPanel: React.FC<{ instance: MeshInstance; isAdmin: boolean }> = ({ instance, isAdmin }) => {
  const qc = useQueryClient();
  const cacheQ = useQuery({
    queryKey: ["mesh-traffic", instance.id],
    queryFn: () => apiGetJson<{ snapshots: TrafficSnapshot[] }>(`/api/ops/mesh/instances/${instance.id}/traffic`),
  });
  const collectMut = useMutation({
    mutationFn: () => apiPostJson<{ snapshots: TrafficSnapshot[] }>(`/api/ops/mesh/instances/${instance.id}/traffic`, {}),
    onSuccess: () => { toast.success("采集完成"); void qc.invalidateQueries({ queryKey: ["mesh-traffic", instance.id] }); void qc.invalidateQueries({ queryKey: ["mesh-instances"] }); },
    onError: (e) => toast.error(apiErr(e)),
  });

  const snapshots = cacheQ.data?.snapshots ?? [];
  const collectors = instance.trafficCollectors ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          流量数据来自子网路由节点侧（<code className="rounded bg-slate-100 px-1">tailscale status --json</code> 的累计 Rx/Tx 计数，自 tailscaled 启动起）；
          Headscale 服务端不经过 P2P 数据面，无节点间流量指标。
        </p>
        {isAdmin ? (
          <Button type="button" size="sm" className="h-7 text-xs" disabled={collectMut.isPending || collectors.length === 0} onClick={() => collectMut.mutate()}>
            {collectMut.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />} 立即采集
          </Button>
        ) : null}
      </div>

      {collectors.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
          未配置流量采集器。编辑实例，添加 SSH 采集器（指向 ops / ukx-nas 等子网路由节点）后即可采集流量。
        </p>
      ) : null}

      {snapshots.map((s) => (
        <div key={s.collectorId} className="rounded-xl border border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-50 px-3 py-2">
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-800">
              <Activity className="h-3.5 w-3.5 text-indigo-600" /> {s.collectorName || s.host}
              {s.selfHostName ? <span className="font-mono text-[10px] font-normal text-slate-400">{s.selfHostName}{s.version ? ` · ${s.version.split("-")[0]}` : ""}</span> : null}
            </p>
            <p className="text-[10px] text-slate-400">采集于 {fmtTime(s.collectedAt)}</p>
          </div>
          {s.error ? (
            <p className="px-3 py-3 text-xs text-red-600">{s.error}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="bg-slate-50/60 text-slate-500">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">对端</th>
                    <th className="px-3 py-1.5 font-medium">状态</th>
                    <th className="px-3 py-1.5 font-medium">接收 ↓</th>
                    <th className="px-3 py-1.5 font-medium">发送 ↑</th>
                    <th className="px-3 py-1.5 font-medium">连接</th>
                  </tr>
                </thead>
                <tbody>
                  {(s.peers ?? []).map((p) => (
                    <tr key={p.hostName + (p.tailscaleIps?.[0] ?? "")} className="border-t border-slate-50">
                      <td className="px-3 py-1.5">
                        <span className="font-medium text-slate-800">{p.hostName}</span>
                        <span className="ml-1 font-mono text-[10px] text-slate-400">{(p.tailscaleIps ?? []).find((ip) => ip.startsWith("100.")) ?? ""}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        {p.online ? <span className="text-emerald-700">在线</span> : <span className="text-slate-400">{fmtTime(p.lastSeen)}</span>}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-slate-700">{fmtBytes(p.rxBytes)}</td>
                      <td className="px-3 py-1.5 font-mono text-slate-700">{fmtBytes(p.txBytes)}</td>
                      <td className="px-3 py-1.5">
                        {p.curAddr ? (
                          <span className="font-mono text-[10px] text-sky-700" title="直连">直连 {p.curAddr}</span>
                        ) : p.relay ? (
                          <span className="text-[10px] text-amber-700">DERP {p.relay}</span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {collectors.length > 0 && snapshots.length === 0 ? (
        <p className="text-center text-xs text-slate-400">尚无快照，点击「立即采集」获取流量数据。</p>
      ) : null}
    </div>
  );
};

// ── 服务信息 ──

const ServicePanel: React.FC<{ discover?: Discover }> = ({ discover: ov }) => {
  const metricsQ = useQuery({
    queryKey: ["mesh-metrics", ov?.instance?.id],
    queryFn: () => apiGetJson<{ metricsUrl?: string; samples: MetricSample[] }>(`/api/ops/mesh/instances/${ov!.instance.id}/metrics`),
    enabled: Boolean(ov?.instance?.id),
    staleTime: 30_000,
  });
  const nodes = ov?.nodes ?? [];
  const onlineCount = nodes.filter((n) => n.online).length;
  const routesTotal = nodes.reduce((acc, n) => acc + (n.approvedRoutes?.length ?? 0), 0);
  const oidcUsers = (ov?.users ?? []).filter((u) => u.provider === "oidc").length;
  const version = ov?.version ?? (metricsQ.data?.samples ?? []).find((s) => s.name === "headscale_build_info")?.labels?.version;

  return (
    <div className="space-y-4">
      {ov && !ov.health ? (
        <p className="rounded-xl border border-red-200 bg-red-50/70 px-3 py-2 text-xs text-red-700">控制面不可达：{ov.error}</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard icon={<Server className="h-4 w-4" />} label="节点总数" value={String(nodes.length)} />
        <StatCard icon={<Wifi className="h-4 w-4" />} label="在线" value={String(onlineCount)} tone="emerald" />
        <StatCard icon={<Router className="h-4 w-4" />} label="已批路由" value={String(routesTotal)} tone="sky" />
        <StatCard icon={<KeyRound className="h-4 w-4" />} label="OIDC 用户" value={String(oidcUsers)} tone="violet" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-100 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-800">用户（Authentik OIDC 同步）</p>
          <ul className="space-y-1 text-xs text-slate-600">
            {(ov?.users ?? []).map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{u.displayName || u.name}</span>
                <span className="shrink-0 text-[10px] text-slate-400">{u.provider === "oidc" ? `OIDC · ${u.email || u.name}` : "本地"}</span>
              </li>
            ))}
            {(ov?.users ?? []).length === 0 ? <li className="text-slate-400">暂无</li> : null}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-100 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-800">控制面指标（Prometheus /metrics）</p>
          {metricsQ.isError ? (
            <p className="text-xs text-red-600">metrics 获取失败：{apiErr(metricsQ.error)}</p>
          ) : (
            <ul className="max-h-48 space-y-0.5 overflow-y-auto font-mono text-[10px] text-slate-600">
              <li>version: {version ?? "—"}</li>
              {(metricsQ.data?.samples ?? [])
                .filter((s) => s.name !== "headscale_build_info")
                .slice(0, 40)
                .map((s, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">{s.name}{s.labels && Object.keys(s.labels).length ? `{${Object.entries(s.labels).map(([k, v]) => `${k}=${v}`).join(",")}}` : ""}</span>
                    <span className="shrink-0 tabular-nums">{s.value}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; tone?: "emerald" | "sky" | "violet" }> = ({ icon, label, value, tone }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
    <p className={cn("flex items-center gap-1.5 text-[11px] text-slate-500",
      tone === "emerald" && "text-emerald-700", tone === "sky" && "text-sky-700", tone === "violet" && "text-violet-700")}>
      {icon} {label}
    </p>
    <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
  </div>
);

export default MeshPage;
