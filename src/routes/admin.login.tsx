import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { GetStampdLogo } from "@/components/brand";
import {
  readPendingOrganisationSignup,
  completePendingOrganisationSignup,
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
  const { status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") navigate({ to: "/admin", replace: true });
  }, [status, navigate]);

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
      // Generic — don't reveal whether the email exists.
      setError(GENERIC_AUTH_ERROR);
      return;
    }
    // If a pending organisation signup is waiting (e.g. user just confirmed
    // their email), complete it now so they land directly in the admin.
    if (readPendingOrganisationSignup()) {
      const result = await completePendingOrganisationSignup();
      if (!result.ok && result.code !== "no_pending") {
        // Non-fatal — NoAccessScreen will offer a retry button.
        // eslint-disable-next-line no-console
        console.warn("Pending organisation completion failed:", result.message);
      }
    }
    setSubmitting(false);
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
    const redirectTo = `${window.location.origin}/admin/update-password`;
    await supabase.auth.resetPasswordForEmail(resetEmail.trim(), { redirectTo });
    setResetSubmitting(false);
    // Generic confirmation — never reveal whether the email exists.
    setResetMessage(
      "If an admin account exists for that email, a password reset link has been sent.",
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <GetStampdLogo variant="blue" size="md" caption="Event admin sign in" />




        <p className="mt-4 text-xs text-muted-foreground">
          Restricted to authorised event and organisation administrators. Visitor accounts cannot
          sign in here.
        </p>

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
                  placeholder="you@agency.com"
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
                placeholder="you@agency.com"
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
