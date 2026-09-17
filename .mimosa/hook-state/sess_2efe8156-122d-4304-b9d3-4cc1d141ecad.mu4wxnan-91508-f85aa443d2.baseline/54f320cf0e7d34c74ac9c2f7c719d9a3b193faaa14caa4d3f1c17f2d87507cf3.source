import React from "react";
import SettingsRuntimeSection from "@/pages/SettingsRuntimeSection";

const BaotaSettingsPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-4xl pb-2 sm:pb-12">
      <div className="mb-8">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">宝塔与 Ingress</h1>
        <p className="text-sm text-slate-500">
          面板地址、API Key、DDNS、同步间隔，以及宝塔 HTTPS 证书来源（证书名或 PEM/KEY 路径）；保存后写入 runtime-config 并热重载。数据库、Redis 与登录请在「账户与平台」中配置。
        </p>
      </div>
      <SettingsRuntimeSection variant="baota" />
    </div>
  );
};

export default BaotaSettingsPage;
