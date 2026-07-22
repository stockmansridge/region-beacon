import { useEffect, useRef, useState } from "react";
import { usePassportHomeData } from "@/lib/use-passport-home-data";

const SEEN_KEY = (passportId: string) => `gs.prize-unlock.seen.${passportId}`;

function readSeen(passportId: string): Set<string> {
  if (typeof sessionStorage === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SEEN_KEY(passportId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(passportId: string, ids: Set<string>) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SEEN_KEY(passportId), JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/**
 * Detects when a passport newly becomes eligible for a prize (across
 * refetches of `usePassportHomeData`) and drops a 🎉 banner announcing
 * the unlocked prize. Each award id is only announced once per session.
 */
export function PrizeUnlockAnnouncer({ eventId }: { eventId: string | null }) {
  const data = usePassportHomeData(eventId);
  const prevEligible = useRef<Set<string> | null>(null);
  const [current, setCurrent] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (data.loading || !data.hasPassport || !data.passportId) return;
    const eligible = new Set(
      data.awards.filter((a) => a.is_eligible).map((a) => a.id),
    );
    const seen = readSeen(data.passportId);

    if (prevEligible.current === null) {
      // Initial load — treat currently-eligible awards as already seen
      // so the banner only fires on genuine new unlocks.
      for (const id of eligible) seen.add(id);
      writeSeen(data.passportId, seen);
      prevEligible.current = eligible;
      return;
    }

    const newlyUnlocked = [...eligible].filter(
      (id) => !prevEligible.current!.has(id) && !seen.has(id),
    );
    prevEligible.current = eligible;

    if (newlyUnlocked.length > 0) {
      const id = newlyUnlocked[0];
      const award = data.awards.find((a) => a.id === id);
      if (award) {
        seen.add(id);
        writeSeen(data.passportId, seen);
        setCurrent({ id, title: award.title });
      }
    }
  }, [data]);

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setCurrent(null), 8000);
    return () => clearTimeout(t);
  }, [current]);

  if (!current) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-3 pt-3">
      <button
        type="button"
        onClick={() => setCurrent(null)}
        aria-label="Dismiss prize unlocked"
        className="live-activity-enter pointer-events-auto flex w-full max-w-[94vw] items-center gap-3 rounded-2xl px-4 py-3 text-left text-[13px] font-semibold shadow-xl backdrop-blur sm:max-w-md"
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
          🎉
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-bold uppercase tracking-[0.24em] opacity-80">
            Prize Unlocked
          </div>
          <div className="mt-0.5 truncate text-[13px] font-semibold leading-snug">
            You unlocked {current.title}!
          </div>
        </div>
      </button>
    </div>
  );
}
