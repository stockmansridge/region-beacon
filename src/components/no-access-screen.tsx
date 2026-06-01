import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { signOut } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import {
  readPendingOrganisationSignup,
  completePendingOrganisationSignup,
  clearPendingOrganisationSignup,
  type PendingOrganisationSignup,
} from "@/lib/pending-organisation-signup";

export function NoAccessScreen({ email }: { email: string | null }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingOrganisationSignup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPending(readPendingOrganisationSignup());
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/admin/login", replace: true });
  };

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    const result = await completePendingOrganisationSignup();
    if (result.ok) {
      window.location.assign("/admin/events");
      return;
    }
    setBusy(false);
    if (result.code === "slug_taken") {
      clearPendingOrganisationSignup();
      setPending(null);
    }
    if (result.code === "email_mismatch") {
      // Force them to sign out — only the correct account can complete this.
      setError(result.message);
      return;
    }
    setError(result.message);
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm text-center">
        <div className="mx-auto h-10 w-10 rounded-lg bg-hero-gradient" />
        {pending ? (
          <>
            <h1 className="mt-4 text-lg font-semibold">Finish creating your organisation</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {email ? (
                <>You're signed in as <span className="font-medium text-foreground">{email}</span>. </>
              ) : null}
              Tap below to create <span className="font-medium text-foreground">{pending.businessName}</span>{" "}
              and get into the admin.
            </p>
            {error && (
              <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy}
              className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Create organisation
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border bg-background px-4 text-xs font-medium hover:bg-muted"
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-lg font-semibold">No organisation yet</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {email ? <>You're signed in as <span className="font-medium text-foreground">{email}</span>, but </> : "You are "}
              this account does not have a platform or organisation role yet.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              If you were in the middle of signing up, create your organisation now. Otherwise, ask a platform admin to grant you a role.
            </p>
            <Link
              to="/signup"
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Create an organisation
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg border bg-background px-4 text-xs font-medium hover:bg-muted"
            >
              Sign out
            </button>
          </>

        )}
      </div>
    </div>
  );
}
