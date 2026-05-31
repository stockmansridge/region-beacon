import { createFileRoute } from "@tanstack/react-router";
import {
  ExternalLinkOnly,
  LocalLegalPage,
  NotAvailable,
  useLegal,
} from "@/components/public-legal";

export const Route = createFileRoute("/live/$subdomain/terms")({
  component: function TermsRoute() {
    const { subdomain } = Route.useParams();
    return <TermsPage subdomain={subdomain} />;
  },
});

export function TermsPage({ subdomain }: { subdomain: string }) {
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
  const isLocal = row.legal_source === "local_text" && row.terms_body;
  if (isLocal && row.terms_body) {
    return (
      <LocalLegalPage
        subdomain={subdomain}
        eventName={row.event_name}
        title={row.terms_title || "Terms & Conditions"}
        body={row.terms_body}
        version={row.terms_version}
        effectiveAt={row.effective_at}
      />
    );
  }
  if (row.terms_url) {
    return (
      <ExternalLinkOnly
        subdomain={subdomain}
        url={row.terms_url}
        title="Terms & Conditions"
        eventName={row.event_name}
      />
    );
  }
  return <NotAvailable subdomain={subdomain} />;
}
