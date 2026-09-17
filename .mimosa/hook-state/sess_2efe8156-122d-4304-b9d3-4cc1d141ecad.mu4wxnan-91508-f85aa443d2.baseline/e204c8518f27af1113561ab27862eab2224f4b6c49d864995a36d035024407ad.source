import React, { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { cn } from "@/lib/utils";

export type JsonCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  height?: string;
  showStats?: boolean;
  placeholder?: string;
};

function countLines(text: string): number {
  if (text === "") return 1;
  return text.split("\n").length;
}

/** OpenClaw openclaw.json 等：JSON 语法高亮 + 换行 + 行号 */
export function JsonCodeEditor({
  value,
  onChange,
  readOnly = false,
  className,
  height = "min(420px, 55vh)",
  showStats = true,
  placeholder,
}: JsonCodeEditorProps) {
  const extensions = useMemo(() => [json(), EditorView.lineWrapping], []);
  const lines = countLines(value);
  const chars = value.length;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-slate-200 bg-white shadow-inner",
          readOnly && "opacity-95"
        )}
      >
        <CodeMirror
          value={value}
          height={height}
          theme="light"
          extensions={extensions}
          onChange={onChange}
          readOnly={readOnly}
          editable={!readOnly}
          placeholder={placeholder}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: !readOnly,
            bracketMatching: true,
            closeBrackets: true,
            indentOnInput: true,
          }}
        />
      </div>
      {showStats ? (
        <p className="text-right text-[11px] tabular-nums text-slate-500">
          {lines} 行 · {chars} 字符
        </p>
      ) : null}
    </div>
  );
}
