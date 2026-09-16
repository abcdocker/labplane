/**
 * SSH 终端配色：基于常见 iTerm2 导出 schema（16 色 + 背景/光标），映射为 xterm ITheme。
 */
import type { ITheme } from "@xterm/xterm";
import { DEFAULT_SSH_TERM_THEME_ID, readSshTerminalThemeId } from "@/lib/sshTermLocal";

/** 与 xtermShared.kubeBtXtermOptions.theme 一致（避免循环依赖） */
const classicKubeBtTheme: ITheme = {
  background: "#1e1e1e",
  foreground: "#e8e8e8",
  cursor: "#22c55e",
  cursorAccent: "#1e1e1e",
  selectionBackground: "#22c55e80",
};

export type SshTermPreset = {
  id: string;
  label: string;
  theme: ITheme;
};

function fromSchema(
  p: Omit<SshTermPreset, "theme"> & { schema: Record<string, string> }
): SshTermPreset {
  const s = p.schema;
  return {
    id: p.id,
    label: p.label,
    theme: {
      background: s.background,
      foreground: s.foreground,
      cursor: s.cursor,
      cursorAccent: s.cursorAccent ?? s.background,
      selectionBackground: s.selectionBackground,
      selectionForeground: s.selectionForeground,
      black: s.black,
      red: s.red,
      green: s.green,
      yellow: s.yellow,
      blue: s.blue,
      magenta: s.magenta,
      cyan: s.cyan,
      white: s.white,
      brightBlack: s.brightBlack,
      brightRed: s.brightRed,
      brightGreen: s.brightGreen,
      brightYellow: s.brightYellow,
      brightBlue: s.brightBlue,
      brightMagenta: s.brightMagenta,
      brightCyan: s.brightCyan,
      brightWhite: s.brightWhite,
    },
  };
}

const oneHalfDark = fromSchema({
  id: "orion-one-half-dark",
  label: "One Half Dark",
  schema: {
    background: "#282C34",
    foreground: "#DCDFE4",
    cursor: "#A3B3CC",
    cursorAccent: "#282C34",
    selectionBackground: "#474E57",
    black: "#282C34",
    red: "#E06C75",
    green: "#98C379",
    yellow: "#E5C07B",
    blue: "#61AFEF",
    magenta: "#C678DD",
    cyan: "#56B6C2",
    white: "#DCDFE4",
    brightBlack: "#282C34",
    brightRed: "#E06C75",
    brightGreen: "#98C379",
    brightYellow: "#E5C07B",
    brightBlue: "#61AFEF",
    brightMagenta: "#C678DD",
    brightCyan: "#56B6C2",
    brightWhite: "#DCDFE4",
  },
});

const dracula = fromSchema({
  id: "orion-dracula",
  label: "Dracula",
  schema: {
    background: "#282A36",
    foreground: "#F8F8F2",
    cursor: "#F8F8F2",
    cursorAccent: "#282A36",
    selectionBackground: "#44475A",
    black: "#21222C",
    red: "#FF5555",
    green: "#50FA7B",
    yellow: "#F1FA8C",
    blue: "#BD93F9",
    magenta: "#FF79C6",
    cyan: "#8BE9FD",
    white: "#F8F8F2",
    brightBlack: "#6272A4",
    brightRed: "#FF6E6E",
    brightGreen: "#69FF94",
    brightYellow: "#FFFFA5",
    brightBlue: "#D6ACFF",
    brightMagenta: "#FF92DF",
    brightCyan: "#A4FFFF",
    brightWhite: "#FFFFFF",
  },
});

const catppuccinMocha = fromSchema({
  id: "orion-catppuccin-mocha",
  label: "Catppuccin Mocha",
  schema: {
    background: "#1E1E2E",
    foreground: "#CDD6F4",
    cursor: "#F5E0DC",
    cursorAccent: "#1E1E2E",
    selectionBackground: "#585B70",
    black: "#45475A",
    red: "#F38BA8",
    green: "#A6E3A1",
    yellow: "#F9E2AF",
    blue: "#89B4FA",
    magenta: "#F5C2E7",
    cyan: "#89DCEB",
    white: "#BAC2DE",
    brightBlack: "#585B70",
    brightRed: "#F38BA8",
    brightGreen: "#A6E3A1",
    brightYellow: "#F9E2AF",
    brightBlue: "#89B4FA",
    brightMagenta: "#F5C2E7",
    brightCyan: "#89DCEB",
    brightWhite: "#A6ADC8",
  },
});

export const SSH_TERM_PRESETS: SshTermPreset[] = [
  {
    id: "classic",
    label: "经典（本平台原色）",
    theme: { ...classicKubeBtTheme },
  },
  oneHalfDark,
  dracula,
  catppuccinMocha,
];

const presetById = new Map(SSH_TERM_PRESETS.map((p) => [p.id, p]));

/** 合并后的 xterm 主题（SSH 专用） */
export function sshXtermThemeForCurrentPreference(): ITheme {
  const id = readSshTerminalThemeId();
  const hit = presetById.get(id);
  if (hit) return { ...hit.theme };
  const fallback = presetById.get(DEFAULT_SSH_TERM_THEME_ID);
  return { ...(fallback?.theme ?? classicKubeBtTheme) };
}
