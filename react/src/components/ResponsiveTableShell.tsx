import React from "react";
import { CircleSlash, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 响应式列表外壳：全站 H5 改造的统一模式。
// <768px（md 断点）渲染 cards（卡片列表），≥768px 渲染 table（表格），
// 与 IngressList/VCenterList 已有的手写模式一致，统一收敛到本组件。
// 用法：
//   <ResponsiveTableShell
//     loading={q.isLoading} error={errText} onRetry={() => q.refetch()}
//     emptyHint="暂无资源"
//     cards={rows.map((r) => <Card key={r.name} … />)}
//     table={<table className="w-full min-w-[820px]">…</table>}
//   />
// 卡片/表格双渲染仅为展示层差异，业务状态与操作回调保持同一份。

export type ResponsiveTableShellProps = {
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** 空态提示文案；loading/error 优先级更高 */
  emptyHint?: string;
  /** 每行一个卡片节点（移动端） */
  cards: React.ReactNode;
  /** 表格节点（桌面端），需自带 min-w-* 以保留横向可读性 */
  table: React.ReactNode;
  className?: string;
};

const ResponsiveTableShell: React.FC<ResponsiveTableShellProps> = ({
  loading,
  error,
  onRetry,
  emptyHint,
  cards,
  table,
  className,
}) => {
  if (loading) {
    return <div className="py-10 text-center text-sm text-slate-400">加载中…</div>;
  }
  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-red-600">
        <CircleSlash className="h-4 w-4" />
        <span>加载失败：{error}</span>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onRetry}>
            <RefreshCw className="h-3 w-3" /> 重试
          </Button>
        ) : null}
      </div>
    );
  }
  const empty = emptyHint != null;
  return (
    <div className={cn(className)}>
      {empty ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
          {emptyHint}
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">{cards}</div>
          <div className="hidden overflow-x-auto md:block">{table}</div>
        </>
      )}
    </div>
  );
};

export default ResponsiveTableShell;
