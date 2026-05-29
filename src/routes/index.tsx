import { createFileRoute, Link } from "@tanstack/react-router";
import {
  QrCode,
  MapPin,
  Trophy,
  BarChart3,
  Palette,
  Smartphone,
  Rocket,
  Globe,
  Eye,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Easy Passport — White-label digital event passports" },
      {
        name: "description",
        content:
          "Create white-label digital event passports with QR venue check-ins, rewards and analytics. No app download required. Built for tourism organisations, event organisers and destination groups.",
      },
      { property: "og:title", content: "Easy Passport" },
      {
        property: "og:description",
        content:
          "Create white-label digital event passports with QR check-ins, rewards and CSV exports. No app required.",
      },
    ],
  }),
  component: MarketingHome,
});

const features = [
  {
    icon: Palette,
    title: "Fully white-label",
    desc: "Your event brand on every screen — colours, logo, copy and terms.",
  },
  {
    icon: QrCode,
    title: "QR venue check-ins",
    desc: "Each venue gets a unique signed QR. Visitors scan and check in instantly.",
  },
  {
    icon: Smartphone,
    title: "No app required",
    desc: "Runs in any modern mobile browser. No App Store friction.",
  },
  {
    icon: MapPin,
    title: "Venue trails",
    desc: "Curate stops across the region with maps, descriptions and offers.",
  },
  {
    icon: Trophy,
    title: "Rewards & prize draws",
    desc: "Reward visitors for completing trails. Auto-enter qualifying passports into draws.",
  },
  {
    icon: BarChart3,
    title: "Analytics & CSV exports",
    desc: "Track participation, check-in patterns and venue performance. Export anytime.",
  },
];

const steps = [
  {
    icon: Rocket,
    title: "Create your event passport",
    desc: "Set up your event, branding and terms in minutes.",
  },
  {
    icon: MapPin,
    title: "Add venues",
    desc: "Curate stops, descriptions and offers for each location.",
  },
  {
    icon: Globe,
    title: "Reserve a subdomain",
    desc: "Claim a custom address so visitors find you instantly.",
  },
  {
    icon: Eye,
    title: "Preview the landing page",
    desc: "See exactly what visitors will experience before going live.",
  },
  {
    icon: Zap,
    title: "Activate when ready",
    desc: "Launch your campaign and start collecting real-time data.",
  },
  {
    icon: Smartphone,
    title: "No app download required",
    desc: "Visitors scan, check in and track progress in their browser.",
  },
];

const audiences = [
  "Tourism organisations",
  "Event organisers",
  "Marketing agencies",
  "Wine regions",
  "Food & drink festivals",
  "Destination & visitor groups",
];

function MarketingHome() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-hero-gradient" />
            <div className="text-sm font-semibold">Easy Passport</div>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              to="/"
              className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-foreground sm:inline-flex"
            >
              Product
            </Link>
            <Link
              to="/demo"
              className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Demo
            </Link>
            <Link
              to="/contact"
              className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Contact
            </Link>
            <Link
              to="/support"
              className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Support
            </Link>
            <Link
              to="/admin/login"
              className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted"
            >
              Admin login
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 py-20 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="inline-flex rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                White-label · QR check-ins · No app required
              </span>
              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                Launch digital event passports in minutes.
              </h1>
              <p className="mt-5 max-w-xl text-base text-muted-foreground">
                Easy Passport lets tourism organisations, event organisers and destination
                groups create branded digital passports with QR venue check-ins, rewards and
                real-time analytics — no app download, no friction.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/signup"
                  className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                >
                  Start building
                </Link>
                <Link
                  to="/demo"
                  className="inline-flex h-11 items-center rounded-full border bg-card px-6 text-sm font-semibold hover:bg-muted"
                >
                  See the visitor experience
                </Link>
                <Link
                  to="/admin/login"
                  className="inline-flex h-11 items-center rounded-full border bg-background px-6 text-sm font-semibold hover:bg-muted"
                >
                  Admin login
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 rounded-3xl bg-hero-gradient opacity-20 blur-3xl" />
              <div className="relative rounded-3xl border bg-card p-6 shadow-lg">
                <div className="rounded-2xl bg-hero-gradient p-5 text-primary-foreground">
                  <div className="text-xs font-medium opacity-80">Summer Wine Trail</div>
                  <div className="mt-1 text-lg font-semibold">3 of 6 stops complete</div>
                  <div className="mt-3 h-2 rounded-full bg-white/30">
                    <div className="h-2 w-1/2 rounded-full bg-white" />
                  </div>
                </div>
                <ul className="mt-4 space-y-2 text-sm">
                  {["Vineyard No. 1", "Harbour Cellar", "Stone Mill Tasting Room"].map((v) => (
                    <li
                      key={v}
                      className="flex items-center justify-between rounded-xl border bg-background px-3 py-2"
                    >
                      <span>{v}</span>
                      <span className="text-xs text-muted-foreground">Checked in</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">Built for live events</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Everything you need to launch a branded passport campaign — and the data to
            prove it worked.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border bg-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Set up your event passport from start to finish — no technical team required.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border bg-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="text-3xl font-semibold tracking-tight">Who it is for</h2>
          <div className="mt-8 flex flex-wrap gap-2">
            {audiences.map((a) => (
              <span
                key={a}
                className="rounded-full border bg-card px-4 py-2 text-sm font-medium"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="rounded-3xl border bg-card p-8 sm:p-12">
            <h2 className="text-3xl font-semibold tracking-tight">Try the visitor demo</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Walk through what a visitor sees — landing, join, passport tracker and a sample
              check-in screen. No real data is created.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/demo"
                className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
              >
                Open visitor demo
              </Link>
              <Link
                to="/admin/login"
                className="inline-flex h-11 items-center rounded-full border bg-background px-6 text-sm font-semibold hover:bg-muted"
              >
                Admin login
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Ready to launch your passport?</h2>
          <p className="mt-3 text-muted-foreground">
            Start building today. Self-service signup is opening soon — existing customers can sign in now.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/signup"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
            >
              Start building
            </Link>
            <Link
              to="/contact"
              className="inline-flex h-12 items-center gap-2 rounded-full border bg-card px-8 text-sm font-semibold hover:bg-muted"
            >
              Contact us
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-xs text-muted-foreground sm:flex-row">
          <div>© {new Date().getFullYear()} Easy Passport. All rights reserved.</div>
          <div className="flex gap-4">
            <Link to="/" className="hover:text-foreground">
              Product
            </Link>
            <Link to="/demo" className="hover:text-foreground">
              Demo
            </Link>
            <Link to="/contact" className="hover:text-foreground">
              Contact
            </Link>
            <Link to="/support" className="hover:text-foreground">
              Support
            </Link>
            <Link to="/admin/login" className="hover:text-foreground">
              Admin login
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/*
 * Future hosting plan (not implemented in Lovable preview):
 *   - easypassport.com.au         → this marketing site (route /)
 *   - demo.easypassport.com.au    → /demo experience
 *   - {event}.easypassport.com.au → tenant-specific event public site
 *     (resolved at edge by event_domain / public_slug)
 * For now, /demo is the canonical fallback for the visitor experience.
 */
