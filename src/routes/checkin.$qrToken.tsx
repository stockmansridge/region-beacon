import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TrailShell } from "@/components/trail-shell";
import { PoweredByGetStampd } from "@/components/brand";

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
  created_at?: string;
};

type Outcome =
  | { kind: "loading" }
  | { kind: "no_passport" }
  | { kind: "stamped"; venueName: string | null; passportToken: string; isNew: boolean }
  | { kind: "qr_invalid" }
  | { kind: "event_not_live" }
  | { kind: "mismatch" }
  | { kind: "rate_limited" }
  | { kind: "error" };

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
  // Most recent first
  out.sort(
    (a, b) =>
      Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? "") || 0,
  );
  return out;
}

function classifyError(msg: string): Outcome["kind"] {
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
      const passports = readPassportsFromStorage();
      if (passports.length === 0) {
        if (!cancelled) setOutcome({ kind: "no_passport" });
        return;
      }

      // Try most-recent first; on mismatch, walk through other passports.
      let lastNonMismatch: Outcome | null = null;
      for (const p of passports) {
        const token = p.access_token!;
        const { data, error } = await supabase.rpc("redeem_checkin", {
          _qr_token: qrToken,
          _passport_token: token,
        });
        if (cancelled) return;

        if (error) {
          const kind = classifyError(error.message ?? "");
          if (kind === "mismatch") {
            // try next stored passport
            continue;
          }
          lastNonMismatch = { kind } as Outcome;
          break;
        }

        const row = (data?.[0] ?? null) as
          | { checkin_id: string; venue_id: string; passport_id: string; is_new: boolean }
          | null;
        if (!row) {
          lastNonMismatch = { kind: "error" };
          break;
        }

        // Best-effort venue name lookup. Anon may not read venues; fail soft.
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
        setOutcome(lastNonMismatch ?? { kind: "mismatch" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qrToken]);

  return <CheckinView outcome={outcome} />;
}

function CheckinView({ outcome }: { outcome: Outcome }) {
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
            style={{
              background: `linear-gradient(160deg, ${PRIMARY} 0%, #14271C 100%)`,
            }}
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

  // Error-ish states share the same card layout.
  const copy: Record<
    Exclude<Outcome["kind"], "loading" | "stamped">,
    { title: string; body: string }
  > = {
    no_passport: {
      title: "Passport required",
      body: "You need to join the event and create your passport before you can collect stamps. Open your event's page to register.",
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] px-6">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[#1F3D2B]/10" />
        <h1 className="font-trail-serif text-2xl font-semibold text-[#1F3D2B]">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#3D372C]">{body}</p>

        <div className="mt-6 flex flex-col gap-2">
          <a
            href="/passport"
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#1F3D2B] text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
          >
            Open my passport
          </a>
          <a
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-[#1F3D2B]/30 bg-transparent text-sm font-semibold tracking-wide text-[#1F3D2B]"
          >
            Back to home
          </a>
        </div>

        <div className="mt-6 flex justify-start"><PoweredByGetStampd variant="trail" /></div>
      </div>
    </div>
  );
}
