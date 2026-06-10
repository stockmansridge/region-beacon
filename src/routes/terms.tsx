import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "./live.$subdomain.terms";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { PlatformTermsPage } from "@/components/platform-legal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — GetStampd" },
      { name: "description", content: "The terms governing use of the GetStampd platform by organisers running digital stamp trails and the visitors who join them." },
      { name: "keywords", content: "GetStampd, GetStamped, terms and conditions, digital stamp trail platform" },
      { property: "og:title", content: "GetStampd Terms & Conditions" },
      { property: "og:description", content: "Terms for using the GetStampd digital stamp trail platform." },
      { property: "og:url", content: "https://getstampd.com.au/terms" },
    ],
    links: [{ rel: "canonical", href: "https://getstampd.com.au/terms" }],
  }),
  component: TermsCleanRoute,
});

function TermsCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (subdomain) return <TermsPage subdomain={subdomain} />;
  return <PlatformTermsPage />;
}
