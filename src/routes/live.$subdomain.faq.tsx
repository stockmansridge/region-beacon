import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import { PoweredByGetStampd } from "@/components/brand";
import { PublicEventNav } from "@/components/public-event-nav";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { useEventBrandingKeys } from "@/lib/use-event-palette";
import { useEventFaqByDomain } from "@/lib/use-event-faq";
import { getEventAssetPublicUrl } from "@/lib/event-assets";

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

export function FaqPage({ subdomain }: { subdomain: string }) {
  const branding = useEventBrandingKeys(subdomain);
  const eventInfo = useEventInfo(subdomain);
  const faq = useEventFaqByDomain(subdomain);

  return (
    <EventPaletteScope
      paletteKey={branding.paletteKey}
      backgroundKey={branding.backgroundKey}
      primaryColor={branding.primaryColor}
      accentColor={branding.accentColor}
      pageBackgroundColor={branding.pageBackgroundColor}
      cardBackgroundColor={branding.cardBackgroundColor}
      className="min-h-screen px-4 py-4"
    >
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
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
              {eventInfo.event_name}
            </p>
          )}
          <h1 className="mt-1 font-trail-serif text-3xl font-semibold text-[var(--event-primary,#1F3D2B)]">
            FAQ / Info
          </h1>

          <div className="mt-6 space-y-6">
            {faq.kind === "loading" && (
              <p className="text-sm text-[var(--event-muted,#8A7E66)]">Loading…</p>
            )}
            {faq.kind === "error" && (
              <p className="text-sm text-[var(--event-muted,#8A7E66)]">
                Could not load FAQ entries right now.
              </p>
            )}
            {faq.kind === "ok" && faq.entries.length === 0 && (
              <p className="text-sm text-[var(--event-muted,#8A7E66)]">
                No FAQ entries have been published for this event yet.
              </p>
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
            <button
              type="button"
              onClick={() => setOpenKey((prev) => (prev === key ? null : key))}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--event-primary,#1F3D2B)] focus-visible:ring-offset-2"
            >
              <span className="font-bold text-[var(--event-primary,#1F3D2B)] text-base sm:text-lg">
                {entry.question}
              </span>
              <span
                aria-hidden="true"
                className={
                  "shrink-0 text-xl leading-none text-[var(--event-primary,#1F3D2B)] transition-transform duration-200 " +
                  (isOpen ? "rotate-180" : "rotate-0")
                }
              >
                ⌄
              </span>
            </button>
            {isOpen && (
              <div
                id={panelId}
                className="px-4 pb-4 -mt-1 text-sm leading-relaxed text-[var(--event-body,#3D372C)] whitespace-pre-line"
              >
                {entry.answer}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
