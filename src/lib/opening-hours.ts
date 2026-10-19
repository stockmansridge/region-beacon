// Pure helpers for venue opening hours (Google Places periods + manual text).

export type HoursPoint = { day: number; hour: number; minute?: number };
export type HoursPeriod = { open: HoursPoint; close?: HoursPoint };

export const WEEKDAYS_MON_FIRST = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

/** Minutes since Sunday 00:00 (Google's day 0 = Sunday). */
function weekMinute(p: HoursPoint): number {
  return p.day * 1440 + p.hour * 60 + (p.minute ?? 0);
}

/** Venue-local time expressed as a Date whose UTC fields are the local clock. */
export function venueLocalClock(now: Date, utcOffsetMinutes: number | null | undefined): Date {
  return new Date(now.getTime() + (utcOffsetMinutes ?? 0) * 60_000);
}

/** Open-now from Google periods. Returns null when it can't be determined. */
export function isOpenNow(
  periods: HoursPeriod[] | null | undefined,
  utcOffsetMinutes: number | null | undefined,
  now: Date = new Date(),
): boolean | null {
  if (!Array.isArray(periods) || periods.length === 0 || utcOffsetMinutes == null) return null;
  // Open 24/7: single period opening Sunday 00:00 with no close.
  if (periods.length === 1 && !periods[0].close && weekMinute(periods[0].open) === 0) return true;
  const local = venueLocalClock(now, utcOffsetMinutes);
  const cur = local.getUTCDay() * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes();
  const WEEK = 7 * 1440;
  for (const p of periods) {
    if (!p?.open || !p.close) continue;
    const start = weekMinute(p.open);
    let end = weekMinute(p.close);
    if (end <= start) end += WEEK; // wraps past Saturday night
    if ((cur >= start && cur < end) || (cur + WEEK >= start && cur + WEEK < end)) return true;
  }
  return false;
}

/** Index into a Monday-first list for "today" at the venue. */
export function todayIndexMonFirst(utcOffsetMinutes: number | null | undefined, now: Date = new Date()): number {
  const day = utcOffsetMinutes == null ? now.getDay() : venueLocalClock(now, utcOffsetMinutes).getUTCDay();
  return (day + 6) % 7;
}

/** Splits "Monday: 10:00 AM – 5:00 PM" into label + hours. */
export function splitWeekdayLine(line: string, fallbackDay: string): { day: string; hours: string } {
  const i = line.indexOf(":");
  if (i > 0 && i < 12) {
    const day = line.slice(0, i).trim();
    if (WEEKDAYS_MON_FIRST.includes(day)) return { day, hours: line.slice(i + 1).trim() };
  }
  return { day: fallbackDay, hours: line.trim() };
}
