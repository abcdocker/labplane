import { useEffect, useMemo, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { LABPLANE_SSH_APPEARANCE_EVENT, resolveSshLabPlaneXtermOptions } from "@/lib/xtermShared";
import type { ITerminalOptions } from "@xterm/xterm";

/** SSH 专用：服务端字体 + 本机终端配色；随堡垒机工具栏或它页触发的 appearance 事件更新 */
export function useSshLabPlaneXtermOptions(): ITerminalOptions {
  const { data } = useAppConfig();
  const [appearanceRev, setAppearanceRev] = useState(0);

  useEffect(() => {
    const onChange = () => setAppearanceRev((n) => n + 1);
    window.addEventListener(LABPLANE_SSH_APPEARANCE_EVENT, onChange);
    return () => window.removeEventListener(LABPLANE_SSH_APPEARANCE_EVENT, onChange);
  }, []);

  return useMemo(
    () => resolveSshLabPlaneXtermOptions(data ?? undefined),
    [data, appearanceRev]
  );
}
