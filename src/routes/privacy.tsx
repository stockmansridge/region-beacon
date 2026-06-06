import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "./live.$subdomain.privacy";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { PlatformPrivacyPage } from "@/components/platform-legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "GetStampd Privacy Policy" }] }),
  component: PrivacyCleanRoute,
});

function PrivacyCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (subdomain) return <PrivacyPage subdomain={subdomain} />;
  return <PlatformPrivacyPage />;
}
