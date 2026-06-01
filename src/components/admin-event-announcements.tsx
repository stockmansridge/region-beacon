import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Tone = "info" | "success" | "warning" | "urgent";

type Announcement = {
  id: string;
  agency_id: string;
  event_id: string;
  title: string;
  message: string;
  tone: Tone;
  link_label: string | null;
  link_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type FormState = {
  title: string;
  message: string;
  tone: Tone;
  link_label: string;
  link_url: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
};

const TONES: Array<{ value: Tone; label: string }> = [
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "urgent", label: "Urgent" },
];

const TONE_BADGE: Record<Tone, string> = {
  info: "bg-blue-50 text-blue-700 ring-blue-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  urgent: "bg-red-50 text-red-700 ring-red-200",
};

const EMPTY_FORM: FormState = {
  title: "",
  message: "",
  tone: "info",
  link_label: "",
  link_url: "",
  starts_at: "",
  ends_at: "",
  is_active: true,
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function formatRange(starts_at: string | null, ends_at: string | null): string | null {
  if (!starts_at && !ends_at) return null;
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
  return `${fmt(starts_at)} → ${fmt(ends_at)}`;
}

function validate(form: FormState): string | null {
  const title = form.title.trim();
  const message = form.message.trim();
  if (title.length > 120) return "Title must be 120 characters or fewer.";
  if (!message) return "Message is required.";
  if (message.length > 300) return "Message must be 300 characters or fewer.";
  if (form.link_label && form.link_label.length > 60)
    return "Link label must be 60 characters or fewer.";
  const link_url = form.link_url.trim();
  if (link_url && !/^https:\/\//i.test(link_url))
    return "Link URL must start with https://";
  if (form.starts_at && form.ends_at) {
    const a = new Date(form.starts_at).getTime();
    const b = new Date(form.ends_at).getTime();
    if (!isNaN(a) && !isNaN(b) && b <= a)
      return "End time must be after start time.";
  }
  return null;
}


export function AdminEventAnnouncements({
  eventId,
  agencyId,
  canEdit,
}: {
  eventId: string;
  agencyId: string;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // editor state: null = closed, "new" = creating, id string = editing
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("event_announcements")
      .select(
        "id, agency_id, event_id, title, message, tone, link_label, link_url, starts_at, ends_at, is_active, created_at, updated_at",
      )
      .eq("event_id", eventId)
      .eq("agency_id", agencyId)
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false });
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows((data ?? []) as Announcement[]);
    }
    setLoading(false);
  }, [eventId, agencyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function startNew() {
    setFormError(null);
    setForm(EMPTY_FORM);
    setEditingId("new");
  }

  function startEdit(a: Announcement) {
    setFormError(null);
    setForm({
      title: a.title,
      message: a.message,
      tone: a.tone,
      link_label: a.link_label ?? "",
      link_url: a.link_url ?? "",
      starts_at: toLocalInput(a.starts_at),
      ends_at: toLocalInput(a.ends_at),
      is_active: a.is_active,
    });
    setEditingId(a.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function save() {
    const v = validate(form);
    if (v) {
      setFormError(v);
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      agency_id: agencyId,
      event_id: eventId,
      title: form.title.trim(),
      message: form.message.trim(),
      tone: form.tone,
      link_label: form.link_label.trim() || null,
      link_url: form.link_url.trim() || null,
      starts_at: fromLocalInput(form.starts_at),
      ends_at: fromLocalInput(form.ends_at),
      is_active: form.is_active,
    };
    if (editingId === "new") {
      const { error: err } = await supabase
        .from("event_announcements")
        .insert(payload);
      if (err) {
        setFormError(err.message);
        setSaving(false);
        return;
      }
      toast.success("Announcement created");
    } else if (editingId) {
      const { error: err } = await supabase
        .from("event_announcements")
        .update(payload)
        .eq("id", editingId)
        .eq("agency_id", agencyId);
      if (err) {
        setFormError(err.message);
        setSaving(false);
        return;
      }
      toast.success("Announcement updated");
    }
    setSaving(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    await reload();
  }

  async function toggleActive(a: Announcement) {
    setBusyRowId(a.id);
    const { error: err } = await supabase
      .from("event_announcements")
      .update({ is_active: !a.is_active })
      .eq("id", a.id)
      .eq("agency_id", agencyId);
    setBusyRowId(null);
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success(a.is_active ? "Deactivated" : "Activated");
    await reload();
  }

  async function remove(a: Announcement) {
    if (!confirm(`Delete announcement "${a.title}"? This cannot be undone.`)) return;
    setBusyRowId(a.id);
    const { error: err } = await supabase
      .from("event_announcements")
      .delete()
      .eq("id", a.id)
      .eq("agency_id", agencyId);
    setBusyRowId(null);
    if (err) {
      toast.error(err.message);
      return;
    }
    toast.success("Announcement deleted");
    await reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Customer-facing notices shown at the top of public event pages.
          {!canEdit && " You have read-only access."}
        </p>
        {canEdit && !editingId && (
          <button
            type="button"
            onClick={startNew}
            className="inline-flex h-8 items-center rounded-lg border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            New announcement
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {editingId && canEdit && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {editingId === "new" ? "New announcement" : "Edit announcement"}
          </div>
          {formError && (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {formError}
            </div>
          )}
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium">Title <span className="text-destructive">*</span></span>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                maxLength={120}
                className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
              />
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {form.title.length}/120
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-medium">Message <span className="text-destructive">*</span></span>
              <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                maxLength={300}
                className="mt-1 min-h-20 w-full rounded-md border bg-background p-2 text-sm"
              />
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {form.message.length}/300
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium">Tone</span>
                <select
                  value={form.tone}
                  onChange={(e) => setForm({ ...form, tone: e.target.value as Tone })}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {TONES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-end gap-2 pb-1">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="h-4 w-4 rounded border"
                />
                <span className="text-sm">Active</span>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium">Link label (optional)</span>
                <input
                  type="text"
                  value={form.link_label}
                  onChange={(e) => setForm({ ...form, link_label: e.target.value })}
                  maxLength={60}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                  placeholder="Learn more"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium">Link URL (optional, https://)</span>
                <input
                  type="url"
                  value={form.link_url}
                  onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                  placeholder="https://…"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium">Starts at (optional)</span>
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium">Ends at (optional)</span>
                <input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                />
              </label>
            </div>
            {form.link_url && !form.link_label && (
              <p className="text-[11px] text-amber-700">
                Tip: add a link label so visitors know where the link goes.
              </p>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="inline-flex h-8 items-center rounded-md border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : editingId === "new" ? "Create" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-xs text-muted-foreground">Loading announcements…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
          No announcements yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => {
            const range = formatRange(a.starts_at, a.ends_at);
            const editingThis = editingId === a.id;
            return (
              <li
                key={a.id}
                className={`rounded-lg border p-3 ${a.is_active ? "bg-card" : "bg-muted/30 opacity-80"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${TONE_BADGE[a.tone]}`}
                      >
                        {a.tone}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${a.is_active ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-muted text-muted-foreground ring-border"}`}
                      >
                        {a.is_active ? "Active" : "Inactive"}
                      </span>
                      <span className="text-sm font-medium">{a.title}</span>
                    </div>
                    <p className="mt-1 text-sm text-foreground/80">{a.message}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      {range && <span>Schedule: {range}</span>}
                      {a.link_url && (
                        <span>
                          Link: {a.link_label ?? a.link_url}
                        </span>
                      )}
                    </div>
                  </div>
                  {canEdit && !editingThis && (
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleActive(a)}
                        disabled={busyRowId === a.id}
                        className="inline-flex h-7 items-center rounded-md border bg-background px-2 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
                      >
                        {a.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(a)}
                        className="inline-flex h-7 items-center rounded-md border bg-background px-2 text-[11px] font-medium hover:bg-muted"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(a)}
                        disabled={busyRowId === a.id}
                        className="inline-flex h-7 items-center rounded-md border border-destructive/40 bg-background px-2 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
