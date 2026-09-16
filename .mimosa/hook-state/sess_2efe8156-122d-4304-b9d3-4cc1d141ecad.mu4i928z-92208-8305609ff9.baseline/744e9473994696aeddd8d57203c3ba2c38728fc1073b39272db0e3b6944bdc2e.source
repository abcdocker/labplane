import { useEffect, useMemo, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { KUBEBT_SSH_APPEARANCE_EVENT, resolveSshKubeBtXtermOptions } from "@/lib/xtermShared";
import type { ITerminalOptions } from "@xterm/xterm";

/** SSH 专用：服务端字体 + 本机终端配色；随堡垒机工具栏或它页触发的 appearance 事件更新 */
export function useSshKubeBtXtermOptions(): ITerminalOptions {
  const { data } = useAppConfig();
  const [appearanceRev, setAppearanceRev] = useState(0);

  useEffect(() => {
    const onChange = () => setAppearanceRev((n) => n + 1);
    window.addEventListener(KUBEBT_SSH_APPEARANCE_EVENT, onChange);
    return () => window.removeEventListener(KUBEBT_SSH_APPEARANCE_EVENT, onChange);
  }, []);

  return useMemo(
    () => resolveSshKubeBtXtermOptions(data ?? undefined),
    [data, appearanceRev]
  );
}
