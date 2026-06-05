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
          "Simple pricing for every trail, event, and destination. Launch digital stamp trails for wineries, markets, festivals, regions and destinations.",
      },
      { property: "og:title", content: "GetStampd Pricing" },
      {
        property: "og:description",
        content:
          "Pilot, Launch and Destination Programme plans for trails, events and tourism campaigns.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: PricingPage,
});

const PLANS = [
  {
    name: "Pilot",
    desc: "For small organisations testing GetStampd.",
    price: "Free",
    cadence: "",
    billed: "Start free",
    features: [
      "1 active trail or campaign",
      "Up to 5 venues / stops",
      "Limited passport volume",
      "Basic digital passport",
      "Self-serve setup",
      "Basic support",
    ],
    cta: "Start a pilot",
    href: authUrl("/signup"),
    highlight: false,
  },
  {
    name: "Launch",
    badge: "Most popular",
    desc: "The main paid option for running branded stamp trails and events.",
    price: "From $990",
    cadence: " per campaign",
    billed: "Pricing scales with your programme",
    features: [
      "Multiple venues / stops",
      "Higher passport volume",
      "Custom-branded digital passport",
      "QR codes for participating venues",
      "Campaign dashboard",
      "Analytics and reporting",
      "Support for setup and launch",
    ],
    cta: "Launch a trail",
    href: authUrl("/signup"),
    highlight: true,
  },
  {
    name: "Destination Programme",
    desc: "For tourism boards, councils, regions, DMOs, and multi-destination programmes.",
    price: "Custom",
    cadence: "",
    billed: "Let's talk",
    features: [
      "Multiple trails or campaigns",
      "Large or unlimited venue count",
      "Custom passport volume",
      "Multi-destination setup",
      "Partner / venue onboarding",
      "Advanced reporting",
      "Dedicated account support",
    ],
    cta: "Talk to us",
    href: "/contact",
    highlight: false,
  },
] as const;

const FAQS = [
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
            Start now
          </a>
        </div>
      </div>
    </header>
  );
}

function PricingPage() {
  return (
    <div className="min-h-screen bg-[#F8F3EA] text-[#1F2417]">
      <Header />

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-5 pb-12 pt-20 text-center sm:px-8 sm:pt-28">
        <span className="inline-flex items-center gap-2 rounded-full bg-[#8A1538]/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8A1538]">
          <Sparkles className="h-3.5 w-3.5" /> Pricing
        </span>
        <h1 className="mt-5 font-serif text-4xl font-semibold leading-tight tracking-tight text-[#1F2417] sm:text-5xl">
          Simple pricing for every trail, event, and destination
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[#666666] sm:text-lg">
          Launch digital stamp trails for events, markets, tourism campaigns, and destination experiences. Start small, then scale as your programme grows.
        </p>
      </section>

      {/* Cards */}
      <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={cn(
                "relative flex flex-col rounded-3xl border bg-white p-10 transition-all duration-300 hover:-translate-y-1",
                p.highlight
                  ? "border-[#8A1538] shadow-xl shadow-[#8A1538]/10 ring-1 ring-[#8A1538]"
                  : "border-[#1F2417]/10 shadow-sm hover:shadow-lg",
              )}
            >
              {"badge" in p && p.badge && (
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
          <h2 className="font-serif text-3xl font-semibold sm:text-4xl">Ready to launch your first trail?</h2>
          <p className="mt-4 text-[#F8F3EA]/80">
            Set up a branded digital stamp trail in minutes — no app required for your visitors.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href={authUrl("/signup")}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[#C8A24A] px-7 text-sm font-semibold text-[#1F2417] hover:bg-[#b78f3a]"
            >
              Start now <ArrowRight className="h-4 w-4" />
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
