import { useEffect, useState } from "react";
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
import {
  DEFAULT_PRIVACY_BODY,
  DEFAULT_PRIVACY_TITLE,
  DEFAULT_TERMS_BODY,
  DEFAULT_TERMS_TITLE,
  LEGAL_DEFAULT_DISCLAIMER,
  LEGAL_LIMITS,
  applyLegalDefaultTokens,
} from "@/lib/legal-defaults";

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

const BaseSchema = z.object({
  version_label: z.string().trim().min(1, "Version label is required").max(40, "Max 40 characters"),
  effective_at: z.string().trim().min(1, "Effective date is required"),
});

const ExternalSchema = BaseSchema.extend({
  legal_source: z.literal("external_url"),
  terms_url: HttpsUrl,
  privacy_url: HttpsUrl,
});

const LocalSchema = BaseSchema.extend({
  legal_source: z.literal("local_text"),
  terms_title: z.string().trim().min(1, "Terms title is required").max(LEGAL_LIMITS.titleMax),
  terms_body: z.string().trim().min(1, "Terms body is required").max(LEGAL_LIMITS.bodyMax),
  privacy_title: z.string().trim().min(1, "Privacy title is required").max(LEGAL_LIMITS.titleMax),
  privacy_body: z.string().trim().min(1, "Privacy body is required").max(LEGAL_LIMITS.bodyMax),
});

const FormSchema = z.discriminatedUnion("legal_source", [ExternalSchema, LocalSchema]);

export type EventTermsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string;
  eventId: string;
  eventName: string;
  initialVersionLabel?: string | null;
  initialLegalSource?: "external_url" | "local_text" | null;
  initial?: {
    terms_title?: string | null;
    terms_body?: string | null;
    privacy_title?: string | null;
    privacy_body?: string | null;
    terms_url?: string | null;
    privacy_url?: string | null;
  } | null;
  onSaved: () => void;
};

