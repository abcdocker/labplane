import React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Box } from "lucide-react";
import { ApiHttpError, apiGetJson } from "@/lib/api";
import { parseAge } from "./parseAge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BindingRow = {
  name: string;
  namespace?: string;
  roleRef: string;
  subjects: string;
};

type TokenSecretRow = {
  name: string;
  hasToken: boolean;
  age?: string;
};

type SADetail = {
  serviceAccount: {
    namespace: string;
    name: string;
    uid?: string;
    createdAt?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  clusterRoleBindings: BindingRow[];
  roleBindings: BindingRow[];
  tokenSecrets: TokenSecretRow[];
};

const ClusterRBACServiceAccountDetail: React.FC = () => {
  const { namespace = "", name = "" } = useParams<{ namespace: string; name: string }>();
  const path = `/api/k8s/rbac/service-accounts/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;

  const q = useQuery({
    queryKey: ["k8s-rbac-sa-detail", namespace, name],
    queryFn: ({ signal }) => apiGetJson<SADetail>(path, { signal }),
    enabled: Boolean(namespace && name),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <Link to="/cluster/rbac">
            <ArrowLeft className="h-4 w-4" />
            返回 RBAC
          </Link>
        </Button>
      </div>

      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">ServiceAccount 详情</h2>
        <p className="mt-1 font-mono text-sm text-slate-600">
          {namespace}/{name}
        </p>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          展示关联的 ClusterRoleBinding / RoleBinding，以及指向该账号的{" "}
          <span className="font-mono text-xs">kubernetes.io/service-account-token</span> 类 Secret 元数据（不含
          token 明文）。
        </p>
      </div>

      {q.isLoading && <p className="text-sm text-slate-500">加载中…</p>}
      {q.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {q.error instanceof ApiHttpError ? q.error.serverMessage : (q.error as Error).message}
        </div>
      )}

      {q.data?.serviceAccount && (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200/80">
                <Box className="h-5 w-5" />
              </span>
              <div className="min-w-0 space-y-1 text-sm">
                <p>
                  <span className="text-slate-500">UID</span>{" "}
                  <span className="font-mono text-xs text-slate-800">{q.data.serviceAccount.uid ?? "—"}</span>
                </p>
                <p>
                  <span className="text-slate-500">创建时间</span>{" "}
                  <span className="text-slate-800">
                    {q.data.serviceAccount.createdAt
                      ? parseAge(q.data.serviceAccount.createdAt)
                      : "—"}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <DetailTable title="ClusterRoleBinding" rows={q.data.clusterRoleBindings} nsCol={false} />
          <DetailTable title="RoleBinding（同命名空间）" rows={q.data.roleBindings} nsCol />
          <TokenSecretTable rows={q.data.tokenSecrets ?? []} />
        </>
      )}
    </div>
  );
};

function DetailTable({
  title,
  rows,
  nsCol,
}: {
  title: string;
  rows: BindingRow[];
  nsCol: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}（{rows.length}）
        </span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {nsCol ? <TableHead className="text-xs">Namespace</TableHead> : null}
              <TableHead className="text-xs">名称</TableHead>
              <TableHead className="text-xs">RoleRef</TableHead>
              <TableHead className="text-xs">Subjects</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={nsCol ? 4 : 3} className="text-sm text-slate-500">
                  无
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={(r.namespace ?? "") + "/" + r.name}>
                  {nsCol ? (
                    <TableCell className="font-mono text-xs">{r.namespace ?? "—"}</TableCell>
                  ) : null}
                  <TableCell className="font-mono text-xs font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs text-slate-700">{r.roleRef}</TableCell>
                  <TableCell className="max-w-md truncate text-xs text-slate-600" title={r.subjects}>
                    {r.subjects}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function TokenSecretTable({ rows }: { rows: TokenSecretRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Token 类 Secret（{rows.length}）
        </span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">名称</TableHead>
              <TableHead className="text-xs">已下发 token</TableHead>
              <TableHead className="text-xs">Age</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-sm text-slate-500">
                  未发现带注解的 service-account-token Secret
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-mono text-xs font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs">{r.hasToken ? "是" : "否"}</TableCell>
                  <TableCell className="text-xs text-slate-600">{r.age ? parseAge(r.age) : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default ClusterRBACServiceAccountDetail;
