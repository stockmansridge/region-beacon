import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyPaletteToEvent } from "@/lib/event-palettes";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { resolveVenueLabels } from "@/lib/venue-labels";
import { PublicAnnouncementBar } from "@/components/public-announcement-bar";
import { PublicEventNav } from "@/components/public-event-nav";
import { getEventAssetPublicUrl } from "@/lib/event-assets";
import { PoweredByGetStampd } from "@/components/brand";
import { tenantHost } from "@/lib/domains";
import { useCurrentEventPassport } from "@/lib/use-current-event-passport";
import { CollectPointsSection } from "@/components/collect-points-section";
import { PassportStampGrid } from "@/components/passport-stamp-grid";
import { NextRewardCard } from "@/components/next-reward-card";
import { usePassportHomeData, pickNextReward } from "@/lib/use-passport-home-data";
import { WhatsHappeningCard } from "@/components/whats-happening-card";
import { BonusPointsPromo } from "@/components/bonus-points-promo";
import { LiveActivityBar } from "@/components/live-activity-bar";
import { PrizeUnlockAnnouncer } from "@/components/prize-unlock-announcer";


export const Route = createFileRoute("/live/$subdomain/")({
  component: function LivePublicRoute() {
    const { subdomain } = Route.useParams();
    return <LivePublicPage subdomain={subdomain} />;
  },
});


type ResolveRow = {
  kind: "marketing" | "admin" | "event" | "not_found";
  event_id: string | null;
  public_slug: string | null;
  requires_auth: boolean;
};

type PublicEvent = {
  event_id: string;
  name: string;
  public_slug: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  logo_path: string | null;
  cover_path: string | null;
  primary_color: string | null;
  accent_color: string | null;
  palette_key?: string | null;
  page_background_key?: string | null;
  page_background_color?: string | null;
  card_background_color?: string | null;
  text_color?: string | null;
  muted_text_color?: string | null;
  card_text_color?: string | null;
  card_muted_text_color?: string | null;
  border_color?: string | null;
  primary_text_color?: string | null;
  nav_background_color?: string | null;
  font_family: string | null;
  heading_font_family?: string | null;
  welcome_copy: string | null;
  terms_url: string | null;
  current_terms_version_id: string | null;
  venue_label_singular?: string | null;
  venue_label_plural?: string | null;
  hero_overlay_color?: string | null;
  hero_overlay_opacity?: number | null;
  brand_kit_key?: string | null;
  link_color?: string | null;
  card_border_color?: string | null;
  button_primary_bg?: string | null;
  button_primary_fg?: string | null;
  button_secondary_bg?: string | null;
  button_secondary_fg?: string | null;
  nav_fg_color?: string | null;
  nav_muted_color?: string | null;
  nav_active_fg_color?: string | null;
  hero_bg_color?: string | null;
  hero_fg_color?: string | null;
  hero_accent_color?: string | null;
  page_heading_color?: string | null;
  page_body_color?: string | null;
  page_muted_color?: string | null;
  card_heading_color?: string | null;
  card_body_color?: string | null;
  card_muted_color?: string | null;
};

type PublicVenue = {
  venue_id: string;
  name: string;
  address: string | null;
  order_index: number | null;
};

type State =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "event"; event: PublicEvent; venues: PublicVenue[] };

export function LivePublicPage({ subdomain }: { subdomain: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });


  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      const host = tenantHost(subdomain);

      const { data: resolveData, error: resolveErr } = await supabase.rpc(
        "resolve_event_by_host",
        { _hostname: host },
      );
      if (cancelled) return;
      const row = (resolveData?.[0] ?? null) as ResolveRow | null;

      if (resolveErr || !row || row.kind !== "event" || !row.event_id) {
        setState({ kind: "not_found" });
        return;
      }

      const { data: evtData, error: evtErr } = await supabase.rpc(
        "get_public_event_by_domain",
        { _hostname: host },
      );
      if (cancelled) return;
      const evtRaw = ((evtData?.[0] ?? null) as PublicEvent | null);
      const evt = evtRaw ? applyPaletteToEvent(evtRaw) : null;
      if (evtErr || !evt) {
        setState({ kind: "not_found" });
        return;
      }

      const { data: venueData } = await supabase.rpc(
        "get_public_event_venues",
        { _event_id: evt.event_id },
      );
      if (cancelled) return;
      const venues = (venueData ?? []) as PublicVenue[];

      setState({ kind: "event", event: evt, venues });
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  if (state.kind === "loading") {
    return (
      <div
        className="flex min-h-screen items-center justify-center text-sm"
        style={{ color: "var(--event-page-muted,#8A7E66)" }}
      >
        Loading…
      </div>
    );
  }

  if (state.kind === "not_found") {
    return <NotLiveYet />;
  }

  const { event, venues } = state;
  return <LivePublicLoaded subdomain={subdomain} event={event} venues={venues} />;
}

