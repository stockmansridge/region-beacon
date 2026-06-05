import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type FaqEntry = {
  id: string;
  agency_id: string;
  event_id: string;
  question: string;
  answer: string;
  order_index: number;
  created_at: string;
  updated_at: string;
};

type DraftEntry = {
  // Existing rows carry the DB id. New rows use a "new-..." key.
  key: string;
  id: string | null;
  question: string;
  answer: string;
};

function makeDraftKey(): string {
  return `new-${Math.random().toString(36).slice(2, 10)}`;
}

function formatSupabaseError(error: any) {
  if (!error) return "Unknown FAQ save error";

  const parts = [
    error.message,
    error.details,
    error.hint,
    error.code ? `Code: ${error.code}` : null,
    error.name ? `Name: ${error.name}` : null,
  ].filter(Boolean);

  return parts.length > 0
    ? parts.join(" | ")
    : JSON.stringify(error, null, 2);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function EventFaqSection({
  agencyId,
  eventId,
  canEdit,
}: {
  agencyId: string;
  eventId: string;
  canEdit: boolean;
}) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const eventIdSaveError = !eventId
    ? "Cannot save FAQ entries because the event id is missing."
    : !isUuid(eventId)
      ? "Cannot save FAQ entries because the event id is invalid."
      : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      const { data, error } = await supabase
        .from("event_faq_entries")
        .select("id, agency_id, event_id, question, answer, order_index, created_at, updated_at")
        .eq("agency_id", agencyId)
        .eq("event_id", eventId)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        setLoadError("Could not load FAQ entries.");
        setDrafts([]);
      } else {
        const rows = (data ?? []) as FaqEntry[];
        setDrafts(
          rows.map((r) => ({
            key: r.id,
            id: r.id,
            question: r.question,
            answer: r.answer,
          })),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [agencyId, eventId, reloadKey]);

  function updateDraft(key: string, patch: Partial<DraftEntry>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function addEntry() {
    setDrafts((prev) => [
      ...prev,
      { key: makeDraftKey(), id: null, question: "", answer: "" },
    ]);
  }

  function removeEntry(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  async function saveAll() {
    if (!canEdit) return;
    if (eventIdSaveError) {
      setSaveError(eventIdSaveError);
      toast.error("Could not save FAQ entries", { description: eventIdSaveError });
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const cleanedEntries = drafts
        .map((d) => ({ ...d, question: d.question.trim(), answer: d.answer.trim() }))
        .filter((d) => d.question.length > 0 || d.answer.length > 0);

      for (const d of cleanedEntries) {
        if (!d.question || !d.answer) {
          setSaveError("Every entry needs both a question and an answer.");
          return;
        }
        if (d.question.length > 500) {
          setSaveError("Questions must be 500 characters or fewer.");
          return;
        }
        if (d.answer.length > 5000) {
          setSaveError("Answers must be 5000 characters or fewer.");
          return;
        }
      }

      console.log("[FAQ SAVE] starting", {
        eventId,
        entries: drafts,
        cleanedEntries,
      });

      const { data, error } = await supabase.rpc("save_event_faq_entries", {
        p_event_id: eventId,
        p_entries: cleanedEntries.map((entry, index) => ({
          question: entry.question.trim(),
          answer: entry.answer.trim(),
          order_index: index,
        })),
      });

      console.log("[FAQ SAVE] rpc result", { data, error });

      if (error) {
        const message = formatSupabaseError(error);

        console.error("[FAQ SAVE] failed", error);

        setSaveError(message);
        toast.error("Could not save FAQ entries", { description: message });
        return;
      }

      const rows = (data ?? []) as FaqEntry[];
      setDrafts(
        rows.map((r) => ({
          key: r.id,
          id: r.id,
          question: r.question,
          answer: r.answer,
        })),
      );
      toast.success("FAQ entries saved.");
      setReloadKey((k) => k + 1);
    } catch (e) {
      const message = formatSupabaseError(e);

      console.error("[FAQ SAVE] failed", e);

      setSaveError(message);
      toast.error("Could not save FAQ entries", { description: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#475569]">
        Add question-and-answer entries to a public FAQ / Info page on this
        event. Questions display in bold with the answer beneath. The public
        FAQ / Info menu item only appears when at least one entry is saved.
      </p>

      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading FAQ entries…</div>
      ) : (
        <>
          {drafts.length === 0 && (
            <div className="rounded-[12px] border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-6 text-center">
              <div className="text-sm font-semibold text-[#111827]">No FAQ entries yet</div>
              <div className="mt-1 text-xs text-[#64748B]">
                Add your first question and answer below.
              </div>
            </div>
          )}

          <ul className="space-y-3">
            {drafts.map((d, idx) => (
              <li
                key={d.key}
                className="rounded-[12px] border border-[#D9E2EF] bg-white p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                    Entry {idx + 1}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeEntry(d.key)}
                      disabled={saving}
                      className="text-xs font-medium text-[#B91C1C] hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <label className="block space-y-1">
                  <span className="block text-xs font-medium text-[#334155]">
                    Question / heading
                  </span>
                  <input
                    type="text"
                    maxLength={500}
                    value={d.question}
                    disabled={!canEdit || saving}
                    onChange={(e) => updateDraft(d.key, { question: e.target.value })}
                    className="h-10 w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 text-sm disabled:bg-[#F8FAFC]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="block text-xs font-medium text-[#334155]">
                    Answer / information
                  </span>
                  <textarea
                    rows={4}
                    maxLength={5000}
                    value={d.answer}
                    disabled={!canEdit || saving}
                    onChange={(e) => updateDraft(d.key, { answer: e.target.value })}
                    className="w-full rounded-[10px] border border-[#D9E2EF] bg-white px-3 py-2 text-sm disabled:bg-[#F8FAFC]"
                  />
                </label>
              </li>
            ))}
          </ul>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addEntry}
                disabled={saving}
                className="inline-flex h-9 items-center rounded-lg border bg-white px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                + Add new entry
              </button>
              <button
                type="button"
                onClick={saveAll}
                  disabled={saving || Boolean(eventIdSaveError)}
                className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}

          {(saveError || eventIdSaveError) && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {saveError || eventIdSaveError}
            </div>
          )}
        </>
      )}
    </div>
  );
}
