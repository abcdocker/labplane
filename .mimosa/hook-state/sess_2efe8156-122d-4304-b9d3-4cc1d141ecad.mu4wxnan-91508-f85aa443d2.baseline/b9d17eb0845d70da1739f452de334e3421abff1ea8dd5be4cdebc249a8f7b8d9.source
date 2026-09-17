/**
 * ConfigMap data 键值：从 API/JSON 进入前端时，部分链路的换行会变成字面量「\\n」，拖成一行。
 * 在几乎无真实换行、却含反斜杠转义时，做常见还原，便于在编辑器中直观多行显示。
 */
export function normalizeConfigMapDataValue(s: string): string {
  if (!s) return s;
  if (s.includes("\n")) return s;
  if (!s.includes("\\")) return s;
  if (/\\n|\\r|\\t/.test(s)) {
    return s
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");
  }
  return s;
}

export type ConfigMapValueEditorMode = "yaml" | "code" | "text";

/**
 * 按键名与内容，选择「YAML 高亮 / 多行纯文本 / 小文本框」编辑方式。
 */
export function getConfigMapValueEditorMode(key: string, value: string): ConfigMapValueEditorMode {
  const k = key.trim().toLowerCase();
  if (k.endsWith(".yml") || k.endsWith(".yaml") || k === "prometheus.yml" || k === "prometheus.yaml") {
    return "yaml";
  }
  if (
    k.endsWith(".conf") ||
    k.endsWith(".config") ||
    k.endsWith(".cnf") ||
    k.endsWith(".ini") ||
    k.endsWith(".properties") ||
    k.endsWith(".sh") ||
    k.endsWith(".json") // JSON 在 code 模式更易读
  ) {
    return "code";
  }
  if (value.length > 500 || (value.includes("\n") && value.length > 30)) {
    return "code";
  }
  return "text";
}

export function isYamlConfigKeyName(key: string): boolean {
  const k = key.trim().toLowerCase();
  return k.endsWith(".yml") || k.endsWith(".yaml") || k === "prometheus.yml" || k === "prometheus.yaml";
}

export function shouldValidateConfigMapYamlKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  if (k.endsWith(".yml") || k.endsWith(".yaml")) return true;
  return k === "prometheus.yml" || k === "prometheus.yaml";
}
