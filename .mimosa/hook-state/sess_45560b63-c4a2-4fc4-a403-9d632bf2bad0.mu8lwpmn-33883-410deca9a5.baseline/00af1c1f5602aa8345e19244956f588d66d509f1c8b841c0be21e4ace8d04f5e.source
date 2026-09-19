/** Harbor `GET /statistics` 等数值展示（与站点统计页共用） */
export function formatHarborStatCell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Math.abs(v) >= 1e12) return `${(v / 1e12).toFixed(2)} TB`;
    if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)} GB`;
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)} MB`;
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  if (typeof v === "boolean") return v ? "是" : "否";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
