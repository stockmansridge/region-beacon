import { createFileRoute, Link } from "@tanstack/react-router";
import { GetStampdLogo, GetStampdMark } from "@/components/brand";
import { Mail, LifeBuoy, ShieldCheck, Sparkles } from "lucide-react";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { authUrl } from "@/lib/auth-redirect";
import { LivePublicPage } from "./live.$subdomain.index";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GetStampd — Digital passports for real-world experiences" },
      {
        name: "description",
        content:
          "GetStampd creates branded QR passport trails for tourism regions, festivals and event organisers. No app download required.",
      },
      { property: "og:title", content: "GetStampd" },
      {
        property: "og:description",
        content:
          "Digital passports for real-world experiences. Branded QR trails for tourism regions, festivals and event organisers.",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: IndexRoute,
});

function IndexRoute() {
  const subdomain = useTenantSubdomain();
  if (subdomain) return <LivePublicPage subdomain={subdomain} />;
  return <Landing />;
}


function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* ambient blue glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(800px 400px at 15% 10%, rgba(59,130,246,0.25), transparent 60%), radial-gradient(700px 360px at 85% 90%, rgba(6,182,212,0.18), transparent 60%)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <Link to="/" className="flex items-center">
          <GetStampdLogo variant="blue" size="md" wordmarkClassName="text-white" />
        </Link>
        <div className="flex items-center gap-2">
          <a
            href={authUrl("/signup")}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-100"
          >
            <Sparkles className="h-4 w-4" />
            Create organisation
          </a>
          <a
            href={authUrl("/admin/login")}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 text-sm font-medium text-white hover:bg-white/10"
          >
            <ShieldCheck className="h-4 w-4" />
            Admin login
          </a>
        </div>

      </header>

      <main className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 pb-24 pt-16 text-center sm:pt-28">
        <GetStampdMark variant="blue" size="lg" className="mb-6" />

        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-200">
          Coming soon
        </span>

        <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          GetStampd
        </h1>

        <p className="mt-4 max-w-xl text-pretty text-base leading-relaxed text-slate-300 sm:text-lg">
          Digital passports for real-world experiences. Branded QR trails for
          tourism regions, festivals and event organisers — no app download.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <a
            href={authUrl("/signup")}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
          >
            <Sparkles className="h-4 w-4" />
            Create your organisation
          </a>

          <Link
            to="/contact"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            <Mail className="h-4 w-4" />
            Contact us
          </Link>
          <Link
            to="/support"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            <LifeBuoy className="h-4 w-4" />
            Support
          </Link>
        </div>

        <p className="mt-12 text-xs uppercase tracking-[0.22em] text-slate-500">
          getstampd.com.au
        </p>
      </main>

      <footer className="relative z-10 border-t border-white/5 px-6 py-6 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} GetStampd. All rights reserved.
      </footer>
    </div>
  );
}
