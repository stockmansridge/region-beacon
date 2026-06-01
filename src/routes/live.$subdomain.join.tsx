import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { applyPaletteToEvent } from "@/lib/event-palettes";
import { TrailShell } from "@/components/trail-shell";
import { PublicAnnouncementBar } from "@/components/public-announcement-bar";
import { PublicEventNav } from "@/components/public-event-nav";
import { PoweredByGetStampd } from "@/components/brand";
import { tenantHost } from "@/lib/domains";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { useDiagnosticsEnabled, formatDiagnosticReport } from "@/lib/diagnostics";
import { DiagnosticPanel } from "@/components/diagnostic-panel";

export const Route = createFileRoute("/live/$subdomain/join")({
  component: function LiveJoinRoute() {
    const { subdomain } = Route.useParams();
    return <LiveJoinPage subdomain={subdomain} />;
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
  palette_key?: string \| null;
  font_family: string | null;
  welcome_copy: string | null;
  terms_url: string | null;
  current_terms_version_id: string | null;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "not_live" }
  | { kind: "terms_missing"; event: PublicEvent }
  | { kind: "ready"; event: PublicEvent };

type FormState = {
  full_name: string;
  email: string;
  mobile: string;
  postcode: string;
  marketing_opt_in: boolean;
  accept_terms: boolean;
};

const formSchema = z.object({
  full_name: z.string().trim().min(2, "Please enter your full name").max(120, "Name is too long"),
  email: z.string().trim().email("Enter a valid email").max(254, "Email is too long"),
  mobile: z.string().trim().max(32, "Mobile is too long").optional().or(z.literal("")),
  postcode: z.string().trim().max(16, "Postcode is too long").optional().or(z.literal("")),
  marketing_opt_in: z.boolean(),
  accept_terms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the terms & privacy policy" }),
  }),
});

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function friendlyError(raw: string | undefined): string {
  if (!raw) return "Could not create your passport. Please try again.";
  if (raw.includes("event_not_available"))
    return "This event is not accepting registrations yet.";
  if (raw.includes("terms_not_configured"))
    return "Registration is not available yet. Terms and privacy are still being configured.";
  if (raw.includes("terms_version_invalid"))
    return "Terms have been updated. Refresh and try again.";
  return "Could not create your passport. Please try again.";
}

export function LiveJoinPage({ subdomain }: { subdomain: string }) {

  const [state, setState] = useState<LoadState>({ kind: "loading" });

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
        setState({ kind: "not_live" });
        return;
      }

      const { data: evtData, error: evtErr } = await supabase.rpc(
        "get_public_event_by_domain",
        { _hostname: host },
      );
      if (cancelled) return;
      const evt = (evtData?.[0] ?? null) as PublicEvent | null;
      if (evtErr || !evt) {
        setState({ kind: "not_live" });
        return;
      }
      if (!evt.current_terms_version_id) {
        setState({ kind: "terms_missing", event: evt });
        return;
      }
      setState({ kind: "ready", event: evt });
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] text-sm text-[#8A7E66]">
        Loading…
      </div>
    );
  }
  if (state.kind === "not_live") return <NotLiveYet />;
  if (state.kind === "terms_missing")
    return (
      <InfoScreen
        event={state.event}
        title="Almost ready"
        message="Registration is not available yet. Terms and privacy are still being configured."
        subdomain={subdomain}
      />
    );

  return <JoinForm event={state.event} subdomain={subdomain} />;
}

type SavedPassport = {
  access_token?: string;
  passport_id?: string;
  event_id?: string;
  created_at?: string;
};

