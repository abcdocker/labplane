import React, { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { pwaText } from "@/i18n/pwa";

const DISMISSED_KEY = "kbts:pwa-install-hint-dismissed";

type StandaloneNavigator = Navigator & {
  standalone?: boolean;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallTarget = "ios" | "android" | "generic";

function detectInstallTarget(): InstallTarget | null {
  const ua = navigator.userAgent;
  const platform = navigator.platform;
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone =
    (navigator as StandaloneNavigator).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  if (isStandalone || localStorage.getItem(DISMISSED_KEY) === "1") return null;
  if (isIOS) return "ios";
  if (isAndroid) return "android";
  if (window.matchMedia("(max-width: 820px) and (pointer: coarse)").matches) return "generic";
  return null;
}

const PwaInstallHint: React.FC = () => {
  const [target, setTarget] = useState<InstallTarget | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setTarget(detectInstallTarget());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      if (localStorage.getItem(DISMISSED_KEY) !== "1") {
        setTarget((current) => current ?? "android");
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (!target) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setTarget(null);
  };

  const runInstallPrompt = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      localStorage.setItem(DISMISSED_KEY, "1");
      setTarget(null);
    }
    setInstallPrompt(null);
  };

  const isIOS = target === "ios";
  const title = isIOS ? pwaText.installTitleIOS : pwaText.installTitleAndroid;
  const description = isIOS ? pwaText.installDescriptionIOS : pwaText.installDescriptionAndroid;
  const Icon = isIOS ? Share : Download;

  return (
    <aside className="fixed bottom-[calc(3.75rem+var(--kbts-safe-bottom))] left-[max(0.75rem,var(--kbts-safe-left))] right-[max(0.75rem,var(--kbts-safe-right))] z-40 rounded-2xl border border-blue-200 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-blue-900 dark:bg-slate-950/95">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">{description}</p>
          {!isIOS && installPrompt ? (
            <button
              type="button"
              className="mt-3 min-h-11 rounded-full bg-blue-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 active:scale-[0.98] dark:bg-blue-500 dark:hover:bg-blue-400"
              onClick={() => void runInstallPrompt()}
            >
              {pwaText.installAction}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label={pwaText.dismiss}
          title={pwaText.dismiss}
          onClick={dismiss}
        >
          <X className="size-4" />
        </button>
      </div>
    </aside>
  );
};

export default PwaInstallHint;
