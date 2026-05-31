import { createFileRoute } from "@tanstack/react-router";
import { PublicVenueDetailPage } from "./live.$subdomain.venues.$venueId";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/venues/$venueId")({
  head: () => ({ meta: [{ title: "Venue" }] }),
  component: VenueDetailCleanRoute,
});

function VenueDetailCleanRoute() {
  const { venueId } = Route.useParams();
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <PublicVenueDetailPage subdomain={subdomain} venueId={venueId} />;
}
