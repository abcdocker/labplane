import React from "react";
import ClusterK8sAddonsSection from "@/pages/cluster/ClusterK8sAddonsSection";
import ClusterK8sDashboardMonitoringSection from "@/pages/cluster/ClusterK8sDashboardMonitoringSection";
import ClusterK8sKubePrometheusStackSection from "@/pages/cluster/ClusterK8sKubePrometheusStackSection";
import ClusterK8sVmLogSection from "@/pages/cluster/ClusterK8sVmLogSection";
import SettingsPrometheusSection from "@/pages/SettingsPrometheusSection";
import SettingsRuntimeSection from "@/pages/SettingsRuntimeSection";

const ClusterK8sSettings: React.FC = () => {
  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-2 sm:pb-12">
      <div>
        <h1 className="mb-2 text-2xl font-bold text-slate-900">Cluster settings</h1>
        <p className="text-sm text-slate-500">
          Kubernetes API、Prometheus、VictoriaMetrics（vmselect）与 VictoriaLogs（VMLog）等。保存至 <code className="text-xs">runtime-config.json</code>。右下角「使用文档」第四节有详细说明。
        </p>
        <p className="mt-2 text-sm text-slate-500">
          <strong className="font-medium text-slate-700">ingress-nginx（hostNetwork）</strong>：下方卡片会<strong className="text-slate-800">自动检测</strong>
          是否已安装；<strong className="font-medium text-slate-800">管理员</strong>可一键安装并在节点上监听 HTTP/HTTPS 端口（默认{" "}
          <strong className="font-medium">80</strong> / <strong className="font-medium">443</strong>）。国内拉取 GitHub 建议选「优先 ghproxy」或内网清单
          URL。端口可在本页运行时配置保存 <code className="text-xs">ingressNginxHostHttpPort</code> / <code className="text-xs">ingressNginxHostHttpsPort</code>；宝塔 <code className="text-xs">defaultPort</code> 与 HTTP 端口对齐。
        </p>
        <p className="mt-2 text-sm text-slate-500">
          <strong className="font-medium text-slate-700">kube-prometheus-stack</strong>：推荐优先使用独立卡片<strong className="text-slate-800">一键安装</strong>
          完整采集栈（Prometheus、kube-state-metrics、node-exporter、默认 ServiceMonitor），并可<strong className="text-slate-800">自动写入</strong>{" "}
          <code className="text-xs">prometheusUrlK8s</code>，使集群总览、配额趋势等页面立即有 PromQL 数据。
        </p>
        <p className="mt-2 text-sm text-slate-500">
          <strong className="font-medium text-slate-700">Kubernetes Dashboard + metrics-server（可选）</strong>：仅用于官方 Web UI 与{" "}
          <code className="text-xs">kubectl top</code>；与平台图表用的 Prometheus 栈无关。
        </p>
      </div>
      <ClusterK8sAddonsSection />
      <ClusterK8sKubePrometheusStackSection />
      <ClusterK8sDashboardMonitoringSection />
      <ClusterK8sVmLogSection />
      <SettingsRuntimeSection variant="k8s" />
      <SettingsPrometheusSection locale="en" />
    </div>
  );
};

export default ClusterK8sSettings;