function defaultEffectiveAt() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventTermsDialog({
  open,
  onOpenChange,
  agencyId,
  eventId,
  eventName,
  initialVersionLabel,
  initialLegalSource,
  initial,
  onSaved,
}: EventTermsDialogProps) {
  const [mode, setMode] = useState<"external_url" | "local_text">(
    initialLegalSource ?? "external_url",
  );
  const [versionLabel, setVersionLabel] = useState(initialVersionLabel ?? "1.0");
  const [termsUrl, setTermsUrl] = useState(initial?.terms_url ?? "");
  const [privacyUrl, setPrivacyUrl] = useState(initial?.privacy_url ?? "");
  const [termsTitle, setTermsTitle] = useState(initial?.terms_title ?? "");
  const [termsBody, setTermsBody] = useState(initial?.terms_body ?? "");
  const [privacyTitle, setPrivacyTitle] = useState(initial?.privacy_title ?? "");
  const [privacyBody, setPrivacyBody] = useState(initial?.privacy_body ?? "");
  const [effectiveAt, setEffectiveAt] = useState(defaultEffectiveAt());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when re-opened with fresh initial values.
  useEffect(() => {
    if (!open) return;
    setMode(initialLegalSource ?? "external_url");
    setVersionLabel(initialVersionLabel ?? "1.0");
    setTermsUrl(initial?.terms_url ?? "");
    setPrivacyUrl(initial?.privacy_url ?? "");
    setTermsTitle(initial?.terms_title ?? "");
    setTermsBody(initial?.terms_body ?? "");
    setPrivacyTitle(initial?.privacy_title ?? "");
    setPrivacyBody(initial?.privacy_body ?? "");
    setEffectiveAt(defaultEffectiveAt());
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function loadDefaults() {
    setTermsTitle(DEFAULT_TERMS_TITLE);
    setTermsBody(applyLegalDefaultTokens(DEFAULT_TERMS_BODY, eventName));
    setPrivacyTitle(DEFAULT_PRIVACY_TITLE);
    setPrivacyBody(applyLegalDefaultTokens(DEFAULT_PRIVACY_BODY, eventName));
  }

  async function handleSave() {
    setError(null);
    const payload =
      mode === "external_url"
        ? {
            legal_source: "external_url" as const,
            version_label: versionLabel,
            effective_at: effectiveAt,
            terms_url: termsUrl,
            privacy_url: privacyUrl,
          }
        : {
            legal_source: "local_text" as const,
            version_label: versionLabel,
            effective_at: effectiveAt,
            terms_title: termsTitle,
            terms_body: termsBody,
            privacy_title: privacyTitle,
            privacy_body: privacyBody,
          };

    const parsed = FormSchema.safeParse(payload);
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

      const insertRow =
        parsed.data.legal_source === "external_url"
          ? {
              agency_id: agencyId,
              event_id: eventId,
              legal_source: "external_url" as const,
              terms_version: parsed.data.version_label,
              terms_url: parsed.data.terms_url,
              privacy_version: parsed.data.version_label,
              privacy_url: parsed.data.privacy_url,
              terms_title: null,
              terms_body: null,
              privacy_title: null,
              privacy_body: null,
              effective_at: effective.toISOString(),
              published_by: publishedBy,
            }
          : {
              agency_id: agencyId,
              event_id: eventId,
              legal_source: "local_text" as const,
              terms_version: parsed.data.version_label,
              terms_url: null,
              privacy_version: parsed.data.version_label,
              privacy_url: null,
              terms_title: parsed.data.terms_title,
              terms_body: parsed.data.terms_body,
              privacy_title: parsed.data.privacy_title,
              privacy_body: parsed.data.privacy_body,
              effective_at: effective.toISOString(),
              published_by: publishedBy,
            };

      const { data: inserted, error: insertErr } = await supabase
        .from("event_terms_versions")
        .insert(insertRow as never)
        .select("id")
        .single();

      if (insertErr || !inserted?.id) {
        setError(insertErr?.message ?? "Failed to create terms version");
        return;
      }

      const { error: updateErr } = await supabase
        .from("events")
        .update({
          current_terms_version_id: inserted.id,
          legal_source: parsed.data.legal_source,
        })
        .eq("id", eventId)
        .eq("agency_id", agencyId);

      if (updateErr) {
        setError(`Terms saved but failed to activate: ${updateErr.message}`);
        return;
      }

      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configure terms &amp; privacy</DialogTitle>
          <DialogDescription>
            Creates a new immutable version and sets it as this event&apos;s active
            version. Previous versions stay intact for historical consent records.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-medium">Source</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ModeOption
                active={mode === "local_text"}
                onClick={() => setMode("local_text")}
                title="Use GetStampd local pages"
                hint="Hosted at /live/{subdomain}/terms and /privacy"
              />
              <ModeOption
                active={mode === "external_url"}
                onClick={() => setMode("external_url")}
                title="Use external URLs"
                hint="Link out to your own hosted pages"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Version label" hint="e.g. 1.0, 2024-Q1">
              <input
                type="text"
                maxLength={40}
                value={versionLabel}
                onChange={(e) => setVersionLabel(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                placeholder="1.0"
              />
            </Field>
            <Field label="Effective date">
              <input
                type="datetime-local"
                value={effectiveAt}
                onChange={(e) => setEffectiveAt(e.target.value)}
                className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
              />
            </Field>
          </div>

          {mode === "external_url" ? (
            <div className="space-y-3">
              <Field label="Terms URL" hint="Must start with https://">
                <input
                  type="url"
                  inputMode="url"
                  maxLength={2000}
                  value={termsUrl}
                  onChange={(e) => setTermsUrl(e.target.value)}
                  className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
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
                  className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                  placeholder="https://example.com/privacy"
                />
              </Field>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-[#FDBA74] bg-[#FFF7ED] px-4 py-3">
                <p className="text-xs text-amber-900">{LEGAL_DEFAULT_DISCLAIMER}</p>
                <button
                  type="button"
                  onClick={loadDefaults}
                  className="h-9 rounded-[10px] border border-[#FDBA74] bg-white px-3.5 text-sm font-semibold text-[#B45309] hover:bg-[#FFF7ED]"
                >
                  Load default templates
                </button>
              </div>

              <Field label="Terms title" hint={`Max ${LEGAL_LIMITS.titleMax} characters`}>
                <input
                  type="text"
                  maxLength={LEGAL_LIMITS.titleMax}
                  value={termsTitle}
                  onChange={(e) => setTermsTitle(e.target.value)}
                  className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                />
              </Field>
              <Field
                label="Terms body"
                hint={`${termsBody.length} / ${LEGAL_LIMITS.bodyMax} — paragraphs separated by blank lines, '## ' for subheadings`}
              >
                <textarea
                  maxLength={LEGAL_LIMITS.bodyMax}
                  value={termsBody}
                  onChange={(e) => setTermsBody(e.target.value)}
                  rows={10}
                  className="min-h-[140px] w-full rounded-[12px] border border-[#D9E2EF] bg-white px-3 py-3 text-sm font-mono text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                />
              </Field>
              <Field label="Privacy title" hint={`Max ${LEGAL_LIMITS.titleMax} characters`}>
                <input
                  type="text"
                  maxLength={LEGAL_LIMITS.titleMax}
                  value={privacyTitle}
                  onChange={(e) => setPrivacyTitle(e.target.value)}
                  className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                />
              </Field>
              <Field
                label="Privacy body"
                hint={`${privacyBody.length} / ${LEGAL_LIMITS.bodyMax}`}
              >
                <textarea
                  maxLength={LEGAL_LIMITS.bodyMax}
                  value={privacyBody}
                  onChange={(e) => setPrivacyBody(e.target.value)}
                  rows={10}
                  className="min-h-[140px] w-full rounded-[12px] border border-[#D9E2EF] bg-white px-3 py-3 text-sm font-mono text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:outline-none focus:ring-2 focus:ring-[#2F6FE4]/20"
                />
              </Field>
            </div>
          )}

          {error && (
            <div className="rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="h-10 rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="h-10 rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save & activate"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeOption({
  active,
  onClick,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[12px] border px-4 py-3 text-left text-sm transition ${
        active
          ? "border-[#2F6FE4] bg-[#EAF2FF] ring-1 ring-[#2F6FE4]"
          : "border-[#D9E2EF] bg-white hover:bg-[#F8FAFC]"
      }`}
    >
      <div className="font-semibold text-[#111827]">{title}</div>
      <div className="mt-1 text-xs leading-5 text-[#64748B]">{hint}</div>
    </button>
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
    <label className="block space-y-2">
      <span className="text-sm font-medium text-[#334155]">{label}</span>
      {children}
      {hint && <span className="block text-xs leading-5 text-[#64748B]">{hint}</span>}
    </label>
  );
}
