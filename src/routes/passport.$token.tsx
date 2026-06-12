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

  const statusLabel = (passport.status ?? "active").replace(/_/g, " ");
  const greetingName =
    passport.first_name?.trim() ||
    passport.full_name?.trim() ||
    "Visitor";

  return (
    <>
      {subdomain && (
        <div className="px-4">
          <PublicEventNav
            subdomain={subdomain}
            eventName={eventName ?? "Your passport"}
            primaryColor={PRIMARY}
            accentColor={ACCENT}
            logoUrl={getEventAssetPublicUrl(branding.logoPath)}
            activeOverride="passport"
            passportHref={passportUrl}
            eventId={passport.event_id}
          />
        </div>
      )}
      <main
        className="mx-auto w-full max-w-md px-4 pb-24 pt-4"
        style={{ fontFamily: "var(--event-font, inherit)" }}
      >
        <div className="text-center">
          <div
            className="text-[10px] font-medium uppercase tracking-[0.32em]"
            style={{ color: "var(--event-accent, " + ACCENT + ")" }}
          >
            My Passport
          </div>
          <h1
            className="mt-1 text-3xl font-semibold"
            style={{
              color: "var(--event-page-fg, " + PRIMARY + ")",
              fontFamily: "var(--event-font, inherit)",
            }}
          >
            {eventName ?? "Trail passport"}
          </h1>
          <p
            className="mt-1 text-[11px] uppercase tracking-[0.22em]"
            style={{ color: "var(--event-page-muted, #8A7E66)" }}
          >
            Hi {greetingName}
          </p>
        </div>





        {/* Progress card */}
        <section className="mt-5 rounded-3xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-6 text-center shadow-sm">
          <div className="relative mx-auto h-32 w-32">
            <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--event-border,#E6DCC7)" strokeWidth="10" />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke={PRIMARY}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 52}
                strokeDashoffset={(1 - pct / 100) * 2 * Math.PI * 52}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div
                className="font-trail-serif text-3xl font-semibold"
                style={{ color: PRIMARY }}
              >
                {stampedCount}
                {totalVenues > 0 ? (
                  <span className="text-base text-[var(--event-muted,#8A7E66)]">/{totalVenues}</span>
                ) : null}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
                stamps
              </div>
            </div>
          </div>

          {totalVenues > 0 && (
            <p
              className="mt-4 text-sm font-medium"
              style={{ color: PRIMARY }}
            >
              {stampedCount} of {totalVenues}{" "}
              {totalVenues === 1
                ? labelSingular.toLowerCase()
                : labelPlural.toLowerCase()}{" "}
              visited
            </p>
          )}

          {totalVenues > 0 && stampedCount >= totalVenues ? (
            <div
              className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--event-page-bg,#F6EFE2)]"
              style={{ backgroundColor: PRIMARY }}
            >
              <span aria-hidden>★</span>
              Trail complete
            </div>
          ) : (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--event-border,#E6DCC7)] bg-[var(--event-page-bg,#F6EFE2)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--event-body,#3D372C)]">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor:
                    passport.status === "completed" ? PRIMARY : ACCENT,
                }}
              />
              Status · {statusLabel}
            </div>
          )}
        </section>

        {/* Stamp grid */}
        <StampGrid
          venues={stamps.allVenues}
          labelSingular={labelSingular}
          labelPlural={labelPlural}
        />

        {/* Rewards — sourced from configured event_awards. Hidden when none. */}
        <RewardsSection
          eventId={passport.event_id}
          passportId={passport.passport_id}
        />

        {/* Visitor details */}
        <section className="mt-5 rounded-3xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-5 shadow-sm">
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
            Passport holder
          </div>
          <div
            className="mt-1 font-trail-serif text-lg font-semibold"
            style={{ color: PRIMARY }}
          >
            {passport.full_name ?? "Visitor"}
          </div>
          {passport.email && (
            <div className="mt-0.5 text-sm text-[var(--event-body,#3D372C)]/80 break-all">
              {passport.email}
            </div>
          )}
        </section>


        {/* Copy link */}
        <section className="mt-5 rounded-3xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-5 shadow-sm">
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
            Your private passport link
          </div>
          <div
            className="mt-2 break-all rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-page-bg,#F6EFE2)] p-3 font-mono text-xs"
            style={{ color: PRIMARY }}
          >
            {passportUrl}
          </div>
          <button
            type="button"
            onClick={copy}
            className="mt-3 h-11 w-full rounded-full text-sm font-semibold tracking-wide text-[var(--event-page-bg,#F6EFE2)] shadow"
            style={{ backgroundColor: PRIMARY }}
          >
            {copied ? "Copied!" : "Copy passport link"}
          </button>
          <div
            className="mt-3 rounded-xl border px-3 py-2 text-left text-xs"
            style={{
              borderColor: `${ACCENT}55`,
              backgroundColor: `${ACCENT}10`,
              color: "#5A2410",
            }}
          >
            <strong>Save this link.</strong> It is the only way back into your
            passport on a new device. Anyone with it can view your passport.
          </div>
          <button
            type="button"
            onClick={copySupportDetails}
            className="mt-3 h-9 w-full rounded-full border border-[var(--event-border,#E6DCC7)] bg-[var(--event-page-bg,#F6EFE2)] text-xs font-semibold tracking-wide text-[var(--event-body,#3D372C)]"
          >
            {supportCopied ? "Copied support details" : "Copy support details"}
          </button>
          <p className="mt-2 text-[10px] leading-snug text-[var(--event-muted,#8A7E66)]">
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
        <div className="rounded-3xl border border-dashed border-[#C9A24A]/50 bg-[var(--event-card-bg,#FBF5E8)] p-6 text-center">
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C9A24A]">
            No {labelPlural.toLowerCase()} configured
          </div>
          <p className="mt-2 text-sm text-[var(--event-body,#3D372C)]">
            The event organiser hasn't published any {labelPlural.toLowerCase()} yet.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2
          className="font-trail-serif text-lg font-semibold"
          style={{ color: PRIMARY }}
        >
          Stamp collection
        </h2>
        <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
          Tap a {labelSingular.toLowerCase()} for details
        </span>
      </div>
      <div className="rounded-3xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-5 shadow-sm">
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
                backgroundColor: PRIMARY,
                color: "var(--event-page-bg,#F6EFE2)",
                boxShadow:
                  "inset 0 0 0 2px var(--event-page-bg,#F6EFE2), inset 0 0 0 4px rgba(31,61,43,0.65), 0 2px 6px rgba(31,61,43,0.18)",
              }
            : {
                backgroundColor: "var(--event-page-bg,#F6EFE2)",
                color: "var(--event-muted,#8A7E66)",
                boxShadow: "inset 0 0 0 2px var(--event-border,#E6DCC7)",
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent 0 6px, rgba(138,126,102,0.06) 6px 7px)",
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
            className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#A89C82]"
          >
            Empty
          </span>
        )}
      </div>
      <div
        className={`mt-2 line-clamp-2 text-[12px] font-semibold leading-tight ${
          stamped ? "" : "text-[var(--event-muted,#8A7E66)]"
        }`}
        style={stamped ? { color: PRIMARY } : undefined}
      >
        {venue.venue_name ?? "Venue"}
      </div>
      {stamped && when && (
        <div className="mt-0.5 text-[10px] text-[var(--event-muted,#8A7E66)]">{when}</div>
      )}
      {!stamped && (
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[#A89C82]">
          Not visited
        </div>
      )}
    </Link>
  );
}

