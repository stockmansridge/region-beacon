import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Sparkles,
  Stamp,
} from "lucide-react";
import { authUrl } from "@/lib/auth-redirect";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — GetStampd" },
      {
        name: "description",
        content:
          "Start with a free GetStampd account, then upgrade to Starter, Growth or Enterprise when you're ready to launch your digital stamp trails publicly.",
      },
      { property: "og:title", content: "GetStampd Pricing — Start free, upgrade when you're ready" },
      {
        property: "og:description",
        content:
          "Free account plus Starter, Growth and Enterprise plans for trails, events and tourism campaigns.",
      },
      { property: "og:url", content: "https://getstampd.com.au/pricing" },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: "https://getstampd.com.au/pricing" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),

  component: PricingPage,
});

type Plan = {
  code: string;
  name: string;
  desc: string;
  price: string;
  cadence: string;
  billed: string;
  features: string[];
  cta: string;
  href: string;
  highlight: boolean;
  badge?: string;
};

const PLANS: Plan[] = [
  {
    code: "starter",
    name: "Starter",
    desc: "For small live trails, events and local experiences.",
    price: "$49",
    cadence: " / month",
    billed: "Billed annually",
    features: [
      "Launch 1 active trail or event",
      "Up to 1,000 participants",
      "Custom branding",
      "Basic analytics",
      "Email support",
    ],
    cta: "Upgrade to Starter",
    href: authUrl("/signup?plan=starter"),
    highlight: false,
  },
  {
    code: "growth",
    name: "Growth",
    desc: "For growing destinations, markets and tourism campaigns.",
    price: "$149",
    cadence: " / month",
    billed: "Billed annually",
    features: [
      "Up to 10 active trails/events",
      "Up to 10,000 participants",
      "Advanced analytics",
      "Reward tracking",
      "Priority email support",
    ],
    cta: "Upgrade to Growth",
    href: authUrl("/signup?plan=growth"),
    highlight: true,
    badge: "Most popular",
  },
  {
    code: "enterprise",
    name: "Enterprise",
    desc: "For tourism boards, regions and large multi-location programs.",
    price: "Custom",
    cadence: "",
    billed: "Let's talk",
    features: [
      "Unlimited trails/events",
      "Unlimited participants",
      "Multi-destination programs",
      "Custom integrations",
      "Dedicated account manager",
    ],
    cta: "Contact sales",
    href: "/contact",
    highlight: false,
  },
];

const FAQS = [
  {
    q: "Do I need to pay anything to get started?",
    a: "No. You can create a free GetStampd account, build a draft trail or event, and preview the visitor experience before choosing a paid plan.",
  },
  {
    q: "Can GetStampd be branded for our destination, trail or campaign?",
    a: "Yes. Each trail, campaign or pass can be customized with your imagery, logo, colours and reward structure.",
  },
  {
    q: "How do visitors collect stamps?",
    a: "Visitors join a trail or campaign, then collect stamps by scanning QR codes, checking in at locations or completing participating activities.",
  },
  {
    q: "Can we use GetStampd for markets and stall events?",
    a: "Yes. GetStampd works well for markets, festivals, expos, pop-ups and multi-stall experiences.",
  },
  {
    q: "Do visitors need to download an app?",
    a: "GetStampd is designed to be simple and mobile-friendly so visitors can join and collect stamps with minimal friction.",
  },
  {
    q: "Can we track participation across multiple trails?",
    a: "Yes. Organizers can view participation, stamp collection and reward engagement across all campaigns through a simple dashboard.",
  },
];

