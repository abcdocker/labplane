import { parse as parseYaml } from "yaml";

/** 将单段 K8s YAML 快照格式化为 JSON 字符串，便于结构化查看与比对。 */
export function k8sRevisionYamlToJsonString(
  yamlText: string
): { ok: true; json: string } | { ok: false; error: string } {
  try {
    const doc = parseYaml(yamlText);
    return { ok: true, json: JSON.stringify(doc, null, 2) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
