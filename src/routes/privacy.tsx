import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "./live.$subdomain.privacy";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { PlatformPrivacyPage } from "@/components/platform-legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — GetStampd" },
      { name: "description", content: "How GetStampd collects, uses and protects personal information from organisers and trail visitors across our digital stamp platform." },
      { name: "keywords", content: "GetStampd, GetStamped, privacy policy, digital stamp trail data protection" },
      { property: "og:title", content: "GetStampd Privacy Policy" },
      { property: "og:description", content: "Read how GetStampd handles personal data, cookies and visitor information." },
      { property: "og:url", content: "https://getstampd.com.au/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://getstampd.com.au/privacy" }],
  }),
  component: PrivacyCleanRoute,
});

function PrivacyCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (subdomain) return <PrivacyPage subdomain={subdomain} />;
  return <PlatformPrivacyPage />;
}
