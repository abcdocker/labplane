import React from "react";
import { CollapsibleManual } from "@/components/CollapsibleManual";
/**
 * 说明：终端与 SSH 均为「浏览器 → 本平台 → 服务端再连目标」，
 * 用户侧无需与虚拟机 / Pod / 云主机网络直连。
 */
const PlatformRelayBanner: React.FC<{ className?: string; compact?: boolean }> = ({
  className,
  compact,
}) => {
  if (compact) {
    return (
      <CollapsibleManual
        storageKey="platform.relay-banner.compact"
        title="平台转发"
        variant="skyCompact"
        className={className}
        titleClassName="text-sky-900"
      >
        <p>浏览器只连本站；SSH 由服务端拨号，凭据不出浏览器。</p>
      </CollapsibleManual>
    );
  }
  return (
    <CollapsibleManual
      storageKey="platform.relay-banner.full"
      title="平台转发（非本机直连）"
      variant="sky"
      className={className}
      titleClassName="text-sky-900"
    >
      <p>
        您只需登录本平台。浏览器仅通过 HTTPS / WebSocket 连接本站，<strong>不会</strong>向虚拟机、云主机或集群中的
        Pod 发起 SSH / TCP 直连。
      </p>
      <p className="mt-2 text-sky-900/90">
        SSH 与容器终端均由<strong>平台服务端</strong>（kube-bt-sync 进程）在部署侧发起并转发；您的办公电脑无需与目标网段互通。
      </p>
      <p className="mt-2 text-[11px] text-sky-800/85">
        运维侧请把本服务部署在能访问 vCenter、Kubernetes API 以及目标 SSH 地址的网络环境中；凭据始终保存在服务端，不经浏览器外传。
      </p>
    </CollapsibleManual>
  );
};

export default PlatformRelayBanner;
