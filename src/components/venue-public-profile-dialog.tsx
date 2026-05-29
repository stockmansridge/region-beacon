import { useState } from "react";
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

/**
 * Admin editor for a venue's public profile (text fields only).
 *
 * Image uploads (logo / cover) are intentionally NOT wired here yet — the
 * current `event-assets` storage RLS only permits
 *   {agency}/{event}/{logo|cover}/{file}
 * paths and rejects the venue-level
 *   {agency}/{event}/venues/{venue}/{logo|cover}/{file}
 * path. A draft policy update is in
 *   supabase/migrations-draft-venue-public-pages-storage/
 * and must be applied to staging before the upload UI is enabled.
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset form state when the target venue changes.
  const venueId = venue?.id ?? null;
  useResetOnVenueChange(venueId, () => {
    setDescription(venue?.description ?? "");
    setWebsite(venue?.website_url ?? "");
    setPhone(venue?.phone ?? "");
    setError(null);
  });

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit public page</DialogTitle>
          <DialogDescription>
            {venue?.name ? <>Public profile for <strong>{venue.name}</strong>.</> : "Public profile."}{" "}
            These fields will appear on the visitor-facing venue page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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

          <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Logo & cover image upload</p>
            <p className="mt-1">
              Coming soon. Storage policy update for venue-level paths is drafted in
              {" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                supabase/migrations-draft-venue-public-pages-storage/
              </code>
              {" "}and must be applied to staging before uploads are enabled.
            </p>
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

// Small helper so the dialog re-syncs local state when switching venues.
import { useEffect } from "react";
function useResetOnVenueChange(venueId: string | null, reset: () => void) {
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);
}
