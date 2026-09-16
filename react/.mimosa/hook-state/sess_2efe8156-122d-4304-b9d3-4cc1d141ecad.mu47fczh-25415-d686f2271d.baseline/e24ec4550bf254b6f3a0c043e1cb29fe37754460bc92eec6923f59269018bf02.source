import React from "react";
import { Link, NavLink, Outlet, useParams } from "react-router-dom";
import {
  Boxes,
  ChevronRight,
  Container,
  FileText,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  ListOrdered,
  Network,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resourceTabMeta,
  WORKSPACE_NAV_GROUPS,
  type NamespaceWorkspaceResource,
} from "./clusterNamespaceRoutes";

const RESOURCE_ICONS: Record<
  NamespaceWorkspaceResource,
  React.ComponentType<{ className?: string; size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>
> = {
  deployments: Layers,
  statefulsets: ListOrdered,
  daemonsets: Container,
  services: Network,
  ingresses: Globe,
  pvcs: HardDrive,
  configmaps: FileText,
  secrets: KeyRound,
};

const ClusterNamespaceResourcesLayout: React.FC = () => {
  const { namespace: nsEncoded } = useParams<{ namespace: string }>();
  const namespace = nsEncoded ? decodeURIComponent(nsEncoded) : "";
  const base = `/cluster/ns/${encodeURIComponent(namespace)}`;

  if (!namespace) {
    return <p className="text-sm text-red-600">无效的命名空间</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-2 text-sm text-slate-500">
        <Link
          to="/cluster/ns"
          className="font-medium text-blue-600 hover:underline"
        >
          命名空间
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <span className="font-mono text-base font-semibold text-slate-900">{namespace}</span>
      </div>

      <div className="flex min-h-[480px] flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] lg:flex-row">
        <aside className="w-full shrink-0 border-b border-slate-200 bg-gradient-to-b from-slate-50/95 to-slate-50/70 lg:w-60 lg:border-b-0 lg:border-r lg:border-slate-200/90">
          <nav className="p-3 lg:sticky lg:top-0 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              资源类型
            </p>

            <NavLink
              to={`${base}/pods`}
              className={({ isActive }) =>
                cn(
                  "mb-3 flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all",
                  isActive
                    ? "border-blue-200/90 bg-white font-semibold text-blue-900 shadow-sm ring-1 ring-blue-100"
                    : "border-transparent text-slate-600 hover:border-slate-200/90 hover:bg-white/90"
                )
              }
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100/90 text-blue-700">
                <Boxes className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="min-w-0">Pod</span>
            </NavLink>

            {WORKSPACE_NAV_GROUPS.map((group) => (
              <div key={group.title} className="mb-4 last:mb-0">
                <p className="mb-1.5 px-2 text-[11px] font-semibold text-slate-500">{group.title}</p>
                <div className="flex flex-col gap-1">
                  {group.items.map((key: NamespaceWorkspaceResource) => {
                    const meta = resourceTabMeta(key);
                    const Icon = RESOURCE_ICONS[key];
                    return (
                      <NavLink
                        key={key}
                        to={`${base}/${key}`}
                        end
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-all",
                            isActive
                              ? "border-slate-200/90 bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                              : "border-transparent text-slate-600 hover:border-slate-200/80 hover:bg-white/80"
                          )
                        }
                        title={meta.detail}
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            "bg-white/90 text-slate-600 ring-1 ring-slate-200/70"
                          )}
                        >
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="min-w-0 leading-snug">{meta.title}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 bg-white p-4 sm:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default ClusterNamespaceResourcesLayout;
