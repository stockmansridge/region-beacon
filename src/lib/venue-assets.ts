// Venue asset upload helpers for the public `event-assets` Storage bucket.
//
// Path contract (matches storage RLS in
// supabase/migrations-draft-venue-public-pages-storage):
//   event-assets/{agency_id}/{event_id}/venues/{venue_id}/{kind}/{uuid}.{ext}
// where kind ∈ {"logo","cover"}.
//
// Server-side enforces MIME, 5MB cap, and writer role gate
// (platform_admin | agency_owner | agency_admin of the owning agency).
//
// Browser-safe — uses only the public anon Supabase client.

import { supabase } from "@/integrations/supabase/client";

export const VENUE_ASSETS_BUCKET = "event-assets";

export type VenueAssetKind = "logo" | "cover";

export const VENUE_ASSET_ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type VenueAssetMime = (typeof VENUE_ASSET_ALLOWED_MIME)[number];

export const VENUE_ASSET_MAX_BYTES: Record<VenueAssetKind, number> = {
  logo: 1 * 1024 * 1024, // 1 MB
  cover: 5 * 1024 * 1024, // 5 MB
};

const EXT_BY_MIME: Record<VenueAssetMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateVenueAssetFile(
  file: File,
  kind: VenueAssetKind,
): ValidationResult {
  const mime = file.type as VenueAssetMime;
  if (!VENUE_ASSET_ALLOWED_MIME.includes(mime)) {
    return {
      ok: false,
      error: "Unsupported file type. Use PNG, JPG, or WebP (SVG is not allowed).",
    };
  }
  const cap = VENUE_ASSET_MAX_BYTES[kind];
  if (file.size > cap) {
    return {
      ok: false,
      error: `File is too large. ${
        kind === "logo" ? "Logo" : "Cover image"
      } must be ${Math.round(cap / (1024 * 1024))} MB or smaller.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, error: "File is empty." };
  }
  return { ok: true };
}

export function buildVenueAssetPath(args: {
  agencyId: string;
  eventId: string;
  venueId: string;
  kind: VenueAssetKind;
  filename: string;
}): string {
  return `${args.agencyId}/${args.eventId}/venues/${args.venueId}/${args.kind}/${args.filename}`;
}

export type UploadResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

export async function uploadVenueAsset(args: {
  agencyId: string;
  eventId: string;
  venueId: string;
  kind: VenueAssetKind;
  file: File;
}): Promise<UploadResult> {
  const validation = validateVenueAssetFile(args.file, args.kind);
  if (!validation.ok) return validation;

  const mime = args.file.type as VenueAssetMime;
  const filename = `${crypto.randomUUID()}.${EXT_BY_MIME[mime]}`;
  const path = buildVenueAssetPath({
    agencyId: args.agencyId,
    eventId: args.eventId,
    venueId: args.venueId,
    kind: args.kind,
    filename,
  });

  const { error } = await supabase.storage
    .from(VENUE_ASSETS_BUCKET)
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
        "Upload failed. Check that you have permission to edit this venue.",
    };
  }
  return { ok: true, path };
}

export async function deleteVenueAssetSafely(path: string | null | undefined) {
  if (!path) return;
  try {
    await supabase.storage.from(VENUE_ASSETS_BUCKET).remove([path]);
  } catch {
    // ignore — stale objects are harmless and RLS still gates real deletes
  }
}

export function getVenueAssetPublicUrl(
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  const { data } = supabase.storage
    .from(VENUE_ASSETS_BUCKET)
    .getPublicUrl(path);
  return data?.publicUrl ?? null;
}
