import React from "react";
import { cn } from "@/lib/utils";

/** 文档子域容器：与平台侧栏 violet/slate 一致，不改动全局主题 */
export function DocsVaultShell({
  children,
  className,
  flush,
  ...rest
}: React.ComponentProps<"div"> & {
  /** 编辑器全宽时可去掉外层圆角内边距，由子组件自控 */
  flush?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-h-0 text-slate-900 antialiased",
        !flush &&
          "rounded-xl border border-slate-200/90 bg-slate-50/40 p-4 shadow-sm sm:p-6",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
