import { createFileRoute } from "@tanstack/react-router";
import { FaqPage } from "./live.$subdomain.faq";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ / Info — GetStampd" },
      { name: "description", content: "Answers to common questions about GetStampd digital stamp trails — how visitors collect stamps, redeem rewards, and how organisers run their trail." },
      { property: "og:title", content: "GetStampd FAQ — How digital stamp trails work" },
      { property: "og:description", content: "Common questions about joining a trail, collecting stamps and redeeming rewards on GetStampd." },
      { property: "og:url", content: "https://getstampd.com.au/faq" },
    ],
    links: [{ rel: "canonical", href: "https://getstampd.com.au/faq" }],
  }),
  component: FaqCleanRoute,
});

function FaqCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <FaqPage subdomain={subdomain} />;
}
