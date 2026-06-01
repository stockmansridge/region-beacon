import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrailShell } from "@/components/trail-shell";
import { PublicEventNav } from "@/components/public-event-nav";
import { classifyHost } from "@/components/host-router";
import {
  EMPTY_PASSPORT_STAMP_STATE,
  loadPassportStampState,
  type PassportStampState,
  type PassportStampVenue,
} from "@/lib/passport-stamps";

import { computeDefaultRewardTiers, type RewardTier } from "@/lib/passport-rewards";
import { PoweredByGetStampd } from "@/components/brand";
import { useEventBrandingKeys } from "@/lib/use-event-palette";

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

const PRIMARY = "var(--event-primary,#1F3D2B)";
const ACCENT = "var(--event-accent,#B5572A)";

function PassportPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

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

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--event-page-bg,#F6EFE2)] text-sm text-[var(--event-muted,#8A7E66)]">
        Loading your passport…
      </div>
    );
  }

  if (state.kind === "not_found") {
    return <PassportNotFound token={token} diagnostics={state.diagnostics} />;
  }

  return (
    <PassportView
      passport={state.passport}
      eventName={state.eventName}
      stamps={state.stamps}
      token={token}
    />
  );
}

const URL_SAFE_TOKEN_RE = /^[A-Za-z0-9_-]+$/;

function PassportNotFound({
  token,
  diagnostics,
}: {
  token: string;
  diagnostics: LookupDiagnostics;
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
    <div className="flex min-h-screen items-center justify-center bg-[var(--event-page-bg,#F6EFE2)] px-6">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[var(--event-primary,#1F3D2B)]/10" />
        <h1 className="font-trail-serif text-2xl font-semibold text-[var(--event-primary,#1F3D2B)]">
          Passport link not found or replaced
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--event-body,#3D372C)]">
          This passport link is no longer valid. If you re-registered, the
          newest link is the only working one. You can register again for this
          trail to get a fresh passport.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <a
            href="/join"
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--event-primary,#1F3D2B)] px-6 text-sm font-semibold tracking-wide text-[var(--event-page-bg,#F6EFE2)] shadow"
          >
            Register again for this trail
          </a>
          <a
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--event-primary,#1F3D2B)]/30 bg-transparent text-sm font-semibold tracking-wide text-[var(--event-primary,#1F3D2B)]"
          >
            Back to trail home
          </a>
          <button
            type="button"
            onClick={copySupport}
            className="mt-1 inline-flex h-9 items-center justify-center rounded-full border border-[var(--event-border,#E6DCC7)] bg-[var(--event-page-bg,#F6EFE2)] px-4 text-xs font-medium text-[var(--event-body,#3D372C)]"
          >
            {copied ? "Copied support details" : "Copy support details"}
          </button>
        </div>
        <p className="mt-3 text-[10px] text-[var(--event-muted,#8A7E66)]">
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
}: {
  passport: PassportRow;
  eventName: string | null;
  stamps: PassportStampState;
  token: string;
}) {
  const [copied, setCopied] = useState(false);
  const [supportCopied, setSupportCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const passportUrl = `${origin}/passport/${token}`;
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const subdomain = useMemo(() => {
    const cls = classifyHost(hostname);
    return cls.kind === "tenant" ? cls.subdomain : null;
  }, [hostname]);
  const { paletteKey, backgroundKey } = useEventBrandingKeys(subdomain);

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
      hostname,
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
        <div className="bg-[var(--event-page-bg,#F6EFE2)] px-4 pt-6">
          <PublicEventNav
            subdomain={subdomain}
            eventName={eventName ?? "Your passport"}
            primaryColor={PRIMARY}
            accentColor={ACCENT}
            activeOverride="passport"
            passportHref={passportUrl}
            eventId={passport.event_id}
          />
        </div>
      )}
      <TrailShell
        eventName={eventName ?? "Your passport"}
        primaryColor={PRIMARY}
        accentColor={ACCENT}
        paletteKey={paletteKey}
        backgroundKey={backgroundKey}
        showBottomNav={false}
        topLeft={
          <span
            className="font-trail-serif text-base font-semibold"
            style={{ color: PRIMARY }}
          >
            {eventName ?? "Your passport"}
          </span>
        }
      >
      <div className="mx-auto w-full max-w-md">
        <div className="mb-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--event-primary,#1F3D2B)]/80 hover:text-[var(--event-primary,#1F3D2B)]"
          >
            <span aria-hidden>←</span> Back to {eventName ?? "trail"}
          </Link>
        </div>
        <div className="text-center">
          <div
            className="text-[10px] font-medium uppercase tracking-[0.32em]"
            style={{ color: ACCENT }}
          >
            My Passport
          </div>
          <h1
            className="font-trail-serif mt-1 text-3xl font-semibold"
            style={{ color: PRIMARY }}
          >
            {eventName ?? "Trail passport"}
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
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

        {/* Rewards */}
        <RewardsSection
          stampedCount={stampedCount}
          totalVenues={totalVenues}
          labelSingular={labelSingular}
          labelPlural={labelPlural}
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

      </div>
    </TrailShell>
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
  stampedCount,
  totalVenues,
  labelSingular,
  labelPlural,
}: {
  stampedCount: number;
  totalVenues: number;
  labelSingular: string;
  labelPlural: string;
}) {
  const summary = computeDefaultRewardTiers(stampedCount, totalVenues);
  const unit = (n: number) =>
    n === 1 ? labelSingular.toLowerCase() : labelPlural.toLowerCase();

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h2
          className="font-trail-serif text-lg font-semibold"
          style={{ color: PRIMARY }}
        >
          Rewards
        </h2>
        <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
          Default tiers
        </span>
      </div>

      <ul className="space-y-2">
        {summary.tiers.map((tier) => (
          <RewardTierRow
            key={tier.key}
            tier={tier}
            unit={unit(tier.threshold)}
            stampedCount={stampedCount}
          />
        ))}

        {/* Major prize draw placeholder — surfaced once admin reward editor ships */}
        <li className="rounded-2xl border border-dashed border-[#C9A24A]/50 bg-[var(--event-card-bg,#FBF5E8)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div
                className="font-trail-serif text-sm font-semibold"
                style={{ color: PRIMARY }}
              >
                Major prize draw
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--event-muted,#8A7E66)]">
                Coming soon — eligibility rules will be set by the event organiser.
              </div>
            </div>
            <span
              className="inline-flex h-7 items-center rounded-full border px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{ borderColor: `${ACCENT}55`, color: ACCENT }}
            >
              TBA
            </span>
          </div>
        </li>
      </ul>

      <p className="mt-2 text-[11px] text-[var(--event-muted,#8A7E66)]">
        Default event rewards shown until the organiser publishes custom tiers.
      </p>
    </section>
  );
}

