import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Gift,
  MapPin,
  Play,
  QrCode,
  ShieldCheck,
  Sparkles,
  Stamp,
  Star,
  Trophy,
  Wand2,
  Zap,
} from "lucide-react";
import { useTenantSubdomain } from "@/lib/tenant-host";
import { authUrl } from "@/lib/auth-redirect";
import { LivePublicPage } from "./live.$subdomain.index";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import heroWine from "@/assets/hero-wine-trail.jpg";
import heroMarket from "@/assets/hero-market.jpg";
import heroGroup from "@/assets/hero-tourism-group.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GetStampd — Discover trails, collect stamps, unlock rewards" },
      {
        name: "description",
        content:
          "Digital stamp trails for wineries, markets, tourism groups and events. Visitors scan QR codes, collect stamps and unlock rewards — no app download required.",
      },
      { property: "og:title", content: "GetStampd — Digital stamp trails for tourism" },
      {
        property: "og:description",
        content:
          "Launch beautiful, branded digital stamp trails for trails, events and destinations.",
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

/* ------------------------------ Brand mark ------------------------------ */

function StampLogo({ className = "" }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#8A1538] text-[#F8F3EA] shadow-sm ring-2 ring-[#C8A24A]/40">
        <Stamp className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <span className="font-serif text-xl font-semibold tracking-tight text-[#1F2417]">
        GetStampd
      </span>
    </span>
  );
}

/* ------------------------------ Navigation ------------------------------ */

