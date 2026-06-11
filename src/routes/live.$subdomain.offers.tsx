import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyPaletteToEvent } from "@/lib/event-palettes";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";
import { resolveVenueLabels } from "@/lib/venue-labels";

import { PublicAnnouncementBar } from "@/components/public-announcement-bar";
import { PublicEventNav } from "@/components/public-event-nav";
import { PoweredByGetStampd } from "@/components/brand";
import { PublicTrailTabs } from "@/components/public-trail-tabs";
import { tenantHost } from "@/lib/domains";

export const Route = createFileRoute("/live/$subdomain/offers")({
  head: () => ({ meta: [{ title: "Offers" }] }),
  component: function OffersRoute() {
    const { subdomain } = Route.useParams();
    return <PublicOffersPage subdomain={subdomain} />;
  },
});

type VenueRow = {
  venue_id: string | null;
  name: string | null;
  description: string | null;
  address: string | null;
  logo_path: string | null;
  cover_path: string | null;
  offer_summary: string | null;
  lat: number | null;
  lng: number | null;
  order_index: number | null;
  event_found: boolean | null;
};

type EventRow = {
  event_id: string;
  name: string;
  primary_color: string | null;
  accent_color: string | null;
  palette_key?: string | null;
  page_background_key?: string | null;
  venue_label_singular?: string | null;
  venue_label_plural?: string | null;
};

type OfferVenue = VenueRow & { offer_summary: string };

type State =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "ready"; event: EventRow | null; offers: OfferVenue[] };

export function PublicOffersPage({ subdomain }: { subdomain: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      const host = tenantHost(subdomain);

      const [{ data: venueData, error: venueErr }, { data: evtData }] =
        await Promise.all([
          supabase.rpc("get_public_venues_by_domain", { _hostname: host }),
          supabase.rpc("get_public_event_by_domain", { _hostname: host }),
        ]);
      if (cancelled) return;

      if (venueErr) {
        setState({ kind: "not_found" });
        return;
      }
      const rows = (venueData ?? []) as VenueRow[];
      if (rows.length === 0 || rows[0]?.event_found === false) {
        setState({ kind: "not_found" });
        return;
      }
      const venues = rows.filter((r) => r.event_found !== false && r.venue_id);

      // Single round-trip: offer_summary is now projected by
      // get_public_venues_by_domain (migration
      // supabase/migrations-draft-public-offers/01_extend_get_public_venues_by_domain_offer_summary.sql).
      const offers: OfferVenue[] = venues
        .filter(
          (v): v is VenueRow & { offer_summary: string } =>
            typeof v.offer_summary === "string" &&
            v.offer_summary.trim().length > 0,
        )
        .map((v) => ({ ...v, offer_summary: v.offer_summary!.trim() }));

      const evtRaw = ((evtData?.[0] ?? null) as EventRow | null);
      const evt = evtRaw ? applyPaletteToEvent(evtRaw) : null;
      setState({ kind: "ready", event: evt, offers });
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--event-page-bg,#F6EFE2)] text-sm text-[var(--event-muted,#8A7E66)]">
        Loading…
      </div>
    );
  }

  if (state.kind === "not_found") {
    return <NotLiveYet />;
  }

  const { event, offers } = state;
  const labels = resolveVenueLabels(event ?? {});
  const accent = event?.primary_color ?? "var(--event-primary,#1F3D2B)";

  return (
    <EventPaletteScope
      paletteKey={event?.palette_key ?? null}
      backgroundKey={event?.page_background_key ?? null}
      className="min-h-screen px-4 py-6"
    >
      <PublicAnnouncementBar subdomain={subdomain} />
      <PublicEventNav
        subdomain={subdomain}
        eventName={event?.name}
        primaryColor={event?.primary_color}
        accentColor={event?.accent_color}
        eventId={event?.event_id ?? null}
      />
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--event-muted,#8A7E66)]">
              Trail
            </p>
            <h1 className="mt-1 font-trail-serif text-[26px] font-semibold leading-tight text-[var(--event-primary,#1F3D2B)]">
              Offers
            </h1>
          </div>
          <Link
            to="/"
            className="shrink-0 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)] underline-offset-4 hover:underline"
          >
            ← Home
          </Link>
        </div>

        <PublicTrailTabs active="offers" venueLabelPlural={labels.plural} />

        {offers.length === 0 ? (
          <div className="rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-6 text-center text-sm text-[var(--event-body,#3D372C)]">
            <p>No offers have been listed yet.</p>
            <Link
              to="/venues"
              className="mt-3 inline-block text-xs font-semibold uppercase tracking-[0.22em] text-[var(--event-primary,#1F3D2B)] underline-offset-4 hover:underline"
            >
              Browse {labels.plural.toLowerCase()} →
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {offers.map((v) => {
              const vid = v.venue_id ?? "";
              const offerLines = v.offer_summary.split("\n").filter(Boolean);
              const offerTitle = offerLines[0] ?? v.offer_summary;
              const offerBody = offerLines.slice(1).join(" ").trim();
              return (
                <li key={vid}>
                  <Link
                    to="/venues/$venueId"
                    params={{ venueId: vid }}
                    className="flex items-stretch gap-3 overflow-hidden rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-2.5 shadow-sm transition hover:border-[var(--event-primary,#1F3D2B)]/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--event-primary,#1F3D2B)]"
                    aria-label={`View ${v.name ?? "venue"} details`}
                  >
                    <Thumb path={v.cover_path ?? v.logo_path} />
                    <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
                      <p
                        className="truncate text-[10px] font-semibold uppercase tracking-[0.22em]"
                        style={{ color: accent }}
                      >
                        {v.name ?? "Venue"}
                      </p>
                      <p className="mt-0.5 line-clamp-2 font-trail-serif text-[16px] font-semibold leading-snug text-[var(--event-primary,#1F3D2B)]">
                        {offerTitle}
                      </p>
                      {offerBody && (
                        <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-[var(--event-body,#3D372C)]">
                          {offerBody}
                        </p>
                      )}
                    </div>
                    <span
                      className="self-center pr-1 text-lg leading-none"
                      style={{ color: accent }}
                      aria-hidden
                    >
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}

          </ul>
        )}

        <div className="mt-8 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>
      </div>
    </EventPaletteScope>
  );
}

function Thumb({ path }: { path: string | null }) {
  const url = getVenueAssetPublicUrl(path);
  if (!url) {
    return <div className="h-[80px] w-[80px] flex-shrink-0 rounded-xl bg-[var(--event-primary,#1F3D2B)]/10" />;
  }
  return (
    <div className="h-[80px] w-[80px] flex-shrink-0 overflow-hidden rounded-xl bg-[var(--event-primary,#1F3D2B)]/10">
      <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
    </div>
  );
}

function NotLiveYet() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--event-page-bg,#F6EFE2)] px-6">
      <div className="mx-auto max-w-md rounded-3xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[var(--event-primary,#1F3D2B)]/10" />
        <h1 className="font-trail-serif text-2xl font-semibold text-[var(--event-primary,#1F3D2B)]">
          Event not live yet
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--event-body,#3D372C)]">
          This passport experience isn't available right now. Please check back
          closer to the event, or contact the organiser for details.
        </p>
        <div className="mt-6 flex justify-start">
          <PoweredByGetStampd variant="trail" />
        </div>
      </div>
    </div>
  );
}
