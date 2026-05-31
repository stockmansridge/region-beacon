import { createFileRoute } from "@tanstack/react-router";
import { LiveJoinPage } from "./live.$subdomain.join";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/join")({
  component: JoinCleanRoute,
});

function JoinCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <LiveJoinPage subdomain={subdomain} />;
}