function useFirstNameFromPassportHref(passportHref: string | null): string | null {
  const token = useMemo(() => {
    if (!passportHref) return null;
    const m = passportHref.match(/\/passport\/([^/?#]+)/);
    return m?.[1] ?? null;
  }, [passportHref]);
  const [firstName, setFirstName] = useState<string | null>(null);
  useEffect(() => {
    if (!token) {
      setFirstName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc("get_passport_by_token", {
          _raw_token: token,
        });
        if (cancelled) return;
        const row = (data?.[0] ?? null) as
          | { first_name?: string | null; full_name?: string | null }
          | null;
        const first =
          row?.first_name?.trim() ||
          row?.full_name?.trim().split(/\s+/)[0] ||
          null;
        setFirstName(first ?? null);
      } catch {
        if (!cancelled) setFirstName(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);
  return firstName;
}

function LivePublicLoaded({
  subdomain,
  event,
  venues,
}: {
  subdomain: string;
  event: PublicEvent;
  venues: PublicVenue[];
}) {
  const canRegister = Boolean(event.current_terms_version_id);
  const { passportHref } = useCurrentEventPassport(event.event_id);
  const venueLabels = resolveVenueLabels(event);
  const firstName = useFirstNameFromPassportHref(passportHref);
  const homeData = usePassportHomeData(event.event_id);
  const isAdminPreview =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("preview") === "1";
  const [previewDismissed, setPreviewDismissed] = useState(false);

  // Once a returning visitor has a verified passport for this event, the
  // Passport page is their home — redirect them there instead of rendering
  // the marketing/landing home. Admin preview keeps the landing visible.
  useEffect(() => {
    if (isAdminPreview) return;
    if (typeof window === "undefined") return;
    if (passportHref && window.location.pathname !== passportHref) {
      window.location.replace(passportHref);
    }
  }, [passportHref, isAdminPreview]);

  const heroImageUrl = getEventAssetPublicUrl(event.cover_path);
  const logoUrl = getEventAssetPublicUrl(event.logo_path);

  // Summary card stats — driven by usePassportHomeData when a passport
  // exists; falls back to event venue count for unregistered visitors.
  const visited = homeData.hasPassport ? homeData.visited : 0;
  const total = homeData.total > 0 ? homeData.total : venues.length;
  const pct = total > 0 ? Math.min(100, Math.round((visited / total) * 100)) : 0;
  const pointsEarned: number | null = homeData.hasPassport ? homeData.points : null;
  const awards = homeData.awards;
  const nextAward = awards.length > 0 ? pickNextReward(awards) : null;
  const unlockedAwards = awards.filter((a) => a.is_eligible);

  void unlockedAwards; // keep for downstream references if any

  const tierSub =
    !homeData.hasPassport
      ? "tap to begin"
      : awards.length === 0
        ? "stay tuned"
        : nextAward
          ? nextAward.points_remaining > 0
            ? `${nextAward.points_remaining} pt${nextAward.points_remaining === 1 ? "" : "s"} to go`
            : "ready to enter"
          : unlockedAwards.length > 0
            ? `${unlockedAwards.length} unlocked`
            : "keep collecting";
  const tierGlyph =
    awards.length > 0 && nextAward
      ? "🎁"
      : unlockedAwards.length > 0
        ? "★"
        : "✨";

  // Circular progress ring geometry (left side of summary card)
  const ringSize = 116;
  const ringStroke = 10;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringDash = (pct / 100) * ringCirc;

  // "Points / stops to next milestone" tile
  const currentPoints = pointsEarned ?? 0;
  const pointsToNext =
    nextAward && nextAward.points_remaining > 0
      ? nextAward.points_remaining
      : nextAward
        ? 0
        : null;
  const trailRemaining = Math.max(0, total - visited);




  return (
    <EventPaletteScope
      paletteKey={event.palette_key ?? null}
      backgroundKey={event.page_background_key ?? null}
      primaryColor={event.primary_color ?? null}
      accentColor={event.accent_color ?? null}
      pageBackgroundColor={event.page_background_color ?? null}
      cardBackgroundColor={event.card_background_color ?? null}
      textColor={event.text_color ?? null}
      mutedTextColor={event.muted_text_color ?? null}
      cardTextColor={event.card_text_color ?? null}
      cardMutedTextColor={event.card_muted_text_color ?? null}
      borderColor={event.border_color ?? null}
      primaryTextColor={event.primary_text_color ?? null}
      navBackgroundColor={event.nav_background_color ?? null}
      brandKitKey={event.brand_kit_key ?? null}
      linkColor={event.link_color ?? null}
      cardBorderColor={event.card_border_color ?? null}
      buttonPrimaryBg={event.button_primary_bg ?? null}
      buttonPrimaryFg={event.button_primary_fg ?? null}
      buttonSecondaryBg={event.button_secondary_bg ?? null}
      buttonSecondaryFg={event.button_secondary_fg ?? null}
      navFgColor={event.nav_fg_color ?? null}
      navMutedColor={event.nav_muted_color ?? null}
      navActiveFgColor={event.nav_active_fg_color ?? null}
      heroBgColor={event.hero_bg_color ?? null}
      heroFgColor={event.hero_fg_color ?? null}
      heroAccentColor={event.hero_accent_color ?? null}
      fontFamily={event.font_family ?? null}
      headingFontFamily={event.heading_font_family ?? null}
      className="min-h-screen"
    >
      <LiveActivityBar subdomain={subdomain} />
      <PrizeUnlockAnnouncer eventId={event.event_id} />
      {isAdminPreview && !previewDismissed && (

        <div
          className="fixed left-1/2 top-3 z-50 max-w-[92vw] -translate-x-1/2 rounded-2xl border border-amber-300 bg-amber-100/95 px-4 py-2 pr-10 text-[11px] text-amber-900 shadow"
          role="status"
        >
          <div className="flex items-center gap-2 font-semibold uppercase tracking-[0.18em]">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            Admin preview
          </div>
          <p className="mt-1 normal-case tracking-normal text-[11px] leading-snug">
            You are viewing the real customer page in preview mode. Navigation and
            customer actions use the live event flow. Customer actions taken here may
            create real passports, check-ins, and points for this event.
          </p>
          <button
            type="button"
            onClick={() => setPreviewDismissed(true)}
            aria-label="Dismiss admin preview notice"
            className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-amber-900 hover:bg-amber-200/80 active:bg-amber-300/80"
          >
            <span aria-hidden className="text-base leading-none">×</span>
          </button>
        </div>
      )}

      {/* Full-bleed hero with overlaid header */}
      <div className="relative">
        <div className="absolute inset-x-0 top-0 z-40 px-4">
          <PublicEventNav
            subdomain={subdomain}
            eventName={event.name}
            primaryColor={event.primary_color}
            accentColor={event.accent_color}
            logoUrl={logoUrl}
            hasTerms={Boolean(event.terms_url || event.current_terms_version_id)}
            hasPrivacy={Boolean(event.terms_url || event.current_terms_version_id)}
            canRegister={canRegister}
            eventId={event.event_id}
            activeOverride="home"
            transparentHeader
          />
        </div>

        <section
          className="relative w-full overflow-hidden"
          style={{
            backgroundColor: "var(--event-hero-bg, var(--event-primary))",
            color: "var(--event-hero-fg, var(--event-primary-fg))",
            minHeight: 340,
          }}
        >
          {heroImageUrl ? (
            <img
              src={heroImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
            />
          ) : null}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, var(--event-hero-overlay-strong, rgba(0,0,0,0.55)) 0%, var(--event-hero-overlay, rgba(0,0,0,0.2)) 40%, var(--event-hero-overlay-strong, rgba(0,0,0,0.65)) 100%)",
            }}
          />
          <div className="relative mx-auto flex min-h-[340px] max-w-md flex-col justify-end px-5 pb-16 pt-24 sm:min-h-[380px]">
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.32em]"
              style={{ color: "var(--event-hero-accent, var(--event-hero-fg, var(--event-accent)))" }}
            >
              Welcome
            </p>
            <h1
              className="font-event-heading mt-1 text-2xl font-semibold leading-tight sm:text-3xl"
              style={{
                color: "var(--event-hero-fg, var(--event-primary-fg))",
                textShadow: "0 2px 12px rgba(0,0,0,0.45)",
              }}
            >
              {firstName ? (
                <>Hi {firstName}! <span aria-hidden>👋</span></>
              ) : (
                <>Let’s explore {event.name}</>
              )}
            </h1>
            {firstName ? (
              <p
                className="mt-1 text-sm sm:text-base"
                style={{
                  color: "var(--event-hero-fg, var(--event-primary-fg))",
                  opacity: 0.95,
                  textShadow: "0 1px 8px rgba(0,0,0,0.45)",
                }}
              >
                Let’s explore {event.name}.
              </p>
            ) : (
              event.welcome_copy && (
                <p
                  className="mt-1 whitespace-pre-line text-sm sm:text-base"
                  style={{
                    color: "var(--event-hero-fg, var(--event-primary-fg))",
                    opacity: 0.95,
                    textShadow: "0 1px 8px rgba(0,0,0,0.45)",
                  }}
                >
                  {event.welcome_copy}
                </p>
              )
            )}
          </div>
        </section>
      </div>

      <main
        className="mx-auto w-full max-w-md px-4 pb-24"
        style={{ fontFamily: "var(--event-font, inherit)" }}
      >
        <div className="pt-2">
          <PublicAnnouncementBar subdomain={subdomain} />
        </div>

        {/* Summary card — overlaps the bottom of the hero */}
        <section
          className="relative z-10 -mt-14 rounded-3xl border shadow-lg sm:-mt-16"
          style={{
            borderColor: "var(--event-card-border)",
            backgroundColor: "var(--event-card-bg)",
          }}
        >
          <div className="grid grid-cols-2 items-stretch">
            {/* Left: visited progress ring */}
            <div
              className="flex flex-col items-center justify-center gap-2 px-3 py-5"
              style={{ borderRight: "1px solid var(--event-card-border)" }}
            >
              <div className="relative" style={{ width: ringSize + 32, height: ringSize + 20 }}>
                {homeData.hasPassport && visited > 0 ? <RingConfetti /> : null}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: ringSize, height: ringSize }}>
                  <svg
                    width={ringSize}
                    height={ringSize}
                    viewBox={`0 0 ${ringSize} ${ringSize}`}
                    aria-hidden
                  >
                    <circle
                      cx={ringSize / 2}
                      cy={ringSize / 2}
                      r={ringRadius}
                      fill="none"
                      stroke="var(--event-card-border)"
                      strokeWidth={ringStroke}
                    />
                    <circle
                      cx={ringSize / 2}
                      cy={ringSize / 2}
                      r={ringRadius}
                      fill="none"
                      stroke="var(--event-button-primary-bg)"
                      strokeWidth={ringStroke}
                      strokeLinecap="round"
                      strokeDasharray={`${ringDash} ${ringCirc}`}
                      transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span
                      className="font-trail-serif text-2xl font-semibold leading-none"
                      style={{ color: "var(--event-card-heading)" }}
                    >
                      {visited}
                      {total > 0 ? (
                        <span
                          className="text-base font-medium"
                          style={{ color: "var(--event-card-muted)" }}
                        >
                          /{total}
                        </span>
                      ) : null}
                    </span>
                  </div>
                </div>
              </div>

              <div
                className="text-center text-[11px] font-medium uppercase tracking-[0.18em]"
                style={{ color: "var(--event-card-muted)" }}
              >
                {total === 1 ? venueLabels.singular : venueLabels.plural} visited
              </div>
            </div>

            {/* Right: points (top) + tier (bottom) */}
            <div className="flex flex-col">
              <div
                className="flex flex-1 flex-col items-center justify-center px-3 py-3 text-center"
                style={{ borderBottom: "1px solid var(--event-card-border)" }}
              >
                <div
                  className="font-trail-serif text-2xl font-semibold leading-none"
                  style={{ color: "var(--event-card-heading)" }}
                >
                  {pointsEarned ?? visited}
                </div>
                <div
                  className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em]"
                  style={{ color: "var(--event-card-muted)" }}
                >
                  Points earned
                </div>
              </div>
              {(() => {
                const startable = !homeData.hasPassport && canRegister;
                const allUnlocked =
                  homeData.hasPassport && awards.length > 0 && !nextAward;
                const bigValue = startable
                  ? "—"
                  : allUnlocked
                    ? "✓"
                    : pointsToNext !== null
                      ? String(pointsToNext)
                      : tierGlyph;
                const subLabel = startable
                  ? "Start your passport"
                  : allUnlocked
                    ? "All milestones unlocked"
                    : pointsToNext !== null
                      ? "to next milestone"
                      : tierSub;
                const tileInner = (
                  <>
                    <div
                      className="font-trail-serif text-2xl font-semibold leading-none"
                      style={{ color: "var(--event-card-heading)" }}
                    >
                      {bigValue}
                    </div>
                    <div
                      className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em]"
                      style={{ color: "var(--event-card-muted)" }}
                    >
                      {subLabel}
                    </div>
                  </>
                );
                if (startable) {
                  return (
                    <Link
                      to="/join"
                      aria-label="Start your passport"
                      className="flex flex-1 flex-col items-center justify-center gap-1 px-3 py-3 text-center transition hover:opacity-90"
                    >
                      {tileInner}
                    </Link>
                  );
                }
                return (
                  <div className="flex flex-1 flex-col items-center justify-center gap-1 px-3 py-3 text-center">
                    {tileInner}
                  </div>
                );
              })()}
            </div>
          </div>
          {homeData.hasPassport && total > 0 && (
            <div className="border-t px-4 py-4" style={{ borderColor: "var(--event-card-border)" }}>
              <div className="flex items-baseline justify-between">
                <div
                  className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: "var(--event-card-heading)" }}
                >
                  Trail Progress
                </div>
                <div
                  className="text-[10px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: "var(--event-card-muted)" }}
                >
                  {pct}% complete
                </div>
              </div>
              <div
                className="mt-2 h-2.5 w-full overflow-hidden rounded-full"
                style={{ backgroundColor: "var(--event-card-border)" }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: "var(--event-button-primary-bg)",
                  }}
                />
              </div>
              <div
                className="mt-2 text-[11px]"
                style={{ color: "var(--event-card-muted)" }}
              >
                {visited >= total
                  ? "Trail complete — nice work! 🎉"
                  : nextAward
                    ? `Visit ${trailRemaining} more ${trailRemaining === 1 ? venueLabels.singular.toLowerCase() : venueLabels.plural.toLowerCase()} to reach ${nextAward.title}`
                    : `Only ${trailRemaining} ${trailRemaining === 1 ? venueLabels.singular.toLowerCase() : venueLabels.plural.toLowerCase()} to conquer ${event.name}! 🎉`}
              </div>
            </div>
          )}
        </section>


        {/* Primary CTA */}
        <div className="mt-5">
          {passportHref ? (
            <a
              href={passportHref}
              className="grid h-12 w-full place-items-center rounded-full text-sm font-semibold tracking-wide shadow"
              style={{
                backgroundColor: "var(--event-button-primary-bg)",
                color: "var(--event-button-primary-fg)",
              }}
            >
              View my passport
            </a>
          ) : canRegister ? (
            <Link
              to="/join"
              className="grid h-12 w-full place-items-center rounded-full text-sm font-semibold tracking-wide shadow"
              style={{
                backgroundColor: "var(--event-button-primary-bg)",
                color: "var(--event-button-primary-fg)",
              }}
            >
              Start passport
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="h-12 w-full cursor-not-allowed rounded-full text-sm font-semibold tracking-wide opacity-70 shadow"
              style={{
                backgroundColor: "var(--event-button-primary-bg)",
                color: "var(--event-button-primary-fg)",
              }}
              title="Terms & privacy not configured yet"
            >
              Start passport — coming soon
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              const url = `https://${subdomain}.getstampd.com.au`;
              const subject = `Come join me at ${event.name}`;
              const text = `Come join me at ${event.name} on GetStampd — ${url}`;
              if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
                try {
                  await navigator.share({ title: subject, text, url });
                  return;
                } catch (err) {
                  if ((err as DOMException)?.name === "AbortError") return;
                }
              }
              const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
              window.location.href = mailto;
            }}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full border-2 text-sm font-semibold tracking-wide"
            style={{
              borderColor: "var(--event-button-primary-bg)",
              color: "var(--event-button-primary-bg)",
              backgroundColor: "transparent",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            Share
          </button>
        </div>


        {/* App-style stacked sections */}
        <div className="mt-5 flex flex-col gap-5">
          <PassportStampGrid
            eventId={event.event_id}
            venueLabelPlural={venueLabels.plural}
            canRegister={canRegister}
          />
          <BonusPointsPromo subdomain={subdomain} />
          <WhatsHappeningCard subdomain={subdomain} />
          <NextRewardCard eventId={event.event_id} />

          <section className="flex flex-col gap-3">
            <Link
              to="/prizes"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold tracking-wide shadow"
              style={{
                backgroundColor: "var(--event-button-primary-bg)",
                color: "var(--event-button-primary-fg)",
              }}
            >
              View prizes
            </Link>
            <Link
              to="/venues"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold tracking-wide shadow"
              style={{
                backgroundColor: "var(--event-button-primary-bg)",
                color: "var(--event-button-primary-fg)",
              }}
            >
              View {venueLabels.plural.toLowerCase()} & offers
            </Link>
          </section>

          <CollectPointsSection
            eventId={event.event_id}
            primaryColor={event.primary_color}
            accentColor={event.accent_color}
            canRegister={canRegister}
          />

          <div className="mb-4 flex flex-col items-center gap-3 text-center">
            <Link
              to="/venues"
              className="text-xs font-medium uppercase tracking-[0.22em] underline-offset-4 hover:underline"
              style={{ color: "var(--event-link)" }}
            >
              View {venueLabels.plural.toLowerCase()} →
            </Link>
            <Link
              to="/leaderboard"
              className="text-xs font-medium uppercase tracking-[0.22em] underline-offset-4 hover:underline"
              style={{ color: "var(--event-link)" }}
            >
              View the points leaderboard →
            </Link>
          </div>

          <div className="flex justify-center">
            <PoweredByGetStampd variant="trail" />
          </div>
        </div>
      </main>
    </EventPaletteScope>
  );
}


