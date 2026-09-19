import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Pod 模板 spec.template.spec.hostNetwork === true 时在列表/详情展示 */
export function WorkloadHostNetworkBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      title="spec.template.spec.hostNetwork: true"
      className={cn(
        "border-amber-300/90 bg-amber-50 font-mono text-[11px] font-semibold tracking-tight text-amber-950",
        className
      )}
    >
      hostNetwork
    </Badge>
  );
}

export function workloadListHostNetworkCell(row: Record<string, unknown>): React.ReactNode {
  if (row.hostNetwork === true) {
    return <WorkloadHostNetworkBadge />;
  }
  return <span className="text-xs text-slate-400">—</span>;
}
