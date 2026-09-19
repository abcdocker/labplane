/** 堡垒机 SSH（xterm）外观仅保存在本机浏览器，不写平台配置 */

import { notifyKubeBtSshAppearanceChanged } from "@/lib/xtermShared";
import { DEFAULT_SSH_TERM_THEME_ID, writeSshTerminalThemeIdRaw } from "@/lib/sshTermLocal";

const KEY_SIZE = "kubebt-bastion-ssh-font-size";
const KEY_FAMILY = "kubebt-bastion-ssh-font-family";

export const BASTION_SSH_FONT_PRESETS: { id: string; label: string; css: string }[] = [
  { id: "system", label: "系统默认等宽", css: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
  { id: "jetbrains", label: "JetBrains Mono", css: "'JetBrains Mono', ui-monospace, monospace" },
  { id: "fira", label: "Fira Code", css: "'Fira Code', ui-monospace, monospace" },
  { id: "consolas", label: "Consolas", css: "Consolas, ui-monospace, monospace" },
  { id: "cascadia", label: "Cascadia Code", css: "'Cascadia Code', ui-monospace, monospace" },
];

export function readBastionSshFontSize(): number {
  try {
    const raw = localStorage.getItem(KEY_SIZE);
    if (!raw) return 13;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return 13;
    return Math.min(28, Math.max(10, n));
  } catch {
    return 13;
  }
}

export function readBastionSshFontPresetId(): string {
  try {
    return localStorage.getItem(KEY_FAMILY) || "system";
  } catch {
    return "system";
  }
}

export function readBastionSshFontFamilyCSS(): string | undefined {
  const id = readBastionSshFontPresetId();
  const hit = BASTION_SSH_FONT_PRESETS.find((p) => p.id === id);
  return hit?.css;
}

export function writeBastionSshFontPrefs(size: number, presetId: string) {
  try {
    const sz = Math.min(28, Math.max(10, Math.round(size)));
    localStorage.setItem(KEY_SIZE, String(sz));
    localStorage.setItem(KEY_FAMILY, presetId || "system");
  } catch {
    /* ignore */
  }
  notifyKubeBtSshAppearanceChanged();
}

/** SSH 终端主题（与「SSH 终端」下拉同步） */
export function persistSshTerminalTheme(themeId: string) {
  writeSshTerminalThemeIdRaw((themeId || DEFAULT_SSH_TERM_THEME_ID).trim());
  notifyKubeBtSshAppearanceChanged();
}
