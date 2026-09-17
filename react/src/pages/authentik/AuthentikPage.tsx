import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, Copy, Fingerprint, KeyRound, Loader2, Plus, RefreshCw, ShieldCheck,
  Trash2, UserPlus, Users, XCircle,
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

type AKInstance = {
  id: string; name: string; baseUrl: string; tokenSet: boolean;
  enabled: boolean; notes?: string; createdAt: string; updatedAt: string;
};

type AKUser = {
  pk: number; username: string; name: string; email: string;
  is_active: boolean; groups: string[]; type?: string;
  last_login?: string; path?: string;
};

type AKGroup = { pk: string; name: string; parent?: string };

type AKApp = { pk: string; name: string; slug: string; provider?: unknown; meta_launch_url?: string };

type AKRedirectURI = { url: string; matching_mode?: string };

type AKProvider = {
  pk: number; name: string; client_id: string;
  redirect_uris?: AKRedirectURI[]; sub_mode?: string; client_secret?: string;
};

type AKStatus = {
  instance: AKInstance; healthy: boolean; error?: string; version?: string;
  system?: Record<string, unknown>;
  usersCount?: number; groupsCount?: number; appsCount?: number; providersCount?: number;
};

const emptyInstance = (): AKInstance => ({
  id: "", name: "", baseUrl: "", tokenSet: false, enabled: true, notes: "", createdAt: "", updatedAt: "",
});

const fmtTime = (iso?: string) => {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(t).toLocaleString();
};

const apiErr = (e: unknown) => (e instanceof ApiHttpError ? e.serverMessage : e instanceof Error ? e.message : String(e));

// ──────────────────────────── 页面 ────────────────────────────

