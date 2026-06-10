import { createFileRoute } from "@tanstack/react-router";
import { PublicLeaderboardPage } from "./live.$subdomain.leaderboard";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — GetStampd" },
      { name: "description", content: "See top stamp collectors on GetStampd digital trails — live leaderboards for tourism trails, wine regions, markets and events." },
      { name: "keywords", content: "GetStampd, GetStamped, stamp trail leaderboard, top collectors, tourism rankings" },
      { property: "og:title", content: "Stamp trail leaderboard — GetStampd" },
      { property: "og:description", content: "Live rankings of top stamp collectors on GetStampd trails." },
      { property: "og:url", content: "https://getstampd.com.au/leaderboard" },
    ],
    links: [{ rel: "canonical", href: "https://getstampd.com.au/leaderboard" }],
  }),
  component: LeaderboardCleanRoute,
});

function LeaderboardCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <PublicLeaderboardPage subdomain={subdomain} />;
}
