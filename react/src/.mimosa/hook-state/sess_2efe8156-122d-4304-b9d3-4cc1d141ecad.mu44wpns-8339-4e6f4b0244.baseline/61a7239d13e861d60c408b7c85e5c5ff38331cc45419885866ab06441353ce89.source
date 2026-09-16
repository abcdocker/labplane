import { useMemo } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import type { ITerminalOptions } from "@xterm/xterm";
import { resolveKubeBtXtermOptions } from "@/lib/xtermShared";

export function useKubeBtXtermOptions(): ITerminalOptions {
  const { data } = useAppConfig();
  return useMemo(() => resolveKubeBtXtermOptions(data ?? undefined), [data]);
}