function RewardsSection({
  eventId,
  passportId,
}: {
  eventId: string | null;
  passportId: string | null;
}) {
  const [awards, setAwards] = useState<PublicEventAward[] | null>(null);
  useEffect(() => {
    if (!eventId) {
      setAwards([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await listPublicAwards(eventId, passportId);
        if (!cancelled) setAwards(rows);
      } catch {
        if (!cancelled) setAwards([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, passportId]);

  // Loading: render nothing (avoids flashing defaults).
  if (awards == null) return null;
  // Empty: hide section entirely — the organiser hasn't configured awards.
  if (awards.length === 0) return null;

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h2
          className="font-trail-serif text-lg font-semibold"
          style={{ color: PRIMARY }}
        >
          Rewards
        </h2>
        <Link
          to="/awards"
          className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--event-primary,#1F3D2B)] underline-offset-2 hover:underline"
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
      className={`rounded-2xl border p-4 shadow-sm ${
        unlocked
          ? "border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)]"
          : "border-dashed border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)]/70"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="font-trail-serif text-sm font-semibold"
            style={{ color: unlocked ? PRIMARY : "var(--event-text,#3D372C)" }}
          >
            {award.title}
          </div>
          {award.description && (
            <p className="mt-1 text-[12.5px] leading-snug text-[var(--event-body,#3D372C)]">
              {award.description}
            </p>
          )}
          <div className="mt-1.5 text-[11px] text-[var(--event-muted,#8A7E66)]">
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
              ? { backgroundColor: PRIMARY, color: "var(--event-primary-fg,#F6EFE2)" }
              : { border: `1px solid ${ACCENT}55`, color: ACCENT }
          }
        >
          {unlocked ? "✓ Entered" : "Locked"}
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--event-border,#E6DCC7)]">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: unlocked ? PRIMARY : ACCENT,
          }}
        />
      </div>
    </li>
  );
}


