import { apiPostJson, ApiHttpError } from "@/lib/api";

export function isProbablySingleYamlDoc(s: string): boolean {
  const t = s.replace(/\r\n/g, "\n").trim();
  if (!t) return false;
  const parts = t.split(/\n---\n/).filter((p) => p.trim() !== "");
  return parts.length <= 1;
}

export type WorkloadSchedulingPrecheckPayload = {
  ok?: boolean;
  check?: {
    ok: boolean;
    message?: string;
    podCpuRequestMilli?: number;
    podMemRequestBytes?: number;
    maxNodeFreeCpuMilli?: number;
    maxNodeFreeMemBytes?: number;
    nodesConsidered?: number;
    nodesMatchingSelector?: number;
  };
  error?: string;
};

export async function schedulingPrecheckObject(
  kind: "Deployment" | "StatefulSet",
  object: unknown
): Promise<WorkloadSchedulingPrecheckPayload> {
  return apiPostJson<WorkloadSchedulingPrecheckPayload>("/api/k8s/workloads/scheduling-check", {
    kind,
    object,
  });
}

export async function schedulingPrecheckYaml(yamlContent: string): Promise<WorkloadSchedulingPrecheckPayload> {
  return apiPostJson<WorkloadSchedulingPrecheckPayload>("/api/k8s/workloads/scheduling-check-yaml", {
    yamlContent,
  });
}

export function formatSchedulingPrecheckError(e: unknown): string {
  if (e instanceof ApiHttpError) {
    const fromChecks = e.checks?.find((c) => c.message)?.message;
    if (fromChecks) return fromChecks;
    return e.serverMessage || e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
