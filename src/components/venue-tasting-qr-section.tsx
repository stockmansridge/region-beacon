import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { QrPreview } from "@/components/qr-preview";

type TastingQr = {
  id: string;
  agency_id: string;
  event_id: string;
  venue_id: string;
  label: string;
  description: string | null;
  points: number;
  status: "active" | "disabled";
  qr_token: string;
  scan_limit_per_passport: number | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  claim_count: number;
};

type FormState = {
  label: string;
  description: string;
  points: string;
  status: "active" | "disabled";
  scan_limit_per_passport: string;
  starts_at: string;
  ends_at: string;
};

const EMPTY_FORM: FormState = {
  label: "",
  description: "",
  points: "10",
  status: "active",
  scan_limit_per_passport: "",
  starts_at: "",
  ends_at: "",
};

const ELIGIBLE_PLANS = new Set(["regional", "pro_region", "enterprise"]);

function sanitizeFilename(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || "tasting-qr";
}

function clampPoints(raw: string): number {
  if (raw.trim() === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(10000, Math.floor(n));
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  // Convert ISO to value usable in datetime-local input.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocalDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function VenueTastingQrSection({
  agencyId,
  eventId,
  venueId,
  venueName,
  publicSubdomain,
  canEdit,
}: {
  agencyId: string;
  eventId: string;
  venueId: string;
  venueName: string;
  publicSubdomain: string | null;
  canEdit: boolean;
}) {
  const [planCode, setPlanCode] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [rows, setRows] = useState<TastingQr[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedQrId, setExpandedQrId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Resolve current plan via get_agency_plan_limits so manual plan overrides
  // (e.g. Enterprise comp without a subscription row) are respected.
  useEffect(() => {
    let cancelled = false;
    setPlanLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc("get_agency_plan_limits", { _agency_id: agencyId });
      if (cancelled) return;
      const raw =
        !error && data && typeof data === "object" && "plan_code" in (data as Record<string, unknown>)
          ? String((data as Record<string, unknown>).plan_code ?? "free")
          : "free";
      setPlanCode(raw.toLowerCase().replace(/-/g, "_"));
      setPlanLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [agencyId]);

  const eligible = planCode !== null && ELIGIBLE_PLANS.has(planCode);

  useEffect(() => {
    if (!eligible) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      const { data, error } = await supabase.rpc("get_venue_tasting_qr_codes", {
        _event_id: eventId,
        _venue_id: venueId,
      });
      if (cancelled) return;
      if (error) {
        setLoadError(error.message ?? "Could not load tasting QR codes.");
        setRows([]);
      } else {
        setRows((data ?? []) as TastingQr[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [eligible, eventId, venueId, reloadKey]);

  const buildClaimUrl = useCallback(
    (token: string) => {
      if (publicSubdomain) {
        return `https://${publicSubdomain}.getstampd.com.au/tasting/${token}`;
      }
      return `/tasting/${token}`;
    },
    [publicSubdomain],
  );

  function startCreate() {
    setEditingId("new");
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(row: TastingQr) {
    setEditingId(row.id);
    setForm({
      label: row.label,
      description: row.description ?? "",
      points: String(row.points ?? 0),
      status: row.status,
      scan_limit_per_passport:
        row.scan_limit_per_passport == null ? "" : String(row.scan_limit_per_passport),
      starts_at: formatDate(row.starts_at),
      ends_at: formatDate(row.ends_at),
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
    const label = form.label.trim();
    if (!label) {
      setFormError("Label is required.");
      return;
    }
    if (label.length > 150) {
      setFormError("Label must be 150 characters or fewer.");
      return;
    }
    const description = form.description.trim();
    if (description.length > 1000) {
      setFormError("Description must be 1000 characters or fewer.");
      return;
    }
    const points = clampPoints(form.points);

    const starts = parseLocalDate(form.starts_at);
    const ends = parseLocalDate(form.ends_at);
    if (starts && ends && new Date(ends) < new Date(starts)) {
      setFormError("End date cannot be before start date.");
      return;
    }

    let scanLimit: number | null = null;
    if (form.scan_limit_per_passport.trim() !== "") {
      const n = Number(form.scan_limit_per_passport);
      if (!Number.isFinite(n) || n < 1) {
        setFormError("Limit per visitor must be 1 or greater.");
        return;
      }
      scanLimit = Math.floor(n);
    }

    setSaving(true);
    setFormError(null);
    try {
      const { error } = await supabase.rpc("save_venue_tasting_qr_code", {
        _id: editingId === "new" ? null : editingId,
        _event_id: eventId,
        _venue_id: venueId,
        _label: label,
        _description: description === "" ? null : description,
        _points: points,
        _status: form.status,
        _scan_limit_per_passport: scanLimit,
        _starts_at: starts,
        _ends_at: ends,
      });
      if (error) {
        const msg = error.message ?? "Could not save tasting QR.";
        if (msg.toLowerCase().includes("plan_required")) {
          setFormError(
            "Tasting QR Codes are available on Regional and Pro Region plans. Upgrade to unlock.",
          );
        } else {
          setFormError(msg);
        }
        toast.error(msg);
        return;
      }
      toast.success(editingId === "new" ? "Tasting QR created." : "Tasting QR updated.");
      cancelEdit();
      setReloadKey((k) => k + 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save tasting QR.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(row: TastingQr) {
    if (!canEdit) return;
    setBusyId(row.id);
    try {
      const next = row.status === "active" ? "disabled" : "active";
      const { error } = await supabase.rpc("save_venue_tasting_qr_code", {
        _id: row.id,
        _event_id: eventId,
        _venue_id: venueId,
        _label: row.label,
        _description: row.description,
        _points: row.points,
        _status: next,
        _scan_limit_per_passport: row.scan_limit_per_passport,
        _starts_at: row.starts_at,
        _ends_at: row.ends_at,
      });
      if (error) throw error;
      toast.success(next === "active" ? "Tasting QR enabled." : "Tasting QR disabled.");
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update tasting QR.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row: TastingQr) {
    if (!canEdit) return;
    if (typeof window !== "undefined" && !window.confirm(`Delete "${row.label}"? This cannot be undone.`)) {
      return;
    }
    setBusyId(row.id);
    try {
      const { error } = await supabase.rpc("delete_venue_tasting_qr_code", { _id: row.id });
      if (error) throw error;
      toast.success("Tasting QR deleted.");
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete tasting QR.");
    } finally {
      setBusyId(null);
    }
  }

  async function copyLink(row: TastingQr) {
    const url = buildClaimUrl(row.qr_token);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Tasting QR link copied.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  const sortedRows = useMemo(() => rows ?? [], [rows]);

  // ===== Locked state for lower plans =====
  if (!planLoading && !eligible) {
    return (
      <div className="rounded-[14px] border border-[#D9E2EF] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-[#111827]">Tasting QR Codes</h4>
              <span className="inline-flex items-center rounded-full border border-[#FCD34D] bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#92400E]">
                Regional & Pro Region
              </span>
            </div>
            <p className="mt-2 text-sm text-[#475569]">
              Give visitors extra points for trying specific wines, food, products, or activities at this venue.
            </p>
            <p className="mt-2 text-xs text-[#64748B]">
              <strong>Example:</strong> a winery stand can have separate QR codes for "Taste the Shiraz", "Taste the Chardonnay", or "Try the Sparkling".
            </p>
          </div>
          <Link
            to="/admin/account"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Upgrade to unlock
          </Link>
        </div>
      </div>
    );
  }

  // ===== Eligible plan UI =====
  return (
    <div className="rounded-[14px] border border-[#D9E2EF] bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-[#111827]">Tasting QR Codes</h4>
          <p className="mt-1 text-sm text-[#475569]">
            Optional. Add tasting or activity QR codes under this venue so visitors can earn extra points for trying specific products or completing extra actions. These do not replace the venue passport scan.
          </p>
        </div>
        {canEdit && editingId === null && (
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Add Tasting QR
          </button>
        )}
      </div>

      {!publicSubdomain && (
        <div className="rounded-md border border-[#FDBA74] bg-[#FFF7ED] px-3 py-2 text-xs text-[#9A3412]">
          <strong className="font-semibold">No public address yet.</strong>{" "}
          Activate a public subdomain for this event before printing tasting QR
          posters.
        </div>
      )}

      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {editingId !== null && (
        <div className="rounded-[12px] border border-[#D9E2EF] bg-[#F8FAFC] p-4 space-y-3">
          <h5 className="text-sm font-semibold text-[#111827]">
            {editingId === "new" ? "New Tasting QR" : "Edit Tasting QR"}
          </h5>

          <label className="block space-y-1">
            <span className="block text-xs font-medium text-[#334155]">
              Label <span className="text-[#E11D48]">*</span>
            </span>
            <input
              type="text"
              maxLength={150}
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g. Taste the 2024 Chardonnay"
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

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-[#334155]">
                Points <span className="text-[#E11D48]">*</span>
              </span>
              <input
                type="number"
                min={0}
                max={10000}
                step={1}
                value={form.points}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setForm({ ...form, points: "0" });
                    return;
                  }
                  const n = Number(raw);
                  if (!Number.isFinite(n) || n < 0) return;
                  setForm({ ...form, points: String(Math.min(10000, Math.floor(n))) });
                }}
                className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-[#334155]">Status</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value === "disabled" ? "disabled" : "active" })
                }
                className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm"
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-[#334155]">Start (optional)</span>
              <input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-[#334155]">End (optional)</span>
              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm"
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="block text-xs font-medium text-[#334155]">
              Limit per visitor (optional)
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={form.scan_limit_per_passport}
              onChange={(e) => setForm({ ...form, scan_limit_per_passport: e.target.value })}
              placeholder="Leave blank for default (1)"
              className="h-10 w-40 rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm"
            />
            <span className="block text-[11px] text-[#64748B]">
              Default: each visitor can claim once. Multi-claim windows are coming soon.
            </span>
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

      {loading || planLoading ? (
        <div className="text-sm text-muted-foreground">Loading tasting QR codes…</div>
      ) : sortedRows.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-5 text-center">
          <div className="text-sm font-semibold text-[#111827]">No tasting QR codes yet</div>
          <div className="mt-1 text-xs text-[#64748B]">
            Add a tasting QR to award extra points when visitors try a specific product or complete an activity here.
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {sortedRows.map((row) => {
            const url = buildClaimUrl(row.qr_token);
            const isExpanded = expandedQrId === row.id;
            return (
              <li key={row.id} className="rounded-[12px] border border-[#D9E2EF] bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#111827]">{row.label}</span>
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                          (row.status === "active"
                            ? "border-[#86EFAC] bg-[#ECFDF5] text-[#047857]"
                            : "border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]")
                        }
                      >
                        {row.status === "active" ? "Active" : "Disabled"}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-medium text-[#1D4ED8]">
                        {row.points} pts
                      </span>
                      <span className="text-[11px] text-[#64748B]">
                        {row.claim_count} claim{row.claim_count === 1 ? "" : "s"}
                      </span>
                    </div>
                    {row.description && (
                      <p className="text-xs text-[#64748B]">{row.description}</p>
                    )}
                    <p className="break-all text-[11px] text-[#94A3B8]">{url}</p>
                  </div>

                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedQrId(isExpanded ? null : row.id)}
                        className="inline-flex h-8 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted"
                      >
                        {isExpanded ? "Hide QR" : "View QR"}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyLink(row)}
                        className="inline-flex h-8 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted"
                      >
                        Copy tasting QR link
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
                        onClick={() => toggleStatus(row)}
                        disabled={busyId === row.id}
                        className="inline-flex h-8 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      >
                        {busyId === row.id ? "…" : row.status === "active" ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(row)}
                        disabled={busyId === row.id}
                        className="inline-flex h-8 items-center rounded-md border border-[#FECACA] bg-white px-2 text-xs font-medium text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="mt-3 border-t pt-3">
                    <QrPreview
                      value={url}
                      downloadName={`getstampd-tasting-${sanitizeFilename(venueName)}-${sanitizeFilename(row.label)}`}
                      size={180}
                      pngButtonLabel="Download tasting QR (PNG)"
                      caption={row.label}
                      awardsCaption={`This scan awards: ${row.points} point${row.points === 1 ? "" : "s"} (tasting/extra)`}
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
