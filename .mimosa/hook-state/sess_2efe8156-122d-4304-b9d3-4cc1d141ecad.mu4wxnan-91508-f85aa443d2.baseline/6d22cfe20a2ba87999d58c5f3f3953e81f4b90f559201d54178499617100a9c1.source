import React from "react";
import { Link, Outlet } from "react-router-dom";
import { Anchor, Settings2, Ship } from "lucide-react";
import { Button } from "@/components/ui/button";

const HarborSection: React.FC = () => {
  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-cyan-200/60 bg-gradient-to-br from-cyan-950/[0.03] via-white to-sky-100/40 p-6 shadow-sm sm:p-8">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/80 bg-gradient-to-br from-cyan-500/15 to-sky-500/10 shadow-inner">
              <Ship className="h-7 w-7 text-cyan-700" strokeWidth={1.75} aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.65rem]">Harbor 镜像仓库</h1>
                <span className="rounded-full border border-cyan-200/80 bg-white/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-800">
                  API v2.0
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                浏览项目、镜像仓库、制品与标签；支持一键复制镜像地址与{" "}
                <code className="rounded-md bg-slate-100/90 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">
                  docker pull
                </code>
                。凭据写入运行时{" "}
                <code className="rounded-md bg-slate-100/90 px-1.5 py-0.5 font-mono text-[11px] text-slate-800">
                  harborBaseUrl
                </code>
                等字段（含 Robot 账号）。
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Anchor className="h-3.5 w-3.5 text-cyan-600" aria-hidden />
                  与 Kubernetes 工作区联动
                </span>
                <span className="hidden text-slate-300 sm:inline">·</span>
                <span>删除制品仅管理员</span>
              </p>
            </div>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="shrink-0 border-cyan-200/90 bg-white/90 text-cyan-900 shadow-sm hover:bg-cyan-50"
          >
            <Link to="/cluster/settings" className="gap-2">
              <Settings2 className="h-4 w-4" aria-hidden />
              集群设置
            </Link>
          </Button>
        </div>
      </div>
      <Outlet />
    </div>
  );
};

export default HarborSection;
