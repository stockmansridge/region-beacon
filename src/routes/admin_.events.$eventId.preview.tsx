import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAgencyContext } from "@/hooks/use-agency-context";
import { TrailLanding } from "@/components/trail-landing";
import { resolveVenueLabels } from "@/lib/venue-labels";

export const Route = createFileRoute("/admin_/events/$eventId/preview")({
  head: () => ({ meta: [{ title: "Event preview" }] }),
  component: EventPreview,
});

type EventRow = {
  id: string;
  agency_id: string;
  name: string;
  description: string | null;
  status: string;
  public_slug: string | null;
};

type Branding = {
  primary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  welcome_copy: string | null;
  terms_url: string | null;
  venue_label_singular: string | null;
  venue_label_plural: string | null;
};

type Venue = { id: string; name: string };

type Bundle = {
  event: EventRow;
  branding: Branding | null;
  venues: Venue[];
  termsUrl: string | null;
  privacyUrl: string | null;
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function EventPreview() {
  const { eventId } = Route.useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");

  useEffect(() => {
    if (auth.status === "unauthenticated") {
      navigate({ to: "/admin/login", replace: true });
    }
  }, [auth.status, navigate]);

  useEffect(() => {
    if (agency.status === "loading" || auth.status === "loading") return;
    if (!agencyId) {
      setState("not-found");
      return;
    }

    let cancelled = false;
    setState("loading");

    (async () => {
      const { data: event, error: evErr } = await supabase
        .from("events")
        .select("id, agency_id, name, description, status, public_slug, current_terms_version_id")
        .eq("id", eventId)
        .eq("agency_id", agencyId)
        .is("deleted_at", null)
        .maybeSingle();

      if (cancelled) return;
      if (evErr) {
        setState("error");
        return;
      }
      if (!event) {
        setState("not-found");
        return;
      }

      const [brandingRes, venuesRes, termsRes] = await Promise.all([
        supabase
          .from("event_branding")
          .select("primary_color, accent_color, font_family, welcome_copy, terms_url, venue_label_singular, venue_label_plural")
          .eq("event_id", event.id)
          .eq("agency_id", agencyId)
          .maybeSingle(),
        supabase
          .from("venues")
          .select("id, name")
          .eq("event_id", event.id)
          .eq("agency_id", agencyId)
          .is("deleted_at", null)
          .eq("status", "active")
          .order("order_index", { ascending: true }),
        event.current_terms_version_id
          ? supabase
              .from("event_terms_versions")
              .select("terms_url, privacy_url")
              .eq("id", event.current_terms_version_id)
              .eq("event_id", event.id)
              .eq("agency_id", agencyId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (cancelled) return;
      if (brandingRes.error || venuesRes.error || termsRes.error) {
        setState("error");
        return;
      }

      const branding = (brandingRes.data ?? null) as Branding | null;
      setBundle({
        event: event as EventRow,
        branding,
        venues: (venuesRes.data ?? []) as Venue[],
        termsUrl: (termsRes.data as { terms_url?: string } | null)?.terms_url ?? branding?.terms_url ?? null,
        privacyUrl: (termsRes.data as { privacy_url?: string } | null)?.privacy_url ?? null,
      });
      setState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [agency.status, auth.status, agencyId, eventId]);

  if (auth.status === "loading" || agency.status === "loading" || state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading preview…
      </div>
    );
  }

  if (state === "not-found") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center">
          <h1 className="text-lg font-semibold">Not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This event does not belong to your selected agency, or it does not exist.
          </p>
          <Link
            to="/admin/events"
            className="mt-6 inline-flex h-9 items-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
          >
            Back to admin
          </Link>
        </div>
      </div>
    );
  }

  if (state === "error" || !bundle) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-destructive">
        Could not load preview. Please try again.
      </div>
    );
  }

  const { event, branding, venues, termsUrl } = bundle;
  const primaryColor =
    branding?.primary_color && HEX_RE.test(branding.primary_color) ? branding.primary_color : "#1F3D2B";
  const accentColor =
    branding?.accent_color && HEX_RE.test(branding.accent_color) ? branding.accent_color : "#B5572A";
  const fontFamily = branding?.font_family?.trim() || undefined;
  const welcomeCopy =
    branding?.welcome_copy?.trim() ||
    "Welcome! Collect a stamp at each participating venue and unlock rewards along the trail.";

  return (
    <div className="min-h-screen bg-trail-cream" style={fontFamily ? { fontFamily } : undefined}>
      {/* Floating admin controls */}
      <div className="fixed left-4 top-4 z-50">
        <Link
          to="/admin/events/$eventId"
          params={{ eventId }}
          className="inline-flex h-9 items-center rounded-full border bg-white/95 px-3 text-xs font-medium text-neutral-700 shadow hover:bg-white"
        >
          ← Back to admin
        </Link>
      </div>
      <div className="fixed right-4 top-4 z-50">
        <div
          className="inline-flex h-9 items-center gap-2 rounded-full border border-amber-300 bg-amber-100/95 px-3 text-xs font-semibold text-amber-900 shadow"
          title={`Status: ${event.status}`}
        >
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Preview — not live
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 py-16">
        <TrailLanding
          eventName={event.name}
          pitch={event.description ?? undefined}
          welcomeCopy={welcomeCopy}
          primaryColor={primaryColor}
          accentColor={accentColor}
          fontFamily={fontFamily}
          badge="Preview"
          venueNames={venues.map((v) => v.name)}
          venueCount={venues.length}
          venueLabelPlural={resolveVenueLabels(branding).plural}
          termsUrl={termsUrl ?? null}
          primaryCta={
            <button
              type="button"
              disabled
              title="Preview only — the live event is not active"
              className="flex h-12 w-full cursor-not-allowed items-center justify-center rounded-full text-sm font-semibold tracking-wide text-[#F6EFE2] opacity-70 shadow"
              style={{ backgroundColor: primaryColor }}
            >
              Start passport · Preview only
            </button>
          }
          secondaryCta={
            <button
              type="button"
              disabled
              className="flex h-11 w-full cursor-not-allowed items-center justify-center rounded-full border bg-transparent text-sm font-semibold tracking-wide opacity-70"
              style={{ borderColor: `${primaryColor}40`, color: primaryColor }}
            >
              I already have a passport
            </button>
          }
        />

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.22em] text-[#8A7E66]">
          Admin preview · no visitors, passports, or check-ins are created
        </p>
      </div>
    </div>
  );
}
