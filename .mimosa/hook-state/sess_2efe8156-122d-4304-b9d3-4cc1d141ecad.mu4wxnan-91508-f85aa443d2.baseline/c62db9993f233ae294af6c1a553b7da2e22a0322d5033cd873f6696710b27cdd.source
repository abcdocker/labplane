import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** 与 Harbor 列表表格统一的表头/行悬停样式（挂在 Table 上） */
export const harborTableShellClass =
  "[&_thead_tr]:border-b [&_thead_tr]:border-slate-200/90 [&_thead_tr]:bg-gradient-to-r [&_thead_tr]:from-slate-50 [&_thead_tr]:to-cyan-50/25 [&_thead_th]:text-xs [&_thead_th]:font-semibold [&_thead_th]:uppercase [&_thead_th]:tracking-wide [&_thead_th]:text-slate-600 [&_tbody_tr]:border-b [&_tbody_tr]:border-slate-100/80 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-cyan-50/25";

export type HarborCrumb = { label: string; to?: string };

/** 项目列表（/cluster/harbor）：集群 → 当前在 Harbor */
export function harborBreadcrumbItemsIndex(): HarborCrumb[] {
  return [
    { label: "集群", to: "/cluster" },
    { label: "Harbor 镜像仓库" },
  ];
}

/** 子页共用前缀：集群 → Harbor（可点回项目列表） */
export function harborBreadcrumbItemsFromHome(): HarborCrumb[] {
  return [
    { label: "集群", to: "/cluster" },
    { label: "Harbor 镜像仓库", to: "/cluster/harbor" },
  ];
}

export function HarborBreadcrumb({ items }: { items: HarborCrumb[] }) {
  return (
    <nav
      className="flex flex-wrap items-center gap-1 rounded-2xl border border-cyan-200/50 bg-gradient-to-r from-cyan-50/40 via-white to-sky-50/30 px-3 py-2.5 shadow-sm"
      aria-label="面包屑"
    >
      {items.map((it, i) => (
        <React.Fragment key={`${it.label}-${i}`}>
          {i > 0 ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden />
          ) : null}
          {it.to ? (
            <Link
              to={it.to}
              className="rounded-md px-1.5 py-0.5 text-sm font-medium text-cyan-800 transition hover:bg-cyan-100/80 hover:text-cyan-950"
            >
              {it.label}
            </Link>
          ) : (
            <span className="font-mono text-sm font-semibold tracking-tight text-slate-900">{it.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function HarborToolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function HarborPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200/90 bg-white shadow-sm", className)}>{children}</div>
  );
}

export function HarborTableWrap({ children }: { children: React.ReactNode }) {
  return (
    <HarborPanel className="overflow-hidden p-0">
      <div className="overflow-x-auto">{children}</div>
    </HarborPanel>
  );
}

export function HarborLoading({ children }: { children: React.ReactNode }) {
  return (
    <HarborPanel className="flex items-center gap-2 px-4 py-8 text-sm text-slate-600">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-600" aria-hidden />
      {children}
    </HarborPanel>
  );
}

export function HarborEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-14 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}
