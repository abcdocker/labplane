/** localStorage 前缀：折叠后的操作手册下次访问默认保持收起 */
const PREFIX = "kubebt.manual.v1.";

export function getStoredGuideOpen(key: string): boolean | undefined {
  try {
    const v = localStorage.getItem(PREFIX + key);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore quota / private mode */
  }
  return undefined;
}

export function setStoredGuideOpen(key: string, open: boolean): void {
  try {
    localStorage.setItem(PREFIX + key, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}
