/** 与 Excalidraw 解耦的默认场景 JSON，供 EditorContainer 等避免整包拉取 @excalidraw/excalidraw */
export const DEFAULT_EXCALIDRAW_SCENE = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "kube-bt-sync",
  elements: [],
  appState: { viewBackgroundColor: "#ffffff", theme: "light" },
  files: {},
});

/**
 * Excalidraw 0.18+ 中 appState.collaborators 为 Map；JSON 序列化后再 parse 会变成普通对象（如 {}），
 * 没有 .forEach，会触发「collaborators.forEach is not a function」。
 */
export function sanitizeExcalidrawAppStateForRestore(appState: Record<string, unknown>): Record<string, unknown> {
  const next = { ...appState };
  if ("collaborators" in next) delete next.collaborators;
  return next;
}

/** 入库前去掉 collaborators，避免下次读出为畸形对象。 */
export function excalidrawAppStateForStorage(appState: unknown): Record<string, unknown> {
  if (!appState || typeof appState !== "object") return {};
  const o = { ...(appState as Record<string, unknown>) };
  delete o.collaborators;
  return o;
}
