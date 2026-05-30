import { ReactNode, useState } from "react";
import { ClipboardCopy, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "error";

/**
 * Shared copy-to-clipboard button used by every diagnostic panel.
 * Shows transient success / failure states.
 */
export function DiagnosticCopyButton({
  getReport,
  className,
}: {
  getReport: () => string;
  className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    setError(null);
    try {
      const text = getReport();
      if (!navigator?.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable in this browser");
      }
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), 1800);
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
      setTimeout(() => setState("idle"), 4000);
    }
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted"
      >
        {state === "copied" ? (
          <>
            <Check className="h-3 w-3" /> Copied
          </>
        ) : state === "error" ? (
          <>
            <AlertTriangle className="h-3 w-3 text-destructive" /> Copy failed
          </>
        ) : (
          <>
            <ClipboardCopy className="h-3 w-3" /> Copy report
          </>
        )}
      </button>
      {state === "error" && error && (
        <span className="text-[10px] text-destructive">{error}</span>
      )}
    </div>
  );
}

/**
 * Reusable wrapper for platform_admin-only diagnostic panels. Renders a
 * titled card with a built-in copy button. Visibility/gating is the
 * caller's responsibility — this component only handles presentation.
 */
export function DiagnosticPanel({
  title,
  subtitle,
  getReport,
  children,
  tone = "amber",
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  getReport: () => string;
  children: ReactNode;
  tone?: "amber" | "muted";
  className?: string;
}) {
  const toneClasses =
    tone === "amber"
      ? "border-amber-300/60 bg-amber-50/40"
      : "border bg-muted/30";
  return (
    <section className={cn("rounded-xl border p-4 sm:p-6", toneClasses, className)}>
      <DiagnosticPanelHeader title={title} subtitle={subtitle} getReport={getReport} />
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function DiagnosticPanelHeader({
  title,
  subtitle,
  getReport,
}: {
  title: string;
  subtitle?: ReactNode;
  getReport: () => string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && (
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <DiagnosticCopyButton getReport={getReport} />
    </div>
  );
}
