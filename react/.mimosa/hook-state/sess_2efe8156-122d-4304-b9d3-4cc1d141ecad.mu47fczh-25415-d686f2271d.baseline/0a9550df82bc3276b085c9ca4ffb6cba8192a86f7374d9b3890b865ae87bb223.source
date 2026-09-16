import React, { useCallback, useEffect, useState } from "react";
import { APP_CONFIG_QUERY_KEY } from "@/hooks/use-app-config";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Copy, ExternalLink, Loader2 } from "lucide-react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
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

type MirrorMode = "auto" | "ghproxy_preferred" | "direct" | "ghproxy_only";

type IngressAddonVerification = {
  ok: boolean;
  checkedAt?: string;
  checks?: { name: string; ok: boolean; detail?: string }[];
  issues?: string[];
  remedies?: string[];
  autoRepairs?: string[];
  tcpProbeAddr?: string;
  tcpHttpOpen?: boolean;
  httpProbeOk?: boolean;
  httpProbeDetail?: string;
  waitedSeconds?: number;
};

export type AddonsStatusResponse = {
  checkedAt?: string;
  manifestMirror?: { effective?: string; hint?: string };
  ingressNginxK8sRegistryMirror?: boolean;
  ingressNginx: {
    namespace: string;
    namespaceExists?: boolean;
    podTotal: number;
    podReady: number;
    installed?: boolean;
    likelyInstalled: boolean;
    controllersLikelyReady?: boolean;
    controllerServiceType: string;
    serviceMissing: boolean;
    serviceError?: string;
    hostNetwork?: boolean;
    deploymentHttpPort?: number;
    deploymentHttpsPort?: number;
    desiredHostHttpPort?: number;
    desiredHostHttpsPort?: number;
    deploymentMetricsPort?: number;
    hostPortsMatchDesired?: boolean;
    deploymentControllerNodeName?: string;
    desiredControllerNodeName?: string;
    controllerNodeMatchDesired?: boolean;
  };
};

type K8sNodesListResponse = {
  nodes?: Array<{ name: string; ready?: string; internalIP?: string }>;
};

type IngressConfirmAction = "install" | "ports" | "uninstall" | "node" | null;

function CodeBlock({ text, className }: { text: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className={cn("relative rounded-lg border border-slate-200 bg-slate-950", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-1 top-1 h-7 gap-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 2000);
          });
        }}
      >
        <Copy className="h-3.5 w-3.5" />
        {done ? "已复制" : "复制"}
      </Button>
      <pre className="max-h-[min(52vh,420px)] overflow-auto p-3 pr-20 font-mono text-[11px] leading-relaxed text-slate-100">
        {text}
      </pre>
    </div>
  );
}

const CHECK_CMD = `kubectl get pods -n ingress-nginx 2>/dev/null || echo "未检测到 ingress-nginx"`;

const INGRESS_WAIT = `kubectl wait --namespace ingress-nginx \\
  --for=condition=ready pod \\
  --selector=app.kubernetes.io/component=controller \\
  --timeout=120s`;

const NO_FIXED_NODE = "__none__";

function CollapseBlock({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-100"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
          )}
          {title}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-l-2 border-sky-200/80 py-3 pl-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function isMirrorMode(v: string): v is MirrorMode {
  return v === "auto" || v === "ghproxy_preferred" || v === "direct" || v === "ghproxy_only";
}

