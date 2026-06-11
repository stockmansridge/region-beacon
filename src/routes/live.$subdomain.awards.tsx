import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { tenantHost } from "@/lib/domains";
import { PoweredByGetStampd } from "@/components/brand";
import { PublicEventNav } from "@/components/public-event-nav";
import { EventPaletteScope } from "@/components/event-palette-scope";
import { useEventBrandingKeys } from "@/lib/use-event-palette";
import { useCurrentEventPassport } from "@/lib/use-current-event-passport";
import { listPublicAwards, type PublicEventAward } from "@/lib/event-awards";
import { getEventAssetPublicUrl } from "@/lib/event-assets";

export const Route = createFileRoute("/live/$subdomain/awards")({
  head: () => ({ meta: [{ title: "Awards" }] }),
  component: function AwardsRoute() {
    const { subdomain } = Route.useParams();
    return <AwardsPage subdomain={subdomain} />;
  },
});

type EventInfo = { event_id: string | null; event_name: string | null };

function useEventInfo(subdomain: string): EventInfo {
  const [info, setInfo] = useState<EventInfo>({ event_id: null, event_name: null });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const host = tenantHost(subdomain);
      const { data } = await supabase.rpc("get_public_event_by_domain", {
        _hostname: host,
      });
      if (cancelled) return;
      const row = (data?.[0] ?? null) as { event_id?: string; name?: string } | null;
      setInfo({ event_id: row?.event_id ?? null, event_name: row?.name ?? null });
    })();
    return () => {
      cancelled = true;
    };
  }, [subdomain]);
  return info;
}