function NotLiveYet() {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-6"
      style={{ backgroundColor: "var(--event-page-bg,#F6EFE2)" }}
    >
      <div
        className="mx-auto max-w-md rounded-3xl border p-8 text-center shadow-sm"
        style={{
          borderColor: "var(--event-card-border,#E6DCC7)",
          backgroundColor: "var(--event-card-bg,#FBF5E8)",
        }}
      >
        <div
          className="mx-auto mb-4 h-12 w-12 rounded-full"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--event-button-primary-bg,#1F3D2B) 14%, transparent)",
          }}
        />
        <h1
          className="font-trail-serif text-2xl font-semibold"
          style={{ color: "var(--event-card-heading,#1F3D2B)" }}
        >
          Event not live yet
        </h1>
        <p
          className="mt-3 text-sm leading-relaxed"
          style={{ color: "var(--event-card-text,#3D372C)" }}
        >
          This passport experience isn't available right now. Please check back
          closer to the event, or contact the organiser for details.
        </p>
        <div className="mt-6 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>
      </div>
    </div>
  );
}

// ---- Ring confetti (decorative) ----
function RingConfetti() {
  const pieces: Array<{ top: string; left: string; rot: number; color: string; w: number; h: number; delay: string }> = [
    { top: "4%",  left: "10%", rot: -18, color: "var(--event-accent)", w: 10, h: 4, delay: "0s" },
    { top: "14%", left: "88%", rot: 22,  color: "var(--event-button-primary-bg)", w: 6,  h: 6, delay: "0.3s" },
    { top: "48%", left: "-2%", rot: 8,   color: "#F5B841", w: 8,  h: 3, delay: "0.6s" },
    { top: "56%", left: "94%", rot: -30, color: "#E76F51", w: 4,  h: 8, delay: "0.15s" },
    { top: "86%", left: "18%", rot: 12,  color: "var(--event-accent)", w: 6,  h: 6, delay: "0.45s" },
    { top: "90%", left: "78%", rot: -8,  color: "#F5B841", w: 9,  h: 4, delay: "0.75s" },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece absolute block rounded-[2px]"
          style={{
            top: p.top,
            left: p.left,
            width: p.w,
            height: p.h,
            backgroundColor: p.color,
            ["--confetti-rot" as any]: `${p.rot}deg`,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  );
}


