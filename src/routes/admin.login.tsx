import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Admin sign in" }] }),
  component: Login,
});

function Login() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-hero-gradient" />
          <div>
            <div className="text-sm font-semibold">Regional Passport</div>
            <div className="text-xs text-muted-foreground">Admin sign in</div>
          </div>
        </div>
        <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Work email</label>
            <input className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="you@agency.com" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Password</label>
            <input type="password" className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="••••••••" />
          </div>
          <Link
            to="/admin"
            className="flex h-11 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
          >
            Sign in
          </Link>
        </form>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Authentication will be wired up once the data model is approved.
        </p>
      </div>
    </div>
  );
}
