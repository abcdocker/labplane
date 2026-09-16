import React, { useEffect, useState } from "react";
import { APP_CONFIG_QUERY_KEY } from "@/hooks/use-app-config";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { YamlEditor } from "@/components/YamlEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { apiGetJson, apiPutJson, type RuntimeSettingsDTO } from "@/lib/api";

type K8sMode = "none" | "incluster" | "kubeconfig";

/**
 * 未连接到集群时展示：保存 K8s 连接方式到 runtime-config.json 并触发后端 Reload。
 */
const K8sConnectWizard: React.FC = () => {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [form, setForm] = useState<RuntimeSettingsDTO | null>(null);
  const [k8sMode, setK8sMode] = useState<K8sMode>("kubeconfig");
  const [kubeYaml, setKubeYaml] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const data = await apiGetJson<RuntimeSettingsDTO>("/api/settings/runtime");
        if (cancelled) return;
        setForm(data);
        const m = String((data.k8s as { mode?: string } | undefined)?.mode ?? "none") as K8sMode;
        if (m === "incluster" || m === "kubeconfig" || m === "none") {
          setK8sMode(m);
        } else {
          setK8sMode("kubeconfig");
        }
        const y = String((data.k8s as { kubeconfigYaml?: string } | undefined)?.kubeconfigYaml ?? "");
        setKubeYaml(y === "***" ? "" : y);
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
    const hadMasked = (form.k8s as { kubeconfigYaml?: string } | undefined)?.kubeconfigYaml === "***";
    if (k8sMode === "kubeconfig" && !kubeYaml.trim() && !hadMasked) {
      setErr("请粘贴 kubeconfig 全文");
      return;
    }
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const payload = { ...form } as Record<string, unknown>;
      const k8s =
        k8sMode === "kubeconfig"
          ? { mode: "kubeconfig", kubeconfigYaml: kubeYaml.trim() }
          : k8sMode === "incluster"
            ? { mode: "incluster", kubeconfigYaml: "" }
            : { mode: "none", kubeconfigYaml: "" };
      payload.k8s = k8s;
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
      await qc.invalidateQueries({ queryKey: ["k8s-summary"] });
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

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">连接 Kubernetes 集群</h2>
      <p className="mt-2 text-sm text-slate-600">
        当前进程尚未连上集群。若本机已配置 <code className="text-xs">KUBECONFIG</code> 且初始化时未填写
        K8s，保存「不额外配置」后服务端会尝试与 kubectl 相同的环境；否则请选择 in-cluster（Pod 内）或粘贴
        kubeconfig 全文。
      </p>
      <div className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label>连接方式</Label>
          <Select value={k8sMode} onValueChange={(v) => setK8sMode(v as K8sMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">使用进程环境（KUBECONFIG / 与本地 kubectl 一致）</SelectItem>
              <SelectItem value="incluster">in-cluster（本应用运行在集群 Pod 内）</SelectItem>
              <SelectItem value="kubeconfig">粘贴 kubeconfig 全文</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {k8sMode === "kubeconfig" && (
          <div className="space-y-2">
            <Label>kubeconfig YAML</Label>
            <YamlEditor
              value={kubeYaml}
              onChange={setKubeYaml}
              height="min(40vh, 320px)"
              placeholder="apiVersion: v1\nkind: Config\n..."
            />
            {(form.k8s as { kubeconfigYaml?: string } | undefined)?.kubeconfigYaml === "***" &&
              !kubeYaml.trim() && (
              <p className="text-xs text-amber-800">
                服务端已保存过 kubeconfig（已脱敏）。留空并保存将保留原内容；若要替换请粘贴新 YAML。
              </p>
            )}
          </div>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
        {ok && <p className="text-sm text-emerald-700">{ok}</p>}
        <Button type="button" onClick={() => void onSave()} disabled={saving}>
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
    </div>
  );
};

export default K8sConnectWizard;
