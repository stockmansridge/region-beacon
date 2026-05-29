import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/placeholder";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";

export const Route = createFileRoute("/admin/events/$eventId")({
  head: () => ({ meta: [{ title: "Event detail" }] }),
  component: EventDetail,
});

type EventRow = {
  id: string;
  agency_id: string;
  name: string;
  slug: string;
  public_slug: string | null;
  status: string;
  timezone: string;
  starts_at: string | null;
  ends_at: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  current_terms_version_id: string | null;
};

type Branding = {
  logo_path: string | null;
  cover_path: string | null;
  primary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  welcome_copy: string | null;
  terms_url: string | null;
};

type Domain = {
  id: string;
  public_subdomain: string | null;
  custom_domain: string | null;
  domain_type: string;
  status: string;
  is_primary: boolean;
  verified_at: string | null;
};

type TermsVersion = {
  id: string;
  terms_version: string;
  terms_url: string;
  privacy_version: string;
  privacy_url: string;
  effective_at: string;
};

type CheckinSettings = {
  one_checkin_per_venue: boolean;
  minimum_seconds_between_checkins: number;
  allow_manual_admin_checkins: boolean;
  max_checkins_per_passport_per_day: number | null;
};

type LeaderboardSettings = {
  is_enabled: boolean;
  display_mode: string;
  show_visit_count: boolean;
  hide_below_checkins: number;
  allow_visitor_opt_out: boolean;
};

type Venue = {
  id: string;
  name: string;
  address: string | null;
  status: string;
  order_index: number;
};

type QrSummary = {
  venue_id: string;
  status: string;
  issued_at: string;
};

type Bundle = {
  event: EventRow;
  branding: Branding | null;
  domains: Domain[];
  terms: TermsVersion | null;
  checkin: CheckinSettings | null;
  leaderboard: LeaderboardSettings | null;
  venues: Venue[];
  qrByVenue: Map<string, QrSummary>;
};

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch (_e) {
    return "—";
  }
}

