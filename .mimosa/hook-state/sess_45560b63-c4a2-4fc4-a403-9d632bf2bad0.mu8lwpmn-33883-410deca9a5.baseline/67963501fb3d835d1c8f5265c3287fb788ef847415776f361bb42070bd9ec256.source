/** 统一使用 Asia/Shanghai 展示（与后端 TZ=Asia/Shanghai 一致）。 */
const shanghaiFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatDateTimeShanghai(isoOrMs: string | number | undefined | null): string {
  if (isoOrMs == null || isoOrMs === "") return "—";
  const d =
    typeof isoOrMs === "number"
      ? new Date(isoOrMs)
      : new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) return String(isoOrMs);
  return shanghaiFormatter.format(d);
}
