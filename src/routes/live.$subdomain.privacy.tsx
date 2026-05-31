import { createFileRoute } from "@tanstack/react-router";
import {
  ExternalLinkOnly,
  LocalLegalPage,
  NotAvailable,
  useLegal,
} from "@/components/public-legal";

export const Route = createFileRoute("/live/$subdomain/privacy")({
  component: function PrivacyRoute() {
    const { subdomain } = Route.useParams();
    return <PrivacyPage subdomain={subdomain} />;
  },
});

export function PrivacyPage({ subdomain }: { subdomain: string }) {
  const state = useLegal(subdomain);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] text-sm text-[#8A7E66]">
        Loading…
      </div>
    );
  }
  if (state.kind === "not_found") return <NotAvailable subdomain={subdomain} />;

  const { row } = state;
  const isLocal = row.legal_source === "local_text" && row.privacy_body;
  if (isLocal && row.privacy_body) {
    return (
      <LocalLegalPage
        subdomain={subdomain}
        eventName={row.event_name}
        title={row.privacy_title || "Privacy Policy"}
        body={row.privacy_body}
        version={row.privacy_version}
        effectiveAt={row.effective_at}
      />
    );
  }
  if (row.privacy_url) {
    return (
      <ExternalLinkOnly
        subdomain={subdomain}
        url={row.privacy_url}
        title="Privacy Policy"
        eventName={row.event_name}
      />
    );
  }
  return <NotAvailable subdomain={subdomain} />;
}
