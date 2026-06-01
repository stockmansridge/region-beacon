import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/placeholder";
import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_TENANT_ROOT_DOMAIN } from "@/lib/domains";
import { useAgencyContext } from "@/hooks/use-agency-context";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/events/")({
  head: () => ({ meta: [{ title: "Events" }] }),
  component: Events,
});

type EventRow = {
  id: string;
  name: string;
  slug: string;
  public_slug: string | null;
  status: string;
  timezone: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

type DomainInfo = {
  public_subdomain: string | null;
  status: string | null;
};

type EventExtras = {
  domain: DomainInfo | null;
  venuesCount: number;
  activationStatus: string | null;
};

const SUBDOMAIN_ROOT = PUBLIC_TENANT_ROOT_DOMAIN;

function fmt(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch (_e) {
    return "—";
  }
}

function detectBrowserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && typeof tz === "string") return tz;
  } catch (_e) {
    /* noop */
  }
  return "Australia/Sydney";
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function randomShortId(len = 10): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const arr = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function Events() {
  const agency = useAgencyContext();
  const auth = useAuth();
  const navigate = useNavigate();
  const agencyId = agency.selected?.id ?? null;
  const role = agency.selected?.role ?? null;
  const canCreate =
    agency.isPlatformAdmin || role === "agency_owner" || role === "agency_admin";

  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [extras, setExtras] = useState<Record<string, EventExtras>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!agencyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const { data, error } = await supabase
        .from("events")
        .select(
          "id, name, slug, public_slug, status, timezone, starts_at, ends_at, created_at, updated_at",
        )
        .eq("agency_id", agencyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        setError("Could not load events.");
        setLoading(false);
        return;
      }
      const events = (data ?? []) as EventRow[];
      setRows(events);
      setLoading(false);

      const ids = events.map((e) => e.id);
      if (ids.length === 0) {
        setExtras({});
        return;
      }

      const [domainsRes, venuesRes, activationsRes] = await Promise.all([
        supabase
          .from("event_domains")
          .select("event_id, public_subdomain, status, is_primary")
          .eq("agency_id", agencyId)
          .in("event_id", ids)
          .in("status", ["pending", "active"])
          .order("is_primary", { ascending: false }),
        supabase
          .from("venues")
          .select("event_id")
          .eq("agency_id", agencyId)
          .in("event_id", ids)
          .is("deleted_at", null),
        supabase
          .from("event_activations")
          .select("event_id, status")
          .eq("agency_id", agencyId)
          .in("event_id", ids),
      ]);

      if (cancelled) return;

      const next: Record<string, EventExtras> = {};
      for (const id of ids) {
        next[id] = { domain: null, venuesCount: 0, activationStatus: null };
      }
      for (const d of (domainsRes.data ?? []) as Array<{
        event_id: string;
        public_subdomain: string | null;
        status: string | null;
      }>) {
        // First row wins (already ordered by is_primary desc, active before pending if tied is not guaranteed,
        // so prefer active over pending when both exist).
        const cur = next[d.event_id]?.domain;
        if (!cur || (cur.status !== "active" && d.status === "active")) {
          next[d.event_id].domain = {
            public_subdomain: d.public_subdomain,
            status: d.status,
          };
        }
      }
      for (const v of (venuesRes.data ?? []) as Array<{ event_id: string }>) {
        if (next[v.event_id]) next[v.event_id].venuesCount += 1;
      }
      for (const a of (activationsRes.data ?? []) as Array<{
        event_id: string;
        status: string | null;
      }>) {
        if (next[a.event_id]) next[a.event_id].activationStatus = a.status;
      }
      setExtras(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [agencyId, reloadKey]);

  return (
    <>
      <PageHeader
        title="Events"
        description="Manage your events. Reserve a public address, then configure branding, venues, and go-live."
        actions={
          canCreate ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-10 items-center rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5]"
            >
              Add event
            </button>
          ) : null
        }
      />

      {error && (
        <div className="mb-5 rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm leading-6 text-[#B91C1C]">
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded-[16px] border border-[#D9E2EF] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F8FAFC] text-left text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]">
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Public address</th>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Venues</th>
              <th className="px-4 py-3">Go-live</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Loading events…
                </td>
              </tr>
            )}
            {!loading && rows && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No events yet for this organisation.
                </td>
              </tr>
            )}
            {!loading &&
              rows?.map((e) => {
                const ex = extras[e.id];
                const domain = ex?.domain ?? null;
                const hasSubdomain = !!domain?.public_subdomain;
                const domainStatus = domain?.status ?? null;
                const activation = ex?.activationStatus ?? null;
                const liveLabel =
                  activation === "active" || activation === "comp"
                    ? "Live"
                    : activation === "pending"
                      ? "Pending"
                      : "Not live";
                const liveClass =
                  activation === "active" || activation === "comp"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : activation === "pending"
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : "bg-muted text-muted-foreground";
                return (
                  <tr key={e.id} className="border-t border-[#E6ECF4] hover:bg-[#F8FAFC]">
                    <td className="px-4 py-3 font-medium text-[#111827]">{e.name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-medium text-[#475569]">{e.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {hasSubdomain ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">
                            {domain!.public_subdomain}.{SUBDOMAIN_ROOT}
                          </span>
                          <span
                            className={
                              "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide " +
                              (domainStatus === "active"
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "bg-amber-500/10 text-amber-700 dark:text-amber-300")
                            }
                          >
                            {domainStatus}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not reserved</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {fmt(e.starts_at)} → {fmt(e.ends_at)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {ex ? ex.venuesCount : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={"rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide " + liveClass}>
                        {liveLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {hasSubdomain && domainStatus === "active" && (
                          <a
                            href={`https://${domain!.public_subdomain}.${SUBDOMAIN_ROOT}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-[#64748B] hover:text-[#111827] hover:underline"
                          >
                            Preview
                          </a>
                        )}
                        <Link
                          to="/admin/events/$eventId"
                          params={{ eventId: e.id }}
                          className="text-sm font-semibold text-[#2F6FE4] hover:text-[#1F56C5] hover:underline"
                        >
                          Setup
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>


      {canCreate && (
        <CreateEventDialog
          open={open}
          onOpenChange={setOpen}
          agencyId={agencyId}
          userId={auth.session?.user.id ?? null}
          onCreated={(newId) => {
            setOpen(false);
            setReloadKey((k) => k + 1);
            navigate({ to: "/admin/events/$eventId", params: { eventId: newId } });
          }}
        />
      )}
    </>
  );
}

type CreateForm = {
  name: string;
  slug: string;
  slugDirty: boolean;
  timezone: string;
  starts_at: string;
  ends_at: string;
  description: string;
};

function CreateEventDialog({
  open,
  onOpenChange,
  agencyId,
  userId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agencyId: string | null;
  userId: string | null;
  onCreated: (id: string) => void;
}) {
  const defaultTz = useMemo(() => detectBrowserTimezone(), []);
  const [form, setForm] = useState<CreateForm>(() => ({
    name: "",
    slug: "",
    slugDirty: false,
    timezone: defaultTz,
    starts_at: "",
    ends_at: "",
    description: "",
  }));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [childWarning, setChildWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        name: "",
        slug: "",
        slugDirty: false,
        timezone: defaultTz,
        starts_at: "",
        ends_at: "",
        description: "",
      });
      setValidationError(null);
      setSaveError(null);
      setChildWarning(null);
      setSaving(false);
    }
  }, [open, defaultTz]);

  function update<K extends keyof CreateForm>(key: K, value: CreateForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onNameChange(v: string) {
    setForm((f) => ({
      ...f,
      name: v,
      slug: f.slugDirty ? f.slug : slugifyName(v),
    }));
  }

  async function handleCreate() {
    if (!agencyId) {
      setSaveError("No organisation selected.");
      return;
    }
    const name = form.name.trim();
    const slug = form.slug.trim();
    const timezone = form.timezone.trim();
    const description = form.description.trim();

    if (!name) return setValidationError("Name is required.");
    if (name.length > 200) return setValidationError("Name must be 200 characters or fewer.");
    if (!slug) return setValidationError("URL name is required.");
    if (slug.length > 80) return setValidationError("URL name must be 80 characters or fewer.");
    if (!SLUG_RE.test(slug))
      return setValidationError(
        "URL name must contain only lowercase letters, numbers, and hyphens (no leading/trailing or doubled hyphens).",
      );
    if (!timezone) return setValidationError("Timezone is required.");
    if (timezone.length > 64) return setValidationError("Timezone must be 64 characters or fewer.");
    if (description.length > 2000)
      return setValidationError("Description must be 2000 characters or fewer.");

    let startsIso: string | null = null;
    let endsIso: string | null = null;
    if (form.starts_at) {
      const d = new Date(form.starts_at);
      if (isNaN(d.getTime())) return setValidationError("Start date/time is invalid.");
      startsIso = d.toISOString();
    }
    if (form.ends_at) {
      const d = new Date(form.ends_at);
      if (isNaN(d.getTime())) return setValidationError("End date/time is invalid.");
      endsIso = d.toISOString();
    }
    if (startsIso && endsIso && new Date(endsIso) <= new Date(startsIso))
      return setValidationError("End date/time must be after start date/time.");

    setValidationError(null);
    setSaveError(null);
    setChildWarning(null);
    setSaving(true);

    const publicSlug = `evt-${randomShortId(10)}`;

    const { data: inserted, error: evErr } = await supabase
      .from("events")
      .insert({
        agency_id: agencyId,
        name,
        slug,
        public_slug: publicSlug,
        status: "draft",
        timezone,
        starts_at: startsIso,
        ends_at: endsIso,
        description: description || null,
        created_by: userId,
      })
      .select("id")
      .single();

    if (evErr || !inserted) {
      setSaving(false);
      const msg = evErr?.message ?? "Could not create event.";
      if (/duplicate|unique/i.test(msg) && /slug/i.test(msg)) {
        setSaveError("That URL name is already used by another event in this organisation. Try a different URL name.");
      } else {
        setSaveError(`Could not create event: ${msg}`);
      }
      return;
    }

    const newId = inserted.id as string;

    // Default child rows — best effort. If any fail, surface a warning but
    // still navigate to the detail page so the admin can retry from there.
    const [brandingRes, checkinRes, leaderboardRes] = await Promise.all([
      supabase.from("event_branding").insert({
        agency_id: agencyId,
        event_id: newId,
        primary_color: "#0F172A",
        accent_color: "#3B82F6",
        font_family: "Inter",
        welcome_copy: null,
        terms_url: null,
      }),
      supabase.from("event_checkin_settings").insert({
        agency_id: agencyId,
        event_id: newId,
        one_checkin_per_venue: true,
        minimum_seconds_between_checkins: 0,
        allow_manual_admin_checkins: false,
        max_checkins_per_passport_per_day: null,
      }),
      supabase.from("leaderboard_settings").insert({
        agency_id: agencyId,
        event_id: newId,
        is_enabled: false,
        display_mode: "first_name_last_initial",
        show_first_name: true,
        show_last_initial: true,
        show_visit_count: true,
        hide_below_checkins: 1,
        allow_visitor_opt_out: true,
      }),
    ]);

    setSaving(false);

    const childErrors = [
      brandingRes.error ? "branding" : null,
      checkinRes.error ? "check-in settings" : null,
      leaderboardRes.error ? "leaderboard settings" : null,
    ].filter(Boolean);

    if (childErrors.length > 0) {
      setChildWarning(
        `Event created, but default ${childErrors.join(", ")} could not be created. You can configure them from the event detail page.`,
      );
      // Brief pause so the user sees the warning, then navigate.
      setTimeout(() => onCreated(newId), 1200);
      return;
    }

    // Verify the new event is readable by the current session before navigating.
    // If RLS or a race hides the row, stay on the list rather than dropping the
    // user on a broken "Could not load event detail" page.
    const { data: verifyRow, error: verifyErr } = await supabase
      .from("events")
      .select("id")
      .eq("id", newId)
      .eq("agency_id", agencyId)
      .is("deleted_at", null)
      .maybeSingle();

    if (verifyErr || !verifyRow) {
      console.error("[create-event] post-insert verify failed", {
        newId,
        agencyId,
        error: verifyErr,
      });
      setSaveError(
        verifyErr
          ? `Event was created (id ${newId}) but could not be re-read: ${verifyErr.message}. Refresh the events list and try opening it manually.`
          : `Event was created (id ${newId}) but is not visible to your account. This usually means an RLS policy is blocking access. Refresh the events list.`,
      );
      return;
    }

    onCreated(newId);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add event</DialogTitle>
          <DialogDescription>
            Creates a draft event. You can edit branding, venues, and the public address afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Name" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onNameChange(e.target.value)}
              maxLength={200}
              className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none"
              placeholder="Summer Food Trail 2026"
            />
          </Field>

          <Field
            label="Internal event URL name"
            required
            hint="Lowercase letters, numbers and hyphens. Used inside the admin only."
          >
            <input
              type="text"
              value={form.slug}
              onChange={(e) =>
                setForm((f) => ({ ...f, slug: e.target.value, slugDirty: true }))
              }
              maxLength={80}
              className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm font-mono text-[#111827] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none"
              placeholder="summer-food-trail-2026"
            />
          </Field>

          <Field label="Timezone" required>
            <input
              type="text"
              value={form.timezone}
              onChange={(e) => update("timezone", e.target.value)}
              maxLength={64}
              className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm font-mono text-[#111827] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none"
              placeholder="Australia/Sydney"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts at">
              <input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => update("starts_at", e.target.value)}
                className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none"
              />
            </Field>
            <Field label="Ends at">
              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => update("ends_at", e.target.value)}
                className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none"
              />
            </Field>
          </div>

          <Field label="Description" hint="Optional. Max 2000 characters.">
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              maxLength={2000}
              rows={3}
              className="min-h-[96px] w-full rounded-[12px] border border-[#D9E2EF] bg-white px-3 py-3 text-sm text-[#111827] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none"
              placeholder="Short summary of the event."
            />
          </Field>

          {validationError && (
            <div className="rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm leading-6 text-[#B91C1C]">
              {validationError}
            </div>
          )}
          {saveError && (
            <div className="rounded-[12px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm leading-6 text-[#B91C1C]">
              {saveError}
            </div>
          )}
          {childWarning && (
            <div className="rounded-[12px] border border-[#FDBA74] bg-[#FFF7ED] px-4 py-3 text-sm leading-6 text-[#B45309]">
              {childWarning}
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="inline-flex h-10 items-center rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="inline-flex h-10 items-center rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create draft event"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
