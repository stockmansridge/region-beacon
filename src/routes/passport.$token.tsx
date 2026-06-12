import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { PublicEventNav } from "@/components/public-event-nav";
import { classifyHost } from "@/components/host-router";
import {
  EMPTY_PASSPORT_STAMP_STATE,
  loadPassportStampState,
  type PassportStampState,
  type PassportStampVenue,
} from "@/lib/passport-stamps";

import { listPublicAwards, type PublicEventAward } from "@/lib/event-awards";
import { pickNextReward } from "@/lib/use-passport-home-data";
import { PoweredByGetStampd } from "@/components/brand";
import { brandingScopeProps, useEventBrandingKeys, type EventBrandingKeys } from "@/lib/use-event-palette";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { getEventAssetPublicUrl } from "@/lib/event-assets";


export const Route = createFileRoute("/passport/$token")({
  head: () => ({ meta: [{ title: "My passport" }] }),
  component: PassportPage,
});

type PassportRow = {
  passport_id: string;
  event_id: string | null;
  status: string | null;
  completed_at: string | null;
  leaderboard_opt_out: boolean | null;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  mobile: string | null;
  postcode: string | null;
  marketing_opt_in: boolean | null;
  checkin_count: number | null;
};

type LookupDiagnostics = {
  rpc: string;
  zero_rows: boolean;
  supabase_error_code: string | null;
  supabase_error_message: string | null;
  supabase_error_details: string | null;
  supabase_error_hint: string | null;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "not_found"; diagnostics: LookupDiagnostics }
  | {
      kind: "ready";
      passport: PassportRow;
      eventName: string | null;
      stamps: PassportStampState;
    };

// PRIMARY / ACCENT are kept as hex fallbacks for the PublicEventNav prop
// surface (it still takes raw hex colours). All in-page colour usage on
// this route is driven by the semantic --event-* tokens emitted by
// EventPaletteScope; these constants are not consulted by card/page
// chrome anymore.
const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";

function PassportPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const subdomain = useMemo(() => {
    const cls = classifyHost(hostname);
    return cls.kind === "tenant" ? cls.subdomain : null;
  }, [hostname]);
  const branding = useEventBrandingKeys(subdomain);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });

      const passportRes = await supabase.rpc("get_passport_by_token", { _raw_token: token });

      if (cancelled) return;

      const row = (passportRes.data?.[0] ?? null) as PassportRow | null;
      if (passportRes.error || !row?.passport_id) {
        const err = (passportRes.error ?? null) as
          | { code?: string | null; message?: string | null; details?: string | null; hint?: string | null }
          | null;
        setState({
          kind: "not_found",
          diagnostics: {
            rpc: "get_passport_by_token",
            zero_rows: !passportRes.error && !row?.passport_id,
            supabase_error_code: err?.code ?? null,
            supabase_error_message: err?.message ?? null,
            supabase_error_details: err?.details ?? null,
            supabase_error_hint: err?.hint ?? null,
          },
        });
        return;
      }

      // Refresh localStorage entry for this event with the working token.
      if (row.event_id && typeof localStorage !== "undefined") {
        try {
          const key = `gs.passport.${row.event_id}`;
          const existingRaw = localStorage.getItem(key);
          const existing = existingRaw ? JSON.parse(existingRaw) : {};
          localStorage.setItem(
            key,
            JSON.stringify({
              ...existing,
              passport_id: row.passport_id,
              access_token: token,
              event_id: row.event_id,
              created_at: existing?.created_at ?? new Date().toISOString(),
            }),
          );
        } catch {
          // ignore storage errors
        }
      }

      const stamps = await loadPassportStampState(token);
      if (cancelled) return;

      // Event name fallback: stamps RPC > passports.events lookup (best-effort).
      let eventName: string | null = stamps?.eventName ?? null;
      if (!eventName && row.event_id) {
        const { data: evt } = await supabase
          .from("events")
          .select("name")
          .eq("id", row.event_id)
          .maybeSingle();
        if (!cancelled) eventName = (evt as { name: string | null } | null)?.name ?? null;
      }

      if (cancelled) return;
      setState({ kind: "ready", passport: row, eventName, stamps });
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Always wrap output in EventPaletteScope so the chosen event background
  // is applied on the first painted frame (no cream flash). Until branding
  // resolves we render a neutral, non-cream placeholder.
  // Only gate on passport state — branding is best-effort and must not
  // block the page from rendering on mobile if the public event RPC is
  // slow or temporarily unreachable.
  const showInner = state.kind !== "loading";

  return (
    <EventPaletteScope
      {...brandingScopeProps(branding)}
      className="min-h-screen"
    >
      {!showInner ? (
        <div
          className="flex min-h-screen items-center justify-center text-sm"
          style={{ color: "var(--event-page-muted)" }}
        >
          Loading your passport…
        </div>
      ) : state.kind === "not_found" ? (
        <PassportNotFound token={token} diagnostics={state.diagnostics} branding={branding} />
      ) : state.kind === "ready" ? (
        <PassportView
          passport={state.passport}
          eventName={state.eventName}
          stamps={state.stamps}
          token={token}
          subdomain={subdomain}
          branding={branding}
        />
      ) : null}
    </EventPaletteScope>
  );
}


