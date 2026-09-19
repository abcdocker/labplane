import React from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

/** 侧栏气泡内 Markdown：与巡检报告同源（GFM + 代码块），配色适配浅底助手气泡 */
const bubbleMdClass =
  "openclaw-chat-md max-w-none text-[13px] leading-relaxed text-slate-800 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-slate-900 [&_h1]:first:mt-0 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-900 [&_ul]:my-2 [&_ul]:list-inside [&_ul]:list-disc [&_ol]:my-2 [&_ol]:list-inside [&_ol]:list-decimal [&_li]:my-0.5 [&_p]:my-2 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_hr]:my-3 [&_a]:break-all [&_a]:text-violet-700 [&_a]:underline [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-xs [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_td]:text-xs";

function prismLanguage(className: string | undefined): string {
  const m = /language-([\w-]+)/.exec(className ?? "");
  const raw = (m?.[1] ?? "plaintext").toLowerCase();
  if (raw === "text" || raw === "txt" || raw === "log" || raw === "plain") return "plaintext";
  return raw;
}

const bubbleMarkdownComponents: Partial<Components> = {
  pre({ children }) {
    return <>{children}</>;
  },
  code({ className, children }) {
    const text = String(children ?? "").replace(/\n$/, "");
    const fenced = Boolean(className?.includes("language-"));
    const multiline = text.includes("\n");
    if (!fenced && !multiline) {
      return (
        <code className="rounded bg-slate-200/90 px-1 py-0.5 font-mono text-[12px] text-slate-900">{children}</code>
      );
    }
    const lang = prismLanguage(className);
    return (
      <SyntaxHighlighter
        language={lang}
        style={oneDark}
        showLineNumbers={false}
        wrapLongLines
        PreTag="div"
        codeTagProps={{
          className: "!font-mono !text-[11px] !leading-relaxed !whitespace-pre-wrap !break-words [overflow-wrap:anywhere]",
          style: { textShadow: "none", whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere" },
        }}
        customStyle={{
          margin: "0.5rem 0",
          borderRadius: "0.5rem",
          maxHeight: "min(360px, 45vh)",
          overflow: "auto",
          fontSize: "11px",
          lineHeight: 1.55,
          padding: "0.65rem 0.75rem",
          background: "#282c34",
          border: "1px solid rgb(51 65 85 / 0.45)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
        }}
      >
        {text}
      </SyntaxHighlighter>
    );
  },
};

export function OpenClawChatMarkdown({ source }: { source: string }) {
  return (
    <div className={bubbleMdClass}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={bubbleMarkdownComponents}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
