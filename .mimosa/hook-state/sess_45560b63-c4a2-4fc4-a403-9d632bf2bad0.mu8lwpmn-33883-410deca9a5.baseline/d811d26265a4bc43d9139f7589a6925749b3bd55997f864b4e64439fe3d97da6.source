import React from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { OpenClawChatMarkdown } from "@/components/OpenClawChatMarkdown";

type Props = {
  /** Markdown 正文（GFM + 代码块高亮，与 AI 巡检/助手一致） */
  source: string;
  /** 左侧标题，右侧为复制按钮 */
  title?: string;
  emptyFallback?: string;
  className?: string;
};

/** Markdown 预览 + 一键复制全文（原始 Markdown 文本） */
export function MarkdownWithCopyToolbar({
  source,
  title,
  emptyFallback = "暂无内容",
  className,
}: Props) {
  const text = (source ?? "").trim();
  const onCopy = () => {
    if (!text) {
      toast.error("没有可复制的内容");
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => toast.success("已复制 Markdown 全文"),
      () => toast.error("复制失败，请检查浏览器权限")
    );
  };
  return (
    <div className={className ?? "rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/40"}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/90 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/50">
        {title ? <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{title}</span> : <span />}
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={onCopy} disabled={!text}>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          复制全文
        </Button>
      </div>
      <div className="max-h-[min(70vh,640px)] overflow-y-auto p-3">
        {text ? (
          <OpenClawChatMarkdown source={text} />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">{emptyFallback}</p>
        )}
      </div>
    </div>
  );
}
