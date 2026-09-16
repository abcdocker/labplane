const zhCN = {
  connecting: "正在通过平台内部网络申请 WebMKS 会话…",
  proxyUpgradeFailed:
    "平台入口未完成 WebSocket 升级（1006）。请检查 cmdb.example.com 反向代理是否转发 Upgrade 与 Connection 请求头。",
  disconnected: "控制台会话已断开。",
  internalConnectionFailed:
    "WebMKS 内部连接失败。平台不会跳转 vCenter 或 SSO，请点击“新建会话”重试。",
  securityNegotiationFailed: "WebMKS 安全协商失败。",
  securityNegotiationFailedWithReason: "WebMKS 安全协商失败：{reason}",
  credentialsRequired: "ESXi 返回了额外认证要求，WebMKS ticket 未被接受。",
  ctrlAltDelete: "Ctrl+Alt+Del",
  newSession: "新建会话",
  fullscreen: "全屏",
  fitToContainerOn: "自适应分辨率",
  fitToContainerOff: "原始分辨率",
  stretchOn: "拉伸铺满",
  stretchOff: "退出拉伸",
  retry: "重试",
  configureESXi: "配置 ESXi 地址",
  panelTitle: "vSphere 原生控制台",
  panelDescription:
    "使用 WebMKS 直接操作虚拟机屏幕和键盘，不依赖 Guest IP、VMware Tools 或 SSH。",
  openStandalone: "独立窗口",
  expandFullscreen: "展开全屏",
  exitExpand: "退出全屏",
  usageHint:
    "点击黑色控制台区域后即可输入。控制台相当于物理显示器和键盘；操作系统仍可能要求先登录。",
} as const;

export type VCenterConsoleTextKey = keyof typeof zhCN;

export function vcenterConsoleText(
  key: VCenterConsoleTextKey,
  values?: Record<string, string>
): string {
  let text: string = zhCN[key];
  for (const [name, value] of Object.entries(values ?? {})) {
    text = text.replaceAll(`{${name}}`, value);
  }
  return text;
}
