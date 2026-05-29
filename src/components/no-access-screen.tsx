import { useNavigate } from "@tanstack/react-router";
import { signOut } from "@/hooks/use-auth";

export function NoAccessScreen({ email }: { email: string | null }) {
  const navigate = useNavigate();
  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/admin/login", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm text-center">
        <div className="mx-auto h-10 w-10 rounded-lg bg-hero-gradient" />
        <h1 className="mt-4 text-lg font-semibold">No access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {email ? <>You're signed in as <span className="font-medium text-foreground">{email}</span>, but </> : "You are "}
          this account does not have a platform or agency role assigned for the admin portal.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Ask a platform admin to grant you a role, then sign in again.
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
