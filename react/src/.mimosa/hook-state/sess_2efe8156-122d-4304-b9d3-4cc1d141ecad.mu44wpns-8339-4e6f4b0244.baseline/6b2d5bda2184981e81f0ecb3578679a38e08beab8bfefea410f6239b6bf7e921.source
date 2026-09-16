import React, { useCallback, useMemo, useRef } from "react";
import "@excalidraw/excalidraw/index.css";
import { Excalidraw } from "@excalidraw/excalidraw";
import {
  DEFAULT_EXCALIDRAW_SCENE,
  excalidrawAppStateForStorage,
  sanitizeExcalidrawAppStateForRestore,
} from "./docExcalidrawConstants";

type SceneSlice = {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

function parseScene(s: string): SceneSlice {
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    const rawApp =
      typeof o.appState === "object" && o.appState !== null ? (o.appState as Record<string, unknown>) : {};
    return {
      elements: Array.isArray(o.elements) ? o.elements : [],
      appState: sanitizeExcalidrawAppStateForRestore(rawApp),
      files: typeof o.files === "object" && o.files !== null ? (o.files as Record<string, unknown>) : {},
    };
  } catch {
    return {
      elements: [],
      appState: { viewBackgroundColor: "#ffffff", theme: "light" },
      files: {},
    };
  }
}

type Props = {
  docId: string;
  value: string;
  onChange: (json: string) => void;
};

export function DocExcalidrawPane({ docId, value, onChange }: Props) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const initial = useMemo(() => parseScene(value || DEFAULT_EXCALIDRAW_SCENE), [value]);

  const handleChange = useCallback(
    (elements: readonly unknown[], appState: unknown, files: unknown) => {
      const payload = JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: "kube-bt-sync",
        elements,
        appState: excalidrawAppStateForStorage(appState),
        files: files && typeof files === "object" ? files : {},
      });
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (payload === valueRef.current) return;
        onChange(payload);
      }, 450);
    },
    [onChange]
  );

  return (
    <div className="md-editor-excalidraw-host min-h-[520px] w-full flex-1">
      <Excalidraw
        key={docId}
        initialData={{
          elements: initial.elements as never[],
          appState: initial.appState as never,
          files: initial.files as never,
        }}
        onChange={handleChange as never}
        UIOptions={{ canvasActions: { loadScene: false } }}
      />
    </div>
  );
}
