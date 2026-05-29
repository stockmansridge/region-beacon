import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrailShell } from "@/components/trail-shell";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";
import {
  DEFAULT_VENUE_LABEL_PLURAL,
  DEFAULT_VENUE_LABEL_SINGULAR,
} from "@/lib/venue-labels";
import { computeDefaultRewardTiers, type RewardTier } from "@/lib/passport-rewards";

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

type StampRow = {
  passport_id: string;
  event_id: string | null;
  event_name: string | null;
  venue_label_singular: string | null;
  venue_label_plural: string | null;
  total_venues: number | null;
  stamped_count: number | null;
  venue_id: string;
  venue_name: string | null;
  venue_logo_path: string | null;
  venue_cover_path: string | null;
  order_index: number | null;
  is_stamped: boolean | null;
  checked_in_at: string | null;
};

type StampsSummary = {
  eventName: string | null;
  labelSingular: string;
  labelPlural: string;
  totalVenues: number;
  stampedCount: number;
  venues: StampRow[];
};

type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | {
      kind: "ready";
      passport: PassportRow;
      eventName: string | null;
      stamps: StampsSummary | null;
    };

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";

function PassportPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });

      const [passportRes, stampsRes] = await Promise.all([
        supabase.rpc("get_passport_by_token", { _raw_token: token }),
        // New RPC — may not exist yet on staging. Failures are non-fatal.
        supabase.rpc("get_passport_stamps_by_token" as never, {
          _raw_token: token,
        } as never),
      ]);

      if (cancelled) return;

      const row = (passportRes.data?.[0] ?? null) as PassportRow | null;
      if (passportRes.error || !row?.passport_id) {
        setState({ kind: "not_found" });
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

      let stamps: StampsSummary | null = null;
      const stampRows = ((stampsRes as { data?: StampRow[] | null }).data ??
        null) as StampRow[] | null;
      if (!(stampsRes as { error?: unknown }).error && stampRows && stampRows.length > 0) {
        const first = stampRows[0];
        stamps = {
          eventName: first.event_name,
          labelSingular:
            first.venue_label_singular?.trim() || DEFAULT_VENUE_LABEL_SINGULAR,
          labelPlural:
            first.venue_label_plural?.trim() || DEFAULT_VENUE_LABEL_PLURAL,
          totalVenues: first.total_venues ?? stampRows.length,
          stampedCount:
            first.stamped_count ??
            stampRows.filter((s) => s.is_stamped).length,
          venues: stampRows,
        };
      }

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
      <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] text-sm text-[#8A7E66]">
        Loading your passport…
      </div>
    );
  }

  if (state.kind === "not_found") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] px-6">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[#1F3D2B]/10" />
          <h1 className="font-trail-serif text-2xl font-semibold text-[#1F3D2B]">
            Passport link not found or replaced
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#3D372C]">
            This passport link is no longer valid. If you re-registered, use
            the newest link. Otherwise, re-register at the event page.
          </p>
          <a
            href="/"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[#1F3D2B] px-6 text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
          >
            Go home
          </a>
        </div>
      </div>
    );
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

