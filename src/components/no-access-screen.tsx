import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { signOut } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import {
  readPendingOrganisationSignup,
  completePendingOrganisationSignup,
  clearPendingOrganisationSignup,
  readLastOrganisationSignupError,
  writeLastOrganisationSignupError,
  getMyPendingOrganisationSignupServer,
  type PendingOrganisationSignup,
} from "@/lib/pending-organisation-signup";

export function NoAccessScreen({
  email,
  isPlatformAdmin = false,
}: {
  email: string | null;
  isPlatformAdmin?: boolean;
}) {
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingOrganisationSignup | null>(null);
  const [serverPendingFound, setServerPendingFound] = useState<boolean | null>(null);
  const [checkingPending, setCheckingPending] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priorError, setPriorError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line no-console
      console.log("[no-access] server pending signup check enabled");
      const serverPending = await getMyPendingOrganisationSignupServer();
      if (cancelled) return;
      const nextPending = serverPending ?? readPendingOrganisationSignup();
      setPending(nextPending);
      setServerPendingFound(!!serverPending);
      // eslint-disable-next-line no-console
      console.log("[no-access] pending signup check", {
        signedInEmail: email ?? null,
        hasPending: !!serverPending,
        pendingEmail: serverPending?.email ?? null,
        organisationName: serverPending?.businessName ?? null,
        status: serverPending?.status ?? null,
        lastError: serverPending?.lastError ?? null,
      });
      setPriorError(
        serverPending?.lastError
          ? "We could not finish creating your organisation automatically. Please try again, or contact support if it continues."
          : readLastOrganisationSignupError(),
      );
      setCheckingPending(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/admin/login", replace: true });
  };

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    const result = await completePendingOrganisationSignup();
    if (result.ok) {
      writeLastOrganisationSignupError(null);
      window.location.assign("/admin/events");
      return;
    }
    setBusy(false);
    if (result.code === "slug_taken") {
      clearPendingOrganisationSignup();
      setPending(null);
    }
    writeLastOrganisationSignupError(result.message);
    setPriorError(result.message);
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
        {checkingPending ? (
          <>
            <h1 className="mt-4 text-lg font-semibold">Checking organisation setup</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Looking for your pending organisation details…
            </p>
            <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-muted-foreground" />
          </>
        ) : pending ? (
          <>
            <h1 className="mt-4 text-lg font-semibold">Finish creating your organisation</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {priorError ? (
                <>Your account was confirmed, but we could not finish creating your organisation. Please try again or contact support.</>
              ) : (
                <>
                  {email ? (
                    <>You're signed in as <span className="font-medium text-foreground">{email}</span>. </>
                  ) : null}
                  Tap below to create <span className="font-medium text-foreground">{pending.businessName}</span>{" "}
                  and get into the admin.
                </>
              )}
            </p>
            {priorError && !error && (
              <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive text-left">
                {priorError}
              </p>
            )}
            {error && (
              <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive text-left">
                {error}
              </p>
            )}
            {(import.meta.env.DEV || isPlatformAdmin) && (
              <p className="mt-3 text-left text-[11px] text-muted-foreground">
                Pending signup found: {serverPendingFound ? "yes" : "no"}
              </p>
            )}
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy}
              className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Finish creating my organisation
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
            {(import.meta.env.DEV || isPlatformAdmin) && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Pending signup found: {serverPendingFound ? "yes" : "no"}
              </p>
            )}
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
