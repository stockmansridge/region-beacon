import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/placeholder";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";
import { useAuth } from "@/hooks/use-auth";
import {
  EventTrailPoster,
} from "@/components/posters/event-trail-poster";
import { VenuePoster } from "@/components/posters/venue-poster";
import { POSTER_HEIGHT_PX, POSTER_WIDTH_PX } from "@/components/posters/poster-frame";
import {
  exportPosterNodeToPdf,
  exportPosterNodesToPdf,
} from "@/lib/poster-export";
import {
  eventPosterFilename,
  venuePosterFilename,
  venuePostersBundleFilename,
  type EventPosterData,
  type PosterBranding,
  type VenuePosterData,
} from "@/lib/poster-types";
import { getEventAssetPublicUrl } from "@/lib/event-assets";
import { resolveEventPalette } from "@/lib/event-palettes";
import {
  buildGoogleFontsHref,
  getEventFont,
} from "@/lib/event-fonts";
import { PUBLIC_TENANT_ROOT_DOMAIN } from "@/lib/domains";

export const Route = createFileRoute("/admin/events/$eventId_/posters")({
  head: () => ({ meta: [{ title: "Event posters" }] }),
  component: PostersPage,
  codeSplitGroupings: [],
});

// ---------- Data types ----------

type EventRow = {
  id: string;
  agency_id: string;
  name: string;
  slug: string;
  public_slug: string | null;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
};

type BrandingRow = {
  logo_path: string | null;
  cover_path: string | null;
  primary_color: string | null;
  accent_color: string | null;
  palette_key: string | null;
  page_background_color: string | null;
  card_background_color: string | null;
  font_family: string | null;
  heading_font_family: string | null;
};

type VenueRow = {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  status: string;
  order_index: number;
  cover_path: string | null;
  logo_path: string | null;
  points_value: number | null;
  deleted_at: string | null;
};

type QrRow = {
  venue_id: string;
  token: string;
  entry_value: number | null;
  status: string;
};

type AwardRow = {
  title: string;
  points_required: number;
  status: "active" | "disabled";
};

// ---------- Component ----------

