import { createFileRoute } from "@tanstack/react-router";
import { FaqPage } from "./live.$subdomain.faq";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/faq")({
  head: () => ({ meta: [{ title: "FAQ / Info — GetStampd" }] }),
  component: FaqCleanRoute,
});

function FaqCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <FaqPage subdomain={subdomain} />;
}
