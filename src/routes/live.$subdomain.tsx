import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrailLanding } from "@/components/trail-landing";
import { resolveVenueLabels } from "@/lib/venue-labels";
import { PublicAnnouncementBar } from "@/components/public-announcement-bar";
import { getEventAssetPublicUrl } from "@/lib/event-assets";
import { PoweredByGetStampd } from "@/components/brand";


export const Route = createFileRoute("/live/$subdomain")({
  component: LivePublicPage,
});

type ResolveRow = {
  kind: "marketing" | "admin" | "event" | "not_found";
  event_id: string | null;
  public_slug: string | null;
  requires_auth: boolean;
};

type PublicEvent = {
  event_id: string;
  name: string;
  public_slug: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  logo_path: string | null;
  cover_path: string | null;
  primary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  welcome_copy: string | null;
  terms_url: string | null;
  current_terms_version_id: string | null;
  // Added by the public RPC extension; optional so this code stays safe
  // before the migration is applied.
  venue_label_singular?: string | null;
  venue_label_plural?: string | null;
};

type PublicVenue = {
  venue_id: string;
  name: string;
  address: string | null;
  order_index: number | null;
};

type State =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "event"; event: PublicEvent; venues: PublicVenue[] };

function LivePublicPage() {
  const { subdomain } = Route.useParams();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      const host = rpcEventHost(subdomain);

      const { data: resolveData, error: resolveErr } = await supabase.rpc(
        "resolve_event_by_host",
        { _hostname: host },
      );
      if (cancelled) return;
      const row = (resolveData?.[0] ?? null) as ResolveRow | null;

      if (resolveErr || !row || row.kind !== "event" || !row.event_id) {
        setState({ kind: "not_found" });
        return;
      }

      const { data: evtData, error: evtErr } = await supabase.rpc(
        "get_public_event_by_domain",
        { _hostname: host },
      );
      if (cancelled) return;
      const evt = (evtData?.[0] ?? null) as PublicEvent | null;
      if (evtErr || !evt) {
        setState({ kind: "not_found" });
        return;
      }

      const { data: venueData } = await supabase.rpc(
        "get_public_event_venues",
        { _event_id: evt.event_id },
      );
      if (cancelled) return;
      const venues = (venueData ?? []) as PublicVenue[];

      setState({ kind: "event", event: evt, venues });
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
  const canRegister = Boolean(event.current_terms_version_id);
  const venueLabels = resolveVenueLabels(event);
  return (
    <div className="min-h-screen bg-[#F6EFE2] px-4 py-8">
      <PublicAnnouncementBar subdomain={subdomain} />
      <TrailLanding
        eventName={event.name}
        venueLabelPlural={venueLabels.plural}
        pitch={event.description ?? undefined}
        welcomeCopy={event.welcome_copy ?? undefined}
        primaryColor={event.primary_color ?? undefined}
        accentColor={event.accent_color ?? undefined}
        fontFamily={event.font_family ?? undefined}
        logoUrl={getEventAssetPublicUrl(event.logo_path)}
        heroImageUrl={getEventAssetPublicUrl(event.cover_path)}
        venueCount={venues.length}
        venueNames={venues.map((v) => v.name)}
        termsUrl={event.terms_url}
        primaryCta={
          canRegister ? (
            <Link
              to="/live/$subdomain/join"
              params={{ subdomain }}
              className="grid h-12 w-full place-items-center rounded-full text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
              style={{ backgroundColor: event.primary_color ?? "#1F3D2B" }}
            >
              Start passport
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="h-12 w-full cursor-not-allowed rounded-full text-sm font-semibold tracking-wide text-[#F6EFE2] opacity-70 shadow"
              style={{ backgroundColor: event.primary_color ?? "#1F3D2B" }}
              title="Terms & privacy not configured yet"
            >
              Start passport — coming soon
            </button>
          )
        }
        secondaryCta={<span />}
      />
      <div className="mx-auto mt-6 flex max-w-md flex-col items-center gap-3 text-center">
        <Link
          to="/live/$subdomain/venues"
          params={{ subdomain }}
          className="text-xs font-medium uppercase tracking-[0.22em] text-[#1F3D2B] underline-offset-4 hover:underline"
        >
          View {venueLabels.plural.toLowerCase()} →
        </Link>
        <Link
          to="/live/$subdomain/leaderboard"
          params={{ subdomain }}
          className="text-xs font-medium uppercase tracking-[0.22em] text-[#1F3D2B] underline-offset-4 hover:underline"
        >
          View leaderboard →
        </Link>
      </div>
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
        <div className="mt-6 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>

      </div>
    </div>
  );
}
