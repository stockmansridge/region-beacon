import { createFileRoute } from "@tanstack/react-router";

/**
 * Weekly opening-hours refresh, called by the database scheduler (pg_cron).
 * Verified by the scheduler token stored in venue_hours_sync_state; one run
 * at a time (database lease), bounded batch, stops on Google key/quota errors.
 */
export const Route = createFileRoute("/api/public/venue-hours/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});

const BATCH = 100;

async function handle(request: Request): Promise<Response> {
  const token = request.headers.get("x-venue-hours-token") ?? "";
  if (token.length < 32) return new Response("Unauthorized", { status: 401 });

  const { getSupabaseAdmin } = await import("@/integrations/supabase/admin.server");
  const { syncVenueHours, HaltSync } = await import("@/lib/venue-hours.server");
  const admin = getSupabaseAdmin();

  const { data: lease, error: leaseErr } = await admin.rpc("venue_hours_acquire_lease", { _token: token, _seconds: 600 });
  if (leaseErr) return new Response(`Lease error: ${leaseErr.message}`, { status: 500 });
  const row = (lease as Array<{ acquired: boolean; paused_reason: string | null }> | null)?.[0];
  if (!row?.acquired) return new Response("Unauthorized or already running", { status: 409 });

  const counts: Record<string, number> = {};
  let paused: string | null = null;
  try {
    // While paused, try a single venue as a probe; resume normally if it works.
    const limit = row.paused_reason ? 1 : BATCH;
    const { data: due, error } = await admin.rpc("venue_hours_due", { _limit: limit });
    if (error) throw new Error(error.message);
    for (const v of (due ?? []) as Parameters<typeof syncVenueHours>[1][]) {
      const status = await syncVenueHours(admin, v);
      counts[status] = (counts[status] ?? 0) + 1;
    }
  } catch (err) {
    paused = err instanceof HaltSync ? err.message : `Run failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error("[venue-hours] run stopped", paused);
  }
  await admin.rpc("venue_hours_release_lease", { _summary: counts, _paused_reason: paused });
  return Response.json({ ok: !paused, counts, paused });
}
