import { createFileRoute } from "@tanstack/react-router";
import { PoweredByGetStampd } from "@/components/brand";
import { HostDiagnostic } from "@/components/host-diagnostic";

export const Route = createFileRoute("/workspace-not-found")({
  head: () => ({
    meta: [
      { title: "Workspace not found — GetStampd" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WorkspaceNotFound,
});

function WorkspaceNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] px-6">
      <div className="mx-auto max-w-md rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[#1F3D2B]/10" />
        <h1 className="font-trail-serif text-2xl font-semibold text-[#1F3D2B]">
          Workspace not found
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#3D372C]">
          We couldn't find a GetStampd workspace at this address. If you
          followed a link from an organiser, double-check the spelling — or
          ask them for the latest address.
        </p>
        <div className="mt-6 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>
      </div>
      <HostDiagnostic reason="No matching agency or event_domain for hostname" />
    </div>
  );
}
