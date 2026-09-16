import React from "react";
import { Navigate, useParams } from "react-router-dom";

/** 兼容旧路径 /cluster/pods/:ns/:name */
const LegacyPodDetailRedirect: React.FC = () => {
  const { namespace, podName } = useParams<{
    namespace: string;
    podName: string;
  }>();
  if (!namespace || !podName) return <Navigate to="/cluster/ns" replace />;
  return (
    <Navigate
      to={`/cluster/ns/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(podName)}`}
      replace
    />
  );
};

export default LegacyPodDetailRedirect;
