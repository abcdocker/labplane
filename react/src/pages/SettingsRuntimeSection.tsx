import React, { useEffect, useState } from "react";
import { APP_CONFIG_QUERY_KEY } from "@/hooks/use-app-config";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Plus, RotateCcw, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { YamlEditor } from "@/components/YamlEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { apiGetJson, apiPutJson, type K8sSidebarMenuItem, type RuntimeSettingsDTO } from "@/lib/api";
import { CollapsibleManual } from "@/components/CollapsibleManual";
import AccountPlatformSettingsBody from "@/pages/AccountPlatformSettingsBody";
import OidcAuthentikHelp from "@/components/OidcAuthentikHelp";
import HarborRedisIndexSettingsPanel from "@/components/HarborRedisIndexSettingsPanel";

export type SettingsRuntimeVariant = "full" | "k8s" | "vcenter" | "account" | "baota";

type SettingsRuntimeSectionProps = {
  variant?: SettingsRuntimeVariant;
};

const DEFAULT_K8S_SIDEBAR_MENU: K8sSidebarMenuItem[] = [
  { key: "pods", label: "Pods", order: 10 },
  { key: "namespaces", label: "NameSpace", order: 20 },
  { key: "nodes", label: "Nodes", order: 30 },
  { key: "etcd", label: "etcd", order: 35 },
  { key: "rbac", label: "RBAC", order: 40 },
  { key: "routeManager", label: "路由管理", order: 45 },
  { key: "harbor", label: "Harbor 仓库", order: 50 },
  { key: "customResources", label: "自定义资源", order: 60 },
];

function normalizeK8sSidebarMenu(items?: K8sSidebarMenuItem[]): K8sSidebarMenuItem[] {
  const defaults = new Map(DEFAULT_K8S_SIDEBAR_MENU.map((item) => [item.key, item]));
  const custom = new Map<string, K8sSidebarMenuItem>();
  (items ?? []).forEach((item) => {
    const base = defaults.get(item.key);
    if (!base || custom.has(item.key)) return;
    custom.set(item.key, {
      key: item.key,
      label: item.label?.trim() || base.label,
      hidden: Boolean(item.hidden),
      order: Number(item.order) || base.order,
    });
  });
  const merged = DEFAULT_K8S_SIDEBAR_MENU.map((base) => custom.get(base.key) ?? { ...base });
  merged.sort((a, b) => (a.order || 0) - (b.order || 0));
  return merged.map((item, index) => ({
    ...item,
    label: item.label?.trim() || defaults.get(item.key)?.label || item.key,
    order: (index + 1) * 10,
  }));
}

function moveK8sSidebarMenuItem(items: K8sSidebarMenuItem[], index: number, delta: -1 | 1): K8sSidebarMenuItem[] {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return items;
  const [picked] = next.splice(index, 1);
  next.splice(target, 0, picked);
  return next.map((item, idx) => ({ ...item, order: (idx + 1) * 10 }));
}

