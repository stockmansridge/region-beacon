/**
 * Thin top-of-page strip used on customer-onboarding surfaces during the
 * staging-backed public test window. Intentionally NOT rendered on public
 * event pages (visitors shouldn't see "test environment").
 */
export function TestEnvBanner({ note }: { note?: string }) {
  return (
    <div className="flex h-7 items-center justify-center border-b border-[#FED7AA] bg-[#FFF7ED] px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9A3412]">
      <span>Test environment · Public testing · Payments not active yet</span>
      {note ? <span className="ml-2 normal-case tracking-normal">— {note}</span> : null}
    </div>
  );
}
