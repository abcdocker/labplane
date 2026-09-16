import React from "react";

type S = { error: Error | null };

/**
 * 捕获子树渲染错误，避免整页白屏；刷新可恢复数据类问题。
 */
export class AppRouteBoundary extends React.Component<
  { children: React.ReactNode },
  S
> {
  state: S = { error: null };

  static getDerivedStateFromError(error: Error): S {
    return { error };
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error.message || String(this.state.error);
      return (
        <div className="mx-auto flex max-w-lg flex-col gap-4 rounded-xl border border-red-200 bg-red-50/90 p-6 text-slate-900">
          <h2 className="text-lg font-semibold text-red-900">页面渲染出错</h2>
          <p className="text-sm text-red-800/90">
            可能是数据异常或前端边界情况。请尝试点击下方按钮刷新页面。
          </p>
          <pre className="max-h-40 overflow-auto rounded-md bg-white/80 p-3 font-mono text-xs text-slate-700">
            {msg}
          </pre>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
              onClick={() => window.location.reload()}
            >
              刷新页面
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => this.setState({ error: null })}
            >
              重试（不刷新）
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
