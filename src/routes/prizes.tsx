import { createFileRoute } from "@tanstack/react-router";
import { AwardsPage } from "./live.$subdomain.awards";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/awards")({
  head: () => ({
    meta: [
      { title: "Prizes — GetStampd" },
      { name: "description", content: "View prizes and prize draws on GetStampd digital stamp trails — check in at venues to earn points and unlock prizes." },
      { name: "keywords", content: "GetStampd, GetStamped, stamp trail prizes, prize draws, tourism recognition" },
    ],
  }),
  component: AwardsCleanRoute,
});

function AwardsCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <AwardsPage subdomain={subdomain} />;
}
