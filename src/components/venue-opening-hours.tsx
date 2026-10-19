import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import {
  WEEKDAYS_MON_FIRST, isOpenNow, splitWeekdayLine, todayIndexMonFirst, type HoursPeriod,
} from "@/lib/opening-hours";

type Row = {
  hours_source: string;
  weekday_text: string[] | null;
  periods: HoursPeriod[] | null;
  utc_offset_minutes: number | null;
};

/** Public venue opening hours. Reads stored hours only — never calls Google. */
export function VenueOpeningHours({ subdomain, venueId, disabled }: { subdomain: string; venueId: string; disabled?: boolean }) {
  const [row, setRow] = useState<Row | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    (supabase.rpc as unknown as (fn: string, a: Record<string, unknown>) => Promise<{ data: Row[] | null }>)(
      "get_public_venue_hours",
      { _hostname: tenantHost(subdomain), _venue_id: venueId },
    ).then((r) => { if (!cancelled) { setRow(r.data?.[0] ?? null); setNow(new Date()); } }, () => {});
    return () => { cancelled = true; };
  }, [subdomain, venueId, disabled]);

  const lines = Array.isArray(row?.weekday_text) ? row!.weekday_text.filter((l) => typeof l === "string") : [];
  if (!row || lines.length === 0 || !now) return null;

  const open = row.hours_source === "google" ? isOpenNow(row.periods, row.utc_offset_minutes, now) : null;
  const today = todayIndexMonFirst(row.hours_source === "google" ? row.utc_offset_minutes : null, now);

  return (
    <section className="mt-6 rounded-2xl border border-[var(--event-primary,#1F3D2B)]/15 bg-[var(--event-surface,#FFFFFF)] p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--event-primary,#1F3D2B)]">
          <Clock className="h-4 w-4" /> Opening hours
        </h2>
        {open !== null && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${open ? "bg-[var(--event-primary,#1F3D2B)] text-[var(--event-primary-foreground,#FFFFFF)]" : "bg-[var(--event-text,#3D372C)]/10 text-[var(--event-text,#3D372C)]"}`}>
            {open ? "Open now" : "Closed now"}
          </span>
        )}
      </div>
      <dl className="space-y-1 text-sm text-[var(--event-text,#3D372C)]">
        {lines.slice(0, 7).map((line, i) => {
          const { day, hours } = splitWeekdayLine(line, WEEKDAYS_MON_FIRST[i] ?? "");
          return (
            <div key={i} className={`flex justify-between gap-4 ${i === today ? "font-semibold" : ""}`}>
              <dt>{day}</dt>
              <dd className="text-right">{hours || "—"}</dd>
            </div>
          );
        })}
      </dl>
      {row.hours_source === "google" && (
        <p className="mt-2 text-[11px] opacity-60">Hours from Google — check with the venue before visiting.</p>
      )}
    </section>
  );
}
