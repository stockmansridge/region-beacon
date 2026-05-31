import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TrailShell } from "@/components/trail-shell";
import { PoweredByGetStampd } from "@/components/brand";
import { classifyHost } from "@/components/host-router";

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
  passport_attempted: boolean;
  saved_passport_found: boolean;
  return_to_stored: boolean;
  event_resolved: boolean;
  venue_resolved: boolean;
  error: SupabaseLikeError | null;
};

type Outcome =
  | { kind: "loading" }
  | { kind: "no_passport"; subdomain: string | null }
  | { kind: "stamped"; venueName: string | null; passportToken: string; isNew: boolean }
  | { kind: "qr_invalid"; diag: FailureDiagnostics }
  | { kind: "event_not_live"; diag: FailureDiagnostics }
  | { kind: "mismatch"; diag: FailureDiagnostics }
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

function readPassportsFromStorage(): StoredPassport[] {
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
        if (parsed?.access_token) out.push(parsed);
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

function classifyError(msg: string): Exclude<Outcome["kind"], "loading" | "stamped" | "no_passport"> {
  const m = msg.toLowerCase();
  if (m.includes("qr_invalid")) return "qr_invalid";
  if (m.includes("event_not_available")) return "event_not_live";
  if (m.includes("passport_event_mismatch")) return "mismatch";
  if (m.includes("passport_not_found")) return "mismatch";
  if (m.includes("rate_limited")) return "rate_limited";
  return "error";
}

function CheckinPage() {
  const { qrToken } = Route.useParams();
  const [outcome, setOutcome] = useState<Outcome>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const subdomain = getSubdomain();
      const passports = readPassportsFromStorage();
      let returnToStored = false;

      if (passports.length === 0) {
        try {
          if (typeof sessionStorage !== "undefined" && typeof window !== "undefined") {
            sessionStorage.setItem("gs.returnTo.pending", window.location.pathname);
            if (subdomain) {
              sessionStorage.setItem(`gs.returnTo.sub.${subdomain}`, window.location.pathname);
            }
            returnToStored = true;
          }
        } catch {
          // ignore
        }
        void returnToStored; // captured into no_passport via UI message
        if (!cancelled) setOutcome({ kind: "no_passport", subdomain });
        return;
      }

      let lastNonMismatch: Outcome | null = null;
      let lastError: SupabaseLikeError | null = null;
      for (const p of passports) {
        const token = p.access_token!;
        const { data, error } = await supabase.rpc("redeem_checkin", {
          _qr_token: qrToken,
          _passport_token: token,
        });
        if (cancelled) return;

        if (error) {
          const kind = classifyError(error.message ?? "");
          lastError = {
            message: error.message ?? null,
            code: (error as { code?: string }).code ?? null,
            details: (error as { details?: string }).details ?? null,
            hint: (error as { hint?: string }).hint ?? null,
          };
          if (kind === "mismatch") {
            continue;
          }
          const diag: FailureDiagnostics = {
            stage: "redeem_checkin_error",
            rpc: "redeem_checkin",
            passport_attempted: true,
            saved_passport_found: true,
            return_to_stored: false,
            event_resolved: false,
            venue_resolved: false,
            error: lastError,
          };
          lastNonMismatch = { kind, diag } as Outcome;
          break;
        }

        const row = (data?.[0] ?? null) as
          | { checkin_id: string; venue_id: string; passport_id: string; is_new: boolean }
          | null;
        if (!row) {
          lastNonMismatch = {
            kind: "error",
            diag: {
              stage: "redeem_checkin_empty",
              rpc: "redeem_checkin",
              passport_attempted: true,
              saved_passport_found: true,
              return_to_stored: false,
              event_resolved: false,
              venue_resolved: false,
              error: null,
            },
          };
          break;
        }

        let venueName: string | null = null;
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

        if (!cancelled) {
          setOutcome({
            kind: "stamped",
            venueName,
            passportToken: token,
            isNew: !!row.is_new,
          });
        }
        return;
      }

      if (!cancelled) {
        const fallbackDiag: FailureDiagnostics = {
          stage: "all_passports_mismatched",
          rpc: "redeem_checkin",
          passport_attempted: true,
          saved_passport_found: passports.length > 0,
          return_to_stored: false,
          event_resolved: false,
          venue_resolved: false,
          error: lastError,
        };
        setOutcome(lastNonMismatch ?? { kind: "mismatch", diag: fallbackDiag });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qrToken]);

  return <CheckinView outcome={outcome} qrToken={qrToken} />;
}