function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all",
        scrolled
          ? "bg-white/90 backdrop-blur-md shadow-[0_4px_24px_-12px_rgba(31,36,23,0.18)]"
          : "bg-white/70 backdrop-blur",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#8A1538] text-[#F8F3EA] ring-2 ring-[#C8A24A]/40">
            <Stamp className="h-5 w-5" />
          </span>
          <span className="font-serif text-xl font-semibold text-[#1F2417]">GetStampd</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-[#1F2417]/80 lg:flex">
          <a href="/#how-it-works" className="hover:text-[#8A1538]">How it works</a>
          <Link to="/demo" className="hover:text-[#8A1538]">Demo</Link>
          <Link to="/pricing" className="text-[#8A1538]">Pricing</Link>
        </nav>
        <div className="flex items-center gap-2">
          <a
            href={authUrl("/admin/login")}
            className="hidden h-10 items-center rounded-full border border-[#1F2417]/15 px-4 text-sm font-medium text-[#1F2417] hover:border-[#8A1538] hover:text-[#8A1538] sm:inline-flex"
          >
            Login
          </a>
          <a
            href={authUrl("/signup")}
            className="inline-flex h-10 items-center rounded-full bg-[#8A1538] px-5 text-sm font-semibold text-white hover:bg-[#6f1029]"
          >
            Start here for free
          </a>
        </div>
      </div>
    </header>
  );
}

