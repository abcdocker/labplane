import React from "react";
import { useParams } from "react-router-dom";
import { ClusterK8sListPage, type K8sColumn } from "./ClusterK8sListPage";
import { workloadListHostNetworkCell } from "./WorkloadHostNetworkBadge";
import { formatPodTemplatePortsPreview, parsePodTemplatePorts } from "./WorkloadPodTemplatePorts";

const ns: K8sColumn = { key: "namespace", header: "Namespace", mono: true };
const name: K8sColumn = { key: "name", header: "Name", mono: true };
const ready: K8sColumn = { key: "ready", header: "Ready（就绪/期望副本）" };
const age: K8sColumn = { key: "age", header: "Age（创建时间）", kind: "age" };

const workloadHostNetworkCol: K8sColumn = {
  key: "hostNetwork",
  header: "Pod 网络",
  format: (row) => workloadListHostNetworkCell(row as Record<string, unknown>),
};

const workloadPodTemplatePortsCol: K8sColumn = {
  key: "podTemplatePorts",
  header: "模板端口",
  format: (row) => {
    const r = row as Record<string, unknown>;
    const parsed = parsePodTemplatePorts(r.podTemplatePorts);
    const text = formatPodTemplatePortsPreview(parsed, 8);
    if (!text) return <span className="text-xs text-slate-400">—</span>;
    const full = formatPodTemplatePortsPreview(parsed, 999);
    return (
      <span
        className="block max-w-[220px] truncate font-mono text-[11px] text-slate-700"
        title={full}
      >
        {text}
      </span>
    );
  },
};

const labelsCol: K8sColumn = {
  key: "labels",
  header: "Labels（metadata.labels）",
  format: (row) => {
    const v = row.labels;
    if (typeof v === "string" && v.trim()) {
      return (
        <span className="block max-w-xl truncate text-xs text-slate-700" title={v}>
          {v}
        </span>
      );
    }
    return "—";
  },
};

export const ClusterDeployments: React.FC = () => (
  <ClusterK8sListPage
    title="Deployments"
    description="apps/v1 Deployment"
    apiSuffix="deployments"
    queryKey="k8s-deployments"
    columns={[ns, name, workloadHostNetworkCol, workloadPodTemplatePortsCol, labelsCol, ready, age]}
  />
);

export function ClusterDeploymentsScoped() {
  const { namespace } = useParams<{ namespace: string }>();
  if (!namespace) return null;
  return (
    <ClusterK8sListPage
      namespace={namespace}
      enableCrud
      workloadPodsLink
      workloadDetailSegment="deployments"
      title="Deployment"
      description="apps/v1 Deployment · 无状态副本集 · 与 ReplicaSet / Pod 通过 selector 关联"
      apiSuffix="deployments"
      queryKey="k8s-deployments"
      columns={[ns, name, workloadHostNetworkCol, workloadPodTemplatePortsCol, ready, age]}
    />
  );
}

export const ClusterStatefulSets: React.FC = () => (
  <ClusterK8sListPage
    title="StatefulSets"
    description="apps/v1 StatefulSet"
    apiSuffix="statefulsets"
    queryKey="k8s-statefulsets"
    columns={[ns, name, workloadHostNetworkCol, workloadPodTemplatePortsCol, labelsCol, ready, age]}
  />
);

export function ClusterStatefulSetsScoped() {
  const { namespace } = useParams<{ namespace: string }>();
  if (!namespace) return null;
  return (
    <ClusterK8sListPage
      namespace={namespace}
      enableCrud
      workloadPodsLink
      workloadDetailSegment="statefulsets"
      title="StatefulSet"
      description="apps/v1 StatefulSet · 有状态副本集 · 稳定网络标识与有序扩缩容"
      apiSuffix="statefulsets"
      queryKey="k8s-statefulsets"
      columns={[ns, name, workloadHostNetworkCol, workloadPodTemplatePortsCol, ready, age]}
    />
  );
}

export const ClusterDaemonSets: React.FC = () => (
  <ClusterK8sListPage
    title="DaemonSets"
    description="apps/v1 DaemonSet"
    apiSuffix="daemonsets"
    queryKey="k8s-daemonsets"
    columns={[ns, name, labelsCol, ready, age]}
  />
);

