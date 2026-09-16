import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";

export type YamlCodeBlockProps = {
  value: string;
  className?: string;
  /** 代码区最大高度，默认与 Pod 详情页一致 */
  maxHeight?: string;
};

export function YamlCodeBlock({
  value,
  className,
  maxHeight = "min(70vh, 520px)",
}: YamlCodeBlockProps) {
  return (
    <div
      className={cn(
        "overflow-auto rounded-xl border border-slate-200 bg-[#0b1020]",
        className
      )}
    >
      <SyntaxHighlighter
        language="yaml"
        style={oneDark}
        showLineNumbers
        lineNumberStyle={{
          minWidth: "3em",
          paddingRight: "1em",
          color: "rgb(100 116 139)",
          textAlign: "right",
          userSelect: "none",
        }}
        customStyle={{
          margin: 0,
          padding: "1rem",
          fontSize: 11,
          lineHeight: 1.65,
          background: "#0b1020",
          maxHeight,
        }}
        codeTagProps={{
          style: {
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            tabSize: 2,
          },
        }}
      >
        {value || "\n"}
      </SyntaxHighlighter>
    </div>
  );
}
