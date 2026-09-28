import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiGetJson, apiPutJson, ApiHttpError } from "@/lib/api";
import { meshPolicyText as t } from "@/i18n/meshPolicy";

type PolicyRevision = { hash: string; policy: string; savedAt: string };
type PolicyResponse = { policy: string; hash: string; updatedAt?: string; history: PolicyRevision[] };

export const MeshPolicyPanel: React.FC<{ instanceId: string; isAdmin: boolean }> = ({ instanceId, isAdmin }) => {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [loadedHash, setLoadedHash] = useState("");
  const policyQ = useQuery({
    queryKey: ["mesh-policy", instanceId],
    queryFn: () => apiGetJson<PolicyResponse>(`/api/ops/mesh/instances/${instanceId}/policy`),
    staleTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!policyQ.data) return;
    setDraft(policyQ.data.policy);
    setLoadedHash(policyQ.data.hash);
  }, [instanceId, policyQ.data]);

  const saveMut = useMutation({
    mutationFn: () => apiPutJson<PolicyResponse>(`/api/ops/mesh/instances/${instanceId}/policy`, {
      policy: draft,
      baseHash: loadedHash,
    }),
    onSuccess: async () => {
      toast.success(t.saved);
      await qc.invalidateQueries({ queryKey: ["mesh-policy", instanceId] });
      await qc.invalidateQueries({ queryKey: ["mesh-discover", instanceId] });
    },
    onError: (error) => {
      if (error instanceof ApiHttpError && error.status === 409) toast.error(t.conflict);
      else toast.error(error instanceof Error ? error.message : String(error));
    },
  });

  const refresh = async () => {
    if (changed && !window.confirm(t.discardDraft)) return;
    const result = await policyQ.refetch();
    if (result.data) {
      setDraft(result.data.policy);
      setLoadedHash(result.data.hash);
    }
  };
  const changed = Boolean(policyQ.data && draft !== policyQ.data.policy);
  const history = policyQ.data?.history ?? [];

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.title}</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {changed ? <span className="text-xs text-amber-700 dark:text-amber-300">{t.changed}</span> : null}
          <Button type="button" size="sm" variant="outline" disabled={policyQ.isFetching} onClick={() => void refresh()}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${policyQ.isFetching ? "animate-spin" : ""}`} />{t.refresh}
          </Button>
          {isAdmin ? <Button type="button" size="sm" disabled={!changed || !draft.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}{saveMut.isPending ? t.saving : t.save}
          </Button> : null}
        </div>
      </div>

      {policyQ.isError ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">{t.loadError}：{policyQ.error instanceof Error ? policyQ.error.message : String(policyQ.error)}</p> : null}
      {policyQ.isLoading ? <p className="text-xs text-slate-500 dark:text-slate-400"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />读取中…</p> : null}
      {policyQ.data ? <>
        {!policyQ.data.policy ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{t.empty}</p> : null}
        <p className="text-[11px] text-slate-500 dark:text-slate-400">版本 {policyQ.data.hash.slice(0, 12)}{policyQ.data.updatedAt ? ` · 更新于 ${new Date(policyQ.data.updatedAt).toLocaleString()}` : ""}</p>
        <Textarea aria-label={t.title} className="min-h-[360px] font-mono text-xs leading-5 dark:bg-slate-950 dark:text-slate-100" spellCheck={false} maxLength={262144} value={draft} readOnly={!isAdmin} onChange={(event) => setDraft(event.target.value)} />
        <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t.safetyHint}</p>
          <p>{t.modeHint}</p>
          {!isAdmin ? <p>{t.readOnly}</p> : null}
        </div>
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">{t.history}</h4>
          {history.length === 0 ? <p className="text-xs text-slate-500 dark:text-slate-400">{t.noHistory}</p> : (
            <ul className="space-y-1.5">
              {history.map((rev) => <li key={rev.hash} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
                <span className="font-mono text-slate-600 dark:text-slate-300">{rev.hash.slice(0, 12)} <span className="font-sans text-slate-400">· {new Date(rev.savedAt).toLocaleString()}</span></span>
                {isAdmin ? <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDraft(rev.policy)}><RotateCcw className="mr-1 h-3 w-3" />{t.restore}</Button> : null}
              </li>)}
            </ul>
          )}
        </div>
      </> : null}
    </section>
  );
};
