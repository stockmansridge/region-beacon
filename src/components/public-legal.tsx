// Shared loader/state for the public /live/$subdomain/{terms,privacy} pages.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import { LegalBody } from "@/components/legal-body";
import { PoweredByGetStampd } from "@/components/brand";
import { PublicEventNav } from "@/components/public-event-nav";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { useEventBrandingKeys } from "@/lib/use-event-palette";


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
}: {
  subdomain: string;
  eventName?: string | null;
  eventId?: string | null;
  activeOverride?: "home" | "join" | "venues" | "leaderboard";
  children: React.ReactNode;
}) {
  const b = useEventBrandingKeys(subdomain);
  return (
    <EventPaletteScope
      paletteKey={b.paletteKey}
      backgroundKey={b.backgroundKey}
      primaryColor={b.primaryColor}
      accentColor={b.accentColor}
      pageBackgroundColor={b.pageBackgroundColor}
      cardBackgroundColor={b.cardBackgroundColor}
      className="min-h-screen px-4 py-4"
    >
      <div className="mx-auto max-w-5xl">
        <PublicEventNav
          subdomain={subdomain}
          eventName={eventName ?? "Event"}
          activeOverride={activeOverride}
          eventId={eventId ?? null}
        />
      </div>
      <div className="mx-auto mt-6 max-w-2xl">
        <Link
          to="/"
          className="inline-flex items-center text-xs font-medium uppercase tracking-[0.22em] text-[var(--event-primary,#1F3D2B)] underline-offset-4 hover:underline"
        >
          ← Back to event
        </Link>

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
      <h1 className="font-trail-serif text-2xl font-semibold text-[var(--event-primary,#1F3D2B)]">
        Not available
      </h1>
      <p className="mt-3 text-sm text-[var(--event-body,#3D372C)]">
        This page isn&apos;t available right now. The event may not be live yet,
        or legal pages have not been configured.
      </p>
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

      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
        {eventName}
      </p>
      <h1 className="mt-1 font-trail-serif text-3xl font-semibold text-[var(--event-primary,#1F3D2B)]">
        {title}
      </h1>
      <p className="mt-4 text-sm text-[var(--event-body,#3D372C)]">
        This document is published by the event organiser on an external site.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex h-11 items-center rounded-full bg-[var(--event-primary,#1F3D2B)] px-5 text-sm font-semibold text-[var(--event-page-bg,#F6EFE2)] shadow"
      >
        Open {title.toLowerCase()} ↗
      </a>
      <p className="mt-3 break-all text-[11px] text-[var(--event-muted,#8A7E66)]">{url}</p>
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

      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
        {eventName}
      </p>
      <h1 className="mt-1 font-trail-serif text-3xl font-semibold text-[var(--event-primary,#1F3D2B)]">
        {title}
      </h1>
      {(version || effective) && (
        <p className="mt-2 text-[11px] text-[var(--event-muted,#8A7E66)]">
          {version ? `Version ${version}` : null}
          {version && effective ? " · " : null}
          {effective ? `Effective ${effective.toLocaleDateString()}` : null}
        </p>
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
  defaultOpen,
}: {
  header: string;
  section: LegalSectionContent;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="font-trail-serif text-lg font-semibold text-[var(--event-primary,#1F3D2B)]">
          {header}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[var(--event-primary,#1F3D2B)] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="border-t border-[var(--event-border,#E6DCC7)] px-5 py-5">
          {section.kind === "local" ? (
            <>
              {section.version && (
                <p className="mb-3 text-[11px] text-[var(--event-muted,#8A7E66)]">
                  Version {section.version}
                </p>
              )}
              <LegalBody body={section.body} />
            </>
          ) : section.kind === "external" ? (
            <div>
              <p className="text-sm text-[var(--event-body,#3D372C)]">
                This document is published by the event organiser on an external
                site.
              </p>
              <a
                href={section.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex h-10 items-center rounded-full bg-[var(--event-primary,#1F3D2B)] px-4 text-sm font-semibold text-[var(--event-page-bg,#F6EFE2)] shadow"
              >
                Open {section.title.toLowerCase()} ↗
              </a>
              <p className="mt-3 break-all text-[11px] text-[var(--event-muted,#8A7E66)]">
                {section.url}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--event-muted,#8A7E66)]">
              Not available for this event.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function CombinedLegalPage({
  subdomain,
  initialOpen,
}: {
  subdomain: string;
  initialOpen?: "terms" | "privacy" | "both";
}) {
  const state = useLegal(subdomain);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] text-sm text-[#8A7E66]">
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
    >
      <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
        {row.event_name}
      </p>
      <h1 className="mt-1 font-trail-serif text-3xl font-semibold text-[var(--event-primary,#1F3D2B)]">
        Terms & Privacy
      </h1>
      <p className="mt-3 text-sm text-[var(--event-body,#3D372C)]">
        Review the event terms and privacy information.
      </p>
      <div className="mt-6 space-y-3">
        <LegalAccordionCard
          header="Terms & Conditions"
          section={terms}
          defaultOpen={termsOpen}
        />
        <LegalAccordionCard
          header="Privacy Policy"
          section={privacy}
          defaultOpen={privacyOpen}
        />
      </div>
    </PublicLegalShell>
  );
}
