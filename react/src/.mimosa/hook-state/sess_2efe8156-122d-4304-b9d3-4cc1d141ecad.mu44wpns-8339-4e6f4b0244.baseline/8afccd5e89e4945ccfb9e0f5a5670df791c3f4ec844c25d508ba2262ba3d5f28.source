/** 与「调度预检 + 提交」合并流程配套的说明与进度（纯前端展示，非精确计时）。 */

export const WORKLOAD_SCHEDULE_PRECHECK_APPLY_HINT =
  "Deployment / StatefulSet：将先执行调度余量预检，通过后立刻提交。单集群常见总耗时约 8～40 秒（预检约 5～25 秒，提交约 3～15 秒，随节点与 Pod 数量变化）。";

export const WORKLOAD_GRAPHIC_SAVE_PIPELINE_HINT =
  "Deployment / StatefulSet：保存前会先跑调度预检，通过后写入对象。常见总耗时约 6～35 秒。";

export type WorkloadApplyPipelineStep = "precheck" | "apply";

/** 用于 Progress 的 0–100 占位进度（两阶段非匀速，仅表达「进行到哪一步」）。 */
export function workloadApplyPipelineProgress(step: WorkloadApplyPipelineStep | null): number {
  if (step === "precheck") return 38;
  if (step === "apply") return 88;
  return 0;
}

export function workloadApplyPipelineLabel(
  step: WorkloadApplyPipelineStep | null,
  surface: "apply-yaml" | "put-json"
): string {
  if (step === "precheck") {
    return "① 调度预检（节点 Allocatable − 已调度 Pod 的 requests，简化估算）…";
  }
  if (step === "apply") {
    return surface === "put-json" ? "② 保存并写入 Kubernetes API…" : "② 提交 apply-yaml 至集群…";
  }
  return "";
}
