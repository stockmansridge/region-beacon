import { createFileRoute } from "@tanstack/react-router";
import { PublicOffersPage } from "./live.$subdomain.offers";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/offers")({
  head: () => ({ meta: [{ title: "Offers — GetStampd" }] }),
  component: OffersCleanRoute,
});

function OffersCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <PublicOffersPage subdomain={subdomain} />;
}
