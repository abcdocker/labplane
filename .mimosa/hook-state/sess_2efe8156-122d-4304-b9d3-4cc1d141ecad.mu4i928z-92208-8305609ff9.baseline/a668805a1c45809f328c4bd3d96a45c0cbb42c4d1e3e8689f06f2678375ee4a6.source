import { ApiHttpError } from "@/lib/api";

/** 统一从 unknown 错误取展示文案；403 仅展示「权限错误」，不拼接 hint。 */
export function extractErrorMessage(e: unknown): string {
  if (e instanceof ApiHttpError) {
    if (e.status === 403) return "权限错误";
    const h = e.serverHint?.trim();
    if (h) return `${e.serverMessage}\n${h}`;
    return e.serverMessage;
  }
  if (e instanceof Error) return e.message;
  if (typeof e === "string" && e.trim()) return e;
  return "未知错误";
}
