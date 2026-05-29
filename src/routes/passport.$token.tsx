import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrailShell } from "@/components/trail-shell";

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

type EventRow = { name: string | null };

type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "ready"; passport: PassportRow; eventName: string | null };

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";

function PassportPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });
      const { data, error } = await supabase.rpc("get_passport_by_token", {
        _raw_token: token,
      });
      if (cancelled) return;
      const row = (data?.[0] ?? null) as PassportRow | null;
      if (error || !row?.passport_id) {
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

      // Best-effort public event name lookup (no PII).
      let eventName: string | null = null;
      if (row.event_id) {
        const { data: evt } = await supabase
          .from("events")
          .select("name")
          .eq("id", row.event_id)
          .maybeSingle();
        if (!cancelled) eventName = (evt as EventRow | null)?.name ?? null;
      }

      if (cancelled) return;
      setState({ kind: "ready", passport: row, eventName });
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

  return <PassportView passport={state.passport} eventName={state.eventName} token={token} />;
}

function PassportView({
  passport,
  eventName,
  token,
}: {
  passport: PassportRow;
  eventName: string | null;
  token: string;
}) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const passportUrl = `${origin}/passport/${token}`;
  const count = passport.checkin_count ?? 0;
  const goal = 8;
  const pct = Math.min(100, Math.round((count / goal) * 100));

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
            No app download required
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
              <div className="font-trail-serif text-3xl font-semibold" style={{ color: PRIMARY }}>
                {count}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8A7E66]">
                stamps
              </div>
            </div>
          </div>

          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#E6DCC7] bg-[#F6EFE2] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#3D372C]">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: passport.status === "completed" ? PRIMARY : ACCENT }}
            />
            Status · {statusLabel}
          </div>
        </section>

        {/* Visitor details */}
        <section className="mt-5 rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-5 shadow-sm">
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8A7E66]">
            Passport holder
          </div>
          <div className="mt-1 font-trail-serif text-lg font-semibold" style={{ color: PRIMARY }}>
            {passport.full_name ?? "Visitor"}
          </div>
          {passport.email && (
            <div className="mt-0.5 text-sm text-[#3D372C]/80 break-all">{passport.email}</div>
          )}
        </section>

        {/* Stamps placeholder */}
        <section className="mt-5 rounded-3xl border border-dashed border-[#C9A24A]/50 bg-[#FBF5E8] p-6 text-center">
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#C9A24A]">
            Stamps
          </div>
          <p className="mt-2 text-sm text-[#3D372C]">
            Stamps will appear here after you scan venue QR codes.
          </p>
        </section>

        {/* Copy link */}
        <section className="mt-5 rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-5 shadow-sm">
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8A7E66]">
            Your private passport link
          </div>
          <div className="mt-2 break-all rounded-2xl border border-[#E6DCC7] bg-[#F6EFE2] p-3 font-mono text-xs" style={{ color: PRIMARY }}>
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
