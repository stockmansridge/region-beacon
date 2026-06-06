import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "./live.$subdomain.terms";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { PlatformTermsPage } from "@/components/platform-legal";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "GetStampd Terms and Conditions" }] }),
  component: TermsCleanRoute,
});

function TermsCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (subdomain) return <TermsPage subdomain={subdomain} />;
  return <PlatformTermsPage />;
}
