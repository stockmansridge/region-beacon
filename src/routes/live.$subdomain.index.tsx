import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyPaletteToEvent } from "@/lib/event-palettes";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { TrailLanding } from "@/components/trail-landing";
import { resolveVenueLabels } from "@/lib/venue-labels";
import { PublicAnnouncementBar } from "@/components/public-announcement-bar";
import { PublicEventNav } from "@/components/public-event-nav";
import { getEventAssetPublicUrl } from "@/lib/event-assets";
import { PoweredByGetStampd } from "@/components/brand";
import { tenantHost } from "@/lib/domains";
import { useCurrentEventPassport } from "@/lib/use-current-event-passport";
import { CollectPointsSection } from "@/components/collect-points-section";
import { PassportProgressCard } from "@/components/passport-progress-card";


export const Route = createFileRoute("/live/$subdomain/")({
  component: function LivePublicRoute() {
    const { subdomain } = Route.useParams();
    return <LivePublicPage subdomain={subdomain} />;
  },
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
  palette_key?: string | null;
  page_background_key?: string | null;
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

export function LivePublicPage({ subdomain }: { subdomain: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });


  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      const host = tenantHost(subdomain);

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
      const evtRaw = ((evtData?.[0] ?? null) as PublicEvent | null);
      const evt = evtRaw ? applyPaletteToEvent(evtRaw) : null;
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
  return <LivePublicLoaded subdomain={subdomain} event={event} venues={venues} />;
}

function LivePublicLoaded({
  subdomain,
  event,
  venues,
}: {
  subdomain: string;
  event: PublicEvent;
  venues: PublicVenue[];
}) {
  const canRegister = Boolean(event.current_terms_version_id);
  const { passportHref } = useCurrentEventPassport(event.event_id);
  const venueLabels = resolveVenueLabels(event);
  const isAdminPreview =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("preview") === "1";
  return (
    <EventPaletteScope
      paletteKey={event.palette_key ?? null}
      backgroundKey={event.page_background_key ?? null}
      className="min-h-screen px-4 py-8"
    >
      {isAdminPreview && (
        <div
          className="fixed left-1/2 top-3 z-50 max-w-[92vw] -translate-x-1/2 rounded-2xl border border-amber-300 bg-amber-100/95 px-4 py-2 text-[11px] text-amber-900 shadow"
          role="status"
        >
          <div className="flex items-center gap-2 font-semibold uppercase tracking-[0.18em]">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Admin preview
          </div>
          <p className="mt-1 normal-case tracking-normal text-[11px] leading-snug">
            You are viewing the real customer page in preview mode. Navigation and
            customer actions use the live event flow. Customer actions taken here may
            create real passports, check-ins, and points for this event.
          </p>
        </div>
      )}
      <PublicAnnouncementBar subdomain={subdomain} />
      <PublicEventNav
        subdomain={subdomain}
        eventName={event.name}
        primaryColor={event.primary_color}
        accentColor={event.accent_color}
        logoUrl={getEventAssetPublicUrl(event.logo_path)}
        hasTerms={Boolean(event.terms_url || event.current_terms_version_id)}
        hasPrivacy={Boolean(event.terms_url || event.current_terms_version_id)}
        canRegister={canRegister}
        eventId={event.event_id}
      />
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
          passportHref ? (
            <a
              href={passportHref}
              className="grid h-12 w-full place-items-center rounded-full text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
              style={{ backgroundColor: event.primary_color ?? "#1F3D2B" }}
            >
              View my passport
            </a>
          ) : canRegister ? (
            <Link
              to="/join"
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
      <PassportProgressCard
        eventId={event.event_id}
        venueLabelPlural={venueLabels.plural}
        canRegister={canRegister}
      />
      <CollectPointsSection
        eventId={event.event_id}
        primaryColor={event.primary_color}
        accentColor={event.accent_color}
        canRegister={canRegister}
      />
      <div className="mx-auto mt-6 flex max-w-md flex-col items-center gap-3 text-center">
        <Link
          to="/venues"
          className="text-xs font-medium uppercase tracking-[0.22em] text-[#1F3D2B] underline-offset-4 hover:underline"
        >
          View {venueLabels.plural.toLowerCase()} →
        </Link>
        <Link
          to="/leaderboard"
          className="text-xs font-medium uppercase tracking-[0.22em] text-[#1F3D2B] underline-offset-4 hover:underline"
        >
          View the points leaderboard →
        </Link>
      </div>
    </EventPaletteScope>
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
