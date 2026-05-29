import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/placeholder";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";

export const Route = createFileRoute("/admin/events/$eventId_/branding")({
  head: () => ({ meta: [{ title: "Edit customer landing page" }] }),
  component: BrandingEditor,
  codeSplitGroupings: [],
});

type EventRow = {
  id: string;
  agency_id: string;
  name: string;
  public_slug: string | null;
  status: string;
};

type Branding = {
  logo_path: string | null;
  cover_path: string | null;
  primary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  welcome_copy: string | null;
  terms_url: string | null;
};

type Domain = {
  public_subdomain: string | null;
  custom_domain: string | null;
  domain_type: string;
  status: string;
  is_primary: boolean;
};

type Bundle = {
  event: EventRow;
  branding: Branding | null;
  domains: Domain[];
  venueCount: number;
  hasBranding: boolean;
};

type Form = {
  primary_color: string;
  accent_color: string;
  font_family: string;
  welcome_copy: string;
  terms_url: string;
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function BrandingEditor() {
  const { eventId } = Route.useParams();
  const navigate = useNavigate();
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;
  const canEdit =
    agency.isPlatformAdmin ||
    agency.selected?.role === "agency_owner" ||
    agency.selected?.role === "agency_admin";

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  const [form, setForm] = useState<Form>({
    primary_color: "",
    accent_color: "",
    font_family: "",
    welcome_copy: "",
    terms_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (agency.status === "loading") return;
    if (!agencyId) {
      setState("error");
      return;
    }

    let cancelled = false;
    setState("loading");
    (async () => {
      const { data: event, error: evErr } = await supabase
        .from("events")
        .select("id, agency_id, name, public_slug, status")
        .eq("id", eventId)
        .eq("agency_id", agencyId)
        .is("deleted_at", null)
        .maybeSingle();

      if (cancelled) return;
      if (evErr) {
        setState("error");
        return;
      }
      if (!event) {
        setState("not-found");
        return;
      }

      const [brandingRes, domainsRes, venuesRes] = await Promise.all([
        supabase
          .from("event_branding")
          .select("logo_path, cover_path, primary_color, accent_color, font_family, welcome_copy, terms_url")
          .eq("event_id", event.id)
          .eq("agency_id", agencyId)
          .maybeSingle(),
        supabase
          .from("event_domains")
          .select("public_subdomain, custom_domain, domain_type, status, is_primary")
          .eq("event_id", event.id)
          .eq("agency_id", agencyId)
          .order("is_primary", { ascending: false }),
        supabase
          .from("venues")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event.id)
          .eq("agency_id", agencyId)
          .is("deleted_at", null)
          .eq("status", "active"),
      ]);

      if (cancelled) return;
      if (brandingRes.error || domainsRes.error || venuesRes.error) {
        setState("error");
        return;
      }

      const branding = (brandingRes.data ?? null) as Branding | null;
      setBundle({
        event: event as EventRow,
        branding,
        domains: (domainsRes.data ?? []) as Domain[],
        venueCount: venuesRes.count ?? 0,
        hasBranding: Boolean(brandingRes.data),
      });
      setForm({
        primary_color: branding?.primary_color ?? "",
        accent_color: branding?.accent_color ?? "",
        font_family: branding?.font_family ?? "",
        welcome_copy: branding?.welcome_copy ?? "",
        terms_url: branding?.terms_url ?? "",
      });
      setState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [agency.status, agencyId, eventId, reloadKey]);

  async function onSave() {
    if (!bundle || !agencyId || !canEdit) return;

    const primary_color = form.primary_color.trim();
    const accent_color = form.accent_color.trim();
    const font_family = form.font_family.trim();
    const welcome_copy = form.welcome_copy.trim();
    const terms_url = form.terms_url.trim();

    if (primary_color && !HEX_RE.test(primary_color)) {
      setValidationError("Primary colour must be a valid 6-digit hex code (e.g. #7A1F2B).");
      return;
    }
    if (accent_color && !HEX_RE.test(accent_color)) {
      setValidationError("Accent colour must be a valid 6-digit hex code (e.g. #E8C547).");
      return;
    }
    if (font_family.length > 100) {
      setValidationError("Font family must be 100 characters or fewer.");
      return;
    }
    if (welcome_copy.length > 1000) {
      setValidationError("Welcome copy must be 1000 characters or fewer.");
      return;
    }
    if (terms_url && !terms_url.startsWith("https://")) {
      setValidationError("Terms URL must start with https://.");
      return;
    }

    setValidationError(null);
    setSaveError(null);
    setSaving(true);

    const payload = {
      primary_color: primary_color || null,
      accent_color: accent_color || null,
      font_family: font_family || null,
      welcome_copy: welcome_copy || null,
      terms_url: terms_url || null,
    };

    let error: { message: string } | null = null;
    if (bundle.hasBranding) {
      const { error: upErr } = await supabase
        .from("event_branding")
        .update(payload)
        .eq("event_id", bundle.event.id)
        .eq("agency_id", agencyId);
      error = upErr ?? null;
    } else {
      const { error: inErr } = await supabase
        .from("event_branding")
        .insert({ agency_id: agencyId, event_id: bundle.event.id, ...payload });
      error = inErr ?? null;
    }

    setSaving(false);
    if (error) {
      setSaveError("Could not save branding changes. Please try again.");
      return;
    }
    setReloadKey((k) => k + 1);
  }

  function onCancel() {
    navigate({ to: "/admin/events/$eventId", params: { eventId } });
  }

  const primaryDomain = useMemo(
    () => bundle?.domains.find((d) => d.is_primary) ?? bundle?.domains[0] ?? null,
    [bundle],
  );

  if (agency.status === "loading" || state === "loading") {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (state === "not-found") {
    return (
      <div className="p-6">
        <PageHeader title="Event not found" />
        <Link to="/admin/events" className="text-sm text-primary underline">
          Back to events
        </Link>
      </div>
    );
  }
  if (state === "error" || !bundle) {
    return (
      <div className="p-6 text-sm text-destructive">
        Could not load this event. Please try again.
      </div>
    );
  }

  const { event, branding, venueCount } = bundle;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Customer landing page
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{event.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border bg-muted/40 px-2 py-0.5">
              Status: {event.status}
            </span>
            <span className="rounded-full border bg-muted/40 px-2 py-0.5">
              Slug: {event.public_slug ?? "—"}
            </span>
            <span className="rounded-full border bg-muted/40 px-2 py-0.5">
              {primaryDomain
                ? `${primaryDomain.public_subdomain ?? primaryDomain.custom_domain ?? "—"} · ${primaryDomain.status}`
                : "No domain configured"}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          You have view-only access. Only agency owners, agency admins, and platform admins can edit branding.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* ============== Form ============== */}
        <div className="space-y-4">
          {(validationError || saveError) && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {validationError ?? saveError}
            </div>
          )}

          <ReadOnlyField label="Logo">
            {branding?.logo_path ?? "—"}
            <p className="mt-1 text-xs text-muted-foreground">Logo upload is not enabled yet.</p>
          </ReadOnlyField>
          <ReadOnlyField label="Cover image">
            {branding?.cover_path ?? "—"}
            <p className="mt-1 text-xs text-muted-foreground">Cover upload is not enabled yet.</p>
          </ReadOnlyField>

          <Field label="Primary colour">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={HEX_RE.test(form.primary_color) ? form.primary_color : "#000000"}
                onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                disabled={!canEdit || saving}
                className="h-9 w-12 rounded-md border bg-background disabled:opacity-50"
              />
              <input
                type="text"
                value={form.primary_color}
                onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                placeholder="#7A1F2B"
                disabled={!canEdit || saving}
                maxLength={7}
                className="h-9 flex-1 rounded-md border bg-background px-3 text-sm font-mono disabled:opacity-50"
              />
            </div>
          </Field>

          <Field label="Accent colour">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={HEX_RE.test(form.accent_color) ? form.accent_color : "#000000"}
                onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                disabled={!canEdit || saving}
                className="h-9 w-12 rounded-md border bg-background disabled:opacity-50"
              />
              <input
                type="text"
                value={form.accent_color}
                onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                placeholder="#E8C547"
                disabled={!canEdit || saving}
                maxLength={7}
                className="h-9 flex-1 rounded-md border bg-background px-3 text-sm font-mono disabled:opacity-50"
              />
            </div>
          </Field>

          <Field label="Font family">
            <input
              type="text"
              value={form.font_family}
              onChange={(e) => setForm({ ...form, font_family: e.target.value })}
              placeholder="e.g. Inter, system-ui"
              disabled={!canEdit || saving}
              maxLength={100}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50"
            />
          </Field>

          <Field label="Welcome copy">
            <textarea
              value={form.welcome_copy}
              onChange={(e) => setForm({ ...form, welcome_copy: e.target.value })}
              disabled={!canEdit || saving}
              maxLength={1000}
              className="min-h-28 w-full rounded-md border bg-background p-2 text-sm disabled:opacity-50"
              placeholder="A short welcome message for your visitors."
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">
              {form.welcome_copy.length}/1000
            </div>
          </Field>

          <Field label="Terms URL">
            <input
              type="text"
              value={form.terms_url}
              onChange={(e) => setForm({ ...form, terms_url: e.target.value })}
              placeholder="https://…"
              disabled={!canEdit || saving}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50"
            />
          </Field>
        </div>

        {/* ============== Preview ============== */}
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Live preview
          </div>
          <LandingPreview
            eventName={event.name}
            primaryColor={HEX_RE.test(form.primary_color.trim()) ? form.primary_color.trim() : "#7A1F2B"}
            accentColor={HEX_RE.test(form.accent_color.trim()) ? form.accent_color.trim() : "#E8C547"}
            fontFamily={form.font_family.trim() || "system-ui, sans-serif"}
            welcomeCopy={form.welcome_copy.trim()}
            termsUrl={form.terms_url.trim()}
            venueCount={venueCount}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ReadOnlyField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{children}</div>
    </div>
  );
}

function LandingPreview({
  eventName,
  primaryColor,
  accentColor,
  fontFamily,
  welcomeCopy,
  termsUrl,
  venueCount,
}: {
  eventName: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  welcomeCopy: string;
  termsUrl: string;
  venueCount: number;
}) {
  return (
    <div
      className="overflow-hidden rounded-xl border bg-background shadow-sm"
      style={{ fontFamily }}
    >
      {/* Hero / cover */}
      <div
        className="relative h-44 w-full"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-widest text-white/80">
          Cover image placeholder
        </div>
        <div className="absolute left-4 top-4 flex h-14 w-14 items-center justify-center rounded-xl bg-white/90 text-[10px] font-semibold uppercase text-neutral-500 shadow">
          Logo
        </div>
      </div>

      <div className="space-y-5 p-6">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: primaryColor }}>
            {eventName}
          </h2>
          <p className="mt-1 text-xs text-neutral-500">No app required · Web-based passport</p>
        </div>

        <p className="text-sm leading-relaxed text-neutral-700">
          {welcomeCopy || "Welcome! Collect stamps at participating venues and unlock rewards."}
        </p>

        <button
          type="button"
          className="inline-flex h-10 items-center rounded-lg px-5 text-sm font-semibold text-white shadow"
          style={{ backgroundColor: primaryColor }}
        >
          Start passport
        </button>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs uppercase tracking-wider text-neutral-500">Venues</div>
            <div className="mt-1 text-2xl font-semibold" style={{ color: primaryColor }}>
              {venueCount}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs uppercase tracking-wider text-neutral-500">Progress</div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full"
                style={{ width: "40%", backgroundColor: accentColor }}
              />
            </div>
            <div className="mt-1 text-xs text-neutral-500">Sample reward: unlock at 5 stamps</div>
          </div>
        </div>

        <div className="border-t pt-3 text-xs text-neutral-500">
          By starting, you accept the{" "}
          {termsUrl ? (
            <span className="underline" style={{ color: accentColor }}>
              terms and privacy policy
            </span>
          ) : (
            <span>terms and privacy policy (link not set)</span>
          )}
          .
        </div>
      </div>
    </div>
  );
}
