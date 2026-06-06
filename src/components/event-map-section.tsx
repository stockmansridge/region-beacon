import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  EVENT_ASSETS_BUCKET,
  getEventAssetPublicUrl,
  deleteEventAssetSafely,
} from "@/lib/event-assets";

/**
 * Event map / site map uploader.
 *
 * Lets an admin upload an image (PNG/JPG/WebP) or PDF that will be shown
 * on the public Map page when no venues have geocoded coordinates.
 *
 * Storage path: event-assets/{agency_id}/{event_id}/map/{uuid}.{ext}
 * Persisted on event_branding via RPC `save_event_map` / `clear_event_map`.
 */

const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const IMAGE_MAX = 5 * 1024 * 1024; // 5 MB
const PDF_MAX = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

type MapRow = {
  event_map_path: string | null;
  event_map_file_type: string | null;
  event_map_file_name: string | null;
};

function formatSupabaseError(error: any) {
  if (!error) return "Unknown error";
  const parts = [
    error.message,
    error.details,
    error.hint,
    error.code ? `Code: ${error.code}` : null,
    error.name ? `Name: ${error.name}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : JSON.stringify(error, null, 2);
}

export function EventMapSection({
  agencyId,
  eventId,
  canEdit,
}: {
  agencyId: string;
  eventId: string;
  canEdit: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<MapRow>({
    event_map_path: null,
    event_map_file_type: null,
    event_map_file_name: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error: e } = await supabase
        .from("event_branding")
        .select("event_map_path, event_map_file_type, event_map_file_name")
        .eq("event_id", eventId)
        .maybeSingle();
      if (cancelled) return;
      if (e) {
        setError(formatSupabaseError(e));
      } else if (data) {
        setRow(data as MapRow);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function handleFile(file: File) {
    setError(null);
    if (!ALLOWED_MIME.has(file.type)) {
      setError("Unsupported file type. Use PNG, JPG, WebP, or PDF.");
      return;
    }
    const cap = file.type === "application/pdf" ? PDF_MAX : IMAGE_MAX;
    if (file.size === 0) {
      setError("File is empty.");
      return;
    }
    if (file.size > cap) {
      setError(
        `File too large. Max ${Math.round(cap / (1024 * 1024))} MB for ${
          file.type === "application/pdf" ? "PDF" : "images"
        }.`,
      );
      return;
    }

    setBusy(true);
    try {
      const ext = EXT_BY_MIME[file.type];
      const filename = `${crypto.randomUUID()}.${ext}`;
      const path = `${agencyId}/${eventId}/map/${filename}`;
      const previousPath = row.event_map_path;

      const { error: upErr } = await supabase.storage
        .from(EVENT_ASSETS_BUCKET)
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
          cacheControl: "3600",
        });
      if (upErr) {
        setError(`Upload failed: ${formatSupabaseError(upErr)}`);
        return;
      }

      const { error: rpcErr } = await supabase.rpc("save_event_map", {
        p_event_id: eventId,
        p_path: path,
        p_mime: file.type,
        p_filename: file.name,
      });
      if (rpcErr) {
        // Roll back the uploaded object so we don't orphan it.
        await deleteEventAssetSafely(path);
        setError(`Save failed: ${formatSupabaseError(rpcErr)}`);
        return;
      }

      // Drop the previous object — best effort.
      if (previousPath && previousPath !== path) {
        await deleteEventAssetSafely(previousPath);
      }

      setRow({
        event_map_path: path,
        event_map_file_type: file.type,
        event_map_file_name: file.name,
      });
      toast.success("Event map saved");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!row.event_map_path) return;
    if (!window.confirm("Remove the uploaded event map?")) return;
    setError(null);
    setBusy(true);
    try {
      const previousPath = row.event_map_path;
      const { error: rpcErr } = await supabase.rpc("clear_event_map", {
        p_event_id: eventId,
      });
      if (rpcErr) {
        setError(`Remove failed: ${formatSupabaseError(rpcErr)}`);
        return;
      }
      await deleteEventAssetSafely(previousPath);
      setRow({
        event_map_path: null,
        event_map_file_type: null,
        event_map_file_name: null,
      });
      toast.success("Event map removed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const url = getEventAssetPublicUrl(row.event_map_path);
  const isImage =
    row.event_map_file_type !== null &&
    row.event_map_file_type.startsWith("image/");
  const isPdf = row.event_map_file_type === "application/pdf";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Use this when your event does not need individual venue addresses.
        If no venues have map locations, this uploaded map will be shown on
        the public site instead of the venue map.
      </p>

      {row.event_map_path && url ? (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          {isImage && (
            <a href={url} target="_blank" rel="noopener noreferrer">
              <img
                src={url}
                alt="Current event map"
                className="max-h-80 w-full rounded-md border object-contain"
              />
            </a>
          )}
          {isPdf && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              View current map (PDF)
            </a>
          )}
          <p className="text-xs text-muted-foreground">
            {row.event_map_file_name ?? row.event_map_path}
          </p>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">
                {busy ? "Uploading…" : "Replace map"}
                <input
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void handleFile(f);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={handleRemove}
                disabled={busy}
                className="rounded-md border bg-background px-3 py-2 text-sm font-medium text-destructive hover:bg-muted disabled:opacity-50"
              >
                Remove map
              </button>
            </div>
          )}
        </div>
      ) : canEdit ? (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">
          {busy ? "Uploading…" : "Upload event map"}
          <input
            type="file"
            accept={ACCEPT}
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void handleFile(f);
            }}
          />
        </label>
      ) : (
        <p className="text-sm text-muted-foreground">
          No event map uploaded.
        </p>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive whitespace-pre-wrap">
          {error}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Accepted: PNG, JPG, WebP (max 5 MB) or PDF (max 10 MB).
      </p>
    </div>
  );
}
