import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Terminal, FolderOpen } from "lucide-react";
import { apiGetJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import CloudHostSshTerminal from "./CloudHostSshTerminal";
import CloudHostSftpPanel from "./CloudHostSftpPanel";
import type { CloudHostRow } from "./CloudHosts";

type CloudHostsListResponse = { hosts: CloudHostRow[] };

const CloudHostSshPage: React.FC = () => {
  const { hostId = "" } = useParams<{ hostId: string }>();
  const [panel, setPanel] = useState<"ssh" | "sftp">("ssh");

  const listQ = useQuery({
    queryKey: ["cloud-hosts"],
    queryFn: ({ signal }) => apiGetJson<CloudHostsListResponse>("/api/cloud-hosts", { signal }),
  });

  const host = listQ.data?.hosts.find((h) => h.id === hostId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/cluster/vcenter/cloud"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-50 hover:text-violet-900"
        >
          <ArrowLeft className="h-4 w-4" />
          返回公有云列表
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-br from-white via-slate-50/80 to-violet-50/30 shadow-lg shadow-violet-500/5">
        <div className="flex flex-wrap items-start gap-4 border-b border-violet-100/90 bg-white/90 px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-lg shadow-violet-500/25">
            <Terminal className="h-7 w-7" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              公有云 · SSH / SFTP
            </h1>
            {host ? (
              <p className="mt-1 font-mono text-sm text-violet-800/90">
                {host.name}{" "}
                <span className="text-slate-500">
                  · {host.sshHost}:{host.sshPort || 22}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                {listQ.isLoading ? "加载主机信息…" : "未找到该主机，可能已被删除"}
              </p>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col px-4 pb-8 pt-3 sm:px-8">
          {host ? (
            <div className="flex min-h-[calc(100dvh-12rem)] flex-1 flex-col gap-4">
              <nav
                className="flex shrink-0 gap-0 border-b border-slate-200/90"
                aria-label="SSH 与 SFTP"
              >
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                    panel === "ssh"
                      ? "border-b-2 border-violet-600 text-violet-800 -mb-px"
                      : "border-b-2 border-transparent text-slate-500 hover:text-slate-800"
                  )}
                  onClick={() => setPanel("ssh")}
                >
                  <Terminal className="h-4 w-4 shrink-0" />
                  SSH
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                    panel === "sftp"
                      ? "border-b-2 border-violet-600 text-violet-800 -mb-px"
                      : "border-b-2 border-transparent text-slate-500 hover:text-slate-800"
                  )}
                  onClick={() => setPanel("sftp")}
                >
                  <FolderOpen className="h-4 w-4 shrink-0" />
                  SFTP
                </button>
              </nav>

              <div className="flex min-h-0 flex-1 flex-col">
                {panel === "ssh" ? (
                  <CloudHostSshTerminal
                    variant="page"
                    hostId={host.id}
                    displayName={host.name}
                  />
                ) : (
                  <CloudHostSftpPanel hostId={host.id} displayName={host.name} />
                )}
              </div>
            </div>
          ) : !listQ.isLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">
              请返回{" "}
              <Link to="/cluster/vcenter/cloud" className="font-medium text-violet-700 underline">
                公有云列表
              </Link>{" "}
              重新选择主机。
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default CloudHostSshPage;
