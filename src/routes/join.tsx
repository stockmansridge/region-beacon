import { createFileRoute } from "@tanstack/react-router";
import { LiveJoinPage } from "./live.$subdomain.join";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "Join a Trail — GetStampd" },
      { name: "description", content: "Join a GetStampd digital stamp trail and start collecting stamps at wineries, markets and events." },
      { name: "keywords", content: "GetStampd, GetStamped, join stamp trail, digital passport, collect stamps, event trail" },
    ],
  }),
  component: JoinCleanRoute,
});

function JoinCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <LiveJoinPage subdomain={subdomain} />;
}
