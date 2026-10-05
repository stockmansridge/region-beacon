export type FaqCsvRow = { question: string; answer: string };

function escapeCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function faqToCsv(rows: FaqCsvRow[]): string {
  const lines = [
    "question,answer",
    ...rows.map((r) => `${escapeCell(r.question)},${escapeCell(r.answer)}`),
  ];
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export function parseFaqCsv(text: string): { rows: FaqCsvRow[]; error: string | null } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], error: "The file is empty." };
  const header = table[0].map((h) => h.trim().toLowerCase());
  let qi = header.findIndex((h) => h === "question" || h === "question / heading");
  let ai = header.findIndex((h) => h === "answer" || h === "answer / information");
  let body = table.slice(1);
  if (qi < 0 || ai < 0) {
    // No header row: treat first two columns as question, answer.
    qi = 0;
    ai = 1;
    body = table;
  }
  const rows = body
    .map((r) => ({ question: (r[qi] ?? "").trim(), answer: (r[ai] ?? "").trim() }))
    .filter((r) => r.question || r.answer);
  if (rows.length === 0) return { rows, error: "No questions found in the file." };
  return { rows, error: null };
}
