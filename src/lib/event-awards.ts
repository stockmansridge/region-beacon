// Event Awards / Prizes — client helpers.
//
// Wraps the SECURITY DEFINER RPCs (see
// supabase/migrations-draft-event-awards/) and provides an image upload
// helper that reuses the existing `event-assets` public storage bucket
// under {agency_id}/{event_id}/awards/{uuid}.{ext}.

import { supabase } from "@/integrations/supabase/client";
import { EVENT_ASSETS_BUCKET } from "@/lib/event-assets";

export type AwardStatus = "active" | "disabled";

export type AdminEventAward = {
  id: string;
  event_id: string;
  agency_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  points_required: number;
  requires_all_locations: boolean;
  status: AwardStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
  eligible_count: number;
  latest_draw_id: string | null;
  latest_drawn_at: string | null;
  latest_winner_name: string | null;
  latest_winner_email: string | null;
  latest_eligible_count: number | null;
  /** ISO date (YYYY-MM-DD) or null. Undefined when the draw_date migration
   *  hasn't been applied yet — treat undefined and null the same. */
  draw_date?: string | null;
};


export type AwardDrawResult = {
  draw_id: string;
  award_title: string;
  winner_passport_id: string;
  winner_participant_name: string | null;
  winner_participant_email: string | null;
  eligible_count: number;
  drawn_at: string;
};

export type AwardDrawHistoryRow = {
  id: string;
  award_id: string;
  award_title: string;
  points_required: number;
  requires_all_locations: boolean;
  winner_participant_name: string | null;
  winner_participant_email: string | null;
  eligible_count: number;
  drawn_by: string | null;
  drawn_at: string;
  notes: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
};

export type VoidAwardDrawResult = {
  id: string;
  award_id: string;
  event_id: string;
  voided_at: string;
  voided_by: string | null;
  void_reason: string | null;
};

export async function voidAwardDraw(
  drawId: string,
  reason: string | null,
): Promise<VoidAwardDrawResult> {
  const { data, error } = await supabase.rpc("void_event_award_draw" as never, {
    p_draw_id: drawId,
    p_reason: reason,
  } as never);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Void returned no result");
  return row as VoidAwardDrawResult;
}

export type PublicEventAward = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  points_required: number;
  requires_all_locations: boolean;
  eligible_count: number;
  passport_points: number;
  passport_visited_count: number;
  event_venue_count: number;
  is_eligible: boolean;
  points_remaining: number;
  needs_all_locations: boolean;
  sort_order: number;
  /** ISO date (YYYY-MM-DD) or null. Undefined when the draw_date migration
   *  hasn't been applied yet — treat undefined and null the same. */
  draw_date?: string | null;
};

export type SaveAwardInput = {
  awardId: string | null;
  eventId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  pointsRequired: number;
  requiresAllLocations: boolean;
  status: AwardStatus;
  sortOrder: number;
  /** Optional YYYY-MM-DD; null clears. */
  drawDate: string | null;
};

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_BYTES = 5 * 1024 * 1024;

export async function listAdminAwards(eventId: string): Promise<AdminEventAward[]> {
  const { data, error } = await supabase.rpc("get_event_awards_admin" as never, {
    p_event_id: eventId,
  } as never);
  if (error) throw error;
  return (data ?? []) as AdminEventAward[];
}

/** Returns true when the error looks like "function signature not found",
 *  which happens when the draw_date migration hasn't been applied. */
function isMissingSignatureError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code;
  const msg = (e?.message || "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    msg.includes("could not find") ||
    msg.includes("no function matches") ||
    msg.includes("does not exist")
  );
}

