import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { readStoredPassportForEvent } from "@/lib/use-current-event-passport";

type Progress = {
  passport_id: string;
  total_points: number;
  venue_points: number;
  bonus_points: number;
  passport_stamp_count: number;
  total_venues: number;
};

type State =
  | { kind: "loading" }
  | { kind: "no_passport" }
  | { kind: "ready"; progress: Progress }
  | { kind: "error" };

export function CollectPointsSection({
  eventId,
  primaryColor,
  accentColor,
  canRegister,
}: {
  eventId: string;
  primaryColor?: string | null;
  accentColor?: string | null;
  canRegister: boolean;
}) {
  const primary = primaryColor ?? "#1F3D2B";
  const accent = accentColor ?? "#C9A24A";
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = readStoredPassportForEvent(eventId);
      if (!stored?.access_token) {
        if (!cancelled) setState({ kind: "no_passport" });
        return;
      }
      const { data, error } = await supabase.rpc("get_public_passport_progress", {
        p_event_id: eventId,
        p_passport_token: stored.access_token,
      });
      if (cancelled) return;
      if (error) {
        setState({ kind: "error" });
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as Progress | null;
      if (!row) {
        // Token didn't resolve (stale/cleared). Treat as no passport.
        setState({ kind: "no_passport" });
        return;
      }
      setState({ kind: "ready", progress: row });
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  return (
    <section className="mx-auto mt-8 w-full max-w-md rounded-3xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-6 shadow-sm">
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.32em]"
        style={{ color: accent }}
      >
        Collect points
      </div>
      <h2
        className="font-trail-serif mt-1 text-xl font-semibold"
        style={{ color: primary }}
      >
        Scan to earn points
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--event-body,#3D372C)]">
        Scan venue QR codes to collect passport stamps and earn points. Look out
        for bonus codes around the event for extra points.
      </p>

      {state.kind === "loading" && (
        <p className="mt-4 text-xs text-[var(--event-muted,#8A7E66)]">
          Checking your progress…
        </p>
      )}

      {state.kind === "no_passport" && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-[var(--event-body,#3D372C)]">
            Start collecting by scanning a venue or bonus QR code.
          </p>
          {canRegister && (
            <Link
              to="/join"
              className="grid h-11 w-full place-items-center rounded-full text-sm font-semibold tracking-wide text-[var(--event-page-bg,#F6EFE2)] shadow"
              style={{ backgroundColor: primary }}
            >
              Create your passport
            </Link>
          )}
        </div>
      )}

      {state.kind === "ready" && (
        <ProgressGrid progress={state.progress} primary={primary} accent={accent} />
      )}

      {state.kind === "error" && (
        <p className="mt-4 text-xs text-[var(--event-muted,#8A7E66)]">
          We couldn't load your progress right now.
        </p>
      )}
    </section>
  );
}

function ProgressGrid({
  progress,
  primary,
  accent,
}: {
  progress: Progress;
  primary: string;
  accent: string;
}) {
  const stampLine =
    progress.total_venues > 0
      ? `${progress.passport_stamp_count} / ${progress.total_venues}`
      : `${progress.passport_stamp_count}`;
  return (
    <div className="mt-5 grid grid-cols-2 gap-3">
      <Stat label="Your points" value={progress.total_points} primary={primary} accent={accent} highlight />
      <Stat label="Passport stamps" value={stampLine} primary={primary} accent={accent} />
      <Stat label="Venue points" value={progress.venue_points} primary={primary} accent={accent} />
      <Stat label="Bonus points" value={progress.bonus_points} primary={primary} accent={accent} />
    </div>
  );
}

function Stat({
  label,
  value,
  primary,
  accent,
  highlight,
}: {
  label: string;
  value: number | string;
  primary: string;
  accent: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border px-4 py-3"
      style={{
        borderColor: "var(--event-border, #E6DCC7)",
        backgroundColor: highlight ? `${primary}0F` : "transparent",
      }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.22em]"
        style={{ color: accent }}
      >
        {label}
      </div>
      <div
        className="font-trail-serif mt-1 text-2xl font-semibold leading-none"
        style={{ color: primary }}
      >
        {value}
      </div>
    </div>
  );
}