function PostersPage() {
  const { eventId } = Route.useParams();
  const { user } = useAuth();
  const { agencyId } = useAgencyContext();

  const [state, setState] = useState<"loading" | "ready" | "error" | "denied">(
    "loading",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [event, setEvent] = useState<EventRow | null>(null);
  const [branding, setBranding] = useState<BrandingRow | null>(null);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [qrByVenue, setQrByVenue] = useState<Map<string, QrRow>>(new Map());
  const [activeSubdomain, setActiveSubdomain] = useState<string | null>(null);
  const [awards, setAwards] = useState<AwardRow[]>([]);

  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Refs to the capture nodes (always rendered offscreen at full A4 px).
  const eventCaptureRef = useRef<HTMLDivElement | null>(null);
  const venueCaptureRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // ---------- Load ----------
  useEffect(() => {
    if (!user || !agencyId) return;
    let cancelled = false;
    (async () => {
      setState("loading");
      setErrorMsg(null);
      try {
        const eventRes = await supabase
          .from("events")
          .select(
            "id, agency_id, name, slug, public_slug, description, starts_at, ends_at, timezone",
          )
          .eq("id", eventId)
          .eq("agency_id", agencyId)
          .maybeSingle();
        if (cancelled) return;
        if (eventRes.error) throw eventRes.error;
        if (!eventRes.data) {
          setState("denied");
          return;
        }
        const ev = eventRes.data as EventRow;
        setEvent(ev);

        const [brandRes, venuesRes, domainsRes] = await Promise.all([
          supabase
            .from("event_branding")
            .select(
              "logo_path, cover_path, primary_color, accent_color, palette_key, page_background_color, card_background_color, font_family, heading_font_family",
            )
            .eq("event_id", ev.id)
            .eq("agency_id", agencyId)
            .maybeSingle(),
          supabase
            .from("venues")
            .select(
              "id, name, address, description, status, order_index, cover_path, logo_path, points_value, deleted_at",
            )
            .eq("event_id", ev.id)
            .eq("agency_id", agencyId)
            .order("order_index", { ascending: true }),
          supabase
            .from("event_domains")
            .select("public_subdomain, domain_type, status, is_primary")
            .eq("event_id", ev.id)
            .eq("agency_id", agencyId)
            .order("is_primary", { ascending: false }),
        ]);
        if (cancelled) return;

        // Branding can legitimately be null for a brand-new event.
        const brandingRow = (brandRes.data ?? null) as BrandingRow | null;
        // heading_font_family is from a draft migration — degrade gracefully
        // if Postgres reports an undefined column.
        let resolvedBranding = brandingRow;
        if (brandRes.error && /heading_font_family/.test(brandRes.error.message ?? "")) {
          const fallback = await supabase
            .from("event_branding")
            .select(
              "logo_path, cover_path, primary_color, accent_color, palette_key, page_background_color, card_background_color, font_family",
            )
            .eq("event_id", ev.id)
            .eq("agency_id", agencyId)
            .maybeSingle();
          if (fallback.error) throw fallback.error;
          resolvedBranding = (fallback.data
            ? { ...fallback.data, heading_font_family: null }
            : null) as BrandingRow | null;
        } else if (brandRes.error) {
          throw brandRes.error;
        }
        setBranding(resolvedBranding);

        if (venuesRes.error) throw venuesRes.error;
        const allVenues = (venuesRes.data ?? []) as VenueRow[];
        const activeVenues = allVenues.filter(
          (v) => !v.deleted_at && v.status !== "archived",
        );
        setVenues(activeVenues);

        if (domainsRes.error) throw domainsRes.error;
        const activeSub = (domainsRes.data ?? []).find(
          (d: any) =>
            d.domain_type === "event_subdomain" &&
            d.status === "active" &&
            !!d.public_subdomain,
        ) as { public_subdomain: string } | undefined;
        setActiveSubdomain(activeSub?.public_subdomain ?? null);

        // QR codes (active) per venue.
        if (activeVenues.length > 0) {
          const baseCols = "venue_id, token, status";
          let qrRes = await supabase
            .from("venue_qr_codes")
            .select(`${baseCols}, entry_value`)
            .eq("agency_id", agencyId)
            .eq("event_id", ev.id)
            .eq("status", "active")
            .in("venue_id", activeVenues.map((v) => v.id));
          if (qrRes.error && /entry_value/.test(qrRes.error.message ?? "")) {
            qrRes = await supabase
              .from("venue_qr_codes")
              .select(baseCols)
              .eq("agency_id", agencyId)
              .eq("event_id", ev.id)
              .eq("status", "active")
              .in("venue_id", activeVenues.map((v) => v.id));
          }
          if (cancelled) return;
          if (qrRes.error) throw qrRes.error;
          const map = new Map<string, QrRow>();
          for (const r of (qrRes.data ?? []) as any[]) {
            if (!map.has(r.venue_id)) {
              map.set(r.venue_id, {
                venue_id: r.venue_id,
                token: r.token,
                status: r.status,
                entry_value: r.entry_value ?? null,
              });
            }
          }
          setQrByVenue(map);
        } else {
          setQrByVenue(new Map());
        }

        // Awards summary (optional).
        try {
          const awardsRes = await supabase.rpc("get_event_awards_admin" as never, {
            p_event_id: ev.id,
          } as never);
          if (!awardsRes.error && awardsRes.data) {
            const rows = (awardsRes.data as any[])
              .filter((r) => r?.status === "active")
              .map((r) => ({
                title: String(r.title ?? ""),
                points_required: Number(r.points_required ?? 0),
                status: r.status,
              }));
            setAwards(rows);
          } else {
            setAwards([]);
          }
        } catch {
          setAwards([]);
        }

        if (!cancelled) {
          setSelectedVenueId((prev) =>
            prev && activeVenues.some((v) => v.id === prev)
              ? prev
              : (activeVenues[0]?.id ?? null),
          );
          setState("ready");
        }
      } catch (err: any) {
        if (cancelled) return;
        console.error("[posters] load failed", err);
        setErrorMsg(err?.message ?? "Failed to load event posters.");
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, agencyId, user]);

  // Preload Google Fonts used by the event branding so the export
  // snapshot captures the right typefaces. The default page fonts
  // already include common fallbacks.
  useEffect(() => {
    const href = buildGoogleFontsHref([
      branding?.heading_font_family,
      branding?.font_family,
    ]);
    if (!href) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
    return () => {
      try {
        document.head.removeChild(link);
      } catch {
        /* ignore */
      }
    };
  }, [branding?.heading_font_family, branding?.font_family]);

  // ---------- Derived poster data ----------

  const publicUrl = useMemo(() => {
    if (!activeSubdomain) return null;
    return `https://${activeSubdomain}.${PUBLIC_TENANT_ROOT_DOMAIN}`;
  }, [activeSubdomain]);

  const posterBranding = useMemo<PosterBranding>(() => {
    const palette = resolveEventPalette({
      palette_key: branding?.palette_key ?? null,
      primary_color: branding?.primary_color ?? null,
      accent_color: branding?.accent_color ?? null,
    });
    const headingFont = getEventFont(branding?.heading_font_family ?? null)?.stack ?? null;
    const bodyFont = getEventFont(branding?.font_family ?? null)?.stack ?? null;
    return {
      primaryColor: palette.primary,
      accentColor: palette.accent,
      pageBackground: branding?.page_background_color ?? palette.pageBg,
      cardBackground: branding?.card_background_color ?? palette.cardBg,
      textColor: palette.bodyText,
      mutedTextColor: palette.mutedText,
      headingFontFamily: headingFont,
      bodyFontFamily: bodyFont,
      logoUrl: getEventAssetPublicUrl(branding?.logo_path ?? null),
      heroImageUrl: getEventAssetPublicUrl(branding?.cover_path ?? null),
    };
  }, [branding]);

  const rewardSummary = useMemo(() => {
    if (awards.length === 0) return null;
    const top = [...awards]
      .sort((a, b) => a.points_required - b.points_required)
      .slice(0, 3)
      .map((a) =>
        a.points_required > 0
          ? `${a.title} (${a.points_required} pts)`
          : a.title,
      )
      .join(" · ");
    return awards.length > 3 ? `${top} and more` : top;
  }, [awards]);

  const eventPosterData = useMemo<EventPosterData | null>(() => {
    if (!event) return null;
    return {
      eventId: event.id,
      eventName: event.name,
      eventDescription: event.description,
      eventLocation: null,
      startDate: event.starts_at,
      endDate: event.ends_at,
      timezone: event.timezone,
      venueCount: venues.length,
      rewardSummary,
      publicUrl,
      eventQrUrl: publicUrl,
      branding: posterBranding,
    };
  }, [event, venues.length, rewardSummary, publicUrl, posterBranding]);

  const venuePosterDataById = useMemo(() => {
    const map = new Map<string, VenuePosterData>();
    if (!event) return map;
    for (const v of venues) {
      const qr = qrByVenue.get(v.id) ?? null;
      const checkinUrl =
        qr && activeSubdomain
          ? `https://${activeSubdomain}.${PUBLIC_TENANT_ROOT_DOMAIN}/checkin/${qr.token}`
          : null;
      map.set(v.id, {
        eventId: event.id,
        eventName: event.name,
        venueId: v.id,
        venueName: v.name,
        venueAddress: v.address,
        venueDescription: v.description,
        venueOffer: null, // offer_summary not loaded here; keep null until needed
        stampValue: qr?.entry_value ?? 1,
        pointsValue: v.points_value,
        venueQrUrl: checkinUrl,
        venueImageUrl:
          getVenueImage(v) ?? null,
        publicUrl,
        branding: posterBranding,
      });
    }
    return map;
  }, [event, venues, qrByVenue, activeSubdomain, publicUrl, posterBranding]);

  // Load optional offer_summary per venue (degrades silently).
  useEffect(() => {
    if (!agencyId || !event || venues.length === 0) return;
    let cancelled = false;
    (async () => {
      const res = await supabase
        .from("venues")
        .select("id, offer_summary" as any)
        .eq("agency_id", agencyId)
        .eq("event_id", event.id)
        .in("id", venues.map((v) => v.id));
      if (cancelled || res.error) return;
      const offers = new Map<string, string | null>();
      for (const r of (res.data ?? []) as any[]) {
        offers.set(r.id, r.offer_summary ?? null);
      }
      // Patch the existing map in place via state-less mutation; trigger a
      // re-render by setting a small marker.
      setVenues((prev) =>
        prev.map((v) => ({
          ...v,
          // store on the row itself for memo to pick up
          _offer_summary: offers.get(v.id) ?? null,
        } as any)),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [agencyId, event?.id, venues.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-derive venue posters when offer summary is patched in.
  const venuePostersWithOffer = useMemo(() => {
    const map = new Map<string, VenuePosterData>();
    venuePosterDataById.forEach((data, id) => {
      const v = venues.find((vv) => vv.id === id) as any;
      map.set(id, {
        ...data,
        venueOffer: v?._offer_summary ?? data.venueOffer,
      });
    });
    return map;
  }, [venuePosterDataById, venues]);

  // ---------- Export actions ----------

  const downloadEventPoster = useCallback(async () => {
    if (!eventCaptureRef.current || !eventPosterData) return;
    setBusy("event");
    try {
      await exportPosterNodeToPdf(
        eventCaptureRef.current,
        eventPosterFilename(event?.public_slug ?? event?.slug ?? "event"),
      );
    } catch (err) {
      console.error("[posters] event export failed", err);
      toast.error("Could not generate the event poster PDF.");
    } finally {
      setBusy(null);
    }
  }, [eventPosterData, event]);

  const downloadVenuePoster = useCallback(
    async (venueId: string) => {
      const node = venueCaptureRefs.current.get(venueId);
      const data = venuePostersWithOffer.get(venueId);
      if (!node || !data) return;
      if (!data.venueQrUrl) {
        toast.error("Generate a venue QR before downloading this poster.");
        return;
      }
      setBusy(`venue:${venueId}`);
      try {
        await exportPosterNodeToPdf(
          node,
          venuePosterFilename(
            event?.public_slug ?? event?.slug ?? "event",
            data.venueName,
          ),
        );
      } catch (err) {
        console.error("[posters] venue export failed", err);
        toast.error("Could not generate the venue poster PDF.");
      } finally {
        setBusy(null);
      }
    },
    [venuePostersWithOffer, event],
  );

  const downloadAllVenuePosters = useCallback(async () => {
    const nodes: HTMLDivElement[] = [];
    venuePostersWithOffer.forEach((data, id) => {
      if (!data.venueQrUrl) return;
      const n = venueCaptureRefs.current.get(id);
      if (n) nodes.push(n);
    });
    if (nodes.length === 0) {
      toast.error("No venues have an active QR yet.");
      return;
    }
    setBusy("venues-all");
    try {
      await exportPosterNodesToPdf(
        nodes,
        venuePostersBundleFilename(event?.public_slug ?? event?.slug ?? "event"),
      );
    } catch (err) {
      console.error("[posters] bundle export failed", err);
      toast.error("Could not generate the venue posters PDF.");
    } finally {
      setBusy(null);
    }
  }, [venuePostersWithOffer, event]);

  // ---------- Render ----------

  if (state === "loading") {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <PageHeader title="Posters" subtitle="Loading event…" />
      </div>
    );
  }
  if (state === "denied" || state === "error" || !event) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <PageHeader
          title="Posters"
          subtitle={errorMsg ?? "We couldn't load this event."}
        />
        <Link
          to="/admin/events/$eventId"
          params={{ eventId }}
          className="mt-4 inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm hover:bg-muted"
        >
          ← Back to event
        </Link>
      </div>
    );
  }

  const selectedVenue =
    (selectedVenueId && venues.find((v) => v.id === selectedVenueId)) || venues[0] || null;
  const selectedVenueData = selectedVenue
    ? venuePostersWithOffer.get(selectedVenue.id) ?? null
    : null;

  const totalVenues = venues.length;
  const venuesWithQr = Array.from(venuePostersWithOffer.values()).filter(
    (v) => !!v.venueQrUrl,
  ).length;
  const venuesMissingQr = totalVenues - venuesWithQr;

  const warnings: string[] = [];
  if (!posterBranding.heroImageUrl)
    warnings.push("No hero image uploaded — the event poster will use the brand gradient.");
  if (!posterBranding.logoUrl)
    warnings.push("No event logo uploaded — the poster will fall back to the event name.");
  if (!publicUrl)
    warnings.push("This event has no active public address yet — QR codes will not point anywhere.");
  if (awards.length === 0)
    warnings.push("No rewards configured — the event poster will hide the rewards section.");
  if (venuesMissingQr > 0)
    warnings.push(
      `${venuesMissingQr} of ${totalVenues} venues do not have an active QR code and will be skipped from bulk export.`,
    );

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        title="Posters"
        subtitle={`Printable A4 posters for ${event.name}.`}
      />
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-3 text-sm">
        <Link
          to="/admin/events/$eventId"
          params={{ eventId }}
          className="inline-flex h-9 items-center rounded-md border bg-background px-3 hover:bg-muted"
        >
          ← Back to event
        </Link>
        {publicUrl && (
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:underline"
          >
            {publicUrl}
          </a>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold mb-1">Heads up</div>
          <ul className="list-disc pl-5 space-y-1">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- Event Trail Poster ---------- */}
      <section className="rounded-2xl border bg-white p-6 mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Event Trail Poster</h2>
            <p className="text-sm text-muted-foreground mt-1">
              A4 portrait. Uses your event branding and the public landing QR.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadEventPoster}
            disabled={busy !== null}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy === "event" ? "Generating…" : "Download PDF"}
          </button>
        </div>
        {eventPosterData && (
          <EventTrailPoster data={eventPosterData} previewScale={0.5} />
        )}
      </section>

      {/* ---------- Venue Posters ---------- */}
      <section className="rounded-2xl border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Venue Posters</h2>
            <p className="text-sm text-muted-foreground mt-1">
              One A4 poster per venue, with that venue's active check-in QR.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadAllVenuePosters}
            disabled={busy !== null || venuesWithQr === 0}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy === "venues-all"
              ? "Generating…"
              : `Download all (${venuesWithQr}) as one PDF`}
          </button>
        </div>

        {venues.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active venues yet. Add a venue to generate its poster.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <label className="text-sm font-medium" htmlFor="poster-venue">
                Preview venue
              </label>
              <select
                id="poster-venue"
                value={selectedVenueId ?? ""}
                onChange={(e) => setSelectedVenueId(e.target.value || null)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                {venues.map((v) => {
                  const has = !!qrByVenue.get(v.id);
                  return (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {has ? "" : " — no QR"}
                    </option>
                  );
                })}
              </select>
              {selectedVenue && (
                <button
                  type="button"
                  onClick={() => downloadVenuePoster(selectedVenue.id)}
                  disabled={busy !== null || !selectedVenueData?.venueQrUrl}
                  className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                >
                  {busy === `venue:${selectedVenue.id}`
                    ? "Generating…"
                    : "Download this poster"}
                </button>
              )}
            </div>

            {selectedVenueData ? (
              !selectedVenueData.venueQrUrl ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Generate a venue QR code before downloading this poster.{" "}
                  <Link
                    to="/admin/events/$eventId"
                    params={{ eventId }}
                    className="font-semibold underline"
                  >
                    Open venue setup
                  </Link>
                </div>
              ) : (
                <VenuePoster data={selectedVenueData} previewScale={0.5} />
              )
            ) : null}
          </>
        )}
      </section>

      {/* ---------- Offscreen capture nodes ----------
          Rendered at full A4 px so html-to-image gets pixel-perfect
          snapshots. Positioned far off the viewport rather than
          display:none so layout/fonts actually compute.  */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: -100000,
          top: 0,
          width: POSTER_WIDTH_PX,
          height: POSTER_HEIGHT_PX,
          pointerEvents: "none",
        }}
      >
        {eventPosterData && (
          <div ref={eventCaptureRef}>
            <EventTrailPoster data={eventPosterData} capture id="event-poster-capture" />
          </div>
        )}
        {Array.from(venuePostersWithOffer.values()).map((data) => (
          <div
            key={data.venueId}
            ref={(el) => {
              if (el) venueCaptureRefs.current.set(data.venueId, el);
              else venueCaptureRefs.current.delete(data.venueId);
            }}
          >
            <VenuePoster data={data} capture id={`venue-poster-capture-${data.venueId}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function getVenueImage(v: VenueRow): string | null {
  // Prefer cover, then logo. Both are stored under the event-assets bucket
  // via venue-assets helpers, which return a public URL.
  // We re-use getEventAssetPublicUrl since venue assets share that bucket.
  const p = v.cover_path ?? v.logo_path ?? null;
  return getEventAssetPublicUrl(p);
}
