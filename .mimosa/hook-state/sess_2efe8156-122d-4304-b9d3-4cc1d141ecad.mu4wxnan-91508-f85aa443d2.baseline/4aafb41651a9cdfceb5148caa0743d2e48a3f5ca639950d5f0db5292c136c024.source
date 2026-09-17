import React from "react";
import { Link } from "react-router-dom";
import { FilePlus2, ImageIcon, PenLine, Save, Share2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ToolbarProps {
  onNewMarkdown: () => void;
  onNewExcalidraw: () => void;
  onSave: () => void;
  onExportMd: () => void;
  onShare?: () => void;
  disabled: boolean;
  /** 未发布或未选中文档时禁用「分享」 */
  shareDisabled?: boolean;
  /** Excalidraw 等类型不适用 .md 导出 */
  exportDisabled?: boolean;
  showExternalPromo?: boolean;
  mediaHref?: string;
  /** Markdown 图片/附件：COS 或本地及配置说明 */
  attachmentStorageSummary?: { line: string; hint?: string } | null;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onNewMarkdown,
  onNewExcalidraw,
  onSave,
  onExportMd,
  onShare,
  disabled,
  shareDisabled = true,
  exportDisabled = false,
  showExternalPromo = false,
  mediaHref = "/docs/media",
  attachmentStorageSummary = null,
}) => {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5"
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">文档仓库</p>
        <p className="truncate text-xs text-slate-500">Markdown 与 Excalidraw 画布；保存入库，可发布飞书风分享页 · Ctrl+S 保存</p>
        {attachmentStorageSummary ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500" title={attachmentStorageSummary.hint}>
            {attachmentStorageSummary.line}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={onNewMarkdown}>
          <FilePlus2 className="h-3.5 w-3.5 opacity-90" aria-hidden />
          Markdown
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={onNewExcalidraw}>
          <PenLine className="h-3.5 w-3.5 opacity-90" aria-hidden />
          画布
        </Button>

        <Button type="button" size="sm" className="h-9 gap-1.5 bg-violet-600 hover:bg-violet-700" onClick={onSave} disabled={disabled}>
          <Save className="h-3.5 w-3.5 opacity-90" aria-hidden />
          保存
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-9 gap-1.5"
          onClick={onExportMd}
          disabled={disabled || exportDisabled}
          title={exportDisabled ? "画布文档请使用保存与分享页" : undefined}
        >
          <Download className="h-3.5 w-3.5 opacity-90" aria-hidden />
          导出 .md
        </Button>

        <Button variant="outline" size="sm" className="h-9 gap-1.5" asChild>
          <Link to={mediaHref}>
            <ImageIcon className="h-3.5 w-3.5 opacity-90" aria-hidden />
            媒体库
          </Link>
        </Button>

        {onShare ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            disabled={shareDisabled}
            onClick={onShare}
          >
            <Share2 className="h-3.5 w-3.5 opacity-90" aria-hidden />
            分享
          </Button>
        ) : null}

        {showExternalPromo ? (
          <>
            <Button type="button" variant="ghost" size="sm" asChild>
              <a href="https://flowmix.turntip.cn" target="_blank" rel="noreferrer">
                多模态文档
              </a>
            </Button>
            <Button type="button" variant="ghost" size="sm" asChild>
              <a href="https://dooring.vip" target="_blank" rel="noreferrer">
                页面制作
              </a>
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
};
