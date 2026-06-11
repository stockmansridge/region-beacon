import { useLocation } from "@tanstack/react-router";

// Bump BUILD_MARKER on every meaningful audit/deploy so we can verify which
// build is live in each environment (preview vs production vs custom domain).
export const BUILD_MARKER = "2026-06-11T13:00Z · live-path-audit-2";

export function BuildMarker({ visible }: { visible: boolean }) {
  const location = useLocation();
  if (!visible) return null;
  const supaUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  const ref = supaUrl.match(/https?:\/\/([^.]+)\./)?.[1] ?? "(no VITE_SUPABASE_URL)";
  return (
    <div className="mb-3 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-[11px] font-mono leading-snug text-amber-900">
      <div><b>BUILD_MARKER:</b> {BUILD_MARKER}</div>
      <div><b>SUPABASE_REF:</b> {ref}</div>
      <div><b>ROUTE:</b> {location.pathname}</div>
      <div><b>BUNDLE:</b> see DevTools → Network → first JS asset under /assets/</div>
    </div>
  );
}
