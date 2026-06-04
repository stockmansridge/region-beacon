import { createFileRoute, Link } from "@tanstack/react-router";
import { GetStampdLogo, GetStampdMark } from "@/components/brand";
import {
  Mail,
  LifeBuoy,
  ShieldCheck,
  Sparkles,
  QrCode,
  MapPin,
  Trophy,
  Gift,
  BarChart3,
  Smartphone,
  Palette,
  Users,
  ArrowRight,
} from "lucide-react";
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
          "GetStampd creates branded QR passport trails for tourism regions, festivals and event organisers. Visitors collect stamps, unlock rewards, and explore — no app download required.",
      },
      { property: "og:title", content: "GetStampd — Digital event passports" },
      {
        property: "og:description",
        content:
          "Branded QR passport trails for tourism regions, festivals and event organisers. No app download.",
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

const FEATURES = [
  {
    icon: QrCode,
    title: "QR passport trails",
    body: "Generate branded QR stamps for every venue, stall or checkpoint. Visitors scan to collect — no signup friction.",
  },
  {
    icon: Smartphone,
    title: "No app download",
    body: "Runs in the browser. Visitors open a link, register their passport and start stamping in seconds.",
  },
  {
    icon: MapPin,
    title: "Interactive trail map",
    body: "Apple MapKit-powered map of every venue, with directions, opening hours and rich profiles.",
  },
  {
    icon: Trophy,
    title: "Leaderboards",
    body: "Live, public leaderboards drive friendly competition and repeat visits across your trail.",
  },
  {
    icon: Gift,
    title: "Rewards & prize draws",
    body: "Unlock offers and trigger prize draws at stamp milestones. Configure thresholds per event.",
  },
  {
    icon: BarChart3,
    title: "Realtime analytics",
    body: "See stamp activity, visitor flow and venue performance as it happens.",
  },
  {
    icon: Palette,
    title: "Branded per event",
    body: "Custom colours, logos, posters and copy. Every event feels like your own product.",
  },
  {
    icon: Users,
    title: "Multi-organisation",
    body: "Run multiple events, tenants or regions from one admin with role-based access.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Create your organisation",
    body: "Spin up a tenant in minutes. Pick a subdomain and brand it.",
  },
  {
    n: "02",
    title: "Add venues & stamps",
    body: "Register venues, generate QR posters, set rewards and prize-draw thresholds.",
  },
  {
    n: "03",
    title: "Go live",
    body: "Publish your trail. Visitors scan, collect stamps and climb the leaderboard.",
  },
];

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(900px 460px at 12% 8%, rgba(59,130,246,0.28), transparent 60%), radial-gradient(720px 380px at 88% 92%, rgba(6,182,212,0.18), transparent 60%)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <Link to="/" className="flex items-center">
          <GetStampdLogo variant="blue" size="md" wordmarkClassName="text-white" />
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
          <a href="#features" className="hover:text-white">Features</a>
          <a href="#how-it-works" className="hover:text-white">How it works</a>
          <Link to="/contact" className="hover:text-white">Contact</Link>
          <Link to="/support" className="hover:text-white">Support</Link>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href={authUrl("/signup")}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-100"
          >
            <Sparkles className="h-4 w-4" />
            Get started
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

      {/* HERO */}
      <main className="relative z-10">
        <section className="mx-auto flex max-w-4xl flex-col items-center px-6 pb-16 pt-12 text-center sm:pt-20">
          <GetStampdMark variant="blue" size="lg" className="mb-6" />
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-200">
            Event passport platform
          </span>
          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            Digital passports for real-world experiences
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-slate-300 sm:text-lg">
            GetStampd turns your tourism region, festival or event into a branded
            QR passport trail. Visitors collect stamps, unlock rewards and climb a
            live leaderboard — no app download, no friction.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <a
              href={authUrl("/signup")}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
            >
              <Sparkles className="h-4 w-4" />
              Create your organisation
            </a>
            <a
              href="#features"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white hover:bg-white/10"
            >
              See what's included
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-6 text-xs text-slate-400">
            Trusted by tourism regions and event organisers across Australia.
          </p>
        </section>

        {/* FEATURES */}
        <section id="features" className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Everything you need to run a passport trail
            </h2>
            <p className="mt-4 text-slate-300">
              Branding, QR generation, rewards, analytics and visitor experience — all in one platform.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/30 to-cyan-400/20 text-cyan-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-white">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{f.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Live in three steps
            </h2>
            <p className="mt-4 text-slate-300">
              From signup to first stamp in an afternoon.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
              >
                <div className="text-xs font-mono font-semibold tracking-widest text-cyan-300">
                  {s.n}
                </div>
                <h3 className="mt-3 text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-4xl px-6 py-20">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-blue-600/20 via-slate-900 to-cyan-500/10 p-10 text-center sm:p-14">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Ready to launch your trail?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-slate-300">
              Create your organisation in minutes. No credit card required to start.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={authUrl("/signup")}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-6 text-sm font-semibold text-slate-900 hover:bg-slate-100"
              >
                <Sparkles className="h-4 w-4" />
                Create your organisation
              </a>
              <Link
                to="/contact"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 text-sm font-semibold text-white hover:bg-white/10"
              >
                <Mail className="h-4 w-4" />
                Talk to us
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-xs text-slate-400 sm:flex-row">
          <div className="flex items-center gap-2">
            <GetStampdMark variant="blue" size="sm" />
            <span>© {new Date().getFullYear()} GetStampd. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-5">
            <Link to="/contact" className="hover:text-white">Contact</Link>
            <Link to="/support" className="inline-flex items-center gap-1 hover:text-white">
              <LifeBuoy className="h-3.5 w-3.5" />
              Support
            </Link>
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/terms" className="hover:text-white">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
