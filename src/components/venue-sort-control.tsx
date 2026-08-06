import { useId, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import {
  VENUE_SORT_OPTIONS,
  venueSortLabel,
  type VenueSortKey,
} from "@/lib/venue-sort";

/**
 * Compact, mobile-first sort control for the public venue list.
 *
 * Uses a native <select> so it is keyboard accessible, works as a bottom sheet
 * on iOS/Android for free, and needs no animation (so nothing to gate behind
 * prefers-reduced-motion). The active sort is announced via a polite live
 * region and shown as text — never colour alone.
 */
export function VenueSortControl({
  sort,
  onChange,
  count,
  countLabel,
  hasPassport,
  locationError,
  locating,
  className,
}: {
  sort: VenueSortKey;
  onChange: (next: VenueSortKey) => void;
  count: number;
  /** Plural venue label for this event, e.g. "Wineries". */
  countLabel: string;
  hasPassport: boolean;
  locationError: string | null;
  locating: boolean;
  className?: string;
}) {
  const selectId = useId();
  const [announce, setAnnounce] = useState<string>("");

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className="text-[12px] font-semibold"
          style={{ color: "var(--event-muted,#8A7E66)" }}
        >
          {count} {countLabel.toLowerCase()}
          <span aria-hidden> · </span>
          <span style={{ color: "var(--event-text,#3D372C)" }}>
            Sort: {venueSortLabel(sort)}
            {locating ? " (finding you…)" : ""}
          </span>
        </p>

        <label
          htmlFor={selectId}
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] font-semibold"
          style={{
            borderColor: "var(--event-border,#E6DCC7)",
            backgroundColor: "var(--event-card-bg,#FBF5E8)",
            color: "var(--event-text,#3D372C)",
          }}
        >
          <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">Sort {countLabel.toLowerCase()} by</span>
          <select
            id={selectId}
            value={sort}
            onChange={(e) => {
              const next = e.target.value as VenueSortKey;
              onChange(next);
              setAnnounce(`Sorted by ${venueSortLabel(next)}`);
            }}
            className="bg-transparent pr-1 text-[12px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--event-primary,#1F3D2B)]"
            style={{ color: "inherit" }}
          >
            {VENUE_SORT_OPTIONS.map((o) => (
              <option
                key={o.key}
                value={o.key}
                disabled={o.needsPassport && !hasPassport}
              >
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!hasPassport && (
        <p
          className="mt-1.5 text-[11px] leading-snug"
          style={{ color: "var(--event-muted,#8A7E66)" }}
        >
          Start or open your passport to sort by visit status.
        </p>
      )}

      {locationError && (
        <p
          role="alert"
          className="mt-1.5 text-[11px] leading-snug"
          style={{ color: "var(--event-text,#3D372C)" }}
        >
          {locationError}
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </div>
  );
}
