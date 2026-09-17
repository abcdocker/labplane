import React from "react";
import SettingsRuntimeSection from "@/pages/SettingsRuntimeSection";

const VCenterSettings: React.FC = () => {
  return (
    <div className="mx-auto max-w-4xl pb-2 sm:pb-12">
      <div className="mb-8">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">vCenter 设置</h1>
        <p className="text-sm text-slate-500">
          vCenter 连接、<strong className="text-slate-700">Prometheus（vCenter 监控数据源）</strong>与虚拟机 SSH
          默认凭据。监控地址填与 Prometheus 兼容的根 URL（含 VictoriaMetrics vmselect）；保存后写入{" "}
          <code className="text-xs">runtime-config.json</code>。
        </p>
      </div>
      <SettingsRuntimeSection variant="vcenter" />
    </div>
  );
};

export default VCenterSettings;
