// SMS message segmentation — the single source of truth for how many SMS
// segments (and therefore credits) a message costs. Imported by BOTH the
// admin composer and the server sender so the two can never drift.

const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

// Characters that exist in GSM-7 but cost two characters (escape + char).
const GSM7_EXTENDED = "^{}\\[~]|€";

export type SmsEncoding = "GSM-7" | "UCS-2";

export type SmsSegmentInfo = {
  encoding: SmsEncoding;
  /** Billable characters (GSM-7 extended characters count as 2). */
  characters: number;
  /** Number of SMS segments (credits per recipient). */
  segments: number;
  /** Characters left before the next segment starts. */
  remainingInSegment: number;
  perSegment: number;
};

function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (!GSM7_BASIC.includes(ch) && !GSM7_EXTENDED.includes(ch)) return false;
  }
  return true;
}

/** Counts billable characters and segments for a message body. */
export function calculateSegments(rawText: string): SmsSegmentInfo {
  const text = rawText ?? "";
  if (text.length === 0) {
    return {
      encoding: "GSM-7",
      characters: 0,
      segments: 1,
      remainingInSegment: 160,
      perSegment: 160,
    };
  }

  if (isGsm7(text)) {
    let characters = 0;
    for (const ch of text) characters += GSM7_EXTENDED.includes(ch) ? 2 : 1;
    const single = 160;
    const concatenated = 153;
    if (characters <= single) {
      return {
        encoding: "GSM-7",
        characters,
        segments: 1,
        remainingInSegment: single - characters,
        perSegment: single,
      };
    }
    const segments = Math.ceil(characters / concatenated);
    return {
      encoding: "GSM-7",
      characters,
      segments,
      remainingInSegment: segments * concatenated - characters,
      perSegment: concatenated,
    };
  }

  // UCS-2: count UTF-16 code units so surrogate pairs (emoji) cost 2.
  const characters = text.length;
  const single = 70;
  const concatenated = 67;
  if (characters <= single) {
    return {
      encoding: "UCS-2",
      characters,
      segments: 1,
      remainingInSegment: single - characters,
      perSegment: single,
    };
  }
  const segments = Math.ceil(characters / concatenated);
  return {
    encoding: "UCS-2",
    characters,
    segments,
    remainingInSegment: segments * concatenated - characters,
    perSegment: concatenated,
  };
}

/** Merge fields supported in the composer, resolved per recipient at send time. */
export const SMS_MERGE_FIELDS = ["{first_name}", "{event_name}", "{link}"] as const;

export type SmsMergeValues = {
  first_name?: string | null;
  event_name?: string | null;
  link?: string | null;
};

/**
 * Replaces merge fields. Used for the composer preview AND the real send, so
 * the previewed length is the length actually billed.
 */
export function applyMergeFields(template: string, values: SmsMergeValues): string {
  return template
    .replace(/\{first_name\}/g, (values.first_name ?? "").trim() || "there")
    .replace(/\{event_name\}/g, (values.event_name ?? "").trim())
    .replace(/\{link\}/g, (values.link ?? "").trim());
}

/**
 * Worst-case segment count for a template: merge fields are replaced with the
 * longest realistic value so a send is never under-reserved.
 */
export function worstCaseSegments(
  template: string,
  values: SmsMergeValues & { longestFirstName?: number },
): SmsSegmentInfo {
  const padded = applyMergeFields(template, {
    first_name: "X".repeat(Math.max(values.longestFirstName ?? 12, 6)),
    event_name: values.event_name ?? "",
    link: values.link ?? "",
  });
  return calculateSegments(padded);
}
