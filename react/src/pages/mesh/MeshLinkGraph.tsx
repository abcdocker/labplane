import React from "react";
import { Activity, Globe2, Network, Router, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { meshTrafficText as t } from "@/i18n/meshTraffic";

export type MeshGraphNode = {
  id: string;
  name: string;
  tsIp?: string;
  realIp?: string;
  os?: string;
  online: boolean;
  rx: number;
  tx: number;
};

export type MeshGraphEdge = {
  from: string;
  to: string;
  rx: number;
  tx: number;
  via: "direct" | "relay" | "offline";
  curAddr?: string;
  relay?: string;
};

export type MeshGraphHub = { id: string; name: string; host?: string; tsIp?: string; realIp?: string; os?: string };

const bytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
};

const linkStyle = {
  direct: { line: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  relay: { line: "bg-amber-500", badge: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  offline: { line: "bg-slate-300 dark:bg-slate-600", badge: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
} as const;

export const MeshLinkGraph: React.FC<{
  hubs: MeshGraphHub[];
  peers: MeshGraphNode[];
  edges: MeshGraphEdge[];
  cp?: { name: string; version?: string; nodesTotal?: number };
}> = ({ hubs, peers, edges, cp }) => {
  const [chosenHubId, setChosenHubId] = React.useState<string | null>(null);
  const selectedHub = hubs.find((hub) => hub.id === chosenHubId) ?? hubs[0];
  const peerById = React.useMemo(() => new Map(peers.map((peer) => [peer.id, peer])), [peers]);
  const visibleEdges = React.useMemo(() => edges
    .filter((edge) => edge.from === selectedHub?.id && peerById.has(edge.to))
    .sort((a, b) => {
      const onlineOrder = Number(b.via !== "offline") - Number(a.via !== "offline");
      return onlineOrder || (b.rx + b.tx) - (a.rx + a.tx);
    }), [edges, selectedHub?.id, peerById]);
  const onlineCount = visibleEdges.filter((edge) => edge.via !== "offline").length;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/50">
      {cp && <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300"><Globe2 className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{t.controlPlane}</p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{cp.name} <span className="text-slate-400 dark:text-slate-500">· {t.controlPlaneHint}</span></p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] text-slate-500 dark:text-slate-400">
          {cp.version && <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">{t.version} v{cp.version}</span>}
          {cp.nodesTotal != null && <span className="rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800">{t.registeredNodes} {Math.round(cp.nodesTotal)}</span>}
        </div>
      </div>}

      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400"><Router className="h-3.5 w-3.5" />{t.collectors}</div>
        <div className="flex gap-2 overflow-x-auto pb-0.5" role="group" aria-label={t.collectors}>
          {hubs.map((hub) => {
            const selected = selectedHub?.id === hub.id;
            const count = edges.filter((edge) => edge.from === hub.id).length;
            return <button key={hub.id} type="button" aria-pressed={selected} onClick={() => setChosenHubId(hub.id)}
              className={cn("flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                selected ? "border-indigo-400 bg-indigo-50 font-semibold text-indigo-800 dark:border-indigo-500 dark:bg-indigo-950/50 dark:text-indigo-200" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800")}
              title={hub.host}>
              <span className="max-w-40 truncate">{hub.name}</span><span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] tabular-nums dark:bg-slate-800">{count}</span>
            </button>;
          })}
        </div>
      </div>

      {selectedHub && <div className="grid gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6">
        <div className="relative">
          <div className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm dark:border-indigo-800 dark:bg-slate-900">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"><Network className="h-4 w-4" /></div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-indigo-500 dark:text-indigo-300">{t.collectorView}</p>
            <p className="mt-1 break-all text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedHub.name}</p>
            <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">{t.collectorHost}</p>
            <p className="break-all font-mono text-[11px] text-slate-600 dark:text-slate-300">{selectedHub.host || "—"}</p>
            {(selectedHub.tsIp || selectedHub.realIp || selectedHub.os) && <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-[10px] dark:border-slate-800">
              {selectedHub.os && <p className="text-slate-600 dark:text-slate-300">{selectedHub.os}</p>}
              {selectedHub.tsIp && <p className="break-all font-mono text-slate-600 dark:text-slate-300">{t.tailscaleIp} · {selectedHub.tsIp}</p>}
              {selectedHub.realIp && <p className="break-all font-mono text-slate-600 dark:text-slate-300">{t.realIp} · {selectedHub.realIp}</p>}
            </div>}
            <div className="mt-4 flex gap-3 border-t border-slate-100 pt-3 text-[11px] dark:border-slate-800">
              <span className="text-emerald-600 dark:text-emerald-400">{onlineCount} {t.online}</span>
              <span className="text-slate-500 dark:text-slate-400">{visibleEdges.length} {t.visiblePeers}</span>
            </div>
          </div>
          <div className="hidden lg:block absolute left-full top-16 h-px w-6 bg-indigo-300 dark:bg-indigo-700" aria-hidden="true" />
        </div>

        <div className="relative min-w-0 space-y-2.5 lg:border-l lg:border-slate-200 lg:pl-6 dark:lg:border-slate-700">
          {visibleEdges.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">{t.noPeers}</p>}
          {visibleEdges.map((edge) => {
            const peer = peerById.get(edge.to)!;
            const style = linkStyle[edge.via];
            const otherCollectors = new Set(edges.filter((item) => item.to === peer.id).map((item) => item.from)).size;
            const viaLabel = edge.via === "direct" ? t.direct : edge.via === "relay" ? t.relay : t.offline;
            const pathDetail = edge.via === "direct" ? edge.curAddr : edge.via === "relay" ? edge.relay : undefined;
            return <div key={edge.to} className="relative rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:px-4">
              <span className={cn("absolute left-0 top-0 h-full w-1 rounded-l-xl", style.line)} aria-hidden="true" />
              <span className={cn("hidden lg:block absolute -left-6 top-1/2 h-px w-6", style.line)} aria-hidden="true" />
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {peer.online ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-slate-400" />}
                    <span className="break-all text-xs font-semibold text-slate-800 dark:text-slate-100">{peer.name}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px]", peer.online ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400")}>{peer.online ? t.online : t.offline}</span>
                    {peer.os && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">{peer.os}</span>}
                  </div>
                  {otherCollectors > 1 && <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">{otherCollectors} {t.multiCollector}</p>}
                </div>
                <span className={cn("shrink-0 rounded-full px-2 py-1 text-[10px] font-medium", style.badge)}>{viaLabel}</span>
              </div>
              <div className="mt-3 grid gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-[10px] sm:grid-cols-3 dark:border-slate-800">
                <div><p className="text-slate-400 dark:text-slate-500">{t.tailscaleIp}</p><p className="mt-0.5 break-all font-mono text-slate-700 dark:text-slate-200">{peer.tsIp || "—"}</p></div>
                <div><p className="text-slate-400 dark:text-slate-500">{t.realIp}</p><p className="mt-0.5 break-all font-mono text-slate-700 dark:text-slate-200">{peer.realIp || t.unknownIp}</p></div>
                <div><p className="flex items-center gap-1 text-slate-400 dark:text-slate-500"><Activity className="h-3 w-3" />{t.traffic}</p><p className="mt-0.5 font-mono tabular-nums text-slate-700 dark:text-slate-200">{bytes(edge.rx + edge.tx)} <span className="text-slate-400 dark:text-slate-500">({t.received} {bytes(edge.rx)} · {t.sent} {bytes(edge.tx)})</span></p></div>
              </div>
              {pathDetail && <p className="mt-2 break-all font-mono text-[10px] text-slate-400 dark:text-slate-500">{viaLabel} · {pathDetail}</p>}
            </div>;
          })}
        </div>
      </div>}
    </div>
  );
};