function RewardTierRow({
  tier,
  unit,
  stampedCount,
}: {
  tier: RewardTier;
  unit: string;
  stampedCount: number;
}) {
  const pct = Math.round(tier.progress * 100);
  const remaining = Math.max(0, tier.threshold - stampedCount);
  return (
    <li
      className={`rounded-2xl border p-4 shadow-sm ${
        tier.unlocked
          ? "border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)]"
          : "border-dashed border-[var(--event-border,#E6DCC7)] bg-[var(--event-page-bg,#F6EFE2)]/60"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div
            className="font-trail-serif text-sm font-semibold"
            style={{ color: tier.unlocked ? PRIMARY : "var(--event-muted,#8A7E66)" }}
          >
            {tier.label} · Visit {tier.threshold} {unit}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--event-muted,#8A7E66)]">
            {tier.unlocked
              ? "Unlocked"
              : remaining === 1
                ? `1 more ${unit.replace(/s$/, "")} to unlock`
                : `${remaining} more to unlock`}
          </div>
        </div>
        <span
          className="inline-flex h-7 items-center rounded-full px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={
            tier.unlocked
              ? { backgroundColor: PRIMARY, color: "var(--event-page-bg,#F6EFE2)" }
              : { border: `1px solid ${ACCENT}55`, color: ACCENT }
          }
        >
          {tier.unlocked ? "✓ Unlocked" : "Locked"}
        </span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--event-border,#E6DCC7)]">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: tier.unlocked ? PRIMARY : ACCENT,
          }}
        />
      </div>
    </li>
  );
}