function readSavedPassport(eventId: string): SavedPassport | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`gs.passport.${eventId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedPassport;
    return parsed?.access_token ? parsed : null;
  } catch {
    return null;
  }
}

function consumeReturnTo(eventId: string): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const scopedKey = `gs.returnTo.${eventId}`;
    const scoped = sessionStorage.getItem(scopedKey);
    if (scoped) {
      sessionStorage.removeItem(scopedKey);
      return scoped;
    }
    const pending = sessionStorage.getItem("gs.returnTo.pending");
    if (pending) sessionStorage.removeItem("gs.returnTo.pending");
    return pending;
  } catch {
    return null;
  }
}

function JoinForm({ event, subdomain }: { event: PublicEvent; subdomain: string }) {
  const primary = event.primary_color ?? "#1F3D2B";
  const accent = event.accent_color ?? "#B5572A";

  const [form, setForm] = useState<FormState>({
    full_name: "",
    email: "",
    mobile: "",
    postcode: "",
    marketing_opt_in: false,
    accept_terms: false,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null);
  const [success, setSuccess] = useState<{ token: string; passport_id: string } | null>(null);
  const [showRegisterAgain, setShowRegisterAgain] = useState(false);
  const [saved, setSaved] = useState<SavedPassport | null>(() =>
    readSavedPassport(event.event_id),
  );
  const [savedValidating, setSavedValidating] = useState<boolean>(() =>
    Boolean(readSavedPassport(event.event_id)?.access_token),
  );
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const { isPlatformAdmin } = useAdminAccess();
  const [diagEnabled] = useDiagnosticsEnabled();
  const showDiag = isPlatformAdmin && diagEnabled;

  // Validate saved passport token before showing "Continue to passport".
  // If invalid/replaced, clear only this event's saved passport and let the
  // visitor register again. Never block them on a stale link.
  useEffect(() => {
    let cancelled = false;
    const token = saved?.access_token;
    if (!token) {
      setSavedValidating(false);
      return;
    }
    setSavedValidating(true);
    (async () => {
      const { data, error } = await supabase.rpc("get_passport_by_token", {
        _raw_token: token,
      });
      if (cancelled) return;
      const row = (data?.[0] ?? null) as { passport_id?: string } | null;
      if (error || !row?.passport_id) {
        try {
          localStorage.removeItem(`gs.passport.${event.event_id}`);
        } catch {
          // ignore
        }
        setSaved(null);
        setStaleNotice(
          "Your previous passport link has expired or was replaced. Please register again to continue.",
        );
      }
      setSavedValidating(false);
    })();
    return () => {
      cancelled = true;
    };
    // Only validate once on mount per event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.event_id]);

  const locale = useMemo(
    () => (typeof navigator !== "undefined" ? navigator.language : null),
    [],
  );

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTopError(null);
    setDebugInfo(null);

    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      const next: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      setDebugInfo({
        stage: "client_validation",
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
      return;
    }
    setErrors({});
    setSubmitting(true);

    const { first, last } = splitName(form.full_name);
    const payloadShape = {
      _event_id: event.event_id,
      _email_length: form.email.trim().length,
      _full_name_length: form.full_name.trim().length,
      _first_name_length: first.length,
      _last_name_length: last.length,
      _mobile_present: Boolean(form.mobile.trim()),
      _postcode_present: Boolean(form.postcode.trim()),
      _marketing_opt_in: form.marketing_opt_in,
      _accepted_terms_version_id: event.current_terms_version_id,
      _locale: locale,
    };

    try {
      const { data, error } = await supabase.rpc("register_visitor", {
        _event_id: event.event_id,
        _email: form.email.trim(),
        _full_name: form.full_name.trim(),
        _first_name: first,
        _last_name: last,
        _mobile: form.mobile.trim() || null,
        _postcode: form.postcode.trim() || null,
        _marketing_opt_in: form.marketing_opt_in,
        _accepted_terms_version_id: event.current_terms_version_id,
        _locale: locale,
        _client_ip: null,
        _user_agent: null,
      });

      if (error) {
        setTopError(friendlyError(error.message));
        setDebugInfo({
          stage: "rpc_error",
          rpc: "register_visitor",
          payload_shape: payloadShape,
          error_message: error.message,
          error_code: (error as { code?: string }).code ?? null,
          error_details: (error as { details?: string }).details ?? null,
          error_hint: (error as { hint?: string }).hint ?? null,
          event_id: event.event_id,
          public_slug: event.public_slug,
          subdomain,
          accepted_terms: form.accept_terms,
          terms_version_id: event.current_terms_version_id,
        });
        setSubmitting(false);
        return;
      }
      const row = (data?.[0] ?? null) as
        | { passport_id: string; access_token: string }
        | null;
      if (!row?.access_token || !row?.passport_id) {
        setTopError("Could not create your passport. Please try again.");
        setDebugInfo({
          stage: "empty_rpc_response",
          rpc: "register_visitor",
          payload_shape: payloadShape,
          returned_data: data,
          event_id: event.event_id,
          subdomain,
        });
        setSubmitting(false);
        return;
      }

      try {
        localStorage.setItem(
          `gs.passport.${event.event_id}`,
          JSON.stringify({
            passport_id: row.passport_id,
            access_token: row.access_token,
            event_id: event.event_id,
            subdomain,
            created_at: new Date().toISOString(),
          }),
        );
      } catch {
        // localStorage unavailable — token still shown on success screen
      }

      // If user was redirected from a venue QR scan, send them back there.
      const returnTo = consumeReturnTo(event.event_id);
      if (returnTo && typeof window !== "undefined") {
        window.location.replace(returnTo);
        return;
      }
      setSuccess({ token: row.access_token, passport_id: row.passport_id });
      setSubmitting(false);
    } catch (e) {
      setTopError("Could not create your passport. Please try again.");
      setDebugInfo({
        stage: "exception",
        rpc: "register_visitor",
        payload_shape: payloadShape,
        error_message: e instanceof Error ? e.message : String(e),
        event_id: event.event_id,
        subdomain,
      });
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <SuccessScreen
        event={event}
        token={success.token}
        subdomain={subdomain}
      />
    );
  }

  return (
    <>
      <div className="bg-[#F6EFE2] px-4 pt-6">
        <PublicAnnouncementBar subdomain={subdomain} />
        <PublicEventNav
          subdomain={subdomain}
          eventName={event.name}
          primaryColor={primary}
          accentColor={accent}
          hasTerms={Boolean(event.terms_url || event.current_terms_version_id)}
          hasPrivacy={Boolean(event.terms_url || event.current_terms_version_id)}
        />
      </div>
      <TrailShell
        eventName={event.name}
      primaryColor={primary}
      accentColor={accent}
      topLeft={
        <Link
          to="/"
          className="text-xs font-semibold uppercase tracking-[0.18em]"
          style={{ color: primary }}
        >
          ← Back
        </Link>
      }
    >
      <div
        className="mx-auto w-full max-w-md"
        style={event.font_family ? { fontFamily: event.font_family } : undefined}
      >
        <div className="mb-5 text-center">
          <div
            className="text-[10px] font-medium uppercase tracking-[0.32em]"
            style={{ color: accent }}
          >
            Start your passport
          </div>
          <h1
            className="font-trail-serif mt-1 text-3xl font-semibold"
            style={{ color: primary }}
          >
            {event.name}
          </h1>
          <p className="mt-2 text-sm text-[#3D372C]/80">
            No app download required. Takes under a minute.
          </p>
        </div>

        {savedValidating && (
          <section
            className="mb-5 rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-5 text-center text-sm text-[#8A7E66] shadow-sm"
          >
            Checking your saved passport…
          </section>
        )}

        {!savedValidating && saved?.access_token && !showRegisterAgain && (
          <section
            className="mb-5 rounded-3xl border p-5 shadow-sm"
            style={{ borderColor: `${primary}33`, backgroundColor: "#FBF5E8" }}
          >
            <div
              className="text-[10px] font-medium uppercase tracking-[0.32em]"
              style={{ color: accent }}
            >
              Welcome back
            </div>
            <h2
              className="font-trail-serif mt-1 text-xl font-semibold"
              style={{ color: primary }}
            >
              You already have a passport for this trail
            </h2>
            <p className="mt-2 text-sm text-[#3D372C]/80">
              We found a passport saved on this device. Continue where you left
              off, or register again to issue a new passport link (your older
              link will stop working).
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                to="/passport/$token"
                params={{ token: saved.access_token }}
                className="flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
                style={{ backgroundColor: primary }}
              >
                Continue to passport
              </Link>
              <button
                type="button"
                onClick={() => setShowRegisterAgain(true)}
                className="h-11 w-full rounded-full border text-sm font-semibold tracking-wide"
                style={{ borderColor: `${primary}40`, color: primary, backgroundColor: "transparent" }}
              >
                Register again / replace passport
              </button>
            </div>
          </section>
        )}

        {!savedValidating && staleNotice && (
          <div
            className="mb-4 rounded-xl border px-3 py-2 text-sm"
            style={{
              borderColor: `${accent}55`,
              backgroundColor: `${accent}10`,
              color: "#5A2410",
            }}
          >
            {staleNotice}
          </div>
        )}

        {!savedValidating && (!saved?.access_token || showRegisterAgain) && (
          <p className="mb-3 text-center text-[11px] text-[#8A7E66]">
            Already registered? Enter the same email below — we'll issue a new
            passport link and any older link will stop working.
          </p>
        )}



        {!savedValidating && (!saved?.access_token || showRegisterAgain) && <form
          onSubmit={onSubmit}
          className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-5 shadow-sm"
          noValidate
        >
          {topError && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-[#E8B5A3] bg-[#FBE3D6] px-3 py-2 text-sm"
              style={{ color: "#7A2E13" }}
            >
              <div>{topError}</div>
              {debugInfo && (
                <CopySupportDetailsButton
                  build={() =>
                    buildSupportReport(debugInfo, {
                      event_id: event.event_id,
                      subdomain,
                      accepted_terms: form.accept_terms,
                      terms_version_id: event.current_terms_version_id,
                    })
                  }
                />
              )}
            </div>
          )}

          <Field
            label="Full name"
            required
            error={errors.full_name}
            input={
              <input
                type="text"
                autoComplete="name"
                value={form.full_name}
                onChange={(e) => update("full_name", e.target.value)}
                className="trail-input"
                maxLength={120}
              />
            }
          />
          <Field
            label="Email"
            required
            error={errors.email}
            input={
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                className="trail-input"
                maxLength={254}
              />
            }
          />
          <Field
            label="Mobile"
            optional
            error={errors.mobile}
            input={
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.mobile}
                onChange={(e) => update("mobile", e.target.value)}
                className="trail-input"
                maxLength={32}
              />
            }
          />
          <Field
            label="Postcode"
            optional
            error={errors.postcode}
            input={
              <input
                type="text"
                inputMode="text"
                autoComplete="postal-code"
                value={form.postcode}
                onChange={(e) => update("postcode", e.target.value)}
                className="trail-input"
                maxLength={16}
              />
            }
          />

          <label className="mt-3 flex items-start gap-3 text-sm text-[#3D372C]">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-[#C9BFA8]"
              checked={form.marketing_opt_in}
              onChange={(e) => update("marketing_opt_in", e.target.checked)}
              style={{ accentColor: primary }}
            />
            <span>
              Send me updates about this event and future trails (optional).
            </span>
          </label>

          <label className="mt-3 flex items-start gap-3 text-sm text-[#3D372C]">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-[#C9BFA8]"
              checked={form.accept_terms}
              onChange={(e) => update("accept_terms", e.target.checked)}
              style={{ accentColor: primary }}
            />
            <span>
              I accept the{" "}
              <Link
                to="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: accent }}
              >
                terms
              </Link>{" "}
              and{" "}
              <Link
                to="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: accent }}
              >
                privacy policy
              </Link>
              .
            </span>
          </label>
          {errors.accept_terms && (
            <p className="mt-1 text-xs font-medium" style={{ color: "#7A2E13" }}>
              {errors.accept_terms}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 h-12 w-full rounded-full text-sm font-semibold tracking-wide text-[#F6EFE2] shadow disabled:opacity-60"
            style={{ backgroundColor: primary }}
          >
            {submitting ? "Creating passport…" : "Create my passport"}
          </button>

          <p className="mt-3 text-center text-[11px] uppercase tracking-[0.22em] text-[#8A7E66]">
            No app download required
          </p>
        </form>}
        {showDiag && debugInfo && (
          <div className="mt-4">
            <DiagnosticPanel
              title="Join / Passport creation"
              subtitle="Visible to platform_admin with Diagnostics enabled."
              getReport={() =>
                formatDiagnosticReport("Join / Passport creation", debugInfo)
              }
            >
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background/60 p-3 text-[11px] leading-relaxed">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </DiagnosticPanel>
          </div>
        )}
      </div>

      <style>{`
        .trail-input {
          width: 100%;
          height: 44px;
          border-radius: 12px;
          border: 1px solid #E6DCC7;
          background: #F6EFE2;
          padding: 0 14px;
          font-size: 15px;
          color: #2A2620;
          outline: none;
        }
        .trail-input:focus {
          border-color: ${primary};
          box-shadow: 0 0 0 3px ${primary}22;
        }
      `}</style>
    </TrailShell>
    </>
  );
}

function Field({
  label,
  required,
  optional,
  error,
  input,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  input: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <label className="mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-[0.16em] text-[#7A6F5C]">
        <span>{label}{required && <span className="text-[#B5572A]"> *</span>}</span>
        {optional && <span className="text-[10px] text-[#A89C82]">Optional</span>}
      </label>
      {input}
      {error && (
        <p className="mt-1 text-xs font-medium" style={{ color: "#7A2E13" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function SuccessScreen({
  event,
  token,
  subdomain,
}: {
  event: PublicEvent;
  token: string;
  subdomain: string;
}) {
  const primary = event.primary_color ?? "#1F3D2B";
  const accent = event.accent_color ?? "#B5572A";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const passportUrl = `${origin}/passport/${token}`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(passportUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <TrailShell
      eventName={event.name}
      primaryColor={primary}
      accentColor={accent}
      topLeft={
        <Link
          to="/"
          className="text-xs font-semibold uppercase tracking-[0.18em]"
          style={{ color: primary }}
        >
          ← Event
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 text-center shadow-sm">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: `${primary}14`, color: primary }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div
            className="text-[10px] font-medium uppercase tracking-[0.32em]"
            style={{ color: accent }}
          >
            Welcome to the trail
          </div>
          <h1
            className="font-trail-serif mt-2 text-2xl font-semibold"
            style={{ color: primary }}
          >
            Your passport is ready
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#3D372C]">
            Your private passport link is below. Save it — it's the only way
            back into your passport on a new device.
          </p>

          <div className="mt-5 rounded-2xl border border-[#E6DCC7] bg-[#F6EFE2] p-3 text-left">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#8A7E66]">
              Your passport link
            </div>
            <div
              className="mt-1 break-all font-mono text-xs"
              style={{ color: primary }}
            >
              {passportUrl}
            </div>
          </div>

          <Link
            to="/passport/$token"
            params={{ token }}
            className="mt-4 flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
            style={{ backgroundColor: primary }}
          >
            Open my passport
          </Link>
          <button
            type="button"
            onClick={copy}
            className="mt-2 h-11 w-full rounded-full border text-sm font-semibold tracking-wide"
            style={{ borderColor: `${primary}40`, color: primary, backgroundColor: "transparent" }}
          >
            {copied ? "Copied!" : "Copy passport link"}
          </button>

          <div
            className="mt-4 rounded-xl border px-3 py-2 text-left text-xs"
            style={{
              borderColor: `${accent}55`,
              backgroundColor: `${accent}10`,
              color: "#5A2410",
            }}
          >
            <strong>Save this link.</strong> It is your private passport access
            link. Anyone with it can view your passport.
          </div>
        </div>

        <div className="mt-4 flex justify-center"><PoweredByGetStampd variant="trail" /></div>
      </div>
    </TrailShell>
  );
}

function InfoScreen({
  event,
  title,
  message,
  subdomain,
}: {
  event: PublicEvent;
  title: string;
  message: string;
  subdomain: string;
}) {
  const primary = event.primary_color ?? "#1F3D2B";
  return (
    <TrailShell
      eventName={event.name}
      primaryColor={primary}
      accentColor={event.accent_color ?? "#B5572A"}
      topLeft={
        <Link
          to="/"
          className="text-xs font-semibold uppercase tracking-[0.18em]"
          style={{ color: primary }}
        >
          ← Back
        </Link>
      }
    >
      <div className="mx-auto max-w-md rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-8 text-center shadow-sm">
        <h1 className="font-trail-serif text-2xl font-semibold" style={{ color: primary }}>
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#3D372C]">{message}</p>
      </div>
    </TrailShell>
  );
}

function NotLiveYet() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] px-6">
      <div className="mx-auto max-w-md rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[#1F3D2B]/10" />
        <h1 className="font-trail-serif text-2xl font-semibold text-[#1F3D2B]">
          Event not live yet
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#3D372C]">
          This passport experience isn't available right now. Please check back
          closer to the event, or contact the organiser for details.
        </p>
        <div className="mt-6 flex justify-start"><PoweredByGetStampd variant="trail" /></div>
      </div>
    </div>
  );
}

/**
 * Builds a PII-safe support report. Includes diagnostic shape data only —
 * never raw name/email/mobile/postcode. Visitors can copy this to share
 * with support without leaking personal info.
 */
function buildSupportReport(
  debug: Record<string, unknown>,
  ctx: {
    event_id: string;
    subdomain: string;
    accepted_terms: boolean;
    terms_version_id: string | null;
  },
): string {
  const safe: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    page_url: typeof window !== "undefined" ? window.location.href : null,
    public_subdomain: ctx.subdomain,
    event_id: ctx.event_id,
    rpc: (debug as { rpc?: string }).rpc ?? "register_visitor",
    failure_stage: (debug as { stage?: string }).stage ?? "unknown",
    supabase_error_code: (debug as { error_code?: unknown }).error_code ?? null,
    supabase_error_message: (debug as { error_message?: unknown }).error_message ?? null,
    supabase_error_details: (debug as { error_details?: unknown }).error_details ?? null,
    supabase_error_hint: (debug as { error_hint?: unknown }).error_hint ?? null,
    terms_accepted: ctx.accepted_terms,
    terms_version_id: ctx.terms_version_id,
  };

  // Whitelist payload_shape fields so PII can never leak even if upstream
  // accidentally extends the diagnostic object.
  const rawShape = (debug as { payload_shape?: Record<string, unknown> }).payload_shape;
  if (rawShape && typeof rawShape === "object") {
    const allow = new Set([
      "_event_id",
      "_email_length",
      "_full_name_length",
      "_first_name_length",
      "_last_name_length",
      "_mobile_present",
      "_postcode_present",
      "_marketing_opt_in",
      "_accepted_terms_version_id",
      "_locale",
    ]);
    const shape: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawShape)) if (allow.has(k)) shape[k] = v;
    safe.payload_shape = shape;
  }

  return [
    "# GetStampd passport support report",
    ...Object.entries(safe).map(([k, v]) =>
      typeof v === "string" || v === null || typeof v === "number" || typeof v === "boolean"
        ? `${k}: ${v ?? "—"}`
        : `${k}: ${JSON.stringify(v)}`,
    ),
  ].join("\n");
}

function CopySupportDetailsButton({ build }: { build: () => string }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "err">("idle");
  async function onClick() {
    try {
      await navigator.clipboard.writeText(build());
      setCopied("ok");
      setTimeout(() => setCopied("idle"), 1800);
    } catch {
      setCopied("err");
      setTimeout(() => setCopied("idle"), 2400);
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-[#E8B5A3] bg-white/60 px-2 text-[11px] font-semibold uppercase tracking-[0.14em]"
      style={{ color: "#7A2E13" }}
    >
      {copied === "ok"
        ? "Copied"
        : copied === "err"
          ? "Copy failed"
          : "Copy support details"}
    </button>
  );
}
