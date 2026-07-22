import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";

type ActivityItem = {
  first_name: string;
  venue_name: string;
  award_title: string | null;
  happened_at: string;
};

export function LiveActivityBar({ subdomain }: { subdomain: string }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "out" | "rest">("in");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    const load = async () => {
      try {
        const host = tenantHost(subdomain);
        const { data, error } = await supabase.rpc(
          "get_public_event_recent_activity",
          { _hostname: host, _limit: 3 },
        );
        if (cancelled) return;
        if (error) return;
        const rows = (data ?? []) as ActivityItem[];
        setItems(rows);
      } catch {
        /* RPC not deployed yet — silently hide */
      }
    };
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [subdomain, dismissed]);

  useEffect(() => {
    if (items.length === 0) return;
    setPhase("in");
    const holdMs = 6000;
    const outMs = 400;
    const restMs = 5000;
    const holdTimer = setTimeout(() => setPhase("out"), holdMs);
    const restTimer = setTimeout(() => setPhase("rest"), holdMs + outMs);
    const advanceTimer = setTimeout(() => {
      setIndex((i) => (i + 1) % items.length);
    }, holdMs + outMs + restMs);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(restTimer);
      clearTimeout(advanceTimer);
    };
  }, [items, index]);

  if (dismissed || items.length === 0 || phase === "rest") return null;
  const current = items[index % items.length];
  if (!current) return null;
  const first = current.first_name || "Someone";
  const message = current.award_title
    ? `${first} just unlocked ${current.award_title} at ${current.venue_name}!`
    : `${first} just checked in at ${current.venue_name}!`;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-3">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss live activity"
        className={`${phase === "in" ? "live-activity-enter" : "live-activity-exit"} pointer-events-auto flex w-full max-w-[94vw] items-center gap-3 rounded-2xl px-4 py-3 text-left text-[13px] font-semibold shadow-xl backdrop-blur sm:max-w-md`}
        style={{
          backgroundColor: "var(--event-nav-bg, rgba(15,23,42,0.96))",
          color: "var(--event-nav-fg, #FFF)",
        }}
      >
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none"
          style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
        >
          🔥
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-bold uppercase tracking-[0.24em] opacity-80">
            Live Activity
          </div>
          <div className="mt-0.5 truncate text-[13px] font-semibold leading-snug">
            {message}
          </div>
        </div>
      </button>
    </div>
  );
}

