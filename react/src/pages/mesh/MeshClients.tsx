import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Laptop, Loader2, RefreshCw, Shield, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { apiDeleteJson, apiGetJson, apiPostJson } from "@/lib/api";
import { meshClientsText as t } from "@/i18n/meshClients";

type Instance = { id: string; name: string; enabled: boolean };
type User = { id: string; name: string };
type Client = {
  id: string; instanceId: string; name: string; user: string; os: string; arch: string;
  createdAt: string; lastSeenAt?: string; revokedAt?: string;
  status: { hostname?: string; backendState?: string; clientVersion?: string; nodeId?: string;
    tailscaleIps?: string[]; endpoints?: string[]; online?: boolean; error?: string };
  pendingAction?: { id: string; type: string; hostname?: string; issuedAt: string };
  lastAction?: { id: string; type: string; hostname?: string; completedAt: string; error?: string };
};

const targets = [
  { value: "windows/amd64", label: "Windows · x64" },
  { value: "windows/arm64", label: "Windows · ARM64" },
  { value: "macos/arm64", label: "macOS · Apple Silicon" },
  { value: "macos/amd64", label: "macOS · Intel" },
  { value: "linux/amd64", label: "Linux · x64" },
  { value: "linux/arm64", label: "Linux · ARM64" },
];

