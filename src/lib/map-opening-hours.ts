import { isOpenNow, type HoursPeriod } from "@/lib/opening-hours";

export type PublicMapHours = {
  hours_source: string;
  periods: HoursPeriod[] | null;
  utc_offset_minutes: number | null;
  synced_at: string | null;
};

/** Only positively known, fresh cached Google hours qualify; manual text is unknown. */
export function mapVenueIsOpen(hours: PublicMapHours | null | undefined, now: Date, timeZone?: string | null): boolean {
  if (!hours || hours.hours_source !== "google" || !hours.synced_at) return false;
  const synced = Date.parse(hours.synced_at);
  if (!Number.isFinite(synced) || synced > now.getTime() || now.getTime() - synced >= 28 * 86_400_000) return false;
  return isOpenNow(hours.periods, hours.utc_offset_minutes, now, timeZone) === true;
}