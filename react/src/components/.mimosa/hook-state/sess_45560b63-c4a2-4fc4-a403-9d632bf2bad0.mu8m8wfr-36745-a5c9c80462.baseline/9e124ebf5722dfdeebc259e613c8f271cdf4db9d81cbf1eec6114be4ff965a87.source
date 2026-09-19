import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGetJson, type SetupStatus } from "@/lib/api";
import { extractErrorMessage } from "@/lib/extract-error-message";

/** 未写入 runtime-config.json 时强制进入 /setup；完成后禁止访问 /setup。 */
const SetupGate: React.FC = () => {
  const loc = useLocation();
  const q = useQuery({
    queryKey: ["setup-status"],
    queryFn: ({ signal }) => apiGetJson<SetupStatus>("/api/setup/status", { signal }),
    staleTime: 10_000,
    retry: 2,
  });

  if (q.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F1F5F9] font-sans text-slate-600">
        加载中…
      </div>
    );
  }

  if (q.error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#F1F5F9] px-4 font-sans">
        <p className="text-red-600">无法读取初始化状态：{extractErrorMessage(q.error)}</p>
        <p className="text-sm text-slate-500">请确认后端已启动且可访问 GET /api/setup/status</p>
      </div>
    );
  }

  const data = q.data;
  if (data && !data.initialized && loc.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }
  if (data?.initialized && loc.pathname === "/setup") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default SetupGate;
