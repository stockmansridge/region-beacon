import { createFileRoute } from "@tanstack/react-router";
import { PublicTrailMapPage } from "./live.$subdomain.map";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Map — GetStampd" },
      { name: "description", content: "Explore the interactive map of GetStampd digital stamp trails — find venues, plan your route and collect stamps." },
      { name: "keywords", content: "GetStampd, GetStamped, trail map, stamp trail route, venue map, tourism passport map" },
      { property: "og:title", content: "Map — GetStampd" },
      { property: "og:description", content: "Find venues and explore your event's digital stamp trail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MapCleanRoute,
});

function MapCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <PublicTrailMapPage subdomain={subdomain} />;
}
