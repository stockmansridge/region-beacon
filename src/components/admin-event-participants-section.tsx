import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  downloadCsv,
  sanitiseCsvFilename,
  todayStamp,
  toCsv,
  type CsvHeader,
} from "@/lib/csv";

type ParticipantRow = {
  passport_id: string;
  visitor_id: string;
  display_name: string;
  email: string | null;
  mobile: string | null;
  passport_stamp_count: number;
  total_points: number;
  venue_points: number;
  bonus_points: number;
  bonus_codes_claimed: number;
  latest_activity_at: string | null;
  created_at: string;
  passport_status: string;
};

type SortKey =
  | "total_points"
  | "passport_stamp_count"
  | "bonus_points"
  | "venue_points"
  | "bonus_codes_claimed"
  | "latest_activity_at"
  | "created_at"
  | "display_name";

const numberFmt = new Intl.NumberFormat();

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

const PARTICIPANT_CSV_HEADERS: Array<CsvHeader<ParticipantRow>> = [
  { label: "Participant name", key: "display_name" },
  { label: "Email", key: "email" },
  { label: "Mobile", key: "mobile" },
  { label: "Passport status", key: "passport_status" },
  { label: "Passport stamps", key: "passport_stamp_count" },
  { label: "Total points", key: "total_points" },
  { label: "Venue points", key: "venue_points" },
  { label: "Bonus points", key: "bonus_points" },
  { label: "Bonus codes claimed", key: "bonus_codes_claimed" },
  { label: "Latest activity", key: "latest_activity_at" },
  { label: "Registered", key: "created_at" },
  { label: "Passport ID", key: "passport_id" },
];

type BonusClaimExportRow = {
  passport_id: string;
  visitor_id: string | null;
  display_name: string;
  email: string | null;
  mobile: string | null;
  award_id: string;
  bonus_code_id: string | null;
  bonus_code_name: string | null;
  bonus_code_description: string | null;
  points_awarded: number;
  awarded_at: string;
  bonus_code_is_active: boolean | null;
};

type BonusClaimCsvRow = BonusClaimExportRow & {
  bonus_code_name_display: string;
  bonus_code_status: "Active" | "Disabled" | "Unavailable";
};

const BONUS_CLAIMS_CSV_HEADERS: Array<CsvHeader<BonusClaimCsvRow>> = [
  { label: "Participant name", key: "display_name" },
  { label: "Email", key: "email" },
  { label: "Mobile", key: "mobile" },
  { label: "Bonus code name", key: "bonus_code_name_display" },
  { label: "Bonus code description", key: "bonus_code_description" },
  { label: "Points awarded", key: "points_awarded" },
  { label: "Claimed at", key: "awarded_at" },
  { label: "Bonus code status", key: "bonus_code_status" },
  { label: "Passport ID", key: "passport_id" },
  { label: "Award ID", key: "award_id" },
  { label: "Visitor ID", key: "visitor_id" },
  { label: "Bonus code ID", key: "bonus_code_id" },
];

function exportParticipantsCsv(
  rows: ParticipantRow[],
  eventName: string | null | undefined,
  setError: (msg: string | null) => void,
) {
  try {
    if (rows.length === 0) return;
    const csv = toCsv(rows, PARTICIPANT_CSV_HEADERS);
    const slug = sanitiseCsvFilename(eventName || "event");
    const filename = `getstampd-${slug}-participants-${todayStamp()}.csv`;
    downloadCsv(filename, csv);
  } catch (err) {
    console.error("Participant CSV export failed", err);
    setError("Could not export participant results.");
  }
}

