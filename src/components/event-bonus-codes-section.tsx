import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { QrPreview } from "@/components/qr-preview";

type BonusKind = "points" | "social";

type BonusCode = {
  id: string;
  agency_id: string;
  event_id: string;
  name: string;
  description: string | null;
  points_value: number;
  qr_code_token: string;
  is_active: boolean;
  scope?: "event" | "per_venue" | null;
  kind?: BonusKind | null;
  social_location?: string | null;
  social_hashtags?: string | null;
  created_at: string;
  updated_at: string;
};

type VenueBonus = {
  id: string;
  bonus_code_id: string;
  venue_id: string;
  qr_code_token: string;
  is_active: boolean;
};

type VenueLite = { id: string; name: string };

type FormState = {
  name: string;
  description: string;
  points_value: string;
  is_active: boolean;
  scope: "event" | "per_venue";
  venue_ids: string[];
  kind: BonusKind;
  social_location: string;
  social_hashtags: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  points_value: "0",
  is_active: true,
  scope: "event",
  venue_ids: [],
  kind: "points",
  social_location: "",
  social_hashtags: "",
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
  venues,
}: {
  agencyId: string;
  eventId: string;
  publicSubdomain: string | null;
  canEdit: boolean;
  venues: VenueLite[];
}) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [rows, setRows] = useState<BonusCode[] | null>(null);
  const [venueBonuses, setVenueBonuses] = useState<VenueBonus[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [expandedQrId, setExpandedQrId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const venueMap = useMemo(() => {
    const m = new Map<string, VenueLite>();
    for (const v of venues) m.set(v.id, v);
    return m;
  }, [venues]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      const [bonusRes, venueRes] = await Promise.all([
        supabase
          .from("event_bonus_codes")
          .select(
            "id, agency_id, event_id, name, description, points_value, qr_code_token, is_active, scope, kind, social_location, social_hashtags, created_at, updated_at",
          )
          .eq("agency_id", agencyId)
          .eq("event_id", eventId)
          .order("created_at", { ascending: false }),
        supabase
          .from("event_bonus_code_venues")
          .select("id, bonus_code_id, venue_id, qr_code_token, is_active")
          .eq("agency_id", agencyId)
          .eq("event_id", eventId),
      ]);
      if (cancelled) return;
      if (bonusRes.error) {
        setLoadError("Could not load bonus codes.");
        setRows([]);
      } else {
        setRows((bonusRes.data ?? []) as BonusCode[]);
      }
      // event_bonus_code_venues table may not exist yet (migration not applied)
      if (!venueRes.error && Array.isArray(venueRes.data)) {
        setVenueBonuses(venueRes.data as VenueBonus[]);
      } else {
        setVenueBonuses([]);
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
    const activeVenueIds = venueBonuses
      .filter((vb) => vb.bonus_code_id === row.id && vb.is_active)
      .map((vb) => vb.venue_id);
    setEditingId(row.id);
    setForm({
      name: row.name,
      description: row.description ?? "",
      points_value: String(row.points_value ?? 0),
      is_active: row.is_active,
      scope: row.scope === "per_venue" ? "per_venue" : "event",
      venue_ids: activeVenueIds,
      kind: row.kind === "social" ? "social" : "points",
      social_location: row.social_location ?? "",
      social_hashtags: row.social_hashtags ?? "",
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
    if (form.scope === "per_venue" && form.venue_ids.length === 0) {
      setFormError("Select at least one venue, or switch to Event-wide.");
      return;
    }
    const points = clampPoints(form.points_value);
    setSaving(true);
    setFormError(null);
    try {
      let bonusId: string | null = null;
      const socialLocation =
        form.kind === "social" ? form.social_location.trim() || null : null;
      const socialHashtags =
        form.kind === "social" ? form.social_hashtags.trim() || null : null;
      if (editingId === "new") {
        const payload = {
          agency_id: agencyId,
          event_id: eventId,
          name,
          description: description === "" ? null : description,
          points_value: points,
          is_active: form.is_active,
          scope: form.scope,
          kind: form.kind,
          social_location: socialLocation,
          social_hashtags: socialHashtags,
          qr_code_token: crypto.randomUUID(),
          created_by: userId,
        };
        const { data, error } = await supabase
          .from("event_bonus_codes")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        bonusId = (data as { id: string } | null)?.id ?? null;
        toast.success("Bonus code created.");
      } else {
        const patch = {
          name,
          description: description === "" ? null : description,
          points_value: points,
          is_active: form.is_active,
          scope: form.scope,
          kind: form.kind,
          social_location: socialLocation,
          social_hashtags: socialHashtags,
        };
        const { error } = await supabase
          .from("event_bonus_codes")
          .update(patch)
          .eq("id", editingId)
          .eq("agency_id", agencyId)
          .eq("event_id", eventId);
        if (error) throw error;
        bonusId = editingId;
        toast.success("Bonus code updated.");
      }

      // Sync per-venue rows. The RPC returns the resulting active rows for
      // this bonus code so we can update local state directly — bypassing
      // any SELECT policy staleness.
      if (bonusId) {
        const venueIds = form.scope === "per_venue" ? form.venue_ids : [];
        const { data: returned, error: rpcError } = await (
          supabase.rpc as unknown as (
            fn: string,
            args: Record<string, unknown>,
          ) => Promise<{
            data: VenueBonus[] | null;
            error: { message: string } | null;
          }>
        ).call(supabase, "save_per_venue_bonus_venues", {
          _bonus_code_id: bonusId,
          _venue_ids: venueIds,
        });
        if (rpcError) throw new Error(rpcError.message);
        const savedBonusId = bonusId;
        setVenueBonuses((prev) => {
          const others = prev.filter((v) => v.bonus_code_id !== savedBonusId);
          return [...others, ...((returned ?? []) as VenueBonus[])];
        });
        if (form.scope === "per_venue" && venueIds.length > 0 && (returned?.length ?? 0) === 0) {
          toast.error(
            "Saved, but no per-venue QR rows came back. Run the latest migration in Supabase.",
          );
        }
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

  async function copyLink(url: string) {
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
        stamps. Choose <strong>Event-wide</strong> for a single QR anywhere at
        the event, or <strong>Per-venue</strong> to generate one QR per
        participating venue (customers can claim once at each of those venues).
      </p>

      {!publicSubdomain && (
        <div className="rounded-md border border-[#FDBA74] bg-[#FFF7ED] px-3 py-2 text-xs text-[#9A3412]">
          <strong className="font-semibold">No public address yet.</strong>{" "}
          Publish the event or activate a public domain before printing QR
          codes — relative QR links will not work once scanned from a printed
          poster.
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

          <div className="space-y-2">
            <span className="block text-xs font-medium text-[#334155]">Type</span>
            <div className="flex flex-wrap gap-2">
              <label
                className={
                  "inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-xs cursor-pointer " +
                  (form.kind === "points"
                    ? "border-[#2F6FE4] bg-[#EFF6FF] text-[#1D4ED8]"
                    : "border-[#D9E2EF] bg-white text-[#334155]")
                }
              >
                <input
                  type="radio"
                  name="bonus-kind"
                  className="accent-[#2F6FE4]"
                  checked={form.kind === "points"}
                  onChange={() => setForm({ ...form, kind: "points" })}
                />
                <span>Points (scan QR)</span>
              </label>
              <label
                className={
                  "inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-xs cursor-pointer " +
                  (form.kind === "social"
                    ? "border-[#2F6FE4] bg-[#EFF6FF] text-[#1D4ED8]"
                    : "border-[#D9E2EF] bg-white text-[#334155]")
                }
              >
                <input
                  type="radio"
                  name="bonus-kind"
                  className="accent-[#2F6FE4]"
                  checked={form.kind === "social"}
                  onChange={() => setForm({ ...form, kind: "social" })}
                />
                <span>Social share (opens camera)</span>
              </label>
            </div>
            {form.kind === "social" && (
              <p className="text-[11px] text-[#64748B]">
                On the venue page, this bonus shows a "Share on socials" button
                that opens the phone camera so customers can snap a photo and
                post it with the tag &amp; hashtags below.
              </p>
            )}
          </div>

          {form.kind === "social" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-[#334155]">
                  Tag / @location
                </span>
                <input
                  type="text"
                  maxLength={80}
                  placeholder="@cargoroadwines"
                  value={form.social_location}
                  onChange={(e) =>
                    setForm({ ...form, social_location: e.target.value })
                  }
                  className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-[#334155]">
                  Recommended hashtags
                </span>
                <input
                  type="text"
                  maxLength={200}
                  placeholder="#cargoroadquest #orangenswwine"
                  value={form.social_hashtags}
                  onChange={(e) =>
                    setForm({ ...form, social_hashtags: e.target.value })
                  }
                  className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm"
                />
              </label>
            </div>
          )}

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
            {form.scope === "per_venue" && (
              <span className="block text-[11px] text-[#64748B]">
                Awarded in full at each participating venue (a customer scanning
                4 venues would earn {clampPoints(form.points_value) * Math.max(1, form.venue_ids.length || 1)} pts total).
              </span>
            )}
          </label>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-[#334155]">
              Scope
            </span>
            <div className="flex flex-wrap gap-2">
              <label
                className={
                  "inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-xs cursor-pointer " +
                  (form.scope === "event"
                    ? "border-[#2F6FE4] bg-[#EFF6FF] text-[#1D4ED8]"
                    : "border-[#D9E2EF] bg-white text-[#334155]")
                }
              >
                <input
                  type="radio"
                  name="bonus-scope"
                  className="accent-[#2F6FE4]"
                  checked={form.scope === "event"}
                  onChange={() => setForm({ ...form, scope: "event" })}
                />
                <span>Event-wide (one QR)</span>
              </label>
              <label
                className={
                  "inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-xs cursor-pointer " +
                  (form.scope === "per_venue"
                    ? "border-[#2F6FE4] bg-[#EFF6FF] text-[#1D4ED8]"
                    : "border-[#D9E2EF] bg-white text-[#334155]")
                }
              >
                <input
                  type="radio"
                  name="bonus-scope"
                  className="accent-[#2F6FE4]"
                  checked={form.scope === "per_venue"}
                  onChange={() => setForm({ ...form, scope: "per_venue" })}
                />
                <span>Per-venue (one QR per venue)</span>
              </label>
            </div>
          </div>

          {form.scope === "per_venue" && (
            <div className="space-y-2 rounded-[10px] border border-[#D9E2EF] bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#334155]">
                  Participating venues ({form.venue_ids.length}/{venues.length})
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setForm({ ...form, venue_ids: venues.map((v) => v.id) })
                    }
                    className="text-[11px] font-medium text-[#2F6FE4] hover:underline"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, venue_ids: [] })}
                    className="text-[11px] font-medium text-[#64748B] hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              {venues.length === 0 ? (
                <p className="text-xs text-[#9A3412]">
                  No venues in this event yet. Add venues first.
                </p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2 max-h-64 overflow-auto">
                  {venues.map((v) => {
                    const checked = form.venue_ids.includes(v.id);
                    return (
                      <label
                        key={v.id}
                        className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-[#F8FAFC]"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setForm((f) => ({
                              ...f,
                              venue_ids: e.target.checked
                                ? [...f.venue_ids, v.id]
                                : f.venue_ids.filter((id) => id !== v.id),
                            }));
                          }}
                        />
                        <span className="truncate">{v.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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
            const isPerVenue = row.scope === "per_venue";
            const eventUrl = buildBonusUrl(row.qr_code_token);
            const perVenueRows = venueBonuses
              .filter((vb) => vb.bonus_code_id === row.id && vb.is_active);
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
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                          (isPerVenue
                            ? "border-[#FDBA74] bg-[#FFF7ED] text-[#9A3412]"
                            : "border-[#C7D2FE] bg-[#EEF2FF] text-[#3730A3]")
                        }
                      >
                        {isPerVenue
                          ? `Per-venue · ${perVenueRows.length}`
                          : "Event-wide"}
                      </span>
                    </div>
                    {row.description && (
                      <p className="text-xs text-[#64748B]">{row.description}</p>
                    )}
                    {!isPerVenue && (
                      <p className="break-all text-[11px] text-[#94A3B8]">{eventUrl}</p>
                    )}
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
                        {isExpanded ? "Hide QR" : isPerVenue ? "View QRs" : "View QR"}
                      </button>
                      {!isPerVenue && (
                        <button
                          type="button"
                          onClick={() => copyLink(eventUrl)}
                          className="inline-flex h-8 items-center rounded-md border bg-background px-2 text-xs font-medium hover:bg-muted"
                        >
                          Copy link
                        </button>
                      )}
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

                {isExpanded && !isPerVenue && (
                  <div className="mt-3 border-t pt-3">
                    <QrPreview
                      value={eventUrl}
                      downloadName={`getstampd-bonus-code-${sanitizeFilename(row.name)}`}
                      size={180}
                      caption={row.name}
                    />
                  </div>
                )}

                {isExpanded && isPerVenue && (
                  <div className="mt-3 space-y-3 border-t pt-3">
                    {perVenueRows.length === 0 ? (
                      <p className="text-xs text-[#9A3412]">
                        No participating venues yet — edit this bonus and pick
                        venues to generate QR codes.
                      </p>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {perVenueRows.map((vb) => {
                          const venue = venueMap.get(vb.venue_id);
                          const venueName = venue?.name ?? "Unknown venue";
                          const url = buildBonusUrl(vb.qr_code_token);
                          return (
                            <div
                              key={vb.id}
                              className="rounded-[10px] border border-[#E6ECF4] bg-[#F8FAFC] p-3"
                            >
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="truncate text-xs font-semibold text-[#111827]">
                                  {venueName}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => copyLink(url)}
                                  className="text-[11px] font-medium text-[#2F6FE4] hover:underline"
                                >
                                  Copy link
                                </button>
                              </div>
                              <QrPreview
                                value={url}
                                downloadName={`getstampd-bonus-${sanitizeFilename(row.name)}-${sanitizeFilename(venueName)}`}
                                size={160}
                                caption={`${row.name} — ${venueName}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
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
