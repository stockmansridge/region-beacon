// Shared loader/state for the public /live/$subdomain/{terms,privacy} pages.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import { LegalBody } from "@/components/legal-body";
import { PoweredByGetStampd } from "@/components/brand";
import { PublicEventNav } from "@/components/public-event-nav";


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
  activeOverride,
  children,
}: {
  subdomain: string;
  eventName?: string | null;
  activeOverride?: "home" | "join" | "venues" | "leaderboard";
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F6EFE2] px-4 py-4">
      <div className="mx-auto max-w-5xl">
        <PublicEventNav
          subdomain={subdomain}
          eventName={eventName ?? "Event"}
          activeOverride={activeOverride}
        />
      </div>
      <div className="mx-auto mt-6 max-w-2xl">
        <Link
          to="/"
          className="inline-flex items-center text-xs font-medium uppercase tracking-[0.22em] text-[#1F3D2B] underline-offset-4 hover:underline"
        >
          ← Back to event
        </Link>

        <div className="mt-4 rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 shadow-sm sm:p-10">
          {children}
        </div>
        <div className="mt-6 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>

      </div>
    </div>
  );
}

export function NotAvailable({ subdomain }: { subdomain: string }) {
  return (
    <PublicLegalShell subdomain={subdomain}>
      <h1 className="font-trail-serif text-2xl font-semibold text-[#1F3D2B]">
        Not available
      </h1>
      <p className="mt-3 text-sm text-[#3D372C]">
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
}: {
  subdomain: string;
  url: string;
  title: string;
  eventName: string;
}) {
  return (
    <PublicLegalShell subdomain={subdomain} eventName={eventName}>

      <p className="text-[11px] uppercase tracking-[0.22em] text-[#8A7E66]">
        {eventName}
      </p>
      <h1 className="mt-1 font-trail-serif text-3xl font-semibold text-[#1F3D2B]">
        {title}
      </h1>
      <p className="mt-4 text-sm text-[#3D372C]">
        This document is published by the event organiser on an external site.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex h-11 items-center rounded-full bg-[#1F3D2B] px-5 text-sm font-semibold text-[#F6EFE2] shadow"
      >
        Open {title.toLowerCase()} ↗
      </a>
      <p className="mt-3 break-all text-[11px] text-[#8A7E66]">{url}</p>
    </PublicLegalShell>
  );
}

export function LocalLegalPage({
  subdomain,
  eventName,
  title,
  body,
  version,
  effectiveAt,
}: {
  subdomain: string;
  eventName: string;
  title: string;
  body: string;
  version: string | null;
  effectiveAt: string | null;
}) {
  const effective = effectiveAt ? new Date(effectiveAt) : null;
  return (
    <PublicLegalShell subdomain={subdomain} eventName={eventName}>

      <p className="text-[11px] uppercase tracking-[0.22em] text-[#8A7E66]">
        {eventName}
      </p>
      <h1 className="mt-1 font-trail-serif text-3xl font-semibold text-[#1F3D2B]">
        {title}
      </h1>
      {(version || effective) && (
        <p className="mt-2 text-[11px] text-[#8A7E66]">
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
