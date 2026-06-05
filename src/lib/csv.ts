// Lightweight CSV utility for admin exports.
// - Escapes commas, quotes, and newlines per RFC 4180.
// - Treats null/undefined as empty cells.
// - Emits a UTF-8 file using CRLF line endings for spreadsheet compatibility.

export type CsvHeader<T> = { label: string; key: keyof T & string };

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  headers: Array<CsvHeader<T>>,
): string {
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  lines.push(headers.map((h) => esc(h.label)).join(","));
  for (const r of rows) {
    lines.push(headers.map((h) => esc(r[h.key])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, csv: string) {
  // BOM helps Excel detect UTF-8 cleanly.
  const blob = new Blob(["\uFEFF", csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function sanitiseCsvFilename(name: string): string {
  const cleaned = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || "event";
}

export function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
