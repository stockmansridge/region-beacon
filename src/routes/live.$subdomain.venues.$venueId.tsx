import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";
import { getEventAssetPublicUrl } from "@/lib/event-assets";
import { buildGoogleMapsDirectionsUrl } from "@/lib/venue-directions";
import { PublicAnnouncementBar } from "@/components/public-announcement-bar";
import { PublicEventNav } from "@/components/public-event-nav";
import { PoweredByGetStampd } from "@/components/brand";
import { VenueMiniMap } from "@/components/venue-mini-map";
import { tenantHost } from "@/lib/domains";
import { resolveCurrentEventPassport } from "@/lib/use-current-event-passport";
import { loadPassportStampState } from "@/lib/passport-stamps";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { resolveOfferIcon, resolveOfferBadgeStyle } from "@/lib/offer-display";
import { Star, Users, Check, Circle, Sparkles } from "lucide-react";
import { buildGoogleFontsHref, getEventFont, DEFAULT_EMOTIVE_FONT_VALUE } from "@/lib/event-fonts";


export const Route = createFileRoute("/live/$subdomain/venues/$venueId")({
  head: () => ({ meta: [{ title: "Venue" }] }),
  component: function VenueDetailRoute() {
    const { subdomain, venueId } = Route.useParams();
    return <PublicVenueDetailPage subdomain={subdomain} venueId={venueId} />;
  },
});


type VenueRow = {
  venue_id: string;
  name: string;
  description: string | null;
  offer_summary: string | null;
  offer_display_icon: string | null;
  offer_display_colour: string | null;
  offer_display_foreground_colour: string | null;
  address: string | null;
  website_url: string | null;
  phone: string | null;
  logo_path: string | null;
  cover_path: string | null;
  lat: number | null;
  lng: number | null;
  order_index: number | null;
};

type EventBrand = {
  event_id?: string;
  name?: string;
  logo_path?: string | null;
  palette_key?: string | null;
  page_background_key?: string | null;
  page_background_color?: string | null;
  card_background_color?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  text_color?: string | null;
  muted_text_color?: string | null;
  card_text_color?: string | null;
  card_muted_text_color?: string | null;
  border_color?: string | null;
  primary_text_color?: string | null;
  font_family?: string | null;
  heading_font_family?: string | null;
};

type State =
  | { kind: "loading" }
  | { kind: "not_found" }
  | {
      kind: "ready";
      venue: VenueRow;
      eventId: string | null;
      eventName: string | null;
      eventLogoPath: string | null;
      brand: EventBrand | null;
    };

type VisitedState =
  | { kind: "none" }
  | { kind: "no_passport" }
  | { kind: "not_visited" }
  | { kind: "visited"; at: string | null };

type BonusChallenge = {
  bonus_code_id: string;
  name: string;
  description: string | null;
  points_value: number;
  is_claimed: boolean;
};

