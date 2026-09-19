import React, { useState } from "react";
import { ChevronDown, ChevronUp, KeyRound } from "lucide-react";

const guides: Record<string, { title: string; steps: string[] }> = {
  tencent: {
    title: "如何获取腾讯云 API 密钥",
    steps: [
      "登录腾讯云控制台 (https://console.cloud.tencent.com)",
      "右上角头像 → 访问管理 → API 密钥管理",
      "点击「新建密钥」，复制 SecretId 和 SecretKey",
      "注意：SecretKey 仅显示一次，请妥善保存",
      "SecretId 是 API 密钥 ID，不是腾讯云账号 ID（APPID）",
      "建议为密钥配置最小权限策略（如 QcloudCOSFullAccess、QcloudCVMReadOnlyAccess 等）",
    ],
  },
  qiniu: {
    title: "如何获取七牛云 AccessKey",
    steps: [
      "登录七牛云控制台 (https://portal.qiniu.com)",
      "右上角头像 → 密钥管理",
      "复制 AK（AccessKey）和 SK（SecretKey）",
      "注意：SecretKey 仅部分显示，完整密钥需点击显示",
    ],
  },
  upyun: {
    title: "如何获取又拍云操作员密码",
    steps: [
      "登录又拍云控制台 (https://console.upyun.com)",
      "进入「云存储」→ 选择对应的服务",
      "服务管理 → 操作员管理，查看或创建操作员",
      "复制服务名称、操作员名称和操作员密码",
    ],
  },
};

export const CloudAuthGuide: React.FC<{ provider: "tencent" | "qiniu" | "upyun" }> = ({ provider }) => {
  const [open, setOpen] = useState(false);
  const g = guides[provider];
  if (!g) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <span className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-slate-500" />
          {g.title}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          <ol className="list-decimal space-y-1.5 pl-4 text-sm text-slate-600">
            {g.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};
