// Custom (uploaded) event fonts.
//
// Fonts live in the public `event-fonts` Storage bucket at
//   {agency_id}/{event_id}/font/{uuid}.{ext}
// and are indexed in public.event_custom_fonts (family_name -> storage_path).
//
// Because the table is publicly readable, any surface that only knows the
// persisted family name (e.g. EventPaletteScope on a public page) can resolve
// the file URL and register an @font-face at runtime.
//
// Browser-safe: uses the anon Supabase client only.

import { supabase } from "@/integrations/supabase/client";

export const EVENT_FONTS_BUCKET = "event-fonts";

export const CUSTOM_FONT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export type CustomFontFormat = "woff2" | "woff" | "ttf" | "otf";

export type EventCustomFont = {
  id: string;
  event_id: string;
  family_name: string;
  storage_path: string;
  file_format: string;
};

const FORMAT_BY_EXT: Record<string, CustomFontFormat> = {
  woff2: "woff2",
  woff: "woff",
  ttf: "ttf",
  otf: "otf",
};

const CSS_FORMAT: Record<CustomFontFormat, string> = {
  woff2: "woff2",
  woff: "woff",
  ttf: "truetype",
  otf: "opentype",
};

const MIME_BY_FORMAT: Record<CustomFontFormat, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};

export function customFontStack(family: string): string {
  return `'${family.replace(/'/g, "")}', ui-sans-serif, system-ui, sans-serif`;
}

export function extOf(filename: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename.trim());
  return (m?.[1] ?? "").toLowerCase();
}

export function detectFontFormat(file: File): CustomFontFormat | null {
  return FORMAT_BY_EXT[extOf(file.name)] ?? null;
}

