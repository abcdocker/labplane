import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PodListBlock } from "./PodListBlock";

const ClusterPods: React.FC = () => {
  const { namespace } = useParams<{ namespace: string }>();
  const [searchParams] = useSearchParams();
  const labelSelector = searchParams.get("labelSelector")?.trim() ?? "";

  if (!namespace) return null;

  return (
    <PodListBlock
      namespace={namespace}
      labelSelector={labelSelector}
      showPageHeader
      showLabelFilterBanner
      showCreateYamlButton
    />
  );
};

export default ClusterPods;
