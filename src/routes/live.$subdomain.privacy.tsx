import { createFileRoute } from "@tanstack/react-router";
import { CombinedLegalPage } from "@/components/public-legal";

export const Route = createFileRoute("/live/$subdomain/privacy")({
  component: function PrivacyRoute() {
    const { subdomain } = Route.useParams();
    return <CombinedLegalPage subdomain={subdomain} initialOpen="privacy" />;
  },
});

export function PrivacyPage({ subdomain }: { subdomain: string }) {
  return <CombinedLegalPage subdomain={subdomain} initialOpen="privacy" />;
}
