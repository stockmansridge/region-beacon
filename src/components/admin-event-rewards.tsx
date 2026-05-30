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
    return <div className="text-xs text-muted-foreground">Loading reward tiers…</div>;
  }
  if (loadError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {loadError}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Reward rules affect tier display on the public leaderboard and visitor
        passport progress. They do not change existing check-ins. Day 1 supports
        the <span className="font-medium">min_checkins</span> rule type only —
        award a tier when a passport has reached a stamp threshold.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
          No active reward tiers configured. Visitors will see the default
          Bronze (3) / Silver (5) / Gold (up to 8) ladder until tiers are
          added here.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_110px_90px_auto] items-center gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <div>Label</div>
            <div>Threshold</div>
            <div>Active</div>
            <div className="sr-only">Actions</div>
          </div>
          {rows.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_110px_90px_auto] items-center gap-2 rounded-md border bg-background p-2"
            >
              <input
                type="text"
                value={row.label}
                maxLength={LabelMax}
                disabled={!canEdit}
                onChange={(e) => updateRow(row.key, "label", e.target.value)}
                placeholder="Bronze"
                className="h-9 rounded-md border bg-background px-3 text-sm disabled:opacity-60"
              />
              <input
                type="number"
                min={1}
                step={1}
                value={row.threshold}
                disabled={!canEdit}
                onChange={(e) => updateRow(row.key, "threshold", e.target.value)}
                placeholder="3"
                className="h-9 rounded-md border bg-background px-3 text-sm disabled:opacity-60"
              />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={row.is_active}
                  disabled={!canEdit}
                  onChange={(e) => updateRow(row.key, "is_active", e.target.checked)}
                  className="h-4 w-4"
                />
                <span className={row.is_active ? "text-foreground" : "text-muted-foreground"}>
                  {row.is_active ? "On" : "Off"}
                </span>
              </label>
              {canEdit && row.id === null && (
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  className="inline-flex h-8 items-center rounded-md border bg-background px-2 text-xs text-muted-foreground hover:bg-muted"
                >
                  Remove
                </button>
              )}
              {canEdit && row.id !== null && (
                <span className="text-[11px] text-muted-foreground">
                  Saved
                </span>
              )}
              {!canEdit && <span />}
            </div>
          ))}
        </div>
      )}

      {otherRules.length > 0 && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Other rule types:</span>{" "}
          {otherRules
            .map((r) => `${r.reward_label ?? r.name} (${r.rule_type}${r.is_active ? "" : ", off"})`)
            .join(", ")}
          . Editing of <code>all_venues</code> / <code>specific_set</code> rules
          is not in the Day 1 editor.
        </div>
      )}

      {formError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {formError}
        </div>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted"
          >
            Add tier
          </button>
          <button
            type="button"
            onClick={loadDefaults}
            className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted"
          >
            Load default tiers
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="ml-auto inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save reward tiers"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Only platform, agency owner, or agency admin roles can edit reward tiers.
        </p>
      )}

      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Prize draw rules</span> —
        Prize draw rules are coming next. Current prize draw uses configured
        backend rules where available.
      </div>
    </div>
  );
}
