import { createFileRoute } from "@tanstack/react-router";
import { PublicTrailMapPage } from "./live.$subdomain.map";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/map")({
  head: () => ({ meta: [{ title: "Trail Map" }] }),
  component: MapCleanRoute,
});

function MapCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <PublicTrailMapPage subdomain={subdomain} />;
}
