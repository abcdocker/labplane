import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/auth-context";

const RequireAuth: React.FC = () => {
  const { status, loading, error } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F1F5F9] font-sans text-slate-600">
        加载中…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#F1F5F9] px-4 font-sans">
        <p className="text-red-600">无法加载登录状态：{error.message}</p>
        <p className="text-sm text-slate-500">请确认后端已启动且可访问 /api/auth/status</p>
      </div>
    );
  }

  if (status?.authRequired && !status.loggedIn) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <Outlet />;
};

export default RequireAuth;