const AuthentikPage: React.FC = () => {
  const qc = useQueryClient();
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";

  const instancesQ = useQuery({
    queryKey: ["authentik-instances"],
    queryFn: () => apiGetJson<{ instances: AKInstance[] }>("/api/ops/authentik/instances"),
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

  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<AKInstance>(emptyInstance());
  const [tokenInput, setTokenInput] = useState("");

  const openCreate = () => {
    setDraft(emptyInstance());
    setTokenInput("");
    setEditorOpen(true);
  };
  const openEdit = (inst: AKInstance) => {
    setDraft({ ...inst });
    setTokenInput("");
    setEditorOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: () =>
      apiPutJson("/api/ops/authentik/instances", {
        id: draft.id || undefined,
        name: draft.name,
        baseUrl: draft.baseUrl,
        token: tokenInput || undefined,
        enabled: draft.enabled,
        notes: draft.notes,
      }),
    onSuccess: () => {
      toast.success("实例已保存");
      setEditorOpen(false);
      void qc.invalidateQueries({ queryKey: ["authentik-instances"] });
      void qc.invalidateQueries({ queryKey: ["authentik-summary"] });
    },
    onError: (e) => toast.error(apiErr(e)),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => apiPostJson<{ message?: string; version?: string }>(`/api/ops/authentik/instances/${id}/test`, {}),
    onSuccess: (res) => toast.success(`${res.message ?? "连接成功"}${res.version ? ` · Authentik ${res.version}` : ""}`),
    onError: (e) => toast.error(apiErr(e)),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => apiDeleteJson(`/api/ops/authentik/instances/${id}`),
    onSuccess: () => {
      toast.success("实例已删除");
      setSelectedId("");
      void qc.invalidateQueries({ queryKey: ["authentik-instances"] });
    },
    onError: (e) => toast.error(apiErr(e)),
  });

  if (!instancesQ.isLoading && instances.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader isAdmin={isAdmin} onAdd={isAdmin ? openCreate : undefined} />
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <Fingerprint className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-600">还没有 Authentik 实例。</p>
          <p className="mt-1 text-xs text-slate-400">
            配置 Authentik 管理 API（Base URL + API Token）后，可在平台创建用户与应用、
            生成 OIDC 提供程序并关联用户组——无需登录 Authentik 控制台。
          </p>
          {isAdmin ? (
            <Button type="button" size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> 添加 Authentik 实例
            </Button>
          ) : null}
        </div>
        {editorOpen ? renderInstanceEditor() : null}
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
          <div className="space-y-2">
            {instances.map((inst) => (
              <button
                key={inst.id}
                type="button"
                onClick={() => setSelectedId(inst.id)}
                className={cn(
                  "w-full rounded-xl border px-3.5 py-3 text-left transition-colors",
                  inst.id === selectedId
                    ? "border-fuchsia-300 bg-fuchsia-50/70"
                    : "border-slate-200 bg-white hover:border-slate-300",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Fingerprint className="h-4 w-4 text-fuchsia-600" /> {inst.name}
                  </span>
                  {!inst.enabled ? <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">停用</span> : null}
                </div>
                <p className="mt-1 truncate font-mono text-[10px] text-slate-400">{inst.baseUrl}</p>
              </button>
            ))}
            {isAdmin ? (
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={openCreate}>
                <Plus className="mr-1 h-3.5 w-3.5" /> 添加实例
              </Button>
            ) : null}
          </div>

          {selected ? (
            <InstanceDetail
              key={selected.id}
              inst={selected}
              isAdmin={isAdmin}
              onEdit={() => openEdit(selected)}
            />
          ) : null}
        </div>
      ) : null}

      {editorOpen ? renderInstanceEditor() : null}
    </div>
  );

  // 注意：必须是「渲染函数」而不是内联组件——若写成 <InstanceEditor />，每次按键
  // 触发页面重渲染时函数身份变化会导致整个弹窗子树卸载重建（闪屏/丢焦点）。
  function renderInstanceEditor() {
    return (
      <Dialog open onOpenChange={(o) => { if (!o) setEditorOpen(false); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft.id ? "编辑实例" : "添加 Authentik 实例"}</DialogTitle>
            <DialogDescription>
              Token 在 Authentik 管理后台 → Directory → Tokens &amp; passwords 创建（建议授予 App superuser
              或按需范围）。Token 加密存储、界面不回显。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>名称 *</Label>
                <Input value={draft.name} placeholder="SSO 主站" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Base URL *</Label>
                <Input value={draft.baseUrl} placeholder="https://sso.example.com" onChange={(e) => setDraft((d) => ({ ...d, baseUrl: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>API Token {draft.tokenSet ? "（已保存，留空保留；填 - 清除）" : ""}</Label>
              <Input type="password" value={tokenInput} autoComplete="off" placeholder="粘贴 Authentik API Token" onChange={(e) => setTokenInput(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))} />
              <Label>启用该实例</Label>
            </div>
            <div className="space-y-1">
              <Label>备注</Label>
              <Textarea rows={2} value={draft.notes ?? ""} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>取消</Button>
            <Button type="button" disabled={saveMut.isPending || !draft.name.trim() || !draft.baseUrl.trim()} onClick={() => saveMut.mutate()}>
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
        <Fingerprint className="h-6 w-6 text-fuchsia-600" /> Authentik
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        统一认证管理：平台直建用户并关联组（如 headscale 的 OIDC 组）、创建应用与 OAuth2
        提供程序、查看状态与事件——常用配置无需登录 Authentik 控制台。
      </p>
    </div>
    {isAdmin && onAdd ? (
      <Button type="button" size="sm" onClick={onAdd}><Plus className="mr-1 h-4 w-4" /> 添加实例</Button>
    ) : null}
  </div>
);

const InstanceDetail: React.FC<{ inst: AKInstance; isAdmin: boolean; onEdit: () => void }> = ({ inst, isAdmin, onEdit }) => {
  const qc = useQueryClient();
  const statusQ = useQuery({
    queryKey: ["authentik-status", inst.id],
    queryFn: () => apiGetJson<AKStatus>(`/api/ops/authentik/instances/${inst.id}/status`),
  });
  const st = statusQ.data;

  const [confirmDel, setConfirmDel] = useState(false);
  const delMut = useMutation({
    mutationFn: () => apiDeleteJson(`/api/ops/authentik/instances/${inst.id}`),
    onSuccess: () => {
      toast.success("实例已删除");
      void qc.invalidateQueries({ queryKey: ["authentik-instances"] });
    },
    onError: (e) => toast.error(apiErr(e)),
  });

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-slate-900">{inst.name}</h2>
            {statusQ.isError ? (
              <span className="flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                <AlertTriangle className="h-3 w-3" /> {apiErr(statusQ.error)}
              </span>
            ) : st ? (
              st.healthy ? (
                <span className="flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> 健康{st.version ? ` · ${st.version}` : ""}
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700"><XCircle className="h-3 w-3" /> 不可达</span>
              )
            ) : null}
          </div>
          <p className="truncate font-mono text-[11px] text-slate-400">{inst.baseUrl}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => statusQ.refetch()}>
            <RefreshCw className={cn("mr-1 h-3 w-3", statusQ.isFetching && "animate-spin")} /> 刷新
          </Button>
          {isAdmin ? (
            <>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onEdit}>编辑</Button>
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
        <Tabs defaultValue="users">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="users"><Users className="mr-1 h-3.5 w-3.5" /> 用户</TabsTrigger>
            <TabsTrigger value="apps"><ShieldCheck className="mr-1 h-3.5 w-3.5" /> 应用对接</TabsTrigger>
            <TabsTrigger value="providers"><KeyRound className="mr-1 h-3.5 w-3.5" /> 提供程序</TabsTrigger>
            <TabsTrigger value="events"><RefreshCw className="mr-1 h-3.5 w-3.5" /> 事件</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-3">
            <UsersPanel instanceId={inst.id} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="apps" className="mt-3">
            <AppsPanel instanceId={inst.id} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="providers" className="mt-3">
            <ProvidersPanel instanceId={inst.id} />
          </TabsContent>

          <TabsContent value="events" className="mt-3">
            <EventsPanel instanceId={inst.id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// ── 用户 ──

const UsersPanel: React.FC<{ instanceId: string; isAdmin: boolean }> = ({ instanceId, isAdmin }) => {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const usersQ = useQuery({
    queryKey: ["authentik-users", instanceId, search],
    queryFn: () => apiGetJson<{ users: AKUser[]; groups: AKGroup[] }>(
      `/api/ops/authentik/instances/${instanceId}/users?search=${encodeURIComponent(search)}`,
    ),
  });
  const users = usersQ.data?.users ?? [];
  const groups = usersQ.data?.groups ?? [];
  if (usersQ.isError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50/70 px-3 py-3 text-xs text-red-700">
        用户加载失败：{apiErr(usersQ.error)}（请检查实例的 API Token 是否已保存、是否有足够权限）
      </p>
    );
  }
  const groupById = useMemo(() => {
    const m: Record<string, AKGroup> = {};
    for (const g of groups) m[g.pk] = g;
    return m;
  }, [groups]);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ username: "", name: "", email: "", password: "", groupNames: [] as string[] });
  const [resetUser, setResetUser] = useState<AKUser | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [confirmDel, setConfirmDel] = useState<AKUser | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["authentik-users", instanceId] });
    void qc.invalidateQueries({ queryKey: ["authentik-status", instanceId] });
  };

  const createMut = useMutation({
    mutationFn: () =>
      apiPostJson<{ message?: string; passwordError?: string }>(`/api/ops/authentik/instances/${instanceId}/users`, {
        username: form.username,
        name: form.name,
        email: form.email,
        password: form.password || undefined,
        groupNames: form.groupNames,
      }),
    onSuccess: (res) => {
      if (res.passwordError) toast.warning(res.message ?? "用户已创建（密码设置失败）");
      else toast.success(res.message ?? "用户已创建");
      setCreateOpen(false);
      setForm({ username: "", name: "", email: "", password: "", groupNames: [] });
      invalidate();
    },
    onError: (e) => toast.error(apiErr(e)),
  });

  const pwMut = useMutation({
    mutationFn: (p: { uid: number; password: string }) =>
      apiPostJson(`/api/ops/authentik/instances/${instanceId}/users/${p.uid}/password`, { password: p.password }),
    onSuccess: () => { toast.success("密码已重置"); setResetUser(null); setResetPw(""); },
    onError: (e) => toast.error(apiErr(e)),
  });

  const activeMut = useMutation({
    mutationFn: (p: { uid: number; active: boolean }) =>
      apiPostJson(`/api/ops/authentik/instances/${instanceId}/users/${p.uid}/active`, { active: p.active }),
    onSuccess: () => { toast.success("已更新"); invalidate(); },
    onError: (e) => toast.error(apiErr(e)),
  });

  const delMut = useMutation({
    mutationFn: (uid: number) => apiDeleteJson(`/api/ops/authentik/instances/${instanceId}/users/${uid}`),
    onSuccess: () => { toast.success("用户已删除"); setConfirmDel(null); invalidate(); },
    onError: (e) => toast.error(apiErr(e)),
  });

  const toggleGroup = (name: string) =>
    setForm((f) => ({
      ...f,
      groupNames: f.groupNames.includes(name) ? f.groupNames.filter((g) => g !== name) : [...f.groupNames, name],
    }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input className="h-8 w-64 text-xs" placeholder="搜索用户…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {isAdmin ? (
          <Button type="button" size="sm" className="h-8 text-xs" onClick={() => setCreateOpen(true)}>
            <UserPlus className="mr-1 h-3.5 w-3.5" /> 创建用户
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">用户名</th>
              <th className="px-3 py-2 font-medium">姓名 / 邮箱</th>
              <th className="px-3 py-2 font-medium">组</th>
              <th className="px-3 py-2 font-medium">状态</th>
              <th className="px-3 py-2 font-medium">最近登录</th>
              {isAdmin ? <th className="px-3 py-2 font-medium">操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.pk} className="border-t border-slate-50 hover:bg-slate-50/60">
                <td className="px-3 py-2 font-medium text-slate-900">{u.username}</td>
                <td className="px-3 py-2 text-slate-600">
                  {u.name || "—"}
                  {u.email ? <span className="ml-1 text-[10px] text-slate-400">{u.email}</span> : null}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(u.groups ?? []).map((gpk) => (
                      <span key={gpk} className="rounded bg-violet-50 px-1 text-[10px] text-violet-700">
                        {groupById[gpk]?.name ?? gpk.slice(0, 8)}
                      </span>
                    ))}
                    {(u.groups ?? []).length === 0 ? <span className="text-[10px] text-slate-300">—</span> : null}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {u.is_active ? (
                    <span className="text-emerald-700">启用</span>
                  ) : (
                    <span className="text-slate-400">停用</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-500">{u.last_login ? fmtTime(u.last_login) : "从未"}</td>
                {isAdmin ? (
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]"
                        onClick={() => { setResetUser(u); setResetPw(""); }}>
                        重置密码
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-slate-600"
                        onClick={() => activeMut.mutate({ uid: u.pk, active: !u.is_active })}>
                        {u.is_active ? "停用" : "启用"}
                      </Button>
                      {confirmDel?.pk === u.pk ? (
                        <Button type="button" size="sm" variant="destructive" className="h-6 px-2 text-[11px]"
                          onClick={() => delMut.mutate(u.pk)}>
                          确认删除？
                        </Button>
                      ) : (
                        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-red-600"
                          onClick={() => setConfirmDel(u)}>
                          删除
                        </Button>
                      )}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {users.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">{usersQ.isLoading ? "加载中…" : "暂无用户"}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* 创建用户 */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>创建 Authentik 用户</DialogTitle>
            <DialogDescription>
              创建后加入对应组即可完成下发：例如勾选 headscale 使用的「authentik Headscale」组，
              用户即可通过 OIDC 登录异地组网客户端。初始密码可选。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>用户名 *</Label>
              <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>姓名</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>邮箱</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>初始密码（可选；留空由用户走找回/OIDC）</Label>
              <Input type="password" value={form.password} autoComplete="new-password" onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>加入组（可多选）</Label>
              <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                {groups.map((g) => (
                  <label key={g.pk} className="flex items-center gap-1.5 text-xs text-slate-700">
                    <input type="checkbox" checked={form.groupNames.includes(g.name)} onChange={() => toggleGroup(g.name)} />
                    {g.name}
                  </label>
                ))}
                {groups.length === 0 ? <span className="text-xs text-slate-400">未获取到组</span> : null}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="button" disabled={createMut.isPending || !form.username.trim()} onClick={() => createMut.mutate()}>
              {createMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} 创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重置密码 */}
      <Dialog open={Boolean(resetUser)} onOpenChange={(o) => { if (!o) setResetUser(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>重置密码：{resetUser?.username}</DialogTitle>
            <DialogDescription>新密码立即生效，请通知用户。</DialogDescription>
          </DialogHeader>
          <Input type="password" value={resetPw} autoComplete="new-password" placeholder="新密码" onChange={(e) => setResetPw(e.target.value)} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetUser(null)}>取消</Button>
            <Button type="button" disabled={pwMut.isPending || !resetPw} onClick={() => resetUser && pwMut.mutate({ uid: resetUser.pk, password: resetPw })}>
              {pwMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} 确认重置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── 应用对接（向导）──

const AppsPanel: React.FC<{ instanceId: string; isAdmin: boolean }> = ({ instanceId, isAdmin }) => {
  const qc = useQueryClient();
  const appsQ = useQuery({
    queryKey: ["authentik-apps", instanceId],
    queryFn: () => apiGetJson<{ apps: AKApp[] }>(`/api/ops/authentik/instances/${instanceId}/apps`),
  });
  const groupsQ = useQuery({
    queryKey: ["authentik-groups", instanceId],
    queryFn: () => apiGetJson<{ groups: AKGroup[] }>(`/api/ops/authentik/instances/${instanceId}/groups`),
    enabled: isAdmin,
  });
  const apps = appsQ.data?.apps ?? [];
  if (appsQ.isError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50/70 px-3 py-3 text-xs text-red-700">
        应用加载失败：{apiErr(appsQ.error)}（请检查实例的 API Token 是否已保存、是否有足够权限）
      </p>
    );
  }

  const [wizardOpen, setWizardOpen] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", redirectUris: "", groupPK: "" });
  const [result, setResult] = useState<{ client_id: string; client_secret: string; name: string } | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      apiPostJson<{ message?: string; provider?: AKProvider; app?: AKApp }>(`/api/ops/authentik/instances/${instanceId}/apps`, {
        name: form.name,
        slug: form.slug || undefined,
        redirectUris: form.redirectUris.split("\n").map((s) => s.trim()).filter(Boolean),
        groupPK: form.groupPK || undefined,
      }),
    onSuccess: (res) => {
      toast.success(res.message ?? "对接完成");
      setWizardOpen(false);
      if (res.provider?.client_id) {
        setResult({
          client_id: res.provider.client_id,
          client_secret: res.provider.client_secret ?? "",
          name: res.app?.name ?? form.name,
        });
      }
      setForm({ name: "", slug: "", redirectUris: "", groupPK: "" });
      void qc.invalidateQueries({ queryKey: ["authentik-apps", instanceId] });
      void qc.invalidateQueries({ queryKey: ["authentik-providers", instanceId] });
      void qc.invalidateQueries({ queryKey: ["authentik-status", instanceId] });
    },
    onError: (e) => toast.error(apiErr(e)),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          应用 = Authentik 里的站点入口；对接向导会同时创建 <strong>OAuth2 / OIDC 提供程序</strong>并把选中的组绑定到应用。
        </p>
        {isAdmin ? (
          <Button type="button" size="sm" className="h-8 text-xs" onClick={() => setWizardOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> 新建应用对接
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">应用</th>
              <th className="px-3 py-2 font-medium">Slug</th>
              <th className="px-3 py-2 font-medium">提供程序</th>
              <th className="px-3 py-2 font-medium">入口 URL</th>
            </tr>
          </thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.pk} className="border-t border-slate-50">
                <td className="px-3 py-2 font-medium text-slate-900">{a.name}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-slate-600">{a.slug}</td>
                <td className="px-3 py-2 text-slate-600">{a.provider ? String(a.provider) : "—"}</td>
                <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{a.meta_launch_url || "—"}</td>
              </tr>
            ))}
            {apps.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">{appsQ.isLoading ? "加载中…" : "暂无应用"}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* 向导 */}
      <Dialog open={wizardOpen} onOpenChange={(o) => { if (!o) setWizardOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新建应用对接（OAuth2 / OIDC）</DialogTitle>
            <DialogDescription>
              一次完成：创建 OAuth2 提供程序 → 创建应用 → 把选中组绑定到应用。client_secret 仅创建时展示。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>应用名称 *</Label>
                <Input value={form.name} placeholder="MyApp" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Slug（可选，默认按名称生成）</Label>
                <Input value={form.slug} placeholder="myapp" onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>回调 redirect URI *（每行一条）</Label>
              <Textarea rows={3} className="font-mono text-xs" value={form.redirectUris}
                placeholder={"https://app.example.com/auth/callback\nhttps://headscale.example.com/oidc/callback"}
                onChange={(e) => setForm((f) => ({ ...f, redirectUris: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>允许访问的组（可选）</Label>
              <select className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs"
                value={form.groupPK} onChange={(e) => setForm((f) => ({ ...f, groupPK: e.target.value }))}>
                <option value="">不限制（稍后手动配置策略）</option>
                {(groupsQ.data?.groups ?? []).map((g) => (
                  <option key={g.pk} value={g.pk}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setWizardOpen(false)}>取消</Button>
            <Button type="button" disabled={createMut.isPending || !form.name.trim() || !form.redirectUris.trim()} onClick={() => createMut.mutate()}>
              {createMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} 创建对接
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 凭据结果 */}
      <Dialog open={Boolean(result)} onOpenChange={(o) => { if (!o) setResult(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>「{result?.name}」对接凭据（仅展示一次）</DialogTitle>
            <DialogDescription>复制保存到目标应用（如 headscale OIDC client 配置）。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-800">client_id: {result?.client_id}</code>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => void navigator.clipboard.writeText(result?.client_id ?? "").catch(() => {})}>
                <Copy className="mr-1 h-3 w-3" /> 复制
              </Button>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-amber-900">client_secret: {result?.client_secret}</code>
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => void navigator.clipboard.writeText(result?.client_secret ?? "").catch(() => {})}>
                <Copy className="mr-1 h-3 w-3" /> 复制
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setResult(null)}>我已保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── 提供程序 ──

const ProvidersPanel: React.FC<{ instanceId: string }> = ({ instanceId }) => {
  const q = useQuery({
    queryKey: ["authentik-providers", instanceId],
    queryFn: () => apiGetJson<{ providers: AKProvider[] }>(`/api/ops/authentik/instances/${instanceId}/providers/oauth2`),
  });
  const providers = q.data?.providers ?? [];
  if (q.isError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50/70 px-3 py-3 text-xs text-red-700">
        提供程序加载失败：{apiErr(q.error)}（请检查实例的 API Token 是否已保存、是否有足够权限）
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">名称</th>
            <th className="px-3 py-2 font-medium">Client ID</th>
            <th className="px-3 py-2 font-medium">回调地址</th>
            <th className="px-3 py-2 font-medium">sub 模式</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((p) => (
            <tr key={p.pk} className="border-t border-slate-50">
              <td className="px-3 py-2 font-medium text-slate-900">{p.name}</td>
              <td className="px-3 py-2">
                <span className="font-mono text-[11px] text-slate-700">{p.client_id}</span>
                <Button type="button" size="sm" variant="ghost" className="ml-1 h-5 w-5 p-0 text-slate-400"
                  onClick={() => void navigator.clipboard.writeText(p.client_id).catch(() => {})}>
                  <Copy className="h-3 w-3" />
                </Button>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  {(p.redirect_uris ?? []).map((u, i) => (
                    <span key={i} className="font-mono text-[10px] text-slate-500" title={u.matching_mode ? `匹配模式：${u.matching_mode}` : undefined}>
                      {u.url || JSON.stringify(u)}
                    </span>
                  ))}
                  {(p.redirect_uris ?? []).length === 0 ? <span className="text-slate-300">—</span> : null}
                </div>
              </td>
              <td className="px-3 py-2 text-slate-500">{p.sub_mode ?? "—"}</td>
            </tr>
          ))}
          {providers.length === 0 ? (
            <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">{q.isLoading ? "加载中…" : "暂无 OAuth2 提供程序"}</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
};

// ── 事件 ──

const EventsPanel: React.FC<{ instanceId: string }> = ({ instanceId }) => {
  const q = useQuery({
    queryKey: ["authentik-events", instanceId],
    queryFn: () => apiGetJson<{ events: Record<string, unknown>[] }>(`/api/ops/authentik/instances/${instanceId}/events?perPage=30`),
  });
  const events = q.data?.events ?? [];
  if (q.isError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50/70 px-3 py-3 text-xs text-red-700">
        事件加载失败：{apiErr(q.error)}（请检查实例的 API Token 是否已保存、是否有足够权限）
      </p>
    );
  }
  return (
    <ul className="max-h-96 space-y-1.5 overflow-y-auto rounded-xl border border-slate-100 p-2.5 font-mono text-[11px] text-slate-700">
      {events.map((e, i) => (
        <li key={i} className="rounded border border-slate-50 bg-slate-50/60 px-2 py-1">
          <span className="text-slate-400">{String(e.created ?? "").slice(0, 19).replace("T", " ")}</span>{" "}
          <span className="font-semibold text-fuchsia-700">{String(e.action ?? "?")}</span>{" "}
          {e.user && typeof e.user === "object" ? <span className="text-slate-500">user={String((e.user as Record<string, unknown>).username ?? "")}</span> : null}
          {e.client_ip ? <span className="text-slate-400"> ip={String(e.client_ip)}</span> : null}
        </li>
      ))}
      {events.length === 0 ? <li className="py-6 text-center text-slate-400">{q.isLoading ? "加载中…" : "暂无事件"}</li> : null}
    </ul>
  );
};

export default AuthentikPage;
