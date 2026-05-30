import { createFileRoute, Link } from "@tanstack/react-router";
import {
  MapPin,
  Stamp,
  Smartphone,
  Sparkles,
  Wine,
  UtensilsCrossed,
  Compass,
  ShoppingBag,
  Mic2,
  MoreHorizontal,
  Rocket,
  QrCode,
  Trophy,
  Users,
  Building2,
  CheckCircle2,
  ArrowRight,
  BarChart3,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GetStampd — Digital event passports for tourism & festivals" },
      {
        name: "description",
        content:
          "GetStampd helps tourism regions, festivals and event organisers launch branded QR passport experiences — no app download required.",
      },
      { property: "og:title", content: "GetStampd — Digital event passports" },
      {
        property: "og:description",
        content:
          "Launch branded QR passport experiences for tourism regions, festivals and events. No app download.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: MarketingHome,
});

function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center ${className}`}>
      <GetStampdLogo variant="blue" size="md" />
    </Link>
  );
}


function MarketingHome() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {[
              { label: "Product", href: "#product" },
              { label: "Use cases", href: "#use-cases" },
              { label: "Pricing", href: "#pricing" },
              { label: "Resources", href: "#resources" },
            ].map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/admin/login"
              className="hidden h-9 items-center rounded-md px-3 text-sm font-medium text-slate-700 hover:text-slate-900 sm:inline-flex"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              Create event passport
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* soft background */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-br from-blue-200/40 via-cyan-200/30 to-transparent blur-3xl" />
          <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-amber-200/30 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.035]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgb(15 23 42) 1px, transparent 0)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>

        <div className="mx-auto max-w-7xl px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:pb-24 lg:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                <Sparkles className="h-3.5 w-3.5" />
                White-label · QR check-ins · No app required
              </span>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Create digital event passports{" "}
                <span className="bg-gradient-to-r from-[#1e3a8a] via-[#2563eb] to-[#06b6d4] bg-clip-text text-transparent">
                  people remember.
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                GetStampd helps tourism regions, festivals and event organisers
                launch branded QR passport experiences without requiring an app
                download.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/signup"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] px-6 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition-opacity hover:opacity-90"
                >
                  Create your first passport
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/demo"
                  className="inline-flex h-12 items-center rounded-full border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                >
                  View demo
                </Link>
              </div>
              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                {["No app download", "Instant access", "Unlock rewards"].map(
                  (t) => (
                    <li key={t} className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      {t}
                    </li>
                  ),
                )}
              </ul>
            </div>

            {/* Hero visual: phone mockup */}
            <div className="relative mx-auto w-full max-w-md">
              <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-blue-500/20 via-cyan-400/10 to-transparent blur-2xl" />
              <PhoneMockup />
            </div>
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section id="use-cases" className="border-t border-slate-100 bg-slate-50/60">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                Use cases
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Built for the places people travel for.
              </h2>
            </div>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { icon: Wine, label: "Wine Trails", tint: "from-rose-50 to-rose-100 text-rose-600" },
              { icon: UtensilsCrossed, label: "Food Festivals", tint: "from-amber-50 to-amber-100 text-amber-600" },
              { icon: Compass, label: "Tourism Campaigns", tint: "from-cyan-50 to-cyan-100 text-cyan-600" },
              { icon: ShoppingBag, label: "Markets", tint: "from-emerald-50 to-emerald-100 text-emerald-600" },
              { icon: Mic2, label: "Conferences & Events", tint: "from-violet-50 to-violet-100 text-violet-600" },
              { icon: MoreHorizontal, label: "More", tint: "from-slate-50 to-slate-100 text-slate-600" },
            ].map(({ icon: Icon, label, tint }) => (
              <div
                key={label}
                className="group rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${tint}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-900">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="product" className="border-t border-slate-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
              How it works
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Launch a branded passport in an afternoon.
            </h2>
            <p className="mt-3 text-slate-600">
              From setup to live trail in a few simple steps — no developers, no
              app store reviews.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Rocket,
                step: "01",
                title: "Create your passport",
                desc: "Brand it, add venues, set rewards. Done in minutes.",
              },
              {
                icon: QrCode,
                step: "02",
                title: "Visitors join instantly",
                desc: "Scan a QR or open a link — straight into the browser.",
              },
              {
                icon: Stamp,
                step: "03",
                title: "They collect stamps",
                desc: "Each venue scan stamps the passport in real time.",
              },
              {
                icon: Trophy,
                step: "04",
                title: "Complete & unlock rewards",
                desc: "Auto-enter prize draws or redeem offers on completion.",
              },
            ].map(({ icon: Icon, step, title, desc }) => (
              <div
                key={title}
                className="relative rounded-2xl border border-slate-100 bg-gradient-to-b from-white to-slate-50/50 p-6 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#1e3a8a] to-[#2563eb] text-white shadow-sm">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold tracking-widest text-slate-300">
                    {step}
                  </span>
                </div>
                <h3 className="mt-5 text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DASHBOARD PREVIEW */}
      <section className="border-t border-slate-100 bg-gradient-to-b from-slate-50/60 to-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                Admin dashboard
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Real-time insight into every passport.
              </h2>
              <p className="mt-3 max-w-lg text-slate-600">
                Track participants, stamps collected, venue performance and
                completions. Export CSV anytime for sponsors and partners.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {[
                  "Live check-in analytics by venue and hour",
                  "Per-venue conversion and dwell metrics",
                  "Privacy-safe leaderboard and prize-draw export",
                  "Role-based access for staff and venues",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-500" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <DashboardMockup />
          </div>
        </div>
      </section>

      {/* EVENT PREVIEW CARD */}
      <section className="border-t border-slate-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <EventPreviewCard />
            <div className="order-first lg:order-last">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                Visitor experience
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                A landing page your visitors will actually use.
              </h2>
              <p className="mt-3 max-w-lg text-slate-600">
                Each event gets a polished public page — branded hero, venue
                list, map and one-tap join. Visitors are inside the trail in
                seconds.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/demo"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  Open visitor demo
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="pricing" className="border-t border-slate-100">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b1f4d] via-[#1e3a8a] to-[#2563eb] p-10 text-white sm:p-14">
            <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-amber-300/15 blur-3xl" />
            <div className="relative max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Ready to launch your passport?
              </h2>
              <p className="mt-3 text-white/80">
                Self-service signup is opening soon — get in touch and we'll set
                up your first event with you.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to="/signup"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#1e3a8a] shadow-sm hover:bg-slate-50"
                >
                  Create your first passport
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex h-12 items-center rounded-full border border-white/30 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur hover:bg-white/20"
                >
                  Talk to us
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BRAND FOOTER */}
      <footer id="resources" className="border-t border-slate-100 bg-slate-50/60">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-3">
            <div>
              <Logo />
              <p className="mt-4 max-w-sm text-sm text-slate-600">
                Digital passports for real-world experiences.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  { c: "#0b1f4d", n: "Navy" },
                  { c: "#2563eb", n: "Blue" },
                  { c: "#06b6d4", n: "Teal" },
                  { c: "#f97316", n: "Coral" },
                  { c: "#f59e0b", n: "Gold" },
                  { c: "#f8fafc", n: "Soft" },
                ].map((s) => (
                  <span
                    key={s.n}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600"
                  >
                    <span
                      className="h-3 w-3 rounded-full ring-1 ring-slate-200"
                      style={{ background: s.c }}
                    />
                    {s.n}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-8 lg:col-span-2 lg:grid-cols-3">
              <FooterCol title="Product" links={[
                { label: "Demo", to: "/demo" },
                { label: "Signup", to: "/signup" },
                { label: "Admin login", to: "/admin/login" },
              ]} />
              <FooterCol title="Company" links={[
                { label: "Contact", to: "/contact" },
                { label: "Support", to: "/support" },
              ]} />
              <FooterCol title="Resources" links={[
                { label: "Use cases", to: "/" },
                { label: "Pricing", to: "/" },
              ]} />
            </div>
          </div>
          <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-slate-200/70 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center">
            <div>© {new Date().getFullYear()} GetStampd. All rights reserved.</div>
            <div>getstamped.com.au</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; to: string }[];
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.label}>
            <Link to={l.to} className="text-slate-700 hover:text-slate-900">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PhoneMockup() {
  const stamps = [true, true, true, true, false, false];
  return (
    <div className="relative mx-auto h-[600px] w-[300px] rounded-[2.75rem] border border-slate-200 bg-slate-900 p-3 shadow-2xl shadow-blue-900/20">
      <div className="absolute left-1/2 top-3 z-10 h-6 w-28 -translate-x-1/2 rounded-full bg-slate-900" />
      <div className="relative h-full w-full overflow-hidden rounded-[2.25rem] bg-white">
        {/* Header */}
        <div className="relative h-44 bg-gradient-to-br from-[#0b1f4d] via-[#1e3a8a] to-[#06b6d4] px-5 pt-10 text-white">
          <div className="flex items-center justify-between text-[10px] opacity-80">
            <span>9:41</span>
            <span>●●● 5G</span>
          </div>
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-widest opacity-80">Live trail</div>
            <div className="mt-1 text-lg font-semibold leading-tight">
              Coastal Wine Trail
            </div>
            <div className="mt-1 text-[11px] opacity-80">4 of 6 stamps collected</div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-white/25">
              <div className="h-1.5 w-2/3 rounded-full bg-white" />
            </div>
          </div>
        </div>
        {/* Stamps */}
        <div className="px-5 pt-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-900">Your stamps</div>
            <div className="text-[10px] text-slate-500">4 / 6</div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {stamps.map((on, i) => (
              <div
                key={i}
                className={`flex aspect-square items-center justify-center rounded-full border-2 ${
                  on
                    ? "border-blue-500 bg-blue-50 text-blue-600"
                    : "border-dashed border-slate-200 bg-slate-50 text-slate-300"
                }`}
              >
                {on ? (
                  <Stamp className="h-6 w-6" strokeWidth={2.25} />
                ) : (
                  <span className="text-xs font-medium">{i + 1}</span>
                )}
              </div>
            ))}
          </div>
          <button className="mt-5 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] text-xs font-semibold text-white shadow-sm">
            View venues
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Bottom nav */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-around border-t border-slate-100 bg-white px-4 py-3">
          {[Stamp, MapPin, Trophy, Smartphone].map((Icon, i) => (
            <div
              key={i}
              className={`flex flex-col items-center gap-0.5 text-[9px] ${
                i === 0 ? "text-blue-600" : "text-slate-400"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{["Trail", "Venues", "Rewards", "More"][i]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DashboardMockup() {
  const stats = [
    { label: "Participants", value: "1,284", icon: Users, tint: "text-blue-600 bg-blue-50" },
    { label: "Stamps", value: "5,742", icon: Stamp, tint: "text-cyan-600 bg-cyan-50" },
    { label: "Venues", value: "24", icon: Building2, tint: "text-emerald-600 bg-emerald-50" },
    { label: "Completions", value: "318", icon: Trophy, tint: "text-amber-600 bg-amber-50" },
  ];
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-blue-200/40 to-cyan-200/30 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <BarChart3 className="h-4 w-4 text-blue-600" />
            Coastal Wine Trail · Overview
          </div>
          <div className="flex gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map(({ label, value, icon: Icon, tint }) => (
              <div
                key={label}
                className="rounded-xl border border-slate-100 bg-white p-3"
              >
                <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${tint}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
                <div className="text-[11px] text-slate-500">{label}</div>
              </div>
            ))}
          </div>
          {/* Chart placeholder */}
          <div className="mt-4 rounded-xl border border-slate-100 bg-gradient-to-b from-white to-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">Check-ins · last 14 days</span>
              <span>+18.4%</span>
            </div>
            <svg viewBox="0 0 300 90" className="h-24 w-full">
              <defs>
                <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,70 L25,60 L50,65 L75,45 L100,52 L125,38 L150,42 L175,28 L200,34 L225,22 L250,30 L275,15 L300,20 L300,90 L0,90 Z"
                fill="url(#g)"
              />
              <path
                d="M0,70 L25,60 L50,65 L75,45 L100,52 L125,38 L150,42 L175,28 L200,34 L225,22 L250,30 L275,15 L300,20"
                fill="none"
                stroke="#2563eb"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          {/* Top venues */}
          <div className="mt-4 rounded-xl border border-slate-100 bg-white">
            <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700">
              Top venues
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              {[
                ["Harbour Cellar", 842],
                ["Vineyard No. 1", 716],
                ["Stone Mill Tasting Room", 503],
              ].map(([name, v]) => (
                <li key={name as string} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2 text-slate-800">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                      <MapPin className="h-3.5 w-3.5" />
                    </span>
                    {name}
                  </div>
                  <div className="text-xs font-medium text-slate-500">{v} check-ins</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventPreviewCard() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-br from-amber-200/30 via-rose-200/20 to-blue-200/30 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
        <div className="relative h-44 bg-gradient-to-br from-[#f97316] via-[#f59e0b] to-[#fbbf24]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.45),transparent_60%)]" />
          <div className="absolute bottom-4 left-5 text-white">
            <div className="text-[11px] font-medium uppercase tracking-widest opacity-90">
              Featured event
            </div>
            <div className="text-2xl font-semibold leading-tight">Orange Food Week</div>
            <div className="text-xs opacity-90">13–22 June 2025</div>
          </div>
        </div>
        <div className="p-5">
          <p className="text-sm leading-relaxed text-slate-600">
            Ten days of incredible food, local producers and unique experiences
            across the Orange region.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="inline-flex h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] px-4 text-xs font-semibold text-white shadow-sm">
              Join the trail
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-50">
              View venues
            </button>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px]">
            {[
              ["24", "venues"],
              ["6", "rewards"],
              ["10", "days"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-lg bg-slate-50 px-2 py-2">
                <div className="text-sm font-semibold text-slate-900">{v}</div>
                <div className="text-slate-500">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
