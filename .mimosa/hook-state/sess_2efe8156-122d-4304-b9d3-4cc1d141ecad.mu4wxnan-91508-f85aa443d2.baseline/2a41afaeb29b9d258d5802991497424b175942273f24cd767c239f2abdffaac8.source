import type { PromRangeData } from "@/pages/vcenter/vcenterPrometheusHelpers";

const DEFAULT_LABEL_KEYS = [
  "pod",
  "namespace",
  "instance",
  "host_name",
  "vm_name",
  "vmname",
  "ds_name",
  "job",
  "device",
  "exported_instance",
] as const;

/** 将 range matrix 转为宽表行，供 Recharts 多序列折线使用 */
export function promMatrixToWideRows(data: unknown, labelKeys?: string[]): Record<string, string | number>[] {
  const keys = labelKeys?.length ? labelKeys : [...DEFAULT_LABEL_KEYS];
  const d = data as PromRangeData;
  if (d?.status !== "success" || !d.data?.result?.length) return [];
  const tsMap = new Map<number, Record<string, number | string>>();

  for (const r of d.data.result) {
    const m = r.metric ?? {};
    let label = "";
    for (const k of keys) {
      const v = m[k];
      if (v != null && String(v).trim() !== "") {
        label = String(v);
        break;
      }
    }
    if (!label) {
      label =
        Object.entries(m)
          .filter(([x]) => x !== "__name__")
          .map(([a, b]) => `${a}=${b}`)
          .slice(0, 4)
          .join(",") || String(m.__name__ ?? "series");
    }

    for (const pair of r.values ?? []) {
      const [tsStr, valStr] = pair;
      const ts = Math.floor(Number(tsStr));
      if (!Number.isFinite(ts)) continue;
      const v = parseFloat(String(valStr));
      if (!tsMap.has(ts)) {
        tsMap.set(ts, { t: new Date(ts * 1000).toISOString() });
      }
      const row = tsMap.get(ts)!;
      row[label] = Number.isFinite(v) ? v : 0;
    }
  }

  return Array.from(tsMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row);
}

export function promFirstSeriesLineData(data: unknown): { t: string; v: number }[] {
  const d = data as PromRangeData;
  const vals = d?.data?.result?.[0]?.values;
  if (!vals?.length) return [];
  return vals.map(([ts, val]) => ({
    t: new Date(ts * 1000).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    v: parseFloat(String(val)),
  }));
}

/** 时序图用数值横轴（毫秒），便于 7 天等长窗下自适应刻度 */
export function promFirstSeriesNumericPoints(data: unknown): { x: number; v: number }[] {
  const d = data as PromRangeData;
  const vals = d?.data?.result?.[0]?.values;
  if (!vals?.length) return [];
  return vals
    .map(([ts, val]) => ({
      x: Number(ts) * 1000,
      v: parseFloat(String(val)),
    }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.v));
}

export function stepForRangeMinutes(minutes: number): string {
  if (minutes <= 60) return "30s";
  if (minutes <= 360) return "1m";
  if (minutes <= 1440) return "5m";
  return "15m";
}
