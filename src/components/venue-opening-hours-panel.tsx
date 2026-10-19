import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { refreshVenueHoursNow } from "@/lib/venue-hours.functions";
import { WEEKDAYS_MON_FIRST } from "@/lib/opening-hours";

type HoursRow = {
  hours_source: "google" | "manual" | "off";
  google_place_name: string | null;
  google_hours: { weekdayDescriptions?: string[] } | null;
  manual_hours: string[] | null;
  sync_status: string;
  sync_error: string | null;
  synced_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting for the next weekly refresh",
  ok: "Hours found on Google",
  no_hours: "Found on Google, but no hours listed",
  not_found: "No matching Google listing nearby",
  error: "Last refresh failed",
};

const sb = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, a: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
};

export function VenueOpeningHoursPanel({ venueId }: { venueId: string }) {
  const [row, setRow] = useState<HoursRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<HoursRow["hours_source"]>("google");
  const [manual, setManual] = useState<string[]>(() => WEEKDAYS_MON_FIRST.map(() => ""));
  const [busy, setBusy] = useState<null | "refresh" | "save">(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.from("venue_opening_hours").select("*").eq("venue_id", venueId).maybeSingle();
    if (error) setMsg(`Could not load hours: ${error.message}. Has the opening-hours SQL been run?`);
    const r = (data ?? null) as HoursRow | null;
    setRow(r);
    setSource(r?.hours_source ?? "google");
    setManual(WEEKDAYS_MON_FIRST.map((_, i) => r?.manual_hours?.[i] ?? ""));
    setLoading(false);
  }, [venueId]);

  useEffect(() => { void load(); }, [load]);

  async function refresh() {
    setBusy("refresh"); setMsg(null);
    const { data: s } = await supabase.auth.getSession();
    const token = s.session?.access_token;
    if (!token) { setMsg("Please sign in again."); setBusy(null); return; }
    const res = await refreshVenueHoursNow({ data: { access_token: token, venue_id: venueId } });
    setMsg(res.ok ? STATUS_LABEL[res.status] ?? "Refreshed." : res.error);
    await load();
    setBusy(null);
  }

  async function save() {
    setBusy("save"); setMsg(null);
    const hasManual = manual.some((m) => m.trim());
    const { error } = await sb.rpc("admin_set_venue_hours", {
      _venue_id: venueId,
      _hours_source: source,
      _manual_hours: hasManual ? manual.map((m) => m.trim().slice(0, 80)) : null,
    });
    setMsg(error ? `Could not save: ${error.message}` : "Saved.");
    await load();
    setBusy(null);
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading opening hours…</p>;
  const google = row?.google_hours?.weekdayDescriptions ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3 text-sm">
        <p className="font-medium">{STATUS_LABEL[row?.sync_status ?? "pending"]}</p>
        {row?.google_place_name && <p className="text-muted-foreground">Matched: {row.google_place_name}</p>}
        {row?.synced_at && <p className="text-xs text-muted-foreground">Last checked {new Date(row.synced_at).toLocaleString()}</p>}
        {row?.sync_status === "error" && row.sync_error && <p className="mt-1 text-xs text-destructive">{row.sync_error}</p>}
        {google.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">{google.map((l, i) => <li key={i}>{l}</li>)}</ul>
        )}
        <button type="button" onClick={refresh} disabled={busy !== null}
          className="mt-3 inline-flex items-center rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
          {busy === "refresh" ? "Checking Google…" : "Refresh from Google"}
        </button>
        <p className="mt-1 text-xs text-muted-foreground">Hours refresh automatically once a week. Matching uses the venue name and location.</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Show on the venue page</p>
        {([["google", "Google hours"], ["manual", "My own hours (below)"], ["off", "Don't show hours"]] as const).map(([v, label]) => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input type="radio" name="hours-source" checked={source === v} onChange={() => setSource(v)} /> {label}
          </label>
        ))}
      </div>

      {source === "manual" && (
        <div className="grid gap-2">
          {WEEKDAYS_MON_FIRST.map((d, i) => (
            <label key={d} className="grid grid-cols-[100px_1fr] items-center gap-2 text-sm">
              <span>{d}</span>
              <input type="text" maxLength={80} value={manual[i]} placeholder="e.g. 10am – 5pm or Closed"
                onChange={(e) => setManual((m) => m.map((x, j) => (j === i ? e.target.value : x)))}
                className="h-9 rounded-md border bg-background px-2 text-sm" />
            </label>
          ))}
        </div>
      )}

      <button type="button" onClick={save} disabled={busy !== null}
        className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
        {busy === "save" ? "Saving…" : "Save hours settings"}
      </button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
