import React, { useCallback, useEffect, useState } from "react";
import { APP_CONFIG_QUERY_KEY } from "@/hooks/use-app-config";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { CollapsibleManual } from "@/components/CollapsibleManual";
import { apiGetJson, apiPostJson, type AppConfig } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { AddonsStatusResponse } from "@/pages/cluster/ClusterK8sAddonsSection";

type MirrorMode = "auto" | "ghproxy_preferred" | "direct" | "ghproxy_only";

type DeploymentBrief = {
  found?: boolean;
  rolloutReady?: boolean;
  readyReplicas?: number;
  desiredReplicas?: number;
  error?: string;
};

type MetricsServerAddonSlice = {
  namespace?: string;
  installed?: boolean;
  rolloutReady?: boolean;
  deployment?: DeploymentBrief;
  kubeletInsecureTlsHint?: string;
};

type KubernetesDashboardAddonSlice = {
  namespace?: string;
  namespaceExists?: boolean;
  installed?: boolean;
  uiPodsLikelyReady?: boolean;
  adminServiceAccount?: string;
  adminBindingInstalled?: boolean;
  accessHint?: string;
  allComponentsReady?: boolean;
  dashboardDeployment?: DeploymentBrief;
  scraperDeployment?: DeploymentBrief;
};

type DashboardAddonsStatus = AddonsStatusResponse & {
  metricsServer?: MetricsServerAddonSlice;
  kubernetesDashboard?: KubernetesDashboardAddonSlice;
};

type IngressAddonVerification = {
  ok: boolean;
  checkedAt?: string;
  checks?: { name: string; ok: boolean; detail?: string }[];
  issues?: string[];
  remedies?: string[];
  waitedSeconds?: number;
};

function isMirrorMode(v: string): v is MirrorMode {
  return v === "auto" || v === "ghproxy_preferred" || v === "direct" || v === "ghproxy_only";
}

const MANUAL_STEPS = `# 手动安装（国内镜像思路与平台一键安装一致）
# 1) metrics-server v0.7.2，下载后替换 registry.k8s.io → m.daocloud.io/registry.k8s.io
curl -fsSL -o components.yaml \\
  "https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.7.2/components.yaml"
sed -i.bak 's|registry.k8s.io/|m.daocloud.io/registry.k8s.io/|g' components.yaml
kubectl apply -f components.yaml
# 自签 kubelet 证书环境常见需要：
kubectl -n kube-system patch deploy metrics-server --type='json' \\
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

# 2) Kubernetes Dashboard 2.7 recommended，替换 kubernetesui → m.daocloud.io/docker.io/kubernetesui
curl -fsSL -o recommended.yaml \\
  "https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml"
sed -i.bak 's|image: kubernetesui/|image: m.daocloud.io/docker.io/kubernetesui/|g' recommended.yaml
kubectl apply -f recommended.yaml

# 3) 登录用高权限 SA（生产请改为最小权限 Role）
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kube-bt-sync-dashboard-admin
  namespace: kubernetes-dashboard
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: kube-bt-sync-dashboard-admin
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- kind: ServiceAccount
  name: kube-bt-sync-dashboard-admin
  namespace: kubernetes-dashboard
EOF

kubectl get pods -n kube-system -l k8s-app=metrics-server
kubectl get pods -n kubernetes-dashboard
kubectl create token kube-bt-sync-dashboard-admin -n kubernetes-dashboard --duration=24h
# 访问：kubectl proxy 后打开
# http://127.0.0.1:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/

# 4) 本平台「集群 → 监控」图表：在集群设置填写 prometheusUrlK8s / vmSelectUrlK8s（与 Dashboard Web UI 独立）`;

