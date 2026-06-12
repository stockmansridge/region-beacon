// Admin editor for per-event reward tiers (reward_rules table).
//
// Day 1 scope: min_checkins rule type only. Append / update / soft-delete via
// is_active — historical rows stay so future analytics keep working.
//
// Privacy/security:
//   * Browser supabase client only — no service role.
//   * RLS gates writes to platform_admin / agency_owner / agency_admin
//     (see migrations-draft/29_policies_ledger.sql). agency_staff has SELECT
//     only; this component additionally disables the controls for them.
//   * Reward rules are not visitor data; no PII handled.
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type RewardRule = {
  id: string;
  name: string;
  rule_type: "min_checkins" | "all_venues" | "specific_set";
  threshold: number | null;
  reward_label: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const LabelMax = 60;

const RowSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Label is required")
    .max(LabelMax, `Max ${LabelMax} characters`),
  threshold: z
    .number({ invalid_type_error: "Must be a number" })
    .int("Must be a whole number")
    .min(1, "Must be 1 or more")
    .max(1000, "Too large"),
});

const DEFAULT_TEMPLATES: Array<{ label: string; threshold: number }> = [
  { label: "Bronze", threshold: 3 },
  { label: "Silver", threshold: 5 },
  { label: "Gold", threshold: 8 },
];

type DraftRow = {
  // Local-only id for keying; matches reward_rules.id when persisted.
  key: string;
  id: string | null;
  label: string;
  threshold: string; // string for controlled input
  is_active: boolean;
  // Original values, used to detect changes for update vs no-op.
  original?: { label: string; threshold: number; is_active: boolean };
};

function ruleToDraft(rr: RewardRule): DraftRow {
  const label = rr.reward_label ?? rr.name ?? "";
  const threshold = rr.threshold ?? 1;
  return {
    key: rr.id,
    id: rr.id,
    label,
    threshold: String(threshold),
    is_active: rr.is_active,
    original: { label, threshold, is_active: rr.is_active },
  };
}

function newRowDraft(label = "", threshold = ""): DraftRow {
  return {
    key: `new-${Math.random().toString(36).slice(2, 10)}`,
    id: null,
    label,
    threshold,
    is_active: true,
  };
}

