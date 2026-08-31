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

function normaliseTone(t: PublicAnnouncement["tone"]): Tone {
  return t === "success" || t === "warning" || t === "urgent" ? t : "info";
}

// Dismissal key: content-based so a message edit re-appears for visitors.
// Scoped per-subdomain via the storage key prefix below.
function dismissKeyFor(a: PublicAnnouncement): string {
  return `${normaliseTone(a.tone)}|${(a.message ?? "").trim()}|${a.link_url ?? ""}`;
}

const STORAGE_PREFIX = "pa_dismissed_v3:";

export function PublicAnnouncementBar({
  subdomain,
  navBg: navBgProp,
  navFg: navFgProp,
}: {
  subdomain: string;
  navBg?: string;
  navFg?: string;
}) {
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
      setRows(list);
    })();

    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  const visible = useMemo(() => {
    return rows.filter((r) => (r.message ?? "").trim() && !dismissed.has(dismissKeyFor(r)));
  }, [rows, dismissed]);

  // Prune stale dismissals so old keys can never suppress future
  // announcements — only keys for currently-served messages are kept.
  useEffect(() => {
    if (rows.length === 0) return;
    const live = new Set(rows.map(dismissKeyFor));
    const pruned = new Set([...dismissed].filter((k) => live.has(k)));
    if (pruned.size === dismissed.size) return;
    setDismissed(pruned);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          `${STORAGE_PREFIX}${subdomain}`,
          JSON.stringify([...pruned]),
        );
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  function dismiss(a: PublicAnnouncement) {
    const next = new Set(dismissed);
    const k = dismissKeyFor(a);
    next.add(k);
    setDismissed(next);

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

  const navBg = "var(--event-nav-bg, var(--event-primary, #1F3D2B))";
  const navFg = "var(--event-nav-fg, var(--event-primary-fg, #F6EFE2))";

  return (
    <div
      className="-mx-4 w-auto"
      role="region"
      aria-label="Event announcements"
      style={{ backgroundColor: navBg, color: navFg }}
    >
      {visible.map((a, idx) => {
        const safeHref =
          a.link_url && /^https:\/\//i.test(a.link_url) ? a.link_url : null;
        const message = (a.message ?? "").trim();
        const k = dismissKeyFor(a);
        const isLast = idx === visible.length - 1;
        return (
          <div
            key={`${k}-${idx}`}
            style={
              isLast
                ? {
                    borderBottom: `3px solid color-mix(in srgb, ${navFg} 85%, transparent)`,
                  }
                : {
                    borderBottom: `1px solid color-mix(in srgb, ${navFg} 25%, transparent)`,
                  }
            }
          >
            <div className="mx-auto flex min-h-[52px] max-w-2xl items-center gap-3 px-6 py-3 sm:px-8">
              <div className="min-w-0 flex-1 text-center">
                <p className="break-words text-[13px] font-bold leading-snug">
                  {message}
                </p>
                {safeHref && (
                  <a
                    href={safeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center text-xs font-bold underline underline-offset-2 opacity-80 hover:opacity-100"
                  >
                    {a.link_label ?? "Learn more"} ↗
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(a)}
                aria-label="Dismiss announcement"
                className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center self-center rounded-full hover:bg-white/10"
              >
                <span aria-hidden className="text-lg font-bold leading-none">×</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
