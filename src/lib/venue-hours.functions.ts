import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const input = z.object({
  access_token: z.string().min(20).max(4000),
  venue_id: z.string().uuid(),
});

/** Admin "Refresh from Google" for one venue (re-matches the Google place). */
export const refreshVenueHoursNow = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => input.parse(raw))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin, getSupabaseAsUser } = await import("@/integrations/supabase/admin.server");
    const { syncVenueHours, HaltSync } = await import("@/lib/venue-hours.server");
    const user = getSupabaseAsUser(data.access_token);
    const { data: allowed, error: permErr } = await user.rpc("admin_can_manage_venue_hours", { _venue_id: data.venue_id });
    if (permErr) return { ok: false as const, error: `Permission check failed: ${permErr.message}` };
    if (!allowed) return { ok: false as const, error: "You don't have access to this venue." };

    const admin = getSupabaseAdmin();
    const { data: v, error } = await admin
      .from("venues")
      .select("id, agency_id, event_id, name, lat, lng, address")
      .eq("id", data.venue_id)
      .maybeSingle();
    if (error || !v) return { ok: false as const, error: "Venue not found." };
    if (v.lat == null || v.lng == null) return { ok: false as const, error: "Add the venue's location first." };
    try {
      const status = await syncVenueHours(admin, {
        venue_id: v.id, agency_id: v.agency_id, event_id: v.event_id, name: v.name,
        lat: Number(v.lat), lng: Number(v.lng), address: v.address ?? null, google_place_id: null,
      });
      return { ok: true as const, status };
    } catch (err) {
      return { ok: false as const, error: err instanceof HaltSync || err instanceof Error ? err.message : String(err) };
    }
  });
