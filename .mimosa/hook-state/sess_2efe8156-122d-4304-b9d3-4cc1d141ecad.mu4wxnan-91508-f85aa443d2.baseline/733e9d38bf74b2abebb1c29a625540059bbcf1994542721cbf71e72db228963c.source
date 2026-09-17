import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { useK8sObjectYamlTabBuffer } from "./useK8sObjectYamlTabBuffer";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, ChevronRight, FileCode2, LayoutGrid, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { YamlEditor } from "@/components/YamlEditor";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiGetJson, apiPostJson } from "@/lib/api";
import { extractErrorMessage } from "@/lib/extract-error-message";
import { parseAge } from "./parseAge";
import { PodListBlock } from "./PodListBlock";
import {
  K8sGraphicEditDialog,
  type K8sGraphicKind,
} from "./k8s/K8sGraphicEditDialog";
import { K8sObjectRevisionTriggerButton } from "@/components/K8sObjectRevisionDialog";
import { K8sRelationsCard } from "./K8sRelationsCard";
import { WorkloadHostNetworkBadge } from "./WorkloadHostNetworkBadge";
import {
  parsePodTemplatePorts,
  WorkloadPodTemplatePortsTable,
} from "./WorkloadPodTemplatePorts";
import {
  formatSchedulingPrecheckError,
  isProbablySingleYamlDoc,
  schedulingPrecheckYaml,
} from "./workloadSchedulingPrecheck";
import {
  WORKLOAD_SCHEDULE_PRECHECK_APPLY_HINT,
  workloadApplyPipelineLabel,
  workloadApplyPipelineProgress,
  type WorkloadApplyPipelineStep,
} from "./workloadApplyPipeline";

const TAB_QUERY = "tab";

type WorkloadSegment = "deployments" | "statefulsets" | "daemonsets";

const GRAPHIC_KIND: Record<WorkloadSegment, K8sGraphicKind> = {
  deployments: "Deployment",
  statefulsets: "StatefulSet",
  daemonsets: "DaemonSet",
};

const YAML_KIND: Record<WorkloadSegment, string> = {
  deployments: "Deployment",
  statefulsets: "StatefulSet",
  daemonsets: "DaemonSet",
};

const QUERY_KEY: Record<WorkloadSegment, string> = {
  deployments: "k8s-deployments",
  statefulsets: "k8s-statefulsets",
  daemonsets: "k8s-daemonsets",
};

const API_SUFFIX: Record<WorkloadSegment, string> = {
  deployments: "deployments",
  statefulsets: "statefulsets",
  daemonsets: "daemonsets",
};

const TITLE: Record<WorkloadSegment, string> = {
  deployments: "Deployment",
  statefulsets: "StatefulSet",
  daemonsets: "DaemonSet",
};

export type ClusterWorkloadDetailProps = {
  segment: WorkloadSegment;
};

type WorkloadRow = {
  namespace: string;
  name: string;
  ready: string;
  age: string;
  labelSelector?: string;
  /** GET /api/k8s/deployments|statefulsets — spec.template.spec.hostNetwork */
  hostNetwork?: boolean;
  /** 模板中 initContainers + containers 的 ports[] */
  podTemplatePorts?: unknown;
};

function validTab(v: string | null): "overview" | "pods" | "yaml" {
  if (v === "pods" || v === "yaml" || v === "overview") return v;
  return "pods";
}

