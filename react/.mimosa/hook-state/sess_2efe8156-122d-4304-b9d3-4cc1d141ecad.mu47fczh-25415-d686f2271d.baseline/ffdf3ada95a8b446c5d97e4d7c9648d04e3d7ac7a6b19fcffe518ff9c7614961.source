import React from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

export type InspectReportLLMProbe = {
  ok: boolean;
  model?: string;
  message: string;
  detail?: string;
  responsePreview?: string;
  latencyMs?: number;
};

export type InspectReportSection = {
  id: string;
  title: string;
  status: string;
  markdown: string;
};

export type InspectReportFull = {
  id: string;
  createdAt: string;
  summary: string;
  items: { target: string; status: string; detail: string }[];
  aiSummary?: string;
  aiSummaryError?: string;
  aiSummaryErrorDetail?: string;
  sections?: InspectReportSection[];
  llmProbe?: InspectReportLLMProbe;
};

function sectionStatusBadge(status: string) {
  switch (status) {
    case "ok":
      return <Badge className="border-0 bg-emerald-600 font-normal text-white hover:bg-emerald-600">正常</Badge>;
    case "warn":
      return <Badge variant="secondary" className="font-normal text-amber-950">警告</Badge>;
    case "fail":
      return <Badge variant="destructive" className="font-normal">异常</Badge>;
    case "skip":
      return <Badge variant="outline" className="font-normal text-slate-600">跳过</Badge>;
    default:
      return <Badge variant="outline" className="font-normal">{status || "—"}</Badge>;
  }
}

function itemStatusBadge(status: string) {
  return sectionStatusBadge(status);
}

/** 与 opsOpenClawChatAPI / openClawPostDirectChatCompletions 错误前缀一致，便于排障 */
function LlmRoutingLegend() {
  return (
    <p className="text-[11px] leading-relaxed text-slate-700">
      <span className="font-medium">排障说明：</span>
      以「<span className="font-mono">[上游模型接入层·直连 …]</span>」开头的是请求直达模型供应商（K8s Secret 里{" "}
      <code className="rounded bg-black/5 px-0.5">OPENAI_BASE_URL</code>
      ），<strong>不经过</strong> OpenClaw 网关；以「<span className="font-mono">[OpenClaw 网关]</span>」开头的是平台访问您集群内
      OpenClaw 网关 <code className="rounded bg-black/5 px-0.5">/v1/chat/completions</code> 的 HTTP 结果。若两段都出现，通常表示直连与网关转发均未成功，可先按上游状态码（如 529
      过载）查模型侧，再结合网关日志看是否为网关对上游错误的封装（如 500 internal error）。
    </p>
  );
}

/** 勿对 pre 内 code 使用全局 [&_code]，否则会叠上浅底 + 继承浅色字，日志完全看不清。 */
const mdWrapClass =
  "inspect-md max-w-none text-[13px] leading-relaxed text-slate-800 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-900 [&_h3]:first:mt-0 [&_ul]:my-2 [&_ul]:list-inside [&_ul]:list-disc [&_ol]:my-2 [&_li]:my-0.5 [&_p]:my-2 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-1.5 [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1.5";

function prismLanguage(className: string | undefined): string {
  const m = /language-([\w-]+)/.exec(className ?? "");
  const raw = (m?.[1] ?? "plaintext").toLowerCase();
  if (raw === "text" || raw === "txt" || raw === "log" || raw === "plain") return "plaintext";
  return raw;
}

const inspectMarkdownComponents: Partial<Components> = {
  pre({ children }) {
    return <>{children}</>;
  },
  code({ className, children }) {
    const text = String(children ?? "").replace(/\n$/, "");
    const fenced = Boolean(className?.includes("language-"));
    const multiline = text.includes("\n");
    if (!fenced && !multiline) {
      return (
        <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-900">{children}</code>
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
          maxHeight: "min(480px, 55vh)",
          overflow: "auto",
          fontSize: "11px",
          lineHeight: 1.55,
          padding: "0.75rem 0.85rem",
          background: "#282c34",
          border: "1px solid rgb(51 65 85 / 0.5)",
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

function MarkdownBody({ source }: { source: string }) {
  return (
    <div className={mdWrapClass}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={inspectMarkdownComponents}>
        {source}
      </ReactMarkdown>
    </div>
  );
}

export function InspectReportRich({ report }: { report: InspectReportFull }) {
  const sectionIds = report.sections?.map((s) => s.id) ?? [];
  const defaultOpen = sectionIds.length > 0 ? [sectionIds[0]] : [];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="font-mono text-xs text-slate-500">{report.createdAt}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{report.summary}</p>

      {report.aiSummaryError ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50/90 px-3 py-2 text-sm text-red-950">
          <p className="font-medium">模型异常（摘要生成失败）</p>
          <p className="mt-1 text-xs leading-relaxed opacity-95">{report.aiSummaryError}</p>
          {report.aiSummaryErrorDetail ? (
            <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-red-900/80">{report.aiSummaryErrorDetail}</p>
          ) : null}
        </div>
      ) : null}

      {report.llmProbe ? (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            report.llmProbe.ok
              ? "border-emerald-200 bg-emerald-50/80 text-emerald-950"
              : "border-red-200 bg-red-50/90 text-red-950"
          }`}
        >
          <p className="font-medium">{report.llmProbe.ok ? "大模型连通性探针 · 成功" : "连通性探针未通过"}</p>
          <p className="mt-1 text-xs opacity-90">
            {report.llmProbe.model ? `模型 ${report.llmProbe.model} · ` : null}
            {report.llmProbe.latencyMs != null ? `延迟 ${report.llmProbe.latencyMs} ms · ` : null}
            {report.llmProbe.message}
          </p>
          {!report.llmProbe.ok && report.llmProbe.detail ? (
            <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed opacity-80">{report.llmProbe.detail}</p>
          ) : null}
          {report.llmProbe.responsePreview ? (
            <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-black/5 p-2 font-mono text-[11px] text-slate-800">
              {report.llmProbe.responsePreview}
            </pre>
          ) : null}
        </div>
      ) : null}

      {report.aiSummaryError || (report.llmProbe && !report.llmProbe.ok) ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-slate-800">
          <LlmRoutingLegend />
        </div>
      ) : null}

      {report.items?.length ? (
        <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">快速检查项</p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {report.items.map((it, i) => (
              <li key={`${it.target}-${i}`} className="flex flex-wrap items-center gap-2">
                {itemStatusBadge(it.status)}
                <span className="font-medium text-slate-800">{it.target}</span>
                <span className="text-slate-600">{it.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.aiSummary ? (
        <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
          <p className="text-xs font-semibold text-indigo-950">AI 生成摘要（Markdown）</p>
          <div className="mt-2">
            <MarkdownBody source={report.aiSummary} />
          </div>
        </div>
      ) : null}

      {report.sections && report.sections.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">完整分项报告（可折叠）</p>
          <Accordion type="multiple" defaultValue={defaultOpen} className="w-full rounded-lg border border-slate-200 px-2">
            {report.sections.map((s) => (
              <AccordionItem key={s.id} value={s.id}>
                <AccordionTrigger className="py-3 text-sm hover:no-underline">
                  <span className="flex flex-1 flex-wrap items-center gap-2 pr-2">
                    <span className="font-medium text-slate-900">{s.title}</span>
                    {sectionStatusBadge(s.status)}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pt-0">
                  <MarkdownBody source={s.markdown || "_（无内容）_"} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ) : null}
    </div>
  );
}
