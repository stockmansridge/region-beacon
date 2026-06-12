import { useEffect, useState } from "react";
import { loadPassportStampState, type PassportStampVenue } from "@/lib/passport-stamps";
import { listPublicAwards, type PublicEventAward } from "@/lib/event-awards";
import { resolveCurrentEventPassport } from "@/lib/use-current-event-passport";

export type PassportHomeData = {
  loading: boolean;
  hasPassport: boolean;
  passportId: string | null;
  passportHref: string | null;
  visited: number;
  total: number;
  /** Sum of points across configured awards (best available signal until a
   *  dedicated points-ledger RPC is exposed publicly). */
  points: number | null;
  venues: PassportStampVenue[];
  awards: PublicEventAward[];
};

const EMPTY: PassportHomeData = {
  loading: true,
  hasPassport: false,
  passportId: null,
  passportHref: null,
  visited: 0,
  total: 0,
  points: null,
  venues: [],
  awards: [],
};

type CacheEntry = { at: number; data: PassportHomeData };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<PassportHomeData>>();
const TTL_MS = 20_000;

async function loadOnce(eventId: string): Promise<PassportHomeData> {
  const existing = inflight.get(eventId);
  if (existing) return existing;
  const fresh = (async () => {
    const passport = await resolveCurrentEventPassport(eventId);
    const [stamps, awards] = await Promise.all([
      passport.token
        ? loadPassportStampState(passport.token)
        : Promise.resolve(null),
      listPublicAwards(eventId, passport.passportId ?? null).catch(() => []),
    ]);
    const venues = stamps?.allVenues ?? [];
    const visited = stamps?.visitedCount ?? 0;
    const total = stamps?.totalVenueCount ?? venues.length;
    // Best-effort points: use the awards RPC's `passport_points` which the
    // server already computes against the points ledger for this passport.
    const pointsFromAwards = awards.find((a) => typeof a.passport_points === "number")?.passport_points;
    const result: PassportHomeData = {
      loading: false,
      hasPassport: !!passport.token,
      passportId: passport.passportId ?? null,
      passportHref: passport.passportHref,
      visited,
      total,
      points: passport.token
        ? typeof pointsFromAwards === "number"
          ? pointsFromAwards
          : visited
        : null,
      venues,
      awards,
    };
    cache.set(eventId, { at: Date.now(), data: result });
    inflight.delete(eventId);
    return result;
  })();
  inflight.set(eventId, fresh);
  return fresh;
}

export function usePassportHomeData(eventId: string | null | undefined): PassportHomeData {
  const [state, setState] = useState<PassportHomeData>(() => {
    if (!eventId) return { ...EMPTY, loading: false };
    const c = cache.get(eventId);
    if (c && Date.now() - c.at < TTL_MS) return c.data;
    return EMPTY;
  });

  useEffect(() => {
    let cancelled = false;
    if (!eventId) {
      setState({ ...EMPTY, loading: false });
      return;
    }
    const c = cache.get(eventId);
    if (c && Date.now() - c.at < TTL_MS) {
      setState(c.data);
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    loadOnce(eventId).then((data) => {
      if (!cancelled) setState(data);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  return state;
}

export function pickNextReward(awards: PublicEventAward[]): PublicEventAward | null {
  if (!awards || awards.length === 0) return null;
  const sorted = [...awards].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      a.points_required - b.points_required,
  );
  return sorted.find((a) => !a.is_eligible) ?? null;
}