export const ClusterWorkloadDetail: React.FC<ClusterWorkloadDetailProps> = ({
  segment,
}) => {
  const { namespace: nsEncoded, workloadName: nameEncoded } = useParams<{
    namespace: string;
    workloadName: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const namespace = nsEncoded ? decodeURIComponent(nsEncoded) : "";
  const workloadName = nameEncoded ? decodeURIComponent(nameEncoded) : "";

  const tab = validTab(searchParams.get(TAB_QUERY));

  const setTab = (next: "overview" | "pods" | "yaml") => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "pods") p.delete(TAB_QUERY);
        else p.set(TAB_QUERY, next);
        return p;
      },
      { replace: true }
    );
  };

  const apiPath = API_SUFFIX[segment];
  const queryKey = QUERY_KEY[segment];
  const yamlKind = YAML_KIND[segment];
  const graphicKind = GRAPHIC_KIND[segment];
  const kindTitle = TITLE[segment];

  const listQ = useQuery({
    queryKey: [queryKey, namespace],
    queryFn: ({ signal }) =>
      apiGetJson<WorkloadRow[]>(
        `/api/k8s/${apiPath}?namespace=${encodeURIComponent(namespace)}`,
        { signal }
      ),
    enabled: Boolean(namespace && workloadName),
  });

  const row = useMemo(
    () => listQ.data?.find((r) => r.name === workloadName),
    [listQ.data, workloadName]
  );

  const labelSelector = typeof row?.labelSelector === "string" ? row.labelSelector : "";

  const podTemplatePortRows = useMemo(
    () => parsePodTemplatePorts(row?.podTemplatePorts),
    [row?.podTemplatePorts]
  );

  const [yamlOpen, setYamlOpen] = useState(false);
  const [yamlDraft, setYamlDraft] = useState("");
  const [graphicOpen, setGraphicOpen] = useState(false);
  const [applyPipelineStep, setApplyPipelineStep] = useState<WorkloadApplyPipelineStep | null>(null);

  const yamlLoadQ = useQuery({
    queryKey: ["k8s-object-yaml", yamlKind, namespace, workloadName],
    queryFn: ({ signal }) =>
      apiGetJson<{ yaml: string }>(
        `/api/k8s/object-yaml?kind=${encodeURIComponent(yamlKind)}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(workloadName)}`,
        { signal }
      ),
    enabled: Boolean(namespace && workloadName && tab === "yaml"),
  });

  const yamlResourceKey = `${yamlKind}|${namespace}|${workloadName}`;
  const yamlTab = useK8sObjectYamlTabBuffer(
    yamlResourceKey,
    yamlLoadQ.data?.yaml,
    yamlLoadQ.isSuccess
  );

  const restartPodsMut = useMutation({
    mutationFn: () =>
      apiPostJson<{ message?: string; restartedAt?: string }>(
        `/api/k8s/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(workloadName)}/restart`,
        {}
      ),
    onSuccess: (data) => {
      toast.success(data?.message ?? "已触发重建 Pod");
      void queryClient.invalidateQueries({ queryKey: [queryKey] });
      void queryClient.invalidateQueries({ queryKey: ["k8s-pods"] });
      void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
      void queryClient.invalidateQueries({
        queryKey: ["k8s-object-yaml", yamlKind, namespace, workloadName],
      });
    },
    onError: (e) => {
      toast.error(extractErrorMessage(e));
    },
  });

  const applyMut = useMutation({
    mutationFn: async (yamlContent: string) => {
      try {
        if (segment === "deployments" || segment === "statefulsets") {
          if (
            yamlContent.trim() &&
            yamlContent.trim() !== "加载中…" &&
            isProbablySingleYamlDoc(yamlContent)
          ) {
            setApplyPipelineStep("precheck");
            await schedulingPrecheckYaml(yamlContent);
          }
        }
        setApplyPipelineStep("apply");
        return apiPostJson("/api/k8s/apply-yaml", { yamlContent });
      } finally {
        setApplyPipelineStep(null);
      }
    },
    onSuccess: (_data, yamlContent) => {
      const ranPrecheck =
        (segment === "deployments" || segment === "statefulsets") &&
        String(yamlContent).trim() &&
        String(yamlContent) !== "加载中…" &&
        isProbablySingleYamlDoc(String(yamlContent));
      toast.success(ranPrecheck ? "调度预检已通过，YAML 已应用" : "YAML 已应用");
      setYamlOpen(false);
      void queryClient.invalidateQueries({ queryKey: [queryKey] });
      void queryClient.invalidateQueries({ queryKey: ["k8s-pods"] });
      void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
      void queryClient.invalidateQueries({
        queryKey: ["k8s-object-yaml", yamlKind, namespace, workloadName],
      });
      void queryClient.invalidateQueries({
        queryKey: ["k8s-object-revisions", namespace, yamlKind, workloadName],
      });
    },
  });

  const openYamlDialog = () => {
    setYamlOpen(true);
    setYamlDraft("加载中…");
    void queryClient
      .fetchQuery({
        queryKey: ["k8s-object-yaml", yamlKind, namespace, workloadName],
        queryFn: ({ signal }) =>
          apiGetJson<{ yaml: string }>(
            `/api/k8s/object-yaml?kind=${encodeURIComponent(yamlKind)}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(workloadName)}`,
            { signal }
          ),
      })
      .then((data) => setYamlDraft(data.yaml))
      .catch((e: unknown) => setYamlDraft(`# 加载失败: ${extractErrorMessage(e)}`));
  };

  const basePath = `/cluster/ns/${encodeURIComponent(namespace)}`;

  if (!namespace || !workloadName) {
    return <p className="text-sm text-red-600">无效的资源路径</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-2 text-sm text-slate-500">
        <Link to="/cluster/ns" className="font-medium text-blue-600 hover:underline">
          命名空间
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <Link
          to={basePath}
          className="font-medium text-blue-600 hover:underline"
        >
          {namespace}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <Link
          to={`${basePath}/${segment}`}
          className="font-medium text-blue-600 hover:underline"
        >
          {kindTitle}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <span className="font-mono text-base font-semibold text-slate-900">{workloadName}</span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-slate-900">
            <span>
              {kindTitle}
              <span className="ml-2 font-mono text-lg font-medium text-slate-700">{workloadName}</span>
            </span>
            {row?.hostNetwork === true ? <WorkloadHostNetworkBadge /> : null}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            apps/v1 {kindTitle}
            {segment === "daemonsets"
              ? " · 每节点一组 Pod，与 ControllerRevision 关联；在此页可查看 Pod、图形或 YAML 编辑。"
              : " · 与 ReplicaSet / Pod 通过 selector 关联；在此页切换标签即可查看 Pod、YAML，无需再回列表筛选。"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {segment === "deployments" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              disabled={!row || restartPodsMut.isPending}
              onClick={() => {
                if (
                  !window.confirm(
                    "确定要重建此 Deployment 下的 Pod？\n将更新 Pod 模板的重启时间并触发滚动更新（与 kubectl rollout restart 效果相同）。"
                  )
                ) {
                  return;
                }
                void restartPodsMut.mutateAsync();
              }}
            >
              {restartPodsMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              重建 Pod
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setGraphicOpen(true)}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            图形编辑
          </Button>
          <Button type="button" variant="default" size="sm" className="h-9 gap-1.5" onClick={openYamlDialog}>
            <FileCode2 className="h-3.5 w-3.5" />
            编辑 YAML
          </Button>
          <K8sObjectRevisionTriggerButton
            namespace={namespace}
            kind={yamlKind}
            name={workloadName}
            onApplied={() => {
              void queryClient.invalidateQueries({ queryKey: [queryKey] });
              void queryClient.invalidateQueries({ queryKey: ["k8s-pods"] });
              void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
              void queryClient.invalidateQueries({
                queryKey: ["k8s-object-yaml", yamlKind, namespace, workloadName],
              });
              void queryClient.invalidateQueries({
                queryKey: ["k8s-object-revisions", namespace, yamlKind, workloadName],
              });
            }}
          />
        </div>
      </div>

      {listQ.isLoading && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center text-sm text-slate-500">
          加载中…
        </div>
      )}
      {listQ.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {(listQ.error as Error).message}
        </div>
      )}
      {listQ.data && !row && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          未找到名为 <span className="font-mono">{workloadName}</span> 的 {kindTitle}（可能已删除或不在当前命名空间）。
        </div>
      )}

      {row && (
        <>
          {applyMut.isPending ? (
            <div className="mb-3 rounded-lg border border-sky-200/80 bg-sky-50/50 px-3 py-2.5 dark:border-sky-900/50 dark:bg-sky-950/25">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-sky-950 dark:text-sky-100/90">
                <span className="font-medium">
                  {applyPipelineStep
                    ? workloadApplyPipelineLabel(applyPipelineStep, "apply-yaml")
                    : "准备提交…"}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {segment === "deployments" || segment === "statefulsets"
                    ? "约 8～40 s"
                    : "约 3～15 s"}
                </span>
              </div>
              <Progress
                className="h-2"
                value={applyPipelineStep ? workloadApplyPipelineProgress(applyPipelineStep) : 6}
              />
              {(segment === "deployments" || segment === "statefulsets") && (
                <p className="mt-1.5 text-[11px] leading-snug text-sky-900/80 dark:text-sky-200/80">
                  {WORKLOAD_SCHEDULE_PRECHECK_APPLY_HINT}
                </p>
              )}
            </div>
          ) : null}
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(validTab(v))}
            className="gap-4"
          >
          <TabsList className="h-auto w-full max-w-none flex-wrap justify-start gap-1 bg-slate-100/90 p-1.5 sm:w-fit">
            <TabsTrigger value="overview" className="gap-1.5 px-3 py-2 text-sm">
              概览
            </TabsTrigger>
            <TabsTrigger value="pods" className="gap-1.5 px-3 py-2 text-sm">
              <Box className="h-3.5 w-3.5" />
              容器组
            </TabsTrigger>
            <TabsTrigger value="yaml" className="gap-1.5 px-3 py-2 text-sm">
              YAML
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0 space-y-4">
            {row.hostNetwork === true && (
              <Card className="border-amber-200/80 bg-amber-50/40 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium text-amber-950">
                    Pod 网络
                    <WorkloadHostNetworkBadge />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-amber-950/90">
                    已启用 <span className="font-mono">spec.template.spec.hostNetwork</span>
                    ，Pod 使用节点网络栈。下方「Pod 模板端口」列出各容器声明的端口，便于在节点上核对访问地址。访问 Service 时常见搭配为
                    NodePort + <span className="font-mono">externalTrafficPolicy: Local</span>。
                  </p>
                </CardContent>
              </Card>
            )}
            <Card className="border-slate-200/90 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Pod 模板端口</CardTitle>
                <p className="text-[11px] font-normal text-slate-500">
                  来自 <span className="font-mono">spec.template.spec</span> 下 initContainers / containers 的{" "}
                  <span className="font-mono">ports</span>
                </p>
              </CardHeader>
              <CardContent>
                <WorkloadPodTemplatePortsTable
                  rows={podTemplatePortRows}
                  hostNetwork={row.hostNetwork === true}
                />
              </CardContent>
            </Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-slate-200/90 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">副本状态</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{row.ready}</p>
                  <p className="mt-1 text-xs text-slate-500">就绪 / 期望</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200/90 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">创建时间</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mt-1 text-lg font-medium text-slate-900">{parseAge(row.age)}</p>
                </CardContent>
              </Card>
            </div>
            <Card className="border-slate-200/90 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Pod 标签选择器</CardTitle>
              </CardHeader>
              <CardContent>
                {labelSelector ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <code className="block rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 ring-1 ring-slate-100">
                      {labelSelector}
                    </code>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setTab("pods")}
                    >
                      查看关联 Pod
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-amber-800">未配置 selector，无法列出关联 Pod。</p>
                )}
              </CardContent>
            </Card>
            <K8sRelationsCard
              namespace={namespace}
              kind={
                segment === "deployments"
                  ? "Deployment"
                  : segment === "statefulsets"
                    ? "StatefulSet"
                    : "DaemonSet"
              }
              name={workloadName}
            />
          </TabsContent>

          <TabsContent value="pods" className="mt-0">
            {labelSelector ? (
              <PodListBlock
                namespace={namespace}
                labelSelector={labelSelector}
                showPageHeader={false}
                showLabelFilterBanner={false}
                showCreateYamlButton
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-600">
                该工作负载没有有效的 <code className="font-mono text-xs">labelSelector</code>，无法筛选 Pod。
              </div>
            )}
          </TabsContent>

          <TabsContent value="yaml" className="mt-0 space-y-3">
            {yamlLoadQ.isLoading && (
              <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
                加载 YAML…
              </div>
            )}
            {yamlLoadQ.error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {(yamlLoadQ.error as Error).message}
              </div>
            )}
            {yamlLoadQ.data?.yaml && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={applyMut.isPending}
                    onClick={() => void applyMut.mutateAsync(yamlTab.buffer)}
                  >
                    {applyMut.isPending ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        预检并提交…
                      </span>
                    ) : segment === "deployments" || segment === "statefulsets" ? (
                      "预检并提交应用"
                    ) : (
                      "提交应用"
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={yamlLoadQ.isFetching}
                    onClick={() => void yamlLoadQ.refetch()}
                  >
                    从集群重新拉取
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={yamlTab.resetFromServer}>
                    放弃本地修改
                  </Button>
                </div>
                <YamlEditor
                  value={yamlTab.buffer}
                  onChange={yamlTab.setBuffer}
                  height="min(70vh, 560px)"
                />
                <p className="text-xs text-slate-500">
                  {segment === "deployments" || segment === "statefulsets"
                    ? `修改后点「预检并提交应用」将合并调度预检与保存；${WORKLOAD_SCHEDULE_PRECHECK_APPLY_HINT}也可用右上角「编辑 YAML」弹窗或「图形编辑」。`
                    : "可直接修改后点「提交应用」；也可用右上角「编辑 YAML」弹窗或「图形编辑」。每次成功保存会写入「变更记录」（含记录时间与 YAML/JSON 比对）。"}
                </p>
                {applyMut.isError && (
                  <p className="text-sm text-red-600">
                    {formatSchedulingPrecheckError(applyMut.error) || (applyMut.error as Error).message}
                  </p>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
        </>
      )}

      <K8sGraphicEditDialog
        open={graphicOpen}
        onOpenChange={setGraphicOpen}
        kind={graphicKind}
        namespace={namespace}
        name={workloadName}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: [queryKey] });
          void queryClient.invalidateQueries({ queryKey: ["k8s-pods"] });
          void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
          void queryClient.invalidateQueries({
            queryKey: ["k8s-object-yaml", yamlKind, namespace, workloadName],
          });
          void queryClient.invalidateQueries({
            queryKey: ["k8s-object-revisions", namespace, yamlKind, workloadName],
          });
        }}
      />

      <Dialog open={yamlOpen} onOpenChange={setYamlOpen}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] flex-col gap-3 overflow-y-auto sm:max-w-7xl">
          <DialogHeader>
            <DialogTitle>编辑 {kindTitle} YAML</DialogTitle>
          </DialogHeader>
          <YamlEditor
            value={yamlDraft}
            onChange={setYamlDraft}
            readOnly={yamlDraft === "加载中…"}
            height="min(62vh, 500px)"
          />
          {applyMut.isPending ? (
            <div className="rounded-lg border border-sky-200/80 bg-sky-50/50 px-3 py-2 dark:border-sky-900/50 dark:bg-sky-950/25">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-sky-950 dark:text-sky-100/90">
                <span className="font-medium">
                  {applyPipelineStep
                    ? workloadApplyPipelineLabel(applyPipelineStep, "apply-yaml")
                    : "准备提交…"}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {segment === "deployments" || segment === "statefulsets" ? "约 8～40 s" : "约 3～15 s"}
                </span>
              </div>
              <Progress
                className="h-2"
                value={applyPipelineStep ? workloadApplyPipelineProgress(applyPipelineStep) : 6}
              />
              {(segment === "deployments" || segment === "statefulsets") && (
                <p className="mt-1.5 text-[11px] text-sky-900/80 dark:text-sky-200/80">
                  {WORKLOAD_SCHEDULE_PRECHECK_APPLY_HINT}
                </p>
              )}
            </div>
          ) : null}
          <DialogFooter className="flex flex-wrap gap-2 sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setYamlOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={applyMut.isPending}
              onClick={() => void applyMut.mutateAsync(yamlDraft)}
            >
              {applyMut.isPending ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  预检并提交…
                </span>
              ) : segment === "deployments" || segment === "statefulsets" ? (
                "预检并提交应用"
              ) : (
                "提交应用"
              )}
            </Button>
          </DialogFooter>
          {applyMut.isError && (
            <p className="text-sm text-red-600">
              {formatSchedulingPrecheckError(applyMut.error) || (applyMut.error as Error).message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClusterWorkloadDetail;