export function AdminEventParticipantsSection({
  eventId,
  canView,
  eventName,
}: {
  eventId: string;
  canView: boolean;
  eventName?: string | null;
}) {
  const [rows, setRows] = useState<ParticipantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_points");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exportingClaims, setExportingClaims] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDeleteParticipant(row: ParticipantRow) {
    const name = row.display_name || "this participant";
    const ok = window.confirm(
      `Delete ${name}?\n\n` +
        "This permanently removes their passport, all check-ins, " +
        "bonus code claims, point awards, consents, and visitor record " +
        "for this event.\n\n" +
        "This cannot be undone.",
    );
    if (!ok) return;
    setDeletingId(row.passport_id);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc(
        "admin_delete_event_participant",
        { p_event_id: eventId, p_passport_id: row.passport_id },
      );
      if (rpcError) throw rpcError;
      setRows((prev) => prev.filter((r) => r.passport_id !== row.passport_id));
      if (expandedId === row.passport_id) setExpandedId(null);
    } catch (err) {
      const anyErr = err as { message?: string; details?: string; hint?: string; code?: string };
      const message =
        [anyErr?.message, anyErr?.details, anyErr?.hint, anyErr?.code ? `(${anyErr.code})` : null]
          .filter(Boolean)
          .join(" — ") || "Could not delete participant.";
      setError(message);
      console.error("admin_delete_event_participant failed", err);
    } finally {
      setDeletingId(null);
    }
  }


  async function handleExportBonusClaimsCsv() {
    setExportingClaims(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "get_admin_event_bonus_claims_export",
        { p_event_id: eventId },
      );
      if (rpcError) throw rpcError;
      const claimRows = (data ?? []) as BonusClaimExportRow[];
      if (claimRows.length === 0) {
        setError("No bonus claims to export yet.");
        return;
      }
      const csvRows = claimRows.map((c) => ({
        ...c,
        bonus_code_name_display: c.bonus_code_id
          ? c.bonus_code_name || "Untitled bonus code"
          : "Bonus code no longer available",
        bonus_code_status: (!c.bonus_code_id
          ? "Unavailable"
          : c.bonus_code_is_active
          ? "Active"
          : "Disabled") as BonusClaimCsvRow["bonus_code_status"],
      }));
      const csv = toCsv(csvRows, BONUS_CLAIMS_CSV_HEADERS);
      const slug = sanitiseCsvFilename(eventName || "event");
      downloadCsv(
        `getstampd-${slug}-bonus-claims-${todayStamp()}.csv`,
        csv,
      );
    } catch (err) {
      console.error("Bonus claims CSV export failed", err);
      setError("Could not export bonus claims.");
    } finally {
      setExportingClaims(false);
    }
  }

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error } = await supabase.rpc(
        "get_admin_event_participants_with_points",
        { p_event_id: eventId },
      );
      if (cancelled) return;
      if (error) {
        setError(error.message ?? "Could not load participants.");
        setRows([]);
      } else {
        setRows((data ?? []) as ParticipantRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, canView, reloadKey]);

  const summary = useMemo(() => {
    return {
      total_participants: rows.length,
      total_points: rows.reduce((s, r) => s + (r.total_points || 0), 0),
      venue_points: rows.reduce((s, r) => s + (r.venue_points || 0), 0),
      bonus_points: rows.reduce((s, r) => s + (r.bonus_points || 0), 0),
      bonus_codes_claimed: rows.reduce(
        (s, r) => s + (r.bonus_codes_claimed || 0),
        0,
      ),
      total_stamps: rows.reduce(
        (s, r) => s + (r.passport_stamp_count || 0),
        0,
      ),
    };
  }, [rows]);

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => {
          return (
            (r.display_name || "").toLowerCase().includes(q) ||
            (r.email || "").toLowerCase().includes(q) ||
            (r.mobile || "").toLowerCase().includes(q)
          );
        })
      : rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, query, sortKey, sortDir]);

  function toggleSort(next: SortKey) {
    if (sortKey === next) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(next);
      setSortDir(next === "display_name" ? "asc" : "desc");
    }
  }

  function sortArrow(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  if (!canView) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have permission to view participants for this event.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <SummaryCard label="Participants" value={summary.total_participants} />
        <SummaryCard label="Total points" value={summary.total_points} />
        <SummaryCard label="Venue points" value={summary.venue_points} />
        <SummaryCard label="Bonus points" value={summary.bonus_points} />
        <SummaryCard
          label="Bonus codes claimed"
          value={summary.bonus_codes_claimed}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          placeholder="Search by name, email, mobile…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 w-full max-w-sm rounded-md border border-[#D9E2EF] bg-white px-3 text-sm outline-none focus:border-[#1F56C5]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading || rows.length === 0}
            onClick={() => exportParticipantsCsv(rows, eventName, setError)}
            className="inline-flex h-9 items-center rounded-md border border-[#D9E2EF] bg-white px-3 text-sm font-medium text-[#1F56C5] hover:bg-[#F4F7FB] disabled:cursor-not-allowed disabled:opacity-50"
            title={
              rows.length === 0
                ? "No participant results to export yet."
                : "Export all loaded participant rows as CSV"
            }
          >
            Export CSV
          </button>
          <button
            type="button"
            disabled={exportingClaims || loading}
            onClick={handleExportBonusClaimsCsv}
            className="inline-flex h-9 items-center rounded-md border border-[#D9E2EF] bg-white px-3 text-sm font-medium text-[#1F56C5] hover:bg-[#F4F7FB] disabled:cursor-not-allowed disabled:opacity-50"
            title="Export one row per bonus code claim as CSV"
          >
            {exportingClaims ? "Exporting…" : "Export bonus claims CSV"}
          </button>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex h-9 items-center rounded-md border border-[#D9E2EF] bg-white px-3 text-sm font-medium text-[#1F56C5] hover:bg-[#F4F7FB]"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading participants…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-[#D9E2EF] bg-white p-6 text-center">
          <p className="text-sm font-medium text-[#111827]">
            No participants yet
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Participants will appear here once they create a passport or scan a
            QR code.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-[#E6ECF4] bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[#F4F7FB] text-xs uppercase tracking-wide text-[#64748B]">
              <tr>
                <Th onClick={() => toggleSort("display_name")}>
                  Participant{sortArrow("display_name")}
                </Th>
                <Th onClick={() => toggleSort("total_points")} className="text-right">
                  Total pts{sortArrow("total_points")}
                </Th>
                <Th
                  onClick={() => toggleSort("passport_stamp_count")}
                  className="text-right"
                >
                  Stamps{sortArrow("passport_stamp_count")}
                </Th>
                <Th onClick={() => toggleSort("venue_points")} className="text-right">
                  Venue pts{sortArrow("venue_points")}
                </Th>
                <Th onClick={() => toggleSort("bonus_points")} className="text-right">
                  Bonus pts{sortArrow("bonus_points")}
                </Th>
                <Th
                  onClick={() => toggleSort("bonus_codes_claimed")}
                  className="text-right"
                >
                  Bonus codes{sortArrow("bonus_codes_claimed")}
                </Th>
                <Th onClick={() => toggleSort("latest_activity_at")}>
                  Latest activity{sortArrow("latest_activity_at")}
                </Th>
                <Th onClick={() => toggleSort("created_at")}>
                  Registered{sortArrow("created_at")}
                </Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((r) => {
                const isExpanded = expandedId === r.passport_id;
                return (
                <Fragment key={r.passport_id}>
                <tr
                  className="border-t border-[#E6ECF4] hover:bg-[#FAFBFD]"
                >
                  <td className="px-3 py-2.5 align-top">
                    <div className="font-medium text-[#111827]">
                      {r.display_name || "Guest"}
                    </div>
                    {(r.email || r.mobile) && (
                      <div className="text-xs text-muted-foreground">
                        {[r.email, r.mobile].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-[#111827]">
                    {numberFmt.format(r.total_points)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {numberFmt.format(r.passport_stamp_count)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[#334155]">
                    {numberFmt.format(r.venue_points)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[#334155]">
                    {numberFmt.format(r.bonus_points)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[#334155]">
                    <div className="flex items-center justify-end gap-2">
                      <span>{numberFmt.format(r.bonus_codes_claimed)}</span>
                      {r.bonus_codes_claimed > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : r.passport_id)
                          }
                          className="rounded border border-[#D9E2EF] bg-white px-2 py-0.5 text-xs font-medium text-[#1F56C5] hover:bg-[#F4F7FB]"
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? "Hide" : "View"}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDate(r.latest_activity_at)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDate(r.created_at)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteParticipant(r)}
                      disabled={deletingId === r.passport_id}
                      className="inline-flex h-8 items-center rounded-md border border-[#FCA5A5] bg-white px-2.5 text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:opacity-50"
                      title="Permanently delete this participant and all their data for this event"
                    >
                      {deletingId === r.passport_id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="border-t border-[#E6ECF4] bg-[#F8FAFD]">
                    <td colSpan={9} className="px-3 py-3">
                      <ParticipantBonusClaims
                        eventId={eventId}
                        passportId={r.passport_id}
                        displayName={r.display_name || "Guest"}
                        reloadKey={reloadKey}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length > 0 && filteredSorted.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No participants match your search.
        </p>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[12px] border border-[#E6ECF4] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="text-xs uppercase tracking-wide text-[#64748B]">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-[#111827]">
        {numberFmt.format(value)}
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <th
      className={
        "px-3 py-2.5 font-medium " +
        (onClick ? "cursor-pointer select-none hover:text-[#1F56C5] " : "") +
        (className ?? "")
      }
      onClick={onClick}
    >
      {children}
    </th>
  );
}

type BonusClaimRow = {
  award_id: string;
  bonus_code_id: string | null;
  bonus_code_name: string | null;
  bonus_code_description: string | null;
  points_awarded: number;
  awarded_at: string;
  bonus_code_is_active: boolean | null;
};

function ParticipantBonusClaims({
  eventId,
  passportId,
  displayName,
  reloadKey,
}: {
  eventId: string;
  passportId: string;
  displayName: string;
  reloadKey: number;
}) {
  const [rows, setRows] = useState<BonusClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error } = await supabase.rpc(
        "get_admin_participant_bonus_claims",
        { p_event_id: eventId, p_passport_id: passportId },
      );
      if (cancelled) return;
      if (error) {
        console.error("get_admin_participant_bonus_claims failed", error);
        setError("Could not load bonus claims.");
        setRows([]);
      } else {
        setRows((data ?? []) as BonusClaimRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, passportId, reloadKey]);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold text-[#111827]">
          Bonus codes claimed by {displayName}
        </h4>
        <p className="text-[11px] text-muted-foreground">
          Points shown are the points awarded at the time of claim.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading bonus claims…</p>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-[#D9E2EF] bg-white px-3 py-3">
          <p className="text-sm font-medium text-[#111827]">
            No bonus codes claimed
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            This participant has not claimed any bonus codes yet.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#E6ECF4] rounded-md border border-[#E6ECF4] bg-white">
          {rows.map((c) => {
            const missing = !c.bonus_code_id;
            const name = missing
              ? "Bonus code no longer available"
              : c.bonus_code_name || "Untitled bonus code";
            const statusLabel = missing
              ? null
              : c.bonus_code_is_active
              ? "Currently active"
              : "Currently disabled";
            return (
              <li key={c.award_id} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={"text-sm font-medium " + (missing ? "text-muted-foreground italic" : "text-[#111827]")}>
                      {name}
                    </span>
                    {statusLabel && (
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                          (c.bonus_code_is_active
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700")
                        }
                      >
                        {statusLabel}
                      </span>
                    )}
                  </div>
                  {c.bonus_code_description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.bonus_code_description}
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Claimed {formatDate(c.awarded_at)}
                  </p>
                </div>
                <div className="text-right text-sm font-semibold text-[#111827]">
                  {numberFmt.format(c.points_awarded)} pts
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

