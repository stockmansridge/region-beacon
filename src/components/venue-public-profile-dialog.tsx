import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteVenueAssetSafely,
  getVenueAssetPublicUrl,
  uploadVenueAsset,
  VENUE_ASSET_ALLOWED_MIME,
  VENUE_ASSET_MAX_BYTES,
  type VenueAssetKind,
} from "@/lib/venue-assets";

/**
 * Admin editor for a venue's public profile.
 *
 * Image uploads now write to:
 *   event-assets/{agency_id}/{event_id}/venues/{venue_id}/{logo|cover}/{uuid}.{ext}
 * Allowed: PNG / JPG / WebP. Logo ≤ 1 MB, cover ≤ 5 MB.
 * Writer gate (platform_admin | agency_owner | agency_admin) is enforced
 * server-side by storage RLS; the UI hides controls for other roles.
 */
export type VenuePublicProfile = {
  id: string;
  name: string;
  description: string | null;
  website_url: string | null;
  phone: string | null;
  logo_path: string | null;
  cover_path: string | null;
};

const DESCRIPTION_MAX = 1200;
const PHONE_MAX = 40;
const ACCEPT_ATTR = VENUE_ASSET_ALLOWED_MIME.join(",");

export function VenuePublicProfileDialog({
  open,
  onOpenChange,
  venue,
  eventId,
  agencyId,
  canEdit,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  venue: VenuePublicProfile | null;
  eventId: string;
  agencyId: string | null;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(venue?.description ?? "");
  const [website, setWebsite] = useState(venue?.website_url ?? "");
  const [phone, setPhone] = useState(venue?.phone ?? "");
  const [logoPath, setLogoPath] = useState<string | null>(venue?.logo_path ?? null);
  const [coverPath, setCoverPath] = useState<string | null>(venue?.cover_path ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyKind, setBusyKind] = useState<VenueAssetKind | null>(null);

  // Reset on venue change.
  const venueId = venue?.id ?? null;
  useEffect(() => {
    setDescription(venue?.description ?? "");
    setWebsite(venue?.website_url ?? "");
    setPhone(venue?.phone ?? "");
    setLogoPath(venue?.logo_path ?? null);
    setCoverPath(venue?.cover_path ?? null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  function validate(): string | null {
    if (description.length > DESCRIPTION_MAX) {
      return `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
    }
    const w = website.trim();
    if (w.length > 0 && !/^https:\/\//i.test(w)) {
      return "Website URL must start with https://";
    }
    const p = phone.trim();
    if (p.length > PHONE_MAX) {
      return `Phone must be ${PHONE_MAX} characters or fewer.`;
    }
    if (p.length > 0 && !/^\+?[0-9 \-]{6,40}$/.test(p)) {
      return "Phone may only contain digits, spaces, dashes, and an optional leading +.";
    }
    return null;
  }

  async function handleSave() {
    if (!venue || !agencyId) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSaving(true);
    const { error: upErr } = await supabase
      .from("venues")
      .update({
        description: description.trim() ? description.trim() : null,
        website_url: website.trim() ? website.trim() : null,
        phone: phone.trim() ? phone.trim() : null,
      })
      .eq("id", venue.id)
      .eq("event_id", eventId)
      .eq("agency_id", agencyId);
    setSaving(false);
    if (upErr) {
      setError(`Could not save: ${upErr.message}`);
      return;
    }
    onSaved();
    onOpenChange(false);
  }

  async function handleUpload(kind: VenueAssetKind, file: File) {
    if (!venue || !agencyId) return;
    setError(null);
    setBusyKind(kind);
    const previous = kind === "logo" ? logoPath : coverPath;

    const result = await uploadVenueAsset({
      agencyId,
      eventId,
      venueId: venue.id,
      kind,
      file,
    });
    if (!result.ok) {
      setBusyKind(null);
      setError(result.error);
      return;
    }

    const column = kind === "logo" ? "logo_path" : "cover_path";
    const { error: dbErr } = await supabase
      .from("venues")
      .update({ [column]: result.path })
      .eq("id", venue.id)
      .eq("event_id", eventId)
      .eq("agency_id", agencyId);

    if (dbErr) {
      // Roll back the just-uploaded object so we don't leak.
      await deleteVenueAssetSafely(result.path);
      setBusyKind(null);
      setError(`Could not update venue: ${dbErr.message}`);
      return;
    }

    if (kind === "logo") setLogoPath(result.path);
    else setCoverPath(result.path);

    // Best-effort cleanup of the prior object.
    if (previous && previous !== result.path) {
      await deleteVenueAssetSafely(previous);
    }
    setBusyKind(null);
    onSaved();
  }

  async function handleRemove(kind: VenueAssetKind) {
    if (!venue || !agencyId) return;
    const previous = kind === "logo" ? logoPath : coverPath;
    if (!previous) return;
    setError(null);
    setBusyKind(kind);

    const column = kind === "logo" ? "logo_path" : "cover_path";
    const { error: dbErr } = await supabase
      .from("venues")
      .update({ [column]: null })
      .eq("id", venue.id)
      .eq("event_id", eventId)
      .eq("agency_id", agencyId);

    if (dbErr) {
      setBusyKind(null);
      setError(`Could not remove image: ${dbErr.message}`);
      return;
    }

    if (kind === "logo") setLogoPath(null);
    else setCoverPath(null);
    await deleteVenueAssetSafely(previous);
    setBusyKind(null);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit public page</DialogTitle>
          <DialogDescription>
            {venue?.name ? (
              <>
                Public profile for <strong>{venue.name}</strong>.
              </>
            ) : (
              "Public profile."
            )}{" "}
            These fields will appear on the visitor-facing venue page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <AssetField
            kind="logo"
            label="Logo"
            helpText={`Square works best. PNG / JPG / WebP, up to ${mb(VENUE_ASSET_MAX_BYTES.logo)}.`}
            path={logoPath}
            canEdit={canEdit}
            busy={busyKind === "logo"}
            onUpload={(f) => handleUpload("logo", f)}
            onRemove={() => handleRemove("logo")}
          />

          <AssetField
            kind="cover"
            label="Cover image"
            helpText={`Wide hero image. PNG / JPG / WebP, up to ${mb(VENUE_ASSET_MAX_BYTES.cover)}.`}
            path={coverPath}
            canEdit={canEdit}
            busy={busyKind === "cover"}
            onUpload={(f) => handleUpload("cover", f)}
            onRemove={() => handleRemove("cover")}
          />

          <div className="space-y-1.5">
            <Label htmlFor="venue-description">Description</Label>
            <Textarea
              id="venue-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              maxLength={DESCRIPTION_MAX + 50}
              placeholder="What makes this venue worth visiting?"
              disabled={!canEdit || saving}
            />
            <p className="text-xs text-muted-foreground">
              {description.length}/{DESCRIPTION_MAX}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venue-website">Website</Label>
            <Input
              id="venue-website"
              type="url"
              inputMode="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              disabled={!canEdit || saving}
            />
            <p className="text-xs text-muted-foreground">Must start with https://</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="venue-phone">Phone</Label>
            <Input
              id="venue-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+61 400 000 000"
              maxLength={PHONE_MAX}
              disabled={!canEdit || saving}
            />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canEdit || saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function mb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function AssetField({
  kind,
  label,
  helpText,
  path,
  canEdit,
  busy,
  onUpload,
  onRemove,
}: {
  kind: VenueAssetKind;
  label: string;
  helpText: string;
  path: string | null;
  canEdit: boolean;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewUrl = getVenueAssetPublicUrl(path);
  const isCover = kind === "cover";

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="rounded-md border bg-muted/20 p-3">
        {previewUrl ? (
          <div
            className={
              isCover
                ? "mb-3 aspect-[3/1] w-full overflow-hidden rounded bg-background"
                : "mb-3 h-24 w-24 overflow-hidden rounded bg-background"
            }
          >
            <img
              src={previewUrl}
              alt={`${label} preview`}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">No image uploaded.</p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            // allow re-selecting the same file
            e.target.value = "";
          }}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canEdit || busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Uploading…" : path ? "Replace" : "Upload"}
          </Button>
          {path && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!canEdit || busy}
              onClick={onRemove}
            >
              Remove
            </Button>
          )}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">{helpText}</p>
        {!canEdit && (
          <p className="mt-1 text-xs text-muted-foreground">
            Only agency owners and admins can change images.
          </p>
        )}
      </div>
    </div>
  );
}
