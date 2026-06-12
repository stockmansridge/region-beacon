import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TrailShell } from "@/components/trail-shell";
import { PoweredByGetStampd } from "@/components/brand";
import { classifyHost } from "@/components/host-router";
import { useEventBrandingKeys } from "@/lib/use-event-palette";

export const Route = createFileRoute("/checkin/$qrToken")({
  head: () => ({ meta: [{ title: "Check in — GetStampd" }] }),
  component: CheckinPage,
});

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";
const GOLD = "#C9A24A";

type StoredPassport = {
  passport_id?: string;
  access_token?: string;
  event_id?: string;
  subdomain?: string;
  created_at?: string;
};

type SupabaseLikeError = {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

type FailureDiagnostics = {
  stage: string;
  rpc: string | null;
  current_event_id: string | null;
  saved_passport_event_ids: string[];
  saved_passport_count: number;
  localStorage_key_attempted: string | null;
  passport_attempted: boolean;
  return_to_stored: boolean;
  error: SupabaseLikeError | null;
};

type Outcome =
  | { kind: "loading" }
  | {
      kind: "stamped";
      venueName: string | null;
      passportToken: string;
      isNew: boolean;
      pointsAwarded: number;
      pointsAlreadyAwarded: boolean;
      totalPoints: number;
    }
  | { kind: "qr_invalid"; diag: FailureDiagnostics }
  | { kind: "event_not_live"; diag: FailureDiagnostics }
  | {
      kind: "no_passport_for_event";
      diag: FailureDiagnostics;
      subdomain: string | null;
      otherPassports: StoredPassport[];
    }
  | { kind: "rate_limited"; diag: FailureDiagnostics }
  | { kind: "error"; diag: FailureDiagnostics };

function tokenFingerprint(token: string | null | undefined) {
  if (!token) return { length: 0, first4: null as string | null, last4: null as string | null };
  return {
    length: token.length,
    first4: token.slice(0, 4),
    last4: token.slice(-4),
  };
}

function getSubdomain(): string | null {
  if (typeof window === "undefined") return null;
  const host = classifyHost(window.location.hostname);
  return host.kind === "tenant" ? host.subdomain : null;
}

function readAllPassports(): StoredPassport[] {
  if (typeof localStorage === "undefined") return [];
  const out: StoredPassport[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("gs.passport.")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as StoredPassport;
        if (parsed?.access_token) {
          // event_id might be missing on older entries — derive from key
          if (!parsed.event_id) parsed.event_id = key.slice("gs.passport.".length);
          out.push(parsed);
        }
      } catch {
        // skip
      }
    }
  } catch {
    return [];
  }
  out.sort(
    (a, b) =>
      Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? "") || 0,
  );
  return out;
}