const ClusterK8sDashboardMonitoringSection: React.FC = () => {
  const { status: auth } = useAuth();
  const isAdmin = auth?.role === "admin";
  const qc = useQueryClient();

  const { data: cfg } = useQuery({
    queryKey: APP_CONFIG_QUERY_KEY,
    queryFn: ({ signal }) => apiGetJson<AppConfig>("/api/config", { signal }),
  });

  const [manifestMirror, setManifestMirror] = useState<MirrorMode>("ghproxy_preferred");
  useEffect(() => {
    const m = cfg?.k8sAddonsManifestMirror;
    if (m && isMirrorMode(m)) setManifestMirror(m);
  }, [cfg?.k8sAddonsManifestMirror]);

  const [kubeletInsecureTls, setKubeletInsecureTls] = useState(true);
  const [installOpen, setInstallOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState(0);
  const [verification, setVerification] = useState<IngressAddonVerification | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  const {
    data: st,
    isLoading: stLoading,
    isFetching: stFetching,
    error: stErr,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["k8s-addons-status"],
    queryFn: ({ signal }) => apiGetJson<DashboardAddonsStatus>("/api/k8s/addons/status", { signal }),
    refetchInterval: 25_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const b = busy || verifyBusy;
    if (!b) {
      setProgress(0);
      return;
    }
    setProgress(12);
    const id = window.setInterval(() => {
      setProgress((p) => (p >= 88 ? p : p + 4));
    }, 800);
    return () => clearInterval(id);
  }, [busy, verifyBusy]);

  const runInstall = useCallback(async () => {
    setInstallOpen(false);
    setBusy(true);
    setPhase("正在下载清单（国内友好线路）并应用 metrics-server、Dashboard 与登录 SA…");
    try {
      const res = await apiPostJson<{
        message?: string;
        verification?: IngressAddonVerification;
        loginTokenHint?: string;
        prometheusHint?: string;
      }>("/api/k8s/addons/dashboard-monitoring/install", {
        manifestMirror,
        kubeletInsecureTls,
      });
      setProgress(100);
      if (res.verification) setVerification(res.verification);
      const msg = String(res.message || "").trim() || "安装流程已完成";
      if (res.verification && !res.verification.ok) {
        toast.warning(msg);
      } else {
        toast.success(msg);
      }
      void qc.invalidateQueries({ queryKey: ["k8s-addons-status"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setPhase("");
    }
  }, [kubeletInsecureTls, manifestMirror, qc]);

  const runVerify = useCallback(async () => {
    setVerifyBusy(true);
    setPhase("正在检查 metrics-server 与 Dashboard Deployment 就绪情况…");
    try {
      const res = await apiGetJson<{ verification: IngressAddonVerification }>(
        "/api/k8s/addons/dashboard-monitoring/verify?maxWaitSec=180",
      );
      setVerification(res.verification);
      if (res.verification.ok) {
        toast.success("组件自检通过");
      } else {
        toast.warning("自检未全部通过，请查看下方报告");
      }
      void qc.invalidateQueries({ queryKey: ["k8s-addons-status"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setVerifyBusy(false);
      setPhase("");
    }
  }, [qc]);

  const ms = st?.metricsServer;
  const kd = st?.kubernetesDashboard;

  return (
    <Card className="border-violet-100 bg-gradient-to-b from-violet-50/40 to-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-slate-900">Kubernetes Dashboard · metrics-server（可选 Web UI · 国内镜像）</CardTitle>
        <CardDescription className="text-sm text-slate-600">
          一键安装官方 <strong className="text-slate-800">metrics-server v0.7.2</strong> 与{" "}
          <strong className="text-slate-800">Dashboard 2.7（recommended 清单）</strong>：清单下载策略与上方 ingress 相同（jsDelivr / ghproxy）；容器镜像将{" "}
          <code className="rounded bg-white px-0.5 text-[11px]">registry.k8s.io</code> 改写为{" "}
          <code className="rounded bg-white px-0.5 text-[11px]">m.daocloud.io/registry.k8s.io</code>，将{" "}
          <code className="rounded bg-white px-0.5 text-[11px]">kubernetesui/*</code> 改写为{" "}
          <code className="rounded bg-white px-0.5 text-[11px]">m.daocloud.io/docker.io/kubernetesui/*</code>
          （与 ingress 共用「关闭 K8s 镜像改写」开关时则不改写）。安装结束后自动轮询 Deployment 就绪；另创建{" "}
          <code className="rounded bg-white px-0.5 text-[11px]">kube-bt-sync-dashboard-admin</code>（cluster-admin，仅便于登录演示，生产请改最小权限）。
          <span className="mt-2 block text-[13px] text-slate-700">
            <strong className="text-slate-800">说明：</strong>本平台「集群 → 监控」页的 <strong>Prometheus / VictoriaMetrics</strong> 地址仍在下方「Kubernetes
            监控」卡片单独配置；本栈解决 Dashboard UI 内 CPU/内存条与 <code className="rounded bg-slate-100 px-0.5 text-[11px]">kubectl top</code> 所需 metrics-server。
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-violet-100 bg-violet-50/90 px-3 py-3 text-xs text-violet-950">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="font-medium">服务状态</strong>
            {(stLoading || stFetching) && (
              <span className="inline-flex items-center gap-1 text-violet-800">
                <Loader2 className="h-3 w-3 animate-spin" />
                检查中…
              </span>
            )}
            {st?.checkedAt && <span className="text-[11px] text-violet-800/90">更新于 {st.checkedAt}</span>}
          </div>
          {stErr && <p className="mt-2 text-red-700">{(stErr as Error).message}</p>}
          {st && !stLoading && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-white/80 bg-white/70 px-2 py-2">
                <p className="font-mono text-[11px] text-slate-500">{ms?.namespace ?? "kube-system"} · metrics-server</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {ms?.installed ? (
                    <Badge className="bg-violet-600 hover:bg-violet-600">已部署</Badge>
                  ) : (
                    <Badge variant="secondary">未检测到</Badge>
                  )}
                  {ms?.rolloutReady ? (
                    <span className="text-[11px] text-emerald-800">Rollout 就绪</span>
                  ) : ms?.installed ? (
                    <span className="text-[11px] text-amber-800">Rollout 未就绪</span>
                  ) : null}
                </div>
                {ms?.deployment?.readyReplicas != null && ms?.deployment?.desiredReplicas != null && (
                  <p className="mt-1 font-mono text-[11px] text-slate-600">
                    ready {ms.deployment.readyReplicas}/{ms.deployment.desiredReplicas}
                  </p>
                )}
                {ms?.deployment?.error && <p className="mt-1 text-[11px] text-red-700">{ms.deployment.error}</p>}
              </div>
              <div className="rounded-md border border-white/80 bg-white/70 px-2 py-2">
                <p className="font-mono text-[11px] text-slate-500">{kd?.namespace ?? "kubernetes-dashboard"}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {kd?.installed ? (
                    <Badge className="bg-violet-600 hover:bg-violet-600">已部署</Badge>
                  ) : (
                    <Badge variant="secondary">未检测到</Badge>
                  )}
                  {kd?.uiPodsLikelyReady ? (
                    <span className="text-[11px] text-emerald-800">UI 组件就绪</span>
                  ) : kd?.installed ? (
                    <span className="text-[11px] text-amber-800">UI 未就绪</span>
                  ) : null}
                  {kd?.adminBindingInstalled ? (
                    <span className="text-[11px] text-slate-600">SA 已创建</span>
                  ) : null}
                </div>
                {kd?.allComponentsReady ? (
                  <p className="mt-1 text-[11px] text-emerald-800">metrics-server + Dashboard 链路齐套</p>
                ) : null}
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => void refetchStatus()}>
              立即重新检测
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={verifyBusy}
              onClick={() => void runVerify()}
            >
              {verifyBusy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              深度自检（约 3 分钟）
            </Button>
          </div>
        </div>

        {verification && (
          <div
            className={cn(
              "rounded-lg border px-3 py-3 text-xs",
              verification.ok ? "border-emerald-200 bg-emerald-50/90 text-emerald-950" : "border-amber-200 bg-amber-50/95 text-amber-950",
            )}
          >
            <div className="flex flex-wrap items-center gap-2 font-medium">
              <span>安装 / 自检报告</span>
              {verification.ok ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">通过</Badge>
              ) : (
                <Badge className="bg-amber-600 hover:bg-amber-600">待处理</Badge>
              )}
              {verification.checkedAt && <span className="font-normal text-[11px] opacity-90">{verification.checkedAt}</span>}
              {verification.waitedSeconds != null && verification.waitedSeconds > 0 && (
                <span className="font-normal text-[11px] opacity-90">等待约 {verification.waitedSeconds}s</span>
              )}
            </div>
            {verification.checks && verification.checks.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-black/5 pt-2">
                {verification.checks.map((c, i) => (
                  <li key={`${i}-${c.name}`} className="flex flex-wrap gap-x-2 text-[11px]">
                    <span className={c.ok ? "text-emerald-800" : "text-red-800"}>{c.ok ? "✓" : "✗"}</span>
                    <span className="font-mono">{c.name}</span>
                    {c.detail && <span className="text-slate-600">{c.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
            {verification.issues && verification.issues.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-[11px] text-red-900">
                {verification.issues.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            {verification.remedies && verification.remedies.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-[11px] text-amber-950">
                {verification.remedies.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {isAdmin ? (
          <div className="space-y-3 rounded-xl border-2 border-violet-200/90 bg-white/90 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <Checkbox
                id="kubelet-insecure-tls"
                checked={kubeletInsecureTls}
                onCheckedChange={(v) => setKubeletInsecureTls(v === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="kubelet-insecure-tls" className="cursor-pointer text-sm font-medium text-slate-800">
                  为 metrics-server 注入 <code className="rounded bg-slate-100 px-1 text-[11px]">--kubelet-insecure-tls</code>
                </Label>
                <p className="text-[11px] text-slate-600">
                  国内多数自签 kubelet 证书环境需要；若集群 kubelet 使用正规 CA 可取消勾选。
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-700">清单下载</Label>
              <Select value={manifestMirror} onValueChange={(v) => isMirrorMode(v) && setManifestMirror(v)}>
                <SelectTrigger className="h-9 max-w-md font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ghproxy_preferred">国内推荐（jsDelivr → 多线 ghproxy → 直连）</SelectItem>
                  <SelectItem value="direct">海外 / 直连 GitHub</SelectItem>
                  <SelectItem value="auto">自动（直连 → jsDelivr → ghproxy）</SelectItem>
                  <SelectItem value="ghproxy_only">仅代理线（jsDelivr + ghproxy）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(busy || verifyBusy) && (
              <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-medium text-violet-950">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  <span>{phase || "处理中…"}</span>
                </div>
                <Progress value={progress} className="h-1.5 bg-violet-200/60" />
              </div>
            )}
            <Button type="button" disabled={busy || verifyBusy} onClick={() => setInstallOpen(true)}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              一键安装 / 升级 Dashboard 与 metrics-server
            </Button>
            <p className="text-[11px] text-slate-500">
              登录 Token：<code className="rounded bg-slate-100 px-0.5">kubectl create token kube-bt-sync-dashboard-admin -n kubernetes-dashboard --duration=24h</code>
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-600">一键安装需要管理员登录。</p>
        )}

        <AlertDialog open={installOpen} onOpenChange={setInstallOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认安装 metrics-server 与 Kubernetes Dashboard？</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-slate-600">
                将向集群应用官方清单（经国内镜像改写），并创建绑定 <strong className="text-slate-800">cluster-admin</strong> 的 ServiceAccount，便于 Web
                登录。生产环境请后续改为最小权限 Role。
                {kubeletInsecureTls ? (
                  <span className="block">
                    将为 metrics-server 添加参数 <span className="font-mono">--kubelet-insecure-tls</span>。
                  </span>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">取消</AlertDialogCancel>
              <AlertDialogAction type="button" onClick={() => void runInstall()}>
                确定安装
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <CollapsibleManual
          storageKey="k8s.dashboard-manual-docs"
          title="手动安装与文档"
          variant="muted"
          className="text-xs text-slate-700"
          titleClassName="text-slate-800"
        >
          <p className="text-[11px] leading-relaxed">
            仓库内 <code className="rounded bg-white px-0.5">docs/kubernetes-dashboard-prometheus.md</code> 含与 Prometheus
            对接说明；下方为可复制的命令摘要（与平台改写规则一致）。
          </p>
          <pre className="mt-2 max-h-[min(40vh,280px)] overflow-auto rounded border border-slate-200 bg-slate-950 p-2 font-mono text-[10px] leading-relaxed text-slate-100">
            {MANUAL_STEPS}
          </pre>
          <a
            href="https://github.com/DaoCloud/public-image-mirror"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-0.5 text-[11px] font-medium text-sky-700 underline-offset-2 hover:underline"
          >
            DaoCloud 公共镜像说明 <ExternalLink className="h-3 w-3" />
          </a>
        </CollapsibleManual>
      </CardContent>
    </Card>
  );
};

export default ClusterK8sDashboardMonitoringSection;
