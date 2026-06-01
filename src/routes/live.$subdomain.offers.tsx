import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";
import { resolveVenueLabels } from "@/lib/venue-labels";
import { buildAppleMapsDirectionsUrl } from "@/lib/venue-directions";
import { PublicAnnouncementBar } from "@/components/public-announcement-bar";
import { PublicEventNav } from "@/components/public-event-nav";
import { PoweredByGetStampd } from "@/components/brand";
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

      // Fetch offer_summary per venue via the detail RPC in parallel.
      // The list RPC does not currently project offer_summary; a SQL draft
      // exists to extend it for a single round-trip.
      const detailResults: Array<{ venue: VenueRow; offer_summary: string | null }> =
        await Promise.all(
          venues.map(async (v) => {
            try {
              const { data } = await supabase.rpc("get_public_venue_by_domain", {
                _hostname: host,
                _venue_id: v.venue_id,
              });
              const row = (data?.[0] ?? null) as { offer_summary: string | null } | null;
              return { venue: v, offer_summary: row?.offer_summary ?? null };
            } catch {
              return { venue: v, offer_summary: null };
            }
          }),
        );
      if (cancelled) return;

      const offers: OfferVenue[] = detailResults
        .filter(
          (r): r is { venue: VenueRow; offer_summary: string } =>
            typeof r.offer_summary === "string" && r.offer_summary.trim().length > 0,
        )
        .map((r) => ({ ...r.venue, offer_summary: r.offer_summary.trim() }));

      const evt = (evtData?.[0] ?? null) as EventRow | null;
      setState({ kind: "ready", event: evt, offers });
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] text-sm text-[#8A7E66]">
        Loading…
      </div>
    );
  }

  if (state.kind === "not_found") {
    return <NotLiveYet />;
  }

  const { event, offers } = state;
  const labels = resolveVenueLabels(event ?? {});
  const accent = event?.primary_color ?? "#1F3D2B";

  return (
    <div className="min-h-screen bg-[#F6EFE2] px-4 py-8">
      <PublicAnnouncementBar subdomain={subdomain} />
      <PublicEventNav
        subdomain={subdomain}
        eventName={event?.name}
        primaryColor={event?.primary_color}
        accentColor={event?.accent_color}
        eventId={event?.event_id ?? null}
      />
      <div className="mx-auto max-w-md">
        <div className="mb-6">
          <Link
            to="/"
            className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#1F3D2B] underline-offset-4 hover:underline"
          >
            ← Back
          </Link>
          <h1 className="mt-3 font-trail-serif text-3xl font-semibold text-[#1F3D2B]">
            Offers
          </h1>
          <p className="mt-1 text-sm text-[#3D372C]">
            Special offers from {labels.plural.toLowerCase()} on this trail.
          </p>
        </div>

        {offers.length === 0 ? (
          <div className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 text-center text-sm text-[#3D372C]">
            <p>No offers have been listed yet.</p>
            <Link
              to="/venues"
              className="mt-3 inline-block text-xs font-semibold uppercase tracking-[0.22em] text-[#1F3D2B] underline-offset-4 hover:underline"
            >
              Browse {labels.plural.toLowerCase()} →
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {offers.map((v) => {
              const vid = v.venue_id ?? "";
              const directionsUrl = buildAppleMapsDirectionsUrl({
                name: v.name,
                address: v.address,
                lat: v.lat,
                lng: v.lng,
              });
              return (
                <li
                  key={vid}
                  className="overflow-hidden rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] shadow-sm"
                >
                  <Link
                    to="/venues/$venueId"
                    params={{ venueId: vid }}
                    className="flex items-stretch gap-3 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3D2B]"
                    aria-label={`View ${v.name ?? "venue"} details`}
                  >
                    <Thumb path={v.logo_path ?? v.cover_path} />
                    <div className="flex min-w-0 flex-1 flex-col justify-center">
                      <p className="truncate font-trail-serif text-lg font-semibold text-[#1F3D2B]">
                        {v.name ?? "Unnamed"}
                      </p>
                      {v.address && (
                        <p className="mt-0.5 truncate text-[11px] text-[#8A7E66]">
                          {v.address}
                        </p>
                      )}
                    </div>
                    <span
                      className="self-center text-lg leading-none"
                      style={{ color: accent }}
                      aria-hidden
                    >
                      ›
                    </span>
                  </Link>
                  <div className="border-t border-[#E6DCC7] bg-white/40 px-4 py-3">
                    <p
                      className="text-[10px] font-semibold uppercase tracking-[0.22em]"
                      style={{ color: accent }}
                    >
                      Offer
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-[#3D372C]">
                      {v.offer_summary}
                    </p>
                    {directionsUrl && (
                      <a
                        href={directionsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1F3D2B] underline-offset-4 hover:underline"
                      >
                        Directions →
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-8 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>
      </div>
    </div>
  );
}

function Thumb({ path }: { path: string | null }) {
  const url = getVenueAssetPublicUrl(path);
  if (!url) {
    return <div className="h-16 w-16 flex-shrink-0 rounded-xl bg-[#1F3D2B]/10" />;
  }
  return (
    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-[#1F3D2B]/10">
      <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
    </div>
  );
}

function NotLiveYet() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] px-6">
      <div className="mx-auto max-w-md rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[#1F3D2B]/10" />
        <h1 className="font-trail-serif text-2xl font-semibold text-[#1F3D2B]">
          Event not live yet
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#3D372C]">
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
