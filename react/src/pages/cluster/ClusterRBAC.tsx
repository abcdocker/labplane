import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, ChevronRight, Copy, Loader2 } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { ApiHttpError, apiGetJson, apiPostJson } from "@/lib/api";
import { parseAge } from "./parseAge";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type CR = { name: string; rulesCount: number; age: string };
type RoleRow = { namespace: string; name: string; rulesCount: number; age: string };
type RBRow = {
  name: string;
  namespace?: string;
  roleRef: string;
  subjects: string;
  age: string;
};

type SARow = { namespace: string; name: string; age: string };

type RBACPayload = {
  clusterRoles: CR[];
  clusterRoleBindings: RBRow[];
  roles: RoleRow[];
  roleBindings: RBRow[];
  serviceAccounts: SARow[];
  warnings?: string[];
};

type GlobalReadUserRes = {
  ok: boolean;
  mode?: string;
  namespace?: string;
  serviceAccount?: string;
  clusterRole?: string;
  clusterRoleBinding?: string;
  tokenSecret?: string;
  kubeconfig?: string;
  server?: string;
  warning?: string;
  insecureSkipTLSVerify?: boolean;
};

function saDetailHref(ns: string, name: string): string {
  return `/cluster/rbac/sa/${encodeURIComponent(ns)}/${encodeURIComponent(name)}`;
}