const URL_SAFE_TOKEN_RE = /^[A-Za-z0-9_-]+$/;

function PassportNotFound({
  token,
  diagnostics,
  branding: _branding,
}: {
  token: string;
  diagnostics: LookupDiagnostics;
  branding: EventBrandingKeys;
}) {

  const [copied, setCopied] = useState(false);
  const [clearedEventId, setClearedEventId] = useState<string | null>(null);
  const [storageKeyCleared, setStorageKeyCleared] = useState<boolean>(false);
  const [hasReturnTo, setHasReturnTo] = useState<boolean>(false);

  // Resolve the current event from the hostname and clear the stale
  // gs.passport.<event_id> entry so the visitor isn't trapped on the next
  // visit. Other events' saved passports are untouched.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;
      try {
        const { data } = await supabase.rpc("resolve_event_by_host", {
          _hostname: window.location.hostname,
        });
        const row = Array.isArray(data) ? data[0] : data;
        const eventId =
          (row as { event_id?: string | null } | null)?.event_id ?? null;
        if (cancelled || !eventId) return;
        setClearedEventId(eventId);
        try {
          const key = `gs.passport.${eventId}`;
          const existed = localStorage.getItem(key) !== null;
          if (existed) {
            localStorage.removeItem(key);
            setStorageKeyCleared(true);
          }
        } catch {
          // ignore
        }
        try {
          const pending = sessionStorage.getItem("gs.returnTo.pending");
          const scoped = sessionStorage.getItem(`gs.returnTo.${eventId}`);
          setHasReturnTo(Boolean(pending || scoped));
        } catch {
          // ignore
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copySupport() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    const report = {
      timestamp: new Date().toISOString(),
      page_url: url,
      public_subdomain: host,
      route: "/passport/$token",
      route_param_present: token.length > 0,
      token_length: token.length,
      token_first4: token.slice(0, 4),
      token_last4: token.slice(-4),
      token_is_url_safe: URL_SAFE_TOKEN_RE.test(token),
      rpc: diagnostics.rpc,
      zero_rows: diagnostics.zero_rows,
      validation_result: diagnostics.zero_rows
        ? "not_found_or_replaced"
        : "rpc_error",
      event_id: clearedEventId,
      localStorage_key_checked: clearedEventId
        ? `gs.passport.${clearedEventId}`
        : null,
      localStorage_key_cleared: storageKeyCleared,
      saved_passport_existed: storageKeyCleared,
      return_to_preserved: hasReturnTo,
      supabase_error_code: diagnostics.supabase_error_code,
      supabase_error_message: diagnostics.supabase_error_message,
      supabase_error_details: diagnostics.supabase_error_details,
      supabase_error_hint: diagnostics.supabase_error_hint,
      route_mapping: "tenant_pretty_path",
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6"
      style={{ backgroundColor: "var(--event-page-bg)" }}
    >
      <div
        className="mx-auto w-full max-w-md rounded-3xl border p-8 text-center shadow-sm"
        style={{
          borderColor: "var(--event-card-border)",
          backgroundColor: "var(--event-card-bg)",
        }}
      >
        <div
          className="mx-auto mb-4 h-12 w-12 rounded-full"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--event-button-primary-bg) 14%, transparent)",
          }}
        />
        <h1
          className="font-trail-serif text-2xl font-semibold"
          style={{ color: "var(--event-card-heading)" }}
        >
          Passport link not found or replaced
        </h1>
        <p
          className="mt-3 text-sm leading-relaxed"
          style={{ color: "var(--event-card-text)" }}
        >
          This passport link is no longer valid. If you re-registered, the
          newest link is the only working one. You can register again for this
          trail to get a fresh passport.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <a
            href="/join"
            className="inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold tracking-wide shadow"
            style={{
              backgroundColor: "var(--event-button-primary-bg)",
              color: "var(--event-button-primary-fg)",
            }}
          >
            Register again for this trail
          </a>
          <a
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full border bg-transparent text-sm font-semibold tracking-wide"
            style={{
              borderColor: "var(--event-button-secondary-border)",
              color: "var(--event-button-secondary-fg)",
              backgroundColor: "var(--event-button-secondary-bg)",
            }}
          >
            Back to trail home
          </a>
          <button
            type="button"
            onClick={copySupport}
            className="mt-1 inline-flex h-9 items-center justify-center rounded-full border px-4 text-xs font-medium"
            style={{
              borderColor: "var(--event-card-border)",
              backgroundColor: "var(--event-page-bg)",
              color: "var(--event-card-text)",
            }}
          >
            {copied ? "Copied support details" : "Copy support details"}
          </button>
        </div>
        <p
          className="mt-3 text-[10px]"
          style={{ color: "var(--event-card-muted)" }}
        >
          Support details do not include your full passport link or any visitor
          personal information.
        </p>
      </div>
    </div>
  );
}