type EditForm = {
  name: string;
  description: string;
  timezone: string;
  starts_at: string; // datetime-local
  ends_at: string;   // datetime-local
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function EventDetail() {
  const { eventId } = Route.useParams();
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;
  const canEdit =
    agency.isPlatformAdmin ||
    agency.selected?.role === "agency_owner" ||
    agency.selected?.role === "agency_admin";

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {

    if (!agencyId || eventId === "new") {
      if (eventId === "new") setState("not-found");
      return;
    }
    let cancelled = false;
    setState("loading");

    (async () => {
      // 1. Fetch event with explicit agency_id filter — confirms ownership.
      const { data: event, error: evErr } = await supabase
        .from("events")
        .select(
          "id, agency_id, name, slug, public_slug, status, timezone, starts_at, ends_at, description, created_at, updated_at, current_terms_version_id",
        )
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

      // 2. Fetch related rows in parallel, each filtered by both event_id AND agency_id.
      const [brandingRes, domainsRes, checkinRes, leaderboardRes, venuesRes, termsRes] =
        await Promise.all([
          supabase
            .from("event_branding")
            .select("logo_path, cover_path, primary_color, accent_color, font_family, welcome_copy, terms_url")
            .eq("event_id", event.id)
            .eq("agency_id", agencyId)
            .maybeSingle(),
          supabase
            .from("event_domains")
            .select("id, public_subdomain, custom_domain, domain_type, status, is_primary, verified_at")
            .eq("event_id", event.id)
            .eq("agency_id", agencyId)
            .order("is_primary", { ascending: false }),
          supabase
            .from("event_checkin_settings")
            .select(
              "one_checkin_per_venue, minimum_seconds_between_checkins, allow_manual_admin_checkins, max_checkins_per_passport_per_day",
            )
            .eq("event_id", event.id)
            .eq("agency_id", agencyId)
            .maybeSingle(),
          supabase
            .from("leaderboard_settings")
            .select("is_enabled, display_mode, show_visit_count, hide_below_checkins, allow_visitor_opt_out")
            .eq("event_id", event.id)
            .eq("agency_id", agencyId)
            .maybeSingle(),
          supabase
            .from("venues")
            .select("id, name, address, status, order_index")
            .eq("event_id", event.id)
            .eq("agency_id", agencyId)
            .is("deleted_at", null)
            .order("order_index", { ascending: true }),
          event.current_terms_version_id
            ? supabase
                .from("event_terms_versions")
                .select("id, terms_version, terms_url, privacy_version, privacy_url, effective_at")
                .eq("id", event.current_terms_version_id)
                .eq("event_id", event.id)
                .eq("agency_id", agencyId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

      if (cancelled) return;
      if (
        brandingRes.error ||
        domainsRes.error ||
        checkinRes.error ||
        leaderboardRes.error ||
        venuesRes.error ||
        termsRes.error
      ) {
        setState("error");
        return;
      }

      const venues = (venuesRes.data ?? []) as Venue[];

      // 3. Fetch active QR codes for these venues — status + issued_at only.
      const qrByVenue = new Map<string, QrSummary>();
      if (venues.length > 0) {
        const { data: qrRows, error: qrErr } = await supabase
          .from("venue_qr_codes")
          .select("venue_id, status, issued_at")
          .eq("agency_id", agencyId)
          .eq("event_id", event.id)
          .eq("status", "active")
          .in("venue_id", venues.map((v) => v.id));

        if (cancelled) return;
        if (qrErr) {
          setState("error");
          return;
        }
        for (const row of (qrRows ?? []) as QrSummary[]) {
          // First active per venue (a partial unique index guarantees uniqueness anyway).
          if (!qrByVenue.has(row.venue_id)) qrByVenue.set(row.venue_id, row);
        }
      }

      setBundle({
        event: event as EventRow,
        branding: (brandingRes.data ?? null) as Branding | null,
        domains: (domainsRes.data ?? []) as Domain[],
        terms: (termsRes.data ?? null) as TermsVersion | null,
        checkin: (checkinRes.data ?? null) as CheckinSettings | null,
        leaderboard: (leaderboardRes.data ?? null) as LeaderboardSettings | null,
        venues,
        qrByVenue,
      });
      setState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [agencyId, eventId]);

  if (eventId === "new") {
    return (
      <>
        <PageHeader title="New event" description="Event creation is not enabled yet." />
        <EmptyNotice>Creating events will be available in a later milestone.</EmptyNotice>
      </>
    );
  }

  if (state === "loading") {
    return (
      <>
        <PageHeader title="Event detail" description="Loading event…" />
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Loading…</div>
      </>
    );
  }

  if (state === "not-found") {
    return (
      <>
        <PageHeader title="Event not found" description="" />
        <EmptyNotice>
          This event does not exist for your agency, or you do not have access to it.{" "}
          <Link to="/admin/events" className="font-medium text-primary hover:underline">
            Back to events
          </Link>
          .
        </EmptyNotice>
      </>
    );
  }

  if (state === "error" || !bundle) {
    return (
      <>
        <PageHeader title="Event detail" description="" />
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Could not load event detail.
        </div>
      </>
    );
  }

  const { event, branding, domains, terms, checkin, leaderboard, venues, qrByVenue } = bundle;

  return (
    <>
      <PageHeader
        title={event.name}
        description={`Read-only view · status: ${event.status}`}
        actions={
          <button
            type="button"
            disabled
            title="Editing coming next"
            className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium text-muted-foreground opacity-70"
          >
            Editing coming next
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Basics">
            <DefList
              rows={[
                ["Name", event.name],
                ["Internal slug", event.slug],
                ["Public slug", event.public_slug ?? "—"],
                ["Status", event.status],
                ["Timezone", event.timezone],
                ["Starts at", fmt(event.starts_at)],
                ["Ends at", fmt(event.ends_at)],
                ["Description", event.description ?? "—"],
                ["Created", fmt(event.created_at)],
                ["Updated", fmt(event.updated_at)],
              ]}
            />
          </Section>

          <Section title="Branding">
            {branding ? (
              <DefList
                rows={[
                  ["Logo path", branding.logo_path ?? "—"],
                  ["Cover path", branding.cover_path ?? "—"],
                  ["Primary colour", <ColorSwatch key="p" value={branding.primary_color} />],
                  ["Accent colour", <ColorSwatch key="a" value={branding.accent_color} />],
                  ["Font family", branding.font_family ?? "—"],
                  ["Welcome copy", branding.welcome_copy ?? "—"],
                  ["Terms URL (branding)", branding.terms_url ?? "—"],
                ]}
              />
            ) : (
              <EmptyNotice>No branding configured yet.</EmptyNotice>
            )}
          </Section>

          <Section title="Domains">
            {domains.length === 0 ? (
              <EmptyNotice>No domain configured yet.</EmptyNotice>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Subdomain</th>
                      <th className="px-3 py-2 font-medium">Custom</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Primary</th>
                      <th className="px-3 py-2 font-medium">Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domains.map((d) => (
                      <tr key={d.id} className="border-t">
                        <td className="px-3 py-2">{d.public_subdomain ?? "—"}</td>
                        <td className="px-3 py-2">{d.custom_domain ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{d.domain_type}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{d.status}</span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{d.is_primary ? "yes" : "no"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{fmt(d.verified_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Venues">
            {venues.length === 0 ? (
              <EmptyNotice>No venues yet.</EmptyNotice>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Address</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Active QR</th>
                      <th className="px-3 py-2 font-medium">Issued</th>
                    </tr>
                  </thead>
                  <tbody>
                    {venues.map((v) => {
                      const qr = qrByVenue.get(v.id);
                      return (
                        <tr key={v.id} className="border-t">
                          <td className="px-3 py-2 text-muted-foreground">{v.order_index}</td>
                          <td className="px-3 py-2 font-medium">{v.name}</td>
                          <td className="px-3 py-2 text-muted-foreground">{v.address ?? "—"}</td>
                          <td className="px-3 py-2">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{v.status}</span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {qr ? qr.status : "none"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{fmt(qr?.issued_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  QR tokens are hidden. Reveal/copy and poster download will be added behind an
                  admin-only control later.
                </p>
              </div>
            )}
          </Section>
        </div>

        <aside className="space-y-4">
          <Section title="Terms & privacy">
            {terms ? (
              <DefList
                rows={[
                  ["Terms version", terms.terms_version],
                  ["Terms URL", terms.terms_url],
                  ["Privacy version", terms.privacy_version],
                  ["Privacy URL", terms.privacy_url],
                  ["Effective at", fmt(terms.effective_at)],
                ]}
              />
            ) : (
              <EmptyNotice>No terms version linked.</EmptyNotice>
            )}
          </Section>

          <Section title="Check-in settings">
            {checkin ? (
              <DefList
                rows={[
                  ["One per venue", checkin.one_checkin_per_venue ? "yes" : "no"],
                  ["Min seconds between", String(checkin.minimum_seconds_between_checkins)],
                  ["Allow manual admin", checkin.allow_manual_admin_checkins ? "yes" : "no"],
                  [
                    "Max per passport/day",
                    checkin.max_checkins_per_passport_per_day === null
                      ? "unlimited"
                      : String(checkin.max_checkins_per_passport_per_day),
                  ],
                ]}
              />
            ) : (
              <EmptyNotice>No check-in settings.</EmptyNotice>
            )}
          </Section>

          <Section title="Leaderboard">
            {leaderboard ? (
              <DefList
                rows={[
                  ["Enabled", leaderboard.is_enabled ? "yes" : "no"],
                  ["Display mode", leaderboard.display_mode],
                  ["Show visit count", leaderboard.show_visit_count ? "yes" : "no"],
                  ["Hide below check-ins", String(leaderboard.hide_below_checkins)],
                  ["Allow visitor opt-out", leaderboard.allow_visitor_opt_out ? "yes" : "no"],
                ]}
              />
            ) : (
              <EmptyNotice>No leaderboard settings.</EmptyNotice>
            )}
          </Section>
        </aside>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-6">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DefList({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{k}</dt>
          <dd className="text-sm break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ColorSwatch({ value }: { value: string | null }) {
  if (!value) return <>—</>;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block h-4 w-4 rounded border"
        style={{ backgroundColor: value }}
        aria-hidden
      />
      <code className="text-xs">{value}</code>
    </span>
  );
}

function EmptyNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
