import React, { useMemo } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";

type Props = {
  /** 原始 JSON 字符串；会尝试格式化 */
  raw: string;
  title?: string;
  className?: string;
};

function tryFormatJson(s: string): string {
  const t = s.trim();
  if (!t) return "";
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return s;
  }
}

/** JSON 语法高亮 + 一键复制 */
export function JsonSnippetWithCopy({ raw, title, className }: Props) {
  const formatted = useMemo(() => tryFormatJson(raw), [raw]);
  const onCopy = () => {
    if (!formatted.trim()) {
      toast.error("没有可复制的内容");
      return;
    }
    void navigator.clipboard.writeText(formatted).then(
      () => toast.success("已复制 JSON"),
      () => toast.error("复制失败")
    );
  };
  if (!formatted.trim()) return null;
  return (
    <div className={className ?? "rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800"}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/90 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/50">
        {title ? <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{title}</span> : <span />}
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          复制 JSON
        </Button>
      </div>
      <SyntaxHighlighter
        language="json"
        style={oneDark}
        showLineNumbers={false}
        wrapLongLines
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          maxHeight: "min(320px, 40vh)",
          fontSize: "11px",
          padding: "0.75rem",
        }}
      >
        {formatted}
      </SyntaxHighlighter>
    </div>
  );
}
