// Curated list of fonts available for event branding.
//
// Each entry's `value` is what gets persisted into `event_branding.font_family`
// or `event_branding.heading_font_family` (plain CSS family strings). The
// `stack` includes safe fallbacks so the public page still renders if the
// Google Font fails to load. `googleFamily` is the Google Fonts CSS2 family
// spec (with weights). Fonts that are system-only have `googleFamily: null`.
//
// The same list powers both the heading and body dropdowns. Heading-friendly
// (display/serif) options are grouped under "Display" / "Serif"; body-friendly
// options under "Sans" / "Serif".

export type EventFontOption = {
  value: string; // primary family name persisted to DB
  label: string; // friendly UI label
  stack: string; // full CSS font-family stack (with fallbacks)
  googleFamily: string | null; // Google Fonts CSS2 family spec
  category: "Sans" | "Serif" | "Display" | "Script";
};

export const EVENT_FONTS: EventFontOption[] = [
  // ---------- Sans ----------
  {
    value: "Inter",
    label: "Inter",
    stack: "'Inter', ui-sans-serif, system-ui, sans-serif",
    googleFamily: "Inter:wght@400;500;600;700",
    category: "Sans",
  },
  {
    value: "Plus Jakarta Sans",
    label: "Plus Jakarta Sans",
    stack: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
    googleFamily: "Plus+Jakarta+Sans:wght@400;500;600;700",
    category: "Sans",
  },
  {
    value: "DM Sans",
    label: "DM Sans",
    stack: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
    googleFamily: "DM+Sans:wght@400;500;600;700",
    category: "Sans",
  },
  {
    value: "Montserrat",
    label: "Montserrat",
    stack: "'Montserrat', ui-sans-serif, system-ui, sans-serif",
    googleFamily: "Montserrat:wght@400;500;600;700",
    category: "Sans",
  },
  {
    value: "Poppins",
    label: "Poppins",
    stack: "'Poppins', ui-sans-serif, system-ui, sans-serif",
    googleFamily: "Poppins:wght@400;500;600;700",
    category: "Sans",
  },
  {
    value: "Source Sans 3",
    label: "Source Sans 3",
    stack: "'Source Sans 3', ui-sans-serif, system-ui, sans-serif",
    googleFamily: "Source+Sans+3:wght@400;500;600;700",
    category: "Sans",
  },
  {
    value: "Work Sans",
    label: "Work Sans",
    stack: "'Work Sans', ui-sans-serif, system-ui, sans-serif",
    googleFamily: "Work+Sans:wght@400;500;600;700",
    category: "Sans",
  },
  {
    value: "Manrope",
    label: "Manrope",
    stack: "'Manrope', ui-sans-serif, system-ui, sans-serif",
    googleFamily: "Manrope:wght@400;500;600;700",
    category: "Sans",
  },
  {
    value: "Nunito",
    label: "Nunito (rounded)",
    stack: "'Nunito', ui-sans-serif, system-ui, sans-serif",
    googleFamily: "Nunito:wght@400;500;600;700",
    category: "Sans",
  },
  {
    value: "Quicksand",
    label: "Quicksand (rounded)",
    stack: "'Quicksand', ui-sans-serif, system-ui, sans-serif",
    googleFamily: "Quicksand:wght@400;500;600;700",
    category: "Sans",
  },
  // ---------- Serif ----------
  {
    value: "Fraunces",
    label: "Fraunces",
    stack: "'Fraunces', Georgia, ui-serif, serif",
    googleFamily: "Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700",
    category: "Serif",
  },
  {
    value: "Playfair Display",
    label: "Playfair Display",
    stack: "'Playfair Display', Georgia, ui-serif, serif",
    googleFamily: "Playfair+Display:wght@400;500;600;700",
    category: "Serif",
  },
  {
    value: "Lora",
    label: "Lora",
    stack: "'Lora', Georgia, ui-serif, serif",
    googleFamily: "Lora:wght@400;500;600;700",
    category: "Serif",
  },
  {
    value: "Cormorant Garamond",
    label: "Cormorant Garamond (elegant)",
    stack: "'Cormorant Garamond', Georgia, ui-serif, serif",
    googleFamily: "Cormorant+Garamond:wght@400;500;600;700",
    category: "Serif",
  },
  {
    value: "EB Garamond",
    label: "EB Garamond (classic)",
    stack: "'EB Garamond', Georgia, ui-serif, serif",
    googleFamily: "EB+Garamond:wght@400;500;600;700",
    category: "Serif",
  },
  {
    value: "Merriweather",
    label: "Merriweather",
    stack: "'Merriweather', Georgia, ui-serif, serif",
    googleFamily: "Merriweather:wght@400;700",
    category: "Serif",
  },
  // ---------- Display / luxury ----------
  {
    value: "DM Serif Display",
    label: "DM Serif Display (luxury)",
    stack: "'DM Serif Display', Georgia, ui-serif, serif",
    googleFamily: "DM+Serif+Display:wght@400",
    category: "Display",
  },
  {
    value: "Italiana",
    label: "Italiana (premium)",
    stack: "'Italiana', Georgia, ui-serif, serif",
    googleFamily: "Italiana:wght@400",
    category: "Display",
  },
  {
    value: "Marcellus",
    label: "Marcellus (gallery)",
    stack: "'Marcellus', Georgia, ui-serif, serif",
    googleFamily: "Marcellus:wght@400",
    category: "Display",
  },
  // ---------- Script / handwritten (emotive) ----------
  {
    value: "Caveat",
    label: "Caveat (handwritten)",
    stack: "'Caveat', 'Segoe Script', cursive",
    googleFamily: "Caveat:wght@400;500;600;700",
    category: "Script",
  },
  {
    value: "Dancing Script",
    label: "Dancing Script (flowing)",
    stack: "'Dancing Script', 'Segoe Script', cursive",
    googleFamily: "Dancing+Script:wght@400;500;600;700",
    category: "Script",
  },
  {
    value: "Sacramento",
    label: "Sacramento (elegant)",
    stack: "'Sacramento', 'Segoe Script', cursive",
    googleFamily: "Sacramento:wght@400",
    category: "Script",
  },
  {
    value: "Great Vibes",
    label: "Great Vibes (romantic)",
    stack: "'Great Vibes', 'Segoe Script', cursive",
    googleFamily: "Great+Vibes:wght@400",
    category: "Script",
  },
  {
    value: "Kalam",
    label: "Kalam (casual)",
    stack: "'Kalam', 'Segoe Script', cursive",
    googleFamily: "Kalam:wght@400;700",
    category: "Script",
  },
  {
    value: "Homemade Apple",
    label: "Homemade Apple (personal)",
    stack: "'Homemade Apple', 'Segoe Script', cursive",
    googleFamily: "Homemade+Apple:wght@400",
    category: "Script",
  },
];

/** Platform default script font used when no event/venue override is set. */
export const DEFAULT_EMOTIVE_FONT_VALUE = "Caveat";


export const DEFAULT_EVENT_FONT_VALUE = ""; // "" = use GetStampd default

export function getEventFont(value: string | null | undefined): EventFontOption | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Match on value, or on the leading family name in a stored stack.
  const leadFamily = trimmed.split(",")[0].replace(/['"]/g, "").trim();
  return (
    EVENT_FONTS.find((f) => f.value.toLowerCase() === leadFamily.toLowerCase()) ?? null
  );
}

export function isSupportedEventFont(value: string | null | undefined): boolean {
  return getEventFont(value) !== null;
}

/**
 * Build a single Google Fonts CSS2 URL that loads every requested family
 * (de-duplicated). Returns null if no families need loading.
 */
export function buildGoogleFontsHref(values: Array<string | null | undefined>): string | null {
  const families = new Set<string>();
  for (const v of values) {
    const opt = getEventFont(v);
    if (opt && opt.googleFamily) families.add(opt.googleFamily);
  }
  if (families.size === 0) return null;
  const params = Array.from(families)
    .map((f) => `family=${f}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
