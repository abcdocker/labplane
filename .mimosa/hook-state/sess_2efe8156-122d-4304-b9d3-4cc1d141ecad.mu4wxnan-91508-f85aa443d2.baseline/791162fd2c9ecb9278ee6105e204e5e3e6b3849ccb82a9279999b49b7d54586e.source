import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AnsiUp } from "ansi_up";
import { apiGetText } from "@/lib/api";
import { buildPodLogsApiPath } from "./podLogsApi";

export type PodLogsSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  namespace: string;
  podName: string;
  /** 初始容器名 */
  container: string;
  /** 多容器时用于切换；不传则仅显示单一容器 */
  containerOptions?: { name: string; init?: boolean }[];
  /** 打开弹窗时是否默认勾选「上次崩溃实例」（等价 kubectl logs --previous） */
  initialPrevious?: boolean;
};

const PodLogsSheet: React.FC<PodLogsSheetProps> = ({
  open,
  onOpenChange,
  namespace,
  podName,
  container,
  containerOptions,
  initialPrevious = false,
}) => {
  const [activeContainer, setActiveContainer] = useState(
    () =>
      container.trim() ||
      containerOptions?.[0]?.name?.trim() ||
      ""
  );
  const [tailLines, setTailLines] = useState(500);
  const [previous, setPrevious] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ansiUp = useMemo(() => {
    const a = new AnsiUp();
    a.escape_html = true;
    return a;
  }, []);

  const logHtml = useMemo(() => {
    if (!text) return "";
    return ansiUp.ansi_to_html(text);
  }, [text, ansiUp]);

  const resolvedContainer = useMemo(() => {
    const a = activeContainer.trim();
    const c = container.trim();
    const first = containerOptions?.[0]?.name?.trim() ?? "";
    return a || c || first || "";
  }, [activeContainer, container, containerOptions]);

  useEffect(() => {
    if (!open) return;
    const next =
      container.trim() ||
      containerOptions?.[0]?.name?.trim() ||
      "";
    setActiveContainer(next);
    setPrevious(Boolean(initialPrevious));
  }, [open, namespace, podName, container, containerOptions, initialPrevious]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const body = await apiGetText(
        buildPodLogsApiPath(namespace, podName, resolvedContainer, tailLines, previous)
      );
      setText(body);
    } catch (e) {
      setErr((e as Error).message);
      setText("");
    } finally {
      setLoading(false);
    }
  }, [namespace, podName, resolvedContainer, tailLines, previous]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, resolvedContainer, tailLines, previous, load]);

  const opts = containerOptions?.length
    ? containerOptions
    : resolvedContainer
      ? [{ name: resolvedContainer, init: false }]
      : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88vh,680px)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-7xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-slate-200 px-4 py-3 text-left">
          <DialogTitle className="text-base font-semibold text-slate-900">容器日志（stdout/stderr）</DialogTitle>
          <DialogDescription className="font-mono text-xs text-slate-600">
            {namespace} / {podName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50/90 px-4 py-3">
          {opts.length > 1 && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-600">容器</Label>
              <Select value={activeContainer} onValueChange={setActiveContainer}>
                <SelectTrigger className="h-8 w-[220px] font-mono text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {opts.map((o) => (
                    <SelectItem key={o.name} value={o.name} className="font-mono text-xs">
                      {o.name}
                      {o.init ? " (init)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-600">行数</Label>
            <Select
              value={String(tailLines)}
              onValueChange={(v) => setTailLines(Number(v))}
            >
              <SelectTrigger className="h-8 w-[100px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="500">500</SelectItem>
                <SelectItem value="2000">2000</SelectItem>
                <SelectItem value="5000">5000</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="podlog-prev"
              checked={previous}
              onCheckedChange={setPrevious}
            />
            <Label htmlFor="podlog-prev" className="cursor-pointer text-xs text-slate-700">
              上轮实例（--previous）
            </Label>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="ml-auto gap-1"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            刷新
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-[#0b1020]">
          <div className="p-4">
            {loading && !text && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                加载日志…
              </div>
            )}
            {err && (
              <p className="whitespace-pre-wrap font-mono text-sm text-red-400">{err}</p>
            )}
            {text !== "" && (
              <pre
                className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-100 [tab-size:2]"
                // ansi_up 已对非 ANSI 文本做 HTML 转义；此处将 \x1b[38;5;n m 等转为带 style 的 span
                dangerouslySetInnerHTML={{ __html: logHtml }}
              />
            )}
            {!loading && !err && text === "" && (
              <p className="text-sm text-slate-500">暂无日志输出</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PodLogsSheet;