export function PublicVenueDetailPage({ subdomain, venueId }: { subdomain: string; venueId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [visited, setVisited] = useState<VisitedState>({ kind: "none" });
  const [bonusChallenges, setBonusChallenges] = useState<BonusChallenge[]>([]);
  const [extras, setExtras] = useState<{
    emotive_text: string | null;
    emotive_font_family: string | null;
    default_emotive_font_family: string | null;
    points_value: number;
  } | null>(null);



  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      const host = tenantHost(subdomain);

      const [{ data, error }, { data: evtData }, extrasRes] = await Promise.all([
        supabase.rpc("get_public_venue_by_domain", { _hostname: host, _venue_id: venueId }),
        supabase.rpc("get_public_event_by_domain", { _hostname: host }),
        (supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: Array<{
          emotive_text: string | null;
          emotive_font_family: string | null;
          default_emotive_font_family: string | null;
          points_value: number;
        }> | null; error: unknown }>)(
          "get_public_venue_extras",
          { _hostname: host, _venue_id: venueId },
        ).catch(() => ({ data: null, error: null })),
      ]);

      if (cancelled) return;

      if (error) {
        setState({ kind: "not_found" });
        return;
      }
      const row = (data?.[0] ?? null) as VenueRow | null;
      if (!row) {
        setState({ kind: "not_found" });
        return;
      }
      const evt = (evtData?.[0] ?? null) as EventBrand | null;
      setState({
        kind: "ready",
        venue: row,
        eventId: evt?.event_id ?? null,
        eventName: evt?.name ?? null,
        eventLogoPath: evt?.logo_path ?? null,
        brand: evt,
      });

      const extraRow = Array.isArray(extrasRes?.data) ? extrasRes.data[0] ?? null : null;
      setExtras(extraRow);


      if (!evt?.event_id) return;
      let passportToken: string | null = null;
      try {
        const passport = await resolveCurrentEventPassport(evt.event_id);
        passportToken = passport.token ?? null;
        if (!passport.token) {
          setVisited({ kind: "no_passport" });
        } else {
          const stamps = await loadPassportStampState(passport.token);
          if (cancelled) return;
          const stamp = stamps.allVenues.find((s) => String(s.venue_id) === String(venueId));
          if (stamp?.is_stamped) {
            setVisited({ kind: "visited", at: stamp.checked_in_at ?? null });
          } else {
            setVisited({ kind: "not_visited" });
          }
        }
      } catch {
        /* ignore */
      }

      try {
        const { data: bonusData } = await (supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: BonusChallenge[] | null }>)(
          "get_public_event_bonus_challenges",
          { _hostname: host, _passport_token: passportToken, _venue_id: venueId },
        );
        if (cancelled) return;
        setBonusChallenges(Array.isArray(bonusData) ? bonusData : []);
      } catch {
        /* ignore — bonus challenges are optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain, venueId]);

  // Lazy-load the emotive script font (venue override → event default →
  // platform default). Safe idempotent link injection.
  const emotiveFontValue =
    extras?.emotive_font_family ??
    extras?.default_emotive_font_family ??
    DEFAULT_EMOTIVE_FONT_VALUE;
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!extras?.emotive_text) return;
    const href = buildGoogleFontsHref([emotiveFontValue]);
    if (!href) return;
    if (document.querySelector(`link[data-event-font="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.eventFont = href;
    document.head.appendChild(link);
  }, [extras?.emotive_text, emotiveFontValue]);
  const emotiveStack =
    getEventFont(emotiveFontValue)?.stack ?? "'Caveat', 'Segoe Script', cursive";




  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--event-page-bg,#F6EFE2)] text-sm text-[var(--event-muted,#8A7E66)]">
        Loading…
      </div>
    );
  }

  if (state.kind === "not_found") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--event-page-bg,#F6EFE2)] px-6">
        <div className="mx-auto max-w-md rounded-3xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-8 text-center shadow-sm">
          <h1 className="font-trail-serif text-2xl font-semibold text-[var(--event-primary,#1F3D2B)]">
            Venue not found
          </h1>
          <p className="mt-3 text-sm text-[var(--event-text,#3D372C)]">
            This venue isn't available right now.
          </p>
          <Link
            to="/venues"
            className="mt-6 inline-block text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--event-primary,#1F3D2B)] underline-offset-4 hover:underline"
          >
            ← All venues
          </Link>
        </div>
      </div>
    );
  }

  const { venue } = state;
  const coverUrl = getVenueAssetPublicUrl(venue.cover_path);
  const logoUrl = getVenueAssetPublicUrl(venue.logo_path);

  return (
    <EventPaletteScope
      paletteKey={state.brand?.palette_key ?? null}
      backgroundKey={state.brand?.page_background_key ?? null}
      pageBackgroundColor={state.brand?.page_background_color ?? null}
      cardBackgroundColor={state.brand?.card_background_color ?? null}
      primaryColor={state.brand?.primary_color ?? null}
      accentColor={state.brand?.accent_color ?? null}
      textColor={state.brand?.text_color ?? null}
      mutedTextColor={state.brand?.muted_text_color ?? null}
      cardTextColor={state.brand?.card_text_color ?? null}
      cardMutedTextColor={state.brand?.card_muted_text_color ?? null}
      borderColor={state.brand?.border_color ?? null}
      primaryTextColor={state.brand?.primary_text_color ?? null}
      fontFamily={state.brand?.font_family ?? null}
      headingFontFamily={state.brand?.heading_font_family ?? null}
      className="min-h-screen pb-12"
    >
      <PublicAnnouncementBar subdomain={subdomain} />
      <div className="px-4"><PublicEventNav subdomain={subdomain} eventId={state.eventId} eventName={state.eventName} logoUrl={getEventAssetPublicUrl(state.eventLogoPath)} /></div>
      <div className="mx-auto max-w-md">
        <div
          className="relative aspect-[4/3] w-full overflow-hidden sm:aspect-[16/9]"
          style={{
            background:
              "color-mix(in oklab, var(--event-primary,#1F3D2B) 12%, var(--event-card-bg,#FBF5E8))",
          }}
        >
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center"
              loading="eager"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center font-trail-serif text-5xl font-semibold text-[var(--event-primary,#1F3D2B)]/40">
              {venue.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <Link
            to="/venues"
            className="absolute left-3 top-3 rounded-full bg-[var(--event-card-bg,#FBF5E8)]/90 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--event-primary,#1F3D2B)] shadow"
          >
            ← Back
          </Link>
        </div>

        <div className="px-4">
          <div className="relative z-10 -mt-10 flex items-end gap-3">
            <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border-4 border-[var(--event-page-bg,#F6EFE2)] bg-[var(--event-card-bg,#FBF5E8)] shadow-lg">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${venue.name} logo`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center font-trail-serif text-2xl font-semibold text-[var(--event-primary,#1F3D2B)]">
                  {venue.name.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-start justify-between gap-3">
            <h1 className="font-trail-serif text-3xl font-semibold text-[var(--event-primary,#1F3D2B)]">
              {venue.name}
            </h1>
            {extras && extras.points_value > 0 && (
              <span
                className="inline-flex flex-shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] shadow-sm"
                style={{
                  backgroundColor: "var(--event-accent,#B5572A)",
                  color: "var(--event-primary-fg,#F6EFE2)",
                }}
                aria-label={`Earn ${extras.points_value} points at this venue`}
              >
                +{extras.points_value} pts
              </span>
            )}
          </div>


          {visited.kind === "visited" && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--event-primary,#1F3D2B)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--event-primary-fg,#F6EFE2)]">
              ✓ Visited
              {visited.at && (
                <span className="font-normal normal-case tracking-normal opacity-80">
                  · {new Date(visited.at).toLocaleDateString()}
                </span>
              )}
            </div>
          )}
          {visited.kind === "not_visited" && (
            <div className="mt-2 inline-flex items-center rounded-full border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--event-muted,#8A7E66)]">
              Not visited yet
            </div>
          )}
          {visited.kind === "no_passport" && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] px-3 py-1 text-[11px] font-medium text-[var(--event-text,#3D372C)]">
              <span>Create a passport to track visited venues</span>
              <Link to="/join" className="font-semibold text-[var(--event-primary,#1F3D2B)] underline underline-offset-2">
                Start
              </Link>
            </div>
          )}

          {extras?.emotive_text && (
            <p
              className="mt-4 whitespace-pre-line text-2xl leading-snug"
              style={{
                fontFamily: emotiveStack,
                color: "var(--event-primary,#1F3D2B)",
              }}
            >
              {extras.emotive_text}
            </p>
          )}

          {venue.description && (
            <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-[var(--event-text,#3D372C)]">
              {venue.description}
            </p>
          )}



          {venue.offer_summary && (() => {
            const OfferIcon = resolveOfferIcon(venue.offer_display_icon);
            const badgeStyle = resolveOfferBadgeStyle(
              venue.offer_display_colour,
              venue.offer_display_foreground_colour,
            );
            return (
              <div className="mt-5 flex gap-3 rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-4">
                <span
                  className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full"
                  style={badgeStyle}
                  aria-hidden
                >
                  <OfferIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
                    Offer
                  </div>
                  <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-[var(--event-text,#3D372C)]">
                    {venue.offer_summary}
                  </p>
                </div>
              </div>
            );
          })()}

          {bonusChallenges.length > 0 && (
            <div className="mt-5 space-y-3">
              {bonusChallenges.map((challenge) => (
                <article
                  key={challenge.bonus_code_id}
                  className="rounded-2xl border p-4 shadow-sm"
                  style={{
                    borderColor: "var(--event-border,#E6DCC7)",
                    backgroundColor:
                      "color-mix(in oklab, var(--event-primary,#1F3D2B) 6%, var(--event-card-bg,#FBF5E8))",
                  }}
                >
                  <div
                    className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.22em]"
                    style={{ color: "var(--event-muted,#8A7E66)" }}
                  >
                    <Star
                      className="h-3.5 w-3.5"
                      style={{
                        color: "var(--event-accent,#B5572A)",
                        fill: "var(--event-accent,#B5572A)",
                      }}
                      aria-hidden
                    />
                    Bonus challenge
                  </div>

                  <div className="mt-3 flex gap-3">
                    <span
                      className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-full border"
                      style={{
                        borderColor: "var(--event-border,#E6DCC7)",
                        backgroundColor: "var(--event-card-bg,#FBF5E8)",
                        color: "var(--event-primary,#1F3D2B)",
                      }}
                      aria-hidden
                    >
                      <Users className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3
                        className="font-trail-serif text-[16px] font-semibold leading-snug"
                        style={{ color: "var(--event-primary,#1F3D2B)" }}
                      >
                        {challenge.name}
                      </h3>
                      <p
                        className="mt-0.5 text-[13px]"
                        style={{ color: "var(--event-muted,#8A7E66)" }}
                      >
                        Earn +{challenge.points_value} bonus points
                      </p>
                    </div>
                  </div>

                  {challenge.description && (
                    <p
                      className="mt-3 whitespace-pre-line text-[14px] leading-relaxed"
                      style={{ color: "var(--event-text,#3D372C)" }}
                    >
                      {challenge.description}
                    </p>
                  )}

                  <div className="mt-4 flex">
                    <span
                      className="inline-flex items-center justify-center gap-1.5 rounded-full border px-4 py-1.5 text-[12px] font-medium"
                      style={
                        challenge.is_claimed
                          ? {
                              borderColor: "var(--event-primary,#1F3D2B)",
                              backgroundColor: "var(--event-primary,#1F3D2B)",
                              color: "var(--event-primary-fg,#F6EFE2)",
                            }
                          : {
                              borderColor: "var(--event-border,#E6DCC7)",
                              backgroundColor: "var(--event-card-bg,#FBF5E8)",
                              color: "var(--event-muted,#8A7E66)",
                            }
                      }
                    >
                      {challenge.is_claimed ? (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          Completed
                        </>
                      ) : (
                        <>
                          <Circle className="h-3 w-3" aria-hidden />
                          Not completed
                        </>
                      )}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}



          <div className="mt-6 space-y-2">
            {(() => {
              const directionsUrl = buildGoogleMapsDirectionsUrl({
                address: venue.address,
                lat: venue.lat,
                lng: venue.lng,
              });
              return directionsUrl ? (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] px-4 py-3 text-sm font-medium text-[var(--event-primary,#1F3D2B)] shadow-sm transition hover:border-[var(--event-primary,#1F3D2B)]/40"
                >
                  <span>Get directions</span>
                  <span aria-hidden>↗</span>
                </a>
              ) : null;
            })()}
            {venue.website_url && (
              <a
                href={venue.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] px-4 py-3 text-sm font-medium text-[var(--event-primary,#1F3D2B)] shadow-sm transition hover:border-[var(--event-primary,#1F3D2B)]/40"
              >
                <span>Visit website</span>
                <span aria-hidden>↗</span>
              </a>
            )}
            {venue.phone && (
              <a
                href={`tel:${venue.phone.replace(/\s+/g, "")}`}
                className="flex items-center justify-between rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] px-4 py-3 text-sm font-medium text-[var(--event-primary,#1F3D2B)] shadow-sm transition hover:border-[var(--event-primary,#1F3D2B)]/40"
              >
                <span>Call {venue.phone}</span>
                <span aria-hidden>›</span>
              </a>
            )}
          </div>


          <VenueMiniMap
            name={venue.name}
            lat={venue.lat}
            lng={venue.lng}
            hasAddress={Boolean(venue.address)}
          />

          <Link
            to="/scan"
            className="mt-6 flex items-center justify-center gap-2 rounded-2xl px-4 py-4 text-center text-sm font-semibold text-[var(--event-primary-fg,#F6EFE2)] shadow transition hover:opacity-95"
            style={{ backgroundColor: "var(--event-primary,#1F3D2B)" }}
          >
            <span aria-hidden>📷</span>
            Scan venue QR to collect your stamp
          </Link>

          <div className="mt-8 flex justify-center"><PoweredByGetStampd variant="trail" /></div>
        </div>
      </div>
    </EventPaletteScope>
  );
}
