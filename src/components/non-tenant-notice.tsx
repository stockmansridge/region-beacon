import { Link } from "@tanstack/react-router";

/**
 * Rendered by clean public routes (`/join`, `/venues`, `/leaderboard`,
 * `/terms`, `/privacy`) when accessed from a non-tenant host (apex,
 * preview, localhost). Tenant hosts render the real public page instead.
 */
export function NonTenantNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold">Event passport</h1>
        <p className="mt-3 text-sm text-slate-400">
          Open this page from your event link, for example
          <br />
          <span className="font-mono text-cyan-200">
            your-event.getstampd.com.au
          </span>
          .
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-10 items-center rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
