import React, { useEffect, useState } from "react";
import { APP_CONFIG_QUERY_KEY } from "@/hooks/use-app-config";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { apiGetJson, apiPutJson, type RuntimeSettingsDTO } from "@/lib/api";

/**
 * vCenter 未在运行时配置时展示：写入 runtime-config.json 并触发 Reload。
 */
const VCenterConnectWizard: React.FC = () => {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState<RuntimeSettingsDTO | null>(null);
  const [vcUrl, setVcUrl] = useState("");
  const [vcUser, setVcUser] = useState("");
  const [vcPassword, setVcPassword] = useState("");
  const [vcInsecure, setVcInsecure] = useState(true);
  const [vcCacheTtl, setVcCacheTtl] = useState(120);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await apiGetJson<RuntimeSettingsDTO>("/api/settings/runtime");
        if (cancelled) return;
        setForm(data);
        setVcUrl(String(data.vcenterUrl ?? ""));
        setVcUser(String(data.vcenterUser ?? ""));
        const pw = String(data.vcenterPassword ?? "");
        setVcPassword(pw === "***" ? "" : pw);
        setVcInsecure(Boolean(data.vcenterInsecure ?? true));
        setVcCacheTtl(Number(data.vcenterCacheTtlSec ?? 120));
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = async () => {
    if (!form) return;
    const u = vcUrl.trim();
    const user = vcUser.trim();
    if (!u || !user) {
      const m = "请填写 vCenter 地址与用户名";
      setErr(m);
      toast.error(m);
      return;
    }
    const hadMasked =
      String((form as { vcenterPassword?: string }).vcenterPassword ?? "") === "***";
    if (!vcPassword.trim() && !hadMasked) {
      const m = "请填写 vCenter 密码";
      setErr(m);
      toast.error(m);
      return;
    }
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const payload = { ...form } as Record<string, unknown>;
      payload.vcenterUrl = u;
      payload.vcenterUser = user;
      payload.vcenterPassword = vcPassword;
      payload.vcenterInsecure = vcInsecure;
      payload.vcenterCacheTtlSec = vcCacheTtl;
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
      await apiPutJson("/api/settings/runtime", payload);
      setOk("已保存并重载。");
      toast.success("保存成功");
      await qc.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["runtime-status"] });
      await qc.invalidateQueries({ queryKey: ["vcenter-status"] });
      await qc.invalidateQueries({ queryKey: ["vcenter-vms"] });
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg);
      toast.error(`保存失败：${msg}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载配置…
      </div>
    );
  }

  if (err && !form) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
    );
  }

  if (!form) return null;

  const hadMaskedPw =
    String((form as { vcenterPassword?: string }).vcenterPassword ?? "") === "***";

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">连接 vCenter</h2>
      <p className="mt-2 text-sm text-slate-600">
        填写 vSphere/vCenter 地址与凭据，保存后写入运行时配置并热重载。也可在「系统设置 → 运行时配置」中修改。
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>vCenter / vSphere API 地址</Label>
          <Input
            value={vcUrl}
            onChange={(e) => setVcUrl(e.target.value)}
            placeholder="https://vcenter.example.com/sdk"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label>用户名</Label>
          <Input
            value={vcUser}
            onChange={(e) => setVcUser(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div className="space-y-2">
          <Label>密码{hadMaskedPw && !vcPassword.trim() ? "（留空保留已保存）" : ""}</Label>
          <Input
            type="password"
            value={vcPassword}
            onChange={(e) => setVcPassword(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-white/80 px-3 py-2 sm:col-span-2">
          <span className="text-sm text-slate-700">跳过 TLS 校验（自签证书）</span>
          <Switch checked={vcInsecure} onCheckedChange={setVcInsecure} />
        </div>
        <div className="space-y-2">
          <Label>虚拟机列表缓存（秒）</Label>
          <Input
            type="number"
            min={10}
            value={vcCacheTtl}
            onChange={(e) => setVcCacheTtl(Number(e.target.value))}
          />
        </div>
      </div>
      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
      {ok && <p className="mt-4 text-sm text-emerald-700">{ok}</p>}
      <Button type="button" className="mt-4" onClick={() => void onSave()} disabled={saving}>
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            保存中…
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            保存并重载
          </>
        )}
      </Button>
    </div>
  );
};

export default VCenterConnectWizard;
