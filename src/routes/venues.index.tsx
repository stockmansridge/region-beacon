import { createFileRoute } from "@tanstack/react-router";
import { PublicVenuesListPage } from "./live.$subdomain.venues.index";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/venues/")({
  head: () => ({
    meta: [
      { title: "Venues — GetStampd" },
      { name: "description", content: "Browse participating venues on GetStampd digital stamp trails — wineries, markets, tourism stops and event partners across the region." },
      { property: "og:title", content: "Venues on GetStampd stamp trails" },
      { property: "og:description", content: "Discover venues taking part in GetStampd digital stamp trails." },
      { property: "og:url", content: "https://getstampd.com.au/venues" },
    ],
    links: [{ rel: "canonical", href: "https://getstampd.com.au/venues" }],
  }),
  component: VenuesCleanRoute,
});

function VenuesCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <PublicVenuesListPage subdomain={subdomain} />;
}
