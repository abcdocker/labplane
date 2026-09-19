import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function TechBadge({
  name = "Tech",
  version = "v1.0",
  color = "#326de6",
  floatClass = "login-float-0",
  glowClass = "login-shadow-glow-k8s",
  children = null,
}: {
  name?: string;
  version?: string;
  color?: string;
  floatClass?: string;
  glowClass?: string;
  children?: ReactNode;
}) {
  return (
    <div
      data-cmp="TechBadge"
      className={cn(
        "flex shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-slate-50/80 p-3 sm:gap-2 sm:p-5",
        floatClass,
        glowClass
      )}
      style={{
        borderColor: `${color}33`,
        background: `linear-gradient(140deg, rgb(255 255 255) 55%, ${color}12 100%)`,
      }}
    >
      <div className="flex h-12 w-12 items-center justify-center sm:h-16 sm:w-16 [&>svg]:max-h-full [&>svg]:max-w-full">
        {children}
      </div>
      <span className="max-w-[5.5rem] truncate text-center text-xs font-semibold tracking-wide sm:max-w-none sm:text-sm" style={{ color }}>
        {name}
      </span>
      <span className="font-mono text-[10px] opacity-80 sm:text-xs" style={{ color }}>
        {version}
      </span>
    </div>
  );
}
