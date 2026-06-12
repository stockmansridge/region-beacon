import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { resolveOfferIcon, resolveOfferBadgeStyle } from "@/lib/offer-display";
import { supabase } from "@/integrations/supabase/client";
import { applyPaletteToEvent } from "@/lib/event-palettes";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";
import { getEventAssetPublicUrl } from "@/lib/event-assets";
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
  offer_display_icon: string | null;
  offer_display_colour: string | null;
  offer_display_foreground_colour: string | null;
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
  page_background_color?: string | null;
  card_background_color?: string | null;
  text_color?: string | null;
  muted_text_color?: string | null;
  card_text_color?: string | null;
  card_muted_text_color?: string | null;
  border_color?: string | null;
  primary_text_color?: string | null;
  font_family?: string | null;
  venue_label_singular?: string | null;
  venue_label_plural?: string | null;
  logo_path?: string | null;
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

      const offers: OfferVenue[] = venues
        .filter(
          (v): v is VenueRow & { offer_summary: string } =>
            typeof v.offer_summary === "string" &&
            v.offer_summary.trim().length > 0,
        )
        .map((v) => ({ ...v, offer_summary: v.offer_summary!.trim() }));

      const evtRaw = (evtData?.[0] ?? null) as EventRow | null;
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
  const logoUrl = getEventAssetPublicUrl(event?.logo_path ?? null);

  return (
    <EventPaletteScope
      paletteKey={event?.palette_key ?? null}
      backgroundKey={event?.page_background_key ?? null}
      pageBackgroundColor={event?.page_background_color ?? null}
      cardBackgroundColor={event?.card_background_color ?? null}
      primaryColor={event?.primary_color ?? null}
      accentColor={event?.accent_color ?? null}
      textColor={event?.text_color ?? null}
      mutedTextColor={event?.muted_text_color ?? null}
      cardTextColor={event?.card_text_color ?? null}
      cardMutedTextColor={event?.card_muted_text_color ?? null}
      borderColor={event?.border_color ?? null}
      primaryTextColor={event?.primary_text_color ?? null}
      fontFamily={event?.font_family ?? null}
      className="min-h-screen px-4 pb-10"
    >
      <PublicAnnouncementBar subdomain={subdomain} />
      <PublicEventNav
        subdomain={subdomain}
        eventName={event?.name}
        primaryColor={event?.primary_color}
        accentColor={event?.accent_color}
        logoUrl={logoUrl}
        eventId={event?.event_id ?? null}
      />
      <div className="mx-auto max-w-md">
        <div className="mt-4">
          <PublicTrailTabs active="offers" venueLabelPlural={labels.plural} />
        </div>

        <div className="mb-5 mt-6 px-1">
          <h1 className="font-trail-serif text-[28px] font-semibold leading-tight text-[var(--event-primary,#1F3D2B)]">
            Special Offers
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--event-muted,#8A7E66)]">
            Visit the {labels.plural.toLowerCase()} to unlock these offers.
          </p>
        </div>

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
          <ul className="space-y-4">
            {offers.map((v) => {
              const vid = v.venue_id ?? "";
              const offerLines = v.offer_summary.split("\n").filter(Boolean);
              const offerTitle = offerLines[0] ?? v.offer_summary;
              const offerBody = offerLines.slice(1).join(" ").trim();
              const thumb = getVenueAssetPublicUrl(
                v.cover_path ?? v.logo_path,
              );
              const OfferIcon = resolveOfferIcon(v.offer_display_icon);
              const badgeStyle = resolveOfferBadgeStyle(
                v.offer_display_colour,
                v.offer_display_foreground_colour,
              );
              return (
                <li key={vid}>
                  <Link
                    to="/venues/$venueId"
                    params={{ venueId: vid }}
                    className="group relative flex items-stretch gap-4 overflow-hidden rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-4 pr-16 shadow-sm transition hover:border-[var(--event-primary,#1F3D2B)]/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--event-primary,#1F3D2B)]"
                    aria-label={`View ${v.name ?? "venue"} offer`}
                  >
                    {/* Offer icon badge (left) */}
                    <span
                      className="grid h-14 w-14 flex-shrink-0 place-items-center self-center rounded-full"
                      style={badgeStyle}
                      aria-hidden
                    >
                      <OfferIcon className="h-6 w-6" />
                    </span>

                    {/* Content (middle) */}
                    <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
                      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
                        {v.name ?? "Venue"}
                      </p>
                      <p className="mt-1 line-clamp-2 font-trail-serif text-[17px] font-semibold leading-snug text-[var(--event-primary,#1F3D2B)]">
                        {offerTitle}
                      </p>
                      {offerBody && (
                        <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-[var(--event-body,#3D372C)]">
                          {offerBody}
                        </p>
                      )}
                    </div>

                    {/* Image thumb (right) */}
                    <div className="hidden h-16 w-16 flex-shrink-0 self-center overflow-hidden rounded-xl bg-[var(--event-primary,#1F3D2B)]/10 sm:block">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-[var(--event-primary,#1F3D2B)]/40">
                          <OfferIcon className="h-6 w-6" />
                        </div>
                      )}
                    </div>




                    {/* Strong circular chevron (far right) */}
                    <span
                      aria-hidden
                      className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full shadow-sm transition group-hover:translate-x-0.5"
                      style={{
                        background: "var(--event-primary,#1F3D2B)",
                        color: "var(--event-primary-fg,#F6EFE2)",
                      }}
                    >
                      <ChevronRight className="h-5 w-5" />
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
