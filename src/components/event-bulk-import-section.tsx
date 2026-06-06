import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Bulk Import (Excel) for an event.
 *
 * UI-only workflow. Reuses the existing supabase mutations used by the
 * manual admin UI:
 *  - Venues: direct insert/update on the `venues` table (same patch shape
 *    as the venue editor's saveVenue()).
 *  - Bonus Codes: insert/update on `event_bonus_codes` (same shape as
 *    BonusCodesSection).
 *  - Tasting QR Codes: rpc `save_venue_tasting_qr_code` (same as
 *    VenueTastingQrSection).
 *
 * No backend schema changes. No deletes. Always validate + preview before
 * saving.
 */

type Status = "active" | "disabled";

type RowIssue = { level: "error" | "warning"; message: string };

type VenueDraft = {
  rowNum: number;
  venue_key: string;
  name: string;
  description: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  website_url: string | null;
  phone: string | null;
  offer_summary: string | null;
  order_index: number;
  status: "active" | "inactive";
  // Optional stamp/entry value saved to venue_qr_codes.entry_value for the
  // venue's active QR row. null = leave unchanged on import.
  check_in_value: number | null;
  issues: RowIssue[];
  // Resolved at confirm:
  matchedVenueId?: string | null;
  resultVenueId?: string | null;
  result?: "created" | "updated" | "skipped" | "error";
  resultMessage?: string;
};

type BonusDraft = {
  rowNum: number;
  code: string; // import-side identifier only
  title: string;
  description: string | null;
  points: number;
  status: Status;
  issues: RowIssue[];
  matchedId?: string | null;
  result?: "created" | "updated" | "skipped" | "error";
  resultMessage?: string;
};

type TastingDraft = {
  rowNum: number;
  venue_key: string;
  qr_name: string;
  description: string | null;
  points: number;
  status: Status;
  issues: RowIssue[];
  result?: "created" | "updated" | "skipped" | "error";
  resultMessage?: string;
};

type ExistingVenue = {
  id: string;
  name: string;
};

type ExistingBonus = {
  id: string;
  name: string;
};

type Drafts = {
  venues: VenueDraft[];
  bonuses: BonusDraft[];
  tastings: TastingDraft[];
};

const REQUIRED_SHEETS = ["Venues", "Bonus Codes", "Tasting QR Codes"];

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function num(v: unknown): number | null {
  const t = s(v);
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function statusOrDefault(v: unknown, dflt: Status = "active"): Status | null {
  const t = s(v).toLowerCase();
  if (t === "") return dflt;
  if (t === "active" || t === "disabled" || t === "inactive") {
    return t === "inactive" ? "disabled" : (t as Status);
  }
  return null;
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  const instructions: (string | number)[][] = [
    ["Bulk Import Template — GetStampd"],
    [""],
    ["How to use:"],
    ["1. Do NOT rename the sheet tabs (Venues, Bonus Codes, Tasting QR Codes)."],
    ["2. Fill in one row per item. Leave optional fields blank."],
    ["3. venue_key is an import-only reference used to link Tasting QR rows to"],
    ["   their Venue row in this file. It is NEVER shown publicly."],
    ["4. Save as .xlsx, then upload in the Bulk Import card."],
    ["5. Importing ADDS or UPDATES records. It never deletes anything."],
    ["6. Matching: venues match by name within this event; bonus codes match by"],
    ["   title; tasting QR codes match by qr_name within their venue."],
    [""],
    ["Reward values — IMPORTANT:"],
    ["Venue check-ins and bonus rewards use different reward fields."],
    ["  • Venue check-ins use check_in_value, which controls the number of stamps"],
    ["    awarded for scanning the venue's normal QR / check-in code."],
    ["  • Bonus Codes and Tasting QR Codes use points, which controls additional"],
    ["    points earned through optional bonus actions."],
    [""],
    ["  check_in_value (Venues sheet):"],
    ["    Stamp value awarded when a participant scans this venue's normal"],
    ["    QR / check-in code. Whole number from 1 to 100."],
    ["    Leaving a venue check_in_value blank will leave the existing venue QR"],
    ["    stamp value unchanged."],
    ["    If a venue does not yet have an active venue QR code, the venue will"],
    ["    still import, but the check-in value cannot be applied until a QR"],
    ["    code exists."],
    [""],
    ["  points (Bonus Codes sheet):"],
    ["    Bonus points awarded when this bonus code is claimed. 0 or higher."],
    [""],
    ["  points (Tasting QR Codes sheet):"],
    ["    Tasting points awarded when this tasting QR code is claimed. 0 or higher."],
    [""],
    ["Example values:"],
    ["  venue_key: venue_001, ridge_winery, stall_12"],
    ["  status:    active, disabled"],
    ["  latitude:  -36.8485"],
    ["  longitude: 174.7633"],
    [""],
    ["Note: QR images are NOT imported. The app generates QR codes after save."],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
  wsInstr["!cols"] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, "Instructions");

  const venuesHeader = [
    "venue_key",
    "name",
    "description",
    "address",
    "latitude",
    "longitude",
    "website_url",
    "phone",
    "offer_summary",
    "order_index",
    "status",
    "check_in_value",
  ];
  const venuesExample = [
    "venue_001",
    "Ridge Winery",
    "Award-winning boutique winery overlooking the valley.",
    "12 Ridge Rd, Marlborough",
    -41.5,
    173.95,
    "https://ridgewinery.example",
    "+64 3 555 0101",
    "Free tasting flight on arrival",
    1,
    "active",
    1,
  ];
  const wsV = XLSX.utils.aoa_to_sheet([venuesHeader, venuesExample]);
  wsV["!cols"] = venuesHeader.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, wsV, "Venues");

  const bonusHeader = ["code", "title", "description", "points", "status"];
  const bonusExample = ["TRAIL2026", "Trail Challenge", "Bonus for completing the trail.", 50, "active"];
  const wsB = XLSX.utils.aoa_to_sheet([bonusHeader, bonusExample]);
  wsB["!cols"] = bonusHeader.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, wsB, "Bonus Codes");

  const tastingHeader = ["venue_key", "qr_name", "description", "points", "status"];
  const tastingExample = ["venue_001", "Shiraz Tasting", "Try our flagship Shiraz.", 10, "active"];
  const wsT = XLSX.utils.aoa_to_sheet([tastingHeader, tastingExample]);
  wsT["!cols"] = tastingHeader.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, wsT, "Tasting QR Codes");

  XLSX.writeFile(wb, "getstampd-bulk-import-template.xlsx");
}

