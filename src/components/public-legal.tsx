import { PublicBackLink } from "@/components/public-back-link";
import { PublicStyleTarget } from "@/components/public-style-target";
// Shared loader/state for the public /live/$subdomain/{terms,privacy} pages.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import { LegalBody } from "@/components/legal-body";
import { PoweredByGetStampd } from "@/components/brand";
import { PublicEventNav } from "@/components/public-event-nav";
import { usePublicNav } from "@/components/public-nav-context";
import { usePublicStyleEnabled } from "@/components/public-style-scope";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { brandingScopeProps, useEventBrandingKeys, type EventBrandingKeys } from "@/lib/use-event-palette";
import { getEventAssetPublicUrl } from "@/lib/event-assets";


export type LegalRow = {
  event_id: string;
  event_name: string;
  legal_source: "external_url" | "local_text" | null;
  terms_title: string | null;
  terms_body: string | null;
  terms_url: string | null;
  privacy_title: string | null;
  privacy_body: string | null;
  privacy_url: string | null;
  terms_version: string | null;
  privacy_version: string | null;
  effective_at: string | null;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "ok"; row: LegalRow };

export function useLegal(subdomain: string): LoadState {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      const host = tenantHost(subdomain);
      const { data, error } = await supabase.rpc(
        "get_public_event_legal_by_domain",
        { _hostname: host },
      );
      if (cancelled) return;
      const row = (data?.[0] ?? null) as LegalRow | null;
      if (error || !row) {
        setState({ kind: "not_found" });
        return;
      }
      setState({ kind: "ok", row });
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);
  return state;
}

export function PublicLegalShell({
  subdomain,
  eventName,
  eventId,
  activeOverride,
  children,
  branding: brandingOverride,
}: {
  subdomain: string;
  eventName?: string | null;
  eventId?: string | null;
  activeOverride?: "home" | "join" | "venues" | "leaderboard";
  children: React.ReactNode;
  branding?: EventBrandingKeys;
}) {
  const loadedBranding = useEventBrandingKeys(brandingOverride ? null : subdomain);
  const b = brandingOverride ?? loadedBranding;

  // Hold the page back until branding has resolved to prevent the default
  // GetStampd theme from flashing for a frame.
  if (!b.ready) {
    return (
      <div
        className="flex min-h-screen items-center justify-center text-sm"
        style={{
          backgroundColor: "var(--event-page-bg)",
          color: "var(--event-page-muted)",
        }}
      >
        Loading…
      </div>
    );
  }

  return (
    <EventPaletteScope
      {...brandingScopeProps(b)}
      className="min-h-screen px-4 pb-4"
    >
      <div className="mx-auto max-w-5xl">
        <PublicEventNav
          subdomain={subdomain}
          eventName={eventName ?? "Event"}
          activeOverride={activeOverride}
          eventId={eventId ?? null}
          logoUrl={getEventAssetPublicUrl(b.logoPath)}
          primaryColor={b.primaryColor}
          accentColor={b.accentColor}
        />
      </div>
      <div className="mx-auto mt-6 max-w-2xl">
        <PublicBackLink context="legal" to="/" label="Back to event" legacy="link"
          legacyClassName="inline-flex items-center text-xs font-medium uppercase tracking-[0.22em] text-[var(--event-primary,#1F3D2B)] underline-offset-4 hover:underline" />

        <div className="mt-4 rounded-3xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-6 shadow-sm sm:p-10">
          {children}
        </div>
        <div className="mt-6 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>

      </div>
    </EventPaletteScope>
  );
}

export function NotAvailable({ subdomain }: { subdomain: string }) {
  return (
    <PublicLegalShell subdomain={subdomain}>
      <PublicStyleTarget id="legal.heading"><h1 className="font-trail-serif text-2xl font-semibold text-[var(--event-primary,#1F3D2B)]">
        Not available
      </h1></PublicStyleTarget>
      <PublicStyleTarget id="legal.body"><p className="mt-3 text-sm text-[var(--event-body,#3D372C)]">
        This page isn&apos;t available right now. The event may not be live yet,
        or legal pages have not been configured.
      </p></PublicStyleTarget>
    </PublicLegalShell>
  );
}


