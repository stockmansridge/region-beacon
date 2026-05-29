import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAgencyContext } from "@/hooks/use-agency-context";

export const Route = createFileRoute("/admin_/events/$eventId/preview")({
  head: () => ({ meta: [{ title: "Event preview" }] }),
  component: EventPreview,
});

type EventRow = {
  id: string;
  agency_id: string;
  name: string;
  description: string | null;
  status: string;
  public_slug: string | null;
};

type Branding = {
  primary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  welcome_copy: string | null;
  terms_url: string | null;
};

type Venue = { id: string; name: string };

type Bundle = {
  event: EventRow;
  branding: Branding | null;
  venues: Venue[];
  termsUrl: string | null;
  privacyUrl: string | null;
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function EventPreview() {
  const { eventId } = Route.useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");

  useEffect(() => {
    if (auth.status === "unauthenticated") {
      navigate({ to: "/admin/login", replace: true });
    }
  }, [auth.status, navigate]);

  useEffect(() => {
    if (agency.status === "loading" || auth.status === "loading") return;
    if (!agencyId) {
      setState("not-found");
      return;
    }

    let cancelled = false;
    setState("loading");

    (async () => {
      const { data: event, error: evErr } = await supabase
        .from("events")
        .select("id, agency_id, name, description, status, public_slug, current_terms_version_id")
        .eq("id", eventId)
        .eq("agency_id", agencyId)
        .is("deleted_at", null)
        .maybeSingle();

      if (cancelled) return;
      if (evErr) {
        setState("error");
        return;
      }
      if (!event) {
        setState("not-found");
        return;
      }

      const [brandingRes, venuesRes, termsRes] = await Promise.all([
        supabase
          .from("event_branding")
          .select("primary_color, accent_color, font_family, welcome_copy, terms_url")
          .eq("event_id", event.id)
          .eq("agency_id", agencyId)
          .maybeSingle(),
        supabase
          .from("venues")
          .select("id, name")
          .eq("event_id", event.id)
          .eq("agency_id", agencyId)
          .is("deleted_at", null)
          .eq("status", "active")
          .order("order_index", { ascending: true }),
        event.current_terms_version_id
          ? supabase
              .from("event_terms_versions")
              .select("terms_url, privacy_url")
              .eq("id", event.current_terms_version_id)
              .eq("event_id", event.id)
              .eq("agency_id", agencyId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (cancelled) return;
      if (brandingRes.error || venuesRes.error || termsRes.error) {
        setState("error");
        return;
      }

      const branding = (brandingRes.data ?? null) as Branding | null;
      setBundle({
        event: event as EventRow,
        branding,
        venues: (venuesRes.data ?? []) as Venue[],
        termsUrl: (termsRes.data as { terms_url?: string } | null)?.terms_url ?? branding?.terms_url ?? null,
        privacyUrl: (termsRes.data as { privacy_url?: string } | null)?.privacy_url ?? null,
      });
      setState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [agency.status, auth.status, agencyId, eventId]);

  if (auth.status === "loading" || agency.status === "loading" || state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading preview…
      </div>
    );
  }

  if (state === "not-found") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center">
          <h1 className="text-lg font-semibold">Not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This event does not belong to your selected agency, or it does not exist.
          </p>
          <Link
            to="/admin/events"
            className="mt-6 inline-flex h-9 items-center rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
          >
            Back to admin
          </Link>
        </div>
      </div>
    );
  }

  if (state === "error" || !bundle) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-sm text-destructive">
        Could not load preview. Please try again.
      </div>
    );
  }

  const { event, branding, venues, termsUrl, privacyUrl } = bundle;
  const primaryColor =
    branding?.primary_color && HEX_RE.test(branding.primary_color) ? branding.primary_color : "#7A1F2B";
  const accentColor =
    branding?.accent_color && HEX_RE.test(branding.accent_color) ? branding.accent_color : "#E8C547";
  const fontFamily = branding?.font_family?.trim() || "system-ui, sans-serif";
  const welcomeCopy =
    branding?.welcome_copy?.trim() ||
    "Welcome! Collect stamps at participating venues and unlock rewards along the way.";

  return (
    <div className="min-h-screen bg-neutral-100" style={{ fontFamily }}>
      {/* Floating admin controls */}
      <div className="fixed left-4 top-4 z-50">
        <Link
          to="/admin/events/$eventId"
          params={{ eventId }}
          className="inline-flex h-9 items-center rounded-full border bg-white/95 px-3 text-xs font-medium text-neutral-700 shadow hover:bg-white"
        >
          ← Back to admin
        </Link>
      </div>
      <div className="fixed right-4 top-4 z-50">
        <div
          className="inline-flex h-9 items-center gap-2 rounded-full border border-amber-300 bg-amber-100/95 px-3 text-xs font-semibold text-amber-900 shadow"
          title={`Status: ${event.status}`}
        >
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Preview — not live
        </div>
      </div>

      {/* Landing page */}
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          {/* Hero */}
          <div
            className="relative h-56 w-full"
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})` }}
          >
            <div className="absolute inset-0 flex items-center justify-center text-xs uppercase tracking-widest text-white/80">
              Cover image placeholder
            </div>
            <div className="absolute left-5 top-5 flex h-16 w-16 items-center justify-center rounded-xl bg-white/90 text-[10px] font-semibold uppercase text-neutral-500 shadow">
              Logo
            </div>
          </div>

          <div className="space-y-6 p-6 sm:p-8">
            <div>
              <h1 className="text-3xl font-bold leading-tight" style={{ color: primaryColor }}>
                {event.name}
              </h1>
              <p className="mt-2 text-xs uppercase tracking-wider text-neutral-500">
                No app required · Web-based passport
              </p>
            </div>

            {event.description && (
              <p className="text-sm leading-relaxed text-neutral-700 whitespace-pre-line">
                {event.description}
              </p>
            )}

            <p className="text-sm leading-relaxed text-neutral-700">{welcomeCopy}</p>

            <div>
              <button
                type="button"
                disabled
                title="Preview only — the live event is not active"
                className="inline-flex h-11 cursor-not-allowed items-center rounded-lg px-6 text-sm font-semibold text-white opacity-60 shadow"
                style={{ backgroundColor: primaryColor }}
              >
                Start passport (Preview only)
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-lg border bg-neutral-50 p-3">
                <div className="text-xs uppercase tracking-wider text-neutral-500">Venues</div>
                <div className="mt-1 text-2xl font-semibold" style={{ color: primaryColor }}>
                  {venues.length}
                </div>
              </div>
              <div className="rounded-lg border bg-neutral-50 p-3">
                <div className="text-xs uppercase tracking-wider text-neutral-500">Progress</div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                  <div className="h-full" style={{ width: "40%", backgroundColor: accentColor }} />
                </div>
                <div className="mt-1 text-xs text-neutral-500">Sample reward: unlock at 5 stamps</div>
              </div>
            </div>

            {venues.length > 0 && (
              <div className="border-t pt-4">
                <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Participating venues
                </div>
                <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {venues.map((v) => (
                    <li
                      key={v.id}
                      className="rounded-md border bg-neutral-50 px-3 py-2 text-sm text-neutral-700"
                    >
                      {v.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t pt-4 text-xs text-neutral-500">
              By starting, you accept the{" "}
              {termsUrl ? (
                <a
                  href={termsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                  style={{ color: accentColor }}
                  onClick={(e) => e.preventDefault()}
                >
                  terms
                </a>
              ) : (
                <span>terms (not configured)</span>
              )}
              {" "}and{" "}
              {privacyUrl ? (
                <a
                  href={privacyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                  style={{ color: accentColor }}
                  onClick={(e) => e.preventDefault()}
                >
                  privacy policy
                </a>
              ) : (
                <span>privacy policy (not configured)</span>
              )}
              .
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-neutral-500">
          This is an admin-only preview. No visitors, passports, or check-ins are created.
        </p>
      </div>
    </div>
  );
}
