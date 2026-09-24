import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, Calendar, Globe, KeyRound, LayoutDashboard, Server, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/cluster/apps/dns", label: "概览", icon: LayoutDashboard, exact: true },
  { to: "/cluster/apps/dns/accounts", label: "服务商账号", icon: KeyRound, exact: false },
  { to: "/cluster/apps/dns/domains", label: "域名管理", icon: Globe, exact: false },
  { to: "/cluster/apps/dns/records", label: "解析记录", icon: Server, exact: false },
  { to: "/cluster/apps/dns/failover", label: "健康监测", icon: Activity, exact: false },
  { to: "/cluster/apps/dns/scheduled", label: "定时任务", icon: Calendar, exact: false },
  { to: "/cluster/apps/dns/certs", label: "SSL 证书", icon: ShieldCheck, exact: false },
] as const;

const DnsSubNav: React.FC = () => {
  const loc = useLocation();
  return (
    <div className="flex flex-nowrap gap-1.5 overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-50/80 p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
      {links.map(({ to, label, icon: Icon, exact }) => {
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
  );
};

export default DnsSubNav;
