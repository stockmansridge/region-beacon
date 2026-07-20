import { createFileRoute } from "@tanstack/react-router";
import { AwardsPage } from "./live.$subdomain.prizes";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";

const searchSchema = z.object({
  tab: fallback(z.string(), "prizes").default("prizes"),
});

export const Route = createFileRoute("/prizes")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Prizes — GetStampd" },
      { name: "description", content: "View prizes and prize draws on GetStampd digital stamp trails — check in at venues to earn points and unlock prizes." },
      { name: "keywords", content: "GetStampd, GetStamped, stamp trail prizes, prize draws, tourism recognition" },
    ],
  }),
  component: PrizesCleanRoute,
});

function PrizesCleanRoute() {
  const subdomain = useTenantSubdomain();
  const { tab } = Route.useSearch();
  if (!subdomain) return <NonTenantNotice />;
  return <AwardsPage subdomain={subdomain} initialTab={tab === "bonus" ? "bonus" : "prizes"} />;
}
