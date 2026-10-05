import { PublicStyleTarget } from "@/components/public-style-target";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import { PoweredByGetStampd } from "@/components/brand";
import { PublicEventNav } from "@/components/public-event-nav";
import { LiveActivityBar } from "@/components/live-activity-bar";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { brandingScopeProps, useEventBrandingKeys, type EventBrandingKeys } from "@/lib/use-event-palette";
import { useEventFaqByDomain, type PublicFaqEntry } from "@/lib/use-event-faq";
import { getEventAssetPublicUrl } from "@/lib/event-assets";
import { LinkifyText } from "@/components/linkify-text";

export const Route = createFileRoute("/live/$subdomain/faq")({
  component: function FaqRoute() {
    const { subdomain } = Route.useParams();
    return <FaqPage subdomain={subdomain} />;
  },
});

type EventInfo = {
  event_id: string | null;
  event_name: string | null;
};

function useEventInfo(subdomain: string): EventInfo {
  const [info, setInfo] = useState<EventInfo>({ event_id: null, event_name: null });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const host = tenantHost(subdomain);
      const { data } = await supabase.rpc("get_public_event_by_domain", {
        _hostname: host,
      });
      if (cancelled) return;
      const row = (data?.[0] ?? null) as { event_id?: string; name?: string } | null;
      setInfo({
        event_id: row?.event_id ?? null,
        event_name: row?.name ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);
  return info;
}

export function FaqPage({ subdomain, previewData }: { subdomain: string; previewData?: { branding: EventBrandingKeys; eventInfo: { event_id: string | null; event_name: string | null }; entries: PublicFaqEntry[] } }) {
  const loadedBranding = useEventBrandingKeys(previewData ? null : subdomain);
  const loadedEventInfo = useEventInfo(previewData ? "" : subdomain);
  const loadedFaq = useEventFaqByDomain(previewData ? null : subdomain);
  const branding = previewData?.branding ?? loadedBranding;
  const eventInfo = previewData?.eventInfo ?? loadedEventInfo;
  const faq = previewData ? { kind: "ok" as const, entries: previewData.entries } : loadedFaq;

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

  return (
    <EventPaletteScope
      {...brandingScopeProps(branding)}
      className="min-h-screen px-4 pb-4"
    >
      {!previewData && <LiveActivityBar subdomain={subdomain} />}
      <div className="mx-auto max-w-5xl">
        <PublicEventNav
          subdomain={subdomain}
          eventName={eventInfo.event_name ?? "Event"}
          eventId={eventInfo.event_id}
          logoUrl={getEventAssetPublicUrl(branding.logoPath)}
          primaryColor={branding.primaryColor}
          accentColor={branding.accentColor}
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
          {eventInfo.event_name && (
            <PublicStyleTarget id="faq.page.eyebrow"><p className="text-[11px] uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
              {eventInfo.event_name}
            </p></PublicStyleTarget>
          )}
          <PublicStyleTarget id="faq.page.heading"><h1
            className="mt-1 text-3xl font-semibold text-[var(--event-primary,#1F3D2B)]"
            style={{ fontFamily: "var(--event-font, inherit)" }}
          >
            FAQ / Info
          </h1></PublicStyleTarget>


          <div className="mt-6 space-y-6">
            {faq.kind === "loading" && (
              <p className="text-sm text-[var(--event-muted,#8A7E66)]">Loading…</p>
            )}
            {faq.kind === "error" && (
              <PublicStyleTarget id="faq.state.message"><p className="text-sm text-[var(--event-muted,#8A7E66)]">
                Could not load FAQ entries right now.
              </p></PublicStyleTarget>
            )}
            {faq.kind === "ok" && faq.entries.length === 0 && (
              <PublicStyleTarget id="faq.state.message"><p className="text-sm text-[var(--event-muted,#8A7E66)]">
                No FAQ entries have been published for this event yet.
              </p></PublicStyleTarget>
            )}
            {faq.kind === "ok" && faq.entries.length > 0 && (
              <>
                <FaqAccordion entries={faq.entries} />
                <script
                  type="application/ld+json"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                      "@context": "https://schema.org",
                      "@type": "FAQPage",
                      mainEntity: faq.entries.map((e) => ({
                        "@type": "Question",
                        name: e.question,
                        acceptedAnswer: {
                          "@type": "Answer",
                          text: e.answer,
                        },
                      })),
                    }),
                  }}
                />
              </>
            )}
          </div>

        </div>

        <div className="mt-6 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>
      </div>
    </EventPaletteScope>
  );
}

type FaqEntry = { question: string; answer: string };

function FaqAccordion({ entries }: { entries: FaqEntry[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <ul className="space-y-3">
      {entries.map((entry, idx) => {
        const key = `${idx}-${entry.question}`;
        const isOpen = openKey === key;
        const panelId = `faq-panel-${idx}`;
        return (
          <li
            key={key}
            className="overflow-hidden rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)]"
          >
            <PublicStyleTarget id="faq.item.toggle"><button
              type="button"
              onClick={() => setOpenKey((prev) => (prev === key ? null : key))}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--event-primary,#1F3D2B)] focus-visible:ring-offset-2"
            >
              <PublicStyleTarget id="faq.item.question"><span className="font-bold text-[var(--event-primary,#1F3D2B)] text-base sm:text-lg">
                {entry.question}
              </span></PublicStyleTarget>
              <span
                aria-hidden="true"
                className={
                  "shrink-0 text-xl leading-none text-[var(--event-primary,#1F3D2B)] transition-transform duration-200 " +
                  (isOpen ? "rotate-180" : "rotate-0")
                }
              >
                ⌄
              </span>
            </button></PublicStyleTarget>
            {isOpen && (
              <PublicStyleTarget id="faq.item.answer"><div
                id={panelId}
                className="px-4 pb-4 -mt-1 text-sm leading-relaxed text-[var(--event-body,#3D372C)] whitespace-pre-line"
              >
                <LinkifyText text={entry.answer} />
              </div></PublicStyleTarget>
            )}
          </li>
        );
      })}
    </ul>
  );
}
