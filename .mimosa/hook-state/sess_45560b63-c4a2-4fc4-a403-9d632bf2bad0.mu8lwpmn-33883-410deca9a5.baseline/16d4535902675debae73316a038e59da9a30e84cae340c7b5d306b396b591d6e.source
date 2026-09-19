import React from "react";
import { useSearchParams } from "react-router-dom";
import { PodListBlock } from "./PodListBlock";

/** 全集群 Pod（不按命名空间筛选），卡片列表与 /cluster/pods 路由对应 */
const ClusterPodsAll: React.FC = () => {
  const [searchParams] = useSearchParams();
  const labelSelector = searchParams.get("labelSelector")?.trim() ?? "";
  const phaseFilter = searchParams.get("phase")?.trim() || undefined;
  const problemFilter = searchParams.get("problem")?.trim() || undefined;

  return (
    <PodListBlock
      namespace=""
      allNamespaces
      layout="cards"
      labelSelector={labelSelector}
      phaseFilter={phaseFilter}
      problemFilter={problemFilter}
      showPageHeader
      showLabelFilterBanner
      showCreateYamlButton
    />
  );
};

export default ClusterPodsAll;
