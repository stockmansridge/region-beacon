import { createFileRoute } from "@tanstack/react-router";
import { PublicVenuesListPage } from "./live.$subdomain.venues";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/venues")({
  head: () => ({ meta: [{ title: "Venues" }] }),
  component: VenuesCleanRoute,
});

function VenuesCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <PublicVenuesListPage subdomain={subdomain} />;
}
