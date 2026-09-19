import React from "react";
import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

export type BastionTerminalSessionStatus = "idle" | "connecting" | "open" | "closed" | "error";

/** 会话标签上的小圆点（与 Next 类运维台「连接状态」示意一致） */
export function bastionTabStatusDotClass(s: BastionTerminalSessionStatus): string {
  switch (s) {
    case "open":
      return "bg-[#52c41a] shadow-[0_0_6px_rgba(82,196,26,0.45)]";
    case "connecting":
      return "bg-[#faad14] animate-pulse";
    case "error":
      return "bg-[#f5222d]";
    case "closed":
      return "bg-[#6e7681]";
    default:
      return "bg-[#484f58]";
  }
}

export type BastionTerminalChromeProps = {
  /** 会话标题（如虚拟机名） */
  title: string;
  /** 副标题，多为 IP / 地址 */
  subtitle?: string;
  protocol?: string;
  status: BastionTerminalSessionStatus;
  errMsg?: string | null;
  className?: string;
  children: React.ReactNode;
  /**
   * default：独立顶栏（协议、标题、状态）
   * workbench：仅错误条 + 满幅终端（会话信息在上方标签栏展示，贴近常见运维台布局）
   */
  variant?: "default" | "workbench";
};

function statusLabel(s: BastionTerminalSessionStatus): string {
  switch (s) {
    case "idle":
      return "未连接";
    case "connecting":
      return "连接中";
    case "open":
      return "已连接";
    case "closed":
      return "已断开";
    case "error":
      return "异常";
    default:
      return "—";
  }
}

function statusDotClass(s: BastionTerminalSessionStatus): string {
  return bastionTabStatusDotClass(s);
}

/**
 * 运维堡垒终端外框：支持「独立顶栏」与「工作区满幅」两种布局（原创实现）。
 */
const BastionTerminalChrome: React.FC<BastionTerminalChromeProps> = ({
  title,
  subtitle,
  protocol = "SSH",
  status,
  errMsg,
  className,
  children,
  variant = "default",
}) => {
  if (variant === "workbench") {
    return (
      <div
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden border border-[#303030] bg-[#1e1e1e]",
          className,
        )}
      >
        {errMsg ? (
          <div
            className="shrink-0 border-b border-[#f85149]/35 bg-[#3d1a1a] px-2 py-1.5 text-[11px] leading-snug text-[#ffb1af]"
            role="alert"
          >
            {errMsg}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden bg-[#0c0c0c]">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[#303030] bg-[#252526] shadow-sm",
        className,
      )}
    >
      <header className="flex shrink-0 flex-col gap-0 border-b border-[#303030] bg-[#2d2d2d] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded border border-[#1890ff]/45 bg-[#1890ff]/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#69c0ff]">
            <Terminal className="size-3 opacity-90" aria-hidden />
            {protocol}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[#e8e8e8]">{title || "会话"}</div>
            {subtitle ? (
              <div className="truncate font-mono text-[11px] text-[#858585]">{subtitle}</div>
            ) : null}
          </div>
          <div
            className="flex shrink-0 items-center gap-1.5 rounded border border-[#3c3c3c] bg-[#1e1e1e] px-2 py-1"
            title={errMsg || undefined}
          >
            <span className={cn("size-2 shrink-0 rounded-full", statusDotClass(status))} aria-hidden />
            <span className="text-[11px] font-medium text-[#cccccc]">{statusLabel(status)}</span>
          </div>
        </div>
        {errMsg ? (
          <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-[#ffb1af]">{errMsg}</p>
        ) : (
          <p className="mt-1 text-[10px] text-[#858585]">
            交互式终端 · 选中文本后可通过浏览器右键复制。
          </p>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden bg-[#0c0c0c]">{children}</div>
    </div>
  );
};

export default BastionTerminalChrome;
