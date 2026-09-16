import React from "react";

/** 与宿主机列表一致的占用条；不可用时传 null 显示「—」 */
export const VCenterPercentBar: React.FC<{ value: number | null | undefined }> = ({
  value,
}) => {
  if (value == null || Number.isNaN(value)) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className="flex min-w-[120px] items-center gap-2">
      <div className="h-2 w-full max-w-[140px] overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all ${
            v >= 85 ? "bg-amber-500" : v >= 70 ? "bg-amber-400" : "bg-emerald-500"
          }`}
          style={{ width: `${v}%` }}
        />
      </div>
      <span className="tabular-nums text-xs text-slate-600">{v.toFixed(1)}%</span>
    </div>
  );
};
