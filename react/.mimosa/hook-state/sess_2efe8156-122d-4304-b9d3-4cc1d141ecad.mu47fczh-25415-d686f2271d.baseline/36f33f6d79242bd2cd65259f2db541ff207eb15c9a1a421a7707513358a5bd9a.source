import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Braces } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ingressText } from "@/i18n/ingress";
import { cn } from "@/lib/utils";
import { apiGetJson } from "@/lib/api";

type IngressAnnotationsProps = {
  annotations?: Record<string, string>;
  annotationCount?: number;
  namespace: string;
  name: string;
  resourceName?: string;
  className?: string;
};

const IngressAnnotations: React.FC<IngressAnnotationsProps> = ({
  annotations,
  annotationCount,
  namespace,
  name,
  resourceName,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const count = annotationCount ?? Object.keys(annotations ?? {}).length;
  const annotationsQ = useQuery({
    queryKey: ["k8s-object-annotations", "Ingress", namespace, name],
    queryFn: ({ signal }) =>
      apiGetJson<{
        object?: { metadata?: { annotations?: Record<string, string> } };
      }>(
        `/api/k8s/object-json?kind=Ingress&namespace=${encodeURIComponent(namespace)}&name=${encodeURIComponent(name)}`,
        { signal }
      ),
    enabled: open && count > 0 && !annotations,
    staleTime: 30_000,
  });
  const loadedAnnotations = annotations ?? annotationsQ.data?.object?.metadata?.annotations;
  const entries = useMemo(
    () => Object.entries(loadedAnnotations ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    [loadedAnnotations]
  );

  if (count === 0) {
    return <span className={cn("text-xs text-slate-400 dark:text-slate-500", className)}>{ingressText.noAnnotations}</span>;
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("h-8 max-w-full gap-1.5 px-2.5 text-xs", className)}
        onClick={() => setOpen(true)}
      >
        <Braces className="size-3.5 shrink-0" />
        <span className="truncate">
          {ingressText.annotations} · {count}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-3xl flex-col overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 pr-12 text-left dark:border-slate-800 sm:px-6">
            <DialogTitle className="break-all">
              {ingressText.annotationDialogTitle}
              {resourceName ? ` · ${resourceName}` : ""}
            </DialogTitle>
            <DialogDescription>{ingressText.annotationDialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
            {annotationsQ.isLoading ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{ingressText.annotationLoading}</p>
            ) : annotationsQ.error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {ingressText.annotationLoadFailed}: {(annotationsQ.error as Error).message}
              </p>
            ) : (
              <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                {entries.map(([key, value]) => (
                  <div key={key} className="grid min-w-0 gap-1 py-3 sm:grid-cols-[minmax(11rem,0.8fr)_minmax(0,1.2fr)] sm:gap-4">
                    <dt className="break-all font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{key}</dt>
                    <dd className="min-w-0 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-600 [overflow-wrap:anywhere] dark:text-slate-400">
                      {value || "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-6">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {ingressText.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default IngressAnnotations;
