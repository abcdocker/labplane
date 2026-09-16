/** 复制到剪贴板；在非 HTTPS 或权限被拒时回退到 execCommand。 */
export async function copyToClipboardSafe(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* NotAllowedError 等 */
    }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("execCommand(copy) 失败");
    }
  } finally {
    document.body.removeChild(ta);
  }
}
