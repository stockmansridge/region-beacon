import { createFileRoute } from "@tanstack/react-router";
import { PublicBookmarksPage } from "./live.$subdomain.bookmarks";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { NonTenantNotice } from "@/components/non-tenant-notice";

export const Route = createFileRoute("/bookmarks")({
  head: () => ({
    meta: [
      { title: "My Bookmarks — GetStampd" },
      {
        name: "description",
        content: "The venues and offers you saved for later on your GetStampd passport.",
      },
      { property: "og:title", content: "My Bookmarks — GetStampd" },
      {
        property: "og:description",
        content: "The venues and offers you saved for later on your GetStampd passport.",
      },
    ],
  }),
  component: BookmarksCleanRoute,
});

function BookmarksCleanRoute() {
  const subdomain = useTenantSubdomain();
  if (!subdomain) return <NonTenantNotice />;
  return <PublicBookmarksPage subdomain={subdomain} />;
}
