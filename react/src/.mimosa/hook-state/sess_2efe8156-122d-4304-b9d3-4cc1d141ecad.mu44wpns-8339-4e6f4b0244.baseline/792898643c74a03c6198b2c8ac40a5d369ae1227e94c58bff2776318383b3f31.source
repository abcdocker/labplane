/** SSH 终端主题 id（本机 localStorage，与 sshTerminalPresets 中 id 对应） */

const KEY_THEME = "kubebt-ssh-term-theme";

export const DEFAULT_SSH_TERM_THEME_ID = "orion-one-half-dark";

export function readSshTerminalThemeId(): string {
  try {
    const v = localStorage.getItem(KEY_THEME);
    if (v && v.trim()) return v.trim();
  } catch {
    /* ignore */
  }
  return DEFAULT_SSH_TERM_THEME_ID;
}

export function writeSshTerminalThemeIdRaw(id: string): void {
  try {
    localStorage.setItem(KEY_THEME, id || DEFAULT_SSH_TERM_THEME_ID);
  } catch {
    /* ignore */
  }
}
