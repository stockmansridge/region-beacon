import { createFileRoute } from "@tanstack/react-router";
import { AwardsPage } from "./live.$subdomain.awards";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/awards")({
  head: () => ({
    meta: [
      { title: "Awards — GetStampd" },
      { name: "description", content: "View awards and achievements on GetStampd digital stamp trails — badges, milestones and recognition for top participants." },
      { name: "keywords", content: "GetStampd, GetStamped, stamp trail awards, badges, achievements, tourism recognition" },
    ],
  }),
  component: AwardsCleanRoute,
});

function AwardsCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <AwardsPage subdomain={subdomain} />;
}
