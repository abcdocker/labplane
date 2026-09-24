"use client";

import React, { useCallback, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { getStoredGuideOpen, setStoredGuideOpen } from "@/lib/guide-storage";

const VARIANT_ROOT: Record<string, string> = {
  amber:
    "rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 to-orange-50/40 px-4 py-3 text-[12px] leading-relaxed text-amber-950 shadow-sm",
  amberSoft:
    "rounded-lg border border-amber-200/90 bg-amber-50/95 p-3 text-[11px] leading-relaxed text-amber-950 shadow-sm",
  indigo: "rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 text-sm text-slate-800",
  sky: "rounded-lg border border-sky-200 bg-sky-50/90 px-3 py-2.5 text-xs leading-relaxed text-sky-950",
  skyCompact:
    "rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 to-indigo-50/50 px-3 py-2 text-[11px] leading-snug text-sky-950",
  slate:
    "rounded-lg border border-slate-300/90 bg-slate-50/95 p-3 text-[11px] leading-relaxed text-slate-900 shadow-sm",
  violet:
    "rounded-lg border border-violet-300/80 bg-violet-100/50 p-3 text-[11px] leading-relaxed text-violet-950 shadow-sm",
  muted: "rounded-lg border border-slate-200/90 bg-slate-50/90 px-3 py-2 text-[11px] leading-relaxed text-slate-700",
  skyInline: "mb-3 rounded-md border border-sky-200/70 bg-white/50 p-2 text-sm text-slate-800",
};

export type CollapsibleManualVariant = keyof typeof VARIANT_ROOT;

export type CollapsibleManualProps = {
  storageKey: string;
  title: string;
  /** 无缓存时是否展开（默认 true） */
  defaultOpen?: boolean;
  variant: CollapsibleManualVariant;
  className?: string;
  titleClassName?: string;
  triggerClassName?: string;
  children: React.ReactNode;
};

export function CollapsibleManual({
  storageKey,
  title,
  defaultOpen = true,
  variant,
  className,
  titleClassName,
  triggerClassName,
  children,
}: CollapsibleManualProps) {
  const [open, setOpen] = useState(() => {
    const s = getStoredGuideOpen(storageKey);
    return s !== undefined ? s : defaultOpen;
  });

  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      setStoredGuideOpen(storageKey, next);
    },
    [storageKey]
  );

  const root = VARIANT_ROOT[variant] ?? VARIANT_ROOT.amber;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className={cn(root, className)}>
      <CollapsibleTrigger
        type="button"
        className={cn(
          "flex w-full items-center gap-2 rounded-md py-0.5 text-left outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-sky-400/50",
          variant === "skyInline" && "text-xs font-semibold text-slate-800",
          triggerClassName
        )}
      >
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 opacity-80 transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
        <span className={cn("min-w-0 flex-1 font-semibold", titleClassName)}>{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}