function rowsFromSheet(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function parseAndValidate(wb: XLSX.WorkBook): { drafts: Drafts; missingSheets: string[] } {
  const missingSheets = REQUIRED_SHEETS.filter((n) => !wb.Sheets[n]);
  const venueRows = rowsFromSheet(wb, "Venues");
  const bonusRows = rowsFromSheet(wb, "Bonus Codes");
  const tastingRows = rowsFromSheet(wb, "Tasting QR Codes");

  const venueKeySeen = new Map<string, number>();
  const bonusTitleSeen = new Map<string, number>();
  const venues: VenueDraft[] = venueRows
    .map((r, i): VenueDraft | null => {
      const venue_key = s(r["venue_key"]);
      const name = s(r["name"]);
      if (!venue_key && !name) return null; // skip blank rows
      const issues: RowIssue[] = [];
      const lat = num(r["latitude"]);
      const lng = num(r["longitude"]);
      const latRaw = s(r["latitude"]);
      const lngRaw = s(r["longitude"]);
      if (!venue_key) issues.push({ level: "error", message: "Venue key is required." });
      if (!name) issues.push({ level: "error", message: "Name is required." });
      if (venue_key) {
        if (venueKeySeen.has(venue_key.toLowerCase())) {
          issues.push({ level: "error", message: "Venue key must be unique." });
        } else {
          venueKeySeen.set(venue_key.toLowerCase(), i);
        }
      }
      if ((latRaw === "") !== (lngRaw === "")) {
        issues.push({
          level: "error",
          message: "Latitude and longitude must both be supplied or both left blank.",
        });
      }
      if (latRaw !== "" && (lat === null || lat < -90 || lat > 90)) {
        issues.push({ level: "error", message: "Latitude must be a number between -90 and 90." });
      }
      if (lngRaw !== "" && (lng === null || lng < -180 || lng > 180)) {
        issues.push({ level: "error", message: "Longitude must be a number between -180 and 180." });
      }
      const statusParsed = statusOrDefault(r["status"], "active");
      if (statusParsed === null) {
        issues.push({ level: "error", message: "Status must be active or disabled." });
      }
      const orderRaw = num(r["order_index"]);
      const order = orderRaw === null ? i : Math.max(0, Math.floor(orderRaw));
      const civRaw = num(r["check_in_value"]);
      let civ: number | null = null;
      if (civRaw !== null) {
        const civInt = Math.floor(civRaw);
        if (!Number.isFinite(civRaw) || civRaw < 1 || civRaw > 100 || civInt !== civRaw) {
          issues.push({ level: "error", message: "check_in_value must be a whole number from 1 to 100." });
        } else {
          civ = civInt;
        }
      }
      return {
        rowNum: i + 2,
        venue_key,
        name,
        description: s(r["description"]) || null,
        address: s(r["address"]) || null,
        lat,
        lng,
        website_url: s(r["website_url"]) || null,
        phone: s(r["phone"]) || null,
        offer_summary: s(r["offer_summary"]) || null,
        order_index: order,
        status: statusParsed === "disabled" ? "inactive" : "active",
        check_in_value: civ,
        issues,
      };
    })
    .filter((r): r is VenueDraft => r !== null);

  const bonuses: BonusDraft[] = bonusRows
    .map((r, i): BonusDraft | null => {
      const code = s(r["code"]);
      const title = s(r["title"]);
      if (!code && !title) return null;
      const issues: RowIssue[] = [];
      if (!code) issues.push({ level: "error", message: "Code is required." });
      if (!title) issues.push({ level: "error", message: "Title is required." });
      if (title) {
        const key = title.toLowerCase();
        if (bonusTitleSeen.has(key)) {
          issues.push({ level: "warning", message: "Title already used earlier in this sheet — only the first row will create; later rows will update the same record." });
        } else {
          bonusTitleSeen.set(key, i);
        }
      }
      const pointsRaw = num(r["points"]);
      if (pointsRaw !== null && (!Number.isFinite(pointsRaw) || pointsRaw < 0 || Math.floor(pointsRaw) !== pointsRaw)) {
        issues.push({ level: "error", message: "Bonus points must be 0 or higher." });
      }
      const points = pointsRaw === null ? 0 : Math.max(0, Math.floor(pointsRaw));
      const statusParsed = statusOrDefault(r["status"], "active");
      if (statusParsed === null) {
        issues.push({ level: "error", message: "Status must be active or disabled." });
      }
      return {
        rowNum: i + 2,
        code,
        title,
        description: s(r["description"]) || null,
        points,
        status: (statusParsed ?? "active") as Status,
        issues,
      };
    })
    .filter((r): r is BonusDraft => r !== null);

  const venueKeySet = new Set(venues.map((v) => v.venue_key.toLowerCase()));
  const tastings: TastingDraft[] = tastingRows
    .map((r, i): TastingDraft | null => {
      const venue_key = s(r["venue_key"]);
      const qr_name = s(r["qr_name"]);
      if (!venue_key && !qr_name) return null;
      const issues: RowIssue[] = [];
      if (!venue_key) {
        issues.push({ level: "error", message: "Venue key is required." });
      } else if (!venueKeySet.has(venue_key.toLowerCase())) {
        issues.push({
          level: "error",
          message: "This tasting QR code refers to a venue_key that does not exist in the Venues sheet.",
        });
      }
      if (!qr_name) issues.push({ level: "error", message: "QR name is required." });
      // Accept either `points` (preferred) or legacy `entry_value` column.
      const pointsCell = s(r["points"]);
      const legacyCell = s(r["entry_value"]);
      const usedLegacy = pointsCell === "" && legacyCell !== "";
      const pRaw = pointsCell !== "" ? num(pointsCell) : num(legacyCell);
      const points = pRaw === null ? 10 : Math.max(0, Math.floor(pRaw));
      if (pRaw !== null && (!Number.isFinite(pRaw) || pRaw < 0 || Math.floor(pRaw) !== pRaw)) {
        issues.push({ level: "error", message: "Tasting points must be 0 or higher." });
      }
      if (usedLegacy) {
        issues.push({
          level: "warning",
          message: "Tasting QR Codes should use points. Legacy entry_value was accepted and converted to points.",
        });
      }
      const statusParsed = statusOrDefault(r["status"], "active");
      if (statusParsed === null) {
        issues.push({ level: "error", message: "Status must be active or disabled." });
      }
      return {
        rowNum: i + 2,
        venue_key,
        qr_name,
        description: s(r["description"]) || null,
        points,
        status: (statusParsed ?? "active") as Status,
        issues,
      };
    })
    .filter((r): r is TastingDraft => r !== null);

  return { drafts: { venues, bonuses, tastings }, missingSheets };
}

function StatusBadge({ row }: { row: { issues: RowIssue[]; result?: string } }) {
  const hasError = row.issues.some((i) => i.level === "error") || row.result === "error";
  const hasWarn = row.issues.some((i) => i.level === "warning");
  if (hasError) {
    return (
      <span className="inline-flex items-center rounded-full border border-[#FCA5A5] bg-[#FEF2F2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#B91C1C]">
        Error
      </span>
    );
  }
  if (row.result === "created" || row.result === "updated") {
    return (
      <span className="inline-flex items-center rounded-full border border-[#86EFAC] bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#047857]">
        {row.result}
      </span>
    );
  }
  if (hasWarn) {
    return (
      <span className="inline-flex items-center rounded-full border border-[#FCD34D] bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#92400E]">
        Warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1D4ED8]">
      Ready
    </span>
  );
}

function IssueList({ issues, extra }: { issues: RowIssue[]; extra?: string }) {
  if (issues.length === 0 && !extra) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-[11px]">
      {issues.map((iss, i) => (
        <li
          key={i}
          className={iss.level === "error" ? "text-[#B91C1C]" : "text-[#92400E]"}
        >
          • {iss.message}
        </li>
      ))}
      {extra && <li className="text-[#475569]">• {extra}</li>}
    </ul>
  );
}

