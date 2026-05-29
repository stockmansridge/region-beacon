// Event asset upload helpers for the public `event-assets` Storage bucket.
//
// Bucket / path contract (matches storage RLS in
// supabase/migrations-draft-event-assets-storage):
//   event-assets/{agency_id}/{event_id}/{kind}/{uuid}.{ext}
// where kind ∈ {"logo","cover"}.
//
// Server-side enforces:
//   - bucket public read
//   - allowed MIME: image/png, image/jpeg, image/webp (no SVG)
//   - 5 MB hard cap
//   - write only by platform_admin or agency_owner/agency_admin of the
//     owning agency
//
// This file is browser-safe and only uses the public anon Supabase client.

import { supabase } from "@/integrations/supabase/client";

export const EVENT_ASSETS_BUCKET = "event-assets";

export type EventAssetKind = "logo" | "cover";

export const EVENT_ASSET_ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type EventAssetMime = (typeof EVENT_ASSET_ALLOWED_MIME)[number];

// Client-side limits. The bucket itself caps at 5 MB regardless.
export const EVENT_ASSET_MAX_BYTES: Record<EventAssetKind, number> = {
  logo: 1 * 1024 * 1024, // 1 MB
  cover: 5 * 1024 * 1024, // 5 MB
};

const EXT_BY_MIME: Record<EventAssetMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateEventAssetFile(
  file: File,
  kind: EventAssetKind,
): ValidationResult {
  const mime = file.type as EventAssetMime;
  if (!EVENT_ASSET_ALLOWED_MIME.includes(mime)) {
    return {
      ok: false,
      error: "Unsupported file type. Use PNG, JPG, or WebP (SVG is not allowed).",
    };
  }
  const cap = EVENT_ASSET_MAX_BYTES[kind];
  if (file.size > cap) {
    return {
      ok: false,
      error: `File is too large. ${kind === "logo" ? "Logo" : "Cover image"} must be ${formatMB(cap)} or smaller.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, error: "File is empty." };
  }
  return { ok: true };
}

function formatMB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function newAssetFilename(mime: EventAssetMime): string {
  const ext = EXT_BY_MIME[mime];
  // crypto.randomUUID is available in all browsers we target.
  const id = crypto.randomUUID();
  return `${id}.${ext}`;
}

export function buildEventAssetPath(args: {
  agencyId: string;
  eventId: string;
  kind: EventAssetKind;
  filename: string;
}): string {
  return `${args.agencyId}/${args.eventId}/${args.kind}/${args.filename}`;
}

export type UploadResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

export async function uploadEventAsset(args: {
  agencyId: string;
  eventId: string;
  kind: EventAssetKind;
  file: File;
}): Promise<UploadResult> {
  const validation = validateEventAssetFile(args.file, args.kind);
  if (!validation.ok) return validation;

  const filename = newAssetFilename(args.file.type as EventAssetMime);
  const path = buildEventAssetPath({
    agencyId: args.agencyId,
    eventId: args.eventId,
    kind: args.kind,
    filename,
  });

  const { error } = await supabase.storage
    .from(EVENT_ASSETS_BUCKET)
    .upload(path, args.file, {
      contentType: args.file.type,
      upsert: false,
      cacheControl: "3600",
    });

  if (error) {
    return {
      ok: false,
      error:
        error.message ||
        "Upload failed. Check that you have permission to edit this event.",
    };
  }
  return { ok: true, path };
}

/**
 * Best-effort delete. Failures are intentionally swallowed — the new path
 * has already been persisted, so a stale object is harmless and the storage
 * RLS will block unauthorised deletes anyway.
 */
export async function deleteEventAssetSafely(path: string | null | undefined) {
  if (!path) return;
  try {
    await supabase.storage.from(EVENT_ASSETS_BUCKET).remove([path]);
  } catch {
    // ignore
  }
}

/**
 * Resolve a stored path to a public URL. Returns null when the input is
 * empty so callers can render conditionally without branching twice.
 */
export function getEventAssetPublicUrl(
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from(EVENT_ASSETS_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}
