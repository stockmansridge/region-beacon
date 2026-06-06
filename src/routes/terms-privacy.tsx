import { createFileRoute } from "@tanstack/react-router";
import { CombinedLegalPage } from "@/components/public-legal";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/terms-privacy")({
  head: () => ({ meta: [{ title: "Terms & Privacy — GetStampd" }] }),
  component: TermsPrivacyCleanRoute,
});

function TermsPrivacyCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <CombinedLegalPage subdomain={subdomain} />;
}
