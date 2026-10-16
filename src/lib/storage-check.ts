/** True when this browser can save and read back local data (false in some private modes / blocked cookies). */
export function canPersistLocally(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const k = "gs.__storage_check";
    window.localStorage.setItem(k, "1");
    const ok = window.localStorage.getItem(k) === "1";
    window.localStorage.removeItem(k);
    return ok;
  } catch {
    return false;
  }
}