const ClusterRBAC: React.FC = () => {
  const queryClient = useQueryClient();
  const { status: authStatus } = useAuth();
  const isAdmin = authStatus?.role === "admin";

  const q = useQuery({
    queryKey: ["k8s-rbac"],
    queryFn: ({ signal }) => apiGetJson<RBACPayload>("/api/k8s/rbac", { signal }),
  });

  /** 自动创建 ClusterRole super-reader（全资源 get/list/watch） */
  const [optEnsureSuperReader, setOptEnsureSuperReader] = useState(true);
  /** 勾选：kube-system；不勾选：default */
  const [optKubeSystem, setOptKubeSystem] = useState(true);
  const [resultOpen, setResultOpen] = useState(false);
  const [kubeconfigOut, setKubeconfigOut] = useState("");
  const [createdSummary, setCreatedSummary] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      apiPostJson<GlobalReadUserRes>("/api/k8s/rbac/quick-readonly-user", {
        ensureSuperReaderClusterRole: optEnsureSuperReader,
        useKubeSystem: optKubeSystem,
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["k8s-rbac"] });
      const sum =
        data.namespace && data.serviceAccount
          ? `${data.namespace} / ${data.serviceAccount}`
          : "";
      setCreatedSummary(sum);
      if (data.ok && data.kubeconfig) {
        setKubeconfigOut(data.kubeconfig);
        setResultOpen(true);
        toast.success("已创建只读账号并生成 kubeconfig");
      } else {
        toast.message(data.warning ?? "已提交", { description: data.warning });
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiHttpError ? err.serverMessage : (err as Error).message;
      toast.error(msg);
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">RBAC</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
          集群级与命名空间级 Role / RoleBinding、ClusterRole / ClusterRoleBinding、以及{" "}
          <strong className="font-medium text-slate-700">ServiceAccount</strong>（与{" "}
          <code className="text-xs">kubectl get sa</code> 对应）概览。管理员在下方<strong className="font-medium text-slate-700">勾选选项后一键创建</strong>
          只读 kubeconfig（名称由平台自动生成）；在 ServiceAccount 列表中可点名称查看详情。
        </p>
      </div>

      {isAdmin && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">一键创建只读 kubeconfig</CardTitle>
            <CardDescription>
              无需填写名称：平台自动生成 ServiceAccount / ClusterRoleBinding / token Secret，并绑定到 ClusterRole{" "}
              <span className="font-mono text-[11px]">super-reader</span>（全资源 get、list、watch）。请按需勾选下面两项后点击按钮。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="rbac-q-ensure"
                  checked={optEnsureSuperReader}
                  onCheckedChange={(v) => setOptEnsureSuperReader(v === true)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <Label htmlFor="rbac-q-ensure" className="cursor-pointer text-sm font-medium text-slate-800">
                    自动准备 <span className="font-mono text-xs">super-reader</span> 集群角色
                  </Label>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    勾选后若集群尚无该 ClusterRole 会自动创建（仅只读动词）。若你已在集群中手工维护同名角色，可取消勾选，但请确保{" "}
                    <span className="font-mono">super-reader</span> 已存在，否则创建会失败。
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 border-t border-slate-200/80 pt-3">
                <Checkbox
                  id="rbac-q-ns"
                  checked={optKubeSystem}
                  onCheckedChange={(v) => setOptKubeSystem(v === true)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <Label htmlFor="rbac-q-ns" className="cursor-pointer text-sm font-medium text-slate-800">
                    把账号建在 <span className="font-mono text-xs">kube-system</span>
                  </Label>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    勾选：使用 <span className="font-mono">kube-system</span>（与常见文档一致）。取消勾选：改为{" "}
                    <span className="font-mono">default</span> 命名空间。
                  </p>
                </div>
              </div>
            </div>
            <Button
              type="button"
              disabled={createMut.isPending}
              onClick={() => createMut.mutate()}
              className="gap-2"
            >
              {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              一键创建并下载 kubeconfig
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>kubeconfig</DialogTitle>
            <DialogDescription className="space-y-1">
              {createdSummary ? (
                <span className="block font-mono text-xs text-slate-700">已创建：{createdSummary}</span>
              ) : null}
              <span>
                请妥善保管；关闭对话框后需自行保存。可复制到本地文件后使用{" "}
                <code className="text-xs">kubectl --kubeconfig</code>。
              </span>
            </DialogDescription>
          </DialogHeader>
          <Textarea
            readOnly
            className="min-h-[240px] font-mono text-xs"
            value={kubeconfigOut}
            spellCheck={false}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              className="gap-1.5"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(kubeconfigOut);
                  toast.success("已复制到剪贴板");
                } catch {
                  toast.error("复制失败");
                }
              }}
            >
              <Copy className="h-4 w-4" />
              复制
            </Button>
            <Button type="button" onClick={() => setResultOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {q.data?.warnings && q.data.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">权限与数据提示</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 leading-relaxed">
            {q.data.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {q.isLoading && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center text-sm text-slate-500">
          加载中…
        </div>
      )}
      {q.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {q.error instanceof ApiHttpError ? q.error.serverMessage : (q.error as Error).message}
        </div>
      )}

      {q.data && (
        <Tabs defaultValue="cr" className="w-full">
          <TabsList className="flex w-full flex-wrap gap-1 bg-slate-100/80 p-1">
            <TabsTrigger value="cr" className="text-xs sm:text-sm">
              ClusterRole ({q.data.clusterRoles.length})
            </TabsTrigger>
            <TabsTrigger value="crb" className="text-xs sm:text-sm">
              ClusterRoleBinding ({q.data.clusterRoleBindings.length})
            </TabsTrigger>
            <TabsTrigger value="r" className="text-xs sm:text-sm">
              Role ({q.data.roles.length})
            </TabsTrigger>
            <TabsTrigger value="rb" className="text-xs sm:text-sm">
              RoleBinding ({q.data.roleBindings.length})
            </TabsTrigger>
            <TabsTrigger value="sa" className="text-xs sm:text-sm">
              ServiceAccount ({q.data.serviceAccounts?.length ?? 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cr" className="mt-4">
            <RbacTable
              title="ClusterRole"
              rows={q.data.clusterRoles}
              columns={[
                { key: "name", header: "名称" },
                { key: "rulesCount", header: "规则数" },
                { key: "age", header: "Age" },
              ]}
              rowKey={(r) => r.name}
              cell={(r, col) => {
                if (col.key === "age") return parseAge(r.age);
                if (col.key === "rulesCount") return String(r.rulesCount);
                return r.name;
              }}
            />
          </TabsContent>
          <TabsContent value="crb" className="mt-4">
            <RbacTable
              title="ClusterRoleBinding"
              rows={q.data.clusterRoleBindings}
              columns={[
                { key: "name", header: "名称" },
                { key: "roleRef", header: "RoleRef" },
                { key: "subjects", header: "Subjects" },
                { key: "age", header: "Age" },
              ]}
              rowKey={(r) => r.name}
              cell={(r, col) => {
                if (col.key === "age") return parseAge(r.age);
                return String((r as Record<string, unknown>)[col.key] ?? "—");
              }}
            />
          </TabsContent>
          <TabsContent value="r" className="mt-4">
            <RbacTable
              title="Role"
              rows={q.data.roles}
              columns={[
                { key: "namespace", header: "Namespace" },
                { key: "name", header: "名称" },
                { key: "rulesCount", header: "规则数" },
                { key: "age", header: "Age" },
              ]}
              rowKey={(r) => `${r.namespace}/${r.name}`}
              cell={(r, col) => {
                if (col.key === "age") return parseAge(r.age);
                if (col.key === "rulesCount") return String(r.rulesCount);
                return String((r as Record<string, unknown>)[col.key] ?? "—");
              }}
            />
          </TabsContent>
          <TabsContent value="rb" className="mt-4">
            <RbacTable
              title="RoleBinding"
              rows={q.data.roleBindings}
              columns={[
                { key: "namespace", header: "Namespace" },
                { key: "name", header: "名称" },
                { key: "roleRef", header: "RoleRef" },
                { key: "subjects", header: "Subjects" },
                { key: "age", header: "Age" },
              ]}
              rowKey={(r) => `${r.namespace}/${r.name}`}
              cell={(r, col) => {
                if (col.key === "age") return parseAge(r.age);
                return String((r as Record<string, unknown>)[col.key] ?? "—");
              }}
            />
          </TabsContent>
          <TabsContent value="sa" className="mt-4">
            <RbacTable
              title="ServiceAccount"
              rows={q.data.serviceAccounts ?? []}
              columns={[
                { key: "name", header: "名称" },
                { key: "namespace", header: "Namespace" },
                { key: "age", header: "Age" },
              ]}
              rowKey={(r) => `${r.namespace}/${r.name}`}
              nameHref={(r) => saDetailHref((r as SARow).namespace, (r as SARow).name)}
              cell={(r, col) => {
                if (col.key === "age") return parseAge(r.age);
                return String((r as Record<string, unknown>)[col.key] ?? "—");
              }}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

function RbacTable<T extends Record<string, unknown>>({
  title,
  rows,
  columns,
  rowKey,
  cell,
  nameHref,
}: {
  title: string;
  rows: T[];
  columns: { key: string; header: string }[];
  rowKey: (r: T) => string;
  cell: (r: T, col: { key: string; header: string }) => React.ReactNode;
  /** 仅当首列为 name 时，渲染为指向详情的链接 */
  nameHref?: (r: T) => string | undefined;
}) {
  const nameCol = columns[0]?.key;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white px-4 py-3 sm:px-5">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title} 列表</span>
        <span className="text-xs text-slate-500">共 {rows.length} 条</span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-100 hover:bg-transparent">
              {columns.map((col, i) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    "text-xs font-semibold text-slate-500",
                    i === 0 && nameCol === "name" && "min-w-[200px] pl-5"
                  )}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow
                key={rowKey(row)}
                className={cn(
                  "group border-slate-100 transition-colors hover:bg-blue-50/50",
                  idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                )}
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      "py-3.5 text-sm",
                      col.key === "name" && "pl-5 align-middle"
                    )}
                  >
                    {col.key === "name" ? (
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200/80">
                          <Box className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </span>
                        <span className="min-w-0">
                          {nameHref && nameHref(row) ? (
                            <Link
                              to={nameHref(row)!}
                              className="flex items-center gap-1 font-mono text-[13px] font-semibold text-blue-700 hover:underline"
                            >
                              {cell(row, col)}
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                            </Link>
                          ) : (
                            <span className="flex items-center gap-1 font-mono text-[13px] font-semibold text-slate-900">
                              {cell(row, col)}
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                            </span>
                          )}
                          <span className="mt-0.5 block truncate text-[11px] text-slate-400">metadata.name</span>
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-800">{cell(row, col)}</span>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default ClusterRBAC;
