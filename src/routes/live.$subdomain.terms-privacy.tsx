import { createFileRoute } from "@tanstack/react-router";
import { CombinedLegalPage } from "@/components/public-legal";

export const Route = createFileRoute("/live/$subdomain/terms-privacy")({
  component: function TermsPrivacyRoute() {
    const { subdomain } = Route.useParams();
    return <CombinedLegalPage subdomain={subdomain} />;
  },
});