export async function saveAward(input: SaveAwardInput): Promise<AdminEventAward> {
  const basePayload = {
    p_award_id: input.awardId,
    p_event_id: input.eventId,
    p_title: input.title,
    p_description: input.description,
    p_image_url: input.imageUrl,
    p_points_required: input.pointsRequired,
    p_requires_all_locations: input.requiresAllLocations,
    p_status: input.status,
    p_sort_order: input.sortOrder,
  };
  // Try the new signature first (includes p_draw_date).
  const { data, error } = await supabase.rpc("save_event_award" as never, {
    ...basePayload,
    p_draw_date: input.drawDate,
  } as never);
  if (!error) return data as AdminEventAward;
  if (!isMissingSignatureError(error)) throw error;
  // Fallback: old signature without p_draw_date. draw_date will be ignored
  // until the migration is applied.
  const fallback = await supabase.rpc("save_event_award" as never, basePayload as never);
  if (fallback.error) throw fallback.error;
  return fallback.data as AdminEventAward;
}


export async function deleteAward(awardId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_event_award" as never, {
    p_award_id: awardId,
  } as never);
  if (error) throw error;
}

export async function drawAwardWinner(awardId: string): Promise<AwardDrawResult> {
  const { data, error } = await supabase.rpc("draw_event_award_winner" as never, {
    p_award_id: awardId,
  } as never);
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Draw returned no result");
  return row as AwardDrawResult;
}

export async function listAwardDrawHistory(eventId: string): Promise<AwardDrawHistoryRow[]> {
  const { data, error } = await supabase.rpc("get_event_award_draws_admin" as never, {
    p_event_id: eventId,
  } as never);
  if (error) throw error;
  return (data ?? []) as AwardDrawHistoryRow[];
}

export async function listPublicAwards(
  eventId: string,
  passportId: string | null,
): Promise<PublicEventAward[]> {
  const { data, error } = await supabase.rpc("get_public_event_awards" as never, {
    p_event_id: eventId,
    p_passport_id: passportId,
  } as never);
  if (error) throw error;
  return (data ?? []) as PublicEventAward[];
}

export type AwardImageUploadResult =
  | { ok: true; path: string; publicUrl: string }
  | { ok: false; error: string };

export function validateAwardImage(file: File): { ok: true } | { ok: false; error: string } {
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, error: "Use PNG, JPG, or WebP (SVG is not allowed)." };
  }
  if (file.size === 0) return { ok: false, error: "File is empty." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File must be 5 MB or smaller." };
  return { ok: true };
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function uploadAwardImage(args: {
  agencyId: string;
  eventId: string;
  file: File;
}): Promise<AwardImageUploadResult> {
  const v = validateAwardImage(args.file);
  if (!v.ok) return v;
  const ext = EXT[args.file.type] ?? "png";
  const id = crypto.randomUUID();
  const path = `${args.agencyId}/${args.eventId}/awards/${id}.${ext}`;
  const { error } = await supabase.storage
    .from(EVENT_ASSETS_BUCKET)
    .upload(path, args.file, {
      contentType: args.file.type,
      upsert: false,
      cacheControl: "3600",
    });
  if (error) {
    // Surface the real Supabase storage error so admins can diagnose
    // RLS / path-policy / mime-type failures instead of a generic message.
    const e = error as {
      message?: string;
      error?: string;
      statusCode?: string | number;
      name?: string;
    };
    const parts = [
      e.message || e.error || "Upload failed.",
      e.statusCode ? `status ${e.statusCode}` : null,
      `bucket ${EVENT_ASSETS_BUCKET}`,
      `path ${path}`,
    ].filter(Boolean);
    // eslint-disable-next-line no-console
    console.error("Award image upload failed", {
      bucket: EVENT_ASSETS_BUCKET,
      path,
      file: { name: args.file.name, type: args.file.type, size: args.file.size },
      error,
    });
    return { ok: false, error: parts.join(" · ") };
  }
  const { data } = supabase.storage.from(EVENT_ASSETS_BUCKET).getPublicUrl(path);
  return { ok: true, path, publicUrl: data.publicUrl };
}

export async function hasActiveAwards(eventId: string): Promise<boolean> {
  // Cheap public check used by nav visibility: anonymous call (no passport).
  try {
    const rows = await listPublicAwards(eventId, null);
    return rows.length > 0;
  } catch {
    return false;
  }
}
