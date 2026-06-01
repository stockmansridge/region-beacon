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
import { buildAppleMapsDirectionsUrl } from "@/lib/venue-directions";

/**
 * Admin editor for a venue's public profile.
 *
 * Image uploads write to:
 *   event-assets/{agency_id}/{event_id}/venues/{venue_id}/{logo|cover}/{uuid}.{ext}
 * Allowed: PNG / JPG / WebP. Logo ≤ 1 MB, cover ≤ 5 MB.
 *
 * "About their offer" (offer_summary) is feature-detected at open time so the
 * UI works whether or not the draft migration
 * `migrations-draft-venue-offer-summary/01_venues_offer_summary.sql`
 * has been applied yet. When the column is missing, the section is hidden and
 * never written.
 */
export type VenuePublicProfile = {
  id: string;
  name: string;
  description: string | null;
  website_url: string | null;
  phone: string | null;
  logo_path: string | null;
  cover_path: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

const DESCRIPTION_MAX = 1200;
const OFFER_MAX = 800;
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
  const [offerSummary, setOfferSummary] = useState("");
  const [offerSupported, setOfferSupported] = useState<boolean | null>(null);
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
    setOfferSummary("");
    setOfferSupported(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  // Feature-detect offer_summary when the dialog opens for a venue. We do a
  // tolerant probe so the column being absent (PostgREST PGRST204 / Postgres
  // 42703) cleanly hides the section without breaking the rest of the form.
  useEffect(() => {
    if (!open || !venueId || !agencyId) return;
    let cancelled = false;
    (async () => {
      const { data, error: probeErr } = await supabase
        .from("venues")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("offer_summary" as any)
        .eq("id", venueId)
        .eq("event_id", eventId)
        .eq("agency_id", agencyId)
        .maybeSingle();
      if (cancelled) return;
      if (probeErr) {
        setOfferSupported(false);
        return;
      }
      setOfferSupported(true);
      const row = (data ?? {}) as { offer_summary?: string | null };
      setOfferSummary(row.offer_summary ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, venueId, eventId, agencyId]);

  function validate(): string | null {
    if (description.length > DESCRIPTION_MAX) {
      return `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
    }
    if (offerSupported && offerSummary.length > OFFER_MAX) {
      return `Offer summary must be ${OFFER_MAX} characters or fewer.`;
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
    const patch: Record<string, string | null> = {
      description: description.trim() ? description.trim() : null,
      website_url: website.trim() ? website.trim() : null,
      phone: phone.trim() ? phone.trim() : null,
    };
    if (offerSupported) {
      patch.offer_summary = offerSummary.trim() ? offerSummary.trim() : null;
    }
    const { error: upErr } = await supabase
      .from("venues")
      .update(patch)
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
      await deleteVenueAssetSafely(result.path);
      setBusyKind(null);
      setError(`Could not update venue: ${dbErr.message}`);
      return;
    }

    if (kind === "logo") setLogoPath(result.path);
    else setCoverPath(result.path);

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

  const directionsUrl = venue
    ? buildAppleMapsDirectionsUrl({
        name: venue.name,
        address: venue.address,
        lat: venue.lat,
        lng: venue.lng,
      })
    : null;

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

        <div className="space-y-6">
          {/* 1. Branding */}
          <SectionHeader title="Venue branding" />
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
              label="Hero / cover image"
              helpText={`Wide hero image. PNG / JPG / WebP, up to ${mb(VENUE_ASSET_MAX_BYTES.cover)}.`}
              path={coverPath}
              canEdit={canEdit}
              busy={busyKind === "cover"}
              onUpload={(f) => handleUpload("cover", f)}
              onRemove={() => handleRemove("cover")}
            />
          </div>

          {/* 2. About the venue */}
          <SectionHeader title="About the venue" />
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

          {/* 3. About their offer */}
          <SectionHeader title="About their offer" />
          {offerSupported === false ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Offer field not yet available — the
              <span className="font-mono"> venues.offer_summary </span>
              column hasn't been added to this environment. Apply the draft
              migration in
              <span className="font-mono"> migrations-draft-venue-offer-summary </span>
              to enable it.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="venue-offer">Offer summary</Label>
              <Textarea
                id="venue-offer"
                value={offerSummary}
                onChange={(e) => setOfferSummary(e.target.value)}
                rows={4}
                maxLength={OFFER_MAX + 50}
                placeholder="e.g. Complimentary tasting flight on arrival, plus a bonus stamp for trail visitors."
                disabled={!canEdit || saving || offerSupported === null}
              />
              <p className="text-xs text-muted-foreground">
                Describe what visitors can expect, such as a tasting offer,
                discount, bonus stamp, or prize-related experience.{" "}
                {offerSummary.length}/{OFFER_MAX}
              </p>
            </div>
          )}

          {/* 4. Contact and location */}
          <SectionHeader title="Contact and location" />
          <div className="space-y-3">
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

            <ReadOnlyField label="Address" value={venue?.address ?? null} />
            <div className="grid grid-cols-2 gap-3">
              <ReadOnlyField
                label="Latitude"
                value={venue?.lat !== null && venue?.lat !== undefined ? String(venue.lat) : null}
              />
              <ReadOnlyField
                label="Longitude"
                value={venue?.lng !== null && venue?.lng !== undefined ? String(venue.lng) : null}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Address and coordinates are edited in the main venue form
              (Advanced &gt; Coordinates).
            </p>
          </div>

          {/* 5. Directions */}
          <SectionHeader title="Directions" />
          {directionsUrl ? (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/50"
            >
              Preview “Get directions” (Apple Maps) ↗
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add an address or coordinates to enable the “Get directions”
              link on the public venue page.
            </p>
          )}

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

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="border-b pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </h3>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
        {value && value.trim().length > 0 ? value : <span className="text-muted-foreground">—</span>}
      </div>
    </div>
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
            Only organisation owners and admins can change images.
          </p>
        )}
      </div>
    </div>
  );
}
