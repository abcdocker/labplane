import React, { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { EditorView } from "@codemirror/view";
import { cn } from "@/lib/utils";

export type YamlEditorProps = {
  value: string;
  onChange: (value: string) => void;
  /** 加载中或只读预览时禁止编辑 */
  readOnly?: boolean;
  className?: string;
  /** 编辑器可视高度，如 420px 或 min(65vh, 520px) */
  height?: string;
  /** 是否显示底部行数 / 字符数统计 */
  showStats?: boolean;
  /** 空内容时占位提示 */
  placeholder?: string;
  /** true 时不加载 YAML 语法高亮（用于 nginx.conf 等纯文本） */
  plainText?: boolean;
};

function countLines(text: string): number {
  if (text === "") return 1;
  return text.split("\n").length;
}

/**
 * 可编辑 YAML：CodeMirror 6 语法高亮 + 行号 + 可选底部统计。
 * Kubernetes 各资源「编辑 YAML」对话框复用此组件。
 */
export function YamlEditor({
  value,
  onChange,
  readOnly = false,
  className,
  height = "min(65vh, 520px)",
  showStats = true,
  placeholder,
  plainText = false,
}: YamlEditorProps) {
  const extensions = useMemo(
    () => (plainText ? [EditorView.lineWrapping] : [yaml(), EditorView.lineWrapping]),
    [plainText]
  );

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
      {showStats && (
        <p className="text-right text-[11px] tabular-nums text-slate-500">
          {lines} 行 · {chars} 字符
        </p>
      )}
    </div>
  );
}