export function AwardsPage({ subdomain }: { subdomain: string }) {
  const branding = useEventBrandingKeys(subdomain);
  const eventInfo = useEventInfo(subdomain);
  const passport = useCurrentEventPassport(eventInfo.event_id);
  const [awards, setAwards] = useState<PublicEventAward[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventInfo.event_id) return;
    let cancelled = false;
    (async () => {
      try {
        // Note: useCurrentEventPassport does not expose passport_id directly;
        // we re-derive it via the same RPC the hook uses if needed.
        let passportId: string | null = null;
        if (passport.passportHref) {
          // token sits in the href: /passport/<token>
          const token = passport.passportHref.split("/").pop() ?? null;
          if (token) {
            const { data } = await supabase.rpc("get_passport_by_token", {
              _raw_token: token,
            });
            const row = (data?.[0] ?? null) as { passport_id?: string } | null;
            passportId = row?.passport_id ?? null;
          }
        }
        const rows = await listPublicAwards(eventInfo.event_id!, passportId);
        if (!cancelled) setAwards(rows);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setAwards([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventInfo.event_id, passport.passportHref]);

  return (
    <EventPaletteScope
      paletteKey={branding.paletteKey}
      backgroundKey={branding.backgroundKey}
      primaryColor={branding.primaryColor}
      accentColor={branding.accentColor}
      pageBackgroundColor={branding.pageBackgroundColor}
      cardBackgroundColor={branding.cardBackgroundColor}
      className="min-h-screen px-4 py-4"
    >
      <div className="mx-auto max-w-5xl">
        <PublicEventNav
          subdomain={subdomain}
          eventName={eventInfo.event_name ?? "Event"}
          eventId={eventInfo.event_id}
          logoUrl={getEventAssetPublicUrl(branding.logoPath)}
          primaryColor={branding.primaryColor}
          accentColor={branding.accentColor}
        />
      </div>

      <div className="mx-auto mt-6 max-w-2xl">
        <Link
          to="/"
          className="inline-flex items-center text-xs font-medium uppercase tracking-[0.22em] text-[var(--event-primary,#1F3D2B)] underline-offset-4 hover:underline"
        >
          ← Back to event
        </Link>

        <div className="mt-4 rounded-3xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)] p-6 shadow-sm sm:p-10">
          {eventInfo.event_name && (
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--event-muted,#8A7E66)]">
              {eventInfo.event_name}
            </p>
          )}
          <h1 className="mt-1 font-trail-serif text-3xl font-semibold text-[var(--event-primary,#1F3D2B)]">
            Awards
          </h1>
          <p className="mt-2 text-sm text-[var(--event-body,#3D372C)]">
            Earn points and unlock prize draws as you visit locations.
          </p>

          <div className="mt-6 space-y-4">
            {awards == null && (
              <p className="text-sm text-[var(--event-muted,#8A7E66)]">Loading…</p>
            )}
            {error && (
              <p className="text-sm text-destructive">Could not load awards: {error}</p>
            )}
            {awards != null && awards.length === 0 && (
              <p className="text-sm text-[var(--event-muted,#8A7E66)]">
                No awards have been added yet.
              </p>
            )}
            {awards?.map((a) => (
              <AwardCard
                key={a.id}
                award={a}
                hasPassport={!!passport.passportHref}
              />
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>
      </div>
    </EventPaletteScope>
  );
}

function AwardCard({
  award,
  hasPassport,
}: {
  award: PublicEventAward;
  hasPassport: boolean;
}) {
  const status = deriveStatus(award, hasPassport);

  const entrantCopy =
    award.eligible_count === 0
      ? "No one is eligible yet"
      : `${award.eligible_count} ${award.eligible_count === 1 ? "person is" : "people are"} currently in this draw`;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--event-border,#E6DCC7)] bg-[var(--event-card-bg,#FBF5E8)]">
      {award.image_url && (
        <img
          src={award.image_url}
          alt=""
          className="h-40 w-full object-cover"
        />
      )}
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--event-primary,#1F3D2B)]">
            {award.title}
          </h2>
          <StatusBadge status={status} />
        </div>
        {award.description && (
          <p className="mt-1 text-sm text-[var(--event-body,#3D372C)]">
            {award.description}
          </p>
        )}
        <p className="mt-2 text-xs uppercase tracking-wide text-[var(--event-muted,#8A7E66)]">
          {award.points_required} {award.points_required === 1 ? "point" : "points"} required
          {award.requires_all_locations ? " · All locations" : ""}
        </p>
        <p className="mt-3 text-sm text-[var(--event-body,#3D372C)]">
          <StatusMessage award={award} status={status} hasPassport={hasPassport} />
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--event-primary,#1F3D2B)]">
          <Trophy className="h-3.5 w-3.5" /> {entrantCopy}
        </p>
      </div>
    </div>
  );
}

type CardStatus = "eligible" | "need_points" | "need_all" | "need_points_and_all" | "anonymous";

function deriveStatus(award: PublicEventAward, hasPassport: boolean): CardStatus {
  if (!hasPassport) return "anonymous";
  if (award.is_eligible) return "eligible";
  const needsPoints = award.points_remaining > 0;
  const needsAll = award.needs_all_locations;
  if (needsPoints && needsAll) return "need_points_and_all";
  if (needsAll) return "need_all";
  return "need_points";
}

function StatusBadge({ status }: { status: CardStatus }) {
  const map: Record<CardStatus, { label: string; cls: string }> = {
    eligible: {
      label: "You're eligible",
      cls: "bg-emerald-100 text-emerald-900 border-emerald-300",
    },
    need_points: {
      label: "Keep collecting",
      cls: "bg-amber-100 text-amber-900 border-amber-300",
    },
    need_all: {
      label: "Visit all locations",
      cls: "bg-sky-100 text-sky-900 border-sky-300",
    },
    need_points_and_all: {
      label: "Keep collecting",
      cls: "bg-amber-100 text-amber-900 border-amber-300",
    },
    anonymous: {
      label: "Start a passport",
      cls: "bg-slate-100 text-slate-700 border-slate-300",
    },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={
        "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide " +
        cls
      }
    >
      {label}
    </span>
  );
}

function StatusMessage({
  award,
  status,
  hasPassport,
}: {
  award: PublicEventAward;
  status: CardStatus;
  hasPassport: boolean;
}) {
  if (!hasPassport) {
    return <>Start a passport and visit locations to enter this draw.</>;
  }
  if (status === "eligible") return <>You're in this draw.</>;
  if (status === "need_points") {
    return (
      <>
        You need {award.points_remaining} more{" "}
        {award.points_remaining === 1 ? "point" : "points"} to enter this draw.
      </>
    );
  }
  if (status === "need_all") {
    return (
      <>
        You have enough points, but still need to visit every location to enter this draw.
      </>
    );
  }
  return (
    <>
      You need {award.points_remaining} more{" "}
      {award.points_remaining === 1 ? "point" : "points"} and must visit all locations to enter this draw.
    </>
  );
}
