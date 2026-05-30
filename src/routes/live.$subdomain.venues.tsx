import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";
import { resolveVenueLabels } from "@/lib/venue-labels";
import { PublicAnnouncementBar } from "@/components/public-announcement-bar";
import { PoweredByGetStampd } from "@/components/brand";

export const Route = createFileRoute("/live/$subdomain/venues")({
  head: () => ({ meta: [{ title: "Venues" }] }),
  component: PublicVenuesListPage,
});

type VenueRow = {
  venue_id: string | null;
  name: string | null;
  description: string | null;
  address: string | null;
  website_url: string | null;
  phone: string | null;
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

type State =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "ready"; event: EventRow | null; venues: VenueRow[] };

function PublicVenuesListPage() {
  const { subdomain } = Route.useParams();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      const host = `${subdomain}.getstampd.com.au`;

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

      if (rows.length === 0 || rows[0].event_found === false) {
        setState({ kind: "not_found" });
        return;
      }

      const venues = rows.filter((r) => r.event_found !== false && r.venue_id);
      const evt = (evtData?.[0] ?? null) as EventRow | null;
      setState({ kind: "ready", event: evt, venues });
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

  const { event, venues } = state;
  const labels = resolveVenueLabels(event ?? {});
  const accent = event?.primary_color ?? "#1F3D2B";

  return (
    <div className="min-h-screen bg-[#F6EFE2] px-4 py-8">
      <PublicAnnouncementBar subdomain={subdomain} />
      <div className="mx-auto max-w-md">
        <div className="mb-6">
          <Link
            to="/live/$subdomain"
            params={{ subdomain }}
            className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#1F3D2B] underline-offset-4 hover:underline"
          >
            ← Back
          </Link>
          <h1 className="mt-3 font-trail-serif text-3xl font-semibold text-[#1F3D2B]">
            {labels.plural}
          </h1>
          {event?.name && (
            <p className="mt-1 text-xs uppercase tracking-[0.22em] text-[#8A7E66]">
              {event.name}
            </p>
          )}
        </div>

        {venues.length === 0 ? (
          <div className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 text-center text-sm text-[#3D372C]">
            No {labels.plural.toLowerCase()} listed yet. Check back soon.
          </div>
        ) : (
          <ul className="space-y-3">
            {venues.map((v) => (
              <li key={v.venue_id ?? Math.random()}>
                <Link
                  to="/live/$subdomain/venues/$venueId"
                  params={{ subdomain, venueId: v.venue_id ?? "" }}
                  className="flex items-stretch gap-3 overflow-hidden rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-3 shadow-sm transition hover:border-[#1F3D2B]/40"
                >
                  <Thumb path={v.logo_path ?? v.cover_path} />
                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <p className="truncate font-trail-serif text-lg font-semibold text-[#1F3D2B]">
                      {v.name ?? "Unnamed"}
                    </p>
                    {v.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[#3D372C]">
                        {v.description}
                      </p>
                    )}
                    {v.address && (
                      <p className="mt-1 truncate text-[11px] text-[#8A7E66]">
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
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 flex justify-center"><PoweredByGetStampd variant="trail" /></div>
      </div>
    </div>
  );
}

function Thumb({ path }: { path: string | null }) {
  const url = getVenueAssetPublicUrl(path);
  if (!url) {
    return (
      <div className="h-16 w-16 flex-shrink-0 rounded-xl bg-[#1F3D2B]/10" />
    );
  }
  return (
    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-[#1F3D2B]/10">
      <img
        src={url}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
      />
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
        <div className="mt-6 flex justify-start"><PoweredByGetStampd variant="trail" /></div>
      </div>
    </div>
  );
}