function CheckinView({ outcome, qrToken }: { outcome: Outcome; qrToken: string }) {
  if (outcome.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] text-sm text-[#8A7E66]">
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
        showBottomNav={false}
      >
        <section className="relative overflow-hidden rounded-[28px] shadow-[0_24px_60px_-30px_rgba(31,61,43,0.45)]">
          <div
            className="relative h-[420px] w-full"
            style={{ background: `linear-gradient(160deg, ${PRIMARY} 0%, #14271C 100%)` }}
          >
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-10 text-center text-[#F6EFE2]">
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
                <p className="mt-1 text-base text-[#F6EFE2]/90">{outcome.venueName}</p>
              )}
            </div>
          </div>
        </section>

        <div className="mt-5 space-y-2.5">
          <Link
            to="/passport/$token"
            params={{ token: outcome.passportToken }}
            className="flex h-12 w-full items-center justify-center rounded-full text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
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
  const subdomain = outcome.kind === "no_passport" ? outcome.subdomain : getSubdomain();
  const diag = outcome.kind === "no_passport" ? null : outcome.diag;

  const copy: Record<Exclude<Outcome["kind"], "loading" | "stamped">, { title: string; body: string }> = {
    no_passport: {
      title: "Passport required",
      body: "You need to join this event before you can collect stamps. Tap below to register — we'll bring you back here to collect this stamp.",
    },
    qr_invalid: {
      title: "This QR code is not valid",
      body: "The code you scanned isn't recognised. Ask the venue host to check their printed QR.",
    },
    event_not_live: {
      title: "This event isn't accepting check-ins yet",
      body: "The organiser hasn't opened check-ins for this event. Try again once the event is live.",
    },
    mismatch: {
      title: "This passport doesn't match this event",
      body: "The passport on this device was issued for a different event. Open the correct event link and register if you haven't yet.",
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
      stage: diag?.stage ?? "no_passport_on_device",
      rpc: diag?.rpc ?? null,
      qr_token_length: qrFp.length,
      qr_token_first4: qrFp.first4,
      qr_token_last4: qrFp.last4,
      saved_passport_found: diag?.saved_passport_found ?? false,
      passport_attempted: diag?.passport_attempted ?? false,
      return_to_stored: outcome.kind === "no_passport",
      event_resolved: diag?.event_resolved ?? false,
      venue_resolved: diag?.venue_resolved ?? false,
      error_code: diag?.error?.code ?? null,
      error_message: diag?.error?.message ?? null,
      error_details: diag?.error?.details ?? null,
      error_hint: diag?.error?.hint ?? null,
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] px-6 py-10">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[#1F3D2B]/10" />
        <h1 className="font-trail-serif text-2xl font-semibold text-[#1F3D2B]">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#3D372C]">{body}</p>

        <div className="mt-6 flex flex-col gap-2">
          {outcome.kind === "no_passport" ? (
            <a
              href={joinHref}
              className="inline-flex h-11 items-center justify-center rounded-full bg-[#1F3D2B] text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
            >
              Register & collect this stamp
            </a>
          ) : (
            <a
              href="/passport"
              className="inline-flex h-11 items-center justify-center rounded-full bg-[#1F3D2B] text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
            >
              Open my passport
            </a>
          )}
          <a
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-[#1F3D2B]/30 bg-transparent text-sm font-semibold tracking-wide text-[#1F3D2B]"
          >
            Back to home
          </a>
          <button
            type="button"
            onClick={copySupport}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#1F3D2B]/20 bg-transparent text-xs font-medium tracking-wide text-[#3D372C] hover:bg-[#1F3D2B]/5"
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
