import React, { useMemo, useState } from "react";
import { useK8sObjectYamlTabBuffer } from "./useK8sObjectYamlTabBuffer";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileCode2, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { SvcRow } from "./types";
import { K8sObjectRevisionTriggerButton } from "@/components/K8sObjectRevisionDialog";
import { K8sRelationsCard } from "./K8sRelationsCard";
import { K8sGraphicEditDialog } from "./k8s/K8sGraphicEditDialog";
import { normalizePortEntries, ServicePortsDetailTable } from "./servicePortsDisplay";

const TAB_QUERY = "tab";

function validTab(v: string | null): "overview" | "yaml" {
  if (v === "yaml" || v === "overview") return v;
  return "overview";
}

const ClusterServiceDetail: React.FC = () => {
  const { namespace: nsEncoded, serviceName: nameEncoded } = useParams<{
    namespace: string;
    serviceName: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const namespace = nsEncoded ? decodeURIComponent(nsEncoded) : "";
  const serviceName = nameEncoded ? decodeURIComponent(nameEncoded) : "";
  const tab = validTab(searchParams.get(TAB_QUERY));

  const setTab = (next: "overview" | "yaml") => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "overview") p.delete(TAB_QUERY);
        else p.set(TAB_QUERY, next);
        return p;
      },
      { replace: true }
    );
  };

  const basePath = `/cluster/ns/${encodeURIComponent(namespace)}`;

  const listQ = useQuery({
    queryKey: ["k8s-services", namespace],
    queryFn: ({ signal }) =>
      apiGetJson<SvcRow[]>(
        `/api/k8s/services?namespace=${encodeURIComponent(namespace)}`
      , { signal }),
    enabled: Boolean(namespace && serviceName),
  });

  const row = useMemo(
    () => listQ.data?.find((r) => r.name === serviceName),
    [listQ.data, serviceName]
  );

  const portEntries = useMemo(() => normalizePortEntries(row?.portEntries), [row?.portEntries]);

  const [yamlOpen, setYamlOpen] = useState(false);
  const [yamlDraft, setYamlDraft] = useState("");
  const [graphicOpen, setGraphicOpen] = useState(false);

  const yamlLoadQ = useQuery({
    queryKey: ["k8s-object-yaml", "Service", namespace, serviceName],
    queryFn: ({ signal }) =>
      apiGetJson<{ yaml: string }>(
        `/api/k8s/object-yaml?kind=${encodeURIComponent("Service")}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(serviceName)}`
      , { signal }),
    enabled: Boolean(namespace && serviceName && tab === "yaml"),
  });

  const yamlResourceKey = `Service|${namespace}|${serviceName}`;
  const yamlTab = useK8sObjectYamlTabBuffer(
    yamlResourceKey,
    yamlLoadQ.data?.yaml,
    yamlLoadQ.isSuccess
  );

  const applyMut = useMutation({
    mutationFn: (yamlContent: string) =>
      apiPostJson("/api/k8s/apply-yaml", { yamlContent }),
    onSuccess: () => {
      setYamlOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["k8s-services"] });
      void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
      void queryClient.invalidateQueries({
        queryKey: ["k8s-object-yaml", "Service", namespace, serviceName],
      });
      void queryClient.invalidateQueries({
        queryKey: ["k8s-object-revisions", namespace, "Service", serviceName],
      });
      void listQ.refetch();
    },
  });

  const openYamlDialog = async () => {
    setYamlOpen(true);
    setYamlDraft("加载中…");
    try {
      const res = await apiGetJson<{ yaml: string }>(
        `/api/k8s/object-yaml?kind=${encodeURIComponent("Service")}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(serviceName)}`
      );
      setYamlDraft(res.yaml);
    } catch (e) {
      setYamlDraft(`# 加载失败: ${(e as Error).message}`);
    }
  };

  if (!namespace || !serviceName) {
    return <p className="text-sm text-red-600">无效的资源路径</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-2 text-sm text-slate-500">
        <Link to="/cluster/ns" className="font-medium text-blue-600 hover:underline">
          命名空间
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <Link to={basePath} className="font-medium text-blue-600 hover:underline">
          {namespace}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <Link to={`${basePath}/services`} className="font-medium text-blue-600 hover:underline">
          Service
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <span className="font-mono text-base font-semibold text-slate-900">{serviceName}</span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Service
            <span className="ml-2 font-mono text-lg font-medium text-slate-700">{serviceName}</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            core/v1 · 与 Endpoints / Pod、引用本 Service 的 Ingress 等在下方关联区域展示。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-9 gap-1.5"
            title="切换 ClusterIP / NodePort / LoadBalancer 等"
            onClick={() => setGraphicOpen(true)}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            图形编辑
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={openYamlDialog}>
            <FileCode2 className="h-3.5 w-3.5" />
            编辑 YAML
          </Button>
          <K8sObjectRevisionTriggerButton
            namespace={namespace}
            kind="Service"
            name={serviceName}
            onApplied={() => {
              void queryClient.invalidateQueries({ queryKey: ["k8s-services"] });
              void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
              void queryClient.invalidateQueries({
                queryKey: ["k8s-object-yaml", "Service", namespace, serviceName],
              });
              void queryClient.invalidateQueries({
                queryKey: ["k8s-object-revisions", namespace, "Service", serviceName],
              });
              void listQ.refetch();
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
          未找到名为 <span className="font-mono">{serviceName}</span> 的 Service。
        </div>
      )}

      {row && (
        <Tabs value={tab} onValueChange={(v) => setTab(validTab(v))} className="gap-4">
          <TabsList className="h-auto w-full max-w-none flex-wrap justify-start gap-1 bg-slate-100/90 p-1.5 sm:w-fit">
            <TabsTrigger value="overview" className="gap-1.5 px-3 py-2 text-sm">
              <LayoutGrid className="h-3.5 w-3.5" />
              概览
            </TabsTrigger>
            <TabsTrigger value="yaml" className="gap-1.5 px-3 py-2 text-sm">
              YAML
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-0 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-slate-200/90 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">类型</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-medium text-slate-900">{row.type}</p>
                </CardContent>
              </Card>
              <Card className="border-slate-200/90 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">Cluster IP</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-sm text-slate-900">{row.clusterIP}</p>
                </CardContent>
              </Card>
            </div>
            <Card className="border-slate-200/90 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">端口映射</CardTitle>
                <p className="text-xs font-normal text-slate-500">
                  Service 端口、协议、容器目标端口与 NodePort（如有）分行展示。
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ServicePortsDetailTable entries={portEntries} />
                {(row.type === "NodePort" || row.type === "LoadBalancer") && (
                  <p className="text-xs leading-relaxed text-slate-500">
                    <strong className="font-medium text-slate-700">NodePort / LoadBalancer</strong>
                    ：集群外可通过<strong className="text-slate-700">任意节点 IP + 节点端口</strong>访问（请放行安全组/防火墙）。
                  </p>
                )}
              </CardContent>
            </Card>
            <K8sRelationsCard namespace={namespace} kind="Service" name={serviceName} />
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
                    {applyMut.isPending ? "提交中…" : "提交应用"}
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
                  可在本页直接改 YAML 后提交；将 ClusterIP 改为 NodePort 等也可使用右上角「图形编辑」向导。
                </p>
                {applyMut.isError && (
                  <p className="text-sm text-red-600">{(applyMut.error as Error).message}</p>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      <K8sGraphicEditDialog
        open={graphicOpen}
        onOpenChange={setGraphicOpen}
        kind="Service"
        namespace={namespace}
        name={serviceName}
        onSuccess={() => {
          void listQ.refetch();
          void queryClient.invalidateQueries({
            queryKey: ["k8s-object-yaml", "Service", namespace, serviceName],
          });
          void queryClient.invalidateQueries({
            queryKey: ["k8s-object-revisions", namespace, "Service", serviceName],
          });
        }}
      />

      <Dialog open={yamlOpen} onOpenChange={setYamlOpen}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] flex-col gap-3 overflow-y-auto sm:max-w-7xl">
          <DialogHeader>
            <DialogTitle>编辑 Service YAML</DialogTitle>
          </DialogHeader>
          <YamlEditor
            value={yamlDraft}
            onChange={setYamlDraft}
            readOnly={yamlDraft === "加载中…"}
            height="min(62vh, 500px)"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="secondary" onClick={() => setYamlOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              disabled={applyMut.isPending}
              onClick={() => void applyMut.mutateAsync(yamlDraft)}
            >
              {applyMut.isPending ? "提交中…" : "提交应用"}
            </Button>
          </DialogFooter>
          {applyMut.isError && (
            <p className="text-sm text-red-600">{(applyMut.error as Error).message}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClusterServiceDetail;
