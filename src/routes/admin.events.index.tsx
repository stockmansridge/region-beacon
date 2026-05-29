import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/placeholder";
import { supabase } from "@/integrations/supabase/client";
import { useAgencyContext } from "@/hooks/use-agency-context";

export const Route = createFileRoute("/admin/events/")({
  head: () => ({ meta: [{ title: "Events" }] }),
  component: Events,
});

type EventRow = {
  id: string;
  name: string;
  slug: string;
  public_slug: string | null;
  status: string;
  timezone: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

function fmt(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch (_e) {
    return "—";
  }
}

function Events() {
  const agency = useAgencyContext();
  const agencyId = agency.selected?.id ?? null;
  const [rows, setRows] = useState<EventRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agencyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const { data, error } = await supabase
        .from("events")
        .select(
          "id, name, slug, public_slug, status, timezone, starts_at, ends_at, created_at, updated_at",
        )
        .eq("agency_id", agencyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        setError("Could not load events.");
        setLoading(false);
        return;
      }
      setRows((data ?? []) as EventRow[]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [agencyId]);

  return (
    <>
      <PageHeader
        title="Events"
        description="Read-only view of events for your agency. Create and edit are not enabled yet."
      />
      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Event</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Internal slug</th>
              <th className="px-4 py-3 font-medium">Public slug</th>
              <th className="px-4 py-3 font-medium">Timezone</th>
              <th className="px-4 py-3 font-medium">Dates</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Updated</th>
              <th className="px-4 py-3" />

            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Loading events…
                </td>
              </tr>
            )}
            {!loading && rows && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No events yet for this agency.
                </td>
              </tr>
            )}
            {!loading &&
              rows?.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{e.status}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{e.slug}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.public_slug ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.timezone}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {fmt(e.starts_at)} → {fmt(e.ends_at)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmt(e.created_at)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmt(e.updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to="/admin/events/$eventId"
                      params={{ eventId: e.id }}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
