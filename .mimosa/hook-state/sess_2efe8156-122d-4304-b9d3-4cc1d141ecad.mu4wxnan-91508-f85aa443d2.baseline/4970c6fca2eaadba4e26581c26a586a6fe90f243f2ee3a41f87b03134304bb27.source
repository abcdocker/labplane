import React from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { apiGetJson, type AppConfig } from "@/lib/api";
import { cn } from "@/lib/utils";

const SESSION_DISMISS_PREFIX = "kubebt:redis-banner-dismiss:";

/**
 * 运行时配置了 Redis 但进程连不上时，在顶栏下展示告警；与 /api/config 的 redisConfigured / redisError 对齐。
 */
const RedisStatusBanner: React.FC = () => {
  const cfgQ = useAppConfig();
  const err = cfgQ.data?.redisError;
  const show =
    cfgQ.data?.redisConfigured === true &&
    cfgQ.data?.redisConnected !== true &&
    Boolean(err?.trim());

  const dismissKey = err ? SESSION_DISMISS_PREFIX + err.slice(0, 200) : "";
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    setDismissed(false);
    if (!dismissKey || typeof sessionStorage === "undefined") return;
    try {
      setDismissed(sessionStorage.getItem(dismissKey) === "1");
    } catch {
      /* ignore */
    }
  }, [dismissKey]);

  const toastedRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!show || !err) {
      if (!show) toastedRef.current = null;
      return;
    }
    if (toastedRef.current === err) return;
    toastedRef.current = err;
    toast.error("Redis 连接异常", {
      description: err,
      duration: 10_000,
    });
  }, [show, err]);

  if (!show || dismissed || !err) {
    return null;
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex shrink-0 items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 md:px-6"
      )}
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Redis 不可用（已在后台配置地址）</p>
        <p className="mt-0.5 break-words text-amber-900/90">{err}</p>
        <p className="mt-1 text-xs text-amber-800/80">
          vCenter 列表/详情缓存、platform_kv 镜像等依赖 Redis 时将退化为直连或仅本地；请检查地址、密码、网络或 Redis
          服务后保存「运行时配置」或重启进程。
        </p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-md p-1 text-amber-800 hover:bg-amber-100"
        aria-label="关闭本页提示"
        onClick={() => {
          try {
            if (dismissKey) sessionStorage.setItem(dismissKey, "1");
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default RedisStatusBanner;
