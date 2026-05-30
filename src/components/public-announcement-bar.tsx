import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Tone = "info" | "success" | "warning" | "urgent";

type PublicAnnouncement = {
  title: string | null;
  message: string | null;
  tone: Tone | string | null;
  link_label: string | null;
  link_url: string | null;
};

const TONE_STYLES: Record<Tone, { wrap: string; chip: string; btn: string }> = {
  info: {
    wrap: "border-blue-300 bg-blue-50 text-blue-900",
    chip: "bg-blue-600 text-white",
    btn: "border-blue-700/30 text-blue-900 hover:bg-blue-100",
  },
  success: {
    wrap: "border-emerald-300 bg-emerald-50 text-emerald-900",
    chip: "bg-emerald-600 text-white",
    btn: "border-emerald-700/30 text-emerald-900 hover:bg-emerald-100",
  },
  warning: {
    wrap: "border-amber-300 bg-amber-50 text-amber-900",
    chip: "bg-amber-500 text-white",
    btn: "border-amber-700/30 text-amber-900 hover:bg-amber-100",
  },
  urgent: {
    wrap: "border-red-300 bg-red-50 text-red-900",
    chip: "bg-red-600 text-white",
    btn: "border-red-700/30 text-red-900 hover:bg-red-100",
  },
};

function normaliseTone(t: PublicAnnouncement["tone"]): Tone {
  return t === "success" || t === "warning" || t === "urgent" ? t : "info";
}

// Stable key for sessionStorage dismissal — content-based since the RPC
// never returns ids (privacy: no announcement_id leaks publicly).
function keyOf(a: PublicAnnouncement): string {
  return `${normaliseTone(a.tone)}|${a.title ?? ""}|${a.message ?? ""}|${a.link_url ?? ""}`;
}

export function PublicAnnouncementBar({ subdomain }: { subdomain: string }) {
  const [rows, setRows] = useState<PublicAnnouncement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.sessionStorage.getItem(`pa_dismissed:${subdomain}`);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const host = `${subdomain}.getstamped.com.au`;
      const { data, error } = await supabase.rpc(
        "get_public_event_announcements_by_domain",
        { _hostname: host },
      );
      if (cancelled) return;
      if (error) {
        setRows([]);
        return;
      }
      setRows((data ?? []) as PublicAnnouncement[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  const visible = useMemo(
    () => rows.filter((r) => r.title && r.message && !dismissed.has(keyOf(r))),
    [rows, dismissed],
  );

  function dismiss(a: PublicAnnouncement) {
    const next = new Set(dismissed);
    next.add(keyOf(a));
    setDismissed(next);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(
          `pa_dismissed:${subdomain}`,
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // sessionStorage may be unavailable (private mode); fail silent.
      }
    }
  }

  if (visible.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-md space-y-2 px-4 pt-3" role="region" aria-label="Event announcements">
      {visible.map((a, idx) => {
        const tone = normaliseTone(a.tone);
        const s = TONE_STYLES[tone];
        const safeHref =
          a.link_url && /^https:\/\//i.test(a.link_url) ? a.link_url : null;
        return (
          <div
            key={`${keyOf(a)}-${idx}`}
            className={`flex flex-wrap items-start gap-2 rounded-xl border px-3 py-2 text-xs shadow-sm ${s.wrap}`}
          >
            <span
              className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.chip}`}
            >
              {tone}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{a.title}</p>
              <p className="mt-0.5 leading-snug">{a.message}</p>
              {safeHref && (
                <a
                  href={safeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-1 inline-flex h-7 items-center rounded-full border bg-white/60 px-3 text-[11px] font-medium ${s.btn}`}
                >
                  {a.link_label ?? "Learn more"} ↗
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(a)}
              aria-label="Dismiss announcement"
              className="ml-auto inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-current/70 hover:bg-black/5"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
