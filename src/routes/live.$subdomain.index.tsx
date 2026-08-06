import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyPaletteToEvent } from "@/lib/event-palettes";
import { PoweredByGetStampd } from "@/components/brand";
import { tenantHost } from "@/lib/domains";
import {
  EventPublicLanding,
  type PublicEventData,
  type PublicVenueData,
} from "@/components/event-public-landing";

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

type State =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "event"; event: PublicEventData; venues: PublicVenueData[] };

/**
 * Public loader: resolves the event from the hostname, then hands the shared
 * <EventPublicLanding /> renderer its data contract. All page composition
 * lives in that component — see src/components/event-public-landing.tsx.
 */
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
      const evtRaw = (evtData?.[0] ?? null) as PublicEventData | null;
      const evt = evtRaw ? (applyPaletteToEvent(evtRaw) as PublicEventData) : null;
      if (evtErr || !evt) {
        setState({ kind: "not_found" });
        return;
      }

      // hero_body_color is exposed by a small additive RPC so the large
      // get_public_event_by_domain return shape stays untouched. Missing
      // function (older DB) simply leaves the token unset -> hero_fg fallback.
      const heroBodyRes = await supabase.rpc(
        "get_public_event_hero_body_color" as never,
        { _hostname: host } as never,
      );
      if (cancelled) return;
      const heroBody =
        typeof heroBodyRes.data === "string" ? heroBodyRes.data : null;
      if (heroBody) (evt as PublicEventData).hero_body_color = heroBody;

      const { data: venueData } = await supabase.rpc("get_public_event_venues", {
        _event_id: evt.event_id,
      });
      if (cancelled) return;
      const venues = (venueData ?? []) as PublicVenueData[];

      setState({ kind: "event", event: evt, venues });
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  if (state.kind === "loading") {
    return (
      <div
        className="flex min-h-screen items-center justify-center text-sm"
        style={{ color: "var(--event-page-muted,#8A7E66)" }}
      >
        Loading…
      </div>
    );
  }

  if (state.kind === "not_found") {
    return <NotLiveYet />;
  }

  return (
    <EventPublicLanding
      subdomain={subdomain}
      event={state.event}
      venues={state.venues}
      mode="live"
    />
  );
}

function NotLiveYet() {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-6"
      style={{ backgroundColor: "var(--event-page-bg,#F6EFE2)" }}
    >
      <div
        className="mx-auto max-w-md rounded-3xl border p-8 text-center shadow-sm"
        style={{
          borderColor: "var(--event-card-border,#E6DCC7)",
          backgroundColor: "var(--event-card-bg,#FBF5E8)",
        }}
      >
        <div
          className="mx-auto mb-4 h-12 w-12 rounded-full"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--event-button-primary-bg,#1F3D2B) 14%, transparent)",
          }}
        />
        <h1
          className="font-trail-serif text-2xl font-semibold"
          style={{ color: "var(--event-card-heading,#1F3D2B)" }}
        >
          Event not live yet
        </h1>
        <p
          className="mt-3 text-sm leading-relaxed"
          style={{ color: "var(--event-card-text,#3D372C)" }}
        >
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