function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
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
        <Link to="/" className="shrink-0"><StampLogo /></Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-[#1F2417]/80 lg:flex">
          <a href="#how-it-works" className="hover:text-[#8A1538] transition-colors">How it works</a>
          <Link to="/demo" className="hover:text-[#8A1538] transition-colors">Demo</Link>
          <Link to="/pricing" className="hover:text-[#8A1538] transition-colors">Pricing</Link>
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <a
            href={authUrl("/admin/login")}
            className="inline-flex h-10 items-center rounded-full border border-[#1F2417]/15 px-4 text-sm font-medium text-[#1F2417] hover:border-[#8A1538] hover:text-[#8A1538] transition-colors"
          >
            Login
          </a>
          <a
            href={authUrl("/signup")}
            className="inline-flex h-10 items-center rounded-full bg-[#8A1538] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[#6f1029] transition-colors"
          >
            Start now
          </a>
        </div>
        <button
          aria-label="Toggle menu"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#1F2417]/10 lg:hidden"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="relative block h-3 w-5">
            <span className={cn("absolute left-0 top-0 h-0.5 w-5 bg-[#1F2417] transition-transform", open && "translate-y-1.5 rotate-45")} />
            <span className={cn("absolute left-0 top-1.5 h-0.5 w-5 bg-[#1F2417] transition-opacity", open && "opacity-0")} />
            <span className={cn("absolute left-0 top-3 h-0.5 w-5 bg-[#1F2417] transition-transform", open && "-translate-y-1.5 -rotate-45")} />
          </span>
        </button>
      </div>
      {open && (
        <div className="border-t border-[#1F2417]/5 bg-white px-5 py-4 lg:hidden">
          <div className="flex flex-col gap-1 text-sm font-medium text-[#1F2417]">
            <a href="#how-it-works" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 hover:bg-[#F8F3EA]">How it works</a>
            <Link to="/demo" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 hover:bg-[#F8F3EA]">Demo</Link>
            <Link to="/pricing" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 hover:bg-[#F8F3EA]">Pricing</Link>
            <div className="mt-2 flex gap-2">
              <a href={authUrl("/admin/login")} className="flex-1 rounded-full border border-[#1F2417]/15 px-4 py-2 text-center">Login</a>
              <a href={authUrl("/signup")} className="flex-1 rounded-full bg-[#8A1538] px-4 py-2 text-center text-white">Start now</a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/* -------------------------- Hero carousel slides ------------------------ */

const SLIDES = [
  {
    img: heroWine,
    icon: Sparkles,
    title: "Wine Trails",
    desc: "Sip, savour and collect stamps along the way.",
  },
  {
    img: heroMarket,
    icon: Star,
    title: "Market Events",
    desc: "Explore local stalls and earn unique rewards.",
  },
  {
    img: heroGroup,
    icon: MapPin,
    title: "Tourism Groups",
    desc: "Discover together and earn more as a group.",
  },
];

function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const next = useCallback(() => setIndex((i) => (i + 1) % SLIDES.length), []);
  const prev = () => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length);
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(next, 5000);
    return () => window.clearInterval(id);
  }, [next, paused]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Desktop: 3 cards side by side, highlight current */}
      <div className="hidden gap-6 md:grid md:grid-cols-3">
        {SLIDES.map((s, i) => (
          <SlideCard key={s.title} slide={s} active={i === index} />
        ))}
      </div>
      {/* Mobile: single card */}
      <div className="overflow-hidden md:hidden">
        <div
          className="flex transition-transform duration-500"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map((s) => (
            <div key={s.title} className="w-full shrink-0 px-1">
              <SlideCard slide={s} active />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          aria-label="Previous"
          onClick={prev}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#1F2417]/15 bg-white text-[#1F2417] hover:border-[#8A1538] hover:text-[#8A1538] transition"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-2 rounded-full transition-all",
                i === index ? "w-8 bg-[#8A1538]" : "w-2 bg-[#1F2417]/20 hover:bg-[#1F2417]/40",
              )}
            />
          ))}
        </div>
        <button
          aria-label="Next"
          onClick={next}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#1F2417]/15 bg-white text-[#1F2417] hover:border-[#8A1538] hover:text-[#8A1538] transition"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function SlideCard({ slide, active }: { slide: (typeof SLIDES)[number]; active: boolean }) {
  const Icon = slide.icon;
  return (
    <div
      className={cn(
        "group relative h-[360px] overflow-hidden rounded-3xl shadow-lg transition-all duration-500 sm:h-[420px]",
        active ? "ring-2 ring-[#C8A24A]" : "opacity-90 hover:opacity-100",
      )}
    >
      <img
        src={slide.img}
        alt={slide.title}
        loading="lazy"
        width={1280}
        height={896}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#1F2417]/85 via-[#1F2417]/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-6 text-white">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#C8A24A] text-[#1F2417] shadow-sm">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="mt-3 font-serif text-2xl font-semibold">{slide.title}</h3>
        <p className="mt-1 text-sm text-white/85">{slide.desc}</p>
      </div>
    </div>
  );
}

/* ----------------------------- Phone mockup ---------------------------- */

type PhoneProps = {
  trail: string;
  filled: number;
  total: number;
  rewardText?: string;
  flash?: boolean;
};

