/**
 * 将 Markdown 预览中的 <pre> 包成 Mac 窗口条 +「复制」按钮（与分享页 class 一致）。
 */
export function enhancePreviewCodeBlocks(markdownRoot: HTMLElement | null): void {
  if (!markdownRoot) return;
  markdownRoot.querySelectorAll("pre").forEach((pre) => {
    if (pre.closest(".fs-code-window")) return;
    const code = pre.querySelector("code");
    if (!code) return;

    let lang = "";
    const cls = code.className || "";
    const m = cls.match(/language-([a-zA-Z0-9_+-]+)/);
    if (m) lang = m[1];
    const displayLang = lang ? lang.replace(/\+/g, " ") : "代码";

    const wrap = document.createElement("div");
    wrap.className = "fs-code-window";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "代码块");

    const bar = document.createElement("div");
    bar.className = "fs-code-titlebar";

    const dots = document.createElement("span");
    dots.className = "fs-code-dots";
    dots.setAttribute("aria-hidden", "true");
    for (let di = 0; di < 3; di++) {
      const dot = document.createElement("span");
      dot.className = "fs-code-dot";
      dots.appendChild(dot);
    }

    const title = document.createElement("span");
    title.className = "fs-code-lang";
    title.textContent = displayLang;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fs-code-copy";
    btn.textContent = "复制";
    btn.setAttribute("aria-label", "复制代码");
    btn.addEventListener("click", () => {
      const text = (code.innerText || code.textContent || "").replace(/\u00a0/g, " ");
      const done = (ok: boolean) => {
        btn.textContent = ok ? "已复制" : "复制失败";
        if (ok) btn.classList.add("fs-code-copy-done");
        window.setTimeout(() => {
          btn.textContent = "复制";
          btn.classList.remove("fs-code-copy-done");
        }, ok ? 2000 : 1600);
      };
      const fallback = () => {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          done(true);
        } catch {
          done(false);
        }
      };
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text).then(() => done(true), () => fallback());
      } else {
        fallback();
      }
    });

    bar.appendChild(dots);
    bar.appendChild(title);
    bar.appendChild(btn);

    const scroll = document.createElement("div");
    scroll.className = "fs-code-scroll";
    pre.parentNode?.insertBefore(wrap, pre);
    wrap.appendChild(bar);
    wrap.appendChild(scroll);
    scroll.appendChild(pre);
  });
}
