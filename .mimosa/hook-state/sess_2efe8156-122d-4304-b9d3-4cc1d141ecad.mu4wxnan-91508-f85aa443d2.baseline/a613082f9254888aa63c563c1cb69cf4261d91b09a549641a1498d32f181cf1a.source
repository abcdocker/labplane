import type { ITerminalOptions, Terminal } from "@xterm/xterm";
import { WebglAddon } from "@xterm/addon-webgl";
import { sshXtermThemeForCurrentPreference } from "@/lib/sshTerminalPresets";

/** 字号/字体/主题变更后派发，SSH 终端 hook 用于重建 xterm */
export const KUBEBT_SSH_APPEARANCE_EVENT = "kubebt-ssh-appearance";

export function notifyKubeBtSshAppearanceChanged(): void {
  window.dispatchEvent(new Event(KUBEBT_SSH_APPEARANCE_EVENT));
}

/** 与虚拟机 SSH 终端一致：深色背景、绿色光标、足够滚动缓冲 */
export const kubeBtXtermOptions: ITerminalOptions = {
  cursorBlink: true,
  scrollback: 800,
  fontFamily: "SF Mono, ui-monospace, Menlo, Monaco, Consolas, monospace",
  fontSize: 13,
  theme: {
    background: "#1e1e1e",
    foreground: "#e8e8e8",
    cursor: "#22c55e",
    cursorAccent: "#1e1e1e",
    selectionBackground: "#22c55e80",
  },
};

export type SshTerminalFontConfig = {
  sshTerminalFontFamily?: string;
  sshTerminalFontSize?: number;
};

/** 合并后台 /api/config 或 runtime-config 中的 SSH 终端字体设置 */
export function resolveKubeBtXtermOptions(cfg: SshTerminalFontConfig | null | undefined): ITerminalOptions {
  const o: ITerminalOptions = {
    ...kubeBtXtermOptions,
    theme: kubeBtXtermOptions.theme ? { ...kubeBtXtermOptions.theme } : undefined,
  };
  const fam = cfg?.sshTerminalFontFamily?.trim();
  if (fam) o.fontFamily = fam;
  const sz = cfg?.sshTerminalFontSize;
  if (typeof sz === "number" && sz >= 8 && sz <= 48) o.fontSize = sz;
  return o;
}

/** SSH：合并服务端字体 + 本机配色预设（localStorage） */
export function resolveSshKubeBtXtermOptions(cfg: SshTerminalFontConfig | null | undefined): ITerminalOptions {
  const base = resolveKubeBtXtermOptions(cfg);
  const sshTheme = sshXtermThemeForCurrentPreference();
  return {
    ...base,
    theme: { ...base.theme, ...sshTheme },
  };
}

/** 在支持时启用 WebGL 加速；失败则沿用 xterm 默认 canvas */
export function tryLoadXtermWebgl(term: Terminal): boolean {
  try {
    const cap = typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? 4 : 4;
    if (cap < 2) return false;
    term.loadAddon(new WebglAddon());
    return true;
  } catch {
    return false;
  }
}
