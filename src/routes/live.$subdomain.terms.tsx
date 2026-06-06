import { createFileRoute } from "@tanstack/react-router";
import { CombinedLegalPage } from "@/components/public-legal";

export const Route = createFileRoute("/live/$subdomain/terms")({
  component: function TermsRoute() {
    const { subdomain } = Route.useParams();
    return <CombinedLegalPage subdomain={subdomain} initialOpen="terms" />;
  },
});

export function TermsPage({ subdomain }: { subdomain: string }) {
  return <CombinedLegalPage subdomain={subdomain} initialOpen="terms" />;
}
