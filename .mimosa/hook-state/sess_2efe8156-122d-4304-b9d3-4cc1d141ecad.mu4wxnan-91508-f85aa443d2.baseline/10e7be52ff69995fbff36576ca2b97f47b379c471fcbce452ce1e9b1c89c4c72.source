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
import { parseAge } from "./parseAge";
import { K8sObjectRevisionTriggerButton } from "@/components/K8sObjectRevisionDialog";
import { K8sRelationsCard } from "./K8sRelationsCard";
import IngressAnnotations from "@/components/IngressAnnotations";
import { ingressText } from "@/i18n/ingress";

const TAB_QUERY = "tab";

type IngressRow = {
  namespace: string;
  name: string;
  labels?: string;
  annotationCount?: number;
  hosts?: string[];
  backends?: string[];
  class?: string;
  age: string;
};

function validTab(v: string | null): "overview" | "yaml" {
  if (v === "yaml" || v === "overview") return v;
  return "overview";
}

const ClusterIngressDetail: React.FC = () => {
  const { namespace: nsEncoded, ingressName: nameEncoded } = useParams<{
    namespace: string;
    ingressName: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const namespace = nsEncoded ? decodeURIComponent(nsEncoded) : "";
  const ingressName = nameEncoded ? decodeURIComponent(nameEncoded) : "";
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
    queryKey: ["k8s-ingresses", namespace],
    queryFn: ({ signal }) =>
      apiGetJson<IngressRow[]>(
        `/api/k8s/ingresses?namespace=${encodeURIComponent(namespace)}`
      , { signal }),
    enabled: Boolean(namespace && ingressName),
  });

  const row = useMemo(
    () => listQ.data?.find((r) => r.name === ingressName),
    [listQ.data, ingressName]
  );

  const [yamlOpen, setYamlOpen] = useState(false);
  const [yamlDraft, setYamlDraft] = useState("");

  const yamlLoadQ = useQuery({
    queryKey: ["k8s-object-yaml", "Ingress", namespace, ingressName],
    queryFn: ({ signal }) =>
      apiGetJson<{ yaml: string }>(
        `/api/k8s/object-yaml?kind=${encodeURIComponent("Ingress")}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(ingressName)}`
      , { signal }),
    enabled: Boolean(namespace && ingressName && tab === "yaml"),
  });

  const yamlResourceKey = `Ingress|${namespace}|${ingressName}`;
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
      void queryClient.invalidateQueries({ queryKey: ["k8s-ingresses"] });
      void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
      void queryClient.invalidateQueries({
        queryKey: ["k8s-object-yaml", "Ingress", namespace, ingressName],
      });
      void queryClient.invalidateQueries({
        queryKey: ["k8s-object-revisions", namespace, "Ingress", ingressName],
      });
    },
  });

  const openYamlDialog = async () => {
    setYamlOpen(true);
    setYamlDraft("加载中…");
    try {
      const res = await apiGetJson<{ yaml: string }>(
        `/api/k8s/object-yaml?kind=${encodeURIComponent("Ingress")}&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(ingressName)}`
      );
      setYamlDraft(res.yaml);
    } catch (e) {
      setYamlDraft(`# 加载失败: ${(e as Error).message}`);
    }
  };

  if (!namespace || !ingressName) {
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
        <Link to={`${basePath}/ingresses`} className="font-medium text-blue-600 hover:underline">
          Ingress
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <span className="font-mono text-base font-semibold text-slate-900">{ingressName}</span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Ingress
            <span className="ml-2 font-mono text-lg font-medium text-slate-700">{ingressName}</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            networking.k8s.io/v1 · 规则与后端 Service；下方可跳转到关联 Deployment、Pod 等。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="default" size="sm" className="h-9 gap-1.5" onClick={openYamlDialog}>
            <FileCode2 className="h-3.5 w-3.5" />
            编辑 YAML
          </Button>
          <K8sObjectRevisionTriggerButton
            namespace={namespace}
            kind="Ingress"
            name={ingressName}
            onApplied={() => {
              void queryClient.invalidateQueries({ queryKey: ["k8s-ingresses", namespace] });
              void queryClient.invalidateQueries({ queryKey: ["k8s-namespaces-stats"] });
              void queryClient.invalidateQueries({
                queryKey: ["k8s-object-yaml", "Ingress", namespace, ingressName],
              });
              void queryClient.invalidateQueries({
                queryKey: ["k8s-object-revisions", namespace, "Ingress", ingressName],
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
          未找到名为 <span className="font-mono">{ingressName}</span> 的 Ingress。
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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Card className="border-slate-200/90 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">Hosts</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-900">
                    {(row.hosts ?? []).length ? (row.hosts ?? []).join(", ") : "—"}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-slate-200/90 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">IngressClass / 存活</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-900">{row.class || "—"}</p>
                  <p className="mt-1 text-xs text-slate-500">创建约 {parseAge(row.age)}</p>
                </CardContent>
              </Card>
              <Card className="min-w-0 border-slate-200/90 shadow-sm sm:col-span-2 xl:col-span-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-600">{ingressText.annotations}</CardTitle>
                </CardHeader>
                <CardContent>
                  <IngressAnnotations
                    annotationCount={row.annotationCount}
                    namespace={namespace}
                    name={ingressName}
                    resourceName={`${namespace}/${ingressName}`}
                  />
                </CardContent>
              </Card>
            </div>
            <Card className="border-slate-200/90 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">后端 Service</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {(row.backends ?? []).length ? (
                    (row.backends ?? []).map((b) => {
                      const svcPart = b.split(":")[0];
                      if (!svcPart) return <span key={b}>{b}</span>;
                      return (
                        <Link
                          key={b}
                          to={`${basePath}/services/${encodeURIComponent(svcPart)}`}
                          className="rounded-md bg-blue-50 px-2 py-1 font-mono text-xs text-blue-800 ring-1 ring-blue-100 hover:bg-blue-100"
                        >
                          {b}
                        </Link>
                      );
                    })
                  ) : (
                    <span className="text-sm text-slate-500">—</span>
                  )}
                </div>
              </CardContent>
            </Card>
            <K8sRelationsCard namespace={namespace} kind="Ingress" name={ingressName} />
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
                <p className="text-xs text-slate-500">可直接修改后提交；也可用右上角「编辑 YAML」弹窗。</p>
                {applyMut.isError && (
                  <p className="text-sm text-red-600">{(applyMut.error as Error).message}</p>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={yamlOpen} onOpenChange={setYamlOpen}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-[calc(100%-2rem)] flex-col gap-3 overflow-y-auto sm:max-w-7xl">
          <DialogHeader>
            <DialogTitle>编辑 Ingress YAML</DialogTitle>
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

export default ClusterIngressDetail;
