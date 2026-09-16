import React from "react";

/**
 * 典型部署：kube-bt-sync 以 Pod 跑在集群内，浏览器经 Ingress/NodePort 访问；进程经 client-go 调 API，
 * 并出站访问宝塔、Prometheus/VM、MySQL、Redis、vCenter、云主机 SSH 等（以运行时配置为准）。
 */
export function PlatformArchitectureDiagram() {
  return (
    <figure className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 shadow-sm">
      <figcaption className="mb-3 text-center text-xs font-medium text-slate-700">
        图：平台典型架构（控制台以 Deployment / Pod 部署在 Kubernetes 集群内）
      </figcaption>
      <svg
        viewBox="0 0 720 448"
        className="mx-auto h-auto w-full max-w-[720px]"
        role="img"
        aria-label="kube-bt-sync 运行在 Kubernetes Pod 内，经 Ingress 或 NodePort 对外提供 Web；Pod 访问 API Server 与 PVC，并连接宝塔、监控、数据库与 vCenter 等"
      >
        <defs>
          <marker id="pa-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <polygon points="0 0, 7 3.5, 0 7" fill="#64748b" />
          </marker>
          <marker id="pa-dash" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <polygon points="0 0, 7 3.5, 0 7" fill="#94a3b8" />
          </marker>
        </defs>

        <rect x="260" y="8" width="200" height="44" rx="8" fill="#e0f2fe" stroke="#0284c7" strokeWidth="1.5" />
        <text x="360" y="28" textAnchor="middle" fill="#0c4a6e" fontSize="12" fontWeight="600">
          用户浏览器
        </text>
        <text x="360" y="42" textAnchor="middle" fill="#0369a1" fontSize="10">
          HTTPS / HTTP
        </text>

        <rect x="235" y="72" width="250" height="40" rx="6" fill="#fef3c7" stroke="#d97706" strokeWidth="1.5" />
        <text x="360" y="90" textAnchor="middle" fill="#92400e" fontSize="11" fontWeight="600">
          Ingress / NodePort（可选）
        </text>
        <text x="360" y="104" textAnchor="middle" fill="#b45309" fontSize="9">
          → Service → Pod :8080
        </text>

        <line x1="360" y1="52" x2="360" y2="72" stroke="#475569" strokeWidth="1.5" markerEnd="url(#pa-arrow)" />

        <rect x="24" y="132" width="672" height="256" rx="12" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 4" />
        <text x="40" y="154" fill="#475569" fontSize="12" fontWeight="600">
          Kubernetes 集群
        </text>

        <rect x="44" y="172" width="128" height="68" rx="8" fill="#ede9fe" stroke="#7c3aed" strokeWidth="1.5" />
        <text x="108" y="198" textAnchor="middle" fill="#5b21b6" fontSize="11" fontWeight="600">
          API Server
        </text>
        <text x="108" y="216" textAnchor="middle" fill="#6d28d9" fontSize="9">
          client-go
        </text>
        <text x="108" y="230" textAnchor="middle" fill="#6d28d9" fontSize="9">
          RBAC
        </text>

        <rect x="220" y="164" width="280" height="100" rx="10" fill="#ecfdf5" stroke="#059669" strokeWidth="2" />
        <text x="360" y="188" textAnchor="middle" fill="#065f46" fontSize="13" fontWeight="700">
          Pod：kube-bt-sync
        </text>
        <text x="360" y="208" textAnchor="middle" fill="#047857" fontSize="10">
          Gin API、嵌入前端、WebSocket（终端 / 日志）
        </text>
        <text x="360" y="224" textAnchor="middle" fill="#047857" fontSize="9">
          in-cluster SA 或 kubeconfig
        </text>
        <text x="360" y="240" textAnchor="middle" fill="#047857" fontSize="9">
          一键装 ingress-nginx hostNetwork（出站拉 YAML，可 ghproxy）
        </text>

        <rect x="48" y="248" width="200" height="40" rx="6" fill="#ecfeff" stroke="#0891b2" strokeWidth="1.2" />
        <text x="148" y="266" textAnchor="middle" fill="#155e75" fontSize="9" fontWeight="600">
          ingress-nginx 控制器
        </text>
        <text x="148" y="280" textAnchor="middle" fill="#0e7490" fontSize="8">
          hostNetwork · 可选固定 Node
        </text>

        <rect x="270" y="278" width="180" height="48" rx="8" fill="#fff7ed" stroke="#ea580c" strokeWidth="1.5" />
        <text x="360" y="300" textAnchor="middle" fill="#9a3412" fontSize="11" fontWeight="600">
          PVC → /data
        </text>
        <text x="360" y="316" textAnchor="middle" fill="#c2410c" fontSize="9">
          runtime-config、审计、密钥存储等
        </text>

        <line x1="360" y1="264" x2="360" y2="278" stroke="#059669" strokeWidth="1.5" />
        <line x1="360" y1="112" x2="360" y2="164" stroke="#475569" strokeWidth="1.5" markerEnd="url(#pa-arrow)" />
        <line x1="220" y1="214" x2="172" y2="214" stroke="#475569" strokeWidth="1.5" markerEnd="url(#pa-arrow)" />
        <line x1="148" y1="248" x2="148" y2="230" stroke="#0891b2" strokeWidth="1" strokeDasharray="3 2" opacity="0.85" />
        <text x="152" y="242" fill="#0e7490" fontSize="7">
          集群内工作节点
        </text>

        <text x="548" y="182" fill="#334155" fontSize="11" fontWeight="600">
          出站（可配置）
        </text>

        <rect x="520" y="192" width="176" height="22" rx="4" fill="#f1f5f9" stroke="#64748b" />
        <text x="608" y="207" textAnchor="middle" fill="#334155" fontSize="9">
          宝塔 API（Ingress 同步）
        </text>
        <rect x="520" y="222" width="176" height="22" rx="4" fill="#f1f5f9" stroke="#64748b" />
        <text x="608" y="237" textAnchor="middle" fill="#334155" fontSize="9">
          Prometheus / vmselect
        </text>
        <rect x="520" y="252" width="176" height="22" rx="4" fill="#f1f5f9" stroke="#64748b" />
        <text x="608" y="267" textAnchor="middle" fill="#334155" fontSize="9">
          MySQL · Redis
        </text>
        <rect x="520" y="282" width="176" height="22" rx="4" fill="#f1f5f9" stroke="#64748b" />
        <text x="608" y="297" textAnchor="middle" fill="#334155" fontSize="9">
          vCenter · 云主机 SSH
        </text>

        <line x1="500" y1="203" x2="518" y2="203" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="4 3" markerEnd="url(#pa-dash)" />
        <line x1="500" y1="233" x2="518" y2="233" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="4 3" markerEnd="url(#pa-dash)" />
        <line x1="500" y1="263" x2="518" y2="263" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="4 3" markerEnd="url(#pa-dash)" />
        <line x1="500" y1="293" x2="518" y2="293" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="4 3" markerEnd="url(#pa-dash)" />
      </svg>
      <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-500">
        虚线表示由控制台进程主动发起的出站连接；实际是否启用取决于运行时中的宝塔、Prometheus、MySQL、Redis、vCenter 等配置。
        多副本部署时需共享 PVC 或使用 MySQL/Redis 等外部状态存储。集群设置中安装的 <strong className="text-slate-600">ingress-nginx</strong> 为可选入口：控制器常用{" "}
        <strong className="text-slate-600">hostNetwork</strong> 监听节点端口，并可 <strong className="text-slate-600">固定到指定 Node</strong>；安装/升级/改端口/卸载等操作在界面中均有二次确认。
      </p>
    </figure>
  );
}
