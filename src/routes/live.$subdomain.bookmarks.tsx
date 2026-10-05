import { PublicStyleTarget } from "@/components/public-style-target";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bookmark, ChevronRight, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { brandingScopeProps, useEventBrandingKeys, type EventBrandingKeys } from "@/lib/use-event-palette";
import { getEventAssetPublicUrl } from "@/lib/event-assets";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";
import { LiveActivityBar } from "@/components/live-activity-bar";
import { PublicEventNav } from "@/components/public-event-nav";
import { PublicLink } from "@/components/public-nav-context";
import { usePassportBookmarks, type BookmarkRow } from "@/lib/use-passport-bookmarks";
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

export function PublicBookmarksPage({ subdomain, previewData }: { subdomain: string; previewData?: { branding: EventBrandingKeys; eventId: string; enabled: boolean; rows: BookmarkRow[] } }) {
  const loadedBranding = useEventBrandingKeys(previewData ? null : subdomain);
  const branding = previewData?.branding ?? loadedBranding;
  const [eventId, setEventId] = useState<string | null>(previewData?.eventId ?? null);

  useEffect(() => {
    if (previewData) { setEventId(previewData.eventId); return; }
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
  }, [subdomain, previewData]);

  const loadedBookmarks = usePassportBookmarks(previewData ? null : eventId);
  const { enabled, rows } = previewData ?? loadedBookmarks;

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
      {!previewData && <LiveActivityBar subdomain={subdomain} />}
      <PublicEventNav
        subdomain={subdomain}
        eventId={eventId}
        logoUrl={getEventAssetPublicUrl(branding.logoPath)}
        primaryColor={branding.primaryColor}
        accentColor={branding.accentColor}
      />
      <div className="mx-auto max-w-md">
        <div className="mb-5 mt-6 px-1">
          <PublicStyleTarget id="bookmarks.page.heading"><h1
            className="text-[28px] font-semibold leading-tight"
            style={{
              color: "var(--event-page-heading, var(--event-primary, #1F3D2B))",
              fontFamily: "var(--event-font, inherit)",
            }}
          >
            My Bookmarks
          </h1></PublicStyleTarget>
          <PublicStyleTarget id="bookmarks.page.intro"><p
            className="mt-2 text-[13.5px] leading-relaxed"
            style={{ color: "var(--event-page-muted, var(--event-muted, #8A7E66))" }}
          >
            Everything you saved for later. Tap an item to open it again.
          </p></PublicStyleTarget>
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
                  <PublicStyleTarget id="bookmarks.card" recordId={r.venue_id}><PublicLink
                    to="/venues/$venueId"
                    params={{ venueId: r.venue_id }}
                    className="flex items-center gap-3 rounded-2xl border border-[var(--event-card-border,var(--event-border,#E6DCC7))] bg-[var(--event-card-bg,#FBF5E8)] p-3 shadow-sm transition hover:shadow-md"
                  >
                    {v2 ? (
                      <PublicStyleTarget id="bookmarks.card.thumb" recordId={r.venue_id}><span
                        className="grid h-12 w-12 flex-shrink-0 place-items-center overflow-hidden rounded-xl border border-transparent"
                        style={{ backgroundColor: "var(--item-icon-bg, var(--event-page-bg,#F6EFE2))" }}
                      >
                        {thumb ? (
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : r.kind === "offer" ? (
                          <Tag className="h-5 w-5 opacity-60" />
                        ) : (
                          <Bookmark className="h-5 w-5 opacity-60" />
                        )}
                      </span></PublicStyleTarget>
                    ) : (
                      <span className="grid h-12 w-12 flex-shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--event-page-bg,#F6EFE2)]">
                        {thumb ? (
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : r.kind === "offer" ? (
                          <Tag className="h-5 w-5 opacity-60" />
                        ) : (
                          <Bookmark className="h-5 w-5 opacity-60" />
                        )}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <PublicStyleTarget id="bookmarks.card.type" recordId={r.venue_id}><span className="block truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--event-card-muted,var(--event-muted,#8A7E66))]">
                        {r.kind === "offer" ? "Offer" : "Venue"}
                      </span></PublicStyleTarget>
                      <PublicStyleTarget id="bookmarks.card.name" recordId={r.venue_id}><span className="block truncate text-[15px] font-semibold text-[var(--event-card-heading,var(--event-primary,#1F3D2B))]">
                        {r.venue_name ?? "Saved item"}
                      </span></PublicStyleTarget>
                      {r.kind === "offer" && offerTitle ? (
                        <PublicStyleTarget id="bookmarks.card.offer" recordId={r.venue_id}><span className="block truncate text-[12.5px] text-[var(--event-card-text,var(--event-body,#3D372C))]">
                          {offerTitle}
                        </span></PublicStyleTarget>
                      ) : null}
                    </span>
                    <PublicStyleTarget id="bookmarks.card.chevron" recordId={r.venue_id}><span className="inline-flex flex-shrink-0"><ChevronRight className="h-4 w-4 opacity-50" /></span></PublicStyleTarget>
                  </PublicLink></PublicStyleTarget>
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
      <PublicStyleTarget id="bookmarks.empty.heading"><p className="text-[16px] font-semibold text-[var(--event-card-heading,var(--event-primary,#1F3D2B))]">
        {title}
      </p></PublicStyleTarget>
      <PublicStyleTarget id="bookmarks.empty.body"><p className="mt-2 text-sm text-[var(--event-card-text,var(--event-body,#3D372C))]">
        {body}
      </p></PublicStyleTarget>
      <PublicStyleTarget id="bookmarks.empty.cta"><PublicLink
        to={action.to}
        className="mt-3 inline-block text-xs font-semibold uppercase tracking-[0.22em] text-[var(--event-link,var(--event-primary,#1F3D2B))] underline-offset-4 hover:underline"
      >
        {action.label}
      </PublicLink></PublicStyleTarget>
    </div>
  );
}