function PassportView({
  passport,
  eventName,
  stamps,
  token,
  subdomain,
  branding,
}: {
  passport: PassportRow;
  eventName: string | null;
  stamps: PassportStampState;
  token: string;
  subdomain: string | null;
  branding: EventBrandingKeys;
}) {
  const [copied, setCopied] = useState(false);
  const [supportCopied, setSupportCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const passportUrl = `${origin}/passport/${token}`;
  



  const labelSingular = stamps.labelSingular;
  const labelPlural = stamps.labelPlural;

  const stampedCount = stamps.visitedCount || passport.checkin_count || 0;
  const totalVenues = stamps.totalVenueCount;
  const goal = totalVenues > 0 ? totalVenues : Math.max(stampedCount, 1);
  const pct = Math.min(100, Math.round((stampedCount / goal) * 100));

  // Awards — lifted from RewardsSection so the summary tile can show
  // tier / next-reward status using the same source of truth.
  const [awards, setAwards] = useState<PublicEventAward[] | null>(null);
  useEffect(() => {
    if (!passport.event_id) {
      setAwards([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await listPublicAwards(passport.event_id!, passport.passport_id);
        if (!cancelled) setAwards(rows);
      } catch {
        if (!cancelled) setAwards([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [passport.event_id, passport.passport_id]);

  // Points: same heuristic as use-passport-home-data — passport_points is
  // computed server-side and identical across awards rows.
  const pointsEarned: number | null =
    awards && awards.length > 0
      ? (awards.find((a) => typeof a.passport_points === "number")?.passport_points ?? null)
      : null;
  const unlockedAwards = awards?.filter((a) => a.is_eligible) ?? [];
  const nextAward = awards ? pickNextReward(awards) : null;
  const heroImageUrl = getEventAssetPublicUrl(branding.coverPath);
  const heroLogoUrl = getEventAssetPublicUrl(branding.logoPath);



  async function copy() {
    try {
      await navigator.clipboard.writeText(passportUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function copySupportDetails() {
    const eventId = passport.event_id;
    let savedPassportFound = false;
    if (eventId && typeof localStorage !== "undefined") {
      try {
        savedPassportFound = localStorage.getItem(`gs.passport.${eventId}`) !== null;
      } catch {
        savedPassportFound = false;
      }
    }
    const report = {
      timestamp: new Date().toISOString(),
      route: "/passport/$token",
      hostname: typeof window !== "undefined" ? window.location.hostname : "",

      event_id: eventId,
      saved_passport_key_checked: eventId ? `gs.passport.${eventId}` : null,
      saved_passport_found: savedPassportFound,
      passport_validation_status: "valid",
      stamp_rpc_status: stamps.status,
      stamp_rpc_error: stamps.error,
      stamp_row_count: stamps.rowCount,
      stamped_row_count: stamps.stampedRowCount,
      venue_count: stamps.totalVenueCount,
      first_stamp_row_field_names: stamps.firstRowFieldNames,
      matched_visited_venue_id_count: stamps.visitedVenueIds.size,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setSupportCopied(true);
      setTimeout(() => setSupportCopied(false), 2000);
    } catch {
      setSupportCopied(false);
    }
  }

  const greetingName =
    passport.first_name?.trim() ||
    passport.full_name?.trim() ||
    "Visitor";

  // Reward/tier copy used in the right-bottom of the summary card.
  const tierTitle: string =
    awards == null
      ? "Loading rewards…"
      : awards.length === 0
        ? "More rewards ahead"
        : totalVenues > 0 && stampedCount >= totalVenues
          ? "Trail complete"
          : nextAward
            ? nextAward.title
            : unlockedAwards.length > 0
              ? "All unlocked"
              : "Keep exploring";
  const tierSub: string =
    awards == null
      ? "loading…"
      : awards.length === 0
        ? "stay tuned"
        : nextAward
          ? nextAward.points_remaining > 0
            ? `${nextAward.points_remaining} pt${nextAward.points_remaining === 1 ? "" : "s"} to go`
            : "ready to enter"
          : unlockedAwards.length > 0
            ? `${unlockedAwards.length} unlocked`
            : "keep collecting";
  const tierGlyph: string =
    awards && awards.length > 0 && nextAward
      ? "🎁"
      : awards && unlockedAwards.length > 0
        ? "★"
        : "✨";

  // Circular progress ring geometry (left side of summary card).
  const ringSize = 116;
  const ringStroke = 10;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringDash = (pct / 100) * ringCirc;

  return (
    <>
      {/* Full-bleed hero with overlaid header */}
      <div className="relative">
        {subdomain && (
          <div className="absolute inset-x-0 top-0 z-40 px-4">
            <PublicEventNav
              subdomain={subdomain}
              eventName={eventName ?? "Your passport"}
              primaryColor={PRIMARY}
              accentColor={ACCENT}
              logoUrl={heroLogoUrl}
              activeOverride="passport"
              passportHref={passportUrl}
              eventId={passport.event_id}
              transparentHeader
            />
          </div>
        )}
        <section
          className="relative w-full overflow-hidden"
          style={{
            backgroundColor: "var(--event-hero-bg, var(--event-primary))",
            color: "var(--event-hero-fg, var(--event-primary-fg))",
            minHeight: 320,
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
          <div className="relative mx-auto flex min-h-[320px] max-w-md flex-col justify-end px-5 pb-16 pt-24 sm:min-h-[360px]">
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.32em]"
              style={{ color: "var(--event-hero-accent, var(--event-hero-fg, var(--event-accent)))" }}
            >
              My Passport
            </p>
            {passport.first_name?.trim() ? (
              <h1
                className="mt-1 text-2xl font-semibold leading-tight sm:text-3xl"
                style={{
                  color: "var(--event-hero-fg, var(--event-primary-fg))",
                  fontFamily: "var(--event-font, inherit)",
                  textShadow: "0 2px 12px rgba(0,0,0,0.45)",
                }}
              >
                Hi {passport.first_name.trim()}! <span aria-hidden>👋</span>
              </h1>
            ) : (
              <h1
                className="mt-1 text-2xl font-semibold leading-tight sm:text-3xl"
                style={{
                  color: "var(--event-hero-fg, var(--event-primary-fg))",
                  fontFamily: "var(--event-font, inherit)",
                  textShadow: "0 2px 12px rgba(0,0,0,0.45)",
                }}
              >
                Hi {greetingName}! <span aria-hidden>👋</span>
              </h1>
            )}
            <p
              className="mt-1 text-sm sm:text-base"
              style={{
                color: "var(--event-hero-fg, var(--event-primary-fg))",
                opacity: 0.95,
                textShadow: "0 1px 8px rgba(0,0,0,0.45)",
              }}
            >
              Let’s explore {eventName ?? "the trail"}.
            </p>
          </div>
        </section>
      </div>

      <main
        className="mx-auto w-full max-w-md px-4 pb-24"
        style={{ fontFamily: "var(--event-font, inherit)" }}
      >
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
              style={{
                borderRight: "1px solid var(--event-card-border)",
              }}
            >
              <div
                className="relative"
                style={{ width: ringSize, height: ringSize }}
              >
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
                    {stampedCount}
                    {totalVenues > 0 ? (
                      <span
                        className="text-base font-medium"
                        style={{ color: "var(--event-card-muted)" }}
                      >
                        /{totalVenues}
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>
              <div
                className="text-center text-[11px] font-medium uppercase tracking-[0.18em]"
                style={{ color: "var(--event-card-muted)" }}
              >
                {totalVenues === 1 ? labelSingular : labelPlural} visited
              </div>
            </div>

            {/* Right: points (top) + tier (bottom) */}
            <div className="flex flex-col">
              <div
                className="flex flex-1 flex-col items-center justify-center px-3 py-3 text-center"
                style={{
                  borderBottom: "1px solid var(--event-card-border)",
                }}
              >
                <div
                  className="font-trail-serif text-2xl font-semibold leading-none"
                  style={{ color: "var(--event-card-heading)" }}
                >
                  {pointsEarned ?? stampedCount}
                </div>
                <div
                  className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em]"
                  style={{ color: "var(--event-card-muted)" }}
                >
                  Points earned
                </div>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-1 px-3 py-3 text-center">
                <div className="flex items-center gap-1.5">
                  <span aria-hidden className="text-base leading-none">
                    {tierGlyph}
                  </span>
                  <span
                    className="font-trail-serif text-sm font-semibold leading-tight"
                    style={{ color: "var(--event-card-heading)" }}
                  >
                    {tierTitle}
                  </span>
                </div>
                <div
                  className="text-[10px] font-medium uppercase tracking-[0.18em]"
                  style={{ color: "var(--event-card-muted)" }}
                >
                  {tierSub}
                </div>
              </div>
            </div>
          </div>
        </section>


        {/* Stamp grid */}
        <StampGrid
          venues={stamps.allVenues}
          labelSingular={labelSingular}
          labelPlural={labelPlural}
        />

        {/* Rewards — sourced from configured event_awards. Hidden when none. */}
        <RewardsSection awards={awards} nextAward={nextAward} />



        {/* Visitor details */}
        <section
          className="mt-5 rounded-3xl border p-5 shadow-sm"
          style={{
            borderColor: "var(--event-card-border)",
            backgroundColor: "var(--event-card-bg)",
          }}
        >
          <div
            className="text-[10px] font-medium uppercase tracking-[0.22em]"
            style={{ color: "var(--event-card-muted)" }}
          >
            Passport holder
          </div>
          <div
            className="mt-1 font-trail-serif text-lg font-semibold"
            style={{ color: "var(--event-card-heading)" }}
          >
            {passport.full_name ?? "Visitor"}
          </div>
          {passport.email && (
            <div
              className="mt-0.5 break-all text-sm"
              style={{ color: "var(--event-card-text)", opacity: 0.85 }}
            >
              {passport.email}
            </div>
          )}
        </section>


        {/* Copy link */}
        <section
          className="mt-5 rounded-3xl border p-5 shadow-sm"
          style={{
            borderColor: "var(--event-card-border)",
            backgroundColor: "var(--event-card-bg)",
          }}
        >
          <div
            className="text-[10px] font-medium uppercase tracking-[0.22em]"
            style={{ color: "var(--event-card-muted)" }}
          >
            Your private passport link
          </div>
          <div
            className="mt-2 break-all rounded-2xl border p-3 font-mono text-xs"
            style={{
              borderColor: "var(--event-card-border)",
              backgroundColor: "var(--event-page-bg)",
              color: "var(--event-link)",
            }}
          >
            {passportUrl}
          </div>
          <button
            type="button"
            onClick={copy}
            className="mt-3 h-11 w-full rounded-full text-sm font-semibold tracking-wide shadow"
            style={{
              backgroundColor: "var(--event-button-primary-bg)",
              color: "var(--event-button-primary-fg)",
            }}
          >
            {copied ? "Copied!" : "Copy passport link"}
          </button>
          <div
            className="mt-3 rounded-xl border px-3 py-2 text-left text-xs"
            style={{
              borderColor:
                "color-mix(in srgb, var(--event-accent) 35%, transparent)",
              backgroundColor:
                "color-mix(in srgb, var(--event-accent) 10%, transparent)",
              color: "var(--event-card-text)",
            }}
          >
            <strong>Save this link.</strong> It is the only way back into your
            passport on a new device. Anyone with it can view your passport.
          </div>
          <button
            type="button"
            onClick={copySupportDetails}
            className="mt-3 h-9 w-full rounded-full border text-xs font-semibold tracking-wide"
            style={{
              borderColor: "var(--event-button-secondary-border)",
              backgroundColor: "var(--event-button-secondary-bg)",
              color: "var(--event-button-secondary-fg)",
            }}
          >
            {supportCopied ? "Copied support details" : "Copy support details"}
          </button>
          <p
            className="mt-2 text-[10px] leading-snug"
            style={{ color: "var(--event-card-muted)" }}
          >
            Support details exclude your full passport link and visitor details.
          </p>
        </section>

        <div className="mt-6 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>

      </main>
    </>
  );
}


function StampGrid({
  venues,
  labelSingular,
  labelPlural,
}: {
  venues: PassportStampVenue[];
  labelSingular: string;
  labelPlural: string;
}) {
  if (venues.length === 0) {
    return (
      <section className="mt-5">
        <div
          className="rounded-3xl border border-dashed p-6 text-center"
          style={{
            borderColor:
              "color-mix(in srgb, var(--event-hero-accent, var(--event-accent)) 50%, transparent)",
            backgroundColor: "var(--event-card-bg)",
          }}
        >
          <div
            className="text-[10px] font-medium uppercase tracking-[0.22em]"
            style={{ color: "var(--event-hero-accent, var(--event-accent))" }}
          >
            No {labelPlural.toLowerCase()} configured
          </div>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--event-card-text)" }}
          >
            The event organiser hasn't published any {labelPlural.toLowerCase()} yet.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="font-trail-serif text-lg font-semibold"
            style={{ color: "var(--event-page-heading)" }}
          >
            Your Passport
          </h2>
          <p
            className="mt-0.5 text-[12px]"
            style={{ color: "var(--event-page-muted)" }}
          >
            Collect stamps as you visit each stop.
          </p>
        </div>
        <span
          className="shrink-0 text-[10px] font-medium uppercase tracking-[0.22em]"
          style={{ color: "var(--event-page-muted)" }}
        >
          Tap for details
        </span>
      </div>
      <div
        className="rounded-3xl border p-5 shadow-sm"
        style={{
          borderColor: "var(--event-card-border)",
          backgroundColor: "var(--event-card-bg)",
        }}
      >
        <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4">
          {venues.map((v) => (
            <StampCell key={v.venue_id} venue={v} />
          ))}
        </div>
      </div>
    </section>
  );
}





function StampCell({ venue }: { venue: PassportStampVenue }) {
  const stamped = !!venue.is_stamped;
  const when = venue.checked_in_at
    ? new Date(venue.checked_in_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <Link
      to="/venues/$venueId"
      params={{ venueId: venue.venue_id }}
      className="group flex flex-col items-center text-center focus:outline-none"
      aria-label={
        stamped
          ? `${venue.venue_name ?? "Venue"} — visited${when ? ` on ${when}` : ""}`
          : `${venue.venue_name ?? "Venue"} — not visited yet`
      }
    >
      <div
        className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-transform group-hover:scale-[1.04] group-focus-visible:ring-2 group-focus-visible:ring-offset-2 ${
          stamped ? "" : ""
        }`}
        style={
          stamped
            ? {
                backgroundColor: "var(--event-visited, var(--event-primary))",
                color: "var(--event-button-primary-fg, var(--event-primary-fg))",
                boxShadow:
                  "inset 0 0 0 2px var(--event-card-bg), inset 0 0 0 4px color-mix(in srgb, var(--event-visited, var(--event-primary)) 65%, transparent), 0 2px 6px color-mix(in srgb, var(--event-visited, var(--event-primary)) 25%, transparent)",
              }
            : {
                backgroundColor: "var(--event-page-bg)",
                color: "var(--event-card-muted)",
                boxShadow: "inset 0 0 0 2px var(--event-card-border)",
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent 0 6px, color-mix(in srgb, var(--event-card-muted) 12%, transparent) 6px 7px)",
              }
        }
      >
        {stamped ? (
          <div className="flex flex-col items-center justify-center leading-none">
            <span
              aria-hidden
              className="font-trail-serif text-2xl font-bold"
              style={{
                transform: "rotate(-8deg)",
                letterSpacing: "0.02em",
              }}
            >
              ✓
            </span>
            <span
              aria-hidden
              className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.18em]"
              style={{ transform: "rotate(-8deg)" }}
            >
              Visited
            </span>
          </div>
        ) : (
          <span
            aria-hidden
            className="text-[9px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--event-card-muted)", opacity: 0.85 }}
          >
            Empty
          </span>
        )}
      </div>
      <div
        className="mt-2 line-clamp-2 text-[12px] font-semibold leading-tight"
        style={{
          color: stamped ? "var(--event-card-heading)" : "var(--event-card-muted)",
        }}
      >
        {venue.venue_name ?? "Venue"}
      </div>
      {stamped && when && (
        <div
          className="mt-0.5 text-[10px]"
          style={{ color: "var(--event-card-muted)" }}
        >
          {when}
        </div>
      )}
      {!stamped && (
        <div
          className="mt-0.5 text-[10px] uppercase tracking-[0.14em]"
          style={{ color: "var(--event-card-muted)", opacity: 0.85 }}
        >
          Not visited
        </div>
      )}
    </Link>
  );
}

function RewardsSection({
  awards,
  nextAward,
}: {
  awards: PublicEventAward[] | null;
  nextAward: PublicEventAward | null;
}) {
  // Loading: render nothing (avoids flashing defaults).
  if (awards == null) return null;
  // Empty: hide section entirely — the organiser hasn't configured awards.
  if (awards.length === 0) return null;

  const allUnlocked = awards.every((a) => a.is_eligible);
  const headingCopy = allUnlocked
    ? "Trail complete"
    : nextAward
      ? nextAward.points_remaining > 0
        ? "You’re getting close"
        : "Next reward"
      : "Keep collecting stamps";

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="font-trail-serif text-lg font-semibold"
            style={{ color: "var(--event-page-heading)" }}
          >
            Rewards
          </h2>
          <p
            className="mt-0.5 text-[12px]"
            style={{ color: "var(--event-page-muted)" }}
          >
            {headingCopy}
          </p>
        </div>
        <Link
          to="/awards"
          className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.18em] underline-offset-2 hover:underline"
          style={{ color: "var(--event-link)" }}
        >
          View all
        </Link>
      </div>

      <ul className="space-y-2">
        {awards.map((a) => (
          <AwardRow key={a.id} award={a} />
        ))}
      </ul>
    </section>
  );
}



function AwardRow({ award }: { award: PublicEventAward }) {
  const unlocked = award.is_eligible;
  const pct = award.points_required > 0
    ? Math.min(100, Math.round((award.passport_points / award.points_required) * 100))
    : 0;
  return (
    <li
      className={`rounded-2xl border p-4 shadow-sm ${unlocked ? "" : "border-dashed"}`}
      style={{
        borderColor: "var(--event-card-border)",
        backgroundColor: unlocked
          ? "var(--event-card-bg)"
          : "color-mix(in srgb, var(--event-card-bg) 70%, transparent)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="font-trail-serif text-sm font-semibold"
            style={{
              color: unlocked
                ? "var(--event-card-heading)"
                : "var(--event-card-text)",
            }}
          >
            {award.title}
          </div>
          {award.description && (
            <p
              className="mt-1 text-[12.5px] leading-snug"
              style={{ color: "var(--event-card-text)" }}
            >
              {award.description}
            </p>
          )}
          <div
            className="mt-1.5 text-[11px]"
            style={{ color: "var(--event-card-muted)" }}
          >
            {award.points_required} {award.points_required === 1 ? "pt" : "pts"} required
            {award.requires_all_locations ? " · all locations" : ""}
            {!unlocked && award.points_remaining > 0
              ? ` · ${award.points_remaining} more to enter`
              : ""}
          </div>
        </div>
        <span
          className="inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={
            unlocked
              ? {
                  backgroundColor: "var(--event-button-primary-bg)",
                  color: "var(--event-button-primary-fg)",
                }
              : {
                  border:
                    "1px solid color-mix(in srgb, var(--event-accent) 35%, transparent)",
                  color: "var(--event-accent)",
                }
          }
        >
          {unlocked ? "✓ Entered" : "Locked"}
        </span>
      </div>
      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--event-card-border)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: unlocked
              ? "var(--event-button-primary-bg)"
              : "var(--event-accent)",
          }}
        />
      </div>
    </li>
  );
}


