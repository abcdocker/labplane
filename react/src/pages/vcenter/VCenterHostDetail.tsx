import React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Monitor } from "lucide-react";
import { apiGetJson } from "@/lib/api";
import { useAppConfig } from "@/hooks/use-app-config";
import type { VCenterHostDetailResponse } from "./types";
import { VCenterHostPrometheusDetail } from "./VCenterHostPrometheusDetail";
import { IdracVncConsole } from "./IdracVncConsole";

const VCenterHostDetail: React.FC = () => {
  const { moref = "" } = useParams<{ moref: string }>();
  const decoded = decodeURIComponent(moref);

  const detailQ = useQuery({
    queryKey: ["vcenter-host", decoded],
    queryFn: ({ signal }) =>
      apiGetJson<VCenterHostDetailResponse>(
        `/api/vcenter/hosts/${encodeURIComponent(decoded)}`,
        { signal }
      ),
    enabled: decoded.length > 0,
  });

  const h = detailQ.data?.host;
  const cfgQ = useAppConfig();
  const idracHost = cfgQ.data?.idracHost as string | undefined;
  const idracVncPassword = cfgQ.data?.idracVncPassword as string | undefined;
  const hasIdrac = Boolean(idracHost);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/cluster/vcenter/hosts"
          className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          宿主机列表
        </Link>
      </div>

      {detailQ.isLoading && <p className="text-sm text-slate-500">加载中…</p>}
      {detailQ.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{(detailQ.error as Error).message}</p>
      )}

      {hasIdrac && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start gap-2">
              <Monitor className="mt-0.5 h-5 w-5 text-violet-600" />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  iDRAC VNC 控制台
                </p>
                <p className="text-xs text-slate-500">
                  通过 iDRAC 带外 VNC Server 直接预览宿主机画面（需 iDRAC 侧启用 VNC）。
                </p>
              </div>
            </div>
          </div>
          <IdracVncConsole
            vncPassword={idracVncPassword}
            className="h-[min(68vh,760px)] rounded-lg border border-slate-800"
          />
        </div>
      )}

      {h?.name ? (
        <VCenterHostPrometheusDetail
          moref={decoded}
          hostName={h.name}
          managementVmkIp={h.managementVmkIp}
        />
      ) : null}
    </div>
  );
};

export default VCenterHostDetail;
