import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GetStampdLogo } from "@/components/brand";

export const Route = createFileRoute("/admin/update-password")({
  head: () => ({ meta: [{ title: "Set a new password" }] }),
  component: UpdatePassword,
});

const MIN_PASSWORD_LENGTH = 8;

function UpdatePassword() {
  const navigate = useNavigate();
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Supabase parses the recovery token from the URL hash on load and emits
  // a PASSWORD_RECOVERY auth event. We accept any active session as valid
  // here — the reset link establishes one before redirecting.
  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setHasRecoverySession(!!data.session);
      })
      .catch(() => {
        if (!cancelled) setHasRecoverySession(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setHasRecoverySession(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError("Could not update password. The reset link may have expired — request a new one.");
      return;
    }
    setSuccess(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-hero-gradient" />
          <div>
            <div className="text-sm font-semibold">GetStampd</div>
            <div className="text-xs text-muted-foreground">Set a new password</div>
          </div>
        </div>

        {success ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              Password updated. You can continue to the admin portal.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/admin", replace: true })}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
            >
              Continue to admin
            </button>
            <Link
              to="/admin/login"
              className="block w-full text-center text-xs text-muted-foreground hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : hasRecoverySession === false ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              This password reset link is invalid or has expired. Request a new link from the
              sign-in page.
            </p>
            <Link
              to="/admin/login"
              className="flex h-11 w-full items-center justify-center rounded-lg border bg-background text-sm font-medium hover:bg-muted"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">New password</label>
              <input
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Confirm new password
              </label>
              <input
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="Re-enter new password"
                autoComplete="new-password"
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
              disabled={submitting || hasRecoverySession === null}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {submitting ? "Updating…" : "Update password"}
            </button>
            <Link
              to="/admin/login"
              className="block w-full text-center text-xs text-muted-foreground hover:underline"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
