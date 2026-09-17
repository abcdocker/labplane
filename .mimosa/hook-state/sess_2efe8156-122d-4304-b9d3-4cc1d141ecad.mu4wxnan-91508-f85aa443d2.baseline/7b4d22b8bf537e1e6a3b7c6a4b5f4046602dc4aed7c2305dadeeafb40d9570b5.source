/** 过滤无效 / 占位到期日（后端曾返回 0001-01-01 等）。 */
export function dnsEffectiveDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = iso.split("T")[0]?.trim();
  if (!d || d.startsWith("0000-") || d.startsWith("0001-")) return null;
  if (d < "1972-01-01") return null;
  return d;
}

/** 解析线路展示（阿里云 API 常用 default）。 */
export function dnsLineDisplayLabel(line: string | undefined | null): string {
  const x = (line ?? "").trim();
  if (!x || x === "default") return "默认";
  return x;
}
