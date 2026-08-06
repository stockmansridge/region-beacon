import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAgencyContext } from "@/hooks/use-agency-context";
import { TrailLanding } from "@/components/trail-landing";
import { resolveVenueLabels } from "@/lib/venue-labels";
import { getEventAssetPublicUrl } from "@/lib/event-assets";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { applyPaletteToEvent } from "@/lib/event-palettes";
import {
  EVENT_BRANDING_SELECT,
  EVENT_BRANDING_SELECT_FALLBACK,
  isMissingBrandingColumnError,
  brandingToScopeProps,
  brandingToHeroProps,
  type EventBrandingRow,
} from "@/lib/event-branding-theme";

export const Route = createFileRoute("/admin_/events/$eventId/preview")({
  head: () => ({
    meta: [
      { title: "Customer landing preview — GetStampd admin" },
      {
        name: "description",
        content:
          "Preview the customer landing page for a draft or published event using the saved Brand Kit.",
      },
      { name: "robots", content: "noindex" },
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
};

type Venue = { id: string; name: string };

type Bundle = {
  event: EventRow;
  branding: EventBrandingRow | null;
  venues: Venue[];
  termsUrl: string | null;
  privacyUrl: string | null;
  activeSubdomain: string | null;
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
        venues: (venuesRes.data ?? []) as Venue[],
        termsUrl: (termsRes.data as { terms_url?: string } | null)?.terms_url ?? branding?.terms_url ?? null,
        privacyUrl: (termsRes.data as { privacy_url?: string } | null)?.privacy_url ?? null,
        activeSubdomain,
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

  if (state === "error" || !bundle) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-destructive">
        Could not load preview. Please try again.
      </div>
    );
  }

  const { event, branding, venues, termsUrl, privacyUrl, activeSubdomain } = bundle;
  const isPublished = event.status === "published";
  const canOpenLive = Boolean(isPublished && activeSubdomain);
  const tenantBase = activeSubdomain ? `https://${activeSubdomain}.getstampd.com.au` : null;
  const liveHref = (path: string = "/") => {
    if (!tenantBase) return null;
    const suffix = path.startsWith("/") ? path : `/${path}`;
    const sep = suffix.includes("?") ? "&" : "?";
    return `${tenantBase}${suffix}${sep}preview=1`;
  };

  // Resolve palette: if a curated palette_key is set, derive primary/accent
  // from it; otherwise use stored hex colours (custom palette path).
  const resolved = applyPaletteToEvent({
    palette_key: branding?.palette_key ?? null,
    primary_color: branding?.primary_color ?? null,
    accent_color: branding?.accent_color ?? null,
  });
  const primaryColor =
    resolved.primary_color && HEX_RE.test(resolved.primary_color) ? resolved.primary_color : "#1F3D2B";
  const accentColor =
    resolved.accent_color && HEX_RE.test(resolved.accent_color) ? resolved.accent_color : "#B5572A";

  const scopeProps = brandingToScopeProps(branding);
  const heroProps = brandingToHeroProps(branding);
  const venueLabels = resolveVenueLabels(branding ?? null);
  const welcomeCopy =
    branding?.welcome_copy?.trim() ||
    "Welcome! Collect a stamp at each participating venue and unlock rewards along the trail.";

  const PrimaryStartButton = canOpenLive ? (
    <a
      href={liveHref("/join")!}
      target="_blank"
      rel="noreferrer"
      className="flex h-12 w-full items-center justify-center rounded-full text-sm font-semibold tracking-wide shadow"
      style={{
        backgroundColor: "var(--event-primary-button-bg, var(--event-primary))",
        color: "var(--event-primary-button-fg, var(--event-primary-fg))",
      }}
    >
      Start passport (opens live site)
    </a>
  ) : (
    <button
      type="button"
      disabled
      title="Publish the event with a public address to enable the interactive passport flow"
      className="flex h-12 w-full cursor-not-allowed items-center justify-center rounded-full text-sm font-semibold tracking-wide opacity-70 shadow"
      style={{
        backgroundColor: "var(--event-primary-button-bg, var(--event-primary))",
        color: "var(--event-primary-button-fg, var(--event-primary-fg))",
      }}
    >
      Start passport · publish event to enable
    </button>
  );

  const secondaryStyle = {
    backgroundColor: "var(--event-secondary-button-bg, transparent)",
    color: "var(--event-secondary-button-fg, var(--event-primary))",
    borderColor: "var(--event-border, rgba(0,0,0,0.15))",
  } as const;

  const SecondaryButton = canOpenLive ? (
    <a
      href={liveHref("/join")!}
      target="_blank"
      rel="noreferrer"
      className="flex h-11 w-full items-center justify-center rounded-full border text-sm font-semibold tracking-wide"
      style={secondaryStyle}
    >
      I already have a passport
    </a>
  ) : (
    <button
      type="button"
      disabled
      className="flex h-11 w-full cursor-not-allowed items-center justify-center rounded-full border text-sm font-semibold tracking-wide opacity-70"
      style={secondaryStyle}
    >
      I already have a passport
    </button>
  );

  return (
    <EventPaletteScope {...scopeProps} className="min-h-screen">
      <div>
        {/* Floating admin controls (admin chrome — intentionally neutral) */}
        <div className="fixed left-4 top-4 z-50">
          <Link
            to="/admin/events/$eventId"
            params={{ eventId }}
            className="inline-flex h-9 items-center rounded-full border border-neutral-300 bg-neutral-50/95 px-3 text-xs font-medium text-neutral-700 shadow hover:bg-neutral-100"
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
            {isPublished ? "Preview — published" : "Preview — not live"}
          </div>
        </div>

        <div className="mx-auto max-w-md px-4 py-16">
          {!noticeDismissed && (
            <div className="relative mb-6 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 pr-10 text-xs leading-relaxed text-amber-900 shadow-sm">
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
                This is the real customer landing page rendered with the{" "}
                <strong>last saved</strong> Brand Kit. Unsaved edits in the Branding
                editor appear only in its embedded preview — save first, then reload
                this page.
              </p>
              {canOpenLive ? (
                <p className="mt-2">
                  Customer actions taken here may create real passports, check-ins, and
                  points for this event. Use the buttons below to open the live customer
                  site in a new tab.
                </p>
              ) : (
                <p className="mt-2">
                  This event does not need to be published to preview its design. Publish
                  it with a public address when you want to test the full customer
                  journey.
                </p>
              )}
            </div>
          )}

          <TrailLanding
            eventName={event.name}
            pitch={event.description ?? undefined}
            welcomeCopy={welcomeCopy}
            primaryColor={primaryColor}
            accentColor={accentColor}
            badge="Preview"
            venueNames={venues.map((v) => v.name)}
            venueCount={venues.length}
            venueLabelPlural={venueLabels.plural}
            logoUrl={getEventAssetPublicUrl(branding?.logo_path)}
            heroImageUrl={getEventAssetPublicUrl(branding?.cover_path)}
            termsUrl={termsUrl ?? null}
            primaryCta={PrimaryStartButton}
            secondaryCta={SecondaryButton}
            {...heroProps}
          />

          {/* Quick navigation — mirrors the public event menu */}
          <nav
            aria-label="Preview navigation"
            className="mx-auto mt-6 grid w-full max-w-md grid-cols-2 gap-2 rounded-2xl border p-3 text-xs font-medium uppercase tracking-[0.16em]"
            style={{
              backgroundColor: "var(--event-nav-bg, var(--event-card-bg))",
              borderColor: "var(--event-card-border, var(--event-border))",
              color: "var(--event-nav-fg, var(--event-card-text))",
            }}
          >
            {[
              { label: "Venues", path: "/venues" },
              { label: "Trail map", path: "/map" },
              { label: "Leaderboard", path: "/leaderboard" },
              { label: "Offers", path: "/offers" },
              ...(termsUrl ? [{ label: "Terms", path: "/terms" }] : []),
              ...(privacyUrl ? [{ label: "Privacy", path: "/privacy" }] : []),
            ].map((item) => {
              const href = liveHref(item.path);
              return href ? (
                <a
                  key={item.label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border px-3 py-2 text-center"
                  style={{
                    borderColor: "var(--event-card-border, var(--event-border))",
                    color: "var(--event-nav-active-fg, var(--event-nav-fg, var(--event-card-text)))",
                  }}
                >
                  {item.label}
                </a>
              ) : (
                <span
                  key={item.label}
                  className="rounded-xl border border-dashed px-3 py-2 text-center opacity-60"
                  style={{
                    borderColor: "var(--event-card-border, var(--event-border))",
                    color: "var(--event-nav-muted, var(--event-card-muted, var(--event-muted)))",
                  }}
                  title="Available once the event is published with a public address"
                >
                  {item.label}
                </span>
              );

            })}
          </nav>

          {/* Venue list with click-through to live venue pages when available */}
          {venues.length > 0 && (
            <section
              className="mx-auto mt-6 w-full max-w-md rounded-2xl border p-4"
              style={{
                backgroundColor: "var(--event-card-bg)",
                borderColor: "var(--event-card-border, var(--event-border))",
              }}
            >
              <h3
                className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: "var(--event-accent)" }}
              >
                {venueLabels.plural}
              </h3>
              <ul className="mt-2 divide-y" style={{ borderColor: "var(--event-card-border, var(--event-border))" }}>
                {venues.map((v) => {
                  const href = liveHref(`/venues/${v.id}`);
                  return (
                    <li
                      key={v.id}
                      className="border-t py-2 text-sm first:border-t-0"
                      style={{
                        color: "var(--event-card-text)",
                        borderColor: "var(--event-card-border, var(--event-border))",
                      }}
                    >
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                          style={{ color: "var(--event-link, var(--event-card-text))" }}
                        >
                          {v.name}
                        </a>
                      ) : (
                        <span>{v.name}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {!canOpenLive && (
                <p className="mt-3 text-[11px]" style={{ color: "var(--event-card-muted, var(--event-muted))" }}>
                  To test real QR collection, publish the event and scan the venue QR
                  code from the admin Venues tab.
                </p>
              )}
            </section>
          )}

          <p
            className="mt-6 text-center text-[10px] uppercase tracking-[0.22em]"
            style={{ color: "var(--event-page-muted, var(--event-muted))" }}
          >
            Admin preview · customer actions on the live site create real data
          </p>
        </div>
      </div>
    </EventPaletteScope>
  );
}
