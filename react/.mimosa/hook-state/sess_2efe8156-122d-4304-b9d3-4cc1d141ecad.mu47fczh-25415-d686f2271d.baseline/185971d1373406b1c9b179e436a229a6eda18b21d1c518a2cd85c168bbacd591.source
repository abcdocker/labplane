import React, { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type HarborBuildHistoryRow = {
  created?: string;
  createdBy?: string;
  emptyLayer?: boolean;
};

function extractBuildHistoryRows(data: unknown): HarborBuildHistoryRow[] | null {
  const asRows = (arr: unknown[]): HarborBuildHistoryRow[] =>
    arr.map((item) => {
      if (!item || typeof item !== "object") return {};
      const r = item as Record<string, unknown>;
      let created: string | undefined;
      if (typeof r.created === "string") created = r.created;
      else if (typeof r.created === "number") created = String(r.created);
      const createdBy = typeof r.created_by === "string" ? r.created_by : undefined;
      const emptyLayer = Boolean(r.empty_layer);
      return { created, createdBy, emptyLayer };
    });

  if (Array.isArray(data)) return asRows(data);
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const k of ["history", "build_history"]) {
      const h = o[k];
      if (Array.isArray(h)) return asRows(h);
    }
  }
  return null;
}

export function HarborBuildHistorySheet(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  subtitle?: string;
  isLoading: boolean;
  error: Error | null;
  data: unknown;
}) {
  const { open, onOpenChange, title, subtitle, isLoading, error, data } = props;
  /** Docker/Harbor 常见顺序为「最新层在前」；按 Dockerfile 阅读习惯改为从底层（FROM）到顶层 */
  const rows = useMemo(() => {
    const r = data !== undefined ? extractBuildHistoryRows(data) : null;
    return r && r.length > 0 ? [...r].reverse() : r;
  }, [data]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="pr-8">镜像打包历史</SheetTitle>
          <SheetDescription className="font-mono text-xs text-slate-600">{title}</SheetDescription>
          {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-6">
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-600" aria-hidden />
              从 Harbor 拉取 build_history…
            </p>
          ) : error ? (
            <p className="text-sm text-red-700">{error.message}</p>
          ) : data === undefined ? (
            <p className="text-sm text-slate-500">无数据</p>
          ) : rows && rows.length > 0 ? (
            <div className="max-h-[min(70vh,560px)] overflow-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full border-collapse text-left text-[11px] text-slate-800">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95">
                  <tr>
                    <th className="w-10 px-2 py-2 font-semibold text-slate-600">#</th>
                    <th className="px-2 py-2 font-semibold text-slate-600">创建时间</th>
                    <th className="px-2 py-2 font-semibold text-slate-600">指令 / 说明</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-100 align-top">
                      <td className="px-2 py-2 tabular-nums text-slate-400">{i + 1}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-slate-600">{row.created ?? "—"}</td>
                      <td className="px-2 py-2 font-mono text-[10px] leading-relaxed break-all text-slate-800">
                        {row.emptyLayer ? (
                          <span className="text-slate-400">（空层）</span>
                        ) : (
                          row.createdBy ?? "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <pre className="max-h-[min(70vh,560px)] overflow-auto rounded-xl border border-slate-200 bg-slate-50/80 p-3 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-all text-slate-800">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
