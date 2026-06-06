import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, signOut } from "@/hooks/use-auth";
import { GetStampdLogo } from "@/components/brand";
import { authUrl, cleanAuthUrlFragments } from "@/lib/auth-redirect";
import {
  readPendingOrganisationSignup,
  completePendingOrganisationSignup,
  clearPendingOrganisationSignup,
} from "@/lib/pending-organisation-signup";


export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Admin sign in" }] }),
  component: Login,
});

const SUPPORT_EMAIL = "jonathan@stockmansridge.com.au";
const GENERIC_AUTH_ERROR = "Sign in failed. Check your credentials and try again.";

/**
 * Map Supabase auth error messages to user-friendly copy while still
 * preserving the real reason (so we can distinguish "invalid credentials"
 * from "email not confirmed", etc.).
 */
function describeSignInError(message: string | undefined): string {
  const msg = (message || "").trim();
  if (!msg) return GENERIC_AUTH_ERROR;
  if (/email not confirmed/i.test(msg)) {
    return "Email not confirmed yet. Please click the confirmation link in your inbox, then try again.";
  }
  if (/invalid login credentials/i.test(msg)) {
    return "Invalid email or password. If you just signed up, make sure you've confirmed your email first.";
  }
  if (/email rate limit|over.*rate limit|too many/i.test(msg)) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  return msg;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function Login() {
  const navigate = useNavigate();
  const { status, email: sessionEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCompleteSignupBanner, setShowCompleteSignupBanner] = useState(false);
  const [mismatch, setMismatch] = useState<{
    currentEmail: string;
    pendingEmail: string;
  } | null>(null);
  const [mismatchBusy, setMismatchBusy] = useState(false);

  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  // Strip any access_token/refresh_token/code fragments Supabase left in the
  // URL after consuming the email confirmation link.
  useEffect(() => {
    cleanAuthUrlFragments();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("complete_signup") === "1") {
        setShowCompleteSignupBanner(true);
      }
    }
  }, []);

  // If authenticated, decide whether to auto-complete pending signup,
  // show a mismatch screen, or just continue to /admin.
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      const pending = readPendingOrganisationSignup();
      if (!pending) {
        navigate({ to: "/admin", replace: true });
        return;
      }
      const result = await completePendingOrganisationSignup();
      if (cancelled) return;
      if (result.ok) {
        navigate({ to: "/admin", replace: true });
        return;
      }
      if (result.code === "email_mismatch") {
        setMismatch({
          currentEmail: result.currentEmail ?? sessionEmail ?? "",
          pendingEmail: result.pendingEmail ?? pending.email,
        });
        return;
      }
      // Non-fatal — let user continue; NoAccessScreen will offer a retry.
      // eslint-disable-next-line no-console
      console.warn("Pending organisation completion failed:", result.message);
      navigate({ to: "/admin", replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [status, sessionEmail, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setSubmitting(false);
      setError(GENERIC_AUTH_ERROR);
      return;
    }
    // The authenticated effect above takes over from here (pending-signup
    // completion + redirect or mismatch screen).
    setSubmitting(false);
  };

  const handleMismatchSignOut = async () => {
    setMismatchBusy(true);
    await signOut();
    setMismatch(null);
    setMismatchBusy(false);
  };

  const handleMismatchContinue = () => {
    setMismatch(null);
    navigate({ to: "/admin", replace: true });
  };

  const handleMismatchCancelPending = () => {
    clearPendingOrganisationSignup();
    setMismatch(null);
    navigate({ to: "/admin", replace: true });
  };



  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetMessage(null);
    if (!isValidEmail(resetEmail)) {
      setResetError("Enter a valid email address.");
      return;
    }
    setResetSubmitting(true);
    const redirectTo = authUrl("/admin/update-password");
    await supabase.auth.resetPasswordForEmail(resetEmail.trim(), { redirectTo });
    setResetSubmitting(false);
    // Generic confirmation — never reveal whether the email exists.
    setResetMessage(
      "If an admin account exists for that email, a password reset link has been sent.",
    );
  };

  if (mismatch) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar p-4">
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
          <GetStampdLogo variant="blue" size="md" caption="Account mismatch" />
          <h1 className="mt-4 text-lg font-semibold">Wrong account signed in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You're currently signed in as{" "}
            <span className="font-medium text-foreground">{mismatch.currentEmail || "another account"}</span>,
            but this organisation signup was created for{" "}
            <span className="font-medium text-foreground">{mismatch.pendingEmail}</span>.
            Sign out and sign in with the correct account to finish creating the organisation.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleMismatchSignOut}
              disabled={mismatchBusy}
              className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:opacity-60"
            >
              Sign out and continue
            </button>
            <button
              type="button"
              onClick={handleMismatchContinue}
              className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]"
            >
              Go to admin as {mismatch.currentEmail || "current user"}
            </button>
            <button
              type="button"
              onClick={handleMismatchCancelPending}
              className="inline-flex h-9 items-center justify-center text-xs text-muted-foreground hover:underline"
            >
              Cancel pending organisation signup
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <GetStampdLogo variant="blue" size="md" caption="Event admin sign in" />

        <p className="mt-4 text-xs text-muted-foreground">
          Restricted to authorised event and organisation administrators. Visitor accounts cannot
          sign in here.
        </p>

        {showCompleteSignupBanner && (
          <div className="mt-4 rounded-[12px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-xs leading-5 text-[#334155]">
            <strong className="font-semibold">Email confirmed.</strong> Sign in to finish creating
            your organisation.
          </div>
        )}




        {!showReset ? (
          <>
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Work email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none"
                  placeholder="you@organisation.com"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReset(true);
                      setResetEmail(email);
                      setError(null);
                    }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-xs leading-5 text-[#B91C1C]"
                >
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="flex h-11 w-full items-center justify-center rounded-[10px] bg-[#2F6FE4] text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:opacity-60"
              >
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              New here?{" "}
              <Link to="/signup" className="font-medium text-primary hover:underline">
                Create your organisation
              </Link>
            </p>
          </>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleReset}>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Email for password reset
              </label>
              <input
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="h-11 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none"
                placeholder="you@organisation.com"
                autoComplete="email"
              />
            </div>
            {resetError && (
              <p
                role="alert"
                className="rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-xs leading-5 text-[#B91C1C]"
              >
                {resetError}
              </p>
            )}
            {resetMessage && (
              <p className="rounded-[12px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-xs leading-5 text-[#334155]">
                {resetMessage}
              </p>
            )}
            <button
              type="submit"
              disabled={resetSubmitting}
              className="flex h-11 w-full items-center justify-center rounded-[10px] bg-[#2F6FE4] text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:opacity-60"
            >
              {resetSubmitting ? "Sending…" : "Send reset link"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowReset(false);
                setResetError(null);
                setResetMessage(null);
              }}
              className="block w-full text-center text-xs text-muted-foreground hover:underline"
            >
              Back to sign in
            </button>
          </form>
        )}

        <div className="mt-6 border-t pt-4 text-center text-xs text-muted-foreground">
          Need access? Contact your platform administrator at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </div>
      </div>
    </div>
  );
}
