import { Check, Sparkles, Stamp as StampIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { PassportStampVenue } from "@/lib/passport-stamps";
import { getVenueAssetPublicUrl } from "@/lib/venue-assets";
import { usePassportHomeData } from "@/lib/use-passport-home-data";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mobile-app style passport stamp grid. Renders one tile per participating
 * venue. Visited tiles show a stamped treatment; unvisited tiles show a
 * muted placeholder. Driven entirely by the passport-stamps RPC — no
 * synthetic stamps.
 */
export function PassportStampGrid({
  eventId,
  venueLabelPlural = "venues",
  canRegister = true,
}: {
  eventId: string | null;
  venueLabelPlural?: string;
  canRegister?: boolean;
}) {
  const data = usePassportHomeData(eventId);
  const bonusVenueIds = useVenuesWithBonus(eventId);
  if (data.loading) return null;
  const { hasPassport, venues } = data;
  if (!hasPassport && venues.length === 0) return null;

  const display: PassportStampVenue[] =
    venues.length > 0 ? venues : placeholderTiles(8);

  return (
    <section className="px-4">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.28em]"
            style={{ color: "var(--event-page-muted)" }}
          >
            Your passport
          </p>
          <h2
            className="mt-0.5 text-lg font-semibold"
            style={{
              color: "var(--event-page-heading)",
              fontFamily: "var(--event-font)",
            }}
          >
            Stamp collection
          </h2>
        </div>
        {!hasPassport && canRegister && (
          <Link
            to="/join"
            className="rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{
              backgroundColor: "var(--event-button-primary-bg)",
              color: "var(--event-button-primary-fg)",
            }}
          >
            Start
          </Link>
        )}
      </div>

      <ul className="grid grid-cols-4 gap-3 sm:grid-cols-5">
        {display.map((v, i) => (
          <li key={v.venue_id ?? `placeholder-${i}`}>
            <StampTile
              venue={v}
              dimmed={!hasPassport}
              hasBonus={!!v.venue_id && bonusVenueIds.has(String(v.venue_id))}
            />
          </li>
        ))}
      </ul>

      {bonusVenueIds.size > 0 && (
        <div
          className="mt-3 flex items-center justify-center gap-2 text-[11px]"
          style={{ color: "var(--event-page-muted)" }}
        >
          <span
            aria-hidden
            className="grid h-5 w-5 place-items-center rounded-full shadow ring-2 ring-white"
            style={{
              backgroundColor: "var(--event-accent, #f59e0b)",
              color: "var(--event-button-primary-fg, #ffffff)",
            }}
          >
            <Sparkles className="h-2.5 w-2.5" />
          </span>
          <span>= Bonus Challenge available here</span>
        </div>
      )}

      <p className="sr-only">
        {data.visited} of {data.total} {venueLabelPlural.toLowerCase()} stamped.
      </p>
    </section>
  );
}

function StampTile({
  venue,
  dimmed,
  hasBonus,
}: {
  venue: PassportStampVenue;
  dimmed: boolean;
  hasBonus: boolean;
}) {
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
          "relative grid aspect-square w-full place-items-center overflow-hidden rounded-full border-2 transition",
          stamped ? "shadow-sm" : "border-dashed",
          dimmed ? "opacity-60" : "",
        ].join(" ")}
        style={{
          borderColor: stamped
            ? "var(--event-pin, var(--event-accent))"
            : "var(--event-card-border)",
          backgroundColor: stamped
            ? "var(--event-card-bg)"
            : "color-mix(in srgb, var(--event-card-bg) 60%, transparent)",
        }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt=""
            className={[
              "h-[78%] w-[78%] rounded-full object-contain",
              stamped ? "" : "opacity-50 grayscale",
            ].join(" ")}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span
            className="text-base font-semibold tracking-wider"
            style={{
              color: stamped
                ? "var(--event-visited, var(--event-primary))"
                : "var(--event-page-muted)",
            }}
          >
            {initials || "—"}
          </span>
        )}
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 grid h-6 w-6 place-items-center rounded-full shadow"
          style={
            stamped
              ? {
                  backgroundColor: "var(--event-pin, var(--event-accent))",
                  color:
                    "var(--event-button-primary-fg, var(--event-primary-fg))",
                }
              : {
                  backgroundColor: "var(--event-card-bg)",
                  color: "var(--event-page-muted)",
                  boxShadow:
                    "inset 0 0 0 1px var(--event-card-border)",
                }
          }
        >
          {stamped ? <Check className="h-3.5 w-3.5" /> : <StampIcon className="h-3 w-3" />}
        </span>
        {hasBonus && (
          <span
            aria-label="Bonus available"
            title="Bonus challenge available"
            className="absolute -left-0.5 -top-0.5 grid h-6 w-6 place-items-center rounded-full shadow ring-2 ring-white"
            style={{
              backgroundColor: "var(--event-accent, #f59e0b)",
              color: "var(--event-button-primary-fg, #ffffff)",
            }}
          >
            <Sparkles className="h-3 w-3" />
          </span>
        )}
      </div>
      <span
        title={name}
        className="line-clamp-1 w-full text-center text-[10px] font-medium"
        style={{ color: "var(--event-page-heading)" }}
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

/**
 * Fetches the set of venue_ids for the current event that have an
 * active bonus available (event-wide OR per-venue). Falls back to an
 * empty set on error so tiles simply render without the badge.
 */
export function useVenuesWithBonus(eventId: string | null): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!eventId || typeof window === "undefined") {
      setIds(new Set());
      return;
    }
    let cancelled = false;
    const host = window.location.hostname;
    (async () => {
      try {
        const { data } = await (supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: Array<{ venue_id: string }> | null }>)(
          "get_public_venues_with_bonus",
          { _hostname: host },
        );
        if (cancelled) return;
        const set = new Set<string>();
        for (const row of data ?? []) {
          if (row?.venue_id) set.add(String(row.venue_id));
        }
        setIds(set);
      } catch {
        if (!cancelled) setIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);
  return ids;
}