export function ExternalLinkOnly({
  subdomain,
  url,
  title,
  eventName,
  eventId,
}: {
  subdomain: string;
  url: string;
  title: string;
  eventName: string;
  eventId?: string | null;
}) {
  return (
    <PublicLegalShell subdomain={subdomain} eventName={eventName} eventId={eventId}>

      <PublicStyleTarget id="legal.eyebrow"><p className="text-[11px] uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
        {eventName}
      </p></PublicStyleTarget>
      <PublicStyleTarget id="legal.heading"><h1 className="mt-1 font-trail-serif text-3xl font-semibold text-[var(--event-primary,#1F3D2B)]">
        {title}
      </h1></PublicStyleTarget>
      <PublicStyleTarget id="legal.body"><p className="mt-4 text-sm text-[var(--event-body,#3D372C)]">
        This document is published by the event organiser on an external site.
      </p></PublicStyleTarget>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex h-11 items-center rounded-full bg-[var(--event-primary,#1F3D2B)] px-5 text-sm font-semibold text-[var(--event-page-bg,#F6EFE2)] shadow"
      >
        Open {title.toLowerCase()} ↗
      </a>
      <PublicStyleTarget id="legal.meta"><p className="mt-3 break-all text-[11px] text-[var(--event-muted,#8A7E66)]">{url}</p></PublicStyleTarget>
    </PublicLegalShell>
  );
}

export function LocalLegalPage({
  subdomain,
  eventName,
  eventId,
  title,
  body,
  version,
  effectiveAt,
}: {
  subdomain: string;
  eventName: string;
  eventId?: string | null;
  title: string;
  body: string;
  version: string | null;
  effectiveAt: string | null;
}) {
  const effective = effectiveAt ? new Date(effectiveAt) : null;
  return (
    <PublicLegalShell subdomain={subdomain} eventName={eventName} eventId={eventId}>

      <PublicStyleTarget id="legal.eyebrow"><p className="text-[11px] uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
        {eventName}
      </p></PublicStyleTarget>
      <PublicStyleTarget id="legal.heading"><h1 className="mt-1 font-trail-serif text-3xl font-semibold text-[var(--event-primary,#1F3D2B)]">
        {title}
      </h1></PublicStyleTarget>
      {(version || effective) && (
        <PublicStyleTarget id="legal.meta"><p className="mt-2 text-[11px] text-[var(--event-muted,#8A7E66)]">
          {version ? `Version ${version}` : null}
          {version && effective ? " · " : null}
          {effective ? `Effective ${effective.toLocaleDateString()}` : null}
        </p></PublicStyleTarget>
      )}
      <div className="mt-6">
        <LegalBody body={body} />
      </div>
    </PublicLegalShell>
  );
}

type LegalSectionContent =
  | { kind: "local"; title: string; body: string; version: string | null }
  | { kind: "external"; title: string; url: string }
  | { kind: "missing"; title: string };

function legalSectionFromRow(
  row: LegalRow,
  which: "terms" | "privacy",
): LegalSectionContent {
  const isLocal = row.legal_source === "local_text";
  if (which === "terms") {
    if (isLocal && row.terms_body) {
      return {
        kind: "local",
        title: row.terms_title || "Terms & Conditions",
        body: row.terms_body,
        version: row.terms_version,
      };
    }
    if (row.terms_url) {
      return { kind: "external", title: "Terms & Conditions", url: row.terms_url };
    }
    return { kind: "missing", title: "Terms & Conditions" };
  }
  if (isLocal && row.privacy_body) {
    return {
      kind: "local",
      title: row.privacy_title || "Privacy Policy",
      body: row.privacy_body,
      version: row.privacy_version,
    };
  }
  if (row.privacy_url) {
    return { kind: "external", title: "Privacy Policy", url: row.privacy_url };
  }
  return { kind: "missing", title: "Privacy Policy" };
}

function LegalAccordionCard({
  header,
  section,
  sectionId,
  defaultOpen,
  revealNonce,
}: {
  header: string;
  section: LegalSectionContent;
  sectionId: "terms" | "privacy";
  defaultOpen?: boolean;
  revealNonce?: number;
}) {
  const v2 = usePublicStyleEnabled();
  const { mode } = usePublicNav();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  // Switching between Terms / Privacy / combined must re-sync the expanded card.
  useEffect(() => { setOpen(Boolean(defaultOpen)); }, [defaultOpen]);
  useEffect(() => { if (revealNonce) setOpen(true); }, [revealNonce]);
  const surface = (
    <div
      className={v2 ? "rounded-2xl border shadow-sm" : "rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] shadow-sm"}
      style={v2 ? { borderColor: "var(--event-border, #E6DCC7)", backgroundColor: "var(--event-card-bg, #FBF5E8)" } : undefined}
      data-legal-card={sectionId}
    >
      <PublicStyleTarget id="legal.section.toggle" recordId={v2 ? sectionId : undefined}><button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={v2
          ? "flex w-full items-center justify-between gap-3 px-5 py-4 text-left font-trail-serif text-lg font-semibold"
          : "flex w-full items-center justify-between gap-3 px-5 py-4 text-left"}
        style={v2 ? { color: "var(--event-primary, #1F3D2B)" } : undefined}
      >
        {/* V2: heading text and chevron inherit the button's colour/typography. */}
        <span className={v2 ? undefined : "font-trail-serif text-lg font-semibold text-[var(--event-primary,#1F3D2B)]"}>
          {header}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 ${v2 ? "" : "text-[var(--event-primary,#1F3D2B)] "}transition-transform ${open ? "rotate-180" : ""}`}
          style={v2 ? { color: "var(--item-icon-color, currentColor)" } : undefined}
          aria-hidden
        />
      </button></PublicStyleTarget>
      {open && (
        <div className="border-t border-[var(--event-border,#E6DCC7)] px-5 py-5">
          {section.kind === "local" ? (
            <>
              {section.version && (
                <PublicStyleTarget id="legal.meta" recordId={v2 ? sectionId : undefined}><p className="mb-3 text-[11px] text-[var(--event-muted,#8A7E66)]">
                  Version {section.version}
                </p></PublicStyleTarget>
              )}
              <LegalBody body={section.body} section={sectionId} />
            </>
          ) : section.kind === "external" ? (
            <div>
              <PublicStyleTarget id="legal.body"><p className="text-sm text-[var(--event-body,#3D372C)]">
                This document is published by the event organiser on an external
                site.
              </p></PublicStyleTarget>
              {v2 ? (
                <PublicStyleTarget id="legal.document.link" recordId={sectionId}><a
                  href={section.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={mode === "live" ? undefined : (event) => event.preventDefault()}
                  aria-disabled={mode === "live" ? undefined : true}
                  className="mt-4 inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold shadow underline-offset-4 hover:underline focus-visible:underline"
                  style={{ backgroundColor: "var(--event-primary, #1F3D2B)", color: "var(--event-page-bg, #F6EFE2)" }}
                >
                  Open {section.title.toLowerCase()} ↗
                </a></PublicStyleTarget>
              ) : (
                <a
                  href={section.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex h-10 items-center rounded-full bg-[var(--event-primary,#1F3D2B)] px-4 text-sm font-semibold text-[var(--event-page-bg,#F6EFE2)] shadow"
                >
                  Open {section.title.toLowerCase()} ↗
                </a>
              )}
              <PublicStyleTarget id="legal.meta" recordId={v2 ? sectionId : undefined}><p className="mt-3 break-all text-[11px] text-[var(--event-muted,#8A7E66)]">
                {section.url}
              </p></PublicStyleTarget>
            </div>
          ) : (
            <PublicStyleTarget id="legal.body"><p className="text-sm text-[var(--event-muted,#8A7E66)]">
              Not available for this event.
            </p></PublicStyleTarget>
          )}
        </div>
      )}
    </div>
  );
  return v2 ? <PublicStyleTarget id="legal.section.surface" recordId={sectionId}>{surface}</PublicStyleTarget> : surface;
}

export function CombinedLegalPage({
  subdomain,
  initialOpen,
  previewData,
  reveal,
}: {
  subdomain: string;
  initialOpen?: "terms" | "privacy" | "both";
  /** Explicit request (preview navigation) to expand a section; a new nonce re-opens it even if collapsed. */
  reveal?: { section: "terms" | "privacy"; nonce: number } | null;
  previewData?: { branding: EventBrandingKeys; row: LegalRow };
}) {
  const loadedState = useLegal(previewData ? "" : subdomain);
  const loadedBranding = useEventBrandingKeys(previewData ? null : subdomain);
  const state = previewData ? { kind: "ok" as const, row: previewData.row } : loadedState;
  const branding = previewData?.branding ?? loadedBranding;

  // Hold the page back until branding has resolved to prevent the default
  // GetStampd theme from flashing for a frame.
  if (!branding.ready) {
    return (
      <div
        className="flex min-h-screen items-center justify-center text-sm"
        style={{
          backgroundColor: "var(--event-page-bg)",
          color: "var(--event-page-muted)",
        }}
      >
        Loading…
      </div>
    );
  }

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--event-page-bg,#F6EFE2)] text-sm text-[var(--event-muted,#8A7E66)]">
        Loading…
      </div>
    );
  }
  if (state.kind === "not_found") return <NotAvailable subdomain={subdomain} />;

  const { row } = state;
  const terms = legalSectionFromRow(row, "terms");
  const privacy = legalSectionFromRow(row, "privacy");
  const open = initialOpen ?? "both";
  const termsOpen = open === "both" || open === "terms";
  const privacyOpen = open === "both" || open === "privacy";

  return (
    <PublicLegalShell
      subdomain={subdomain}
      eventName={row.event_name}
      eventId={row.event_id}
      branding={branding}
    >
      <PublicStyleTarget id="legal.eyebrow"><p className="text-[11px] uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
        {row.event_name}
      </p></PublicStyleTarget>
      <PublicStyleTarget id="legal.heading"><h1 className="mt-1 font-trail-serif text-3xl font-semibold text-[var(--event-primary,#1F3D2B)]">
        Terms & Privacy
      </h1></PublicStyleTarget>
      <PublicStyleTarget id="legal.body"><p className="mt-3 text-sm text-[var(--event-body,#3D372C)]">
        Review the event terms and privacy information.
      </p></PublicStyleTarget>
      <div className="mt-6 space-y-3">
        <LegalAccordionCard
          header="Terms & Conditions"
          section={terms}
          sectionId="terms"
          defaultOpen={termsOpen}
          revealNonce={reveal?.section === "terms" ? reveal.nonce : undefined}
        />
        <LegalAccordionCard
          header="Privacy Policy"
          section={privacy}
          sectionId="privacy"
          defaultOpen={privacyOpen}
          revealNonce={reveal?.section === "privacy" ? reveal.nonce : undefined}
        />
      </div>
    </PublicLegalShell>
  );
}
