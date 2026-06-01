import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrailLanding } from "@/components/trail-landing";
import { resolveVenueLabels } from "@/lib/venue-labels";
import { getEventAssetPublicUrl } from "@/lib/event-assets";
import { PoweredByGetStampd } from "@/components/brand";
import { HostDiagnostic } from "@/components/host-diagnostic";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { applyPaletteToEvent } from "@/lib/event-palettes";

export const Route = createFileRoute("/t/$agencySlug/e/$eventSlug")({
  head: () => ({
    meta: [
      { title: "Event — GetStampd" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TenantEventPage,
});

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
  venue_label_singular?: string | null;
  venue_label_plural?: string | null;
  // Optional — only present once the public RPC is extended to surface
  // palette/background fields. The route stays safe when they're missing.
  palette_key?: string | null;
  page_background_key?: string | null;
  page_background_color?: string | null;
  card_background_color?: string | null;
};

type PublicVenue = {
  venue_id: string;
  name: string;
  address: string | null;
  order_index: number | null;
};

type State =
  | { kind: "loading" }
  | { kind: "not_found"; reason: string }
  | { kind: "event"; event: PublicEvent; venues: PublicVenue[] };

function TenantEventPage() {
  const { agencySlug, eventSlug } = Route.useParams();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });

      // RPC may not be deployed yet (draft migration). Fail safe → not_found.
      let evt: PublicEvent | null = null;
      try {
        const { data, error } = await supabase.rpc(
          "get_public_event_by_agency_and_slug",
          { _sub: agencySlug, _event_slug: eventSlug },
        );
        if (!error) {
          const raw = (data?.[0] ?? null) as PublicEvent | null;
          evt = raw ? applyPaletteToEvent(raw) : null;
        }
      } catch {
        evt = null;
      }

      if (cancelled) return;
      if (!evt) {
        setState({
          kind: "not_found",
          reason: "Event not published or RPC unavailable",
        });
        return;
      }

      const { data: venueData } = await supabase.rpc("get_public_event_venues", {
        _event_id: evt.event_id,
      });
      if (cancelled) return;
      setState({
        kind: "event",
        event: evt,
        venues: (venueData ?? []) as PublicVenue[],
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [agencySlug, eventSlug]);

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
            Event not available
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#3D372C]">
            This event isn't published yet. Please check back closer to the
            event, or contact the organiser.
          </p>
          <div className="mt-4">
            <Link
              to="/t/$agencySlug"
              params={{ agencySlug }}
              className="text-xs font-medium uppercase tracking-[0.22em] text-[#1F3D2B] underline-offset-4 hover:underline"
            >
              ← Workspace home
            </Link>
          </div>
          <div className="mt-6 flex justify-center">
            <PoweredByGetStampd variant="trail" />
          </div>
        </div>
        <HostDiagnostic resolutionSource="not_found" error={state.reason} />
      </div>
    );
  }

  const { event, venues } = state;
  const canRegister = Boolean(event.current_terms_version_id);
  const venueLabels = resolveVenueLabels(event);

  return (
    <div className="min-h-screen bg-[#F6EFE2] px-4 py-8">
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
            <span
              className="grid h-12 w-full place-items-center rounded-full text-sm font-semibold tracking-wide text-[#F6EFE2] shadow opacity-70"
              style={{ backgroundColor: event.primary_color ?? "#1F3D2B" }}
              title="Use the event subdomain to join"
            >
              Join via organiser link
            </span>
          ) : (
            <button
              type="button"
              disabled
              className="h-12 w-full cursor-not-allowed rounded-full text-sm font-semibold tracking-wide text-[#F6EFE2] opacity-70 shadow"
              style={{ backgroundColor: event.primary_color ?? "#1F3D2B" }}
            >
              Start passport — coming soon
            </button>
          )
        }
        secondaryCta={<span />}
      />
      <div className="mx-auto mt-6 max-w-md text-center">
        <Link
          to="/t/$agencySlug"
          params={{ agencySlug }}
          className="text-xs font-medium uppercase tracking-[0.22em] text-[#1F3D2B] underline-offset-4 hover:underline"
        >
          ← {agencySlug} workspace
        </Link>
      </div>
      <HostDiagnostic
        resolvedAgencyId={null}
        resolvedEventId={event.event_id}
        resolutionSource="public_event_slug"
        error={null}
      />
    </div>
  );
}
