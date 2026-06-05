import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "./live.$subdomain.privacy";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — GetStampd" }] }),
  component: PrivacyCleanRoute,
});

function PrivacyCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <PrivacyPage subdomain={subdomain} />;
}
