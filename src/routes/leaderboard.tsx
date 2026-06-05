import { createFileRoute } from "@tanstack/react-router";
import { PublicLeaderboardPage } from "./live.$subdomain.leaderboard";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — GetStampd" }] }),
  component: LeaderboardCleanRoute,
});

function LeaderboardCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <PublicLeaderboardPage subdomain={subdomain} />;
}
