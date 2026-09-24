import React from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGetJson, type AppConfig } from "@/lib/api";

type Props = {
  /** 只读账号跳转目标 */
  to: string;
  children: React.ReactNode;
};

/** 仅非 viewer 可访问子页面（宝塔、公有云主机等） */
const ViewerRedirect: React.FC<Props> = ({ to, children }) => {
  const q = useAppConfig();
  if (q.isPending || q.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        加载权限…
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          无法校验只读权限（/api/config）：{(q.error as Error).message}。已临时允许进入；若您为只读账号请退出敏感操作。
        </p>
        {children}
      </div>
    );
  }
  if (q.data?.dashboardRole === "viewer" || q.data?.viewer) {
    return <Navigate to={to} replace />;
  }
  return <>{children}</>;
};

export default ViewerRedirect;