function readPassportForEvent(eventId: string): StoredPassport | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`gs.passport.${eventId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPassport;
    if (!parsed?.access_token) return null;
    if (!parsed.event_id) parsed.event_id = eventId;
    return parsed;
  } catch {
    return null;
  }
}

function storeReturnTo(eventId: string | null) {
  if (typeof sessionStorage === "undefined" || typeof window === "undefined") return;
  try {
    const path = window.location.pathname;
    sessionStorage.setItem("gs.returnTo.pending", path);
    if (eventId) sessionStorage.setItem(`gs.returnTo.${eventId}`, path);
    const sub = getSubdomain();
    if (sub) sessionStorage.setItem(`gs.returnTo.sub.${sub}`, path);
  } catch {
    // ignore
  }
}

function classifyError(msg: string): Exclude<Outcome["kind"], "loading" | "stamped" | "no_passport_for_event"> {
  const m = msg.toLowerCase();
  if (m.includes("qr_invalid")) return "qr_invalid";
  if (m.includes("event_not_available")) return "event_not_live";
  if (m.includes("rate_limited")) return "rate_limited";
  return "error";
}

async function resolveCurrentEventId(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const { data } = await supabase.rpc("resolve_event_by_host", {
      _hostname: window.location.hostname,
    });
    const row = Array.isArray(data) ? data[0] : data;
    return (row as { event_id?: string } | null)?.event_id ?? null;
  } catch {
    return null;
  }
}

function CheckinPage() {
  const { qrToken } = Route.useParams();
  const [outcome, setOutcome] = useState<Outcome>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const subdomain = getSubdomain();
      const currentEventId = await resolveCurrentEventId();
      if (cancelled) return;

      const allPassports = readAllPassports();
      const matchingPassport = currentEventId
        ? readPassportForEvent(currentEventId)
        : null;

      const baseDiag = (extra: Partial<FailureDiagnostics> = {}): FailureDiagnostics => ({
        stage: extra.stage ?? "redeem_checkin_error",
        rpc: extra.rpc ?? "redeem_checkin",
        current_event_id: currentEventId,
        saved_passport_event_ids: allPassports
          .map((p) => p.event_id)
          .filter((x): x is string => !!x),
        saved_passport_count: allPassports.length,
        localStorage_key_attempted: currentEventId ? `gs.passport.${currentEventId}` : null,
        passport_attempted: !!matchingPassport,
        return_to_stored: false,
        error: null,
        ...extra,
      });

      // No passport for the current event → don't try other passports.
      if (!matchingPassport) {
        storeReturnTo(currentEventId);
        const otherPassports = allPassports.filter(
          (p) => !currentEventId || p.event_id !== currentEventId,
        );
        if (!cancelled) {
          setOutcome({
            kind: "no_passport_for_event",
            subdomain,
            otherPassports,
            diag: baseDiag({
              stage: currentEventId
                ? allPassports.length > 0
                  ? "passport_event_mismatch"
                  : "no_passport_on_device"
                : "current_event_unresolved",
              rpc: null,
              return_to_stored: true,
            }),
          });
        }
        return;
      }

      // Try the matching passport only.
      const token = matchingPassport.access_token!;
      const { data, error } = await supabase.rpc("redeem_checkin", {
        _qr_token: qrToken,
        _passport_token: token,
      });
      if (cancelled) return;

      if (error) {
        const kind = classifyError(error.message ?? "");
        const supaErr: SupabaseLikeError = {
          message: error.message ?? null,
          code: (error as { code?: string }).code ?? null,
          details: (error as { details?: string }).details ?? null,
          hint: (error as { hint?: string }).hint ?? null,
        };
        // passport_event_mismatch shouldn't happen now (we picked matching passport)
        // but handle defensively as "no passport for event".
        if ((error.message ?? "").toLowerCase().includes("passport_event_mismatch") ||
            (error.message ?? "").toLowerCase().includes("passport_not_found")) {
          // Saved passport is stale/replaced — clear only this event's entry
          // so the visitor can register fresh. Other events' passports remain.
          if (currentEventId) {
            try {
              localStorage.removeItem(`gs.passport.${currentEventId}`);
            } catch {
              // ignore
            }
          }
          storeReturnTo(currentEventId);
          const remaining = allPassports.filter(
            (p) => !currentEventId || p.event_id !== currentEventId,
          );
          setOutcome({
            kind: "no_passport_for_event",
            subdomain,
            otherPassports: remaining,
            diag: baseDiag({
              stage: "passport_stale_cleared",
              return_to_stored: true,
              passport_attempted: true,
              error: supaErr,
            }),
          });
          return;
        }
        setOutcome({
          kind,
          diag: baseDiag({
            stage: "redeem_checkin_error",
            passport_attempted: true,
            error: supaErr,
          }),
        } as Outcome);
        return;
      }

      const row = (data?.[0] ?? null) as
        | {
            checkin_id: string;
            venue_id: string;
            passport_id: string;
            is_new: boolean;
            venue_name?: string | null;
            points_awarded?: number | null;
            already_checked_in?: boolean | null;
          }
        | null;
      if (!row) {
        setOutcome({
          kind: "error",
          diag: baseDiag({ stage: "redeem_checkin_empty", passport_attempted: true }),
        });
        return;
      }

      let venueName: string | null = row.venue_name ?? null;
      if (!venueName) {
        try {
          const { data: v } = await supabase
            .from("venues")
            .select("name")
            .eq("id", row.venue_id)
            .maybeSingle();
          venueName = (v as { name: string | null } | null)?.name ?? null;
        } catch {
          venueName = null;
        }
      }

      if (!cancelled) {
        setOutcome({
          kind: "stamped",
          venueName,
          passportToken: token,
          isNew: !!row.is_new,
          pointsAwarded: row.points_awarded ?? 0,
          pointsAlreadyAwarded: !!row.already_checked_in,
          totalPoints: 0,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qrToken]);

  return <CheckinView outcome={outcome} qrToken={qrToken} />;
}

function CheckinView({ outcome, qrToken }: { outcome: Outcome; qrToken: string }) {
  const subdomain = getSubdomain();
  const { paletteKey, backgroundKey } = useEventBrandingKeys(subdomain);
  if (outcome.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--event-page-bg,#F6EFE2)] text-sm text-[var(--event-muted,#8A7E66)]">
        Recording your stamp…
      </div>
    );
  }

  if (outcome.kind === "stamped") {
    const title = outcome.isNew ? "You're checked in" : "Already stamped";
    const kicker = outcome.isNew ? "Stamp Collected" : "Already Collected";
    return (
      <TrailShell
        eventName="GetStampd"
        primaryColor={PRIMARY}
        accentColor={ACCENT}
        paletteKey={paletteKey}
        backgroundKey={backgroundKey}
        showBottomNav={false}
      >
        <section className="relative overflow-hidden rounded-[28px] shadow-[0_24px_60px_-30px_rgba(31,61,43,0.45)]">
          <div
            className="relative h-[420px] w-full"
            style={{ background: `linear-gradient(160deg, ${PRIMARY} 0%, #14271C 100%)` }}
          >
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-10 text-center text-[var(--event-page-bg,#F6EFE2)]">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-full border-2"
                style={{
                  borderColor: GOLD,
                  backgroundColor: `${PRIMARY}E6`,
                  boxShadow: `0 0 0 6px ${GOLD}22`,
                }}
              >
                <Check className="h-9 w-9" style={{ color: GOLD }} />
              </div>
              <div
                className="mt-5 text-[10px] font-semibold uppercase tracking-[0.32em]"
                style={{ color: GOLD }}
              >
                {kicker}
              </div>
              <h1 className="font-trail-serif mt-2 text-[34px] font-semibold leading-tight">
                {title}
              </h1>
              {outcome.venueName && (
                <p className="mt-1 text-base text-[var(--event-page-bg,#F6EFE2)]/90">{outcome.venueName}</p>
              )}
              {outcome.isNew && outcome.pointsAwarded > 0 ? (
                <p className="mt-3 text-sm text-[var(--event-page-bg,#F6EFE2)]/85">
                  You earned {outcome.pointsAwarded} points.
                </p>
              ) : !outcome.isNew ? (
                <p className="mt-3 text-sm text-[var(--event-page-bg,#F6EFE2)]/85">
                  This venue is already in your passport. Your points total has not changed.
                </p>
              ) : null}
              {outcome.totalPoints > 0 && (
                <p className="mt-2 text-sm font-semibold" style={{ color: GOLD }}>
                  Your total points: {outcome.totalPoints}
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="mt-5 space-y-2.5">
          <Link
            to="/passport/$token"
            params={{ token: outcome.passportToken }}
            className="flex h-12 w-full items-center justify-center rounded-full text-sm font-semibold tracking-wide text-[var(--event-page-bg,#F6EFE2)] shadow"
            style={{ backgroundColor: PRIMARY }}
          >
            View my passport
          </Link>
        </div>
      </TrailShell>
    );
  }

  return <CheckinFailureCard outcome={outcome} qrToken={qrToken} />;
}

function CheckinFailureCard({
  outcome,
  qrToken,
}: {
  outcome: Exclude<Outcome, { kind: "loading" } | { kind: "stamped" }>;
  qrToken: string;
}) {
  const subdomain =
    outcome.kind === "no_passport_for_event" ? outcome.subdomain : getSubdomain();
  const diag = outcome.diag;
  const otherPassports =
    outcome.kind === "no_passport_for_event" ? outcome.otherPassports : [];

  const copy: Record<
    Exclude<Outcome["kind"], "loading" | "stamped">,
    { title: string; body: string }
  > = {
    no_passport_for_event: {
      title:
        diag.saved_passport_count > 0
          ? "You need a passport for this trail"
          : "Passport required",
      body:
        diag.saved_passport_count > 0
          ? "Your saved passport is for a different trail. Create one for this trail to collect this stamp — we'll bring you straight back here."
          : "You need to join this trail before you can collect stamps. Tap below to register — we'll bring you back here to collect this stamp.",
    },
    qr_invalid: {
      title: "This QR code is not valid",
      body: "The code you scanned isn't recognised. Ask the venue host to check their printed QR.",
    },
    event_not_live: {
      title: "This event isn't accepting check-ins yet",
      body: "The organiser hasn't opened check-ins for this event. Try again once the event is live.",
    },
    rate_limited: {
      title: "Slow down a moment",
      body: "You've just collected a stamp. Please wait a few seconds before scanning again.",
    },
    error: {
      title: "Something went wrong",
      body: "We couldn't record your stamp. Please try again, or ask the venue host for help.",
    },
  };
  const { title, body } = copy[outcome.kind];

  const supportReport = useMemo(() => {
    const qrFp = tokenFingerprint(qrToken);
    const report = {
      timestamp: new Date().toISOString(),
      page_url: typeof window !== "undefined" ? window.location.href : null,
      route: "/checkin/$qrToken",
      public_subdomain: subdomain,
      stage: diag.stage,
      rpc: diag.rpc,
      qr_token_length: qrFp.length,
      qr_token_first4: qrFp.first4,
      qr_token_last4: qrFp.last4,
      current_event_id: diag.current_event_id,
      saved_passport_count: diag.saved_passport_count,
      saved_passport_event_ids: diag.saved_passport_event_ids,
      localStorage_key_attempted: diag.localStorage_key_attempted,
      passport_attempted: diag.passport_attempted,
      return_to_stored: diag.return_to_stored,
      error_code: diag.error?.code ?? null,
      error_message: diag.error?.message ?? null,
      error_details: diag.error?.details ?? null,
      error_hint: diag.error?.hint ?? null,
      outcome_kind: outcome.kind,
    };
    return JSON.stringify(report, null, 2);
  }, [qrToken, subdomain, diag, outcome.kind]);

  const [copied, setCopied] = useState(false);
  async function copySupport() {
    try {
      await navigator.clipboard.writeText(supportReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const joinHref = subdomain ? "/join" : "/";
  const otherPassportToken =
    otherPassports.length > 0 ? otherPassports[0].access_token! : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--event-page-bg,#F6EFE2)] px-6 py-10">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[var(--event-primary,#1F3D2B)]/10" />
        <h1 className="font-trail-serif text-2xl font-semibold text-[var(--event-primary,#1F3D2B)]">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--event-body,#3D372C)]">{body}</p>

        <div className="mt-6 flex flex-col gap-2">
          {outcome.kind === "no_passport_for_event" ? (
            <>
              <a
                href={joinHref}
                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--event-primary,#1F3D2B)] text-sm font-semibold tracking-wide text-[var(--event-page-bg,#F6EFE2)] shadow"
              >
                Create passport for this trail
              </a>
              <a
                href="/"
                className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--event-primary,#1F3D2B)]/30 bg-transparent text-sm font-semibold tracking-wide text-[var(--event-primary,#1F3D2B)]"
              >
                Back to trail home
              </a>
              {otherPassportToken && (
                <Link
                  to="/passport/$token"
                  params={{ token: otherPassportToken }}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-transparent text-xs font-medium tracking-wide text-[var(--event-body,#3D372C)] underline underline-offset-2"
                >
                  Open saved passport from another trail
                </Link>
              )}
            </>
          ) : (
            <>
              <a
                href="/passport"
                className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--event-primary,#1F3D2B)] text-sm font-semibold tracking-wide text-[var(--event-page-bg,#F6EFE2)] shadow"
              >
                Open my passport
              </a>
              <a
                href="/"
                className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--event-primary,#1F3D2B)]/30 bg-transparent text-sm font-semibold tracking-wide text-[var(--event-primary,#1F3D2B)]"
              >
                Back to home
              </a>
            </>
          )}
          <button
            type="button"
            onClick={copySupport}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--event-primary,#1F3D2B)]/20 bg-transparent text-xs font-medium tracking-wide text-[var(--event-body,#3D372C)] hover:bg-[var(--event-primary,#1F3D2B)]/5"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied support details" : "Copy support details"}
          </button>
        </div>

        <div className="mt-6 flex justify-start">
          <PoweredByGetStampd variant="trail" />
        </div>
      </div>
    </div>
  );
}
