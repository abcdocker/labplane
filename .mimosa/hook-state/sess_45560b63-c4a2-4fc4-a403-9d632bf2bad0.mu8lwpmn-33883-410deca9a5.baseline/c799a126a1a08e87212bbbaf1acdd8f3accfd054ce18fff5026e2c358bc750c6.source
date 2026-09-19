import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { VCenterVMStorageSummary } from "./types";

/** 与柱状图色块一致，便于图例/提示与语义区分 */
const storageChartConfig = {
  committed: { label: "已提交", color: "hsl(199 72% 46%)" },
  uncommitted: { label: "未提交", color: "hsl(265 58% 54%)" },
  unshared: { label: "未共享", color: "hsl(152 52% 40%)" },
} as const;

const storageBarColorByName: Record<string, string> = {
  已提交: storageChartConfig.committed.color,
  未提交: storageChartConfig.uncommitted.color,
  未共享: storageChartConfig.unshared.color,
};

type SeriesDatum = { name: string; value: number };

export function formatBytes(n: number | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let u = 0;
  let v = n;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  const rounded =
    v < 10 && u > 0 ? v.toFixed(1) : String(Math.round(v));
  return `${rounded} ${units[u]}`;
}

/** 概况页：存储三项对比柱状图（离散指标，不宜用折线/面积串联） */
export const VCenterStorageChart: React.FC<{
  storage: VCenterVMStorageSummary;
}> = ({ storage }) => {
  const data: SeriesDatum[] = [
    { name: "已提交", value: storage.committedBytes ?? 0 },
    { name: "未提交", value: storage.uncommittedBytes ?? 0 },
    { name: "未共享", value: storage.unsharedBytes ?? 0 },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return (
      <p className="text-sm text-slate-500">暂无存储用量数据</p>
    );
  }

  return (
    <ChartContainer
      config={storageChartConfig}
      className="h-[220px] w-full min-h-[200px] [&_.recharts-responsive-container]:min-h-[200px]"
    >
      <BarChart
        data={data}
        margin={{ top: 28, right: 8, left: 0, bottom: 8 }}
        barCategoryGap="18%"
      >
        <CartesianGrid
          strokeDasharray="3 4"
          vertical={false}
          className="stroke-slate-200/90"
        />
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          tick={{ fontSize: 12, fill: "hsl(215 16% 38%)" }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={58}
          tick={{ fontSize: 11, fill: "hsl(215 16% 42%)" }}
          tickFormatter={(v) => formatBytes(Number(v))}
        />
        <ChartTooltip
          cursor={{ fill: "hsl(214 32% 97% / 0.85)" }}
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => {
                const row = (item as { payload?: SeriesDatum } | undefined)
                  ?.payload;
                const label = row?.name ?? "";
                return (
                  <span className="tabular-nums font-medium">
                    {label}：{formatBytes(Number(value))}
                  </span>
                );
              }}
            />
          }
        />
        <Bar
          dataKey="value"
          radius={[8, 8, 0, 0]}
          maxBarSize={72}
          strokeWidth={0}
        >
          {data.map((entry) => (
            <Cell
              key={entry.name}
              fill={storageBarColorByName[entry.name] ?? "hsl(215 16% 65%)"}
            />
          ))}
          <LabelList
            dataKey="value"
            position="top"
            className="fill-slate-600 text-[10px] font-medium"
            formatter={(v: number) => formatBytes(v)}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
};
