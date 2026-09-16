import React from "react";
import type { ServicePortEntry } from "./types";

const PREVIEW_MAX = 2;

/** 将 API 中 portEntries 规范为强类型（兼容旧数据无此字段） */
export function normalizePortEntries(raw: unknown): ServicePortEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ServicePortEntry[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const name = String(o.name ?? "");
    const port = typeof o.port === "number" ? o.port : Number(o.port);
    if (!Number.isFinite(port)) continue;
    const np = o.nodePort;
    const nodePort =
      typeof np === "number" && np > 0 ? np : typeof np === "string" && Number(np) > 0 ? Number(np) : undefined;
    out.push({
      name,
      port,
      protocol: String(o.protocol ?? "TCP"),
      target: String(o.target ?? ""),
      nodePort,
    });
  }
  return out;
}

/** 列表列：最多展示 PREVIEW_MAX 条，超出用 …（完整信息在 Service 详情） */
export function servicePortsPreview(
  entries: ServicePortEntry[],
  legacyPorts: string[]
): { text: string; truncated: boolean } {
  if (entries.length > 0) {
    const parts = entries.slice(0, PREVIEW_MAX).map((e) => {
      let s = `${e.port}→${e.target || String(e.port)}`;
      if (e.nodePort) s += ` · 节点 ${e.nodePort}`;
      return s;
    });
    const truncated = entries.length > PREVIEW_MAX;
    return { text: parts.join("；") + (truncated ? " …" : ""), truncated };
  }
  const p = legacyPorts.slice(0, PREVIEW_MAX).join("；");
  const truncated = legacyPorts.length > PREVIEW_MAX;
  return { text: (p || "—") + (truncated ? " …" : ""), truncated };
}

export function ServicePortsDetailTable({ entries }: { entries: ServicePortEntry[] }) {
  if (!entries.length) {
    return <p className="text-sm text-slate-500">—</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-sm">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3 font-semibold">名称</th>
            <th className="px-4 py-3 font-semibold tabular-nums">Service 端口</th>
            <th className="px-4 py-3 font-semibold">协议</th>
            <th className="px-4 py-3 font-semibold tabular-nums">容器端口</th>
            <th className="px-4 py-3 font-semibold tabular-nums">NodePort</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((e) => (
            <tr key={`${e.name}-${e.port}-${e.protocol}`} className="transition-colors hover:bg-slate-50/80">
              <td className="px-4 py-3 font-mono text-xs text-slate-900">{e.name}</td>
              <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-900">{e.port}</td>
              <td className="px-4 py-3 text-xs text-slate-600">{e.protocol}</td>
              <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-900">{e.target}</td>
              <td className="px-4 py-3 font-mono text-xs tabular-nums text-slate-900">
                {e.nodePort != null && e.nodePort > 0 ? (
                  e.nodePort
                ) : (
                  <span className="font-sans text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
