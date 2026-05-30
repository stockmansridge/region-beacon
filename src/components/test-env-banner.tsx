/**
 * Thin top-of-page strip used on customer-onboarding surfaces during the
 * staging-backed public test window. Intentionally NOT rendered on public
 * event pages (visitors shouldn't see "test environment").
 */
export function TestEnvBanner({ note }: { note?: string }) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-[11px] font-medium uppercase tracking-wider text-amber-900">
      Test environment · Public testing · Payments not active yet
      {note ? <span className="ml-2 normal-case tracking-normal">— {note}</span> : null}
    </div>
  );
}
