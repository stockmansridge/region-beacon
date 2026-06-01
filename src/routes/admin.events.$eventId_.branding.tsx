import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/placeholder";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";
import { TrailLanding } from "@/components/trail-landing";
import {
  DEFAULT_VENUE_LABEL_PLURAL,
  DEFAULT_VENUE_LABEL_SINGULAR,
  VENUE_LABEL_MAX,
  resolveVenueLabels,
  validateVenueLabel,
} from "@/lib/venue-labels";
import {
  EVENT_ASSET_ALLOWED_MIME,
  EVENT_ASSET_MAX_BYTES,
  deleteEventAssetSafely,
  getEventAssetPublicUrl,
  uploadEventAsset,
  type EventAssetKind,
} from "@/lib/event-assets";
import {
  EVENT_PALETTES,
  type EventPaletteKey,
  getPalette,
  getPaletteOrDefault,
} from "@/lib/event-palettes";
import {
  EVENT_BACKGROUNDS,
  type EventBackgroundKey,
  getBackground,
} from "@/lib/event-backgrounds";

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
  venue_label_singular: string | null;
  venue_label_plural: string | null;
  palette_key: string | null;
  page_background_key: string | null;
  page_background_color: string | null;
  card_background_color: string | null;
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
  venue_label_singular: string;
  venue_label_plural: string;
  palette_key: string;
  page_background_key: string;
  page_background_color: string;
  card_background_color: string;
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
    venue_label_singular: DEFAULT_VENUE_LABEL_SINGULAR,
    venue_label_plural: DEFAULT_VENUE_LABEL_PLURAL,
    palette_key: "",
    page_background_key: "",
    page_background_color: "",
    card_background_color: "",
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
          .select("logo_path, cover_path, primary_color, accent_color, font_family, welcome_copy, terms_url, venue_label_singular, venue_label_plural, palette_key, page_background_key, page_background_color, card_background_color")
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
        venue_label_singular: branding?.venue_label_singular ?? DEFAULT_VENUE_LABEL_SINGULAR,
        venue_label_plural: branding?.venue_label_plural ?? DEFAULT_VENUE_LABEL_PLURAL,
        palette_key: branding?.palette_key ?? "",
        page_background_key: branding?.page_background_key ?? "",
        page_background_color: branding?.page_background_color ?? "",
        card_background_color: branding?.card_background_color ?? "",
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
    const venue_label_singular = form.venue_label_singular.trim();
    const venue_label_plural = form.venue_label_plural.trim();

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
    const singularErr = validateVenueLabel(venue_label_singular, "Singular venue label");
    if (singularErr) {
      setValidationError(singularErr);
      return;
    }
    const pluralErr = validateVenueLabel(venue_label_plural, "Plural venue label");
    if (pluralErr) {
      setValidationError(pluralErr);
      return;
    }

    setValidationError(null);
    setSaveError(null);
    setSaving(true);

    const palette_key = form.palette_key.trim();
    const page_background_key = form.page_background_key.trim();
    const page_background_color = form.page_background_color.trim();
    const card_background_color = form.card_background_color.trim();

    if (page_background_color && !HEX_RE.test(page_background_color)) {
      setSaving(false);
      setValidationError("Custom page background must be a valid 6-digit hex code (e.g. #F6EFE2).");
      return;
    }
    if (card_background_color && !HEX_RE.test(card_background_color)) {
      setSaving(false);
      setValidationError("Custom card background must be a valid 6-digit hex code.");
      return;
    }

    const basePayload = {
      primary_color: primary_color || null,
      accent_color: accent_color || null,
      font_family: font_family || null,
      welcome_copy: welcome_copy || null,
      terms_url: terms_url || null,
      venue_label_singular,
      venue_label_plural,
      palette_key: palette_key || null,
      page_background_key: page_background_key || null,
    };
    const extendedPayload = {
      ...basePayload,
      page_background_color: page_background_color || null,
      card_background_color: card_background_color || null,
    };

    async function attemptSave(payload: Record<string, unknown>) {
      if (!bundle) return { message: "Internal error." } as { message: string };
      if (bundle.hasBranding) {
        const { error: upErr } = await supabase
          .from("event_branding")
          .update(payload)
          .eq("event_id", bundle.event.id)
          .eq("agency_id", agencyId!);
        return upErr ?? null;
      }
      const { error: inErr } = await supabase
        .from("event_branding")
        .insert({ agency_id: agencyId!, event_id: bundle.event.id, ...payload });
      return inErr ?? null;
    }

    let error = await attemptSave(extendedPayload);
    if (error && /(page_background_color|card_background_color)/i.test(error.message)) {
      // Custom background columns not yet migrated. Save remaining fields
      // and surface a friendly hint.
      error = await attemptSave(basePayload);
      if (!error && (page_background_color || card_background_color)) {
        setSaveError(
          "Saved core branding. Custom hex background colours require the database migration in supabase/migrations-draft-event-background/03_custom_background_colors.sql to be applied.",
        );
        setSaving(false);
        setReloadKey((k) => k + 1);
        return;
      }
    }

    setSaving(false);
    if (error) {
      setSaveError("Could not save branding changes. Please try again.");
      return;
    }
    setReloadKey((k) => k + 1);
  }

  async function persistAssetPath(
    kind: EventAssetKind,
    newPath: string,
    previousPath: string | null,
  ): Promise<string | null> {
    if (!bundle || !agencyId) return "Internal error.";
    const column = kind === "logo" ? "logo_path" : "cover_path";
    const payload = { [column]: newPath } as Record<string, string>;

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
        .insert({
          agency_id: agencyId,
          event_id: bundle.event.id,
          ...payload,
        });
      error = inErr ?? null;
    }
    if (error) {
      // Roll back the orphan upload so storage doesn't keep an unreferenced file.
      await deleteEventAssetSafely(newPath);
      return "Saved the file but could not update the event record.";
    }
    // Best-effort: remove the previous object now that the DB is pointing
    // at the new one.
    if (previousPath && previousPath !== newPath) {
      await deleteEventAssetSafely(previousPath);
    }
    setReloadKey((k) => k + 1);
    return null;
  }

  async function removeAsset(
    kind: EventAssetKind,
    currentPath: string | null,
  ): Promise<string | null> {
    if (!bundle || !agencyId || !canEdit) return "You do not have permission to remove this.";
    if (!currentPath) return null;
    const column = kind === "logo" ? "logo_path" : "cover_path";
    const { error } = await supabase
      .from("event_branding")
      .update({ [column]: null })
      .eq("event_id", bundle.event.id)
      .eq("agency_id", agencyId);
    if (error) {
      return kind === "logo"
        ? "Could not remove the logo. Please try again."
        : "Could not remove the cover image. Please try again.";
    }
    await deleteEventAssetSafely(currentPath);
    setReloadKey((k) => k + 1);
    return null;
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
          <Link
            to="/admin/events/$eventId/preview"
            params={{ eventId }}
            target="_blank"
            className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted"
          >
            Open full preview
          </Link>
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

          <AssetUploader
            kind="logo"
            currentPath={branding?.logo_path ?? null}
            canEdit={canEdit}
            onUpload={async (file) => {
              if (!agencyId) return "Select an agency before uploading.";
              const res = await uploadEventAsset({
                agencyId,
                eventId: event.id,
                kind: "logo",
                file,
              });
              if (!res.ok) return res.error;
              return persistAssetPath("logo", res.path, branding?.logo_path ?? null);
            }}
            onRemove={() => removeAsset("logo", branding?.logo_path ?? null)}
          />
          <AssetUploader
            kind="cover"
            currentPath={branding?.cover_path ?? null}
            canEdit={canEdit}
            onUpload={async (file) => {
              if (!agencyId) return "Select an agency before uploading.";
              const res = await uploadEventAsset({
                agencyId,
                eventId: event.id,
                kind: "cover",
                file,
              });
              if (!res.ok) return res.error;
              return persistAssetPath("cover", res.path, branding?.cover_path ?? null);
            }}
            onRemove={() => removeAsset("cover", branding?.cover_path ?? null)}
          />

          <PaletteSelector
            value={form.palette_key}
            onChange={(key) => setForm({ ...form, palette_key: key })}
            disabled={!canEdit || saving}
          />

          {/* Custom brand colours — only active when palette is unset or "custom" */}
          {(() => {
            const isCurated =
              !!form.palette_key && form.palette_key !== "custom";
            const customActive = !isCurated;
            return (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <div>
                  <div className="text-sm font-semibold">Custom brand colours</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isCurated
                      ? "These overrides are inactive while a curated palette is selected. Switch the palette to Custom (or clear it) to use your own hex colours."
                      : "Used as the primary button colour and accent across the public pages. Leave blank to fall back to the GetStampd defaults."}
                  </p>
                </div>
                <Field label="Primary button colour">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={HEX_RE.test(form.primary_color) ? form.primary_color : "#1F3D2B"}
                      onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                      disabled={!canEdit || saving || !customActive}
                      className="h-9 w-12 rounded-md border bg-background disabled:opacity-50"
                    />
                    <input
                      type="text"
                      value={form.primary_color}
                      onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                      placeholder="#1F3D2B"
                      disabled={!canEdit || saving || !customActive}
                      maxLength={7}
                      className="h-9 flex-1 rounded-md border bg-background px-3 text-sm font-mono disabled:opacity-50"
                    />
                  </div>
                </Field>
                <Field label="Accent colour">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={HEX_RE.test(form.accent_color) ? form.accent_color : "#B5572A"}
                      onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                      disabled={!canEdit || saving || !customActive}
                      className="h-9 w-12 rounded-md border bg-background disabled:opacity-50"
                    />
                    <input
                      type="text"
                      value={form.accent_color}
                      onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                      placeholder="#B5572A"
                      disabled={!canEdit || saving || !customActive}
                      maxLength={7}
                      className="h-9 flex-1 rounded-md border bg-background px-3 text-sm font-mono disabled:opacity-50"
                    />
                  </div>
                </Field>
              </div>
            );
          })()}

          <BackgroundSelector
            value={form.page_background_key}
            paletteKey={form.palette_key}
            primaryColor={form.primary_color}
            accentColor={form.accent_color}
            onChange={(key) => setForm({ ...form, page_background_key: key })}
            disabled={!canEdit || saving}
          />

          {/* Custom background hex inputs — visible when custom_color is selected */}
          {form.page_background_key === "custom_color" && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div>
                <div className="text-sm font-semibold">Custom background colour</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick a hex page background, and optionally a card background.
                  Requires the database migration in{" "}
                  <code>migrations-draft-event-background/03_custom_background_colors.sql</code>{" "}
                  to be applied.
                </p>
              </div>
              <Field label="Page background colour">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={HEX_RE.test(form.page_background_color) ? form.page_background_color : "#FFFFFF"}
                    onChange={(e) => setForm({ ...form, page_background_color: e.target.value })}
                    disabled={!canEdit || saving}
                    className="h-9 w-12 rounded-md border bg-background disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={form.page_background_color}
                    onChange={(e) => setForm({ ...form, page_background_color: e.target.value })}
                    placeholder="#F6EFE2"
                    disabled={!canEdit || saving}
                    maxLength={7}
                    className="h-9 flex-1 rounded-md border bg-background px-3 text-sm font-mono disabled:opacity-50"
                  />
                </div>
              </Field>
              <Field label="Card background colour (optional)">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={HEX_RE.test(form.card_background_color) ? form.card_background_color : "#FFFFFF"}
                    onChange={(e) => setForm({ ...form, card_background_color: e.target.value })}
                    disabled={!canEdit || saving}
                    className="h-9 w-12 rounded-md border bg-background disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={form.card_background_color}
                    onChange={(e) => setForm({ ...form, card_background_color: e.target.value })}
                    placeholder="#FBF5E8"
                    disabled={!canEdit || saving}
                    maxLength={7}
                    className="h-9 flex-1 rounded-md border bg-background px-3 text-sm font-mono disabled:opacity-50"
                  />
                </div>
              </Field>
            </div>
          )}

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

          {/* Terms URL removed from Branding — Terms & Privacy are managed
              in the main event Terms & Privacy section. The existing
              terms_url value is preserved in the database and on save. */}

          {/* ============== Customer wording ============== */}
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div>
              <div className="text-sm font-semibold">Customer wording</div>
              <p className="mt-1 text-xs text-muted-foreground">
                What do you call the places visitors check in at? Use{" "}
                <span className="font-medium">Wineries</span> for a wine trail,{" "}
                <span className="font-medium">Restaurants</span> for a food festival,{" "}
                <span className="font-medium">Stops</span> for a tourism trail. Defaults to{" "}
                Venue / Venues.
              </p>
            </div>

            <Field label="Singular venue label">
              <input
                type="text"
                value={form.venue_label_singular}
                onChange={(e) => setForm({ ...form, venue_label_singular: e.target.value })}
                placeholder="Venue"
                disabled={!canEdit || saving}
                maxLength={VENUE_LABEL_MAX}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50"
              />
              <div className="mt-1 text-right text-xs text-muted-foreground">
                {form.venue_label_singular.length}/{VENUE_LABEL_MAX}
              </div>
            </Field>

            <Field label="Plural venue label">
              <input
                type="text"
                value={form.venue_label_plural}
                onChange={(e) => setForm({ ...form, venue_label_plural: e.target.value })}
                placeholder="Venues"
                disabled={!canEdit || saving}
                maxLength={VENUE_LABEL_MAX}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50"
              />
              <div className="mt-1 text-right text-xs text-muted-foreground">
                {form.venue_label_plural.length}/{VENUE_LABEL_MAX}
              </div>
            </Field>
          </div>
        </div>

        {/* ============== Preview ============== */}
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Live preview
          </div>
          <LandingPreview
            eventName={event.name}
            primaryColor={(() => {
              const p = getPalette(form.palette_key || null);
              if (p) return p.primary;
              return HEX_RE.test(form.primary_color.trim()) ? form.primary_color.trim() : "#1F3D2B";
            })()}
            accentColor={(() => {
              const p = getPalette(form.palette_key || null);
              if (p) return p.accent;
              return HEX_RE.test(form.accent_color.trim()) ? form.accent_color.trim() : "#B5572A";
            })()}
            fontFamily={form.font_family.trim() || undefined}
            welcomeCopy={form.welcome_copy.trim()}
            termsUrl={form.terms_url.trim()}
            venueCount={venueCount}
            logoUrl={getEventAssetPublicUrl(branding?.logo_path)}
            heroImageUrl={getEventAssetPublicUrl(branding?.cover_path)}
            venueLabelPlural={
              resolveVenueLabels({
                venue_label_singular: form.venue_label_singular,
                venue_label_plural: form.venue_label_plural,
              }).plural
            }
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
  venueLabelPlural,
  logoUrl,
  heroImageUrl,
}: {
  eventName: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: string | undefined;
  welcomeCopy: string;
  termsUrl: string;
  venueCount: number;
  venueLabelPlural: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
}) {
  return (
    <div className="rounded-2xl border border-[#E6DCC7] bg-trail-cream p-4">
      <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.22em] text-[#8A7E66]">
        <span>Customer landing — live preview</span>
        <span>Mobile</span>
      </div>
      <TrailLanding
        eventName={eventName}
        welcomeCopy={
          welcomeCopy ||
          "Welcome! Collect a stamp at each participating venue and unlock rewards along the trail."
        }
        primaryColor={primaryColor}
        accentColor={accentColor}
        fontFamily={fontFamily}
        venueCount={venueCount}
        venueLabelPlural={venueLabelPlural}
        logoUrl={logoUrl}
        heroImageUrl={heroImageUrl}
        badge="Preview"
        termsUrl={termsUrl || null}
      />
    </div>
  );
}

