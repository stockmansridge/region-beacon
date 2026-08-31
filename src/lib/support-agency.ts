import { useEffect, useState } from "react";

/**
 * Platform-admin support session.
 *
 * When a platform admin opens another organisation's event from System Admin,
 * we record that organisation here so the normal admin screens resolve their
 * agency context to it. This is support tooling only — nothing about it is
 * visible on any customer-facing surface, and the database still enforces
 * access through the platform_admin RLS policies.
 */
export type SupportAgency = {
  id: string;
  name: string;
  slug: string | null;
};

const STORAGE_KEY = "getstampd.support.agency";
const CHANGE_EVENT = "getstampd:support-agency-changed";

export function readSupportAgency(): SupportAgency | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SupportAgency> | null;
    if (!parsed || typeof parsed.id !== "string" || parsed.id.length === 0) return null;
    return {
      id: parsed.id,
      name: typeof parsed.name === "string" && parsed.name ? parsed.name : "Organisation",
      slug: typeof parsed.slug === "string" ? parsed.slug : null,
    };
  } catch {
    return null;
  }
}

export function setSupportAgency(next: SupportAgency | null): void {
  if (typeof window === "undefined") return;
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage failures (private mode, quota)
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearSupportAgency(): void {
  setSupportAgency(null);
}

/** Reactive read of the current support session. */
export function useSupportAgency(): SupportAgency | null {
  const [value, setValue] = useState<SupportAgency | null>(null);

  useEffect(() => {
    const sync = () => setValue(readSupportAgency());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return value;
}
