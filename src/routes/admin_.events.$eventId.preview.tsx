import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAgencyContext } from "@/hooks/use-agency-context";
import { applyPaletteToEvent } from "@/lib/event-palettes";
import {
  EVENT_BRANDING_SELECT,
  EVENT_BRANDING_SELECT_FALLBACK,
  isMissingBrandingColumnError,
  type EventBrandingRow,
} from "@/lib/event-branding-theme";
import {
  EventPublicLanding,
  type PublicEventData,
  type PublicVenueData,
} from "@/components/event-public-landing";

/**
 * Admin draft full preview.
 *
 * This route does NOT contain any landing-page markup. It authenticates the
 * admin, resolves the event securely by event_id + agency_id (so a draft with
 * no public domain can be previewed), maps the result into the same
 * `PublicEventData` contract the public-domain loader produces, and renders
 * the one shared <EventPublicLanding /> implementation. Any structural change
 * to the customer page therefore lands here automatically.
 *
 * Privacy: robots noindex, admin auth required, agency-scoped query, no data
 * reachable without a session.
 */
export const Route = createFileRoute("/admin_/events/$eventId/preview")({
  head: () => ({
    meta: [
      { title: "Customer landing preview — GetStampd admin" },
      {
        name: "description",
        content:
          "Preview the real customer landing page for a draft or published event using the saved Brand Kit.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EventPreview,
});

type EventRow = {
  id: string;
  agency_id: string;
  name: string;
  description: string | null;
  status: string;
  public_slug: string | null;
  timezone: string | null;
  starts_at: string | null;
  ends_at: string | null;
  current_terms_version_id: string | null;
};

type Bundle = {
  event: EventRow;
  branding: EventBrandingRow | null;
  venues: PublicVenueData[];
  termsUrl: string | null;
  activeSubdomain: string | null;
};

function EventPreview() {
  const { eventId } = Route.useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");

  const storageKey = `getstampd_admin_preview_notice_dismissed_${eventId}`;
  const [noticeDismissed, setNoticeDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });

  const dismissNotice = () => {
    setNoticeDismissed(true);
    try {
      sessionStorage.setItem(storageKey, "true");
    } catch {
      // ignore
    }
  };

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
        .select(
          "id, agency_id, name, description, status, public_slug, timezone, starts_at, ends_at, current_terms_version_id",
        )
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

      // Canonical branding read — same column list as the branding editor and
      // the public landing page, with a tolerant fallback for older
      // production databases missing the newest columns.
      let brandingRes = await supabase
        .from("event_branding")
        .select(EVENT_BRANDING_SELECT)
        .eq("event_id", event.id)
        .eq("agency_id", agencyId)
        .maybeSingle();
      if (brandingRes.error && isMissingBrandingColumnError(brandingRes.error.message)) {
        brandingRes = await supabase
          .from("event_branding")
          .select(EVENT_BRANDING_SELECT_FALLBACK)
          .eq("event_id", event.id)
          .eq("agency_id", agencyId)
          .maybeSingle();
      }

      const [venuesRes, termsRes, domainsRes] = await Promise.all([
        supabase
          .from("venues")
          .select("id, name, address, order_index")
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
        supabase
          .from("event_domains")
          .select("public_subdomain, status, domain_type, is_primary")
          .eq("event_id", event.id)
          .eq("agency_id", agencyId)
          .eq("domain_type", "event_subdomain")
          .eq("status", "active"),
      ]);

      if (cancelled) return;
      if (brandingRes.error || venuesRes.error || termsRes.error) {
        setState("error");
        return;
      }

      const domains = (domainsRes.data ?? []) as Array<{
        public_subdomain: string | null;
        is_primary: boolean | null;
      }>;
      const activeSubdomain =
        domains.find((d) => d.is_primary)?.public_subdomain ??
        domains[0]?.public_subdomain ??
        null;

      const branding = (brandingRes.data ?? null) as EventBrandingRow | null;
      setBundle({
        event: event as EventRow,
        branding,
        venues: ((venuesRes.data ?? []) as Array<{
          id: string;
          name: string;
          address: string | null;
          order_index: number | null;
        }>).map((v) => ({
          venue_id: v.id,
          name: v.name,
          address: v.address,
          order_index: v.order_index,
        })),
        termsUrl:
          (termsRes.data as { terms_url?: string } | null)?.terms_url ??
          branding?.terms_url ??
          null,
        activeSubdomain,
      });
      setState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [agency.status, auth.status, agencyId, eventId]);

  /**
   * Build the SAME data contract the public-domain RPC
   * (`get_public_event_by_domain`) returns, from admin-authorised reads.
   * Every field name matches the RPC output so the shared renderer cannot
   * tell the two loaders apart.
   */
  const publicEvent: PublicEventData | null = useMemo(() => {
    if (!bundle) return null;
    const { event, branding, termsUrl } = bundle;
    const merged = {
      event_id: event.id,
      name: event.name,
      public_slug: event.public_slug ?? "",
      description: event.description,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      timezone: event.timezone,
      current_terms_version_id: event.current_terms_version_id,
      terms_url: termsUrl,
      logo_path: branding?.logo_path ?? null,
      cover_path: branding?.cover_path ?? null,
      cover_focal_x: branding?.cover_focal_x ?? null,
      cover_focal_y: branding?.cover_focal_y ?? null,
      font_family: branding?.font_family ?? null,
      heading_font_family: branding?.heading_font_family ?? null,
      welcome_copy: branding?.welcome_copy ?? null,
      venue_label_singular: branding?.venue_label_singular ?? null,
      venue_label_plural: branding?.venue_label_plural ?? null,
      primary_color: branding?.primary_color ?? null,
      accent_color: branding?.accent_color ?? null,
      link_color: branding?.link_color ?? null,
      palette_key: branding?.palette_key ?? null,
      page_background_key: branding?.page_background_key ?? null,
      page_background_color: branding?.page_background_color ?? null,
      text_color: branding?.text_color ?? null,
      muted_text_color: branding?.muted_text_color ?? null,
      border_color: branding?.border_color ?? null,
      page_heading_color: branding?.page_heading_color ?? null,
      page_body_color: branding?.page_body_color ?? null,
      page_muted_color: branding?.page_muted_color ?? null,
      card_background_color: branding?.card_background_color ?? null,
      card_text_color: branding?.card_text_color ?? null,
      card_muted_text_color: branding?.card_muted_text_color ?? null,
      card_border_color: branding?.card_border_color ?? null,
      card_heading_color: branding?.card_heading_color ?? null,
      card_body_color: branding?.card_body_color ?? null,
      card_muted_color: branding?.card_muted_color ?? null,
      primary_text_color: branding?.primary_text_color ?? null,
      button_primary_bg: branding?.button_primary_bg ?? null,
      button_primary_fg: branding?.button_primary_fg ?? null,
      button_secondary_bg: branding?.button_secondary_bg ?? null,
      button_secondary_fg: branding?.button_secondary_fg ?? null,
      nav_background_color: branding?.nav_background_color ?? null,
      nav_fg_color: branding?.nav_fg_color ?? null,
      nav_muted_color: branding?.nav_muted_color ?? null,
      nav_active_fg_color: branding?.nav_active_fg_color ?? null,
      hero_bg_color: branding?.hero_bg_color ?? null,
      hero_fg_color: branding?.hero_fg_color ?? null,
      hero_accent_color: branding?.hero_accent_color ?? null,
      hero_body_color: branding?.hero_body_color ?? null,
      logo_shape: branding?.logo_shape ?? null,
      logo_backdrop: branding?.logo_backdrop ?? null,
      logo_backdrop_color: branding?.logo_backdrop_color ?? null,
      hero_overlay_color: branding?.hero_overlay_color ?? null,
      hero_overlay_opacity: branding?.hero_overlay_opacity ?? null,
      brand_kit_key: branding?.brand_kit_key ?? null,
    } satisfies PublicEventData;

    // Same palette derivation the public loader applies to the RPC row.
    return applyPaletteToEvent(merged) as PublicEventData;
  }, [bundle]);

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
            This event does not belong to your selected organisation, or it does not exist.
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

  if (state === "error" || !bundle || !publicEvent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-destructive">
        Could not load preview. Please try again.
      </div>
    );
  }

  const { event, venues, activeSubdomain } = bundle;
  const isPublished = event.status === "published";

  // Admin chrome only — deliberately neutral, sits above the customer page.
  const previewNotice = (
    <>
      <div className="fixed left-4 top-4 z-[60]">
        <Link
          to="/admin/events/$eventId"
          params={{ eventId }}
          className="inline-flex h-9 items-center rounded-full border border-neutral-300 bg-neutral-50/95 px-3 text-xs font-medium text-neutral-700 shadow hover:bg-neutral-100"
        >
          ← Back to admin
        </Link>
      </div>
      <div className="fixed right-4 top-4 z-[60]">
        <div
          className="inline-flex h-9 items-center gap-2 rounded-full border border-amber-300 bg-amber-100/95 px-3 text-xs font-semibold text-amber-900 shadow"
          title={`Status: ${event.status}`}
        >
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          {isPublished ? "Preview — published" : "Preview — not live"}
        </div>
      </div>
      {!noticeDismissed && (
        <div
          className="fixed left-1/2 top-16 z-[60] w-[92vw] max-w-md -translate-x-1/2 rounded-2xl border border-amber-200 bg-amber-50/95 p-4 pr-10 text-xs leading-relaxed text-amber-900 shadow"
          role="status"
        >
          <button
            type="button"
            onClick={dismissNotice}
            className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-amber-700 hover:bg-amber-200/60 hover:text-amber-900"
            aria-label="Dismiss admin preview notice"
            title="Dismiss"
          >
            ×
          </button>
          <p className="font-semibold uppercase tracking-[0.18em]">Admin preview</p>
          <p className="mt-1">
            This is the real customer landing page, rendered from the{" "}
            <strong>last saved</strong> event and Brand Kit. Unsaved edits in the
            Branding editor appear only in its embedded preview — save first, then
            reload this page.
          </p>
          <p className="mt-2">
            {activeSubdomain
              ? "Links open the live customer pages in a new tab, where customer actions create real passports, check-ins, and points."
              : "This event has no public address yet, so links to the other customer pages are disabled. The design and layout below are exactly what customers will see."}
          </p>
          <p className="mt-2">
            Progress, activity and prize sections fill in from real participant data
            for this event.
          </p>
        </div>
      )}
    </>
  );

  return (
    <EventPublicLanding
      subdomain={activeSubdomain}
      event={publicEvent}
      venues={venues}
      mode="preview"
      previewNotice={previewNotice}
    />
  );
}
