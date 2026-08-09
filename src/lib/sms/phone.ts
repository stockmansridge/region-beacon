// Client-safe AU mobile normalisation. Mirrors sms_normalise_au_mobile() in
// SQL and is used by the public join form so the participant sees the same
// verdict the database will reach.

/** Returns canonical E.164, or null when the number is not usable for SMS. */
export function normaliseAuMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) {
    return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
  }
  if (digits.startsWith("614") && digits.length === 11) return `+${digits}`;
  if (digits.startsWith("04") && digits.length === 10) return `+61${digits.slice(1)}`;
  if (digits.startsWith("4") && digits.length === 9) return `+61${digits}`;
  return null;
}

export function isSmsCapableMobile(raw: string | null | undefined): boolean {
  return normaliseAuMobile(raw) !== null;
}
