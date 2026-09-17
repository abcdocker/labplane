import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGetJson } from "@/lib/api";
import { cn } from "@/lib/utils";

export type K8sRelationKind =
  | "Deployment"
  | "StatefulSet"
  | "DaemonSet"
  | "Service"
  | "Ingress"
  | "Pod"
  | "ConfigMap"
  | "Secret";

export type K8sMatchingServicePortRow = {
  name?: string;
  port: number;
  targetPort: string;
  protocol: string;
  nodePort?: number;
};

export type K8sMatchingServicePortSummary = {
  serviceName: string;
  serviceType: string;
  clusterIP?: string;
  ports: K8sMatchingServicePortRow[];
};

export type K8sRelationsPayload = {
  services?: string[];
  ingresses?: string[];
  deployments?: string[];
  statefulSets?: string[];
  daemonSets?: string[];
  pods?: string[];
  configMaps?: string[];
  secrets?: string[];
  /** Deployment / StatefulSet：selector 匹配的 Service 及 port → targetPort */
  matchingServicePorts?: K8sMatchingServicePortSummary[];
};

type K8sRelationsCardProps = {
  namespace: string;
  kind: K8sRelationKind;
  name: string;
};

function RelationBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50/90 to-white px-1 py-1">
      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {title}
      </p>
      <div className="flex flex-col gap-px rounded-lg bg-slate-100/80 p-px">{children}</div>
    </div>
  );
}

function RelationRow({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className={cn(
        "group flex min-h-[40px] items-center justify-between gap-3 rounded-md bg-white px-3 py-2",
        "text-sm transition-colors hover:bg-slate-50"
      )}
    >
      <span className="min-w-0 truncate font-mono text-[13px] text-slate-800 group-hover:text-blue-800">
        {label}
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500"
        aria-hidden
      />
    </Link>
  );
}

function RelationRows({ items, to }: { items: string[]; to: (n: string) => string }) {
  if (!items.length) return null;
  return (
    <>
      {items.map((n) => (
        <RelationRow key={n} to={to(n)} label={n} />
      ))}
    </>
  );
}

/** DaemonSet 无详情页：整行跳转列表 */
function normalizeMatchingPortRows(raw: K8sMatchingServicePortSummary[]): K8sMatchingServicePortSummary[] {
  return raw.map((svc) => ({
    ...svc,
    ports: (svc.ports ?? []).map((p) => {
      const port = typeof p.port === "number" && Number.isFinite(p.port) ? p.port : Number(p.port);
      const np = p.nodePort;
      const nodePort =
        typeof np === "number" && np > 0 && Number.isFinite(np) ? np : undefined;
      return {
        name: p.name,
        port,
        targetPort: String(p.targetPort ?? ""),
        protocol: typeof p.protocol === "string" && p.protocol ? p.protocol : "TCP",
        nodePort,
      };
    }),
  }));
}

