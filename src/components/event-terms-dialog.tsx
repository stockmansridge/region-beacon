import { useState } from "react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

// Append-only by design. Each save inserts a NEW event_terms_versions row
// and points events.current_terms_version_id at it. Past rows referenced by
// visitor_consents stay intact as historical evidence.

const HttpsUrl = z
  .string()
  .trim()
  .min(1, "Required")
  .max(2000, "Too long")
  .url("Must be a valid URL")
  .refine((u) => u.startsWith("https://"), "Must start with https://");

const FormSchema = z.object({
  version_label: z
    .string()
    .trim()
    .min(1, "Version label is required")
    .max(40, "Max 40 characters"),
  terms_url: HttpsUrl,
  privacy_url: HttpsUrl,
  effective_at: z
    .string()
    .trim()
    .min(1, "Effective date is required"),
});

export type EventTermsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string;
  eventId: string;
  initialVersionLabel?: string | null;
  onSaved: () => void;
};

function defaultEffectiveAt() {
  // datetime-local expects yyyy-MM-ddTHH:mm in local time
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventTermsDialog({
  open,
  onOpenChange,
  agencyId,
  eventId,
  initialVersionLabel,
  onSaved,
}: EventTermsDialogProps) {
  const [versionLabel, setVersionLabel] = useState(initialVersionLabel ?? "1.0");
  const [termsUrl, setTermsUrl] = useState("");
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [effectiveAt, setEffectiveAt] = useState(defaultEffectiveAt());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    const parsed = FormSchema.safeParse({
      version_label: versionLabel,
      terms_url: termsUrl,
      privacy_url: privacyUrl,
      effective_at: effectiveAt,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setSaving(true);
    try {
      const effective = new Date(parsed.data.effective_at);
      if (Number.isNaN(effective.getTime())) {
        setError("Invalid effective date");
        return;
      }

      const { data: userRes } = await supabase.auth.getUser();
      const publishedBy = userRes.user?.id ?? null;

      const { data: inserted, error: insertErr } = await supabase
        .from("event_terms_versions")
        .insert({
          agency_id: agencyId,
          event_id: eventId,
          terms_version: parsed.data.version_label,
          terms_url: parsed.data.terms_url,
          privacy_version: parsed.data.version_label,
          privacy_url: parsed.data.privacy_url,
          effective_at: effective.toISOString(),
          published_by: publishedBy,
        })
        .select("id")
        .single();

      if (insertErr || !inserted?.id) {
        setError(insertErr?.message ?? "Failed to create terms version");
        return;
      }

      const { error: updateErr } = await supabase
        .from("events")
        .update({ current_terms_version_id: inserted.id })
        .eq("id", eventId)
        .eq("agency_id", agencyId);

      if (updateErr) {
        setError(`Terms saved but failed to activate: ${updateErr.message}`);
        return;
      }

      onSaved();
      onOpenChange(false);
      // Reset to defaults for the next time it opens
      setTermsUrl("");
      setPrivacyUrl("");
      setEffectiveAt(defaultEffectiveAt());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure terms &amp; privacy</DialogTitle>
          <DialogDescription>
            Creates a new immutable terms version and sets it as this event's
            active version. Previous versions stay intact for historical consent
            records.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Version label" hint="e.g. 1.0, 2024-Q1">
            <input
              type="text"
              maxLength={40}
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              placeholder="1.0"
            />
          </Field>
          <Field label="Terms URL" hint="Must start with https://">
            <input
              type="url"
              inputMode="url"
              maxLength={2000}
              value={termsUrl}
              onChange={(e) => setTermsUrl(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              placeholder="https://example.com/terms"
            />
          </Field>
          <Field label="Privacy URL" hint="Must start with https://">
            <input
              type="url"
              inputMode="url"
              maxLength={2000}
              value={privacyUrl}
              onChange={(e) => setPrivacyUrl(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              placeholder="https://example.com/privacy"
            />
          </Field>
          <Field label="Effective date">
            <input
              type="datetime-local"
              value={effectiveAt}
              onChange={(e) => setEffectiveAt(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            />
          </Field>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save & activate"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
