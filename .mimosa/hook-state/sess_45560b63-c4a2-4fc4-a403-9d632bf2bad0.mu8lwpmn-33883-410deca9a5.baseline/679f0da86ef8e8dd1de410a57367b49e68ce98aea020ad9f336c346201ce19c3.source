import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Cloud, HardDrive, KeyRound, LayoutDashboard, Server, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Outlet } from "react-router-dom";

const links: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean }[] = [
  { to: "/cluster/apps/tencent-cloud", label: "全局预览", icon: LayoutDashboard, exact: true },
  { to: "/cluster/apps/tencent-cloud/cvm", label: "云服务器 CVM", icon: Server },
  { to: "/cluster/apps/tencent-cloud/lighthouse", label: "轻量云", icon: Server },
  { to: "/cluster/apps/tencent-cloud/cos", label: "对象存储", icon: HardDrive },
  { to: "/cluster/apps/tencent-cloud/cdn", label: "CDN", icon: Cloud },
  { to: "/cluster/apps/tencent-cloud/ssl", label: "SSL 证书", icon: ShieldCheck },
  { to: "/cluster/apps/tencent-cloud/cam", label: "访问密钥", icon: KeyRound },
];

const TencentCloudLayout: React.FC = () => {
  const loc = useLocation();
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-nowrap gap-1.5 overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-50/80 p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
        {links.map(({ to, label, icon: Icon, exact = false }) => {
          const active = exact
            ? loc.pathname === to || loc.pathname === to + "/"
            : loc.pathname === to || loc.pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
};

export default TencentCloudLayout;
