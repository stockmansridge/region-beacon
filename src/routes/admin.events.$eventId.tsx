import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PlaceholderCard } from "@/components/placeholder";

export const Route = createFileRoute("/admin/events/$eventId")({
  head: () => ({ meta: [{ title: "Event setup" }] }),
  component: EventSetup,
});

function EventSetup() {
  const { eventId } = Route.useParams();
  return (
    <>
      <PageHeader
        title={eventId === "new" ? "New event" : "Event setup"}
        description="Configure branding, dates and trail details for this passport."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border bg-card p-6">
            <h3 className="text-sm font-semibold">Basics</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[
                { label: "Event name", placeholder: "Summer Wine Trail" },
                { label: "Slug", placeholder: "summer-wine-trail" },
                { label: "Start date", placeholder: "2026-06-01" },
                { label: "End date", placeholder: "2026-08-31" },
              ].map((f) => (
                <div key={f.label} className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                  <input className="h-10 w-full rounded-lg border bg-background px-3 text-sm" placeholder={f.placeholder} />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-6">
            <h3 className="text-sm font-semibold">White-label branding</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Logo</label>
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                  Upload logo
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Hero image</label>
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                  Upload hero
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Primary colour</label>
                <input className="h-10 w-full rounded-lg border bg-background px-3 text-sm" placeholder="#5b5bd6" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Accent colour</label>
                <input className="h-10 w-full rounded-lg border bg-background px-3 text-sm" placeholder="#a3e3ff" />
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <PlaceholderCard title="Live preview">Visitor-facing preview will render here once branding is saved.</PlaceholderCard>
          <PlaceholderCard title="Publish">Publish controls and visitor URL will appear here.</PlaceholderCard>
        </aside>
      </div>
    </>
  );
}
