import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { QrPreview } from "@/components/qr-preview";

type BonusCode = {
  id: string;
  agency_id: string;
  event_id: string;
  name: string;
  description: string | null;
  points_value: number;
  qr_code_token: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type FormState = {
  name: string;
  description: string;
  points_value: string;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  points_value: "0",
  is_active: true,
};

function sanitizeFilename(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || "bonus-code";
}

function clampPoints(raw: string): number {
  if (raw.trim() === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function BonusCodesSection({
  agencyId,
  eventId,
  publicSubdomain,
  canEdit,
}: {
  agencyId: string;
  eventId: string;
  publicSubdomain: string | null;
  canEdit: boolean;
}) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [rows, setRows] = useState<BonusCode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [expandedQrId, setExpandedQrId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      const { data, error } = await supabase
        .from("event_bonus_codes")
        .select(
          "id, agency_id, event_id, name, description, points_value, qr_code_token, is_active, created_at, updated_at",
        )
        .eq("agency_id", agencyId)
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        setLoadError("Could not load bonus codes.");
        setRows([]);
      } else {
        setRows((data ?? []) as BonusCode[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [agencyId, eventId, reloadKey]);

  const buildBonusUrl = useCallback(
    (token: string) => {
      if (publicSubdomain) {
        return `https://${publicSubdomain}.getstampd.com.au/collect/bonus/${token}`;
      }
      return `/collect/bonus/${token}`;
    },
    [publicSubdomain],
  );

  function startCreate() {
    setEditingId("new");
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(row: BonusCode) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      description: row.description ?? "",
      points_value: String(row.points_value ?? 0),
      is_active: row.is_active,
    });
    setFormError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function save() {
    if (!canEdit || !editingId) return;
    const name = form.name.trim();
    if (!name) {
      setFormError("Name is required.");
      return;
    }
    if (name.length > 150) {
      setFormError("Name must be 150 characters or fewer.");
      return;
    }
    const description = form.description.trim();
    if (description.length > 1000) {
      setFormError("Description must be 1000 characters or fewer.");
      return;
    }
    const points = clampPoints(form.points_value);
    setSaving(true);
    setFormError(null);
    try {
      if (editingId === "new") {
        const payload = {
          agency_id: agencyId,
          event_id: eventId,
          name,
          description: description === "" ? null : description,
          points_value: points,
          is_active: form.is_active,
          qr_code_token: crypto.randomUUID(),
          created_by: user?.id ?? null,
        };
        const { error } = await supabase.from("event_bonus_codes").insert(payload);
        if (error) throw error;
        toast.success("Bonus code created.");
      } else {
        // Editing: do NOT update qr_code_token. Token is stable after first insert.
        const patch = {
          name,
          description: description === "" ? null : description,
          points_value: points,
          is_active: form.is_active,
        };
        const { error } = await supabase
          .from("event_bonus_codes")
          .update(patch)
          .eq("id", editingId)
          .eq("agency_id", agencyId)
          .eq("event_id", eventId);
        if (error) throw error;
        toast.success("Bonus code updated.");
      }
      cancelEdit();
      setReloadKey((k) => k + 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save bonus code.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: BonusCode) {
    if (!canEdit) return;
    setTogglingId(row.id);
    try {
      const { error } = await supabase
        .from("event_bonus_codes")
        .update({ is_active: !row.is_active })
        .eq("id", row.id)
        .eq("agency_id", agencyId)
        .eq("event_id", eventId);
      if (error) throw error;
      toast.success(!row.is_active ? "Bonus code enabled." : "Bonus code disabled.");
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update bonus code.");
    } finally {
      setTogglingId(null);
    }
  }

  async function copyLink(row: BonusCode) {
    const url = buildBonusUrl(row.qr_code_token);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Bonus code link copied.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  const sortedRows = useMemo(() => rows ?? [], [rows]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#475569]">
        Bonus Codes award points only. They do not count as venue passport
        stamps. Use them for hidden codes, sponsor activations, trail
        challenges, event-day promotions, or prize draw boosts.
      </p>

      {!publicSubdomain && (
        <div className="rounded-md border border-[#FDBA74] bg-[#FFF7ED] px-3 py-2 text-xs text-[#9A3412]">
          This event does not have an active public address yet. Bonus QR links
          will use a relative path until you publish a subdomain.
        </div>
      )}

      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {canEdit && editingId === null && (
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Add bonus code
        </button>
      )}

      {editingId !== null && (
        <div className="rounded-[12px] border border-[#D9E2EF] bg-[#F8FAFC] p-4 space-y-3">
          <h4 className="text-sm font-semibold text-[#111827]">
            {editingId === "new" ? "New bonus code" : "Edit bonus code"}
          </h4>

          <label className="block space-y-1">
            <span className="block text-xs font-medium text-[#334155]">
              Name <span className="text-[#E11D48]">*</span>
            </span>
            <input
              type="text"
              maxLength={150}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="block text-xs font-medium text-[#334155]">Description</span>
            <textarea
              maxLength={1000}
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 py-2 text-sm"
            />
          </label>

          <label className="block space-y-1">
            <span className="block text-xs font-medium text-[#334155]">
              Points value <span className="text-[#E11D48]">*</span>
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={form.points_value}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setForm({ ...form, points_value: "0" });
                  return;
                }
                const n = Number(raw);
                if (!Number.isFinite(n) || n < 0) return;
                setForm({ ...form, points_value: String(Math.floor(n)) });
              }}
              className="h-10 w-40 rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm"
            />
          </label>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span>Active</span>
          </label>

          {formError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {formError}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : editingId === "new" ? "Create" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="inline-flex h-9 items-center rounded-lg border bg-white px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading bonus codes…</div>
      ) : sortedRows.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-6 text-center">
          <div className="text-sm font-semibold text-[#111827]">No bonus codes yet</div>
          <div className="mt-1 text-xs text-[#64748B]">
            Create bonus QR codes to award extra points during your event.
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {sortedRows.map((row) => {
            const url = buildBonusUrl(row.qr_code_token);
            const isExpanded = expandedQrId === row.id;
            return (
              <li
                key={row.id}
                className="rounded-[12px] border border-[#D9E2EF] bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#111827]">
                        {row.name}
                      </span>
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                          (row.is_active
                            ? "border-[#86EFAC] bg-[#ECFDF5] text-[#047857]"
                            : "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]")
                        }
                      >
                        {row.is_active ? "Active" : "Disabled"}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-medium text-[#1D4ED8]">
                        {row.points_value} pts
                      </span>
                    </div>
                    {row.description && (
                      <p className="text-xs text-[#64748B]">{row.description}</p>
                    )}
                    <p className="break-all text-[11px] text-[#94A3B8]">{url}</p>
                    {!row.is_active && (
                      <p className="text-[11px] text-[#9A3412]">
                        Disabled bonus codes cannot be claimed, but historical
                        points remain.
                      </p>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedQrId(isExpanded ? null : row.id)
                        }
                        className="inline-flex h-8 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted"
                      >
                        {isExpanded ? "Hide QR" : "View QR"}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyLink(row)}
                        className="inline-flex h-8 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted"
                      >
                        Copy link
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        disabled={editingId !== null}
                        className="inline-flex h-8 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(row)}
                        disabled={togglingId === row.id}
                        className="inline-flex h-8 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      >
                        {togglingId === row.id
                          ? "…"
                          : row.is_active
                            ? "Disable"
                            : "Enable"}
                      </button>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="mt-3 border-t pt-3">
                    <QrPreview
                      value={url}
                      downloadName={`getstampd-bonus-code-${sanitizeFilename(row.name)}`}
                      size={180}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