const SettingsRuntimeSection: React.FC<SettingsRuntimeSectionProps> = ({
  variant = "full",
}) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState<RuntimeSettingsDTO | null>(null);
  const [menuDialogOpen, setMenuDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiGetJson<RuntimeSettingsDTO>("/api/settings/runtime");
      setForm(data);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setField = (key: string, value: unknown) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const k8sSidebarMenu = normalizeK8sSidebarMenu(form?.k8sSidebarMenu);

  const updateK8sSidebarMenu = (updater: (items: K8sSidebarMenuItem[]) => K8sSidebarMenuItem[]) => {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        k8sSidebarMenu: normalizeK8sSidebarMenu(updater(normalizeK8sSidebarMenu(prev.k8sSidebarMenu))),
      };
    });
  };

  const onSave = async () => {
    if (!form) return;
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const payload = { ...form } as Record<string, unknown>;
      payload.k8sSidebarMenu = normalizeK8sSidebarMenu(form.k8sSidebarMenu);
      const mh = String(payload.mysqlHost ?? "").trim();
      const mp = Number(payload.mysqlPort ?? 0);
      const mdb = String(payload.mysqlDatabase ?? "").trim();
      const mu = String(payload.mysqlUser ?? "").trim();
      if (mh && mp > 0 && mdb && mu) {
        payload.mysqlDsn = "";
      }
      const rh = String(payload.redisHost ?? "").trim();
      const rport = Number(payload.redisPort ?? 0);
      if (rh && rport > 0) {
        payload.redisAddr = "";
      }
      payload.baotaSslCertName = String(payload.baotaSslCertName ?? "").trim();
      payload.baotaSslPemContent = String(payload.baotaSslPemContent ?? "").trim();
      payload.baotaSslKeyContent = String(payload.baotaSslKeyContent ?? "").trim();
      if ((payload.baotaSslPemContent === "") !== (payload.baotaSslKeyContent === "")) {
        throw new Error("baotaSslPemContent 与 baotaSslKeyContent 必须同时填写");
      }
      // idracInsecure 默认 true；undefined 会被 JSON.stringify 省略，后端会当成 false，与开关「!== false」不一致
      payload.idracInsecure = form.idracInsecure !== false;
      await apiPutJson("/api/settings/runtime", payload);
      const msg = variant === "k8s" ? "Saved and reloaded." : "已保存并重载配置";
      setOk(msg);
      toast.success(variant === "k8s" ? "Saved successfully." : "保存成功");
      await queryClient.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["runtime-status"] });
      await load();
    } catch (e) {
      const m = (e as Error).message;
      setErr(m);
      toast.error(variant === "k8s" ? `Save failed: ${m}` : `保存失败：${m}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {variant === "k8s"
          ? "Loading runtime settings…"
          : variant === "baota"
            ? "加载宝塔与 Ingress 配置…"
            : "加载运行时配置…"}
      </div>
    );
  }

  if (err && !form) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {err}
      </div>
    );
  }

  if (!form) return null;

  const v = variant;
  const showAccountFull = v === "full";
  const showK8s = v === "full" || v === "k8s";
  const showVCenter = v === "full" || v === "vcenter";
  const k8sMode = (form.k8s as { mode?: string } | undefined)?.mode ?? "none";
  const k8sKube = (form.k8s as { kubeconfigYaml?: string } | undefined)?.kubeconfigYaml ?? "";

  if (v === "account") {
    return (
      <AccountPlatformSettingsBody
        form={form}
        setField={setField}
        err={err}
        ok={ok}
        saving={saving}
        onSave={onSave}
      />
    );
  }

  if (v === "baota") {
    const btTargets: Record<string, unknown>[] = Array.isArray(form.baotaTargets)
      ? ([...form.baotaTargets] as Record<string, unknown>[])
      : [];
    const setBtTargets = (next: Record<string, unknown>[]) => {
      setField("baotaTargets", next.length ? next : undefined);
    };
    return (
      <div className="space-y-6">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-5">
            <h2 className="text-base font-bold text-slate-900">宝塔与 Ingress</h2>
            <p className="mt-1 text-xs text-slate-500">
              平台对外地址、同步开关、面板 API、DDNS 与同步间隔等；保存后写入 runtime-config 并热重载。数据库、Redis 与控制台登录请在「账户与平台」中配置。
            </p>
          </div>
          <div className="space-y-6 p-6 text-sm">
            <div className="space-y-2">
              <Label>platformPublicUrl</Label>
              <Input
                value={String(form.platformPublicUrl ?? "")}
                onChange={(e) => setField("platformPublicUrl", e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
              <span className="text-slate-700">Ingress ↔ 宝塔同步</span>
              <Switch
                checked={Boolean(form.ingressBaotaSyncEnabled)}
                onCheckedChange={(x) => setField("ingressBaotaSyncEnabled", x)}
              />
            </div>
            <div className="space-y-3 rounded-lg border border-sky-100 bg-sky-50/50 p-4">
              <CollapsibleManual
                storageKey="settings.runtime.ingress-hostnetwork-hint"
                title="集群扩展（ingress-nginx hostNetwork）"
                variant="skyInline"
              >
                <p className="text-[11px] leading-relaxed text-slate-600">
                  供「集群设置」一键安装：控制器使用 hostNetwork，在节点上监听下方 HTTP/HTTPS（默认 80/443）；Prometheus metrics
                  沿用官方清单默认 10254（ingress-nginx v1.10 不支持{" "}
                  <code className="rounded bg-white px-0.5">--metrics-port</code>）。宝塔 <code className="rounded bg-white px-0.5">ddnsHost</code>{" "}
                  填节点 IP，<code className="rounded bg-white px-0.5">defaultPort</code> 与 HTTP 端口一致。
                </p>
              </CollapsibleManual>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">ingressNginxHostHttpPort（1–65535，0 表示默认 80）</Label>
                  <Input
                    type="number"
                    min={0}
                    max={65535}
                    placeholder="80"
                    value={
                      form.ingressNginxHostHttpPort != null && Number(form.ingressNginxHostHttpPort) > 0
                        ? String(form.ingressNginxHostHttpPort)
                        : ""
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") {
                        setField("ingressNginxHostHttpPort", 0);
                        return;
                      }
                      const n = Number(v);
                      if (!Number.isFinite(n)) return;
                      setField("ingressNginxHostHttpPort", Math.floor(n));
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">ingressNginxHostHttpsPort（1–65535，0 表示默认 443）</Label>
                  <Input
                    type="number"
                    min={0}
                    max={65535}
                    placeholder="443"
                    value={
                      form.ingressNginxHostHttpsPort != null && Number(form.ingressNginxHostHttpsPort) > 0
                        ? String(form.ingressNginxHostHttpsPort)
                        : ""
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") {
                        setField("ingressNginxHostHttpsPort", 0);
                        return;
                      }
                      const n = Number(v);
                      if (!Number.isFinite(n)) return;
                      setField("ingressNginxHostHttpsPort", Math.floor(n));
                    }}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">ingressNginxControllerNodeName（可选，kubectl get nodes 的 NAME；安装 ingress 时默认固定到该节点）</Label>
                  <Input
                    className="font-mono text-xs"
                    placeholder="例如 k8s-master-01"
                    value={String(form.ingressNginxControllerNodeName ?? "")}
                    onChange={(e) => setField("ingressNginxControllerNodeName", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">ingressNginxManifestUrl（可选，空则用内置 bare metal 链接）</Label>
                  <Input
                    className="font-mono text-xs"
                    value={String(form.ingressNginxManifestUrl ?? "")}
                    onChange={(e) => setField("ingressNginxManifestUrl", e.target.value)}
                    placeholder="https://raw.githubusercontent.com/…/deploy.yaml"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">k8sAddonsManifestMirror（国内建议「优先 ghproxy」）</Label>
                  <Select
                    value={String(form.k8sAddonsManifestMirror ?? "").trim() || "auto"}
                    onValueChange={(v) => setField("k8sAddonsManifestMirror", v)}
                  >
                    <SelectTrigger className="font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">自动（直连失败再走 ghproxy）</SelectItem>
                      <SelectItem value="ghproxy_preferred">国内推荐（优先 ghproxy）</SelectItem>
                      <SelectItem value="direct">仅直连 GitHub</SelectItem>
                      <SelectItem value="ghproxy_only">仅经 ghproxy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="space-y-3 rounded-lg border border-amber-100 bg-amber-50/50 p-4">
              <p className="text-sm font-semibold text-amber-950">多宝塔实例（企业版 / 多节点）</p>
              <p className="text-[11px] leading-relaxed text-slate-600">
                非空时以本列表为准；Ingress 可加注解 <code className="rounded bg-white px-0.5 font-mono text-[10px]">labplane.io/baota-target</code> 或{" "}
                <code className="rounded bg-white px-0.5 font-mono text-[10px]">labplane.io/baota-target</code> 指定实例 id。未注解则同步到「默认」实例。留空本列表则只用下方{" "}
                <span className="font-mono">baotaUrl</span> / <span className="font-mono">baotaApiKey</span>。
              </p>
              {btTargets.map((row, idx) => (
                <div
                  key={idx}
                  className="grid gap-3 rounded-lg border border-amber-200/80 bg-white p-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <div className="space-y-1.5">
                    <Label className="text-xs">id（小写、数字、连字符）</Label>
                    <Input
                      className="font-mono text-xs"
                      value={String(row.id ?? "")}
                      onChange={(e) => {
                        const next = [...btTargets];
                        next[idx] = { ...next[idx], id: e.target.value };
                        setBtTargets(next);
                      }}
                      placeholder="如 hk-edge"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">显示名称</Label>
                    <Input
                      value={String(row.name ?? "")}
                      onChange={(e) => {
                        const next = [...btTargets];
                        next[idx] = { ...next[idx], name: e.target.value };
                        setBtTargets(next);
                      }}
                      placeholder="如 香港边缘"
                    />
                  </div>
                  <div className="flex items-end gap-2 lg:col-span-1">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                      <input
                        type="radio"
                        name="baota-default-instance"
                        checked={Boolean(row.default)}
                        onChange={() => {
                          const next = btTargets.map((x, i) => ({ ...x, default: i === idx }));
                          setBtTargets(next);
                        }}
                        className="h-3.5 w-3.5"
                      />
                      默认实例
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-red-600"
                      onClick={() => {
                        const next = btTargets.filter((_, i) => i !== idx);
                        setBtTargets(next);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">url（面板根地址）</Label>
                    <Input
                      className="font-mono text-xs"
                      value={String(row.url ?? "")}
                      onChange={(e) => {
                        const next = [...btTargets];
                        next[idx] = { ...next[idx], url: e.target.value };
                        setBtTargets(next);
                      }}
                      placeholder="https://bt.example.com:8888"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">apiKey（留空或 *** 保留已保存）</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      className="font-mono text-xs"
                      value={String(row.apiKey ?? "")}
                      onChange={(e) => {
                        const next = [...btTargets];
                        next[idx] = { ...next[idx], apiKey: e.target.value };
                        setBtTargets(next);
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded border border-slate-100 px-2 py-2 sm:col-span-2 lg:col-span-3">
                    <span className="text-xs text-slate-700">跳过 TLS 校验（仅该实例）</span>
                    <Switch
                      checked={Boolean(row.skipTlsVerify)}
                      onCheckedChange={(x) => {
                        const next = [...btTargets];
                        next[idx] = { ...next[idx], skipTlsVerify: x };
                        setBtTargets(next);
                      }}
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => {
                  setBtTargets([
                    ...btTargets,
                    {
                      id: "",
                      name: "",
                      url: "",
                      apiKey: "",
                      skipTlsVerify: false,
                      default: btTargets.length === 0,
                    },
                  ]);
                }}
              >
                <Plus className="h-4 w-4" />
                添加实例
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>baotaUrl（未使用上方多实例列表时必填）</Label>
                <Input
                  value={String(form.baotaUrl ?? "")}
                  onChange={(e) => setField("baotaUrl", e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>baotaApiKey（留空保留）</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={String(form.baotaApiKey ?? "")}
                  onChange={(e) => setField("baotaApiKey", e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>ddnsHost</Label>
                <Input
                  value={String(form.ddnsHost ?? "")}
                  onChange={(e) => setField("ddnsHost", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>defaultPort（Ingress 默认端口）</Label>
                <Input
                  value={String(form.defaultPort ?? "")}
                  onChange={(e) => setField("defaultPort", e.target.value)}
                  placeholder="如 443"
                />
              </div>
              <div className="space-y-2">
                <Label>syncIntervalSec</Label>
                <Input
                  type="number"
                  min={5}
                  value={Number(form.syncIntervalSec ?? 30)}
                  onChange={(e) => setField("syncIntervalSec", Number(e.target.value))}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>baotaUpstreamHost（宝塔回源域名 / IP，可选）</Label>
                <Input
                  value={String(form.baotaUpstreamHost ?? "")}
                  onChange={(e) => setField("baotaUpstreamHost", e.target.value)}
                  placeholder="留空则回退到 ddnsHost"
                />
              </div>
              <div className="space-y-2">
                <Label>baotaUpstreamScheme（宝塔回源协议）</Label>
                <Select
                  value={String(form.baotaUpstreamScheme ?? "").trim() === "https" ? "https" : "http"}
                  onValueChange={(v) => setField("baotaUpstreamScheme", v === "https" ? "https" : "http")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="https">HTTPS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>baotaUpstreamPort（宝塔回源端口，可选）</Label>
                <Input
                  value={String(form.baotaUpstreamPort ?? "")}
                  onChange={(e) => setField("baotaUpstreamPort", e.target.value)}
                  placeholder="留空则按协议走默认端口，如 443"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>baotaSslCertName（宝塔证书夹名称，可选）</Label>
              <Input
                value={String(form.baotaSslCertName ?? "")}
                onChange={(e) => setField("baotaSslCertName", e.target.value)}
                placeholder="未填时可回退到平台已保存 PEM/KEY 或这里配置的证书名"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>baotaSslPemContent（PEM 内容，可选）</Label>
                <YamlEditor
                  value={String(form.baotaSslPemContent ?? "")}
                  onChange={(value) => setField("baotaSslPemContent", value)}
                  height="180px"
                />
              </div>
              <div className="space-y-2">
                <Label>baotaSslKeyContent（KEY 内容，可选）</Label>
                <YamlEditor
                  value={String(form.baotaSslKeyContent ?? "")}
                  onChange={(value) => setField("baotaSslKeyContent", value)}
                  height="180px"
                />
              </div>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-slate-100 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-700">已保存平台证书内容</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${Boolean(form.hasBaotaSSLMaterial) ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {Boolean(form.hasBaotaSSLMaterial) ? "已保存" : "未保存"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-700">clearBaotaSslMaterial</span>
                <Switch
                  checked={Boolean(form.clearBaotaSslMaterial)}
                  onCheckedChange={(x) => setField("clearBaotaSslMaterial", x)}
                />
              </div>
            </div>
            <p className="text-xs leading-6 text-slate-500">
              证书来源优先级：平台已保存 PEM/KEY &gt; Ingress 证书名 &gt; 这里配置的证书名。PEM/KEY 仅作为写入字段，保存后不会再次通过接口回显，也不会写入 Ingress 注解。
            </p>
            <div className="flex flex-col gap-3 rounded-lg border border-slate-100 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-slate-700">baotaSkipTlsVerify</span>
              <Switch
                checked={Boolean(form.baotaSkipTlsVerify)}
                onCheckedChange={(x) => setField("baotaSkipTlsVerify", x)}
              />
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-slate-100 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-slate-700">baotaDisableHttpKeepalive</span>
              <Switch
                checked={Boolean(form.baotaDisableHttpKeepalive)}
                onCheckedChange={(x) => setField("baotaDisableHttpKeepalive", x)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>baotaHttpTimeoutSec</Label>
                <Input
                  type="number"
                  min={1}
                  value={Number(form.baotaHttpTimeoutSec ?? 45)}
                  onChange={(e) => setField("baotaHttpTimeoutSec", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>baotaTcpProbeTimeoutSec</Label>
                <Input
                  type="number"
                  min={1}
                  value={Number(form.baotaTcpProbeTimeoutSec ?? 5)}
                  onChange={(e) => setField("baotaTcpProbeTimeoutSec", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>baotaCheckMinIntervalSec</Label>
                <Input
                  type="number"
                  min={1}
                  value={Number(form.baotaCheckMinIntervalSec ?? 90)}
                  onChange={(e) => setField("baotaCheckMinIntervalSec", Number(e.target.value))}
                />
              </div>
            </div>
            {err && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">{err}</div>
            )}
            {ok && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
                {ok}
              </div>
            )}
            <Button type="button" onClick={() => void onSave()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中…
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  保存
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-base font-bold text-slate-900">
            {v === "k8s" && "Cluster connection"}
            {v === "vcenter" && "vCenter"}
            {v === "full" && "运行时配置（runtime-config.json）"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {v === "full" &&
              "在此补充 K8s、vCenter 等；必填项（MySQL/Redis/平台 URL）须保持有效。Redis 仅需 IP、端口、密码；密钥类留空表示不修改原值。宝塔与 Ingress 请在「宝塔」工作区 → 宝塔设置中配置。"}
            {v === "k8s" && "Use in-cluster credentials or paste kubeconfig. Applied after save."}
            {v === "vcenter" && "vCenter 与虚拟机 SSH 默认；保存后热重载。"}
          </p>
        </div>
        <div className="p-6 space-y-6 text-sm">
          {showAccountFull && (
            <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>platformPublicUrl</Label>
              <Input
                value={String(form.platformPublicUrl ?? "")}
                onChange={(e) => setField("platformPublicUrl", e.target.value)}
              />
            </div>
            {String(form.mysqlHost ?? "").trim() === "" &&
              String(form.mysqlDsn ?? "").trim() !== "" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-amber-800">当前 mysqlDsn（旧格式，请迁移到下方分字段后保存）</Label>
                  <Input
                    readOnly
                    className="font-mono text-xs bg-amber-50"
                    value={String(form.mysqlDsn ?? "")}
                  />
                </div>
              )}
            <div className="space-y-2 sm:col-span-2">
              <Label>MySQL 地址</Label>
              <Input
                value={String(form.mysqlHost ?? "")}
                onChange={(e) => setField("mysqlHost", e.target.value)}
                placeholder="127.0.0.1"
              />
            </div>
            <div className="space-y-2">
              <Label>MySQL 端口</Label>
              <Input
                type="number"
                min={1}
                max={65535}
                value={Number(form.mysqlPort ?? 3306)}
                onChange={(e) => setField("mysqlPort", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>库名</Label>
              <Input
                value={String(form.mysqlDatabase ?? "")}
                onChange={(e) => setField("mysqlDatabase", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>用户</Label>
              <Input
                value={String(form.mysqlUser ?? "")}
                onChange={(e) => setField("mysqlUser", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>MySQL 密码（留空或 *** 保留原值）</Label>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={String(form.mysqlPassword ?? "")}
                onChange={(e) => setField("mysqlPassword", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Redis IP</Label>
              <Input
                value={String(form.redisHost ?? "")}
                onChange={(e) => setField("redisHost", e.target.value)}
                placeholder="127.0.0.1"
              />
            </div>
            <div className="space-y-2">
              <Label>Redis 端口</Label>
              <Input
                type="number"
                min={1}
                max={65535}
                value={Number(form.redisPort ?? 6379)}
                onChange={(e) => setField("redisPort", Number(e.target.value))}
              />
            </div>
            {String(form.redisHost ?? "").trim() === "" &&
              String(form.redisAddr ?? "").trim() !== "" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-amber-800">当前 redisAddr（旧格式，请迁移到 IP+端口）</Label>
                  <Input
                    readOnly
                    className="font-mono text-xs bg-amber-50"
                    value={String(form.redisAddr ?? "")}
                  />
                </div>
              )}
            <div className="space-y-2 sm:col-span-2">
              <Label>Redis 密码（留空保留原值）</Label>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={String(form.redisPassword ?? "")}
                onChange={(e) => setField("redisPassword", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>encryptionKey（留空保留原值）</Label>
              <Input
                value={String(form.encryptionKey ?? "")}
                onChange={(e) => setField("encryptionKey", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-6">
            <p className="text-sm font-semibold text-slate-900">控制台登录</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>dashboardUser</Label>
                <Input
                  value={String(form.dashboardUser ?? "")}
                  onChange={(e) => setField("dashboardUser", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>dashboardSessionDays</Label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={Number(form.dashboardSessionDays ?? 7)}
                  onChange={(e) => setField("dashboardSessionDays", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>dashboardPassword（留空或 *** 保留）</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={String(form.dashboardPassword ?? "")}
                  onChange={(e) => setField("dashboardPassword", e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>dashboardSessionSecret（留空或 *** 保留）</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={String(form.dashboardSessionSecret ?? "")}
                  onChange={(e) => setField("dashboardSessionSecret", e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>dashboardListenAddr（如 :8080）</Label>
                <Input
                  value={String(form.dashboardListenAddr ?? "")}
                  onChange={(e) => setField("dashboardListenAddr", e.target.value)}
                  placeholder=":8080"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 sm:col-span-2">
                <span className="text-slate-700">dashboardCookieSecure（HTTPS）</span>
                <Switch
                  checked={Boolean(form.dashboardCookieSecure)}
                  onCheckedChange={(x) => setField("dashboardCookieSecure", x)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-6">
            <p className="text-sm font-semibold text-slate-900">OIDC（四项须同时填写或留空）</p>
            <OidcAuthentikHelp />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>oidcIssuerUrl</Label>
                <Input
                  value={String(form.oidcIssuerUrl ?? "")}
                  onChange={(e) => setField("oidcIssuerUrl", e.target.value)}
                  placeholder="https://idp.example.com/application/o/labplane/"
                />
              </div>
              <div className="space-y-2">
                <Label>oidcClientId</Label>
                <Input
                  value={String(form.oidcClientId ?? "")}
                  onChange={(e) => setField("oidcClientId", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>oidcClientSecret（留空或 *** 保留）</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={String(form.oidcClientSecret ?? "")}
                  onChange={(e) => setField("oidcClientSecret", e.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>oidcRedirectUrl</Label>
                <Input
                  value={String(form.oidcRedirectUrl ?? "")}
                  onChange={(e) => setField("oidcRedirectUrl", e.target.value)}
                  placeholder="https://dashboard.example.com/api/auth/oidc/callback"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>oidcScopes（空格分隔，默认可留空使用服务端默认）</Label>
                <Input
                  value={String(form.oidcScopes ?? "")}
                  onChange={(e) => setField("oidcScopes", e.target.value)}
                  placeholder="openid profile email"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2 sm:col-span-2">
                <span className="text-sm text-slate-800">
                  oidcSkipIssuerCheck（跳过 issuer 与发现文档比对；仅排查用）
                </span>
                <Switch
                  checked={form.oidcSkipIssuerCheck === true}
                  onCheckedChange={(x) => setField("oidcSkipIssuerCheck", x ? true : false)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/40 px-3 py-2 sm:col-span-2">
                <span className="text-sm text-slate-800">
                  oidcSkipClientIdCheck（跳过 aud 须含 Client ID；仅排查用）
                </span>
                <Switch
                  checked={form.oidcSkipClientIdCheck === true}
                  onCheckedChange={(x) => setField("oidcSkipClientIdCheck", x ? true : false)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>oidcSupportedSigningAlgs（可选，逗号分隔，如 RS256,ES256）</Label>
                <Input
                  value={String(form.oidcSupportedSigningAlgs ?? "")}
                  onChange={(e) => setField("oidcSupportedSigningAlgs", e.target.value)}
                  placeholder="留空则由 IdP 发现文档 / 默认 RS256"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>oidcClockSkewSec（可选，0–3600；本机时钟偏快时缓解 id_token 过期）</Label>
                <Input
                  type="number"
                  min={0}
                  max={3600}
                  value={form.oidcClockSkewSec != null ? String(form.oidcClockSkewSec) : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") {
                      setField("oidcClockSkewSec", null);
                      return;
                    }
                    const n = Number(v);
                    if (!Number.isFinite(n)) return;
                    setField("oidcClockSkewSec", Math.min(3600, Math.max(0, Math.floor(n))));
                  }}
                  placeholder="留空表示沿用环境变量或未设置"
                />
              </div>
            </div>
          </div>
            </>
          )}
          {showK8s && (
          <>
          <div className="space-y-2">
            <Label>{v === "k8s" ? "Cluster mode" : "K8s 模式"}</Label>
            <Select
              value={k8sMode}
              onValueChange={(mode) =>
                setForm((prev) => ({
                  ...prev!,
                  k8s: {
                    ...(prev!.k8s as object),
                    mode,
                    kubeconfigYaml: mode === "kubeconfig" ? k8sKube : "",
                  },
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">none</SelectItem>
                <SelectItem value="incluster">incluster</SelectItem>
                <SelectItem value="kubeconfig">kubeconfig</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {k8sMode === "kubeconfig" && (
            <div className="space-y-2">
              <Label>
                {v === "k8s"
                  ? "Kubeconfig YAML (*** if set; leave blank to keep existing)"
                  : "kubeconfigYaml（*** 表示已配置，留空保留）"}
              </Label>
              <YamlEditor
                value={String((form.k8s as { kubeconfigYaml?: string })?.kubeconfigYaml ?? "")}
                onChange={(v) =>
                  setForm((prev) => ({
                    ...prev!,
                    k8s: { ...(prev!.k8s as object), mode: "kubeconfig", kubeconfigYaml: v },
                  }))
                }
                height="min(35vh, 280px)"
              />
            </div>
          )}
          {showK8s && v === "k8s" && (
            <div className="space-y-4 rounded-lg border border-sky-100 bg-sky-50/50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Kubernetes 左侧菜单</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    配置桌面端 Kubernetes 工作区左侧菜单的顺序、显示名称与隐藏状态。保存后写入 runtime-config，并通过 MySQL / Redis 同步到多副本。
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={() => setMenuDialogOpen(true)}>
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  配置菜单
                </Button>
              </div>
              <div className="space-y-2">
                {k8sSidebarMenu.map((item) => (
                  <div
                    key={item.key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-100 bg-white/80 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{item.label}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-500">{item.key}</p>
                    </div>
                    <span className={item.hidden ? "text-amber-700" : "text-emerald-700"}>
                      {item.hidden ? "已隐藏" : `顺序 #${item.order / 10}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {showK8s && v === "k8s" && (
            <Dialog open={menuDialogOpen} onOpenChange={setMenuDialogOpen}>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>配置 Kubernetes 菜单</DialogTitle>
                  <DialogDescription>
                    仅影响桌面端 Kubernetes 左侧一级菜单。Dashboard 与 Cluster Settings 不在本次可隐藏范围内。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  {k8sSidebarMenu.map((item, index) => (
                    <div
                      key={item.key}
                      className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 md:grid-cols-[minmax(0,1fr)_140px_auto] md:items-center"
                    >
                      <div className="space-y-1.5">
                        <Label className="text-xs">显示名称</Label>
                        <Input
                          value={item.label}
                          onChange={(e) => {
                            const value = e.target.value;
                            updateK8sSidebarMenu((items) =>
                              items.map((it) => (it.key === item.key ? { ...it, label: value } : it))
                            );
                          }}
                        />
                        <p className="font-mono text-[11px] text-slate-500">key: {item.key}</p>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <span className="text-xs text-slate-700">隐藏此菜单</span>
                        <Switch
                          checked={Boolean(item.hidden)}
                          onCheckedChange={(checked) => {
                            updateK8sSidebarMenu((items) =>
                              items.map((it) => (it.key === item.key ? { ...it, hidden: checked } : it))
                            );
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={index === 0}
                          onClick={() => updateK8sSidebarMenu((items) => moveK8sSidebarMenuItem(items, index, -1))}
                        >
                          <ArrowUp className="mr-1 h-4 w-4" />
                          上移
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={index === k8sSidebarMenu.length - 1}
                          onClick={() => updateK8sSidebarMenu((items) => moveK8sSidebarMenuItem(items, index, 1))}
                        >
                          <ArrowDown className="mr-1 h-4 w-4" />
                          下移
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const fallback = DEFAULT_K8S_SIDEBAR_MENU.find((it) => it.key === item.key);
                            if (!fallback) return;
                            updateK8sSidebarMenu((items) =>
                              items.map((it) =>
                                it.key === item.key ? { ...it, label: fallback.label, hidden: false } : it
                              )
                            );
                          }}
                        >
                          <RotateCcw className="mr-1 h-4 w-4" />
                          恢复默认
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setMenuDialogOpen(false)}>
                    关闭
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {(v === "full" || v === "k8s") && (
            <div className="space-y-3 rounded-lg border border-sky-100 bg-sky-50/50 p-4">
              <CollapsibleManual
                storageKey="settings.runtime.full-ingress-hostnetwork-hint"
                title="ingress-nginx hostNetwork（一键安装默认端口）"
                variant="skyInline"
                titleClassName="text-sm text-slate-900"
              >
                <p className="text-xs text-slate-600">
                  保存后在「集群设置」安装；控制器使用 hostNetwork，默认节点端口 80 / 443；Prometheus metrics 为清单默认 10254。VictoriaLogs
                  请在集群设置页的独立卡片中配置。
                </p>
              </CollapsibleManual>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">ingressNginxHostHttpPort（0 表示默认 80）</Label>
                  <Input
                    type="number"
                    min={0}
                    max={65535}
                    placeholder="80"
                    value={
                      form.ingressNginxHostHttpPort != null && Number(form.ingressNginxHostHttpPort) > 0
                        ? String(form.ingressNginxHostHttpPort)
                        : ""
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        setField("ingressNginxHostHttpPort", 0);
                        return;
                      }
                      const n = Number(val);
                      if (!Number.isFinite(n)) return;
                      setField("ingressNginxHostHttpPort", Math.floor(n));
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">ingressNginxHostHttpsPort（0 表示默认 443）</Label>
                  <Input
                    type="number"
                    min={0}
                    max={65535}
                    placeholder="443"
                    value={
                      form.ingressNginxHostHttpsPort != null && Number(form.ingressNginxHostHttpsPort) > 0
                        ? String(form.ingressNginxHostHttpsPort)
                        : ""
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        setField("ingressNginxHostHttpsPort", 0);
                        return;
                      }
                      const n = Number(val);
                      if (!Number.isFinite(n)) return;
                      setField("ingressNginxHostHttpsPort", Math.floor(n));
                    }}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">ingressNginxControllerNodeName（可选，安装 ingress 时默认固定节点）</Label>
                  <Input
                    className="font-mono text-xs"
                    placeholder="例如 k8s-master-01"
                    value={String(form.ingressNginxControllerNodeName ?? "")}
                    onChange={(e) => setField("ingressNginxControllerNodeName", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">ingressNginxManifestUrl（可选）</Label>
                  <Input
                    className="font-mono text-xs"
                    value={String(form.ingressNginxManifestUrl ?? "")}
                    onChange={(e) => setField("ingressNginxManifestUrl", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">k8sAddonsManifestMirror（国内建议 ghproxy_preferred）</Label>
                  <Select
                    value={String(form.k8sAddonsManifestMirror ?? "").trim() || "auto"}
                    onValueChange={(x) => setField("k8sAddonsManifestMirror", x)}
                  >
                    <SelectTrigger className="font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">自动（直连失败再走 ghproxy）</SelectItem>
                      <SelectItem value="ghproxy_preferred">国内推荐（优先 ghproxy）</SelectItem>
                      <SelectItem value="direct">仅直连</SelectItem>
                      <SelectItem value="ghproxy_only">仅 ghproxy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          {v === "full" && (
            <div className="space-y-2">
              <Label>prometheusUrlK8s（Kubernetes 监控数据源）</Label>
              <Input
                className="font-mono text-xs"
                value={String(form.prometheusUrlK8s ?? "")}
                onChange={(e) => setField("prometheusUrlK8s", e.target.value)}
                placeholder="http://prometheus-k8s.monitoring.svc:9090 或 http://vmselect:8481"
              />
              <p className="text-xs text-slate-500">
                与「集群设置 → Monitoring」写入同一字段；Pod 列表 CPU/内存来自此地址的{" "}
                <code className="rounded bg-slate-100 px-0.5">/api/v1/query</code>（cAdvisor
                指标）。若单独填写下方 <code className="rounded bg-slate-100 px-0.5">vmSelectUrlK8s</code>，则查询优先走
                VictoriaMetrics。
              </p>
            </div>
          )}
          {v === "full" && (
            <div className="space-y-2">
              <Label>vmSelectUrlK8s（可选，VictoriaMetrics vmselect；填写则优先于 prometheusUrlK8s）</Label>
              <Input
                className="font-mono text-xs"
                value={String(form.vmSelectUrlK8s ?? "")}
                onChange={(e) => setField("vmSelectUrlK8s", e.target.value)}
                placeholder="http://vmselect.monitoring.svc:8481"
              />
            </div>
          )}
          {showK8s && (
            <div className="space-y-3 border-t border-slate-100 pt-6">
              <p className="text-sm font-semibold text-slate-900">Harbor 镜像仓库</p>
              <p className="text-xs text-slate-500">
                供侧栏「Harbor 仓库」调用 Harbor API v2.0。根地址与浏览器访问一致（如{" "}
                <code className="rounded bg-slate-100 px-0.5">https://harbor.example.com</code>
                ，无尾斜杠）。Robot 账号用户名为 <code className="rounded bg-slate-100 px-0.5">robot$项目+名称</code>
                ，密码为创建时生成的 Secret。
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>harborBaseUrl</Label>
                  <Input
                    className="font-mono text-xs"
                    placeholder="https://harbor.example.com"
                    value={String(form.harborBaseUrl ?? "")}
                    onChange={(e) => setField("harborBaseUrl", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>harborUsername</Label>
                  <Input
                    className="font-mono text-xs"
                    value={String(form.harborUsername ?? "")}
                    onChange={(e) => setField("harborUsername", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>harborPassword（*** 表示已设置，留空保留）</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-xs"
                    value={String(form.harborPassword ?? "")}
                    onChange={(e) => setField("harborPassword", e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 sm:col-span-2">
                  <span className="text-slate-700">harborSkipTls（自签证书）</span>
                  <Switch
                    checked={Boolean(form.harborSkipTls)}
                    onCheckedChange={(x) => setField("harborSkipTls", x)}
                  />
                </div>
              </div>
              <HarborRedisIndexSettingsPanel />
            </div>
          )}
          <div className="space-y-2 border-t border-slate-100 pt-6">
            <p className="text-sm font-semibold text-slate-900">应用中心 Redis 镜像</p>
            <p className="text-xs text-slate-500">
              Harbor 前缀与 imagePullSecret 已迁至控制台「应用中心 → Redis → 模版中心」。进程级环境变量{" "}
              <code className="rounded bg-slate-100 px-0.5 font-mono text-[11px]">REDIS_IMAGE_REGISTRY</code> 等仍可作兼容兜底，不再在运行时表单中编辑。
            </p>
          </div>
          </>
          )}
          {showVCenter && (
          <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>vcenterUrl</Label>
              <Input
                value={String(form.vcenterUrl ?? "")}
                onChange={(e) => setField("vcenterUrl", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>ESXi 控制台地址（可选）</Label>
              <Input
                className="font-mono text-xs"
                value={String(form.vcenterConsoleHost ?? "")}
                onChange={(e) => setField("vcenterConsoleHost", e.target.value)}
                placeholder="192.168.21.101"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-[11px] text-slate-500">
                当 WebMKS 票据返回的 ESXi 主机名无法被 Kubernetes DNS 解析时填写管理 IP，可附带端口，例如
                <code className="ml-1 rounded bg-slate-100 px-1">192.168.21.101:443</code>。平台仅覆盖底层 TCP
                拨号地址，WebSocket Host 与认证仍使用 vCenter 签发的一次性票据，不需要保存 ESXi 密码。
              </p>
            </div>
            <div className="space-y-2">
              <Label>vcenterUser</Label>
              <Input
                value={String(form.vcenterUser ?? "")}
                onChange={(e) => setField("vcenterUser", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>vcenterPassword（留空保留）</Label>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={String(form.vcenterPassword ?? "")}
                onChange={(e) => setField("vcenterPassword", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>vcenterCacheTtlSec</Label>
              <Input
                type="number"
                value={Number(form.vcenterCacheTtlSec ?? 120)}
                onChange={(e) => setField("vcenterCacheTtlSec", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-6">
            <p className="text-sm font-semibold text-slate-900">Prometheus（vCenter / 公有云）</p>
            <p className="text-xs text-slate-500">
              <code className="rounded bg-slate-100 px-1 text-[11px]">prometheusUrlVcenter</code>{" "}
              用于 vCenter 侧监控（Telegraf <code className="rounded bg-slate-100 px-1">vmware_vcenter</code> 等指标）；{" "}
              <code className="rounded bg-slate-100 px-1 text-[11px]">prometheusUrlCloud</code>{" "}
              专用于公有云主机列表，留空则继承 vCenter 数据源；均未填时使用运行时{" "}
              <code className="rounded bg-slate-100 px-1 text-[11px]">prometheusUrl</code>。与 K8s 侧相同，若使用{" "}
              <strong className="text-slate-800">VictoriaMetrics</strong>，请填 <strong className="text-slate-800">vmselect</strong>{" "}
              的 HTTP 根地址（同样提供 <code className="rounded bg-slate-100 px-1">/api/v1/query</code>），无需单独开关。
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>prometheusUrlVcenter</Label>
                <Input
                  className="font-mono text-xs"
                  value={String(form.prometheusUrlVcenter ?? "")}
                  onChange={(e) => setField("prometheusUrlVcenter", e.target.value)}
                  placeholder="https://prometheus.example.com:9090 或 http://vmselect-vc:8481"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>prometheusUrlCloud（可选，公有云；留空继承上一项）</Label>
                <Input
                  className="font-mono text-xs"
                  value={String(form.prometheusUrlCloud ?? "")}
                  onChange={(e) => setField("prometheusUrlCloud", e.target.value)}
                  placeholder="留空则使用 prometheusUrlVcenter 或兜底 prometheusUrl"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>vmSelectUrlVcenter（可选 vmselect；填写则优先于 prometheusUrlVcenter）</Label>
                <Input
                  className="font-mono text-xs"
                  value={String(form.vmSelectUrlVcenter ?? "")}
                  onChange={(e) => setField("vmSelectUrlVcenter", e.target.value)}
                  placeholder="http://vmselect-vc.example.com:8481"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>vmSelectUrlCloud（可选；填写则优先于 prometheusUrlCloud 及继承链）</Label>
                <Input
                  className="font-mono text-xs"
                  value={String(form.vmSelectUrlCloud ?? "")}
                  onChange={(e) => setField("vmSelectUrlCloud", e.target.value)}
                  placeholder="留空则按 vmSelectUrlVcenter / prometheusUrl 链"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">虚拟机 SSH 终端（全局默认）</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                填写连接虚拟机的用户名与密码即可；端口固定为 22，凭据仅保存在服务端。若需私钥、其它端口或按虚拟机单独存凭据，请使用环境变量{" "}
                <code className="rounded bg-white px-1 text-[10px]">VCENTER_VM_SSH_*</code> 等配置。
              </p>
            </div>
            <div className="grid max-w-md gap-3">
              <div className="space-y-2">
                <Label>SSH 用户名</Label>
                <Input
                  value={String(form.vcenterVmSshUser ?? "")}
                  onChange={(e) => setField("vcenterVmSshUser", e.target.value)}
                  placeholder="如 root"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label>SSH 密码（留空或 *** 表示不修改已保存的密码）</Label>
                <Input
                  type="password"
                  value={String(form.vcenterVmSshPassword ?? "")}
                  onChange={(e) => setField("vcenterVmSshPassword", e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-2">
                <Label>SSH 主机密钥指纹</Label>
                <Input
                  className="font-mono text-xs"
                  value={String(form.vcenterVmSshHostKeyFingerprint ?? "")}
                  onChange={(e) => setField("vcenterVmSshHostKeyFingerprint", e.target.value)}
                  placeholder="SHA256:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  spellCheck={false}
                />
                <p className="text-[11px] text-slate-500">
                  可在可信网络执行 <code>ssh-keyscan 主机 | ssh-keygen -lf -</code> 核对后填写。
                </p>
              </div>
            </div>
          </div>

          <div id="runtime-vmlog-vector-download" className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3 scroll-mt-24">
            <div>
              <p className="text-sm font-semibold text-slate-900">VMLog 采集器下载源</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                可选：为「日志采集」Vector 助手配置下载<strong>目录</strong>基址（无尾斜杠）。保存后脚本会请求{" "}
                <code className="rounded bg-white px-1">基址/vector-版本-架构.tar.gz</code>；若粘贴完整{" "}
                <code className="rounded bg-white px-1">vector-*.tar.gz</code> URL，平台会自动截取目录。若留空，则走内置镜像线与 GitHub。
              </p>
            </div>
            <div className="max-w-2xl space-y-2">
              <Label>vmLogVectorDownloadBaseUrl（可选）</Label>
              <Input
                className="font-mono text-xs"
                value={String(form.vmLogVectorDownloadBaseUrl ?? "")}
                onChange={(e) => setField("vmLogVectorDownloadBaseUrl", e.target.value)}
                placeholder="如 http://10.0.0.8:8081/vector"
              />
              <p className="text-[11px] text-slate-500">
                缓存目录中的文件名请保持官方格式，例如{" "}
                <code className="rounded bg-white px-1">vector-0.36.1-x86_64-unknown-linux-gnu.tar.gz</code> 与{" "}
                <code className="rounded bg-white px-1">vector-0.36.1-aarch64-unknown-linux-gnu.tar.gz</code>。
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">宿主机 iDRAC（带外 / Redfish）</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                单台 iDRAC：填写带外 IP、用户名与密码即可（自动使用 HTTPS）。保存前会请求 Redfish 校验账号，仅校验通过才写入配置。本服务需能访问该带外网段。宿主机可视化监控已改为 Prometheus（vmware_vcenter）；此处凭据仍可用于带外校验与后续能力扩展。
              </p>
            </div>
            <div className="grid max-w-md gap-3">
              <div className="space-y-2">
                <Label>iDRAC IP 或主机名</Label>
                <Input
                  className="font-mono text-xs"
                  value={String(form.idracHost ?? "")}
                  onChange={(e) => setField("idracHost", e.target.value)}
                  placeholder="如 192.168.1.50"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label>用户名</Label>
                <Input
                  value={String(form.idracUser ?? "")}
                  onChange={(e) => setField("idracUser", e.target.value)}
                  placeholder="如 root"
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label>密码（留空或 *** 表示保留已保存密码）</Label>
                <Input
                  type="password"
                  value={String(form.idracPassword ?? "")}
                  onChange={(e) => setField("idracPassword", e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <span className="text-sm text-slate-700">跳过 TLS 证书校验（自签证书请开启）</span>
                <Switch
                  checked={form.idracInsecure !== false}
                  onCheckedChange={(v) => setField("idracInsecure", v)}
                />
              </div>
              <div className="space-y-2">
                <Label>VNC 端口（需先在 iDRAC 中启用 VNC Server，默认 5900）</Label>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={Number(form.idracVncPort ?? 5900)}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setField("idracVncPort", Number.isNaN(n) ? 0 : n);
                  }}
                  placeholder="5900"
                />
              </div>
              <div className="space-y-2">
                <Label>VNC 密码（iDRAC 中设置的 VNC Server 密码，非 Redfish 密码）</Label>
                <Input
                  type="password"
                  value={String(form.idracVncPassword ?? "")}
                  onChange={(e) => setField("idracVncPassword", e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <p className="text-[11px] text-slate-500">
                清空「IP」并保存可删除 iDRAC 配置。填写 IP 时保存会先做 Redfish 登录检测，密码错误不会保存。VNC 控制台需 iDRAC 侧启用 VNC Server 并开放对应端口。
              </p>
            </div>
          </div>
          </>
          )}

          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">{err}</div>
          )}
          {ok && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
              {ok}
            </div>
          )}

          <Button type="button" onClick={() => void onSave()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {v === "k8s" ? "Saving…" : "保存中…"}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {v === "k8s" ? "Save" : "保存运行时配置"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsRuntimeSection;
