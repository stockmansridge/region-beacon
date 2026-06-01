import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { resolveCurrentEventPassport, resolveEventIdFromHost } from "@/lib/use-current-event-passport";

export const Route = createFileRoute("/passport/")({
  head: () => ({ meta: [{ title: "My passport" }] }),
  component: PassportIndex,
});

function PassportIndex() {
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "missing" | "found">("loading");
  const [subdomain, setSubdomain] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const eventId = await resolveEventIdFromHost();
      const resolved = await resolveCurrentEventPassport(eventId);
      if (cancelled) return;
      if (resolved.token) {
        navigate({
          to: "/passport/$token",
          params: { token: resolved.token },
          replace: true,
        });
        setState("found");
        return;
      }
      setSubdomain(null);
      setState("missing");
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (state !== "missing") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] text-sm text-[#8A7E66]">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6EFE2] px-6">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[#1F3D2B]/10" />
        <h1 className="font-trail-serif text-2xl font-semibold text-[#1F3D2B]">
          Passport not found on this device
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#3D372C]">
          Your private passport link is the only way back in. Open the link
          you saved when you registered, or re-register at the event page.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {subdomain ? (
            <Link
              to="/"
              className="inline-flex h-11 items-center justify-center rounded-full bg-[#1F3D2B] text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
            >
              Return to event page
            </Link>
          ) : (
            <a
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-full bg-[#1F3D2B] text-sm font-semibold tracking-wide text-[#F6EFE2] shadow"
            >
              Return to home
            </a>
          )}
          <a
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-[#1F3D2B]/30 bg-transparent text-sm font-semibold tracking-wide text-[#1F3D2B]"
          >
            Re-register if you've lost your link
          </a>
        </div>

        <p className="mt-6 text-[11px] uppercase tracking-[0.22em] text-[#8A7E66]">
          No app download required
        </p>
      </div>
    </div>
  );
}