function MatchingServicePortsSection({
  namespace,
  items,
}: {
  namespace: string;
  items: K8sMatchingServicePortSummary[];
}) {
  const base = `/cluster/ns/${encodeURIComponent(namespace)}`;
  if (items.length === 0) return null;
  const norm = normalizeMatchingPortRows(items);
  return (
    <div className="space-y-4 rounded-xl border border-blue-200/70 bg-blue-50/35 p-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Service 端口映射
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          这些 Service 的 <span className="font-mono">spec.selector</span> 与当前工作负载的 Pod 模板 labels 一致。
          <span className="font-mono">targetPort</span> 应与「Pod 模板端口」中的端口名或 containerPort 对应；NodePort /
          LoadBalancer 时可通过节点 IP + nodePort 访问。
        </p>
      </div>
      {norm.map((svc) => (
        <div key={svc.serviceName} className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <Link
              to={`${base}/services/${encodeURIComponent(svc.serviceName)}`}
              className="font-mono text-sm font-semibold text-blue-700 hover:underline"
            >
              {svc.serviceName}
            </Link>
            <span className="text-xs text-slate-500">{svc.serviceType}</span>
            {svc.clusterIP && svc.clusterIP !== "None" ? (
              <span className="font-mono text-[11px] text-slate-600">ClusterIP {svc.clusterIP}</span>
            ) : null}
          </div>
          {svc.ports.length === 0 ? (
            <p className="text-xs text-slate-500">无 <span className="font-mono">spec.ports</span>（如 ExternalName 或未声明端口）。</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="text-xs font-semibold text-slate-600">端口名</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">port</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">targetPort</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">nodePort</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-600">协议</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {svc.ports.map((p, i) => (
                    <TableRow key={`${svc.serviceName}-${p.port}-${i}`} className="border-slate-100">
                      <TableCell className="font-mono text-xs text-slate-800">{p.name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs tabular-nums text-slate-900">{p.port}</TableCell>
                      <TableCell className="font-mono text-xs text-blue-800">{p.targetPort || "—"}</TableCell>
                      <TableCell className="font-mono text-xs tabular-nums text-slate-700">
                        {p.nodePort != null && p.nodePort > 0 ? p.nodePort : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-700">{p.protocol}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export const K8sRelationsCard: React.FC<K8sRelationsCardProps> = ({ namespace, kind, name }) => {
  const base = `/cluster/ns/${encodeURIComponent(namespace)}`;
  const q = useQuery({
    queryKey: ["k8s-resource-relations", namespace, kind, name],
    queryFn: ({ signal }) =>
      apiGetJson<K8sRelationsPayload>(
        `/api/k8s/resource-relations?namespace=${encodeURIComponent(namespace)}&kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}`
      , { signal }),
    enabled: Boolean(namespace && name),
  });

  const filterSelf = (xs: string[] | undefined, self: string) =>
    (xs ?? []).filter((x) => x !== self);

  if (q.isLoading) {
    return (
      <Card className="border-slate-200/90 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-600">关联资源</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          分析同命名空间内资源关联…
        </CardContent>
      </Card>
    );
  }

  if (q.isError) {
    return (
      <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-amber-900">关联资源</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-900">{(q.error as Error).message}</CardContent>
      </Card>
    );
  }

  const d = q.data;
  if (!d) return null;

  const svcItems = kind === "Service" ? filterSelf(d.services, name) : (d.services ?? []);
  const ingItems = kind === "Ingress" ? filterSelf(d.ingresses, name) : (d.ingresses ?? []);
  const depItems = kind === "Deployment" ? filterSelf(d.deployments, name) : (d.deployments ?? []);
  const stsItems = kind === "StatefulSet" ? filterSelf(d.statefulSets, name) : (d.statefulSets ?? []);
  const podItems = kind === "Pod" ? filterSelf(d.pods, name) : (d.pods ?? []);
  const cmItems = kind === "ConfigMap" ? filterSelf(d.configMaps, name) : (d.configMaps ?? []);
  const secItems = kind === "Secret" ? filterSelf(d.secrets, name) : (d.secrets ?? []);

  const daemonItems = kind === "DaemonSet" ? filterSelf(d.daemonSets, name) : (d.daemonSets ?? []);

  const hasAny =
    svcItems.length +
      ingItems.length +
      depItems.length +
      stsItems.length +
      daemonItems.length +
      podItems.length +
      cmItems.length +
      secItems.length >
    0;

  return (
    <Card className="border-slate-200/90 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-600">关联资源</CardTitle>
        <p className="text-xs text-slate-500">
          根据 selector、Ingress 后端、卷与环境变量引用等推断；点击下方行跳转到对应资源。
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {(kind === "Deployment" || kind === "StatefulSet" || kind === "DaemonSet") &&
        d.matchingServicePorts &&
        d.matchingServicePorts.length > 0 ? (
          <MatchingServicePortsSection namespace={namespace} items={d.matchingServicePorts} />
        ) : null}

        {!hasAny ? (
          <p className="text-sm text-slate-500">未发现可关联的 Service / Ingress / 工作负载 / Pod / 配置等。</p>
        ) : null}

        {svcItems.length ? (
          <RelationBlock title="Service">
            <RelationRows items={svcItems} to={(n) => `${base}/services/${encodeURIComponent(n)}`} />
          </RelationBlock>
        ) : null}
        {ingItems.length ? (
          <RelationBlock title="Ingress">
            <RelationRows items={ingItems} to={(n) => `${base}/ingresses/${encodeURIComponent(n)}`} />
          </RelationBlock>
        ) : null}
        {depItems.length ? (
          <RelationBlock title="Deployment">
            <RelationRows items={depItems} to={(n) => `${base}/deployments/${encodeURIComponent(n)}`} />
          </RelationBlock>
        ) : null}
        {stsItems.length ? (
          <RelationBlock title="StatefulSet">
            <RelationRows items={stsItems} to={(n) => `${base}/statefulsets/${encodeURIComponent(n)}`} />
          </RelationBlock>
        ) : null}
        {daemonItems.length ? (
          <RelationBlock title="DaemonSet">
            <RelationRows
              items={daemonItems}
              to={(n) => `${base}/daemonsets/${encodeURIComponent(n)}`}
            />
          </RelationBlock>
        ) : null}
        {podItems.length ? (
          <RelationBlock title="Pod">
            <RelationRows items={podItems} to={(n) => `${base}/pods/${encodeURIComponent(n)}`} />
          </RelationBlock>
        ) : null}
        {cmItems.length ? (
          <RelationBlock title="ConfigMap">
            <RelationRows items={cmItems} to={(n) => `${base}/configmaps/${encodeURIComponent(n)}`} />
          </RelationBlock>
        ) : null}
        {secItems.length ? (
          <RelationBlock title="Secret">
            <RelationRows items={secItems} to={(n) => `${base}/secrets/${encodeURIComponent(n)}`} />
          </RelationBlock>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default K8sRelationsCard;
