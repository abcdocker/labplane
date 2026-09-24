import { useMemo } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import type { ITerminalOptions } from "@xterm/xterm";
import { resolveLabPlaneXtermOptions } from "@/lib/xtermShared";

export function useLabPlaneXtermOptions(): ITerminalOptions {
  const { data } = useAppConfig();
  return useMemo(() => resolveLabPlaneXtermOptions(data ?? undefined), [data]);
}
