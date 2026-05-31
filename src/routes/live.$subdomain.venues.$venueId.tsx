import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";
import { buildAppleMapsDirectionsUrl } from "@/lib/venue-directions";
import { PublicAnnouncementBar } from "@/components/public-announcement-bar";
import { PublicEventNav } from "@/components/public-event-nav";
import { PoweredByGetStampd } from "@/components/brand";
import { rpcEventHost } from "@/lib/domains";

export const Route = createFileRoute("/live/$subdomain/venues/$venueId")({
  head: () => ({ meta: [{ title: "Venue" }] }),
  component: function VenueDetailRoute() {
    const { subdomain, venueId } = Route.useParams();
    return <PublicVenueDetailPage subdomain={subdomain} venueId={venueId} />;
  },
});


type VenueRow = {
  venue_id: string;
  name: string;
  description: string | null;
  offer_summary: string | null;
  address: string | null;
  website_url: string | null;
  phone: string | null;
  logo_path: string | null;
  cover_path: string | null;
  lat: number | null;
  lng: number | null;
  order_index: number | null;
};

type State =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "ready"; venue: VenueRow };

export function PublicVenueDetailPage({ subdomain, venueId }: { subdomain: string; venueId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });


  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      const host = rpcEventHost(subdomain);

      const { data, error } = await supabase.rpc(
        "get_public_venue_by_domain",
        { _hostname: host, _venue_id: venueId },
      );
      if (cancelled) return;

      if (error) {
        setState({ kind: "not_found" });
        return;
      }
      const row = (data?.[0] ?? null) as VenueRow | null;
      if (!row) {
        setState({ kind: "not_found" });
        return;
      }
      setState({ kind: "ready", venue: row });
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain, venueId]);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] text-sm text-[#8A7E66]">
        Loading…
      </div>
    );
  }

  if (state.kind === "not_found") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] px-6">
        <div className="mx-auto max-w-md rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-8 text-center shadow-sm">
          <h1 className="font-trail-serif text-2xl font-semibold text-[#1F3D2B]">
            Venue not found
          </h1>
          <p className="mt-3 text-sm text-[#3D372C]">
            This venue isn't available right now.
          </p>
          <Link
            to="/venues"
            className="mt-6 inline-block text-[11px] font-medium uppercase tracking-[0.22em] text-[#1F3D2B] underline-offset-4 hover:underline"
          >
            ← All venues
          </Link>
        </div>
      </div>
    );
  }

  const { venue } = state;
  const coverUrl = getVenueAssetPublicUrl(venue.cover_path);
  const logoUrl = getVenueAssetPublicUrl(venue.logo_path);

  return (
    <div className="min-h-screen bg-[#F6EFE2] pb-12">
      <PublicAnnouncementBar subdomain={subdomain} />
      <div className="px-4"><PublicEventNav subdomain={subdomain} /></div>
      <div className="mx-auto max-w-md">
        <div className="relative aspect-[3/1] w-full overflow-hidden bg-[#1F3D2B]/10">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
          <Link
            to="/venues"
            className="absolute left-3 top-3 rounded-full bg-[#F6EFE2]/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-[#1F3D2B] shadow"
          >
            ← Back
          </Link>
        </div>

        <div className="px-4">
          <div className="-mt-10 flex items-end gap-3">
            <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border-4 border-[#F6EFE2] bg-[#FBF5E8] shadow">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${venue.name} logo`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center font-trail-serif text-2xl font-semibold text-[#1F3D2B]">
                  {venue.name.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          <h1 className="mt-4 font-trail-serif text-3xl font-semibold text-[#1F3D2B]">
            {venue.name}
          </h1>

          {venue.address && (
            <p className="mt-1 text-sm text-[#8A7E66]">{venue.address}</p>
          )}

          {venue.description && (
            <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-[#3D372C]">
              {venue.description}
            </p>
          )}

          {venue.offer_summary && (
            <div className="mt-5 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8A7E66]">
                About their offer
              </div>
              <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-[#3D372C]">
                {venue.offer_summary}
              </p>
            </div>
          )}

          <div className="mt-6 space-y-2">
            {(() => {
              const directionsUrl = buildAppleMapsDirectionsUrl({
                name: venue.name,
                address: venue.address,
                lat: venue.lat,
                lng: venue.lng,
              });
              return directionsUrl ? (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] px-4 py-3 text-sm font-medium text-[#1F3D2B] shadow-sm transition hover:border-[#1F3D2B]/40"
                >
                  <span>Get directions (Apple Maps)</span>
                  <span aria-hidden>↗</span>
                </a>
              ) : null;
            })()}
            {venue.website_url && (
              <a
                href={venue.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] px-4 py-3 text-sm font-medium text-[#1F3D2B] shadow-sm transition hover:border-[#1F3D2B]/40"
              >
                <span>Visit website</span>
                <span aria-hidden>↗</span>
              </a>
            )}
            {venue.phone && (
              <a
                href={`tel:${venue.phone.replace(/\s+/g, "")}`}
                className="flex items-center justify-between rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] px-4 py-3 text-sm font-medium text-[#1F3D2B] shadow-sm transition hover:border-[#1F3D2B]/40"
              >
                <span>Call {venue.phone}</span>
                <span aria-hidden>›</span>
              </a>
            )}
          </div>

          <div className="mt-6 flex aspect-[5/3] w-full items-center justify-center rounded-2xl border border-dashed border-[#8A7E66]/40 bg-[#FBF5E8] text-center text-xs text-[#8A7E66]">
            Map coming soon
            {venue.lat !== null && venue.lng !== null && (
              <span className="sr-only">
                Located at {venue.lat}, {venue.lng}
              </span>
            )}
          </div>

          <div
            className="mt-6 rounded-2xl px-4 py-4 text-center text-sm font-medium text-[#F6EFE2] shadow"
            style={{ backgroundColor: "#1F3D2B" }}
          >
            Scan the venue QR to collect your stamp.
          </div>

          <div className="mt-8 flex justify-center"><PoweredByGetStampd variant="trail" /></div>
        </div>
      </div>
    </div>
  );
}
