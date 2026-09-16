import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { apiGetJson, apiPutJson, ApiHttpError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ExtraHostRow = {
  id: string;
  name: string;
  address: string;
  kind?: string;
  sshPort?: number;
  rdpPort?: number;
  sshUser?: string;
  sshHostKeyFingerprint?: string;
  rdpUser?: string;
  rdpWebUrl?: string;
};

type ExtraHostDraftRow = {
  clientId: string;
  id: string;
  name: string;
  address: string;
  kind: "linux" | "windows";
  sshPort: string;
  sshUser: string;
  sshHostKeyFingerprint: string;
  rdpUser: string;
  rdpWebUrl: string;
  sshPassword: string;
  rdpPassword: string;
};

function newExtraHostDraftRow(): ExtraHostDraftRow {
  return {
    clientId: globalThis.crypto?.randomUUID?.() ?? `row-${Date.now()}`,
    id: "",
    name: "",
    address: "",
    kind: "linux",
    sshPort: "22",
    sshUser: "",
    sshHostKeyFingerprint: "",
    rdpUser: "",
    rdpWebUrl: "",
    sshPassword: "",
    rdpPassword: "",
  };
}

function extraHostDraftFromApi(h: ExtraHostRow): ExtraHostDraftRow {
  const kind = String(h.kind ?? "linux").toLowerCase() === "windows" ? "windows" : "linux";
  return {
    clientId: globalThis.crypto?.randomUUID?.() ?? `row-${Date.now()}`,
    id: h.id ?? "",
    name: h.name ?? "",
    address: h.address ?? "",
    kind,
    sshPort: h.sshPort != null && h.sshPort > 0 ? String(h.sshPort) : "22",
    sshUser: h.sshUser ?? "",
    sshHostKeyFingerprint: h.sshHostKeyFingerprint ?? "",
    rdpUser: h.rdpUser ?? "",
    rdpWebUrl: h.rdpWebUrl ?? "",
    sshPassword: "",
    rdpPassword: "",
  };
}

function extraHostDraftToPolicyPayload(r: ExtraHostDraftRow): Record<string, unknown> | null {
  const id = r.id.trim();
  if (!id) return null;
  const sshPort = Number.parseInt(r.sshPort.trim(), 10);
  const o: Record<string, unknown> = {
    id,
    name: r.name.trim(),
    address: r.address.trim(),
    kind: r.kind,
  };
  if (r.kind === "linux") {
    o.sshPort = Number.isFinite(sshPort) && sshPort > 0 ? sshPort : 22;
    o.rdpPort = 0;
    const su = r.sshUser.trim();
    if (su) o.sshUser = su;
    const fingerprint = r.sshHostKeyFingerprint.trim();
    if (fingerprint) o.sshHostKeyFingerprint = fingerprint;
    const pw = r.sshPassword.trim();
    if (pw) o.sshPassword = pw;
  } else {
    o.sshPort = 0;
    o.rdpPort = 3389;
    const ru = r.rdpUser.trim();
    if (ru) o.rdpUser = ru;
    const pw = r.rdpPassword.trim();
    if (pw) o.rdpPassword = pw;
    const rw = r.rdpWebUrl.trim();
    if (rw) o.rdpWebUrl = rw;
  }
  return o;
}

type BastionPolicy = {
  enableAcl: boolean;
  userVms: Record<string, string[]>;
  extraHosts?: ExtraHostRow[];
  manualVmGroups?: { name: string; morefs: string[] }[];
  hiddenVmMorefs?: string[];
  vmRdpWebEmbeds?: { moref: string; url: string }[];
  nativeSshEnabled?: boolean;
  nativeSshPort?: number;
};

type ManualVmGroupDraftRow = {
  clientId: string;
  name: string;
  morefsText: string;
};

function newManualVmGroupDraftRow(): ManualVmGroupDraftRow {
  return {
    clientId: globalThis.crypto?.randomUUID?.() ?? `mg-${Date.now()}`,
    name: "",
    morefsText: "",
  };
}

function manualVmGroupDraftFromApi(g: { name: string; morefs: string[] }): ManualVmGroupDraftRow {
  return {
    clientId: globalThis.crypto?.randomUUID?.() ?? `mg-${Date.now()}`,
    name: g.name ?? "",
    morefsText: (g.morefs ?? []).join("\n"),
  };
}

function parseMorefsLines(text: string): string[] {
  const parts = text
    .split(/[\n,;\t]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function draftManualVmGroupsToPayload(rows: ManualVmGroupDraftRow[]): { name: string; morefs: string[] }[] {
  return rows
    .map((r) => {
      const name = r.name.trim();
      if (!name) return null;
      const morefs = parseMorefsLines(r.morefsText);
      return { name, morefs };
    })
    .filter((x): x is { name: string; morefs: string[] } => x != null);
}

type VmRdpWebDraftRow = {
  clientId: string;
  moref: string;
  url: string;
};

function newVmRdpWebDraftRow(): VmRdpWebDraftRow {
  return {
    clientId: globalThis.crypto?.randomUUID?.() ?? `vr-${Date.now()}`,
    moref: "",
    url: "",
  };
}

type AclUserRow = {
  clientId: string;
  username: string;
  access: "all" | "pick";
  picked: string[];
};

function newAclUserRow(): AclUserRow {
  return {
    clientId: globalThis.crypto?.randomUUID?.() ?? `acl-${Date.now()}`,
    username: "",
    access: "all",
    picked: [],
  };
}

function userVmsRecordToAclRows(uv: Record<string, string[]> | undefined): AclUserRow[] {
  if (!uv || typeof uv !== "object") return [];
  const out: AclUserRow[] = [];
  for (const [username, arr] of Object.entries(uv)) {
    const u = String(username).trim().toLowerCase();
    if (!u) continue;
    const a = Array.isArray(arr) ? arr.map((x) => String(x)) : [];
    const all = a.length === 1 && a[0].trim() === "*";
    out.push({
      clientId: globalThis.crypto?.randomUUID?.() ?? `acl-${u}`,
      username: u,
      access: all ? "all" : "pick",
      picked: all ? [] : a.map((x) => x.trim()).filter(Boolean),
    });
  }
  return out;
}

function aclRowsToUserVms(rows: AclUserRow[]): Record<string, string[]> {
  const o: Record<string, string[]> = {};
  for (const r of rows) {
    const u = r.username.trim().toLowerCase();
    if (!u) continue;
    o[u] = r.access === "all" ? ["*"] : [...r.picked];
  }
  return o;
}

function morefListContains(text: string, moref: string): boolean {
  const parts = parseMorefsLines(text);
  const t = moref.trim();
  return parts.some((p) => p.toLowerCase() === t.toLowerCase());
}

function toggleMorefInMultilineText(text: string, moref: string, on: boolean): string {
  const parts = parseMorefsLines(text);
  const t = moref.trim();
  const tl = t.toLowerCase();
  if (!on) {
    return parts.filter((p) => p.trim().toLowerCase() !== tl).join("\n");
  }
  const next = new Set(parts.map((p) => p));
  next.add(t);
  return Array.from(next).join("\n");
}

const EMPTY_VMS: { moref: string; name: string }[] = [];

const VCenterBastionAdmin: React.FC = () => {
  const { status: auth } = useAuth();
  const isAdmin = auth?.role === "admin";
  const qc = useQueryClient();
  const [enableAcl, setEnableAcl] = useState(false);
  const [aclRows, setAclRows] = useState<AclUserRow[]>([]);
  const [aclAdvancedJson, setAclAdvancedJson] = useState(false);
  const [userVmsText, setUserVmsText] = useState("{}");
  const [aclPickFilter, setAclPickFilter] = useState("");
  const [manualGroupVmFilter, setManualGroupVmFilter] = useState<Record<string, string>>({});
  const [extraHostsDraft, setExtraHostsDraft] = useState<ExtraHostDraftRow[]>([]);
  const [manualVmGroupsDraft, setManualVmGroupsDraft] = useState<ManualVmGroupDraftRow[]>([]);
  const [hiddenVmMorefsDraft, setHiddenVmMorefsDraft] = useState<string[]>([]);
  const [vmRdpWebDraft, setVmRdpWebDraft] = useState<VmRdpWebDraftRow[]>([]);
  const [nativeSshEnabled, setNativeSshEnabled] = useState(false);
  const [nativeSshPort, setNativeSshPort] = useState("2222");

  const policyVmsQ = useQuery({
    queryKey: ["vcenter-bastion-vms-policy"],
    queryFn: ({ signal }) =>
      apiGetJson<{ vms: { moref: string; name: string }[] }>("/api/vcenter/bastion/vms?policy=1", { signal }),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const policyQ = useQuery({
    queryKey: ["vcenter-bastion-policy"],
    queryFn: ({ signal }) => apiGetJson<BastionPolicy>("/api/vcenter/bastion/policy", { signal }),
    enabled: isAdmin,
  });

  useEffect(() => {
    const p = policyQ.data;
    if (!p) return;
    setEnableAcl(p.enableAcl);
    setAclRows(userVmsRecordToAclRows(p.userVms));
    setUserVmsText(JSON.stringify(p.userVms ?? {}, null, 2));
    const list = p.extraHosts ?? [];
    setExtraHostsDraft(list.length > 0 ? list.map(extraHostDraftFromApi) : []);
    const mg = p.manualVmGroups ?? [];
    setManualVmGroupsDraft(mg.length > 0 ? mg.map(manualVmGroupDraftFromApi) : []);
    setHiddenVmMorefsDraft(Array.isArray(p.hiddenVmMorefs) ? [...p.hiddenVmMorefs] : []);
    setNativeSshEnabled(!!p.nativeSshEnabled);
    const nsp = p.nativeSshPort;
    setNativeSshPort(nsp && nsp > 0 && nsp <= 65535 ? String(nsp) : "2222");
    const vr = p.vmRdpWebEmbeds ?? [];
    setVmRdpWebDraft(
      vr.length > 0
        ? vr.map((x) => ({
            clientId: globalThis.crypto?.randomUUID?.() ?? `vr-${x.moref}`,
            moref: x.moref ?? "",
            url: x.url ?? "",
          }))
        : []
    );
  }, [policyQ.data]);

  const aclPickTargets = useMemo(() => {
    const vms = policyVmsQ.data?.vms ?? EMPTY_VMS;
    const vmOpts = vms
      .filter((vm) => String(vm.moref ?? "").trim() !== "")
      .map((vm) => ({
        key: String(vm.moref).trim(),
        label: `${vm.name} · ${String(vm.moref).trim()}`,
        kind: "vm" as const,
      }));
    const ex = extraHostsDraft
      .filter((r) => r.id.trim() !== "")
      .map((r) => ({
        key: `extra:${r.id.trim()}`,
        label: `${r.name.trim() || r.id}（额外主机）· extra:${r.id.trim()}`,
        kind: "extra" as const,
      }));
    return [...ex, ...vmOpts];
  }, [policyVmsQ.data?.vms, extraHostsDraft]);

  const savePolicy = useMutation({
    mutationFn: async () => {
      let userVms: Record<string, string[]>;
      if (aclAdvancedJson) {
        try {
          const parsed = JSON.parse(userVmsText) as unknown;
          if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("userVms 须为 JSON 对象");
          }
          userVms = parsed as Record<string, string[]>;
        } catch (e) {
          throw new Error(e instanceof Error ? e.message : "userVms JSON 无效");
        }
      } else {
        userVms = aclRowsToUserVms(aclRows);
      }
      const incomplete = extraHostsDraft.some(
        (r) => !r.id.trim() && (r.name.trim() !== "" || r.address.trim() !== "")
      );
      if (incomplete) {
        throw new Error("额外主机：已填写名称或地址时，必须填写「标识 id」");
      }
      const extraHosts: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      for (const row of extraHostsDraft) {
        const payload = extraHostDraftToPolicyPayload(row);
        if (!payload) continue;
        const id = String(payload.id);
        const k = id.toLowerCase();
        if (seen.has(k)) throw new Error(`额外主机 id 重复：${id}`);
        seen.add(k);
        extraHosts.push(payload);
      }
      const manualVmGroups = draftManualVmGroupsToPayload(manualVmGroupsDraft);
      const seenGroup = new Set<string>();
      for (const g of manualVmGroups) {
        const k = g.name.toLowerCase();
        if (seenGroup.has(k)) throw new Error(`手动分组名称重复：${g.name}`);
        seenGroup.add(k);
      }
      const vmRdpWebEmbeds = vmRdpWebDraft
        .map((r) => ({ moref: r.moref.trim(), url: r.url.trim() }))
        .filter((r) => r.moref && r.url);
      const seenMf = new Set<string>();
      for (const r of vmRdpWebEmbeds) {
        const lk = r.moref.toLowerCase();
        if (seenMf.has(lk)) throw new Error(`内嵌页：moRef 重复 ${r.moref}`);
        seenMf.add(lk);
      }
      const pNum = Math.min(65535, Math.max(1, parseInt(String(nativeSshPort).trim(), 10) || 2222));
      await apiPutJson("/api/vcenter/bastion/policy", {
        enableAcl,
        userVms,
        extraHosts,
        manualVmGroups,
        hiddenVmMorefs: hiddenVmMorefsDraft,
        vmRdpWebEmbeds,
        nativeSshEnabled,
        nativeSshPort: pNum,
      });
    },
    onSuccess: async () => {
      toast.success("堡垒机策略已保存");
      await qc.invalidateQueries({ queryKey: ["vcenter-bastion-policy"] });
      await qc.invalidateQueries({ queryKey: ["vcenter-bastion-vms"] });
      await qc.invalidateQueries({ queryKey: ["vcenter-bastion-vms-policy"] });
      await qc.invalidateQueries({ queryKey: ["vcenter-bastion-native-ssh"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof ApiHttpError ? e.message : String(e);
      toast.error(msg);
    },
  });

  const handleAclAdvancedOpenChange = (open: boolean) => {
    if (open) {
      setUserVmsText(JSON.stringify(aclRowsToUserVms(aclRows), null, 2));
      setAclAdvancedJson(true);
      return;
    }
    try {
      const parsed = JSON.parse(userVmsText) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("须为 JSON 对象");
      }
      setAclRows(userVmsRecordToAclRows(parsed as Record<string, string[]>));
      setAclAdvancedJson(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "userVms JSON 无效，无法切回表单");
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6 text-sm text-slate-600">
        需要管理员权限。返回{" "}
        <Link className="text-blue-600 underline" to="/cluster/bastion">
          堡垒机
        </Link>
      </div>
    );
  }

  const aclFilterLower = aclPickFilter.trim().toLowerCase();
  const filteredAclTargets = aclPickTargets.filter(
    (t) =>
      !aclFilterLower ||
      t.key.toLowerCase().includes(aclFilterLower) ||
      t.label.toLowerCase().includes(aclFilterLower)
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#0c0f14] text-slate-200">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-auto max-w-[min(100%,1120px)] space-y-6 px-4 py-6 pb-[max(1.5rem,var(--kbts-safe-bottom))]">
          <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1 text-slate-400" asChild>
            <Link to="/cluster/bastion">
              <ArrowLeft className="size-4" />
              返回堡垒机
            </Link>
          </Button>
          </div>
          <div>
          <h1 className="text-lg font-semibold text-emerald-400/95">堡垒机配置</h1>
          <p className="mt-1 text-xs text-slate-500">
            用表单配置访问控制、额外主机与分组；无需手写 JSON。启用 ACL
            后，仅列表中的平台登录名可连对应虚拟机或额外主机。
          </p>
          </div>

          <div className="space-y-3 rounded-xl border border-emerald-900/40 bg-[#0f1419] p-4">
            <h2 className="text-sm font-medium text-emerald-300/90">OpenSSH 入站（本机/容器端口）</h2>
            <p className="text-xs leading-relaxed text-slate-500">
              在<strong>可访问到 Dashboard Pod 的节点/主机</strong>上监听独立 TCP
              端口。用户可用本机 OpenSSH 客户端连入（类似 JumpServer 的 SSH
              入口）：认证与 Web
              登录一致；已开启两步验证时，密码可写为「密码+6
              位」或「密码|6
              位」。入站后按数字序选择虚拟机或
              extra 主机，与 Web
              堡垒机使用同一套 ACL 与
              vCenter/SSH
              凭据。
            </p>
            <p className="text-[11px] text-amber-600/90">
              多副本时仅在「后台任务」副本（<code className="font-mono">KUBEBT_ENABLE_BACKGROUND_JOBS=true</code>
              ）上绑定该端口。请将 Service / Ingress 或 <code className="font-mono">hostPort</code> 暴露到期望的公网或专线 IP，并在防火墙放行对应 TCP。
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch id="bastion-nssh" checked={nativeSshEnabled} onCheckedChange={setNativeSshEnabled} />
                <Label htmlFor="bastion-nssh" className="text-sm text-slate-300">
                  启用原生 SSH 入站
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="nssh-port" className="text-xs text-slate-500">
                  端口
                </Label>
                <Input
                  id="nssh-port"
                  className="h-8 w-20 border-slate-700 bg-[#080a0e] font-mono text-xs"
                  value={nativeSshPort}
                  onChange={(e) => setNativeSshPort(e.target.value.replace(/\D/g, ""))}
                  maxLength={5}
                />
              </div>
            </div>
            <p className="font-mono text-[10px] text-slate-600">
              示例：ssh -o StrictHostKeyChecking=accept-new -p {nativeSshPort || "2222"} 平台用户名@&lt;同访问 Web
              的公网/内网 IP 或 DNS&gt;
            </p>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-800 bg-[#0f1419] p-4">
            <div>
              <h2 className="text-sm font-medium text-slate-200">JumpServer · Windows RDP（网页）</h2>
              <p className="mt-1 max-w-[52rem] text-xs leading-relaxed text-slate-500">
                堡垒机仅通过 <strong>HTTPS 网页</strong>打开 Windows 远程：在下方「Windows 虚拟机 · JumpServer
                RDP」里为每台需要远程的 VM 粘贴 JumpServer Luna 会话链接。常见场景是<strong>两台</strong> Windows
                虚拟机各一行；Linux 或其它资产请勿在此填 RDP 页，继续用 SSH 或侧栏其它入口即可。
              </p>
            </div>
            <div className="rounded-lg border border-slate-800/80 bg-[#0a0d12]/80 p-3 text-[11px] leading-relaxed text-slate-500">
              <p>
                在 JumpServer 中为资产创建/打开 <span className="text-slate-400">Web 终端（RDP）</span>
                ，复制浏览器地址栏或「分享链接」里的完整 <span className="font-mono text-slate-400">https://…</span> URL
                粘贴到映射表。
              </p>
              <p className="mt-2 font-mono text-[10px] text-slate-600">
                占位示例：https://jump.example.com/luna/…（按你的域名与路径替换）
              </p>
              <p className="mt-2 text-slate-600">
                非 vCenter 的 Windows 机器可在「额外主机」里选择 Windows 类型，并在同一字段填写 JumpServer RDP 网页 URL。
              </p>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-slate-800 bg-[#0f1419] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Switch id="bastion-acl" checked={enableAcl} onCheckedChange={setEnableAcl} />
            <Label htmlFor="bastion-acl" className="text-sm text-slate-300">
              启用 ACL（关闭时凡能访问 vCenter 模块的用户均可连堡垒机目标）
            </Label>
          </div>

          {!aclAdvancedJson ? (
            <div className="space-y-3 rounded-lg border border-slate-800 bg-[#0a0d12] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-sm text-slate-300">按用户授权（平台登录名，小写）</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-slate-600 bg-slate-900 text-xs"
                  onClick={() => setAclRows((prev) => [...prev, newAclUserRow()])}
                >
                  <Plus className="mr-1 size-3.5" />
                  添加用户
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                「全部目标」等价 JSON 中的{" "}
                <code className="rounded bg-slate-900 px-1 font-mono text-emerald-400/90">[&quot;*&quot;]</code>
                ；「仅下列目标」请在列表中勾选虚拟机 moRef 或额外主机（
                <code className="font-mono text-emerald-400/90">extra:标识</code>）。
              </p>
              {aclRows.some((r) => r.access === "pick") ? (
                <Input
                  value={aclPickFilter}
                  onChange={(e) => setAclPickFilter(e.target.value)}
                  placeholder="筛选要勾选的虚拟机 / 额外主机…"
                  className="h-8 border-slate-700 bg-[#080a0e] text-xs"
                />
              ) : null}
              {aclRows.length === 0 ? (
                <p className="rounded border border-dashed border-slate-700 py-6 text-center text-xs text-slate-500">
                  未添加用户。启用 ACL 且无条目时，无人能从堡垒机连任何目标。
                </p>
              ) : (
                <div className="space-y-3">
                  {aclRows.map((row) => (
                    <div key={row.clientId} className="rounded-lg border border-slate-700 bg-[#080a0e] p-3">
                      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-500">平台用户名</Label>
                          <Input
                            value={row.username}
                            onChange={(e) =>
                              setAclRows((prev) =>
                                prev.map((x) =>
                                  x.clientId === row.clientId
                                    ? { ...x, username: e.target.value.trim().toLowerCase() }
                                    : x
                                )
                              )
                            }
                            placeholder="alice"
                            className="h-8 max-w-[220px] border-slate-700 bg-[#0a0d12] font-mono text-xs"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-400"
                          onClick={() =>
                            setAclRows((prev) => prev.filter((x) => x.clientId !== row.clientId))
                          }
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <RadioGroup
                        value={row.access}
                        onValueChange={(v) =>
                          setAclRows((prev) =>
                            prev.map((x) =>
                              x.clientId === row.clientId
                                ? { ...x, access: v === "pick" ? "pick" : "all", picked: v === "all" ? [] : x.picked }
                                : x
                            )
                          )
                        }
                        className="flex flex-col gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="all" id={`${row.clientId}-all`} className="border-slate-500" />
                          <Label htmlFor={`${row.clientId}-all`} className="cursor-pointer text-xs text-slate-300">
                            全部虚拟机与额外主机（*）
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="pick" id={`${row.clientId}-pick`} className="border-slate-500" />
                          <Label htmlFor={`${row.clientId}-pick`} className="cursor-pointer text-xs text-slate-300">
                            仅下列目标
                          </Label>
                        </div>
                      </RadioGroup>
                      {row.access === "pick" ? (
                        <div className="mt-2 space-y-2 border-t border-slate-800 pt-2">
                          <div className="max-h-[min(60vh,480px)] space-y-1 overflow-y-auto rounded border border-slate-800 p-2">
                            {filteredAclTargets.length === 0 ? (
                              <p className="text-xs text-slate-500">无可用目标（先配置「额外主机」或等待 VM 列表加载）</p>
                            ) : (
                              filteredAclTargets.map((t) => {
                                const checked = row.picked.some((p) => p.toLowerCase() === t.key.toLowerCase());
                                return (
                                  <label
                                    key={`${row.clientId}-${t.key}`}
                                    className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-slate-900/80"
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(v) => {
                                        const on = v === true;
                                        setAclRows((prev) =>
                                          prev.map((x) => {
                                            if (x.clientId !== row.clientId) return x;
                                            const set = new Set(x.picked);
                                            if (on) set.add(t.key);
                                            else set.delete(t.key);
                                            return { ...x, picked: Array.from(set) };
                                          })
                                        );
                                      }}
                                      className="mt-0.5 border-slate-600"
                                    />
                                    <span className="min-w-0 flex-1 text-[11px] text-slate-300">{t.label}</span>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <Collapsible open={aclAdvancedJson} onOpenChange={handleAclAdvancedOpenChange}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-xs text-slate-400 hover:text-slate-200"
              >
                <ChevronDown
                  className={`size-4 transition-transform ${aclAdvancedJson ? "rotate-180" : ""}`}
                />
                高级：用 JSON 编辑 userVms（与上方表单二选一保存逻辑）
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              <p className="text-[11px] text-amber-200/80">
                展开后保存将以文本框为准。收起时若 JSON 合法，会自动同步到上方表单。
              </p>
              <Textarea
                value={userVmsText}
                onChange={(e) => setUserVmsText(e.target.value)}
                rows={8}
                className="border-slate-700 bg-[#0a0d12] font-mono text-xs text-slate-200"
              />
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2 rounded-lg border border-slate-800 bg-[#0a0d12] p-3">
            <Label className="text-xs text-slate-500">侧栏隐藏虚拟机</Label>
            <p className="text-[11px] text-slate-600">
              勾选后该 VM 对所有用户从堡垒机列表消失（与 ACL 无关）。
            </p>
            {policyVmsQ.isLoading ? (
              <p className="text-xs text-slate-500">加载 VM 列表…</p>
            ) : policyVmsQ.isError ? (
              <p className="text-xs text-red-400">{(policyVmsQ.error as Error).message}</p>
            ) : (
              <div className="max-h-[min(55vh,440px)] space-y-1 overflow-y-auto">
                {(policyVmsQ.data?.vms ?? EMPTY_VMS)
                  .filter((vm) => String(vm.moref ?? "").trim() !== "")
                  .map((vm) => {
                    const moref = String(vm.moref).trim();
                    const hidden = hiddenVmMorefsDraft.some((m) => m.toLowerCase() === moref.toLowerCase());
                    return (
                      <label
                        key={moref}
                        className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-slate-900/60"
                      >
                        <Checkbox
                          checked={hidden}
                          onCheckedChange={(v) => {
                            const wantHidden = v === true;
                            setHiddenVmMorefsDraft((prev) => {
                              const has = prev.some((m) => m.toLowerCase() === moref.toLowerCase());
                              if (wantHidden && !has) return [...prev, moref];
                              if (!wantHidden && has) {
                                return prev.filter((m) => m.toLowerCase() !== moref.toLowerCase());
                              }
                              return prev;
                            });
                          }}
                          className="mt-0.5 border-slate-600"
                        />
                        <span className="min-w-0 flex-1 text-xs">
                          <span className="font-medium text-slate-200">{vm.name}</span>
                          <span className="ml-1 font-mono text-[10px] text-slate-500">{moref}</span>
                        </span>
                      </label>
                    );
                  })}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-slate-800 pt-4">
            <div className="flex items-end justify-between gap-2">
              <div>
                <Label className="text-sm text-slate-300">额外主机（非 vCenter 纳管）</Label>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  ACL 中填 <span className="font-mono text-emerald-500">extra:标识id</span>
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-slate-600 bg-slate-900 text-xs"
                onClick={() => setExtraHostsDraft((prev) => [...prev, newExtraHostDraftRow()])}
              >
                <Plus className="mr-1 size-3.5" />
                添加
              </Button>
            </div>
            {extraHostsDraft.length === 0 ? (
              <p className="rounded border border-dashed border-slate-700 px-3 py-4 text-center text-xs text-slate-500">
                暂无条目
              </p>
            ) : (
              <div className="max-h-[min(60vh,560px)] space-y-3 overflow-y-auto pr-1">
                {extraHostsDraft.map((row) => (
                  <div key={row.clientId} className="space-y-2 rounded-lg border border-slate-700 bg-[#0a0d12] p-3">
                    <div className="flex justify-between">
                      <span className="text-[10px] font-medium text-slate-500">主机</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-400"
                        onClick={() =>
                          setExtraHostsDraft((prev) => prev.filter((x) => x.clientId !== row.clientId))
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500">id *</Label>
                        <Input
                          value={row.id}
                          onChange={(e) =>
                            setExtraHostsDraft((prev) =>
                              prev.map((x) => (x.clientId === row.clientId ? { ...x, id: e.target.value } : x))
                            )
                          }
                          className="h-8 border-slate-700 bg-[#080a0e] font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-slate-500">名称</Label>
                        <Input
                          value={row.name}
                          onChange={(e) =>
                            setExtraHostsDraft((prev) =>
                              prev.map((x) => (x.clientId === row.clientId ? { ...x, name: e.target.value } : x))
                            )
                          }
                          className="h-8 border-slate-700 bg-[#080a0e] text-xs"
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-[10px] text-slate-500">地址</Label>
                        <Input
                          value={row.address}
                          onChange={(e) =>
                            setExtraHostsDraft((prev) =>
                              prev.map((x) => (x.clientId === row.clientId ? { ...x, address: e.target.value } : x))
                            )
                          }
                          className="h-8 border-slate-700 bg-[#080a0e] font-mono text-xs"
                        />
                      </div>
                      <div className="flex gap-1 rounded border border-slate-700 p-0.5 sm:col-span-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExtraHostsDraft((prev) =>
                              prev.map((x) => (x.clientId === row.clientId ? { ...x, kind: "linux" } : x))
                            )
                          }
                          className={`flex-1 rounded px-2 py-1 text-[10px] ${
                            row.kind === "linux" ? "bg-slate-700" : "text-slate-500"
                          }`}
                        >
                          Linux
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setExtraHostsDraft((prev) =>
                              prev.map((x) => (x.clientId === row.clientId ? { ...x, kind: "windows" } : x))
                            )
                          }
                          className={`flex-1 rounded px-2 py-1 text-[10px] ${
                            row.kind === "windows" ? "bg-slate-700" : "text-slate-500"
                          }`}
                        >
                          Windows
                        </button>
                      </div>
                      {row.kind === "linux" ? (
                        <>
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-[10px] text-slate-500">SSH 端口 / 用户</Label>
                            <div className="flex gap-2">
                              <Input
                                value={row.sshPort}
                                onChange={(e) =>
                                  setExtraHostsDraft((prev) =>
                                    prev.map((x) =>
                                      x.clientId === row.clientId ? { ...x, sshPort: e.target.value } : x
                                    )
                                  )
                                }
                                className="h-8 w-24 border-slate-700 bg-[#080a0e] font-mono text-xs"
                              />
                              <Input
                                value={row.sshUser}
                                onChange={(e) =>
                                  setExtraHostsDraft((prev) =>
                                    prev.map((x) =>
                                      x.clientId === row.clientId ? { ...x, sshUser: e.target.value } : x
                                    )
                                  )
                                }
                                placeholder="用户"
                                className="h-8 flex-1 border-slate-700 bg-[#080a0e] text-xs"
                              />
                            </div>
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-[10px] text-slate-500">SSH 主机密钥指纹（必填）</Label>
                            <Input
                              value={row.sshHostKeyFingerprint}
                              onChange={(e) =>
                                setExtraHostsDraft((prev) =>
                                  prev.map((x) =>
                                    x.clientId === row.clientId
                                      ? { ...x, sshHostKeyFingerprint: e.target.value }
                                      : x
                                  )
                                )
                              }
                              placeholder="SHA256:..."
                              className="h-8 border-slate-700 bg-[#080a0e] font-mono text-xs"
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-[10px] text-slate-500">SSH 密码（可选，保存时校验）</Label>
                            <Input
                              type="password"
                              value={row.sshPassword}
                              onChange={(e) =>
                                setExtraHostsDraft((prev) =>
                                  prev.map((x) =>
                                    x.clientId === row.clientId ? { ...x, sshPassword: e.target.value } : x
                                  )
                                )
                              }
                              className="h-8 border-slate-700 bg-[#080a0e] text-xs"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-[10px] text-slate-500">
                              RDP 用户名提示（远程固定端口 3389）
                            </Label>
                            <Input
                              value={row.rdpUser}
                              onChange={(e) =>
                                setExtraHostsDraft((prev) =>
                                  prev.map((x) =>
                                    x.clientId === row.clientId ? { ...x, rdpUser: e.target.value } : x
                                  )
                                )
                              }
                              placeholder="Administrator"
                              className="h-8 border-slate-700 bg-[#080a0e] text-xs"
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-[10px] text-slate-500">
                              JumpServer RDP 网页 URL（HTTPS，Luna 会话链接；可选）
                            </Label>
                            <Input
                              value={row.rdpWebUrl}
                              onChange={(e) =>
                                setExtraHostsDraft((prev) =>
                                  prev.map((x) =>
                                    x.clientId === row.clientId ? { ...x, rdpWebUrl: e.target.value } : x
                                  )
                                )
                              }
                              placeholder="https://jump.example.com/luna/..."
                              className="h-8 border-slate-700 bg-[#080a0e] font-mono text-[11px]"
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-[10px] text-slate-500">RDP 密码（可选）</Label>
                            <Input
                              type="password"
                              value={row.rdpPassword}
                              onChange={(e) =>
                                setExtraHostsDraft((prev) =>
                                  prev.map((x) =>
                                    x.clientId === row.clientId ? { ...x, rdpPassword: e.target.value } : x
                                  )
                                )
                              }
                              className="h-8 border-slate-700 bg-[#080a0e] text-xs"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-slate-800 pt-4">
            <div className="flex items-end justify-between">
              <div>
                <Label className="text-sm text-slate-300">虚拟机手动分组</Label>
                <p className="text-[11px] text-slate-600">
                  可展开「从虚拟机列表勾选」写入 moRef，或在文本框中多行 / 逗号分隔；侧栏优先显示手动组名。
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-slate-600 bg-slate-900 text-xs"
                onClick={() => setManualVmGroupsDraft((prev) => [...prev, newManualVmGroupDraftRow()])}
              >
                <Plus className="mr-1 size-3.5" />
                添加分组
              </Button>
            </div>
            <div className="max-h-[min(65vh,640px)] space-y-2 overflow-y-auto">
              {manualVmGroupsDraft.map((row) => {
                const gFilter = (manualGroupVmFilter[row.clientId] ?? "").trim().toLowerCase();
                const vms = policyVmsQ.data?.vms ?? EMPTY_VMS;
                const filteredGroupVms = vms.filter((vm) => {
                  const mf = String(vm.moref ?? "").trim();
                  if (!mf) return false;
                  if (!gFilter) return true;
                  return (
                    mf.toLowerCase().includes(gFilter) || String(vm.name ?? "").toLowerCase().includes(gFilter)
                  );
                });
                return (
                  <div key={row.clientId} className="rounded-lg border border-slate-700 bg-[#0a0d12] p-3">
                    <div className="mb-2 flex justify-between gap-2">
                      <Input
                        value={row.name}
                        onChange={(e) =>
                          setManualVmGroupsDraft((prev) =>
                            prev.map((x) => (x.clientId === row.clientId ? { ...x, name: e.target.value } : x))
                          )
                        }
                        placeholder="组名，如 生产区"
                        className="h-8 max-w-xs border-slate-700 bg-[#080a0e] text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-400"
                        onClick={() =>
                          setManualVmGroupsDraft((prev) => prev.filter((x) => x.clientId !== row.clientId))
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <Collapsible className="mb-2">
                      <CollapsibleTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 border-slate-600 bg-slate-900 text-[11px] text-slate-300"
                        >
                          <ChevronDown className="size-3.5" />
                          从虚拟机列表勾选 moRef
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 space-y-2 rounded border border-slate-800 bg-[#080a0e] p-2">
                        {policyVmsQ.isLoading ? (
                          <p className="text-xs text-slate-500">加载 VM 列表…</p>
                        ) : policyVmsQ.isError ? (
                          <p className="text-xs text-red-400">{(policyVmsQ.error as Error).message}</p>
                        ) : (
                          <>
                            <Input
                              value={manualGroupVmFilter[row.clientId] ?? ""}
                              onChange={(e) =>
                                setManualGroupVmFilter((prev) => ({
                                  ...prev,
                                  [row.clientId]: e.target.value,
                                }))
                              }
                              placeholder="筛选名称 / moRef…"
                              className="h-8 border-slate-700 bg-[#0a0d12] text-xs"
                            />
                            <div className="max-h-52 space-y-1 overflow-y-auto">
                              {filteredGroupVms.length === 0 ? (
                                <p className="text-xs text-slate-500">无匹配虚拟机</p>
                              ) : (
                                filteredGroupVms.map((vm) => {
                                  const moref = String(vm.moref).trim();
                                  const checked = morefListContains(row.morefsText, moref);
                                  return (
                                    <label
                                      key={`${row.clientId}-${moref}`}
                                      className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-slate-900/70"
                                    >
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={(v) => {
                                          const on = v === true;
                                          setManualVmGroupsDraft((prev) =>
                                            prev.map((x) =>
                                              x.clientId === row.clientId
                                                ? {
                                                    ...x,
                                                    morefsText: toggleMorefInMultilineText(x.morefsText, moref, on),
                                                  }
                                                : x
                                            )
                                          );
                                        }}
                                        className="mt-0.5 border-slate-600"
                                      />
                                      <span className="min-w-0 flex-1 text-[11px] text-slate-300">
                                        <span className="font-medium">{vm.name}</span>
                                        <span className="ml-1 font-mono text-[10px] text-slate-500">{moref}</span>
                                      </span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                    <Label className="text-[10px] text-slate-500">moRef 列表（可编辑）</Label>
                    <Textarea
                      value={row.morefsText}
                      onChange={(e) =>
                        setManualVmGroupsDraft((prev) =>
                          prev.map((x) => (x.clientId === row.clientId ? { ...x, morefsText: e.target.value } : x))
                        )
                      }
                      rows={3}
                      placeholder="vm-10"
                      className="mt-1 border-slate-700 bg-[#080a0e] font-mono text-[11px]"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-800 pt-4">
            <div className="flex items-end justify-between">
              <div>
                <Label className="text-sm text-slate-300">Windows 虚拟机 · JumpServer RDP</Label>
                <p className="text-[11px] text-slate-600">
                  每台 Windows VM 一行：moRef 对应虚拟机，URL 填 JumpServer Luna 的 RDP 网页地址，前台用 iframe 内嵌打开。
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-slate-600 bg-slate-900 text-xs"
                onClick={() => setVmRdpWebDraft((prev) => [...prev, newVmRdpWebDraftRow()])}
              >
                <Plus className="mr-1 size-3.5" />
                添加
              </Button>
            </div>
            <div className="max-h-[min(50vh,520px)] space-y-2 overflow-y-auto">
              {vmRdpWebDraft.map((row) => {
                const listVms = (policyVmsQ.data?.vms ?? EMPTY_VMS).filter(
                  (vm) => String(vm.moref ?? "").trim() !== ""
                );
                const mfTrim = row.moref.trim();
                const selectVal =
                  mfTrim && listVms.some((v) => String(v.moref).trim() === mfTrim) ? mfTrim : "__custom__";
                return (
                <div key={row.clientId} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-700 bg-[#0a0d12] p-2">
                  <div className="min-w-[160px] flex-[1.2] space-y-1">
                    <Label className="text-[10px] text-slate-500">moRef</Label>
                    {listVms.length > 0 && !policyVmsQ.isLoading ? (
                      <Select
                        value={selectVal}
                        onValueChange={(v) =>
                          setVmRdpWebDraft((prev) =>
                            prev.map((x) =>
                              x.clientId === row.clientId
                                ? { ...x, moref: v === "__custom__" ? x.moref : v }
                                : x
                            )
                          )
                        }
                      >
                        <SelectTrigger className="h-8 border-slate-700 bg-[#080a0e] text-xs">
                          <SelectValue placeholder="从列表选择…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__custom__">自定义（下方输入）</SelectItem>
                          {listVms.map((vm) => {
                            const mf = String(vm.moref).trim();
                            return (
                              <SelectItem key={mf} value={mf}>
                                {vm.name} · {mf}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    ) : null}
                    <Input
                      value={row.moref}
                      onChange={(e) =>
                        setVmRdpWebDraft((prev) =>
                          prev.map((x) => (x.clientId === row.clientId ? { ...x, moref: e.target.value } : x))
                        )
                      }
                      placeholder="vm-42"
                      className="h-8 border-slate-700 bg-[#080a0e] font-mono text-xs"
                    />
                  </div>
                  <div className="min-w-[200px] flex-[2] space-y-1">
                    <Label className="text-[10px] text-slate-500">JumpServer RDP HTTPS URL</Label>
                    <Input
                      value={row.url}
                      onChange={(e) =>
                        setVmRdpWebDraft((prev) =>
                          prev.map((x) => (x.clientId === row.clientId ? { ...x, url: e.target.value } : x))
                        )
                      }
                      placeholder="https://jump.example.com/luna/..."
                      className="h-8 border-slate-700 bg-[#080a0e] font-mono text-[11px]"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-400"
                    onClick={() => setVmRdpWebDraft((prev) => prev.filter((x) => x.clientId !== row.clientId))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                );
              })}
            </div>
          </div>

          <Button
            type="button"
            className="w-full bg-emerald-700 text-white hover:bg-emerald-600"
            disabled={savePolicy.isPending}
            onClick={() => savePolicy.mutate()}
          >
            {savePolicy.isPending ? "保存中…" : "保存策略"}
          </Button>
        </div>
        </div>
      </div>
    </div>
  );
};

export default VCenterBastionAdmin;
