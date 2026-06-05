import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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

export function AdminEventParticipantsSection({
  eventId,
  canView,
}: {
  eventId: string;
  canView: boolean;
}) {
  const [rows, setRows] = useState<ParticipantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("total_points");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="inline-flex h-9 items-center rounded-md border border-[#D9E2EF] bg-white px-3 text-sm font-medium text-[#1F56C5] hover:bg-[#F4F7FB]"
        >
          Refresh
        </button>
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
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map((r) => (
                <tr
                  key={r.passport_id}
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
                    {numberFmt.format(r.bonus_codes_claimed)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDate(r.latest_activity_at)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDate(r.created_at)}
                  </td>
                </tr>
              ))}
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
