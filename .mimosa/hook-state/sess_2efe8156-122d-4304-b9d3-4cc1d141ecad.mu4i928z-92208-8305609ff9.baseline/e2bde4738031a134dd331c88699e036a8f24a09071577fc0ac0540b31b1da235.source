/** 解析 query_range 样本值 */
export function parseRangeSampleValue(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 将 query_range 矩阵合并为「Unix 秒 → 样本值」；多序列在同一时间戳上求和，
 * 与 CloudVmUsageSparkline / Pod 趋势图一致。
 */
export function promRangeScalarMap(data: unknown): Map<number, number> {
  const m = new Map<number, number>();
  const d = data as {
    status?: string;
    data?: { result?: Array<{ values?: [unknown, unknown][] }> };
  };
  if (d?.status !== "success" || !d.data?.result?.length) return m;
  for (const r of d.data.result) {
    const v = r.values;
    if (!v?.length) continue;
    for (const pair of v) {
      if (!pair || pair.length < 2) continue;
      const tsRaw = pair[0];
      const tsNum = typeof tsRaw === "number" ? tsRaw : parseFloat(String(tsRaw));
      if (!Number.isFinite(tsNum)) continue;
      const tsi = Math.round(tsNum);
      const sample = parseRangeSampleValue(pair[1]);
      if (sample === undefined) continue;
      m.set(tsi, (m.get(tsi) ?? 0) + sample);
    }
  }
  return m;
}
