import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";

/**
 * Compact public announcement bar for /live/$subdomain pages.
 *
 * Display contract (per product spec):
 *  - Message only. No title, no tone chip, no "Read more" toggle.
 *  - Mobile: 2-line clamp; desktop: up to 3 lines but still compact.
 *  - Simple × dismiss. Dismissal is keyed to the event subdomain AND the
 *    message content, so changing the message re-shows it on every browser.
 *  - Dismissals persist in localStorage (best-effort; silent if unavailable).
 *
 * Data source:
 *  - SECURITY DEFINER RPC `public.get_public_event_announcements_by_domain`
 *    keyed by hostname `<subdomain>.getstampd.com.au`. The RPC enforces the
 *    publishing gate and active/window filters, and returns only safe public
 *    columns (no PII, no ids).
 */

type Tone = "info" | "success" | "warning" | "urgent";

type PublicAnnouncement = {
  title: string | null;
  message: string | null;
  tone: Tone | string | null;
  link_label: string | null;
  link_url: string | null;
};

const TONE_SURFACE: Record<Tone, string> = {
  info: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1E40AF]",
  success: "border-[#86EFAC] bg-[#ECFDF5] text-[#047857]",
  warning: "border-[#FDBA74] bg-[#FFF7ED] text-[#B45309]",
  urgent: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
};

function normaliseTone(t: PublicAnnouncement["tone"]): Tone {
  return t === "success" || t === "warning" || t === "urgent" ? t : "info";
}

// Dismissal key: content-based so a message edit re-appears for visitors.
// Scoped per-subdomain via the storage key prefix below.
function dismissKeyFor(a: PublicAnnouncement): string {
  return `${normaliseTone(a.tone)}|${(a.message ?? "").trim()}|${a.link_url ?? ""}`;
}

const STORAGE_PREFIX = "pa_dismissed_v3:";

export function PublicAnnouncementBar({ subdomain }: { subdomain: string }) {
  const [rows, setRows] = useState<PublicAnnouncement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${subdomain}`);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const host = tenantHost(subdomain);
      const { data, error } = await supabase.rpc(
        "get_public_event_announcements_by_domain",
        { _hostname: host },
      );
      if (cancelled) return;
      if (error) {
        // Diagnostic only — never logs secrets.
        console.warn("[announcement] rpc error", {
          host,
          code: error.code,
          message: error.message,
        });
        setRows([]);
        return;
      }
      const list = (data ?? []) as PublicAnnouncement[];
      console.info("[announcement] loaded", {
        host,
        count: list.length,
        active: list.filter((r) => (r.message ?? "").trim()).length,
      });
      setRows(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  const visible = useMemo(() => {
    const out = rows.filter((r) => (r.message ?? "").trim() && !dismissed.has(dismissKeyFor(r)));
    if (rows.length > 0 && out.length === 0) {
      console.info("[announcement] all hidden by dismissal", {
        total: rows.length,
        dismissedKeys: Array.from(dismissed),
      });
    }
    return out;
  }, [rows, dismissed]);

  function dismiss(a: PublicAnnouncement) {
    const next = new Set(dismissed);
    const k = dismissKeyFor(a);
    next.add(k);
    setDismissed(next);
    console.info("[announcement] dismissed", { subdomain, key: k });
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          `${STORAGE_PREFIX}${subdomain}`,
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // private mode / quota; fail silent
      }
    }
  }

  if (visible.length === 0) return null;

  return (
    <div
      className="mx-auto w-full max-w-2xl space-y-2 px-3 pt-3 sm:px-4"
      role="region"
      aria-label="Event announcements"
    >
      {visible.map((a, idx) => {
        const tone = normaliseTone(a.tone);
        const surface = TONE_SURFACE[tone];
        const safeHref =
          a.link_url && /^https:\/\//i.test(a.link_url) ? a.link_url : null;
        const message = (a.message ?? "").trim();
        const k = dismissKeyFor(a);
        return (
          <div
            key={`${k}-${idx}`}
            className={`flex items-start gap-3 rounded-[12px] border px-3 py-2.5 text-sm leading-snug shadow-sm sm:px-4 ${surface}`}
          >
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 break-words sm:line-clamp-3">
                {message}
              </p>
              {safeHref && (
                <a
                  href={safeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center text-xs font-medium underline underline-offset-2 opacity-80 hover:opacity-100"
                >
                  {a.link_label ?? "Learn more"} ↗
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(a)}
              aria-label="Dismiss announcement"
              className="-mr-1 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-current/70 hover:bg-black/5"
            >
              <span aria-hidden className="text-base leading-none">×</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
