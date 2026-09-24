import React from "react";
import { Link } from "react-router-dom";
import { Boxes, Server, Sparkles } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { cn } from "@/lib/utils";
import { moduleVisible, menuItemVisible } from "@/lib/platform-permissions";
import AccountMyProfile from "@/pages/account/AccountMyProfile";

/** 头像下拉「个人中心」：资料、OIDC、头像与常用资源入口 */
const AccountPersonalCenter: React.FC = () => {
  const { status } = useAuth();
  const perm = status?.permissions;
  const role = status?.role;

  const appOn =
    moduleVisible(perm, "appcenter") && menuItemVisible(perm, "appcenter", role, moduleVisible(perm, "appcenter"));
  const showRedis = appOn;
  const showCloudVm = appOn;

  return (
    <div className="mx-auto max-w-4xl pb-12">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">个人中心</h1>
        <p className="mt-1 text-sm text-slate-500">登录资料、OIDC、头像；下方「我的资源」为常用入口（权限不足时自动隐藏）。</p>
      </div>

      <AccountMyProfile />

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">我的资源</h2>
        <p className="mt-1 text-xs text-slate-500">按当前账号权限展示；平台级配置仍在「账户与平台设置」。</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {showRedis ? (
            <li>
              <Link
                to="/cluster/apps/redis"
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-700">
                  <Boxes className="h-4 w-4" />
                </span>
                应用中心 · Redis
              </Link>
            </li>
          ) : null}
          {showCloudVm ? (
            <li>
              <Link
                to="/cluster/apps/cloud-vm"
                className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-800">
                  <Server className="h-4 w-4" />
                </span>
                应用中心 · 云主机
              </Link>
            </li>
          ) : null}
          {menuItemVisible(perm, "aiInspect", role, true) ? (
            <li>
              <Link
                to="/cluster/ai-inspect/dashboard"
                className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-100 text-cyan-800">
                  <Sparkles className="h-4 w-4" />
                </span>
                AI 巡检 · 总览
              </Link>
            </li>
          ) : null}
        </ul>
        {!showRedis && !showCloudVm ? (
          <p className="mt-3 text-sm text-slate-500">当前账号暂无应用中心资源入口，或联系管理员调整权限。</p>
        ) : null}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <Link to="/account/settings" className="text-sm font-medium text-sky-700 underline">
            打开账户与平台设置（运行时、MySQL、OIDC 全局等）
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AccountPersonalCenter;
