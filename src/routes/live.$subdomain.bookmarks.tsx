import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bookmark, ChevronRight, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { brandingScopeProps, useEventBrandingKeys } from "@/lib/use-event-palette";
import { getEventAssetPublicUrl } from "@/lib/event-assets";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";
import { LiveActivityBar } from "@/components/live-activity-bar";
import { PublicEventNav } from "@/components/public-event-nav";
import { PublicLink } from "@/components/public-nav-context";
import { usePassportBookmarks } from "@/lib/use-passport-bookmarks";
import { PoweredByGetStampd } from "@/components/brand";

export const Route = createFileRoute("/live/$subdomain/bookmarks")({
  head: () => ({
    meta: [
      { title: "My bookmarks" },
      { name: "description", content: "The venues and offers you saved for later." },
    ],
  }),
  component: function BookmarksRoute() {
    const { subdomain } = Route.useParams();
    return <PublicBookmarksPage subdomain={subdomain} />;
  },
});

export function PublicBookmarksPage({ subdomain }: { subdomain: string }) {
  const branding = useEventBrandingKeys(subdomain);
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("resolve_event_by_host", {
        _hostname: tenantHost(subdomain),
      });
      const row = (data?.[0] ?? null) as { event_id?: string | null } | null;
      if (!cancelled) setEventId(row?.event_id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  const { enabled, rows } = usePassportBookmarks(eventId);

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
      className="min-h-screen px-4 pb-10"
    >
      <LiveActivityBar subdomain={subdomain} />
      <PublicEventNav
        subdomain={subdomain}
        eventId={eventId}
        logoUrl={getEventAssetPublicUrl(branding.logoPath)}
        primaryColor={branding.primaryColor}
        accentColor={branding.accentColor}
      />
      <div className="mx-auto max-w-md">
        <div className="mb-5 mt-6 px-1">
          <h1
            className="text-[28px] font-semibold leading-tight"
            style={{
              color: "var(--event-page-heading, var(--event-primary, #1F3D2B))",
              fontFamily: "var(--event-font, inherit)",
            }}
          >
            My Bookmarks
          </h1>
          <p
            className="mt-2 text-[13.5px] leading-relaxed"
            style={{ color: "var(--event-page-muted, var(--event-muted, #8A7E66))" }}
          >
            Everything you saved for later. Tap an item to open it again.
          </p>
        </div>

        {!enabled ? (
          <EmptyCard
            title="Start your passport first"
            body="Bookmarks are saved to your passport so you can find them on any device."
            action={{ to: "/join", label: "Start your passport →" }}
          />
        ) : rows.length === 0 ? (
          <EmptyCard
            title="Nothing saved yet"
            body="Tap the bookmark icon on a venue or an offer to save it here."
            action={{ to: "/venues", label: "Browse venues →" }}
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const thumb = getVenueAssetPublicUrl(r.logo_path ?? r.cover_path);
              const offerTitle =
                (r.offer_summary ?? "").split("\n").filter(Boolean)[0] ?? "";
              return (
                <li key={`${r.kind}:${r.venue_id}`}>
                  <PublicLink
                    to="/venues/$venueId"
                    params={{ venueId: r.venue_id }}
                    className="flex items-center gap-3 rounded-2xl border border-[var(--event-card-border,var(--event-border,#E6DCC7))] bg-[var(--event-card-bg,#FBF5E8)] p-3 shadow-sm transition hover:shadow-md"
                  >
                    <span className="grid h-12 w-12 flex-shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--event-page-bg,#F6EFE2)]">
                      {thumb ? (
                        <img src={thumb} alt="" className="h-full w-full object-cover" />
                      ) : r.kind === "offer" ? (
                        <Tag className="h-5 w-5 opacity-60" />
                      ) : (
                        <Bookmark className="h-5 w-5 opacity-60" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">
                        {r.kind === "offer" ? "Offer" : "Venue"}
                      </span>
                      <span className="block truncate text-[15px] font-semibold text-[var(--event-card-heading,var(--event-primary,#1F3D2B))]">
                        {r.venue_name ?? "Saved item"}
                      </span>
                      {r.kind === "offer" && offerTitle ? (
                        <span className="block truncate text-[12.5px] text-[var(--event-card-text,var(--event-body,#3D372C))]">
                          {offerTitle}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 opacity-50" />
                  </PublicLink>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-8">
          <PoweredByGetStampd />
        </div>
      </div>
    </EventPaletteScope>
  );
}

function EmptyCard({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action: { to: string; label: string };
}) {
  return (
    <div className="rounded-2xl border border-[var(--event-card-border,var(--event-border,#E6DCC7))] bg-[var(--event-card-bg,#FBF5E8)] p-6 text-center">
      <p className="text-[16px] font-semibold text-[var(--event-card-heading,var(--event-primary,#1F3D2B))]">
        {title}
      </p>
      <p className="mt-2 text-sm text-[var(--event-card-text,var(--event-body,#3D372C))]">
        {body}
      </p>
      <PublicLink
        to={action.to}
        className="mt-3 inline-block text-xs font-semibold uppercase tracking-[0.22em] text-[var(--event-link,var(--event-primary,#1F3D2B))] underline-offset-4 hover:underline"
      >
        {action.label}
      </PublicLink>
    </div>
  );
}
