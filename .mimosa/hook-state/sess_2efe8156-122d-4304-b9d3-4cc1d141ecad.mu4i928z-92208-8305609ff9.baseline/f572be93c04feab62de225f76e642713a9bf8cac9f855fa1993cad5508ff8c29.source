import React, { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BarChart3, ChevronRight, FileText, UserCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-context";
import SettingsRuntimeSection from "@/pages/SettingsRuntimeSection";

const AccountSettings: React.FC = () => {
  const { status, refetch } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const oidcBind = searchParams.get("oidc_bind");
  const oidcReason = searchParams.get("reason") ?? "";
  const oidcMessage = searchParams.get("message") ?? "";

  useEffect(() => {
    if (!oidcBind) return;
    if (oidcBind === "ok") {
      toast.success("Authentik / OIDC 已绑定，可使用登录页的 OIDC 登录。");
      void refetch();
    } else if (oidcBind === "conflict") {
      toast.error("该 Authentik 账号已绑定到其他平台用户，无法重复绑定。");
    } else if (oidcBind === "duplicate") {
      toast.error("绑定冲突：数据库唯一约束（请联系管理员）。");
    } else if (oidcBind === "err") {
      const hints: Record<string, string> = {
        exchange: "授权码换取令牌失败，请重试或检查 IdP 与 Redirect URI。",
        verify: "ID Token 校验失败，请检查签名算法与 issuer 等配置。",
        discovery: "无法连接 OIDC 发现地址。",
        state: "安全校验失败（state），请重新发起绑定。",
        nonce: "缺少或无效的 nonce，请重新发起绑定。",
        nonce_mismatch: "nonce 不匹配，请重新发起绑定。",
        nosub: "IdP 返回的 token 缺少 sub。",
        nodb: "未连接 MySQL。",
        lookup: "查询绑定信息失败。",
        save: "保存绑定失败。",
        missing_code: "缺少授权参数，请重新发起绑定。",
        no_id_token: "IdP 未返回 id_token。",
        idp: oidcMessage ? `IdP 错误：${decodeURIComponent(oidcMessage)}` : "IdP 返回错误。",
      };
      toast.error(hints[oidcReason] ?? "绑定失败，请重试。");
    }
    setSearchParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete("oidc_bind");
        n.delete("reason");
        n.delete("message");
        return n;
      },
      { replace: true }
    );
  }, [oidcBind, oidcReason, oidcMessage, setSearchParams, refetch]);
  /** 管理员即可见；是否已连 MySQL 由平台用户页内说明 */
  const showPlatformUsers = status?.role === "admin";
  const showPlatformAudit = status?.role === "admin";

  return (
    <div className="mx-auto max-w-4xl pb-12">
      <div className="mb-8">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">账户与平台</h1>
        <p className="text-sm text-slate-500">
          仅平台层配置（数据库、Redis、登录与 OIDC），与 Kubernetes / vCenter 集群菜单独立。宝塔与 Ingress 请在「宝塔」工作区中配置。保存后写入{" "}
          <code className="text-xs">runtime-config.json</code> 并热重载。
        </p>
        {status?.loggedIn ? (
          <Link
            to="/account/personal"
            className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/50 px-4 py-3 text-sm font-medium text-sky-950 shadow-sm transition-colors hover:bg-sky-50"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-sky-700 ring-1 ring-sky-100">
                <UserCircle size={20} strokeWidth={2} />
              </span>
              个人中心（资料、OIDC、头像与我的资源）
            </span>
            <ChevronRight size={18} className="shrink-0 text-sky-500" aria-hidden />
          </Link>
        ) : null}
        {status?.loggedIn && !status.mysqlReachable ? (
          <div className="mb-6 rounded-lg border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm text-amber-950/90">
            当前未连接 MySQL 或用户表不可用，个人中心内资料将无法加载。请配置并连通 MySQL 后刷新。
          </div>
        ) : null}
        {showPlatformUsers && (
          <Link
            to="/account/users"
            className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-50"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Users size={18} strokeWidth={2} />
              </span>
              平台用户管理
            </span>
            <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden />
          </Link>
        )}
        {showPlatformAudit && (
          <Link
            to="/account/audit"
            className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-50"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                <FileText size={18} strokeWidth={2} />
              </span>
              平台审计
            </span>
            <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden />
          </Link>
        )}
        {showPlatformAudit && (
          <Link
            to="/account/site-stats"
            className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-50"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-800">
                <BarChart3 size={18} strokeWidth={2} />
              </span>
              站点统计
            </span>
            <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden />
          </Link>
        )}
      </div>
      <SettingsRuntimeSection variant="account" />
    </div>
  );
};

export default AccountSettings;
