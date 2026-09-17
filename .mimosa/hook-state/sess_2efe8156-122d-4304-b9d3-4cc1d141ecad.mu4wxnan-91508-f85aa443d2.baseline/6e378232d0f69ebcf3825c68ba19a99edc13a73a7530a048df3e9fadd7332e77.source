/** 监控中心内置图：直连 Prometheus / vmselect（与集群设置、vCenter 设置中的数据源一致），不经 Grafana。 */

export type MonitoringDataScope = "k8s" | "vcenter";
export type PanelDisplayMode = "single" | "matrix";

/** single 图：将查询结果按 1024³ 换算后展示，纵轴/Tooltip 带 G（GiB）；PromQL 仍为字节。 */
export type OpsMonitoringValueFormat = "bytes_gib";

export type OpsMonitoringPreset = {
  id: string;
  category: string;
  title: string;
  scope: MonitoringDataScope;
  promql: string;
  display: PanelDisplayMode;
  /** matrix 时用于序列命名的 metric 标签优先级 */
  labelKeys?: string[];
  /** 仅 single：Y 轴与 Tooltip 以 GiB（显示为 G）展示 */
  valueFormat?: OpsMonitoringValueFormat;
};

export const OPS_MONITORING_PRESETS: OpsMonitoringPreset[] = [
  // —— Kubernetes ——
  {
    id: "preset-k8s-cpu-sum",
    category: "集群资源",
    title: "容器 CPU 使用速率（核）",
    scope: "k8s",
    display: "single",
    promql: 'sum(rate(container_cpu_usage_seconds_total{container!=""}[5m]))',
  },
  {
    id: "preset-k8s-mem-sum",
    category: "集群资源",
    title: "容器内存 working set（GiB，纵轴 G）",
    scope: "k8s",
    display: "single",
    valueFormat: "bytes_gib",
    promql: 'sum(container_memory_working_set_bytes{container!=""})',
  },
  {
    id: "preset-k8s-ns-cpu",
    category: "集群资源",
    title: "按命名空间 CPU（核/s）",
    scope: "k8s",
    display: "matrix",
    labelKeys: ["namespace"],
    promql: 'sum by (namespace) (rate(container_cpu_usage_seconds_total{container!=""}[5m]))',
  },
  {
    id: "preset-k8s-running-pods",
    category: "工作负载",
    title: "Running Pod 数（kube-state-metrics）",
    scope: "k8s",
    display: "single",
    promql: 'sum(kube_pod_status_phase{phase="Running"})',
  },
  {
    id: "preset-k8s-pending-pods",
    category: "工作负载",
    title: "Pending Pod 数",
    scope: "k8s",
    display: "single",
    promql: 'sum(kube_pod_status_phase{phase="Pending"})',
  },
  {
    id: "preset-k8s-apiserver-qps",
    category: "控制面",
    title: "API Server 请求速率",
    scope: "k8s",
    display: "single",
    promql: "sum(rate(apiserver_request_total[5m]))",
  },
  {
    id: "preset-k8s-nodes-ready",
    category: "节点",
    title: "Ready 节点数",
    scope: "k8s",
    display: "single",
    promql: 'sum(kube_node_status_condition{condition="Ready",status="true"})',
  },
  {
    id: "preset-k8s-scheduler-rate",
    category: "控制面",
    title: "调度器尝试速率",
    scope: "k8s",
    display: "single",
    promql: "sum(rate(scheduler_schedule_attempts_total[5m]))",
  },
  // —— vCenter / Telegraf vmware_* ——
  {
    id: "preset-vc-host-cpu",
    category: "VMware 主机",
    title: "各 ESXi CPU 使用（vmware_host_cpu_usage）",
    scope: "vcenter",
    display: "matrix",
    labelKeys: ["host_name"],
    promql: "max by (host_name)(vmware_host_cpu_usage)",
  },
  {
    id: "preset-vc-host-mem-pct",
    category: "VMware 主机",
    title: "各 ESXi 内存使用率（%）",
    scope: "vcenter",
    display: "matrix",
    labelKeys: ["host_name"],
    promql:
      "max by (host_name)((vmware_host_memory_usage / clamp_min(vmware_host_memory_max, 1)) * 100)",
  },
  {
    id: "preset-vc-ds-global-pct",
    category: "存储",
    title: "数据存储已用空间占比（全局汇总）",
    scope: "vcenter",
    display: "single",
    promql:
      "((sum(vmware_datastore_capacity_size) - sum(vmware_datastore_freespace_size)) / clamp_min(sum(vmware_datastore_capacity_size), 1)) * 100",
  },
  {
    id: "preset-vc-vm-cpu-mhz",
    category: "虚拟机",
    title: "虚拟机 CPU（MHz 总量，rate 5m）",
    scope: "vcenter",
    display: "single",
    // Telegraf「VMware vCenter」多为 vmware_*；部分环境为 vsphere_* input
    promql:
      "sum(rate(vmware_vm_cpu_usagemhz_average[5m])) or sum(rate(vsphere_vm_cpu_usagemhz_average[5m]))",
  },
  {
    id: "preset-vc-vsphere-cpu",
    category: "虚拟机",
    title: "VM CPU MHz（按 VM 名拆线，vmware_/vsphere_）",
    scope: "vcenter",
    display: "matrix",
    // 与 vCenter ESXi 看板、列表 IO 一致：vm_name / vmname；监控中心走 query_range，对 counter 用 rate
    labelKeys: ["vm_name", "vmname", "name"],
    promql:
      "sum by (vm_name) (rate(vmware_vm_cpu_usagemhz_average[5m])) or sum by (vmname) (rate(vmware_vm_cpu_usagemhz_average[5m])) or sum by (vm_name) (rate(vsphere_vm_cpu_usagemhz_average[5m])) or sum by (vmname) (rate(vsphere_vm_cpu_usagemhz_average[5m]))",
  },
];

export function presetCategoriesForScope(scope: MonitoringDataScope): string[] {
  const s = new Set<string>();
  for (const p of OPS_MONITORING_PRESETS) {
    if (p.scope === scope) s.add(p.category);
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b, "zh-CN"));
}
