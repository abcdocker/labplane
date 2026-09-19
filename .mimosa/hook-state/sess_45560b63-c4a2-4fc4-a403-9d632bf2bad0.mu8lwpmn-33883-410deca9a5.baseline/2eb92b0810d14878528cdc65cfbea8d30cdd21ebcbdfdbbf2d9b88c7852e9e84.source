import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type PodTemplatePortRow = {
  container: string;
  port: number;
  protocol: string;
  portName?: string;
  hostPort?: number;
  initContainer?: boolean;
};

export function parsePodTemplatePorts(raw: unknown): PodTemplatePortRow[] {
  if (!Array.isArray(raw)) return [];
  const out: PodTemplatePortRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const container = typeof o.container === "string" ? o.container : "";
    const pr = o.port;
    const port = typeof pr === "number" && Number.isFinite(pr) ? pr : parseInt(String(pr ?? ""), 10);
    if (!container || !Number.isFinite(port) || port < 1 || port > 65535) continue;
    const protoRaw = typeof o.protocol === "string" && o.protocol.trim() ? o.protocol.trim() : "TCP";
    const portName = typeof o.portName === "string" && o.portName.trim() ? o.portName.trim() : undefined;
    const hp = o.hostPort;
    let hostPort: number | undefined;
    if (typeof hp === "number" && hp > 0 && hp <= 65535) hostPort = hp;
    else if (hp != null) {
      const n = parseInt(String(hp), 10);
      if (Number.isFinite(n) && n > 0 && n <= 65535) hostPort = n;
    }
    out.push({
      container,
      port,
      protocol: protoRaw.toUpperCase(),
      portName,
      hostPort,
      initContainer: o.initContainer === true,
    });
  }
  return out;
}

/** 列表单元格摘要，过长截断 */
export function formatPodTemplatePortsPreview(rows: PodTemplatePortRow[], maxItems = 5): string {
  if (rows.length === 0) return "";
  const parts = rows.slice(0, maxItems).map((r) => {
    const base = `${r.port}/${r.protocol}`;
    if (r.hostPort != null && r.hostPort > 0) return `${base}(host:${r.hostPort})`;
    return base;
  });
  const more = rows.length > maxItems ? ` +${rows.length - maxItems}` : "";
  return parts.join(", ") + more;
}

type Props = {
  rows: PodTemplatePortRow[];
  hostNetwork: boolean;
};

export function WorkloadPodTemplatePortsTable({ rows, hostNetwork }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        当前 Pod 模板未声明 <span className="font-mono">containers[].ports</span>，无法在此列出端口；可在「编辑 YAML」中为容器添加{" "}
        <span className="font-mono">containerPort</span>。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-200 hover:bg-transparent">
              <TableHead className="w-[72px] text-xs font-semibold text-slate-600">类型</TableHead>
              <TableHead className="text-xs font-semibold text-slate-600">容器</TableHead>
              <TableHead className="text-xs font-semibold text-slate-600">端口名</TableHead>
              <TableHead className="text-xs font-semibold text-slate-600">containerPort</TableHead>
              <TableHead className="text-xs font-semibold text-slate-600">hostPort</TableHead>
              <TableHead className="text-xs font-semibold text-slate-600">协议</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={`${r.container}-${r.port}-${r.protocol}-${i}`} className="border-slate-100">
                <TableCell className="font-mono text-[11px] text-slate-600">
                  {r.initContainer ? "init" : "工作"}
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-900">{r.container}</TableCell>
                <TableCell className="font-mono text-xs text-slate-700">{r.portName ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs tabular-nums text-slate-900">{r.port}</TableCell>
                <TableCell className="font-mono text-xs tabular-nums text-slate-700">
                  {r.hostPort != null && r.hostPort > 0 ? r.hostPort : "—"}
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-700">{r.protocol}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {hostNetwork ? (
        <p className="text-[12px] leading-relaxed text-amber-950/90">
          <span className="font-semibold">hostNetwork</span> 已开启：进程监听在节点网络命名空间。一般使用{" "}
          <span className="font-mono">节点 IP : containerPort</span> 访问（与上表「containerPort」列一致）。若显式配置了
          non-zero 的 <span className="font-mono">hostPort</span>，则同时监听{" "}
          <span className="font-mono">节点 IP : hostPort</span>。
        </p>
      ) : (
        <p className="text-[12px] leading-relaxed text-slate-600">
          未开启 hostNetwork 时，集群内通常通过 <span className="font-mono">Service.spec.ports[].targetPort</span> 对齐上表的
          端口名或容器端口；对集群外暴露需 NodePort / LoadBalancer / Ingress 等。
        </p>
      )}
    </div>
  );
}