/** Suggest a family name from the uploaded filename. */
export function suggestFamilyName(filename: string): string {
  const base = filename.replace(/\.[A-Za-z0-9]+$/, "");
  return base
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function validateFamilyName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return "Give the font a name (at least 2 characters).";
  if (trimmed.length > 60) return "Font name must be 60 characters or fewer.";
  if (!/^[A-Za-z0-9 .&'’+-]+$/.test(trimmed)) {
    return "Use letters, numbers, spaces and simple punctuation only.";
  }
  return null;
}

export function getCustomFontUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  const { data } = supabase.storage.from(EVENT_FONTS_BUCKET).getPublicUrl(storagePath);
  return data?.publicUrl ?? null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listEventCustomFonts(eventId: string): Promise<EventCustomFont[]> {
  const { data, error } = await supabase
    .from("event_custom_fonts" as any)
    .select("id, event_id, family_name, storage_path, file_format")
    .eq("event_id", eventId)
    .order("family_name", { ascending: true });
  if (error) return [];
  return ((data ?? []) as unknown as EventCustomFont[]);
}

async function findCustomFontByFamily(family: string): Promise<EventCustomFont | null> {
  const { data, error } = await supabase
    .from("event_custom_fonts" as any)
    .select("id, event_id, family_name, storage_path, file_format")
    .ilike("family_name", family.trim())
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return null;
  const row = (data ?? [])[0] as unknown as EventCustomFont | undefined;
  return row ?? null;
}

// ---------------------------------------------------------------------------
// @font-face registration
// ---------------------------------------------------------------------------

const registered = new Set<string>();

export function injectFontFace(family: string, url: string, format: string) {
  if (typeof document === "undefined") return;
  const key = `${family.toLowerCase()}|${url}`;
  if (registered.has(key)) return;
  registered.add(key);
  const fmt = CSS_FORMAT[(format as CustomFontFormat)] ?? "woff2";
  const style = document.createElement("style");
  style.dataset.customFont = family;
  style.textContent = `@font-face{font-family:'${family.replace(/'/g, "")}';src:url('${url}') format('${fmt}');font-weight:100 900;font-display:swap;}`;
  document.head.appendChild(style);
}

/**
 * Register @font-face declarations for any family value that is not a curated
 * Google/system font. Safe to call repeatedly; network lookups are cached.
 */
const lookupCache = new Map<string, Promise<EventCustomFont | null>>();

export async function ensureCustomFontFaces(
  families: Array<string | null | undefined>,
): Promise<void> {
  if (typeof document === "undefined") return;
  const wanted = Array.from(
    new Set(
      families
        .map((f) => (f ?? "").split(",")[0].replace(/['"]/g, "").trim())
        .filter((f) => f.length > 0),
    ),
  );
  await Promise.all(
    wanted.map(async (family) => {
      const key = family.toLowerCase();
      let promise = lookupCache.get(key);
      if (!promise) {
        promise = findCustomFontByFamily(family);
        lookupCache.set(key, promise);
      }
      const row = await promise;
      if (!row) return;
      const url = getCustomFontUrl(row.storage_path);
      if (url) injectFontFace(row.family_name, url, row.file_format);
    }),
  );
}

/** Register every uploaded font for an event (used by the branding editor). */
export function registerCustomFonts(fonts: EventCustomFont[]) {
  for (const f of fonts) {
    const url = getCustomFontUrl(f.storage_path);
    if (url) injectFontFace(f.family_name, url, f.file_format);
  }
}

// ---------------------------------------------------------------------------
// Upload / delete
// ---------------------------------------------------------------------------

export type UploadCustomFontResult =
  | { ok: true; font: EventCustomFont }
  | { ok: false; error: string };

export async function uploadEventCustomFont(args: {
  agencyId: string;
  eventId: string;
  familyName: string;
  file: File;
}): Promise<UploadCustomFontResult> {
  const format = detectFontFormat(args.file);
  if (!format) {
    return { ok: false, error: "Unsupported file type. Upload a .woff2, .woff, .ttf or .otf font file." };
  }
  if (args.file.size === 0) return { ok: false, error: "That file is empty." };
  if (args.file.size > CUSTOM_FONT_MAX_BYTES) {
    return { ok: false, error: "Font file is too large. Maximum size is 2 MB." };
  }
  const nameError = validateFamilyName(args.familyName);
  if (nameError) return { ok: false, error: nameError };

  const family = args.familyName.trim();
  const path = `${args.agencyId}/${args.eventId}/font/${crypto.randomUUID()}.${format}`;

  const { error: upErr } = await supabase.storage
    .from(EVENT_FONTS_BUCKET)
    .upload(path, args.file, {
      contentType: MIME_BY_FORMAT[format],
      upsert: false,
      cacheControl: "31536000",
    });
  if (upErr) {
    return {
      ok: false,
      error:
        upErr.message ||
        "Upload failed. Check that you have permission to edit this event.",
    };
  }

  const { data, error } = await supabase
    .from("event_custom_fonts" as any)
    .insert({
      event_id: args.eventId,
      family_name: family,
      storage_path: path,
      file_format: format,
      file_size: args.file.size,
      rights_confirmed: true,
    } as any)
    .select("id, event_id, family_name, storage_path, file_format")
    .single();

  if (error || !data) {
    // Roll back the orphaned object.
    try {
      await supabase.storage.from(EVENT_FONTS_BUCKET).remove([path]);
    } catch {
      /* ignore */
    }
    const msg = error?.message ?? "Could not save the font.";
    if (error?.code === "23505" || /duplicate key/i.test(msg)) {
      return { ok: false, error: "A font with that name already exists for this event." };
    }
    if (error?.code === "42P01") {
      return {
        ok: false,
        error:
          "Custom fonts aren't set up on this database yet. Run the event_custom_fonts migration, then try again.",
      };
    }
    return { ok: false, error: msg };
  }

  const font = data as unknown as EventCustomFont;
  const url = getCustomFontUrl(font.storage_path);
  if (url) injectFontFace(font.family_name, url, font.file_format);
  lookupCache.delete(font.family_name.toLowerCase());
  return { ok: true, font };
}

export async function deleteEventCustomFont(font: EventCustomFont): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("event_custom_fonts" as any)
    .delete()
    .eq("id", font.id);
  if (error) return { ok: false, error: error.message };
  try {
    await supabase.storage.from(EVENT_FONTS_BUCKET).remove([font.storage_path]);
  } catch {
    /* ignore */
  }
  lookupCache.delete(font.family_name.toLowerCase());
  return { ok: true };
}