function PassportView({
  passport,
  eventName,
  stamps,
  token,
}: {
  passport: PassportRow;
  eventName: string | null;
  stamps: StampsSummary | null;
  token: string;
}) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const passportUrl = `${origin}/passport/${token}`;

  const labelSingular = stamps?.labelSingular ?? DEFAULT_VENUE_LABEL_SINGULAR;
  const labelPlural = stamps?.labelPlural ?? DEFAULT_VENUE_LABEL_PLURAL;

  // Prefer the authoritative stamps RPC counts; fall back to passport.checkin_count.
  const stampedCount =
    stamps?.stampedCount ?? passport.checkin_count ?? 0;
  const totalVenues = stamps?.totalVenues ?? 0;
  const goal = totalVenues > 0 ? totalVenues : Math.max(stampedCount, 1);
  const pct = Math.min(100, Math.round((stampedCount / goal) * 100));

  const stampedVenues = (stamps?.venues ?? []).filter((v) => v.is_stamped);
  const remainingVenues = (stamps?.venues ?? []).filter((v) => !v.is_stamped);

  async function copy() {
    try {
      await navigator.clipboard.writeText(passportUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const statusLabel = (passport.status ?? "active").replace(/_/g, " ");
  const greetingName =
    passport.first_name?.trim() ||
    passport.full_name?.trim() ||
    "Visitor";

  return (
    <TrailShell
      eventName={eventName ?? "Your passport"}
      primaryColor={PRIMARY}
      accentColor={ACCENT}
      showBottomNav={false}
    >
      <div className="mx-auto w-full max-w-md">
        <div className="text-center">
          <div
            className="text-[10px] font-medium uppercase tracking-[0.32em]"
            style={{ color: ACCENT }}
          >
            Your passport
          </div>
          <h1
            className="font-trail-serif mt-1 text-3xl font-semibold"
            style={{ color: PRIMARY }}
          >
            {eventName ?? "Trail passport"}
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-[#8A7E66]">
            Hi {greetingName} · No app download required
          </p>
        </div>

        {/* Progress card */}
        <section className="mt-5 rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 text-center shadow-sm">
          <div className="relative mx-auto h-32 w-32">
            <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#E6DCC7" strokeWidth="10" />
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
                  <span className="text-base text-[#8A7E66]">/{totalVenues}</span>
                ) : null}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8A7E66]">
                stamps
              </div>
            </div>
          </div>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#E6DCC7] bg-[#F6EFE2] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#3D372C]">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor:
                  passport.status === "completed" ? PRIMARY : ACCENT,
              }}
            />
            Status · {statusLabel}
          </div>
        </section>

        {/* Rewards */}
        <RewardsSection
          stampedCount={stampedCount}
          totalVenues={totalVenues}
          labelSingular={labelSingular}
          labelPlural={labelPlural}
        />

        {/* Visitor details */}
        <section className="mt-5 rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-5 shadow-sm">
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8A7E66]">
            Passport holder
          </div>
          <div
            className="mt-1 font-trail-serif text-lg font-semibold"
            style={{ color: PRIMARY }}
          >
            {passport.full_name ?? "Visitor"}
          </div>
          {passport.email && (
            <div className="mt-0.5 text-sm text-[#3D372C]/80 break-all">
              {passport.email}
            </div>
          )}
        </section>

        {/* Stamped venues */}
        <section className="mt-5">
          <div className="mb-2 flex items-baseline justify-between">
            <h2
              className="font-trail-serif text-lg font-semibold"
              style={{ color: PRIMARY }}
            >
              Your stamps
            </h2>
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8A7E66]">
              {stampedCount} stamped
            </span>
          </div>

          {stampedVenues.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#C9A24A]/50 bg-[#FBF5E8] p-6 text-center">
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C9A24A]">
                No stamps yet
              </div>
              <p className="mt-2 text-sm text-[#3D372C]">
                Stamps will appear as you scan {labelPlural.toLowerCase()} QR codes.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {stampedVenues.map((v) => (
                <VenueRow key={v.venue_id} venue={v} primary={PRIMARY} accent={ACCENT} stamped />
              ))}
            </ul>
          )}
        </section>

        {/* Remaining venues */}
        {remainingVenues.length > 0 && (
          <section className="mt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <h2
                className="font-trail-serif text-lg font-semibold"
                style={{ color: PRIMARY }}
              >
                Still to collect
              </h2>
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8A7E66]">
                {remainingVenues.length} remaining
              </span>
            </div>
            <ul className="space-y-2">
              {remainingVenues.map((v) => (
                <VenueRow
                  key={v.venue_id}
                  venue={v}
                  primary={PRIMARY}
                  accent={ACCENT}
                  stamped={false}
                />
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-[#8A7E66]">
              Scan the {labelSingular.toLowerCase()} QR code on arrival to collect a stamp.
            </p>
          </section>
        )}

        {/* Copy link */}
        <section className="mt-5 rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-5 shadow-sm">
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8A7E66]">
            Your private passport link
          </div>
          <div
            className="mt-2 break-all rounded-2xl border border-[#E6DCC7] bg-[#F6EFE2] p-3 font-mono text-xs"
            style={{ color: PRIMARY }}
          >
            {passportUrl}
          </div>
          <button
            type="button"
            onClick={copy}
            className="mt-3 h-11 w-full rounded-full text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
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
        </section>

        <p className="mt-6 text-center text-[11px] uppercase tracking-[0.22em] text-[#8A7E66]">
          Powered by GetStampd
        </p>
      </div>
    </TrailShell>
  );
}

function VenueRow({
  venue,
  primary,
  accent,
  stamped,
}: {
  venue: StampRow;
  primary: string;
  accent: string;
  stamped: boolean;
}) {
  const logoUrl = getVenueAssetPublicUrl(venue.venue_logo_path);
  const coverUrl = getVenueAssetPublicUrl(venue.venue_cover_path);
  const thumb = logoUrl ?? coverUrl;
  const when = venue.checked_in_at
    ? new Date(venue.checked_in_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <li
      className={`flex items-center gap-3 rounded-2xl border p-3 shadow-sm ${
        stamped
          ? "border-[#E6DCC7] bg-[#FBF5E8]"
          : "border-dashed border-[#E6DCC7] bg-[#F6EFE2]/60"
      }`}
    >
      <div
        className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-xl ${
          stamped ? "" : "opacity-60"
        }`}
        style={{ backgroundColor: stamped ? "#F6EFE2" : "#EFE7D2" }}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-trail-serif text-base"
            style={{ color: stamped ? primary : "#8A7E66" }}
          >
            {(venue.venue_name ?? "?").slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`truncate font-trail-serif text-sm font-semibold ${
            stamped ? "" : "text-[#8A7E66]"
          }`}
          style={stamped ? { color: primary } : undefined}
        >
          {venue.venue_name ?? "Venue"}
        </div>
        <div className="text-[11px] text-[#8A7E66]">
          {stamped ? (when ? `Stamped · ${when}` : "Stamped") : "Not yet stamped"}
        </div>
      </div>
      <div
        className="ml-auto inline-flex h-7 items-center rounded-full px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
        style={
          stamped
            ? { backgroundColor: primary, color: "#F6EFE2" }
            : { border: `1px solid ${accent}55`, color: accent }
        }
      >
        {stamped ? "✓ Stamp" : "Locked"}
      </div>
    </li>
  );
}