const ClusterK8sAddonsSection: React.FC = () => {
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

  const {
    data: st,
    isLoading: stLoading,
    isFetching: stFetching,
    error: stErr,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["k8s-addons-status"],
    queryFn: ({ signal }) => apiGetJson<AddonsStatusResponse>("/api/k8s/addons/status", { signal }),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  const [ingressBusy, setIngressBusy] = useState(false);
  const [portsBusy, setPortsBusy] = useState(false);
  const [uninstallBusy, setUninstallBusy] = useState(false);
  const [hostHttpPort, setHostHttpPort] = useState("80");
  const [hostHttpsPort, setHostHttpsPort] = useState("443");
  const [addonPhase, setAddonPhase] = useState("");
  const [addonProgress, setAddonProgress] = useState(0);
  const [lastVerification, setLastVerification] = useState<IngressAddonVerification | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [controllerNodeSel, setControllerNodeSel] = useState<string>(NO_FIXED_NODE);
  const [nodePinBusy, setNodePinBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<IngressConfirmAction>(null);

  const { data: nodesRes } = useQuery({
    queryKey: ["k8s-nodes", "ingress-addons"],
    queryFn: ({ signal }) => apiGetJson<K8sNodesListResponse>("/api/k8s/nodes", { signal }),
    enabled: isAdmin,
    staleTime: 60_000,
  });
  const nodeRows = nodesRes?.nodes ?? [];

  useEffect(() => {
    const dep = st?.ingressNginx?.deploymentControllerNodeName;
    const depTrim = dep != null && String(dep).trim() !== "" ? String(dep).trim() : "";
    if (depTrim !== "") {
      setControllerNodeSel(depTrim);
      return;
    }
    const ing =
      st?.ingressNginx?.installed === true ||
      st?.ingressNginx?.likelyInstalled === true ||
      (st?.ingressNginx?.podTotal ?? 0) > 0;
    if (!ing) {
      const c = cfg?.ingressNginxControllerNodeName;
      if (c != null && String(c).trim() !== "") {
        setControllerNodeSel(String(c).trim());
      } else {
        setControllerNodeSel(NO_FIXED_NODE);
      }
      return;
    }
    setControllerNodeSel(NO_FIXED_NODE);
  }, [
    st?.ingressNginx?.deploymentControllerNodeName,
    st?.ingressNginx?.installed,
    st?.ingressNginx?.likelyInstalled,
    st?.ingressNginx?.podTotal,
    cfg?.ingressNginxControllerNodeName,
  ]);

  useEffect(() => {
    const h = cfg?.ingressNginxHostHttpPort;
    const s = cfg?.ingressNginxHostHttpsPort;
    if (h != null && h > 0) setHostHttpPort(String(h));
    if (s != null && s > 0) setHostHttpsPort(String(s));
  }, [cfg?.ingressNginxHostHttpPort, cfg?.ingressNginxHostHttpsPort]);

  useEffect(() => {
    const busy = ingressBusy || portsBusy || uninstallBusy || verifyBusy;
    if (!busy) {
      setAddonProgress(0);
      return;
    }
    setAddonProgress(14);
    const id = window.setInterval(() => {
      setAddonProgress((p) => (p >= 88 ? p : p + 3));
    }, 700);
    return () => clearInterval(id);
  }, [ingressBusy, nodePinBusy, portsBusy, uninstallBusy, verifyBusy]);

  const installPayload = useCallback(() => ({ manifestMirror }), [manifestMirror]);

  const parsePorts = (): { http: number; https: number } | null => {
    const http = Number(String(hostHttpPort).trim());
    const https = Number(String(hostHttpsPort).trim());
    if (!Number.isFinite(http) || http < 1 || http > 65535) {
      toast.error("HTTP 端口须在 1–65535");
      return null;
    }
    if (!Number.isFinite(https) || https < 1 || https > 65535) {
      toast.error("HTTPS 端口须在 1–65535");
      return null;
    }
    return { http, https };
  };

  const installIngress = useCallback(async () => {
    const p = parsePorts();
    if (!p) return;
    setIngressBusy(true);
    setAddonPhase("正在下载并应用 ingress-nginx，并配置控制器 hostNetwork 与端口…");
    try {
      const res = await apiPostJson<{ message?: string; verification?: IngressAddonVerification }>(
        "/api/k8s/addons/ingress-nginx/install",
        {
          ...installPayload(),
          hostHttpPort: p.http,
          hostHttpsPort: p.https,
          controllerNodeName: controllerNodeSel === NO_FIXED_NODE ? "" : controllerNodeSel,
        },
      );
      setAddonProgress(100);
      if (res.verification) setLastVerification(res.verification);
      const msg = String(res.message || "").trim() || "ingress-nginx 已安装（hostNetwork）";
      if (res.verification && !res.verification.ok) {
        toast.warning(msg);
      } else {
        toast.success(msg);
      }
      void qc.invalidateQueries({ queryKey: ["k8s-addons-status"] });
      void qc.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIngressBusy(false);
      setAddonPhase("");
    }
  }, [controllerNodeSel, hostHttpPort, hostHttpsPort, installPayload, qc]);

  const applyControllerNode = useCallback(async () => {
    setNodePinBusy(true);
    setAddonPhase("正在更新控制器调度节点…");
    try {
      const res = await apiPostJson<{ message?: string }>("/api/k8s/addons/ingress-nginx/controller-node", {
        controllerNodeName: controllerNodeSel === NO_FIXED_NODE ? "" : controllerNodeSel,
      });
      toast.success(String(res.message || "").trim() || "已更新调度节点");
      void qc.invalidateQueries({ queryKey: ["k8s-addons-status"] });
      void qc.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setNodePinBusy(false);
      setAddonPhase("");
    }
  }, [controllerNodeSel, qc]);

  const applyHostPorts = useCallback(async () => {
    const p = parsePorts();
    if (!p) return;
    setPortsBusy(true);
    setAddonPhase("正在更新控制器监听端口…");
    try {
      const hpRes = await apiPostJson<{ verification?: IngressAddonVerification }>(
        "/api/k8s/addons/ingress-nginx/host-ports",
        {
          hostHttpPort: p.http,
          hostHttpsPort: p.https,
        },
      );
      setAddonProgress(100);
      if (hpRes.verification) setLastVerification(hpRes.verification);
      if (hpRes.verification && !hpRes.verification.ok) {
        toast.warning(`已应用 HTTP ${p.http} / HTTPS ${p.https}，但自检未全部通过，请查看下方报告`);
      } else {
        toast.success(`已应用 HTTP ${p.http} / HTTPS ${p.https}`);
      }
      void qc.invalidateQueries({ queryKey: ["k8s-addons-status"] });
      void qc.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPortsBusy(false);
      setAddonPhase("");
    }
  }, [hostHttpPort, hostHttpsPort, qc]);

  const deepVerify = useCallback(async () => {
    const p = parsePorts();
    if (!p) return;
    setVerifyBusy(true);
    setAddonPhase("正在深度自检（最多约 2 分钟，含自动修复与网络探测）…");
    try {
      const q = new URLSearchParams({
        maxWaitSec: "120",
        remediate: "1",
        hostHttpPort: String(p.http),
        hostHttpsPort: String(p.https),
      });
      const res = await apiGetJson<{ verification: IngressAddonVerification }>(
        `/api/k8s/addons/ingress-nginx/verify?${q.toString()}`,
      );
      setLastVerification(res.verification);
      if (res.verification.ok) {
        toast.success("自检通过：Ingress-Nginx 与 hostNetwork 探测正常");
      } else {
        toast.warning("自检未全部通过，请查看下方问题与处理建议");
      }
      void qc.invalidateQueries({ queryKey: ["k8s-addons-status"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setVerifyBusy(false);
      setAddonPhase("");
    }
  }, [hostHttpPort, hostHttpsPort, qc]);

  const uninstallIngress = useCallback(async () => {
    setUninstallBusy(true);
    setAddonPhase("正在卸载 ingress-nginx…");
    try {
      const res = await apiPostJson<{ message?: string }>("/api/k8s/addons/ingress-nginx/uninstall", {});
      toast.success(String(res.message || "").trim() || "已卸载");
      void qc.invalidateQueries({ queryKey: ["k8s-addons-status"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUninstallBusy(false);
      setAddonPhase("");
    }
  }, [qc]);

  const ingInstalled = st?.ingressNginx.installed ?? st?.ingressNginx.likelyInstalled;

  const runConfirmedIngressAction = () => {
    const a = confirmAction;
    setConfirmAction(null);
    if (a === "install") void installIngress();
    else if (a === "ports") void applyHostPorts();
    else if (a === "uninstall") void uninstallIngress();
    else if (a === "node") void applyControllerNode();
  };

  const confirmNodeLabel =
    controllerNodeSel === NO_FIXED_NODE ? "不固定（由调度器选择）" : controllerNodeSel;

  return (
    <Card className="border-sky-100 bg-gradient-to-b from-sky-50/40 to-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg text-slate-900">Ingress-Nginx（HostNetwork）</CardTitle>
        <CardDescription className="text-sm text-slate-600">
          安装后控制器 Pod 使用<strong className="text-slate-800"> hostNetwork</strong>，在<strong className="font-mono">运行节点</strong>上直接监听 HTTP/HTTPS（默认{" "}
          <strong className="font-mono">80</strong> / <strong className="font-mono">443</strong>）；Prometheus metrics 沿用官方清单默认 <strong className="font-mono">10254</strong>（与控制器版本一致，不设 <code className="rounded bg-white px-0.5 text-[11px]">--metrics-port</code>）。宝塔同步请把运行时{" "}
          <code className="rounded bg-white px-1 text-xs">ddnsHost</code> 填<strong>可达的节点 IP</strong>，<code className="rounded bg-white px-1 text-xs">defaultPort</code>{" "}
          与 HTTP 端口一致（一般为 80）。请确保节点上该端口未被其它进程占用。
          <span className="mt-2 block text-[13px] leading-relaxed text-slate-700">
            <strong className="text-slate-800">说明：</strong>「国内推荐」下 YAML 会优先走 <strong className="font-mono text-[11px]">jsDelivr</strong>，再试多条 ghproxy，最后直连 GitHub；单线约 90 秒超时即换线。节点拉取{" "}
            <code className="rounded bg-white px-1 text-[11px]">registry.k8s.io</code> 时默认改写到{" "}
            <strong className="font-mono text-xs">m.daocloud.io/registry.k8s.io</strong>。若仍超时，请在运行时填写自建{" "}
            <code className="rounded bg-slate-100 px-1 text-[11px]">ingressNginxManifestUrl</code>（内网可访问的 deploy.yaml）。官方仓库镜像可设{" "}
            <code className="rounded bg-slate-100 px-1 text-[11px]">INGRESS_NGINX_SKIP_K8S_REGISTRY_MIRROR=true</code>。
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/90 px-3 py-3 text-xs text-emerald-950">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="font-medium">自动检测</strong>
            {(stLoading || stFetching) && (
              <span className="inline-flex items-center gap-1 text-emerald-800">
                <Loader2 className="h-3 w-3 animate-spin" />
                检查中…
              </span>
            )}
            {st?.checkedAt && <span className="text-[11px] text-emerald-800/90">更新于 {st.checkedAt}</span>}
          </div>
          {stErr && <p className="mt-2 text-red-700">{(stErr as Error).message}</p>}
          {st && !stLoading && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-emerald-900">ingress-nginx</span>
                {ingInstalled ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600">已安装</Badge>
                ) : (
                  <Badge variant="secondary">未检测到</Badge>
                )}
                {st.ingressNginx.controllersLikelyReady && (
                  <span className="text-[11px]">Pod 就绪 {st.ingressNginx.podReady}/{st.ingressNginx.podTotal}</span>
                )}
                {st.ingressNginx.hostNetwork != null && (
                  <span className="text-[11px]">
                    hostNetwork <strong className="font-mono">{st.ingressNginx.hostNetwork ? "on" : "off"}</strong>
                    {st.ingressNginx.deploymentHttpPort != null && st.ingressNginx.deploymentHttpPort > 0 ? (
                      <>
                        {" "}
                        · 容器 HTTP <strong className="font-mono">{st.ingressNginx.deploymentHttpPort}</strong>
                      </>
                    ) : null}
                    {st.ingressNginx.deploymentHttpsPort != null && st.ingressNginx.deploymentHttpsPort > 0 ? (
                      <>
                        {" "}
                        / HTTPS <strong className="font-mono">{st.ingressNginx.deploymentHttpsPort}</strong>
                      </>
                    ) : null}
                    {st.ingressNginx.deploymentMetricsPort != null && st.ingressNginx.deploymentMetricsPort > 0 ? (
                      <>
                        {" "}
                        · metrics <strong className="font-mono">{st.ingressNginx.deploymentMetricsPort}</strong>
                      </>
                    ) : null}
                    {st.ingressNginx.deploymentControllerNodeName ? (
                      <>
                        {" "}
                        · 固定节点 <strong className="font-mono">{st.ingressNginx.deploymentControllerNodeName}</strong>
                      </>
                    ) : (
                      <span className="text-[11px] text-slate-600"> · 调度节点未固定</span>
                    )}
                    {st.ingressNginx.desiredControllerNodeName &&
                    st.ingressNginx.desiredControllerNodeName !== st.ingressNginx.deploymentControllerNodeName ? (
                      <span className="text-[11px] text-amber-800">
                        {" "}
                        · 运行时默认节点 <strong className="font-mono">{st.ingressNginx.desiredControllerNodeName}</strong>{" "}
                        与当前 Deployment 不一致
                      </span>
                    ) : null}
                  </span>
                )}
                {st.ingressNginx.serviceMissing ? (
                  <span className="text-[11px] text-amber-800">控制器 Service 未找到</span>
                ) : (
                  <span className="text-[11px] text-slate-600">Service 类型 {st.ingressNginx.controllerServiceType || "—"}</span>
                )}
              </div>
              {st.ingressNginx.serviceError ? (
                <span className="text-[11px] text-red-700">Service: {st.ingressNginx.serviceError}</span>
              ) : null}
              {st.manifestMirror?.effective && (
                <p className="text-[11px] text-emerald-900/85">
                  当前清单策略：<strong className="font-mono">{st.manifestMirror.effective}</strong>
                  {st.ingressNginxK8sRegistryMirror === false ? (
                    <span className="ml-2 text-amber-800">· 未启用 K8s 镜像仓库改写（仅官方 registry.k8s.io）</span>
                  ) : (
                    <span className="ml-2">· 安装时会改写 registry.k8s.io 镜像前缀（国内拉取）</span>
                  )}
                </p>
              )}
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
              disabled={verifyBusy || !ingInstalled}
              onClick={() => void deepVerify()}
            >
              {verifyBusy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              深度自检（含网络）
            </Button>
          </div>
        </div>

        {lastVerification && (
          <div
            className={cn(
              "rounded-lg border px-3 py-3 text-xs",
              lastVerification.ok ? "border-emerald-200 bg-emerald-50/90 text-emerald-950" : "border-amber-200 bg-amber-50/95 text-amber-950",
            )}
          >
            <div className="flex flex-wrap items-center gap-2 font-medium">
              <span>Ingress 自检报告</span>
              {lastVerification.ok ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">通过</Badge>
              ) : (
                <Badge className="bg-amber-600 hover:bg-amber-600">待处理</Badge>
              )}
              {lastVerification.checkedAt && (
                <span className="font-normal text-[11px] opacity-90">{lastVerification.checkedAt}</span>
              )}
              {lastVerification.waitedSeconds != null && lastVerification.waitedSeconds > 0 && (
                <span className="font-normal text-[11px] opacity-90">等待约 {lastVerification.waitedSeconds}s</span>
              )}
            </div>
            {(lastVerification.tcpProbeAddr || lastVerification.tcpHttpOpen != null) && (
              <p className="mt-2 font-mono text-[11px] opacity-90">
                TCP {lastVerification.tcpProbeAddr || "—"} · 连通 {lastVerification.tcpHttpOpen ? "是" : "否"}
                {lastVerification.httpProbeOk != null && (
                  <>
                    {" "}
                    · HTTP 探测 {lastVerification.httpProbeOk ? "是" : "否"}
                    {lastVerification.httpProbeDetail ? ` (${lastVerification.httpProbeDetail})` : ""}
                  </>
                )}
              </p>
            )}
            {lastVerification.autoRepairs && lastVerification.autoRepairs.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-[11px] text-sky-900">
                {lastVerification.autoRepairs.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            {lastVerification.checks && lastVerification.checks.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-black/5 pt-2">
                {lastVerification.checks.map((c, i) => (
                  <li key={`${i}-${c.name}`} className="flex flex-wrap gap-x-2 text-[11px]">
                    <span className={c.ok ? "text-emerald-800" : "text-red-800"}>{c.ok ? "✓" : "✗"}</span>
                    <span className="font-mono">{c.name}</span>
                    {c.detail && <span className="text-slate-600">{c.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
            {lastVerification.issues && lastVerification.issues.length > 0 && (
              <div className="mt-2 border-t border-black/5 pt-2">
                <p className="text-[11px] font-medium text-red-900">问题</p>
                <ul className="mt-1 list-inside list-disc text-[11px] text-red-900/90">
                  {lastVerification.issues.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {lastVerification.remedies && lastVerification.remedies.length > 0 && (
              <div className="mt-2 border-t border-black/5 pt-2">
                <p className="text-[11px] font-medium text-amber-900">处理办法</p>
                <ul className="mt-1 list-inside list-disc text-[11px] text-amber-950/95">
                  {lastVerification.remedies.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {isAdmin ? (
          <div className="space-y-3 rounded-xl border-2 border-sky-200/90 bg-white/90 p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-800">一键安装（hostNetwork + 端口）</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">HTTP 端口（节点）</Label>
                <Input className="h-9 font-mono text-xs" value={hostHttpPort} onChange={(e) => setHostHttpPort(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">HTTPS 端口（节点）</Label>
                <Input className="h-9 font-mono text-xs" value={hostHttpsPort} onChange={(e) => setHostHttpsPort(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-700">清单下载（国内 / 海外）</Label>
              <Select value={manifestMirror} onValueChange={(v) => isMirrorMode(v) && setManifestMirror(v)}>
                <SelectTrigger className="h-9 max-w-md font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ghproxy_preferred">国内推荐（jsDelivr → 多线 ghproxy → 直连）</SelectItem>
                  <SelectItem value="direct">海外 / 直连 GitHub</SelectItem>
                  <SelectItem value="auto">自动（直连 → jsDelivr → ghproxy）</SelectItem>
                  <SelectItem value="ghproxy_only">仅代理线（jsDelivr + ghproxy，不直连 GitHub）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(ingressBusy || nodePinBusy || portsBusy || uninstallBusy || verifyBusy) && (
              <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-medium text-sky-950">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  <span>{addonPhase || "正在处理…"}</span>
                </div>
                <Progress value={addonProgress} className="h-1.5 bg-sky-200/60" />
              </div>
            )}
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1 space-y-1.5">
                  <Label className="text-xs text-slate-700">控制器固定节点（kubectl get nodes 的 NAME）</Label>
                  <Select value={controllerNodeSel} onValueChange={setControllerNodeSel}>
                    <SelectTrigger className="h-9 font-mono text-xs">
                      <SelectValue placeholder="选择节点" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(60vh,320px)]">
                      <SelectItem value={NO_FIXED_NODE}>不固定（由调度器选择）</SelectItem>
                      {nodeRows.map((n) => (
                        <SelectItem key={n.name} value={n.name}>
                          <span className="font-mono text-xs">{n.name}</span>
                          {n.ready ? (
                            <span className="ml-2 text-[11px] text-slate-500">Ready {n.ready}</span>
                          ) : null}
                          {n.internalIP ? (
                            <span className="ml-2 text-[11px] text-slate-500">{n.internalIP}</span>
                          ) : null}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 shrink-0"
                  disabled={
                    ingressBusy || nodePinBusy || portsBusy || uninstallBusy || verifyBusy || !ingInstalled
                  }
                  onClick={() => setConfirmAction("node")}
                >
                  {nodePinBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  应用调度节点
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={ingressBusy || nodePinBusy || portsBusy || uninstallBusy || verifyBusy}
                  onClick={() => setConfirmAction("install")}
                >
                  {ingressBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  安装 / 升级 ingress-nginx
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    ingressBusy || nodePinBusy || portsBusy || uninstallBusy || verifyBusy || !ingInstalled
                  }
                  onClick={() => setConfirmAction("ports")}
                >
                  {portsBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  仅应用端口
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-200 text-red-800 hover:bg-red-50"
                  disabled={ingressBusy || nodePinBusy || portsBusy || uninstallBusy || verifyBusy}
                  onClick={() => setConfirmAction("uninstall")}
                >
                  {uninstallBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  卸载
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              固定节点时会在 Pod 模板设置 <code className="rounded bg-slate-100 px-0.5">nodeSelector</code>（
              <code className="rounded bg-slate-100 px-0.5">kubernetes.io/hostname</code>
              ），并将副本数设为 1。安装时会采用此处选项；已安装集群可点「应用调度节点」单独生效。运行时可在「设置」保存{" "}
              <code className="rounded bg-slate-100 px-0.5">ingressNginxControllerNodeName</code> 作为安装默认；HTTP/HTTPS 仍见{" "}
              <code className="rounded bg-slate-100 px-0.5">ingressNginxHostHttpPort</code> /{" "}
              <code className="rounded bg-slate-100 px-0.5">ingressNginxHostHttpsPort</code>。
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-600">安装需要管理员登录。</p>
        )}

        <AlertDialog
          open={confirmAction != null}
          onOpenChange={(o) => {
            if (!o) setConfirmAction(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmAction === "install"
                  ? ingInstalled
                    ? "确认升级 ingress-nginx？"
                    : "确认安装 ingress-nginx？"
                  : confirmAction === "ports"
                    ? "确认应用 HTTP/HTTPS 端口？"
                    : confirmAction === "uninstall"
                      ? "确认卸载 ingress-nginx？"
                      : confirmAction === "node"
                        ? "确认应用调度节点？"
                        : "确认操作"}
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-slate-600">
                {confirmAction === "install" ? (
                  <span>
                    将从网络拉取清单并应用到集群，设置控制器 <strong>hostNetwork</strong> 与当前填写的端口
                    {controllerNodeSel !== NO_FIXED_NODE ? (
                      <>
                        ，并固定到节点 <span className="font-mono">{controllerNodeSel}</span>
                      </>
                    ) : null}
                    。若命名空间已存在则相当于<strong>升级/覆盖</strong>相关资源，期间入口可能出现短暂抖动。
                  </span>
                ) : null}
                {confirmAction === "ports" ? (
                  <span>
                    将更新 Deployment 内控制器监听的 <strong>HTTP {hostHttpPort}</strong> /{" "}
                    <strong>HTTPS {hostHttpsPort}</strong>，Pod 会滚动重建；请确认节点上端口未被占用。
                  </span>
                ) : null}
                {confirmAction === "uninstall" ? (
                  <span>
                    将<strong>删除整个命名空间</strong> <span className="font-mono">ingress-nginx</span>
                    （含控制器、Admission Webhook 等），不可撤销。
                  </span>
                ) : null}
                {confirmAction === "node" ? (
                  <span>
                    将把控制器模板更新为调度节点：<strong className="font-mono">{confirmNodeLabel}</strong>
                    {controllerNodeSel === NO_FIXED_NODE
                      ? "（取消 nodeSelector 固定，由调度器分配；不自动改端口）"
                      : "（设置 kubernetes.io/hostname，并将副本数设为 1）"}
                    ；可能触发 Pod 重建。
                  </span>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">取消</AlertDialogCancel>
              <AlertDialogAction
                type="button"
                className={
                  confirmAction === "uninstall"
                    ? "bg-red-600 hover:bg-red-600/90 focus:ring-red-600"
                    : undefined
                }
                onClick={() => runConfirmedIngressAction()}
              >
                确定执行
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <CollapsibleManual
          storageKey="k8s.addons.ingress-hostnetwork-note"
          title="hostNetwork / 多副本注意"
          variant="amberSoft"
          titleClassName="text-amber-950"
        >
          <p className="text-xs text-amber-950">
            DaemonSet/多副本时注意：hostNetwork 下同一节点只能有一个控制器实例监听同一端口；官方 bare metal 清单一般为单副本
            Deployment。
          </p>
        </CollapsibleManual>

        <CollapseBlock title="手动：自检命令" defaultOpen={false}>
          <CodeBlock text={CHECK_CMD} />
        </CollapseBlock>

        <CollapseBlock title="手动：ingress-nginx" defaultOpen={false}>
          <p className="text-xs text-slate-600">
            <a
              href="https://kubernetes.github.io/ingress-nginx/deploy/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-sky-700 underline-offset-2 hover:underline"
            >
              kubernetes.github.io/ingress-nginx/deploy <ExternalLink className="h-3 w-3" />
            </a>
          </p>
          <CodeBlock text={INGRESS_WAIT} />
        </CollapseBlock>
      </CardContent>
    </Card>
  );
};

export default ClusterK8sAddonsSection;