export function ClusterDaemonSetsScoped() {
  const { namespace } = useParams<{ namespace: string }>();
  if (!namespace) return null;
  return (
    <ClusterK8sListPage
      namespace={namespace}
      enableCrud
      workloadPodsLink
      workloadDetailSegment="daemonsets"
      title="DaemonSet"
      description="apps/v1 DaemonSet · 每节点一组 Pod；名称进入详情页可图形编辑或改 YAML（与 Deployment 一致）"
      apiSuffix="daemonsets"
      queryKey="k8s-daemonsets"
      columns={[ns, name, workloadHostNetworkCol, workloadPodTemplatePortsCol, ready, age]}
    />
  );
}

const pvcCols: K8sColumn[] = [
  ns,
  {
    key: "name",
    header: "名称（PVC · metadata.name）",
    mono: true,
  },
  labelsCol,
  {
    key: "status",
    header: "阶段（status.phase）",
  },
  {
    key: "capacity",
    header: "容量（status.capacity）",
    mono: true,
  },
  {
    key: "accessModes",
    header: "访问模式（spec.accessModes）",
    format: (row) => {
      const v = row.accessModes;
      if (Array.isArray(v)) return v.join(", ");
      return "—";
    },
  },
  {
    key: "storageClass",
    header: "StorageClass（spec.storageClassName）",
    mono: true,
  },
  age,
];

const pvcColsScoped = pvcCols.filter((c) => c.key !== "labels");

export const ClusterPVCs: React.FC = () => (
  <ClusterK8sListPage
    title="PersistentVolumeClaims"
    description="core/v1 PersistentVolumeClaim"
    apiSuffix="pvcs"
    queryKey="k8s-pvcs"
    columns={pvcCols}
  />
);

export function ClusterPVCsScoped() {
  const { namespace } = useParams<{ namespace: string }>();
  if (!namespace) return null;
  return (
    <ClusterK8sListPage
      namespace={namespace}
      enableCrud
      enablePvcExpand
      title="PersistentVolumeClaim（PVC）"
      description="core/v1 PersistentVolumeClaim · 对持久卷的声明与绑定"
      apiSuffix="pvcs"
      queryKey="k8s-pvcs"
      columns={pvcColsScoped}
    />
  );
}

const cmCols: K8sColumn[] = [
  ns,
  {
    key: "name",
    header: "名称（metadata.name）",
    mono: true,
  },
  labelsCol,
  {
    key: "keys",
    header: "键数量（data + binaryData 键名合计）",
  },
  age,
];

const cmColsScoped = cmCols.filter((c) => c.key !== "labels");

export const ClusterConfigMaps: React.FC = () => (
  <ClusterK8sListPage
    title="ConfigMaps"
    description="core/v1 ConfigMap（键数量含 binaryData）"
    apiSuffix="configmaps"
    queryKey="k8s-configmaps"
    columns={cmCols}
  />
);

export function ClusterConfigMapsScoped() {
  const { namespace } = useParams<{ namespace: string }>();
  if (!namespace) return null;
  return (
    <ClusterK8sListPage
      namespace={namespace}
      enableCrud
      title="ConfigMap"
      description="core/v1 ConfigMap · 非敏感配置 · data 与 binaryData"
      apiSuffix="configmaps"
      queryKey="k8s-configmaps"
      columns={cmColsScoped}
    />
  );
}

const secretCols: K8sColumn[] = [
  ns,
  {
    key: "name",
    header: "名称（metadata.name）",
    mono: true,
  },
  labelsCol,
  {
    key: "type",
    header: "类型（type）",
    mono: true,
  },
  {
    key: "keys",
    header: "键数量",
  },
  age,
];

const secretColsScoped = secretCols.filter((c) => c.key !== "labels");

export function ClusterSecretsScoped() {
  const { namespace } = useParams<{ namespace: string }>();
  if (!namespace) return null;
  return (
    <ClusterK8sListPage
      namespace={namespace}
      enableCrud
      title="Secret"
      description="core/v1 Secret · 图形编辑以 stringData 写回；TLS/dockerconfig 等建议配合 YAML"
      apiSuffix="secrets"
      queryKey="k8s-secrets"
      columns={secretColsScoped}
    />
  );
}
