import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "./live.$subdomain.terms";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms & Conditions" }] }),
  component: TermsCleanRoute,
});

function TermsCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <TermsPage subdomain={subdomain} />;
}