export default function MeshClients() {
  const qc = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const [name, setName] = React.useState("");
  const [target, setTarget] = React.useState("windows/amd64");
  const [user, setUser] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [appBusy, setAppBusy] = React.useState(false);
  const instancesQ = useQuery({ queryKey: ["mesh-client-instances"], queryFn: () => apiGetJson<{ instances: Instance[] }>("/api/ops/mesh/instances") });
  const instances = instancesQ.data?.instances ?? [];
  const selected = instances.find((v) => v.id === search.get("inst")) ?? instances.find((v) => v.enabled) ?? instances[0];
  const clientsQ = useQuery({ queryKey: ["mesh-clients", selected?.id], enabled: !!selected,
    queryFn: () => apiGetJson<{ clients: Client[] }>(`/api/ops/mesh/instances/${selected?.id}/clients`), refetchInterval: 30_000 });
  const usersQ = useQuery({ queryKey: ["mesh-client-users", selected?.id], enabled: !!selected,
    queryFn: () => apiGetJson<{ users: User[] }>(`/api/ops/mesh/instances/${selected?.id}/keys/default`) });
  const users = usersQ.data?.users ?? [];
  const selectedUser = users.some((v) => v.name === user) ? user : users[0]?.name || "";
  const clients = clientsQ.data?.clients ?? [];
  const desktopTarget = target.startsWith("windows/") || target.startsWith("macos/");

  function saveFile(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function downloadApp() {
    if (!selected || !desktopTarget) return;
    setAppBusy(true);
    try {
      const [os, arch] = target.split("/");
      const res = await fetch(`/api/ops/mesh/instances/${selected.id}/clients/download?${new URLSearchParams({ os, arch })}`, { credentials: "include" });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || `HTTP ${res.status}`); }
      saveFile(await res.blob(), os === "windows" ? `LabPlaneMesh-${arch}.exe` : `LabPlaneMesh-${arch}.dmg`);
      toast.success(t.appReady);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setAppBusy(false); }
  }

  async function download() {
    if (!selected || !selectedUser || !name.trim()) { toast.error("请填写设备名称并选择用户"); return; }
    setBusy(true);
    try {
      const [os, arch] = target.split("/");
      const params = new URLSearchParams({ os, arch, hostname: name.trim(), user: selectedUser });
      const res = await fetch(`/api/ops/mesh/instances/${selected.id}/clients/package?${params}`, { method: "POST", credentials: "include" });
      if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || `HTTP ${res.status}`); }
      saveFile(await res.blob(), desktopTarget ? `labplane-mesh-${name.trim()}.json` : `labplane-mesh-${name.trim()}-${os}-${arch}.zip`);
      toast.success(desktopTarget ? t.configReady : t.packageReady);
      await qc.invalidateQueries({ queryKey: ["mesh-clients", selected.id] });
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function revoke(v: Client) {
    if (!selected || !window.confirm(t.revokeConfirm)) return;
    try {
      await apiDeleteJson(`/api/ops/mesh/instances/${selected.id}/clients/${v.id}`);
      await qc.invalidateQueries({ queryKey: ["mesh-clients", selected.id] });
      toast.success(t.revoked);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  async function action(v: Client, type: "connect" | "disconnect" | "rename") {
    if (!selected) return;
    let hostname = "";
    if (type === "rename") {
      hostname = window.prompt("新的设备名称", v.status.hostname || v.name)?.trim() || "";
      if (!hostname) return;
    }
    try {
      await apiPostJson(`/api/ops/mesh/instances/${selected.id}/clients/${v.id}/actions`, { type, hostname });
      await qc.invalidateQueries({ queryKey: ["mesh-clients", selected.id] });
      toast.success(t.queued);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  return <div className="space-y-5 text-slate-900 dark:text-slate-100">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-semibold"><Laptop className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />{t.title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t.intro}</p></div>
      <button onClick={() => clientsQ.refetch()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" />刷新</button>
    </div>
    {instances.length > 1 && <div className="flex flex-wrap gap-2">{instances.map((v) => <button key={v.id} onClick={() => setSearch({ inst: v.id })} className={`rounded-full border px-3 py-1 text-xs ${selected?.id === v.id ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "border-slate-200 text-slate-500 dark:border-slate-700"}`}>{v.name}</button>)}</div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-2 font-semibold"><Download className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />{t.issue}</div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="text-xs text-slate-500 dark:text-slate-400">{t.hostname}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={63} placeholder="office-mac-01" className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></label>
        <label className="text-xs text-slate-500 dark:text-slate-400">{t.user}<select value={selectedUser} onChange={(e) => setUser(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">{users.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}</select></label>
        <label className="text-xs text-slate-500 dark:text-slate-400">{t.target}<select value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">{targets.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}</select></label>
        <button disabled={busy || !selected || !selectedUser} onClick={download} className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{desktopTarget ? t.issueConfig : t.download}</button>
      </div>
      {desktopTarget && <button disabled={appBusy || !selected} onClick={downloadApp} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950">{appBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{target.startsWith("windows/") ? t.windowsApp : t.macApp}</button>}
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{desktopTarget ? t.desktopInstall : t.linuxInstall}</p>
      <p className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><Shield className="h-3.5 w-3.5" />{t.secret}</p>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between"><h2 className="font-semibold">{t.devices} <span className="text-slate-400">{clients.length}</span></h2>{clientsQ.isFetching && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}</div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.reportSource}</p>
      <div className="mt-4 space-y-3">{clients.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-700">{t.noDevices}</div> : clients.map((v) => {
        const seen = v.lastSeenAt && Date.now() - Date.parse(v.lastSeenAt) < 150_000;
        const healthy = seen && v.status.online && !v.revokedAt;
        return <div key={v.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="font-medium">{v.status.hostname || v.name}</span><span className={`rounded-full px-2 py-0.5 text-[11px] ${v.revokedAt ? "bg-slate-100 text-slate-500 dark:bg-slate-800" : healthy ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>{v.revokedAt ? t.revoked : healthy ? t.online : v.lastSeenAt ? t.offline : t.pending}</span></div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{v.user} · {v.os}/{v.arch} · Tailscale {v.status.clientVersion || "—"} · {v.status.backendState || "—"}</p></div>
            {!v.revokedAt && <div className="flex flex-wrap gap-2 text-xs">
              <button disabled={!!v.pendingAction} onClick={() => action(v, "connect")} className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">{t.connect}</button>
              <button disabled={!!v.pendingAction} onClick={() => action(v, "disconnect")} className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">{t.disconnect}</button>
              <button disabled={!!v.pendingAction} onClick={() => action(v, "rename")} className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800">{t.rename}</button>
              <button onClick={() => revoke(v)} className="inline-flex items-center gap-1 px-1 text-rose-600 hover:underline dark:text-rose-400"><Trash2 className="h-3.5 w-3.5" />{t.revoke}</button>
            </div>}</div>
          <div className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3"><div>节点 ID：{v.status.nodeId || "—"}</div><div>Tail IP：{v.status.tailscaleIps?.join(", ") || "—"}</div><div>{t.lastSeen}：{v.lastSeenAt ? new Date(v.lastSeenAt).toLocaleString() : "—"}</div></div>
          {!!v.status.endpoints?.length && <p className="mt-2 break-all text-xs text-slate-500 dark:text-slate-400">本机候选地址：{v.status.endpoints.join(" · ")}</p>}
          {v.pendingAction && <p className="mt-2 text-xs text-indigo-600 dark:text-indigo-400">待执行：{v.pendingAction.type} · {new Date(v.pendingAction.issuedAt).toLocaleString()}</p>}
          {v.lastAction && <p className={`mt-2 text-xs ${v.lastAction.error ? "text-rose-600 dark:text-rose-400" : "text-slate-500 dark:text-slate-400"}`}>上次操作：{v.lastAction.type} · {v.lastAction.error || "成功"}</p>}
          {!!v.status.error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{v.status.error}</p>}
        </div>;
      })}</div>
    </section>
  </div>;
}