function PhoneMockup({ trail, filled, total, rewardText, flash }: PhoneProps) {
  return (
    <div className="relative mx-auto w-[260px] sm:w-[300px]">
      <div
        className={cn(
          "rounded-[2.5rem] bg-[#1F2417] p-2 shadow-2xl shadow-[#1F2417]/25 transition-all",
          flash && "ring-4 ring-[#C8A24A]/60",
        )}
      >
        <div className="relative overflow-hidden rounded-[2rem] bg-[#F8F3EA]">
          {/* Notch */}
          <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-[#1F2417]" />
          {/* Banner */}
          <div className="h-24 bg-gradient-to-br from-[#8A1538] via-[#a52248] to-[#687642]" />
          <div className="px-5 pb-5 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8A1538]">Adventure pass</p>
            <h4 className="mt-1 font-serif text-lg font-semibold text-[#1F2417] leading-tight">{trail}</h4>
            <p className="mt-1 text-xs text-[#666666]">
              <span className="font-semibold text-[#32391F]">{filled} / {total}</span> stamps collected
            </p>
            {/* Progress */}
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#1F2417]/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#8A1538] to-[#C8A24A] transition-all duration-500"
                style={{ width: `${(filled / total) * 100}%` }}
              />
            </div>
            {/* Stamps grid */}
            <div className="mt-4 grid grid-cols-4 gap-2.5">
              {Array.from({ length: total }).map((_, i) => {
                const isFilled = i < filled;
                return (
                  <div
                    key={i}
                    className={cn(
                      "relative flex aspect-square items-center justify-center rounded-full border-2 border-dashed transition-all",
                      isFilled
                        ? "border-[#8A1538] bg-[#8A1538] text-[#F8F3EA] shadow-inner"
                        : "border-[#1F2417]/15 bg-white text-[#1F2417]/20",
                    )}
                  >
                    <Stamp className="h-3.5 w-3.5" />
                  </div>
                );
              })}
            </div>
            {/* Reward card */}
            <div className="mt-4 rounded-xl border border-[#C8A24A]/40 bg-[#FBF5E8] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C8A24A]">Next reward</p>
              <p className="mt-0.5 text-xs font-medium text-[#1F2417]">
                {rewardText ?? `Collect ${total - filled} more to unlock`}
              </p>
            </div>
            {/* Bottom nav */}
            <div className="mt-4 flex items-center justify-between border-t border-[#1F2417]/10 pt-3 text-[10px] font-medium text-[#666666]">
              {[
                { icon: MapPin, label: "Explore" },
                { icon: Stamp, label: "Stamps", active: true },
                { icon: Gift, label: "Rewards" },
                { icon: Sparkles, label: "Profile" },
              ].map((n) => (
                <div key={n.label} className={cn("flex flex-col items-center gap-0.5", n.active && "text-[#8A1538]")}>
                  <n.icon className="h-4 w-4" />
                  <span>{n.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Sections ------------------------------ */

const STEPS = [
  { n: 1, icon: MapPin, title: "Find an experience", body: "Browse trails, events and groups near you." },
  { n: 2, icon: QrCode, title: "Join the trail or event", body: "Sign up or scan the QR code to get your digital pass." },
  { n: 3, icon: Stamp, title: "Collect stamps", body: "Visit locations or stalls, scan or check in to collect stamps." },
  { n: 4, icon: Gift, title: "Unlock rewards", body: "Redeem rewards, discounts and offers as you collect more stamps." },
];

const PLANS = [
  {
    name: "Starter",
    desc: "Perfect for small events and local trails.",
    price: "$49",
    cadence: "/ month",
    billed: "Billed annually",
    features: ["Up to 1,000 participants", "1 active trail or event", "Basic analytics", "Email support"],
    cta: "Get started",
    href: authUrl("/signup"),
    highlight: false,
  },
  {
    name: "Growth",
    badge: "Most popular",
    desc: "Ideal for growing destinations and experiences.",
    price: "$149",
    cadence: "/ month",
    billed: "Billed annually",
    features: ["Up to 10,000 participants", "Up to 10 active trails/events", "Advanced analytics", "Priority email support"],
    cta: "Start free trial",
    href: authUrl("/signup"),
    highlight: true,
  },
  {
    name: "Enterprise",
    desc: "For large organizations and multi-destination programs.",
    price: "Custom",
    cadence: "",
    billed: "Let's talk",
    features: ["Unlimited participants", "Unlimited trails/events", "Custom integrations", "Dedicated account manager"],
    cta: "Contact sales",
    href: "/contact",
    highlight: false,
  },
] as const;

function Landing() {
  return (
    <div className="min-h-screen bg-[#F8F3EA] font-sans text-[#1F2417]">
      <Header />

      {/* HERO CAROUSEL */}
      <section className="mx-auto max-w-7xl px-5 pb-2 pt-10 sm:px-8 sm:pt-14">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8A1538]">
              For tourism · trails · events · destinations
            </p>
            <h2 className="mt-2 max-w-2xl font-serif text-2xl font-semibold leading-tight text-[#1F2417] sm:text-3xl">
              Beautifully simple digital stamp trails for every kind of experience.
            </h2>
          </div>
        </div>
        <HeroCarousel />
      </section>

      {/* MAIN HERO */}
      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-[#8A1538]/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8A1538]">
              <Sparkles className="h-3.5 w-3.5" /> Discover · Stamp · Reward
            </span>
            <h1 className="mt-5 font-serif text-4xl font-semibold leading-[1.05] tracking-tight text-[#1F2417] sm:text-5xl lg:text-6xl">
              Discover trails, collect digital stamps, and{" "}
              <span className="text-[#8A1538]">unlock rewards</span>.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-[#666666] sm:text-lg">
              Join participating experiences, scan QR codes or check in, collect digital stamps as you visit destinations or stalls, and redeem exclusive rewards and offers.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={authUrl("/signup")}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[#8A1538] px-7 text-sm font-semibold text-white shadow-md shadow-[#8A1538]/20 transition hover:-translate-y-0.5 hover:bg-[#6f1029] hover:shadow-lg"
              >
                Start collecting <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                to="/demo"
                className="inline-flex h-12 items-center gap-2 rounded-full border-2 border-[#1F2417]/15 bg-white px-6 text-sm font-semibold text-[#1F2417] transition hover:border-[#8A1538] hover:text-[#8A1538]"
              >
                <Play className="h-4 w-4" /> Watch demo
              </Link>
            </div>
            <p className="mt-5 text-xs font-medium text-[#666666]">No app download required · Works on any modern phone</p>
          </div>

          {/* Phone with adventure pass card behind */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -left-4 top-8 hidden h-44 w-72 -rotate-[7deg] rounded-2xl bg-gradient-to-br from-[#8A1538] to-[#6f1029] p-5 text-[#F8F3EA] shadow-xl sm:block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#C8A24A]">Your adventure awaits</p>
              <p className="mt-2 font-serif text-2xl font-semibold leading-tight">GETSTAMPD</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-[#F8F3EA]/80">Explore &amp; Earn</p>
              <div className="absolute bottom-4 right-4 text-[#C8A24A]">
                <Stamp className="h-7 w-7" />
              </div>
            </div>
            {/* Olive leaf */}
            <svg
              aria-hidden
              className="absolute -right-6 -top-6 h-24 w-24 text-[#687642]/70"
              viewBox="0 0 100 100" fill="none"
            >
              <path d="M20 80 Q50 20 90 30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <ellipse cx="40" cy="60" rx="10" ry="4" transform="rotate(-30 40 60)" fill="currentColor" opacity="0.7" />
              <ellipse cx="55" cy="45" rx="10" ry="4" transform="rotate(-20 55 45)" fill="currentColor" opacity="0.7" />
              <ellipse cx="72" cy="35" rx="10" ry="4" transform="rotate(-10 72 35)" fill="currentColor" opacity="0.7" />
            </svg>
            <div className="relative rotate-[4deg]">
              <PhoneMockup trail="Hunter Valley Wine Trail" filled={7} total={12} rewardText="Free tasting at stamp 8" />
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-serif text-4xl font-semibold tracking-tight text-[#1F2417]">How it works</h2>
            <div className="mx-auto mt-3 h-[3px] w-16 rounded-full bg-[#C8A24A]" />
            <p className="mt-5 text-[#666666]">Four simple steps from discovery to reward.</p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.n} className="group relative">
                  <div className="relative rounded-2xl border border-[#1F2417]/8 bg-[#F8F3EA] p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                    <span className="absolute -top-3 left-7 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#8A1538] px-2 text-xs font-bold text-white">
                      {s.n}
                    </span>
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white text-[#8A1538] shadow-sm ring-1 ring-[#C8A24A]/30">
                      <Icon className="h-6 w-6" />
                    </span>
                    <h3 className="mt-5 font-serif text-lg font-semibold text-[#1F2417]">{s.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#666666]">{s.body}</p>
                  </div>
                  {i < STEPS.length - 1 && (
                    <ArrowRight className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-[#C8A24A] lg:block" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* DEMO PREVIEW */}
      <section className="bg-[#F8F3EA] py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid items-center gap-14 lg:grid-cols-[1fr_1fr]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8A1538]">Demo preview</p>
              <h2 className="mt-3 font-serif text-4xl font-semibold leading-tight tracking-tight text-[#1F2417] sm:text-5xl">
                See GetStampd in action
              </h2>
              <p className="mt-5 max-w-lg text-[#666666]">
                A simple, beautiful experience for your visitors. Custom branded passes, real-time tracking and instant rewards.
              </p>
              <Link
                to="/demo"
                className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-[#32391F] px-6 text-sm font-semibold text-[#F8F3EA] transition hover:bg-[#1F2417]"
              >
                <Play className="h-4 w-4" /> Watch full demo
              </Link>

              <div className="mt-10 space-y-5">
                {[
                  { icon: Stamp, title: "Digital stamp cards", body: "Collect stamps at each stop." },
                  { icon: Zap, title: "Live progress", body: "See how close you are to your next reward." },
                  { icon: Gift, title: "Exclusive rewards", body: "Unlock offers and experiences along the way." },
                ].map((f) => (
                  <div key={f.title} className="flex items-start gap-4">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#8A1538] text-white shadow-sm">
                      <f.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h4 className="font-serif text-lg font-semibold text-[#1F2417]">{f.title}</h4>
                      <p className="mt-1 text-sm text-[#666666]">{f.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative flex items-center justify-center">
              <div className="absolute h-72 w-72 rounded-full bg-gradient-to-br from-[#C8A24A]/30 via-[#687642]/10 to-transparent blur-3xl" />
              <InteractiveDemoPhone />
            </div>
          </div>
        </div>
      </section>

      {/* PRICING PREVIEW */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-serif text-4xl font-semibold tracking-tight text-[#1F2417]">
              Simple pricing for every organization
            </h2>
            <p className="mt-4 text-[#666666]">
              Launch digital stamp trails for events, destinations, markets and tourism experiences.
            </p>
          </div>
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {PLANS.map((p) => (
              <PricingCard key={p.name} plan={p} />
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              to="/pricing"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#8A1538] hover:underline"
            >
              See full pricing & FAQ <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* TRUST FOOTER */}
      <section className="bg-[#32391F] py-16 text-[#F8F3EA]">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <p className="text-center font-serif text-2xl font-medium leading-snug">
            Trusted by tourism boards, wineries, markets and attractions.
          </p>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Zap, title: "Easy to set up", body: "Launch in minutes" },
              { icon: Wand2, title: "Branded your way", body: "Your logo, your story" },
              { icon: ShieldCheck, title: "Secure & reliable", body: "Enterprise-grade security" },
              { icon: Trophy, title: "Loved by visitors", body: "Simple and fun to use" },
            ].map((t) => (
              <div key={t.title} className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#C8A24A]/15 text-[#C8A24A]">
                  <t.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold">{t.title}</p>
                  <p className="text-sm text-[#F8F3EA]/70">{t.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-[#1F2417] py-10 text-[#F8F3EA]/70">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 sm:flex-row sm:px-8">
          <StampLogoFooter />
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <a href="#how-it-works" className="hover:text-white">How it works</a>
            <Link to="/demo" className="hover:text-white">Demo</Link>
            <Link to="/pricing" className="hover:text-white">Pricing</Link>
            <Link to="/contact" className="hover:text-white">Contact</Link>
          </div>
          <p className="text-xs">© {new Date().getFullYear()} GetStampd</p>
        </div>
      </footer>
    </div>
  );
}

function StampLogoFooter() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#8A1538] text-[#F8F3EA] ring-2 ring-[#C8A24A]/40">
        <Stamp className="h-4 w-4" />
      </span>
      <span className="font-serif text-lg font-semibold text-white">GetStampd</span>
    </span>
  );
}

function PricingCard({ plan }: { plan: (typeof PLANS)[number] }) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-3xl border bg-white p-8 transition-all duration-300 hover:-translate-y-1",
        plan.highlight
          ? "border-[#8A1538] shadow-xl shadow-[#8A1538]/10 ring-1 ring-[#8A1538]"
          : "border-[#1F2417]/10 shadow-sm hover:shadow-lg",
      )}
    >
      {"badge" in plan && plan.badge && (
        <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#8A1538] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-md">
          <Sparkles className="h-3 w-3" /> {plan.badge}
        </span>
      )}
      <h3 className="font-serif text-2xl font-semibold text-[#1F2417]">{plan.name}</h3>
      <p className="mt-2 text-sm text-[#666666]">{plan.desc}</p>
      <div className="mt-6 flex items-baseline gap-1">
        <span className="font-serif text-4xl font-semibold text-[#1F2417]">{plan.price}</span>
        {plan.cadence && <span className="text-sm text-[#666666]">{plan.cadence}</span>}
      </div>
      <p className="text-xs font-medium uppercase tracking-wider text-[#C8A24A]">{plan.billed}</p>
      <ul className="mt-6 space-y-3 text-sm text-[#1F2417]">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#687642]" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        {plan.href.startsWith("/") ? (
          <Link
            to={plan.href}
            className={cn(
              "inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold transition",
              plan.highlight
                ? "bg-[#8A1538] text-white hover:bg-[#6f1029]"
                : "border-2 border-[#1F2417]/15 text-[#1F2417] hover:border-[#8A1538] hover:text-[#8A1538]",
            )}
          >
            {plan.cta}
          </Link>
        ) : (
          <a
            href={plan.href}
            className={cn(
              "inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold transition",
              plan.highlight
                ? "bg-[#8A1538] text-white hover:bg-[#6f1029]"
                : "border-2 border-[#1F2417]/15 text-[#1F2417] hover:border-[#8A1538] hover:text-[#8A1538]",
            )}
          >
            {plan.cta}
          </a>
        )}
      </div>
    </div>
  );
}

/* ------------------------ Interactive demo phone ----------------------- */

function InteractiveDemoPhone() {
  const TOTAL = 10;
  const [filled, setFilled] = useState(5);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState(false);
  const timer = useRef<number | null>(null);

  const onScan = () => {
    if (filled >= TOTAL) {
      setFilled(5);
      return;
    }
    setFilled((f) => f + 1);
    setFlash(true);
    setToast(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setFlash(false);
      setToast(false);
    }, 2200);
  };

  return (
    <div className="relative">
      <PhoneMockup
        trail="Coastal Market Trail"
        filled={filled}
        total={TOTAL}
        rewardText={filled >= TOTAL ? "Reward unlocked!" : `${TOTAL - filled} more to your next reward`}
        flash={flash}
      />
      <button
        onClick={onScan}
        className="absolute -bottom-4 left-1/2 inline-flex h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-[#C8A24A] px-6 text-sm font-semibold text-[#1F2417] shadow-lg transition hover:-translate-y-0.5 hover:bg-[#b78f3a]"
        style={{ transform: "translate(-50%, 0)" }}
      >
        <QrCode className="h-4 w-4" /> Scan QR code
      </button>
      {toast && (
        <div className="pointer-events-none absolute -right-2 top-6 w-56 animate-fade-in rounded-xl border border-[#C8A24A]/40 bg-white p-3 shadow-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8A1538]">New stamp collected!</p>
          <p className="mt-1 text-xs text-[#1F2417]">You're one step closer to your next reward.</p>
        </div>
      )}
    </div>
  );
}