export function AdminEventRewards({
  agencyId,
  eventId,
  canEdit,
}: {
  agencyId: string;
  eventId: string;
  canEdit: boolean;
}) {
  const [rules, setRules] = useState<RewardRule[] | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const { data, error } = await supabase
      .from("reward_rules")
      .select(
        "id, name, rule_type, threshold, reward_label, is_active, created_at, updated_at",
      )
      .eq("event_id", eventId)
      .eq("agency_id", agencyId)
      .order("threshold", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });
    if (error) {
      setLoadError(error.message);
      setRules([]);
      setRows([]);
      return;
    }
    const list = (data ?? []) as RewardRule[];
    setRules(list);
    // Show only min_checkins rules in this MVP editor — other types render as
    // read-only badges in the summary so admins know they exist.
    setRows(list.filter((r) => r.rule_type === "min_checkins").map(ruleToDraft));
  }, [agencyId, eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const otherRules = useMemo(
    () => (rules ?? []).filter((r) => r.rule_type !== "min_checkins"),
    [rules],
  );

  function updateRow<K extends keyof DraftRow>(key: string, field: K, value: DraftRow[K]) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, newRowDraft()]);
  }

  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  function loadDefaults() {
    const existing = new Set(
      rows.map((r) => `${r.label.trim().toLowerCase()}|${r.threshold}`),
    );
    const additions: DraftRow[] = [];
    for (const t of DEFAULT_TEMPLATES) {
      const k = `${t.label.toLowerCase()}|${t.threshold}`;
      if (!existing.has(k)) additions.push(newRowDraft(t.label, String(t.threshold)));
    }
    if (additions.length === 0) {
      toast.info("Default tiers already present");
      return;
    }
    setRows((rs) => [...rs, ...additions]);
  }

  async function handleSave() {
    if (!canEdit) return;
    setFormError(null);

    // Validate active rows.
    const parsed: Array<{ draft: DraftRow; label: string; threshold: number }> = [];
    const activeThresholds = new Set<number>();
    for (const row of rows) {
      if (!row.is_active) {
        parsed.push({
          draft: row,
          label: row.label.trim(),
          threshold: Number(row.threshold) || 0,
        });
        continue;
      }
      const result = RowSchema.safeParse({
        label: row.label,
        threshold: Number(row.threshold),
      });
      if (!result.success) {
        setFormError(`"${row.label || "(unnamed)"}": ${result.error.issues[0]?.message ?? "Invalid"}`);
        return;
      }
      if (activeThresholds.has(result.data.threshold)) {
        setFormError(`Duplicate active threshold: ${result.data.threshold}`);
        return;
      }
      activeThresholds.add(result.data.threshold);
      parsed.push({ draft: row, label: result.data.label, threshold: result.data.threshold });
    }

    setSaving(true);
    try {
      // Inserts.
      const inserts = parsed
        .filter((p) => p.draft.id === null)
        .map((p) => ({
          agency_id: agencyId,
          event_id: eventId,
          name: p.label,
          reward_label: p.label,
          rule_type: "min_checkins" as const,
          threshold: p.threshold,
          is_active: p.draft.is_active,
        }));

      // Updates (only changed rows).
      const updates = parsed.filter((p) => {
        if (!p.draft.id || !p.draft.original) return false;
        const o = p.draft.original;
        return (
          o.label !== p.label ||
          o.threshold !== p.threshold ||
          o.is_active !== p.draft.is_active
        );
      });

      if (inserts.length > 0) {
        const { error } = await supabase.from("reward_rules").insert(inserts);
        if (error) throw error;
      }

      for (const u of updates) {
        const { error } = await supabase
          .from("reward_rules")
          .update({
            name: u.label,
            reward_label: u.label,
            threshold: u.threshold,
            is_active: u.draft.is_active,
          })
          .eq("id", u.draft.id!)
          .eq("agency_id", agencyId)
          .eq("event_id", eventId);
        if (error) throw error;
      }

      toast.success("Reward tiers saved");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save reward tiers";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (rules === null) {
    return (
      <div className="rounded-[16px] border border-[#D9E2EF] bg-white p-6 text-sm text-[#64748B] shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
        Loading reward tiers…
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="rounded-[12px] border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
        {loadError}
      </div>
    );
  }

  const inputClass =
    "h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm text-[#111827] placeholder:text-[#94A3B8] focus:border-[#2F6FE4] focus:ring-2 focus:ring-[#2F6FE4]/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";
  const labelClass = "text-sm font-medium text-[#334155]";
  const helperClass = "text-xs leading-5 text-[#64748B]";

  return (
    <div className="rounded-[16px] border border-[#D9E2EF] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-[#111827]">Leaderboard tiers</h3>
          <p className="text-sm leading-6 text-[#64748B]">
            Optional milestone tiers (e.g. Bronze / Silver / Gold) shown on the
            public leaderboard and visitor passport progress bar. These do not
            create prizes — to set up unlockable rewards, prizes, or a major
            prize draw, use the <span className="font-medium text-[#111827]">Awards &amp; rewards</span> section.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-5 py-5 text-sm text-[#475569]">
          No leaderboard tiers configured. Add tiers to show milestone progress,
          or leave empty to hide the milestone ladder entirely.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.key}
              className="rounded-[12px] border border-[#E6ECF4] bg-[#F8FAFC] p-4"
            >
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className={labelClass}>Tier name</span>
                  <input
                    type="text"
                    value={row.label}
                    maxLength={LabelMax}
                    disabled={!canEdit}
                    onChange={(e) => updateRow(row.key, "label", e.target.value)}
                    placeholder="Bronze"
                    className={inputClass}
                  />
                </label>
                <label className="space-y-2">
                  <span className={labelClass}>Minimum check-ins</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={row.threshold}
                    disabled={!canEdit}
                    onChange={(e) => updateRow(row.key, "threshold", e.target.value)}
                    placeholder="3"
                    className={inputClass}
                  />
                </label>
                <div className="space-y-2">
                  <span className={labelClass}>Status</span>
                  <div className="flex h-10 items-center justify-between gap-3 rounded-[10px] border border-[#D9E2EF] bg-white px-3">
                    <span className={helperClass}>
                      {row.is_active ? "Active" : "Inactive"}
                    </span>
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={row.is_active}
                        disabled={!canEdit}
                        onChange={(e) => updateRow(row.key, "is_active", e.target.checked)}
                        className="h-4 w-4 accent-[#2F6FE4]"
                      />
                      <span className="text-xs font-medium text-[#334155]">
                        {row.is_active ? "On" : "Off"}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
              {canEdit && row.id === null && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="inline-flex h-9 items-center rounded-[10px] border border-[#FDA4AF] bg-white px-3 text-xs font-semibold text-[#E11D48] hover:bg-[#FFF1F2]"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {otherRules.length > 0 && (
        <div className="mt-4 rounded-[12px] border border-[#E6ECF4] bg-[#F8FAFC] px-4 py-3 text-xs text-[#64748B]">
          <span className="font-medium text-[#111827]">Other rule types:</span>{" "}
          {otherRules
            .map((r) => `${r.reward_label ?? r.name} (${r.rule_type}${r.is_active ? "" : ", off"})`)
            .join(", ")}
          .
        </div>
      )}

      {formError && (
        <div className="mt-4 rounded-[12px] border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
          {formError}
        </div>
      )}

      {canEdit ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#E6ECF4] pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={addRow}
              className="h-10 rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]"
            >
              Add tier
            </button>
            <button
              type="button"
              onClick={loadDefaults}
              className="h-10 rounded-[10px] border border-[#D9E2EF] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F8FAFC]"
            >
              Load default tiers
            </button>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="h-10 rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save reward tiers"}
          </button>
        </div>
      ) : (
        <p className={`mt-4 ${helperClass}`}>
          Only platform, organisation owner, or organisation admin roles can edit reward tiers.
        </p>
      )}

      <div className="mt-4 rounded-[12px] border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm leading-6 text-[#334155]">
        <span className="font-medium text-[#111827]">Prize draw rules</span> —
        Prize draw rules are configured by backend rules where available. Public
        reward tiers only affect visitor-facing progress and leaderboard display.
      </div>
    </div>
  );
}
