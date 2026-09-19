import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * 资源详情「YAML」标签页：本地编辑缓冲与 object-yaml 查询结果同步。
 * 切换资源（resourceKey）时清空；拉取成功后填入集群当前 YAML；apply 后随查询刷新自动对齐。
 */
export function useK8sObjectYamlTabBuffer(
  resourceKey: string,
  serverYaml: string | undefined,
  fetchSuccess: boolean
): {
  buffer: string;
  setBuffer: Dispatch<SetStateAction<string>>;
  resetFromServer: () => void;
} {
  const [buffer, setBuffer] = useState("");

  useEffect(() => {
    setBuffer("");
  }, [resourceKey]);

  useEffect(() => {
    if (fetchSuccess && serverYaml !== undefined) {
      setBuffer(serverYaml);
    }
  }, [resourceKey, fetchSuccess, serverYaml]);

  const resetFromServer = () => {
    if (serverYaml !== undefined) setBuffer(serverYaml);
  };

  return { buffer, setBuffer, resetFromServer };
}
