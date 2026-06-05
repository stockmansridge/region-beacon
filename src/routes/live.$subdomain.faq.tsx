import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import { PoweredByGetStampd } from "@/components/brand";
import { PublicEventNav } from "@/components/public-event-nav";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { useEventBrandingKeys } from "@/lib/use-event-palette";
import { useEventFaqByDomain } from "@/lib/use-event-faq";

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
            {faq.kind === "ok" &&
              faq.entries.map((entry, idx) => (
                <article key={`${idx}-${entry.question}`} className="space-y-2">
                  <h2 className="font-bold text-[var(--event-primary,#1F3D2B)] text-lg">
                    {entry.question}
                  </h2>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--event-body,#3D372C)]">
                    {entry.answer}
                  </p>
                </article>
              ))}
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>
      </div>
    </EventPaletteScope>
  );
}
