import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2, Pencil, Trophy, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type AdminEventAward,
  type AwardDrawHistoryRow,
  type AwardDrawResult,
  type AwardStatus,
  deleteAward,
  drawAwardWinner,
  listAdminAwards,
  listAwardDrawHistory,
  saveAward,
  uploadAwardImage,
  voidAwardDraw,
} from "@/lib/event-awards";

function formatErr(e: unknown): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  const obj = e as { message?: string; details?: string; hint?: string; code?: string };
  return [obj.message, obj.details, obj.hint, obj.code && `Code: ${obj.code}`]
    .filter(Boolean)
    .join(" | ") || JSON.stringify(e);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; award: AdminEventAward };

type DrawState =
  | { mode: "closed" }
  | { mode: "confirm"; award: AdminEventAward; error?: string | null }
  | { mode: "drawing"; award: AdminEventAward }
  | { mode: "result"; award: AdminEventAward; result: AwardDrawResult };

export function EventAwardsSection({
  agencyId,
  eventId,
  canEdit,
}: {
  agencyId: string;
  eventId: string;
  canEdit: boolean;
}) {
  const [awards, setAwards] = useState<AdminEventAward[] | null>(null);
  const [history, setHistory] = useState<AwardDrawHistoryRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [draw, setDraw] = useState<DrawState>({ mode: "closed" });
  const [deleting, setDeleting] = useState<AdminEventAward | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadError(null);
        const [a, h] = await Promise.all([
          listAdminAwards(eventId),
          listAwardDrawHistory(eventId),
        ]);
        if (cancelled) return;
        setAwards(a);
        setHistory(h);
      } catch (e) {
        if (cancelled) return;
        setLoadError(formatErr(e));
        setAwards([]);
        setHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);

  return (
    <div className="space-y-6">
      {loadError && (
        <p className="rounded border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Could not load prizes: {loadError}
          <br />
          <span className="text-xs">
            If this mentions a missing function, the prizes SQL migration has not been
            applied yet (see <code>supabase/migrations-draft-event-awards/</code>).
          </span>
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Prizes and draw entries participants can unlock by earning
          points and/or visiting all locations. Each one appears in the public
          passport Prizes section and on the public Prizes page.
        </p>
        {canEdit && (
          <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
            Add prize
          </Button>
        )}
      </div>


      {awards == null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : awards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#D9E2EF] bg-[#F8FAFC] p-8 text-center">
          <Trophy className="mx-auto h-8 w-8 text-[#64748B]" />
          <p className="mt-2 text-sm font-medium text-[#111827]">
            No prizes have been created yet
          </p>
          <p className="mt-1 text-xs text-[#64748B]">
            Add your first prize to show it in the public passport. To
            run a major prize draw, create a prize named “Major prize draw”
            with the points required to enter.
          </p>
          {canEdit && (
            <Button
              className="mt-4"
              size="sm"
              onClick={() => setEditor({ mode: "create" })}
            >
              Create your first prize
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {awards.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-4 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm sm:flex-row"
            >
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F1F5F9]">
                {a.image_url ? (
                  <img
                    src={a.image_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Trophy className="h-8 w-8 text-[#94A3B8]" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-semibold text-[#0F172A]">{a.title}</h4>
                  {a.status === "disabled" && (
                    <Badge variant="secondary">Disabled</Badge>
                  )}
                </div>
                {a.description && (
                  <p className="text-sm text-[#475569]">{a.description}</p>
                )}
                <p className="text-xs text-[#64748B]">
                  {a.points_required} {a.points_required === 1 ? "point" : "points"} required
                  {a.requires_all_locations ? " · Must visit all locations" : ""}
                </p>
                <p className="text-xs font-medium text-[#0F172A]">
                  {a.eligible_count === 0
                    ? "No eligible entrants yet"
                    : `${a.eligible_count} ${a.eligible_count === 1 ? "person" : "people"} currently in this draw`}
                </p>
                {a.latest_draw_id && (
                  <p className="text-xs text-[#1F56C5]">
                    Winner drawn: {a.latest_winner_name ?? "—"}
                    {a.latest_winner_email ? ` (${a.latest_winner_email})` : ""} ·{" "}
                    {formatDateTime(a.latest_drawn_at)}
                  </p>
                )}
              </div>
              {canEdit && (
                <div className="flex flex-row flex-wrap items-start gap-2 sm:flex-col sm:items-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditor({ mode: "edit", award: a })}
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    disabled={a.status !== "active"}
                    onClick={() => setDraw({ mode: "confirm", award: a })}
                  >
                    <Trophy className="h-4 w-4" />
                    {a.latest_draw_id ? "Draw again" : "Draw winner"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleting(a)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <DrawHistory rows={history} canEdit={canEdit} onVoided={refresh} />

      {editor.mode !== "closed" && (
        <AwardEditorDialog
          agencyId={agencyId}
          eventId={eventId}
          award={editor.mode === "edit" ? editor.award : null}
          onClose={() => setEditor({ mode: "closed" })}
          onSaved={() => {
            setEditor({ mode: "closed" });
            refresh();
          }}
        />
      )}

      {draw.mode !== "closed" && (
        <DrawDialog
          state={draw}
          onCancel={() => setDraw({ mode: "closed" })}
          onConfirm={async () => {
            if (draw.mode !== "confirm" && draw.mode !== "drawing") return;
            const award = draw.award;
            setDraw({ mode: "drawing", award });
            try {
              const result = await drawAwardWinner(award.id);
              setDraw({ mode: "result", award, result });
              toast.success(
                `Winner drawn: ${result.winner_participant_name ?? "—"}`,
              );
              refresh();
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error("[awards] draw_event_award_winner failed", e);
              const msg = formatErr(e);
              toast.error(msg);
              setDraw({ mode: "confirm", award, error: msg });
            }
          }}
          onClose={() => {
            setDraw({ mode: "closed" });
            refresh();
          }}
        />
      )}

      {deleting && (
        <AlertDialog open onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{deleting.title}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This hides the prize from the public page and from this list. Previous
                draw history is kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  try {
                    await deleteAward(deleting.id);
                    toast.success("Prize deleted");
                    setDeleting(null);
                    refresh();
                  } catch (e) {
                    toast.error(formatErr(e));
                  }
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function DrawHistory({
  rows,
  canEdit,
  onVoided,
}: {
  rows: AwardDrawHistoryRow[] | null;
  canEdit: boolean;
  onVoided: () => void;
}) {
  const [voiding, setVoiding] = useState<AwardDrawHistoryRow | null>(null);

  if (!rows) return null;
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
        <h4 className="text-sm font-semibold text-[#0F172A]">Prize draw history</h4>
        <p className="mt-1 text-xs text-[#64748B]">No draws have been recorded yet.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white">
      <div className="border-b border-[#E2E8F0] p-4">
        <h4 className="text-sm font-semibold text-[#0F172A]">Prize draw history</h4>
        <p className="mt-1 text-xs text-[#64748B]">Newest first. Voided draws stay in history for audit.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-[#F8FAFC] text-[11px] uppercase tracking-wider text-[#64748B]">
            <tr>
              <th className="px-4 py-2 text-left">Prize</th>
              <th className="px-4 py-2 text-left">Winner</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Entrants</th>
              <th className="px-4 py-2 text-left">Drawn at</th>
              <th className="px-4 py-2 text-left">Status</th>
              {canEdit && <th className="px-4 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const voided = !!r.voided_at;
              return (
                <tr key={r.id} className="border-t border-[#E2E8F0]">
                  <td className="px-4 py-2 font-medium text-[#0F172A]">{r.award_title}</td>
                  <td className={`px-4 py-2 ${voided ? "text-[#94A3B8] line-through" : ""}`}>
                    {r.winner_participant_name ?? "—"}
                  </td>
                  <td className={`px-4 py-2 ${voided ? "text-[#94A3B8] line-through" : "text-[#475569]"}`}>
                    {r.winner_participant_email ?? "—"}
                  </td>
                  <td className="px-4 py-2">{r.eligible_count}</td>
                  <td className="px-4 py-2 text-[#475569]">{formatDateTime(r.drawn_at)}</td>
                  <td className="px-4 py-2">
                    {voided ? (
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="secondary" className="w-fit bg-[#FEE2E2] text-[#991B1B]">
                          Voided
                        </Badge>
                        {r.void_reason && (
                          <span className="text-[11px] text-[#64748B]">{r.void_reason}</span>
                        )}
                        {r.voided_at && (
                          <span className="text-[11px] text-[#94A3B8]">
                            {formatDateTime(r.voided_at)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <Badge variant="secondary" className="bg-[#DCFCE7] text-[#166534]">
                        Active
                      </Badge>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2 text-right">
                      {!voided && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setVoiding(r)}
                        >
                          Undo draw
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {voiding && (
        <VoidDrawDialog
          row={voiding}
          onCancel={() => setVoiding(null)}
          onDone={() => {
            setVoiding(null);
            onVoided();
          }}
        />
      )}
    </div>
  );
}

function VoidDrawDialog({
  row,
  onCancel,
  onDone,
}: {
  row: AwardDrawHistoryRow;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Undo winner draw?</DialogTitle>
          <DialogDescription>
            This marks the draw for "{row.award_title}" as voided and allows
            you to redraw a winner. The original draw stays in history for
            audit purposes and is not deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="void-reason">Reason (optional)</Label>
          <Textarea
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason, e.g. wrong prize selected"
            rows={3}
            disabled={busy}
          />
          {error && (
            <p className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await voidAwardDraw(row.id, reason.trim() || null);
                toast.success("Draw undone.");
                onDone();
              } catch (e) {
                const msg = formatErr(e);
                setError(msg);
                toast.error(`Undo failed: ${msg}`);
                setBusy(false);
              }
            }}
          >
            {busy ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Undoing…
              </span>
            ) : (
              "Undo draw"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AwardEditorDialog({
  agencyId,
  eventId,
  award,
  onClose,
  onSaved,
}: {
  agencyId: string;
  eventId: string;
  award: AdminEventAward | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(award?.title ?? "");
  const [description, setDescription] = useState(award?.description ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(award?.image_url ?? null);
  const [pointsRequired, setPointsRequired] = useState(
    String(award?.points_required ?? 0),
  );
  const [requiresAllLocations, setRequiresAllLocations] = useState(
    award?.requires_all_locations ?? false,
  );
  const [status, setStatus] = useState<AwardStatus>(award?.status ?? "active");
  const [sortOrder, setSortOrder] = useState(String(award?.sort_order ?? 0));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!award;

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const res = await uploadAwardImage({ agencyId, eventId, file });
      if (!res.ok) {
        setError(res.error);
      } else {
        setImageUrl(res.publicUrl);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    const pr = Number(pointsRequired);
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!Number.isFinite(pr) || !Number.isInteger(pr) || pr < 0) {
      setError("Points required must be a whole number of 0 or more.");
      return;
    }
    const so = Number(sortOrder);
    setSaving(true);
    try {
      await saveAward({
        awardId: award?.id ?? null,
        eventId,
        title: title.trim(),
        description: description.trim() || null,
        imageUrl,
        pointsRequired: pr,
        requiresAllLocations,
        status,
        sortOrder: Number.isFinite(so) ? so : 0,
      });
      toast.success(isEdit ? "Prize updated" : "Prize created");
      onSaved();
    } catch (e) {
      setError(formatErr(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit prize" : "Create prize"}</DialogTitle>
          <DialogDescription>
            Prizes become unlockable once a participant meets the criteria below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="award-title">Title *</Label>
            <Input
              id="award-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="award-desc">Description</Label>
            <Textarea
              id="award-desc"
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Image</Label>
            <div className="flex items-center gap-3">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  className="h-16 w-16 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#94A3B8]">
                  <ImagePlus className="h-6 w-6" />
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm hover:bg-accent">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  {imageUrl ? "Replace" : "Upload image"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {imageUrl && (
                  <button
                    type="button"
                    className="text-left text-xs text-destructive hover:underline"
                    onClick={() => setImageUrl(null)}
                  >
                    Remove image
                  </button>
                )}
                <p className="text-[11px] text-muted-foreground">
                  PNG, JPG or WebP. Max 5 MB.
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="award-points">Points required *</Label>
              <Input
                id="award-points"
                type="number"
                min={0}
                step={1}
                value={pointsRequired}
                onChange={(e) => setPointsRequired(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="award-sort">Sort order</Label>
              <Input
                id="award-sort"
                type="number"
                step={1}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="award-allloc">Requires visiting all locations</Label>
              <p className="text-xs text-muted-foreground">
                Participant must check in to every active venue.
              </p>
            </div>
            <Switch
              id="award-allloc"
              checked={requiresAllLocations}
              onCheckedChange={setRequiresAllLocations}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="award-status">Active</Label>
              <p className="text-xs text-muted-foreground">
                Disabled prizes are hidden from the public page.
              </p>
            </div>
            <Switch
              id="award-status"
              checked={status === "active"}
              onCheckedChange={(v) => setStatus(v ? "active" : "disabled")}
            />
          </div>

          {error && (
            <p className="rounded border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DrawDialog({
  state,
  onCancel,
  onConfirm,
  onClose,
}: {
  state: Exclude<DrawState, { mode: "closed" }>;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const award = state.award;
  const isRedraw = !!award.latest_draw_id;
  const result = state.mode === "result" ? state.result : null;
  const drawing = state.mode === "drawing";
  const errorMsg = state.mode === "confirm" ? state.error ?? null : null;
  const noEligible = award.eligible_count === 0;

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) {
          if (state.mode === "result") onClose();
          else if (!drawing) onCancel();
        }
      }}
    >
      <DialogContent>
        {state.mode !== "result" ? (
          <>
            <DialogHeader>
              <DialogTitle>Draw winner for "{award.title}"?</DialogTitle>
              <DialogDescription>
                This will randomly select one winner from the currently eligible
                participants. The draw will be saved in the award history.
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-1 rounded-lg bg-[#F8FAFC] p-3 text-sm text-[#0F172A]">
              <li>
                <strong>{award.eligible_count}</strong>{" "}
                {award.eligible_count === 1 ? "person" : "people"} currently eligible
              </li>
              <li>{award.points_required} points required</li>
              {award.requires_all_locations && <li>Must visit all locations</li>}
            </ul>
            {isRedraw && (
              <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                A previous winner has already been drawn. Drawing again will create a
                new draw record and keep the old result in history.
              </p>
            )}
            {errorMsg && (
              <p
                role="alert"
                className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-900"
              >
                Draw failed: {errorMsg}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={drawing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void onConfirm()}
                disabled={drawing || noEligible}
              >
                {drawing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Drawing…
                  </>
                ) : isRedraw ? (
                  "Draw again"
                ) : (
                  "Draw winner"
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Winner drawn 🎉</DialogTitle>
              <DialogDescription>{award.title}</DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border bg-[#F8FAFC] p-4">
              <p className="text-xs uppercase tracking-wide text-[#64748B]">Winner</p>
              <p className="text-lg font-semibold text-[#0F172A]">
                {result?.winner_participant_name ?? "—"}
              </p>
              {result?.winner_participant_email && (
                <p className="text-sm text-[#475569]">
                  {result.winner_participant_email}
                </p>
              )}
              <p className="mt-2 text-xs text-[#64748B]">
                Drawn from {result?.eligible_count} eligible{" "}
                {result?.eligible_count === 1 ? "entrant" : "entrants"} ·{" "}
                {formatDateTime(result?.drawn_at ?? null)}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