export function EventBulkImportSection({
  agencyId,
  eventId,
  existingVenues,
  canEdit,
  onImported,
}: {
  agencyId: string;
  eventId: string;
  existingVenues: ExistingVenue[];
  canEdit: boolean;
  onImported: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [missingSheets, setMissingSheets] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [existingBonusCodes, setExistingBonusCodes] = useState<ExistingBonus[]>([]);

  // Fetch existing bonus codes once so we can match by title for updates.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("event_bonus_codes")
        .select("id, name")
        .eq("agency_id", agencyId)
        .eq("event_id", eventId);
      if (!cancelled && Array.isArray(data)) {
        setExistingBonusCodes(data as ExistingBonus[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agencyId, eventId]);

  const existingVenueByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of existingVenues) m.set(v.name.trim().toLowerCase(), v.id);
    return m;
  }, [existingVenues]);

  const existingBonusByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of existingBonusCodes) m.set(b.name.trim().toLowerCase(), b.id);
    return m;
  }, [existingBonusCodes]);

  const totals = useMemo(() => {
    if (!drafts) return null;
    const all = [...drafts.venues, ...drafts.bonuses, ...drafts.tastings];
    const errors = all.reduce(
      (n, r) => n + (r.issues.some((i) => i.level === "error") ? 1 : 0),
      0,
    );
    const warnings = all.reduce(
      (n, r) => n + (r.issues.some((i) => i.level === "warning") ? 1 : 0),
      0,
    );
    return {
      errors,
      warnings,
      venues: drafts.venues.length,
      bonuses: drafts.bonuses.length,
      tastings: drafts.tastings.length,
    };
  }, [drafts]);

  function handleFile(file: File) {
    setParseError(null);
    setImportDone(false);
    setDrafts(null);
    setMissingSheets([]);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: "array" });
        const { drafts: d, missingSheets: ms } = parseAndValidate(wb);
        setDrafts(d);
        setMissingSheets(ms);
        if (ms.length > 0) {
          setParseError(`Missing required sheet(s): ${ms.join(", ")}`);
        }
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Could not read the file.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function clearFile() {
    setFileName(null);
    setDrafts(null);
    setParseError(null);
    setMissingSheets([]);
    setImportDone(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function confirmImport() {
    if (!drafts) return;
    setImporting(true);

    const venueIdByKey = new Map<string, string>();
    let venuesCreated = 0;
    let venuesUpdated = 0;
    let bonusesCreated = 0;
    let bonusesUpdated = 0;
    let tastingsCreated = 0;
    let tastingsUpdated = 0;
    let skipped = 0;

    // ---- Venues
    const venuesNext: VenueDraft[] = [];
    for (const v of drafts.venues) {
      if (v.issues.some((i) => i.level === "error")) {
        skipped++;
        venuesNext.push({ ...v, result: "skipped", resultMessage: "Validation errors" });
        continue;
      }
      const existingId = existingVenueByName.get(v.name.trim().toLowerCase()) ?? null;
      const patch: Record<string, unknown> = {
        name: v.name,
        address: v.address,
        lat: v.lat,
        lng: v.lng,
        order_index: v.order_index,
        status: v.status, // "active" | "inactive"
        description: v.description,
        website_url: v.website_url,
        phone: v.phone,
        offer_summary: v.offer_summary,
      };
      try {
        if (existingId) {
          const { error } = await supabase
            .from("venues")
            .update(patch)
            .eq("id", existingId)
            .eq("event_id", eventId)
            .eq("agency_id", agencyId);
          if (error) throw error;
          venueIdByKey.set(v.venue_key.toLowerCase(), existingId);
          venuesUpdated++;
          venuesNext.push({ ...v, matchedVenueId: existingId, resultVenueId: existingId, result: "updated" });
        } else {
          const { data, error } = await supabase
            .from("venues")
            .insert({ agency_id: agencyId, event_id: eventId, ...patch })
            .select("id")
            .single();
          if (error) throw error;
          const id = (data?.id as string) ?? null;
          if (id) venueIdByKey.set(v.venue_key.toLowerCase(), id);
          venuesCreated++;
          venuesNext.push({ ...v, resultVenueId: id, result: "created" });
        }
      } catch (e) {
        // offer_summary column may not exist in older deployments — retry without it.
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes("offer_summary")) {
          try {
            const { offer_summary: _omit, ...slim } = patch;
            void _omit;
            if (existingId) {
              const { error } = await supabase
                .from("venues")
                .update(slim)
                .eq("id", existingId)
                .eq("event_id", eventId)
                .eq("agency_id", agencyId);
              if (error) throw error;
              venueIdByKey.set(v.venue_key.toLowerCase(), existingId);
              venuesUpdated++;
              venuesNext.push({
                ...v,
                matchedVenueId: existingId,
                resultVenueId: existingId,
                result: "updated",
                resultMessage: "offer_summary not supported in this environment — skipped that field.",
              });
              continue;
            } else {
              const { data, error } = await supabase
                .from("venues")
                .insert({ agency_id: agencyId, event_id: eventId, ...slim })
                .select("id")
                .single();
              if (error) throw error;
              const id = (data?.id as string) ?? null;
              if (id) venueIdByKey.set(v.venue_key.toLowerCase(), id);
              venuesCreated++;
              venuesNext.push({
                ...v,
                resultVenueId: id,
                result: "created",
                resultMessage: "offer_summary not supported in this environment — skipped that field.",
              });
              continue;
            }
          } catch (e2) {
            venuesNext.push({
              ...v,
              result: "error",
              resultMessage: e2 instanceof Error ? e2.message : String(e2),
            });
            continue;
          }
        }
        venuesNext.push({ ...v, result: "error", resultMessage: msg });
      }
    }

    // ---- Venue check-in values (writes to venue_qr_codes.entry_value for
    // the venue's active QR row — mirrors the manual admin "Stamp value"
    // editor). Only runs when the spreadsheet supplied a value.
    for (let idx = 0; idx < venuesNext.length; idx++) {
      const v = venuesNext[idx];
      if (v.check_in_value == null) continue;
      if (v.result !== "created" && v.result !== "updated") continue;
      const venueId =
        v.resultVenueId ?? venueIdByKey.get(v.venue_key.toLowerCase()) ?? null;
      if (!venueId) continue;
      const { data: qrRow, error: qrLookupErr } = await supabase
        .from("venue_qr_codes")
        .select("id")
        .eq("venue_id", venueId)
        .eq("event_id", eventId)
        .eq("agency_id", agencyId)
        .eq("status", "active")
        .maybeSingle();
      if (qrLookupErr || !qrRow) {
        const note =
          "Venue imported, but no active venue QR exists yet. Generate a QR for this venue, then re-import or edit the stamp value manually.";
        venuesNext[idx] = {
          ...v,
          resultMessage: v.resultMessage ? `${v.resultMessage} ${note}` : note,
        };
        continue;
      }
      const { error: qrUpdateErr } = await supabase
        .from("venue_qr_codes")
        .update({ entry_value: v.check_in_value })
        .eq("id", (qrRow as { id: string }).id);
      if (qrUpdateErr) {
        const note = `check_in_value not saved: ${qrUpdateErr.message ?? "unknown error"}`;
        venuesNext[idx] = {
          ...v,
          resultMessage: v.resultMessage ? `${v.resultMessage} ${note}` : note,
        };
      }
    }

    // ---- Bonus Codes
    const bonusesNext: BonusDraft[] = [];
    for (const b of drafts.bonuses) {
      if (b.issues.some((i) => i.level === "error")) {
        skipped++;
        bonusesNext.push({ ...b, result: "skipped", resultMessage: "Validation errors" });
        continue;
      }
      const existingId = existingBonusByName.get(b.title.trim().toLowerCase()) ?? null;
      try {
        if (existingId) {
          const { error } = await supabase
            .from("event_bonus_codes")
            .update({
              name: b.title,
              description: b.description,
              points_value: b.points,
              is_active: b.status === "active",
            })
            .eq("id", existingId)
            .eq("agency_id", agencyId)
            .eq("event_id", eventId);
          if (error) throw error;
          bonusesUpdated++;
          bonusesNext.push({ ...b, matchedId: existingId, result: "updated" });
        } else {
          const { error } = await supabase.from("event_bonus_codes").insert({
            agency_id: agencyId,
            event_id: eventId,
            name: b.title,
            description: b.description,
            points_value: b.points,
            is_active: b.status === "active",
            qr_code_token: crypto.randomUUID(),
          });
          if (error) throw error;
          // Track for downstream dedupe in this batch
          existingBonusByName.set(b.title.trim().toLowerCase(), "new");
          bonusesCreated++;
          bonusesNext.push({ ...b, result: "created" });
        }
      } catch (e) {
        bonusesNext.push({
          ...b,
          result: "error",
          resultMessage: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // ---- Tasting QR Codes
    // Fetch existing tasting rows for each resolved venue once.
    const tastingExistingByVenue = new Map<string, Map<string, string>>();
    const resolvedVenueIds = Array.from(new Set(venueIdByKey.values()));
    for (const venueId of resolvedVenueIds) {
      const { data, error } = await supabase.rpc("get_venue_tasting_qr_codes", {
        _event_id: eventId,
        _venue_id: venueId,
      });
      if (!error && Array.isArray(data)) {
        const m = new Map<string, string>();
        for (const row of data as Array<{ id: string; label: string }>) {
          m.set(row.label.trim().toLowerCase(), row.id);
        }
        tastingExistingByVenue.set(venueId, m);
      }
    }

    const tastingsNext: TastingDraft[] = [];
    for (const t of drafts.tastings) {
      if (t.issues.some((i) => i.level === "error")) {
        skipped++;
        tastingsNext.push({ ...t, result: "skipped", resultMessage: "Validation errors" });
        continue;
      }
      const venueId = venueIdByKey.get(t.venue_key.toLowerCase());
      if (!venueId) {
        skipped++;
        tastingsNext.push({
          ...t,
          result: "skipped",
          resultMessage: "Venue not imported (skipped or failed).",
        });
        continue;
      }
      const existingId =
        tastingExistingByVenue.get(venueId)?.get(t.qr_name.trim().toLowerCase()) ?? null;
      try {
        const { error } = await supabase.rpc("save_venue_tasting_qr_code", {
          _id: existingId,
          _event_id: eventId,
          _venue_id: venueId,
          _label: t.qr_name,
          _description: t.description,
          _points: t.points,
          _status: t.status,
          _scan_limit_per_passport: null,
          _starts_at: null,
          _ends_at: null,
        });
        if (error) throw error;
        if (existingId) {
          tastingsUpdated++;
          tastingsNext.push({ ...t, result: "updated" });
        } else {
          tastingsCreated++;
          tastingsNext.push({ ...t, result: "created" });
        }
      } catch (e) {
        tastingsNext.push({
          ...t,
          result: "error",
          resultMessage: e instanceof Error ? e.message : String(e),
        });
      }
    }

    setDrafts({ venues: venuesNext, bonuses: bonusesNext, tastings: tastingsNext });
    setImporting(false);
    setImportDone(true);
    toast.success(
      `Import complete: ${venuesCreated + venuesUpdated} venues, ${bonusesCreated + bonusesUpdated} bonus codes, ${tastingsCreated + tastingsUpdated} tasting QR codes.`,
    );
    onImported();

    // Stash counts for the summary view
    setSummary({
      venuesCreated,
      venuesUpdated,
      bonusesCreated,
      bonusesUpdated,
      tastingsCreated,
      tastingsUpdated,
      skipped,
    });
  }

  type Summary = {
    venuesCreated: number;
    venuesUpdated: number;
    bonusesCreated: number;
    bonusesUpdated: number;
    tastingsCreated: number;
    tastingsUpdated: number;
    skipped: number;
  };
  const [summary, setSummary] = useState<Summary | null>(null);

  const errorRows = useMemo(() => {
    if (!drafts) return [] as Array<{ sheet: string; row: number; label: string; message: string }>;
    const out: Array<{ sheet: string; row: number; label: string; message: string }> = [];
    for (const v of drafts.venues) {
      if (v.result === "error") out.push({ sheet: "Venues", row: v.rowNum, label: v.name || v.venue_key, message: v.resultMessage ?? "" });
    }
    for (const b of drafts.bonuses) {
      if (b.result === "error") out.push({ sheet: "Bonus Codes", row: b.rowNum, label: b.title || b.code, message: b.resultMessage ?? "" });
    }
    for (const t of drafts.tastings) {
      if (t.result === "error") out.push({ sheet: "Tasting QR Codes", row: t.rowNum, label: t.qr_name || t.venue_key, message: t.resultMessage ?? "" });
    }
    return out;
  }, [drafts]);

  function copyErrors() {
    if (errorRows.length === 0) return;
    const text = errorRows.map((r) => `${r.sheet} row ${r.row} (${r.label}): ${r.message}`).join("\n");
    navigator.clipboard.writeText(text).then(
      () => toast.success("Failed rows copied to clipboard."),
      () => toast.error("Could not copy to clipboard."),
    );
  }

  if (!canEdit) {
    return (
      <p className="text-sm text-muted-foreground">
        You don&apos;t have permission to bulk import for this event.
      </p>
    );
  }

  const hasErrors = (totals?.errors ?? 0) > 0;
  const canConfirm = !!drafts && !hasErrors && missingSheets.length === 0 && !importing && !importDone;

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#475569]">
        Upload an Excel file to create or update venues, bonus codes, and tasting QR
        codes for this event. Bulk import adds or updates records — it never
        deletes existing venues, bonus codes, or tasting QR codes.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex h-9 items-center rounded-lg border bg-white px-3 text-sm font-medium hover:bg-muted"
        >
          Download Excel template
        </button>

        <label className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
          Upload completed template
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>

        {fileName && (
          <>
            <span className="text-xs text-[#475569]">
              {fileName}
              {drafts && totals && (
                <>
                  {" "}— {totals.venues} venues, {totals.bonuses} bonus codes,{" "}
                  {totals.tastings} tasting QR codes
                  {totals.errors > 0 && <> · <span className="text-[#B91C1C]">{totals.errors} error(s)</span></>}
                  {totals.warnings > 0 && <> · <span className="text-[#92400E]">{totals.warnings} warning(s)</span></>}
                </>
              )}
            </span>
            <button
              type="button"
              onClick={clearFile}
              className="inline-flex h-8 items-center rounded-md border bg-white px-2 text-xs font-medium hover:bg-muted"
            >
              Clear file
            </button>
          </>
        )}
      </div>

      {parseError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {parseError}
        </div>
      )}

      {drafts && !importDone && (
        <div className="space-y-5">
          <PreviewBlock title="Venues">
            {drafts.venues.length === 0 ? (
              <p className="text-xs text-muted-foreground">No venue rows.</p>
            ) : (
              <PreviewTable
                rows={drafts.venues.map((v) => {
                  const action = existingVenueByName.has(v.name.trim().toLowerCase())
                    ? "Will UPDATE an existing venue with the same name."
                    : "Will CREATE a new venue.";
                  const civ =
                    v.check_in_value != null
                      ? ` Check-in value: ${v.check_in_value} stamp${v.check_in_value === 1 ? "" : "s"} per QR scan.`
                      : " Check-in value: leave unchanged.";
                  return {
                    rowNum: v.rowNum,
                    label: v.name || v.venue_key,
                    status: v.status,
                    issues: v.issues,
                    extra: action + civ,
                    result: v.result,
                    resultMessage: v.resultMessage,
                  };
                })}
              />
            )}
          </PreviewBlock>

          <PreviewBlock title="Bonus Codes">
            {drafts.bonuses.length === 0 ? (
              <p className="text-xs text-muted-foreground">No bonus code rows.</p>
            ) : (
              <PreviewTable
                rows={drafts.bonuses.map((b) => ({
                  rowNum: b.rowNum,
                  label: b.title || b.code,
                  status: b.status,
                  issues: b.issues,
                  extra:
                    (existingBonusByName.has(b.title.trim().toLowerCase())
                      ? "Will UPDATE an existing bonus code with the same title."
                      : "Will CREATE a new bonus code.") +
                    ` Bonus points: ${b.points}.`,
                  result: b.result,
                  resultMessage: b.resultMessage,
                }))}
              />
            )}
          </PreviewBlock>

          <PreviewBlock title="Tasting QR Codes">
            {drafts.tastings.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tasting QR rows.</p>
            ) : (
              <PreviewTable
                rows={drafts.tastings.map((t) => ({
                  rowNum: t.rowNum,
                  label: `${t.qr_name || "—"} (${t.venue_key})`,
                  status: t.status,
                  issues: t.issues,
                  extra: `Tasting points: ${t.points}.`,
                  result: t.result,
                  resultMessage: t.resultMessage,
                }))}
              />
            )}
          </PreviewBlock>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <button
              type="button"
              onClick={confirmImport}
              disabled={!canConfirm}
              className="inline-flex h-10 items-center rounded-[10px] bg-[#2F6FE4] px-4 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(47,111,228,0.22)] hover:bg-[#1F56C5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? "Importing…" : "Confirm import"}
            </button>
            {hasErrors && (
              <span className="text-xs text-[#B91C1C]">
                Fix all errors in the file and re-upload before importing.
              </span>
            )}
          </div>
        </div>
      )}

      {importDone && summary && (
        <div className="space-y-4 rounded-[12px] border border-[#86EFAC] bg-[#ECFDF5] p-4">
          <h4 className="text-sm font-semibold text-[#047857]">Import complete</h4>
          <ul className="grid gap-1 text-sm text-[#065F46] sm:grid-cols-2">
            <li>Venues created: <strong>{summary.venuesCreated}</strong></li>
            <li>Venues updated: <strong>{summary.venuesUpdated}</strong></li>
            <li>Bonus Codes created: <strong>{summary.bonusesCreated}</strong></li>
            <li>Bonus Codes updated: <strong>{summary.bonusesUpdated}</strong></li>
            <li>Tasting QR Codes created: <strong>{summary.tastingsCreated}</strong></li>
            <li>Tasting QR Codes updated: <strong>{summary.tastingsUpdated}</strong></li>
            <li>Rows skipped: <strong>{summary.skipped}</strong></li>
            <li>Row errors: <strong>{errorRows.length}</strong></li>
          </ul>

          {errorRows.length > 0 && (
            <div className="space-y-2 rounded-md border border-[#FCA5A5] bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#B91C1C]">
                  Rows that failed during save
                </span>
                <button
                  type="button"
                  onClick={copyErrors}
                  className="inline-flex h-7 items-center rounded-md border bg-white px-2 text-xs font-medium hover:bg-muted"
                >
                  Copy failed rows
                </button>
              </div>
              <ul className="space-y-1 text-xs text-[#B91C1C]">
                {errorRows.map((r, i) => (
                  <li key={i}>
                    {r.sheet} row {r.row} ({r.label}): {r.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="#tab=venues"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.hash = "tab=venues";
                }
              }}
              className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-xs font-medium hover:bg-muted"
            >
              View Venues
            </a>
            <a
              href="#tab=bonuscodes"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.hash = "tab=bonuscodes";
                }
              }}
              className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-xs font-medium hover:bg-muted"
            >
              View Bonus Codes
            </a>
            <a
              href="#tab=venues"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.hash = "tab=venues";
                }
              }}
              className="inline-flex h-9 items-center rounded-md border bg-white px-3 text-xs font-medium hover:bg-muted"
            >
              View Tasting QR Codes
            </a>
            <button
              type="button"
              onClick={clearFile}
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Upload another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-[#D9E2EF] bg-white p-4">
      <h5 className="mb-3 text-sm font-semibold text-[#111827]">{title}</h5>
      {children}
    </div>
  );
}

type PreviewRow = {
  rowNum: number;
  label: string;
  status: string;
  issues: RowIssue[];
  extra?: string;
  result?: string;
  resultMessage?: string;
};

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-[#E6ECF4]">
      <table className="w-full text-xs">
        <thead className="bg-[#F8FAFC] text-left uppercase tracking-wider text-[#64748B]">
          <tr>
            <th className="px-2 py-1.5 font-medium">Row</th>
            <th className="px-2 py-1.5 font-medium">Name / Code / Label</th>
            <th className="px-2 py-1.5 font-medium">Status</th>
            <th className="px-2 py-1.5 font-medium">State</th>
            <th className="px-2 py-1.5 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rowNum} className="border-t border-[#E6ECF4] align-top">
              <td className="px-2 py-1.5 text-muted-foreground">{r.rowNum}</td>
              <td className="px-2 py-1.5 font-medium text-[#111827]">{r.label}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{r.status}</td>
              <td className="px-2 py-1.5">
                <StatusBadge row={r} />
              </td>
              <td className="px-2 py-1.5">
                <IssueList
                  issues={r.issues}
                  extra={r.resultMessage ?? r.extra}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
