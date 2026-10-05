// Read-only public content for the V2 editor preview. Every call here is a
// public SELECT-style RPC that the live public pages already make; nothing
// writes, claims, redeems, stores or tracks. Person-specific states (passport,
// bookmarks, leaderboard names, results) are NOT loaded — the editor supplies
// clearly labelled sample fixtures for those.
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import type { PublicFaqEntry } from "@/lib/use-event-faq";
import type { PublicEventAward } from "@/lib/event-awards";
import type { LegalRow } from "@/components/public-legal";

export type V2PreviewVenueExtras = {
  emotive_text: string | null;
  emotive_font_family: string | null;
  default_emotive_font_family: string | null;
  points_value: number;
};

export type V2PreviewContent = {
  /** True when the event's public host resolved (published content available). */
  live: boolean;
  faq: PublicFaqEntry[];
  awards: PublicEventAward[];
  legal: LegalRow | null;
  eventMapPath: string | null;
};

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc.bind(supabase) as unknown as Rpc)(fn, args).then((r) => r, () => ({ data: null, error: true }));

export async function loadV2PreviewContent(subdomain: string | null, eventId: string): Promise<V2PreviewContent> {
  if (!subdomain) return { live: false, faq: [], awards: [], legal: null, eventMapPath: null };
  const host = tenantHost(subdomain);
  const [evt, faq, legal, awards] = await Promise.all([
    rpc("get_public_event_by_domain", { _hostname: host }),
    rpc("get_public_event_faq_by_domain", { _hostname: host }),
    rpc("get_public_event_legal_by_domain", { _hostname: host }),
    rpc("get_public_event_awards", { p_event_id: eventId, p_passport_id: null }),
  ]);
  const evtRow = (Array.isArray(evt.data) ? evt.data[0] : null) as { event_id?: string; event_map_path?: string | null } | null;
  // Ownership: only accept host content that resolves to THIS event.
  const live = Boolean(evtRow && evtRow.event_id === eventId);
  if (!live) return { live: false, faq: [], awards: [], legal: null, eventMapPath: null };
  return {
    live,
    faq: (Array.isArray(faq.data) ? faq.data : []) as PublicFaqEntry[],
    awards: (Array.isArray(awards.data) ? awards.data : []) as PublicEventAward[],
    legal: ((Array.isArray(legal.data) ? legal.data[0] : null) ?? null) as LegalRow | null,
    eventMapPath: evtRow?.event_map_path ?? null,
  };
}

export async function loadV2PreviewVenueExtras(subdomain: string | null, venueId: string): Promise<V2PreviewVenueExtras | null> {
  if (!subdomain) return null;
  const res = await rpc("get_public_venue_extras", { _hostname: tenantHost(subdomain), _venue_id: venueId });
  return ((Array.isArray(res.data) ? res.data[0] : null) ?? null) as V2PreviewVenueExtras | null;
}

/** Same rule as the public map hook: a real coordinate or an uploaded map. */
export function previewHasMap(venues: Array<{ lat?: number | string | null; lng?: number | string | null }>, eventMapPath: string | null) {
  return Boolean(eventMapPath) || venues.some((v) => {
    const lat = v.lat == null ? NaN : Number(v.lat);
    const lng = v.lng == null ? NaN : Number(v.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  });
}
