import { Check, Stamp as StampIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { PassportStampVenue } from "@/lib/passport-stamps";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";

/**
 * Mobile-app style passport stamp grid. Renders one tile per participating
 * venue: visited venues show a "stamped" treatment (accent ring + check),
 * unvisited tiles show a muted placeholder. Driven entirely by
 * loadPassportStampState — no synthetic stamps.
 */
export function PassportStampGrid({
  venues,
  hasPassport,
  venueLabelPlural,
  startHref,
}: {
  venues: PassportStampVenue[];
  hasPassport: boolean;
  venueLabelPlural: string;
  startHref: string;
}) {
  if (!hasPassport && venues.length === 0) return null;

  const display = venues.length > 0 ? venues : placeholderTiles(8);

  return (
    <section className="px-4">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--event-page-muted,var(--event-muted,#8A7E66))]">
            Your passport
          </p>
          <h2
            className="mt-0.5 text-lg font-semibold text-[var(--event-page-fg,var(--event-text,#1F3D2B))]"
            style={{ fontFamily: "var(--event-font)" }}
          >
            Stamp collection
          </h2>
        </div>
        {!hasPassport && (
          <Link
            to={startHref as "/join"}
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{
              backgroundColor: "var(--event-primary,#1F3D2B)",
              color: "var(--event-primary-fg,#F6EFE2)",
            }}
          >
            Start
          </Link>
        )}
      </div>

      <ul className="grid grid-cols-4 gap-3 sm:grid-cols-5">
        {display.map((v, i) => (
          <li key={v.venue_id ?? `placeholder-${i}`}>
            <StampTile venue={v} dimmed={!hasPassport} venueLabel={venueLabelPlural} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StampTile({
  venue,
  dimmed,
  venueLabel,
}: {
  venue: PassportStampVenue;
  dimmed: boolean;
  venueLabel: string;
}) {
  void venueLabel;
  const stamped = venue.is_stamped;
  const logoUrl = getVenueAssetPublicUrl(venue.venue_logo_path);
  const name = venue.venue_name ?? "Venue";
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        aria-label={stamped ? `${name} — stamped` : `${name} — not yet stamped`}
        className={[
          "relative grid aspect-square w-full place-items-center rounded-2xl border-2 transition",
          stamped
            ? "border-[var(--event-accent,#B5572A)] bg-[var(--event-card-bg,#FBF5E8)] shadow-sm"
            : "border-dashed border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)]/60",
          dimmed ? "opacity-60" : "",
        ].join(" ")}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className={[
              "h-3/4 w-3/4 rounded-xl object-contain",
              stamped ? "" : "grayscale opacity-50",
            ].join(" ")}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span
            className={[
              "text-base font-semibold tracking-wider",
              stamped
                ? "text-[var(--event-primary,#1F3D2B)]"
                : "text-[var(--event-page-muted,var(--event-muted,#8A7E66))]",
            ].join(" ")}
          >
            {initials || "—"}
          </span>
        )}
        {stamped ? (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full shadow"
            style={{
              backgroundColor: "var(--event-accent,#B5572A)",
              color: "var(--event-primary-fg,#F6EFE2)",
            }}
          >
            <Check className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-[var(--event-card-bg,#FBF5E8)] text-[var(--event-page-muted,var(--event-muted,#8A7E66))] ring-1 ring-[var(--event-border,#E6DCC7)]"
          >
            <StampIcon className="h-3 w-3" />
          </span>
        )}
      </div>
      <span
        title={name}
        className="line-clamp-1 w-full text-center text-[10px] font-medium text-[var(--event-page-fg,var(--event-text,#1F3D2B))]"
      >
        {name}
      </span>
    </div>
  );
}

function placeholderTiles(n: number): PassportStampVenue[] {
  return Array.from({ length: n }, (_, i) => ({
    passport_id: null,
    event_id: null,
    event_name: null,
    venue_label_singular: null,
    venue_label_plural: null,
    total_venues: null,
    stamped_count: null,
    venue_id: `placeholder-${i}`,
    venue_name: "—",
    venue_logo_path: null,
    venue_cover_path: null,
    order_index: i,
    is_stamped: false,
    checked_in_at: null,
  }));
}
