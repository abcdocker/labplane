/** 与 Node 对象 metadata.name 对应的常见调度标签（各发行版普遍存在） */
export const K8S_NODE_HOSTNAME_LABEL = "kubernetes.io/hostname";

function isOurHostnameInTerms(terms: unknown): boolean {
  if (!Array.isArray(terms) || terms.length !== 1) return false;
  const t0 = terms[0] as Record<string, unknown>;
  const exprs = t0?.matchExpressions;
  if (!Array.isArray(exprs) || exprs.length !== 1) return false;
  const ex = exprs[0] as Record<string, unknown>;
  if (ex.key !== K8S_NODE_HOSTNAME_LABEL || ex.operator !== "In") return false;
  return Array.isArray(ex.values) && ex.values.length >= 1;
}

function requiredBlock(podSpec: Record<string, unknown>): Record<string, unknown> | undefined {
  const aff = podSpec.affinity as Record<string, unknown> | undefined;
  const na = aff?.nodeAffinity as Record<string, unknown> | undefined;
  const req = na?.requiredDuringSchedulingIgnoredDuringExecution as Record<string, unknown> | undefined;
  return req;
}

/** 从 Pod 模板读取当前图形可识别的「调度到节点」选择（hostname 标签） */
export function readSchedulingNodeNames(podSpec: Record<string, unknown> | undefined): string[] {
  if (!podSpec) return [];
  const ns = podSpec.nodeSelector as Record<string, string> | undefined;
  const hn = ns?.[K8S_NODE_HOSTNAME_LABEL];
  if (typeof hn === "string" && hn.trim()) {
    return [hn.trim()];
  }
  const req = requiredBlock(podSpec);
  if (!req) return [];
  if (!isOurHostnameInTerms(req.nodeSelectorTerms)) return [];
  const t0 = (req.nodeSelectorTerms as Record<string, unknown>[])[0];
  const ex = (t0.matchExpressions as Record<string, unknown>[])[0];
  const vals = ex.values as unknown[];
  return [...new Set(vals.map((v) => String(v).trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function pruneAffinity(podSpec: Record<string, unknown>) {
  const aff = podSpec.affinity as Record<string, unknown> | undefined;
  if (!aff) return;
  const na = aff.nodeAffinity as Record<string, unknown> | undefined;
  if (na && Object.keys(na).length === 0) delete aff.nodeAffinity;
  if (Object.keys(aff).length === 0) delete podSpec.affinity;
}

/** 若 required 仅为本图形写入的 hostname In，则移除 */
function stripOurHostnameRequired(podSpec: Record<string, unknown>) {
  const aff = podSpec.affinity as Record<string, unknown> | undefined;
  if (!aff?.nodeAffinity) return;
  const na = { ...(aff.nodeAffinity as Record<string, unknown>) };
  const req = na.requiredDuringSchedulingIgnoredDuringExecution as Record<string, unknown> | undefined;
  if (!req || !isOurHostnameInTerms(req.nodeSelectorTerms)) return;
  delete na.requiredDuringSchedulingIgnoredDuringExecution;
  if (Object.keys(na).length === 0) {
    delete aff.nodeAffinity;
  } else {
    aff.nodeAffinity = na;
  }
  pruneAffinity(podSpec);
}

/**
 * 将所选节点名写入 spec.template.spec：单节点用 nodeSelector；多节点用 nodeAffinity.required（hostname In）。
 * 仅增删 kubernetes.io/hostname 键与其它 nodeSelector 键并存；多选时会替换已有的 required（若存在非本图形格式的 required 则抛错）。
 */
export function applySchedulingNodeNames(podSpec: Record<string, unknown>, names: string[]): void {
  const uniq = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  const hostKey = K8S_NODE_HOSTNAME_LABEL;
  const ns = { ...((podSpec.nodeSelector as Record<string, string>) ?? {}) };

  stripOurHostnameRequired(podSpec);
  delete ns[hostKey];

  if (uniq.length > 1) {
    const aff0 = podSpec.affinity as Record<string, unknown> | undefined;
    const na0 = aff0?.nodeAffinity as Record<string, unknown> | undefined;
    if (na0?.requiredDuringSchedulingIgnoredDuringExecution) {
      throw new Error(
        "已存在 nodeAffinity.required 规则，与「多节点」图形冲突；请用 YAML 合并调度条件，或先删除现有 required"
      );
    }
  }

  const aff = { ...((podSpec.affinity as Record<string, unknown>) ?? {}) };
  const na = { ...((aff.nodeAffinity as Record<string, unknown>) ?? {}) };

  if (uniq.length === 0) {
    if (Object.keys(ns).length === 0) delete podSpec.nodeSelector;
    else podSpec.nodeSelector = ns;
    if (Object.keys(na).length === 0) delete aff.nodeAffinity;
    else aff.nodeAffinity = na;
    if (Object.keys(aff).length === 0) delete podSpec.affinity;
    else podSpec.affinity = aff;
    pruneAffinity(podSpec);
    return;
  }

  if (uniq.length === 1) {
    ns[hostKey] = uniq[0];
    podSpec.nodeSelector = ns;
    if (Object.keys(na).length === 0) delete aff.nodeAffinity;
    else aff.nodeAffinity = na;
    if (Object.keys(aff).length === 0) delete podSpec.affinity;
    else podSpec.affinity = aff;
    pruneAffinity(podSpec);
    return;
  }

  if (Object.keys(ns).length === 0) delete podSpec.nodeSelector;
  else podSpec.nodeSelector = ns;

  const naMulti = { ...na };
  naMulti.requiredDuringSchedulingIgnoredDuringExecution = {
    nodeSelectorTerms: [
      {
        matchExpressions: [
          {
            key: hostKey,
            operator: "In",
            values: uniq,
          },
        ],
      },
    ],
  };
  aff.nodeAffinity = naMulti;
  podSpec.affinity = aff;
}
