import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";

type ActivityItem = {
  kind: "checkin" | "unlock" | "bonus" | "explorers";
  emoji: string;
  label: string;
  message: string;
  key: string;
};

type CheckinRow = { first_name: string; venue_name: string; happened_at: string };
type BonusRow = { first_name: string; bonus_name: string; happened_at: string };
type PrizeUnlockRow = { first_name: string; prize_name: string; happened_at: string };
type HappeningPayload = {
  recent_checkins?: CheckinRow[];
  explorers_today?: number;
  recent_bonus?: BonusRow[];
  recent_prize_unlocks?: PrizeUnlockRow[];
};

const MAX_CYCLES = 3;

function buildItems(p: HappeningPayload): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const u of p.recent_prize_unlocks ?? []) {
    out.push({
      kind: "unlock",
      emoji: "🎉",
      label: "Prize Unlocked",
      message: `${u.first_name || "Someone"} just unlocked ${u.prize_name}!`,
      key: `unlock-${u.happened_at}-${u.first_name}`,
    });
  }
  for (const b of p.recent_bonus ?? []) {
    out.push({
      kind: "bonus",
      emoji: "⭐",
      label: "Hidden Bonus",
      message: `Someone found a hidden bonus — ${b.bonus_name}!`,
      key: `bonus-${b.happened_at}`,
    });
  }
  for (const c of (p.recent_checkins ?? []).slice(0, 3)) {
    out.push({
      kind: "checkin",
      emoji: "🔥",
      label: "Live Activity",
      message: `${c.first_name || "Someone"} just checked in at ${c.venue_name}!`,
      key: `checkin-${c.happened_at}-${c.first_name}`,
    });
  }
  const explorers = p.explorers_today ?? 0;
  if (explorers >= 1) {
    out.push({
      kind: "explorers",
      emoji: "🍷",
      label: "On The Trail",
      message: `${explorers} ${explorers === 1 ? "person is" : "people are"} exploring the trail today`,
      key: `explorers-${explorers}`,
    });
  }
  return out;
}

export function LiveActivityBar({ subdomain }: { subdomain: string }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "out" | "rest">("in");
  const [dismissed, setDismissed] = useState(false);
  const cyclesShown = useRef(0);
  const seenKeys = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const host = tenantHost(subdomain);
        const { data, error } = await supabase.rpc(
          "get_public_event_happening_now",
          { _hostname: host },
        );
        if (cancelled || error || !data) return;
        const next = buildItems(data as HappeningPayload);
        // Any activity we have not shown before re-opens the bar, even if the
        // visitor dismissed it earlier or the cycle cap was reached. This is
        // what makes a fresh check-in / prize unlock pop up straight away.
        const hasFresh = next.some((i) => !seenKeys.current.has(i.key));
        for (const i of next) seenKeys.current.add(i.key);
        setItems(next);
        if (hasFresh) {
          cyclesShown.current = 0;
          setIndex(0);
          setPhase("in");
          setDismissed(false);
        }
      } catch {
        /* silently hide */
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
  }, [subdomain]);

  useEffect(() => {
    if (items.length === 0 || dismissed) return;
    if (cyclesShown.current >= MAX_CYCLES) {
      setDismissed(true);
      return;
    }
    setPhase("in");

    const holdMs = 6000;
    const outMs = 400;
    const restMs = 5000;
    const holdTimer = setTimeout(() => setPhase("out"), holdMs);
    const restTimer = setTimeout(() => setPhase("rest"), holdMs + outMs);
    const advanceTimer = setTimeout(() => {
      cyclesShown.current += 1;
      if (cyclesShown.current >= MAX_CYCLES) {
        setDismissed(true);
        return;
      }
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
          {current.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-bold uppercase tracking-[0.24em] opacity-80">
            {current.label}
          </div>
          <div className="mt-0.5 truncate text-[13px] font-semibold leading-snug">
            {current.message}
          </div>
        </div>
      </button>
    </div>
  );
}
