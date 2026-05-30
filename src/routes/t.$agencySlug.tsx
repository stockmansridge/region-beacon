import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  resolveAgencyBySubdomain,
  resolveLegacyEventForSubdomain,
  type PublicAgency,
} from "@/lib/tenant-resolution";
import { PoweredByGetStampd } from "@/components/brand";
import { HostDiagnostic } from "@/components/host-diagnostic";

export const Route = createFileRoute("/t/$agencySlug")({
  head: () => ({
    meta: [
      { title: "Workspace — GetStampd" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgencyWorkspacePage,
});

type PublicEventRow = {
  event_id: string;
  name: string;
  public_slug: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

type State =
  | { kind: "loading" }
  | { kind: "not_found"; reason: string }
  | { kind: "legacy_event"; eventId: string }
  | { kind: "agency"; agency: PublicAgency; events: PublicEventRow[] };

function AgencyWorkspacePage() {
  const { agencySlug } = Route.useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ kind: "loading" });

      // 1. Try legacy event_domains hit first (existing tenants keep working).
      const legacy = await resolveLegacyEventForSubdomain(agencySlug);
      if (cancelled) return;
      if (legacy) {
        // Render legacy event flow via existing route.
        navigate({
          to: "/live/$subdomain",
          params: { subdomain: agencySlug },
          replace: true,
        });
        setState({ kind: "legacy_event", eventId: legacy.event_id });
        return;
      }

      // 2. Resolve agency by subdomain.
      const agency = await resolveAgencyBySubdomain(agencySlug);
      if (cancelled) return;
      if (!agency) {
        setState({
          kind: "not_found",
          reason: "No agency matches subdomain and no legacy event_domain hit",
        });
        return;
      }

      // 3. List published events for the agency. We deliberately scope to a
      //    narrow column set; RLS is expected to expose only public-safe rows.
      const { data: evtData } = await supabase
        .from("events")
        .select("id, name, public_slug, starts_at, ends_at, is_published")
        .eq("agency_id", agency.agency_id)
        .eq("is_published", true)
        .order("starts_at", { ascending: false, nullsFirst: false });

      if (cancelled) return;
      const events: PublicEventRow[] = (evtData ?? [])
        .filter((r: { public_slug: string | null }) => !!r.public_slug)
        .map((r) => ({
          event_id: r.id as string,
          name: r.name as string,
          public_slug: r.public_slug as string,
          starts_at: (r.starts_at as string | null) ?? null,
          ends_at: (r.ends_at as string | null) ?? null,
        }));

      setState({ kind: "agency", agency, events });
    })();
    return () => {
      cancelled = true;
    };
  }, [agencySlug, navigate]);

  if (state.kind === "loading" || state.kind === "legacy_event") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] text-sm text-[#8A7E66]">
        Loading…
        <HostDiagnostic
          resolvedEventId={state.kind === "legacy_event" ? state.eventId : null}
          reason={state.kind === "legacy_event" ? "Legacy event_domain hit" : null}
        />
      </div>
    );
  }

  if (state.kind === "not_found") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] px-6">
        <div className="mx-auto max-w-md rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-8 text-center shadow-sm">
          <h1 className="font-trail-serif text-2xl font-semibold text-[#1F3D2B]">
            Workspace not found
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#3D372C]">
            We couldn't find a GetStampd workspace for "{agencySlug}".
          </p>
          <div className="mt-6 flex justify-center">
            <PoweredByGetStampd variant="trail" />
          </div>
        </div>
        <HostDiagnostic reason={state.reason} />
      </div>
    );
  }

  const { agency, events } = state;
  return (
    <div className="min-h-screen bg-[#F6EFE2] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 text-center">
          <h1 className="font-trail-serif text-3xl font-semibold text-[#1F3D2B]">
            {agency.name}
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-[#8A7E66]">
            Workspace · {agency.slug}
          </p>
        </header>

        {events.length === 0 ? (
          <div className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-8 text-center text-sm text-[#3D372C]">
            No public events yet. Check back soon.
          </div>
        ) : (
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.event_id}>
                <Link
                  to="/t/$agencySlug/e/$eventSlug"
                  params={{ agencySlug, eventSlug: e.public_slug! }}
                  className="block rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-4 transition hover:border-[#1F3D2B]/30 hover:shadow-sm"
                >
                  <div className="font-trail-serif text-lg font-semibold text-[#1F3D2B]">
                    {e.name}
                  </div>
                  {e.starts_at ? (
                    <div className="mt-1 text-xs uppercase tracking-wider text-[#8A7E66]">
                      {new Date(e.starts_at).toLocaleDateString()}
                    </div>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-10 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>
      </div>
      <HostDiagnostic resolvedAgencyId={agency.agency_id} reason="Agency resolved by subdomain" />
    </div>
  );
}