function FreeAccountCard() {
  return (
    <div className="relative">
      <div className="mb-4 flex items-center justify-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#8A1538]">
        <span className="hidden sm:inline">New to GetStampd?</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#8A1538] px-3 py-1 text-white shadow-sm">
          <Sparkles className="h-3 w-3" /> Start here
        </span>
        <ArrowRight className="h-4 w-4 rotate-90 text-[#8A1538]" />
      </div>
      <div className="relative rounded-3xl border-2 border-[#8A1538] bg-gradient-to-br from-[#FBF5E8] to-[#F8F3EA] p-8 shadow-xl shadow-[#8A1538]/10 ring-1 ring-[#C8A24A]/40">
        <span className="absolute right-6 top-6 inline-flex items-center gap-1.5 rounded-full bg-[#C8A24A] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1F2417] shadow-sm">
          <Stamp className="h-3 w-3" /> You&rsquo;re here
        </span>
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <h3 className="font-serif text-3xl font-semibold text-[#1F2417]">Free Account</h3>
            <p className="mt-3 text-[#666666]">
              Perfect for exploring GetStampd and setting up your first digital stamp experience.
            </p>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="font-serif text-5xl font-semibold text-[#1F2417]">$0</span>
              <span className="text-sm font-medium uppercase tracking-wider text-[#C8A24A]">Free to start</span>
            </div>
            <p className="mt-4 text-sm text-[#666666]">
              Upgrade when you&rsquo;re ready to launch publicly or grow your experience.
            </p>
            <a
              href={authUrl("/signup?plan=free")}
              className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-[#8A1538] px-7 text-sm font-semibold text-white shadow-md shadow-[#8A1538]/20 transition hover:-translate-y-0.5 hover:bg-[#6f1029] hover:shadow-lg"
            >
              Start here for free <ArrowRight className="h-4 w-4" />
            </a>
            <p className="mt-3 text-xs font-medium text-[#666666]">No payment required to begin.</p>
          </div>
          <ul className="space-y-2.5 text-sm text-[#1F2417]">
            {[
              "Create your GetStampd account",
              "Build your first draft trail or event",
              "Add sample stops, stalls or locations",
              "Preview the visitor mobile pass",
              "Test digital stamp collection",
              "Try QR code check-ins",
              "Set up sample rewards",
              "Explore the organiser dashboard",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#687642]" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function PricingPage() {
  return (
    <div className="min-h-screen bg-[#F8F3EA] text-[#1F2417]">
      <Header />

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-5 pb-10 pt-20 text-center sm:px-8 sm:pt-28">
        <span className="inline-flex items-center gap-2 rounded-full bg-[#8A1538]/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8A1538]">
          <Sparkles className="h-3.5 w-3.5" /> Pricing
        </span>
        <h1 className="mt-5 font-serif text-4xl font-semibold leading-tight tracking-tight text-[#1F2417] sm:text-5xl">
          Start with a free GetStampd account
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[#666666] sm:text-lg">
          Create your account, explore the platform, build your first digital stamp experience and see how visitors collect stamps before you choose a paid plan.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href={authUrl("/signup?plan=free")}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-[#8A1538] px-7 text-sm font-semibold text-white shadow-md shadow-[#8A1538]/20 hover:-translate-y-0.5 hover:bg-[#6f1029] hover:shadow-lg transition"
          >
            Start here for free <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#paid-plans"
            className="inline-flex h-12 items-center gap-2 rounded-full border-2 border-[#1F2417]/15 bg-white px-6 text-sm font-semibold text-[#1F2417] hover:border-[#8A1538] hover:text-[#8A1538] transition"
          >
            View paid plans
          </a>
        </div>
      </section>

      {/* Free account spotlight */}
      <section className="mx-auto max-w-5xl px-5 pb-10 sm:px-8">
        <FreeAccountCard />
      </section>

      {/* What you get panel */}
      <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-8">
        <div className="rounded-3xl border border-[#C8A24A]/40 bg-white p-8 shadow-sm sm:p-10">
          <div className="text-center">
            <h2 className="font-serif text-2xl font-semibold text-[#1F2417] sm:text-3xl">
              What you get with your free account
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[#666666]">
              Your free GetStampd account gives you a hands-on way to explore how digital stamp trails work from both the organiser and visitor perspective.
            </p>
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <div>
              <h3 className="font-serif text-lg font-semibold text-[#1F2417]">Build your first experience</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-[#1F2417]">
                {[
                  "Create a draft trail, event or tourism pass",
                  "Add sample locations, stalls or checkpoints",
                  "Add your logo, colours and imagery",
                  "Create sample rewards and offers",
                  "Preview the mobile visitor pass",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#687642]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-serif text-lg font-semibold text-[#1F2417]">Test the visitor journey</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-[#1F2417]">
                {[
                  "Try QR code stamp collection",
                  "See how visitors collect stamps",
                  "Track sample progress",
                  "Preview reward unlocks",
                  "Explore the organiser dashboard",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#687642]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-8 rounded-xl bg-[#F8F3EA] p-4 text-center text-sm text-[#666666]">
            Free accounts are ideal for planning, testing and previewing your GetStampd experience. Upgrade when you&rsquo;re ready to launch publicly, invite visitors or run a larger campaign.
          </p>

          <div className="mt-6 text-center">
            <a
              href={authUrl("/signup?plan=free")}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[#8A1538] px-7 text-sm font-semibold text-white shadow-md shadow-[#8A1538]/20 hover:-translate-y-0.5 hover:bg-[#6f1029] hover:shadow-lg transition"
            >
              Start here for free <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Paid Plans */}
      <section id="paid-plans" className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8A1538]">Upgrade paths</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold text-[#1F2417] sm:text-4xl">
            Ready to launch publicly? Choose a paid plan.
          </h2>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.code}
              className={cn(
                "relative flex flex-col rounded-3xl border bg-white p-8 transition-all duration-300 hover:-translate-y-1",
                p.highlight
                  ? "border-[#8A1538] shadow-xl shadow-[#8A1538]/10 ring-1 ring-[#8A1538]"
                  : "border-[#1F2417]/10 shadow-sm hover:shadow-lg",
              )}
            >
              {p.badge && (
                <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#8A1538] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-md">
                  <Sparkles className="h-3 w-3" /> {p.badge}
                </span>
              )}
              <h3 className="font-serif text-3xl font-semibold text-[#1F2417]">{p.name}</h3>
              <p className="mt-2 text-sm text-[#666666]">{p.desc}</p>
              <div className="mt-7 flex items-baseline gap-1">
                <span className="font-serif text-5xl font-semibold text-[#1F2417]">{p.price}</span>
                {p.cadence && <span className="text-sm text-[#666666]">{p.cadence}</span>}
              </div>
              <p className="text-xs font-medium uppercase tracking-wider text-[#C8A24A]">{p.billed}</p>
              <ul className="mt-7 space-y-3 text-sm text-[#1F2417]">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#687642]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-10">
                {p.href.startsWith("/") ? (
                  <Link
                    to={p.href}
                    className={cn(
                      "inline-flex h-12 w-full items-center justify-center rounded-full text-sm font-semibold transition",
                      p.highlight
                        ? "bg-[#8A1538] text-white hover:bg-[#6f1029]"
                        : "border-2 border-[#1F2417]/15 text-[#1F2417] hover:border-[#8A1538] hover:text-[#8A1538]",
                    )}
                  >
                    {p.cta} <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                ) : (
                  <a
                    href={p.href}
                    className={cn(
                      "inline-flex h-12 w-full items-center justify-center rounded-full text-sm font-semibold transition",
                      p.highlight
                        ? "bg-[#8A1538] text-white hover:bg-[#6f1029]"
                        : "border-2 border-[#1F2417]/15 text-[#1F2417] hover:border-[#8A1538] hover:text-[#8A1538]",
                    )}
                  >
                    {p.cta} <ArrowRight className="ml-1 h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How pricing works */}
      <section className="mx-auto max-w-4xl px-5 pb-12 sm:px-8">
        <div className="rounded-2xl border border-[#1F2417]/8 bg-[#F8F3EA] p-8 text-center">
          <h3 className="font-serif text-xl font-semibold text-[#1F2417]">How GetStampd pricing works</h3>
          <p className="mt-3 text-sm text-[#666666]">
            Pricing is based on the scope of each trail or campaign:
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Trails or campaigns", desc: "How many experiences you run" },
              { label: "Venues / stops", desc: "Number of locations on each trail" },
              { label: "Passport volume", desc: "How many visitors you expect" },
              { label: "Support & customisation", desc: "Branding, onboarding and reporting needs" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-white p-4 text-left shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8A1538]">{item.label}</p>
                <p className="mt-1 text-sm text-[#666666]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <div className="text-center">
            <h2 className="font-serif text-4xl font-semibold text-[#1F2417]">Frequently asked questions</h2>
            <div className="mx-auto mt-3 h-[3px] w-16 rounded-full bg-[#C8A24A]" />
          </div>
          <Accordion type="single" collapsible className="mt-10">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`q${i}`} className="border-[#1F2417]/10">
                <AccordionTrigger className="py-5 font-serif text-lg font-medium text-[#1F2417] hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-[#666666]">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#32391F] py-20 text-center text-[#F8F3EA]">
        <div className="mx-auto max-w-2xl px-5 sm:px-8">
          <h2 className="font-serif text-3xl font-semibold sm:text-4xl">Ready to start your first trail?</h2>
          <p className="mt-4 text-[#F8F3EA]/80">
            Create your free account and start building — no payment required to begin.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href={authUrl("/signup?plan=free")}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[#C8A24A] px-7 text-sm font-semibold text-[#1F2417] hover:bg-[#b78f3a]"
            >
              Start here for free <ArrowRight className="h-4 w-4" />
            </a>
            <Link
              to="/demo"
              className="inline-flex h-12 items-center gap-2 rounded-full border border-[#F8F3EA]/30 px-6 text-sm font-semibold text-[#F8F3EA] hover:bg-[#F8F3EA]/10"
            >
              See the demo
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-[#1F2417] py-10 text-[#F8F3EA]/70">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 sm:flex-row sm:px-8">
          <span className="inline-flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#8A1538] text-[#F8F3EA] ring-2 ring-[#C8A24A]/40">
              <Stamp className="h-4 w-4" />
            </span>
            <span className="font-serif text-lg font-semibold text-white">GetStampd</span>
          </span>
          <p className="text-xs">© {new Date().getFullYear()} GetStampd</p>
        </div>
      </footer>
    </div>
  );
}
