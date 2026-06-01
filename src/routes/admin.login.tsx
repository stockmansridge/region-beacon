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
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Sign out and continue
            </button>
            <button
              type="button"
              onClick={handleMismatchContinue}
              className="inline-flex h-10 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
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
          <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
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
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
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
                  className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
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
                className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="you@organisation.com"
                autoComplete="email"
              />
            </div>
            {resetError && (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {resetError}
              </p>
            )}
            {resetMessage && (
              <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
                {resetMessage}
              </p>
            )}
            <button
              type="submit"
              disabled={resetSubmitting}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
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
