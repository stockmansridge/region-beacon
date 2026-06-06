import { createFileRoute } from "@tanstack/react-router";
import { AwardsPage } from "./live.$subdomain.awards";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/awards")({
  head: () => ({ meta: [{ title: "Awards — GetStampd" }] }),
  component: AwardsCleanRoute,
});

function AwardsCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <AwardsPage subdomain={subdomain} />;
}
