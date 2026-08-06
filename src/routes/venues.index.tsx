import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PublicVenuesListPage } from "./live.$subdomain.venues.index";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";
import { parseVenueSort } from "@/lib/venue-sort";

export const Route = createFileRoute("/venues/")({
  head: () => ({
    meta: [
      { title: "Venues — GetStampd" },
      { name: "description", content: "Browse participating venues on GetStampd digital stamp trails — wineries, markets, tourism stops and event partners across the region." },
      { name: "keywords", content: "GetStampd, GetStamped, stamp trail venues, wineries, markets, tourism stops, event partners" },
      { property: "og:title", content: "Venues on GetStampd stamp trails" },
      { property: "og:description", content: "Discover venues taking part in GetStampd digital stamp trails." },
      { property: "og:url", content: "https://getstampd.com.au/venues" },
    ],
    links: [{ rel: "canonical", href: "https://getstampd.com.au/venues" }],
  }),
  // Display-only sort state (see src/lib/venue-sort.ts).
  validateSearch: (search: Record<string, unknown>): { sort?: string } => ({
    sort: typeof search.sort === "string" ? search.sort : undefined,
  }),
  component: VenuesCleanRoute,
});

function VenuesCleanRoute() {
  const subdomain = useTenantSubdomain();
  const { sort } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  if (!subdomain) return <NonTenantNotice />;
  return (
    <PublicVenuesListPage
      subdomain={subdomain}
      sort={parseVenueSort(sort)}
      onSortChange={(next) => navigate({ search: { sort: next } })}
    />
  );
}