// ============================================================================
// AssetUploader
// ============================================================================

function AssetUploader({
  kind,
  currentPath,
  canEdit,
  onUpload,
  onRemove,
}: {
  kind: EventAssetKind;
  currentPath: string | null;
  canEdit: boolean;
  onUpload: (file: File) => Promise<string | null>;
  onRemove: () => Promise<string | null>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const url = getEventAssetPublicUrl(currentPath);
  const label = kind === "logo" ? "Event logo" : "Cover image";
  const helper =
    kind === "logo"
      ? "Shown in the header of your event page. Square images look best."
      : "Wide hero image shown at the top of your event page.";
  const limitMB = Math.round(EVENT_ASSET_MAX_BYTES[kind] / (1024 * 1024));
  const accept = EVENT_ASSET_ALLOWED_MIME.join(",");
  const disabled = !canEdit || busy || removing;

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setErr(null);
    setBusy(true);
    const result = await onUpload(file);
    setBusy(false);
    if (result) setErr(result);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleRemove() {
    if (!url) return;
    const ok = window.confirm(
      kind === "logo"
        ? "Remove the event logo? You can upload a new one any time."
        : "Remove the cover image? You can upload a new one any time.",
    );
    if (!ok) return;
    setErr(null);
    setRemoving(true);
    const result = await onRemove();
    setRemoving(false);
    if (result) setErr(result);
  }

  const previewClass =
    kind === "logo"
      ? "h-28 w-28 rounded-lg"
      : "aspect-[16/9] w-full rounded-lg";

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-[11px] text-muted-foreground">
          PNG, JPG, WebP · max {limitMB} MB
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{helper}</p>

      <div
        className={`relative flex items-center justify-center overflow-hidden border bg-white ${previewClass}`}
      >
        {url ? (
          <img
            src={url}
            alt={kind === "logo" ? "Event logo preview" : "Event cover preview"}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <span className="text-[10px] uppercase tracking-wider">
              No {kind === "logo" ? "logo" : "cover image"} yet
            </span>
          </div>
        )}
      </div>

      {err && <div className="text-xs text-destructive">{err}</div>}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {canEdit && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy
              ? "Uploading…"
              : url
                ? `Replace ${kind === "logo" ? "logo" : "cover"}`
                : `Upload ${kind === "logo" ? "logo" : "cover"}`}
          </button>
          {url && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              {removing ? "Removing…" : `Remove ${kind === "logo" ? "logo" : "cover"}`}
            </button>
          )}
        </div>
      )}
      {!canEdit && !url && (
        <div className="text-xs text-muted-foreground">No image uploaded.</div>
      )}
    </div>
  );
}

