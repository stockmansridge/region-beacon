import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { classifyHost } from "@/components/host-router";
import { useEventBrandingKeys } from "@/lib/use-event-palette";

export const Route = createFileRoute("/collect/bonus/$token")({
  head: () => ({ meta: [{ title: "Bonus points — GetStampd" }] }),
  component: BonusClaimPage,
});

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";
const GOLD = "#C9A24A";

type StoredPassport = {
  passport_id?: string;
  access_token?: string;
  event_id?: string;
};

type ClaimRow = {
  success: boolean;
  already_collected: boolean;
  event_id: string | null;
  bonus_code_id: string | null;
  bonus_code_name: string | null;
  points_awarded: number;
  total_points: number;
  venue_points: number;
  bonus_points: number;
  message: string | null;
};

type Outcome =
  | { kind: "loading" }
  | { kind: "claimed"; row: ClaimRow; passportToken: string }
  | { kind: "already"; row: ClaimRow; passportToken: string }
  | { kind: "no_passport"; subdomain: string | null }
  | { kind: "inactive"; message: string }
  | { kind: "not_found" }
  | { kind: "event_not_live"; message: string }
  | { kind: "error"; message: string };

function getSubdomain(): string | null {
  if (typeof window === "undefined") return null;
  const host = classifyHost(window.location.hostname);
  return host.kind === "tenant" ? host.subdomain : null;
}

function readPassportForEvent(eventId: string): StoredPassport | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`gs.passport.${eventId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPassport;
    if (!parsed?.access_token) return null;
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

function BonusClaimPage() {
  const { token } = Route.useParams();
  const [outcome, setOutcome] = useState<Outcome>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const subdomain = getSubdomain();
      const currentEventId = await resolveCurrentEventId();
      if (cancelled) return;

      const passport = currentEventId ? readPassportForEvent(currentEventId) : null;
      if (!passport?.access_token) {
        storeReturnTo(currentEventId);
        if (!cancelled) setOutcome({ kind: "no_passport", subdomain });
        return;
      }

      const { data, error } = await supabase.rpc("claim_bonus_code", {
        _token: token,
        _passport_token: passport.access_token,
      });
      if (cancelled) return;

      if (error) {
        setOutcome({ kind: "error", message: error.message ?? "Something went wrong." });
        return;
      }

      const row = (Array.isArray(data) ? data[0] : data) as ClaimRow | null;
      if (!row) {
        setOutcome({ kind: "error", message: "Empty response from server." });
        return;
      }

      if (!row.success) {
        const msg = row.message ?? "We couldn't claim this bonus code.";
        const lower = msg.toLowerCase();
        if (lower.includes("not found") && lower.includes("passport")) {
          // Stale or invalid passport token in localStorage — treat as no passport.
          storeReturnTo(currentEventId);
          setOutcome({ kind: "no_passport", subdomain });
        } else if (lower.includes("not found")) {
          setOutcome({ kind: "not_found" });
        } else if (lower.includes("not currently live") || lower.includes("not live")) {
          setOutcome({ kind: "event_not_live", message: msg });
        } else if (lower.includes("no longer active") || lower.includes("inactive")) {
          setOutcome({ kind: "inactive", message: msg });
        } else {
          setOutcome({ kind: "error", message: msg });
        }
        return;
      }

      if (row.already_collected) {
        setOutcome({ kind: "already", row, passportToken: passport.access_token });
      } else {
        setOutcome({ kind: "claimed", row, passportToken: passport.access_token });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return <BonusView outcome={outcome} />;
}

function BonusView({ outcome }: { outcome: Outcome }) {
  const subdomain = getSubdomain();
  const { paletteKey, backgroundKey } = useEventBrandingKeys(subdomain);

  if (outcome.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--event-page-bg,#F6EFE2)] text-sm text-[var(--event-muted,#8A7E66)]">
        Checking bonus code…
      </div>
    );
  }

  if (outcome.kind === "claimed" || outcome.kind === "already") {
    const isNew = outcome.kind === "claimed";
    const title = isNew ? "Bonus points collected" : "Already collected";
    const kicker = isNew ? "Bonus collected" : "Already collected";
    const body = isNew
      ? `You earned ${outcome.row.points_awarded} points.`
      : "You have already claimed this bonus code. Your points total has not changed.";
    return (
      <EventPaletteScope
        paletteKey={paletteKey}
        backgroundKey={backgroundKey}
        className="min-h-screen px-4 py-8"
      >
        <div className="mx-auto w-full max-w-md">
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
                  <Sparkles className="h-9 w-9" style={{ color: GOLD }} />
                </div>
                <div
                  className="mt-5 text-[10px] font-semibold uppercase tracking-[0.32em]"
                  style={{ color: GOLD }}
                >
                  {kicker}
                </div>
                <h1 className="mt-2 text-[34px] font-semibold leading-tight" style={{ fontFamily: "var(--event-font, inherit)" }}>
                  {title}
                </h1>
                {outcome.row.bonus_code_name && (
                  <p className="mt-1 text-base text-[var(--event-page-bg,#F6EFE2)]/90">
                    {outcome.row.bonus_code_name}
                  </p>
                )}
                <p className="mt-3 text-sm text-[var(--event-page-bg,#F6EFE2)]/85">{body}</p>
                <p className="mt-2 text-sm font-semibold" style={{ color: GOLD }}>
                  Your total points: {outcome.row.total_points}
                </p>
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
            <a
              href="/"
              className="flex h-11 w-full items-center justify-center rounded-full border border-[var(--event-primary,#1F3D2B)]/30 text-sm font-semibold tracking-wide text-[var(--event-primary,#1F3D2B)]"
            >
              Back to event
            </a>
          </div>
        </div>
      </EventPaletteScope>
    );

  }

  const copy: Record<
    Exclude<Outcome["kind"], "loading" | "claimed" | "already" | "no_passport">,
    { title: string; body: string }
  > = {
    not_found: {
      title: "Bonus code not found",
      body: "We couldn't find this bonus code. Double-check the QR you scanned.",
    },
    inactive: {
      title: "Bonus code inactive",
      body: outcome.kind === "inactive" ? outcome.message : "This bonus code is no longer active.",
    },
    event_not_live: {
      title: "Event not live",
      body:
        outcome.kind === "event_not_live"
          ? outcome.message
          : "This event is not currently live.",
    },
    error: {
      title: "Something went wrong",
      body: outcome.kind === "error" ? outcome.message : "Please try again.",
    },
  };

  if (outcome.kind === "no_passport") {
    return (
      <FailureCard
        title="Passport required"
        body="You need to join this event before you can claim bonus points. Tap below to register — we'll bring you back here to claim."
        actionLabel="Create passport for this event"
        actionHref={outcome.subdomain ? "/join" : "/"}
      />
    );
  }

  const { title, body } = copy[outcome.kind];
  return <FailureCard title={title} body={body} actionLabel="Back to event" actionHref="/" />;
}

function FailureCard({
  title,
  body,
  actionLabel,
  actionHref,
}: {
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--event-page-bg,#F6EFE2)] px-6 py-10">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[var(--event-primary,#1F3D2B)]/10" />
        <h1 className="font-trail-serif text-2xl font-semibold text-[var(--event-primary,#1F3D2B)]">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--event-body,#3D372C)]">{body}</p>
        <div className="mt-6">
          <a
            href={actionHref}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--event-primary,#1F3D2B)] px-6 text-sm font-semibold tracking-wide text-[var(--event-page-bg,#F6EFE2)] shadow"
          >
            {actionLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
