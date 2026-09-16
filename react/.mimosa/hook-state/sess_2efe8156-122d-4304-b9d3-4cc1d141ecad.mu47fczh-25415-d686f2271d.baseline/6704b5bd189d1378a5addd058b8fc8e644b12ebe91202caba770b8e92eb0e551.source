import React, { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { useRuntimeStatusQuery } from "@/hooks/use-runtime-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * 登录后根据 /api/runtime/status 提示：MySQL 结构是否与二进制期望一致、前端构建号是否与后端 buildVersion 一致（需 CI 设置 VITE_UI_BUILD_VERSION）。
 */
const PlatformVersionBanner: React.FC = () => {
  const { status } = useAuth();
  const rq = useRuntimeStatusQuery();

  const items = useMemo(() => {
    if (!status?.loggedIn || !rq.data) {
      return [] as { key: string; title: string; body: string; destructive: boolean }[];
    }
    const out: { key: string; title: string; body: string; destructive: boolean }[] = [];
    const ms = rq.data.mysqlSchema;
    if (ms?.configured) {
      if (!ms.reachable && ms.pingError) {
        out.push({
          key: "mysql-ping",
          title: "MySQL 与配置不一致",
          body: `进程已配置 DSN 但当前无法连通（${ms.pingError}）。请检查网络、账号权限或服务状态后再迁移结构。`,
          destructive: true,
        });
      } else if (ms.reachable && ms.schemaAligned === false) {
        const exp = ms.schemaVersionExpected ?? "—";
        const rec = ms.schemaVersionRecorded != null && ms.schemaVersionRecorded !== "" ? ms.schemaVersionRecorded : "（无记录）";
        out.push({
          key: "mysql-schema",
          title: "数据库结构版本与程序不一致",
          body: `库中记录的结构版本为 ${rec}，当前二进制期望 ${exp}。请完成迁移或重新执行平台 MySQL 初始化后再使用文档中心、用户表等功能。`,
          destructive: true,
        });
      }
    }

    const apiBv = (rq.data.buildVersion ?? "").trim();
    const uiBv =
      typeof __KUBEBT_UI_BUILD_VERSION__ !== "undefined"
        ? String(__KUBEBT_UI_BUILD_VERSION__).trim()
        : "dev";
    if (
      apiBv !== "" &&
      uiBv !== "" &&
      uiBv !== "dev" &&
      apiBv !== "dev" &&
      apiBv !== uiBv
    ) {
      out.push({
        key: "ui-api-bv",
        title: "前端静态资源与后端版本号不一致",
        body: `浏览器加载的前端构建号为「${uiBv}」，接口返回的 buildVersion 为「${apiBv}」。请强制刷新（Ctrl+Shift+R）或重新部署控制台，并在 CI 中将 VITE_UI_BUILD_VERSION 与 Go ldflags 的 BuildVersion 设为同一值。`,
        destructive: false,
      });
    }

    const sessBv = (status.buildVersion ?? "").trim();
    if (sessBv !== "" && apiBv !== "" && sessBv !== apiBv) {
      out.push({
        key: "sess-api-bv",
        title: "会话登记版本与当前后端不一致",
        body: `登录态中的 buildVersion（${sessBv}）与当前接口（${apiBv}）不同，可能发生在滚动升级过程中。建议刷新页面；若仍异常请重新登录。`,
        destructive: false,
      });
    }

    return out;
  }, [rq.data, status?.loggedIn, status?.buildVersion]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="shrink-0 space-y-2 border-b border-amber-200/80 bg-amber-50/50 px-3 py-2 sm:px-4">
      {items.map((x) => (
        <Alert
          key={x.key}
          variant={x.destructive ? "destructive" : "default"}
          className={
            x.destructive
              ? "border-red-300 bg-red-50/95 text-red-950"
              : "border-amber-300 bg-amber-50/90 text-amber-950"
          }
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm font-semibold">{x.title}</AlertTitle>
          <AlertDescription className="text-xs leading-relaxed text-current/90">{x.body}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
};

export default PlatformVersionBanner;