// ============================================================================
// PaletteSelector
// ============================================================================

function PaletteSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  const selected = getPalette(value || null);
  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold">Colour palette</div>
        {selected && !disabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Pick a curated palette to colour the public event pages. When set, the
        palette overrides the primary &amp; accent colours below. Leave unset to
        keep the GetStampd default look (or your own primary/accent hex codes).
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {EVENT_PALETTES.map((p) => {
          const active = p.key === value;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(p.key as EventPaletteKey)}
              disabled={disabled}
              className={`flex items-start gap-3 rounded-lg border p-2 text-left transition disabled:opacity-50 ${
                active
                  ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <span
                  className="block h-5 w-10 rounded"
                  style={{ background: p.primary }}
                  aria-hidden
                />
                <span
                  className="block h-5 w-10 rounded"
                  style={{ background: p.accent }}
                  aria-hidden
                />
                <span
                  className="block h-5 w-10 rounded border"
                  style={{ background: p.pageBg, borderColor: p.border }}
                  aria-hidden
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{p.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {p.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {selected && (
        <div
          className="mt-2 rounded-lg p-3 text-xs"
          style={{
            background: selected.cardBg,
            color: selected.bodyText,
            border: `1px solid ${selected.border}`,
          }}
        >
          <div
            className="mb-1 font-semibold"
            style={{ color: selected.heading }}
          >
            {selected.label} preview
          </div>
          <div style={{ color: selected.mutedText }}>
            Sample card · Body text · Muted line
          </div>
          <div className="mt-2 flex gap-2">
            <span
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{
                background: selected.primary,
                color: selected.primaryForeground,
              }}
            >
              Primary
            </span>
            <span
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{ background: selected.accent, color: "#fff" }}
            >
              Accent
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// BackgroundSelector
// ============================================================================

function BackgroundSelector({
  value,
  paletteKey,
  primaryColor,
  accentColor,
  onChange,
  disabled,
}: {
  value: string;
  paletteKey: string;
  primaryColor?: string;
  accentColor?: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  const palette = (() => {
    if (paletteKey === "custom" || (!paletteKey && (primaryColor || accentColor))) {
      return buildCustomPalette(primaryColor ?? null, accentColor ?? null);
    }
    return getPaletteOrDefault(paletteKey || null);
  })();
  const selected = getBackground(value || null);
  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold">Page background</div>
        {selected && !disabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Choose the page background used behind the public event pages. This is
        independent of the colour palette and falls back to a clean light
        background when unset.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {EVENT_BACKGROUNDS.map((bg) => {
          const active = bg.key === value;
          return (
            <button
              key={bg.key}
              type="button"
              onClick={() => onChange(bg.key as EventBackgroundKey)}
              disabled={disabled}
              className={`flex items-stretch gap-3 rounded-lg border p-2 text-left transition disabled:opacity-50 ${
                active
                  ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                  : "border-border hover:bg-muted/40"
              }`}
            >
              <span
                className="block h-14 w-16 flex-shrink-0 rounded border"
                style={bg.swatch(palette)}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{bg.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {bg.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {selected && (
        <div
          className="mt-2 rounded-lg p-3 text-xs"
          style={{
            ...selected.build(palette),
            color: palette.bodyText,
            border: `1px solid ${palette.border}`,
          }}
        >
          <div
            className="mb-1 font-semibold"
            style={{ color: palette.heading }}
          >
            {selected.label} preview
          </div>
          <div
            className="rounded p-2"
            style={{ background: palette.cardBg, color: palette.bodyText }}
          >
            Sample card on this background — confirms cards stay readable.
          </div>
        </div>
      )}
    </div>
  );
}



