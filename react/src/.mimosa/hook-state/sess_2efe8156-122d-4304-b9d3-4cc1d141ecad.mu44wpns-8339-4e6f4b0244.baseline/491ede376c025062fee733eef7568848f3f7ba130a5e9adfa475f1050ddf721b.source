import { cn } from "@/lib/utils";

export function podPhaseBadgeClass(phase: string) {
  const p = phase.toLowerCase();
  if (p === "running")
    return cn(
      "border-emerald-200/80 bg-emerald-50 text-emerald-900 shadow-none",
    );
  if (p === "pending")
    return cn("border-amber-200/80 bg-amber-50 text-amber-950 shadow-none");
  if (p === "failed" || p === "unknown")
    return cn("border-red-200/80 bg-red-50 text-red-900 shadow-none");
  if (p === "succeeded" || p === "completed")
    return cn("border-sky-200/80 bg-sky-50 text-sky-950 shadow-none");
  return cn("border-slate-200/80 bg-slate-50 text-slate-800 shadow-none");
}

export function podDetailHref(namespace: string, name: string) {
  return `/cluster/ns/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}`;
}
