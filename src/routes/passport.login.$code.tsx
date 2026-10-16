import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { redeemPassportLoginCode } from "@/lib/passport-login.functions";

export const Route = createFileRoute("/passport/login/$code")({
  head: () => ({
    meta: [
      { title: "Logging in to your passport — GetStampd" },
      { name: "description", content: "Opening your GetStampd passport from your emailed login link." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "GetStampd passport login" },
      { property: "og:description", content: "Opening your GetStampd passport." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PassportLoginRoute,
});

function PassportLoginRoute() {
  const { code } = Route.useParams();
  const redeem = useServerFn(redeemPassportLoginCode);
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const res = await redeem({ data: { code } });
        if (res.ok) {
          navigate({ to: "/passport/$token", params: { token: res.token }, replace: true });
          return;
        }
      } catch {
        /* fall through */
      }
      setFailed(true);
    })();
  }, [code, redeem, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      {failed ? (
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold">This login link has expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Login links work once and last 30 minutes. Request a new one from the Join page.
          </p>
          <Link to="/join" className="mt-4 inline-block text-sm font-semibold underline">Go to Join</Link>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Opening your passport…</p>
      )}
    </div>
  );
}
