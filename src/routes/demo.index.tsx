import { createFileRoute, Link } from "@tanstack/react-router";
import { DemoShell } from "@/components/demo/demo-shell";
import { PoweredByGetStampd } from "@/components/brand";
import { DEMO_EVENT, DEMO_VENUES, DEMO_AWARDS, useDemoPassport } from "@/lib/demo-cargo-road";
import { getEventAssetPublicUrl } from "@/lib/event-assets";
import { Stamp, Trophy, MapPin, Tag } from "lucide-react";

export const Route = createFileRoute("/demo/")({
  head: () => ({
    meta: [
      { title: "Cargo Road Wine Quest — GetStampd demo" },
      {
        name: "description",
        content:
          "Preview the customer experience of a regional wine trail digital passport — collect stamps, unlock offers, win prizes.",
      },
      { property: "og:title", content: "See GetStampd in action — demo trail" },
      {
        property: "og:description",
        content: "A live demo of the Cargo Road Wine Quest passport powered by GetStampd.",
      },
      { property: "og:url", content: "https://getstampd.com.au/demo" },
    ],
    links: [{ rel: "canonical", href: "https://getstampd.com.au/demo" }],
  }),
  component: DemoHome,
});

function DemoHome() {
  const passport = useDemoPassport();
  const heroImageUrl = getEventAssetPublicUrl(DEMO_EVENT.cover_path);
  const total = DEMO_VENUES.length;
  const visited = passport.visited;
  const pct = total > 0 ? Math.min(100, Math.round((visited / total) * 100)) : 0;
  const points = passport.points;

  // Ring geometry
  const ringSize = 116;
  const ringStroke = 10;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringDash = (pct / 100) * ringCirc;

  const nextAward =
    DEMO_AWARDS.find((a) => a.points_required > points) ?? DEMO_AWARDS[DEMO_AWARDS.length - 1];
  const remaining = nextAward ? Math.max(0, nextAward.points_required - points) : 0;
  const tierTitle = !passport.registered
    ? "Start your passport"
    : remaining > 0
      ? nextAward.title
      : "All prizes unlocked";
  const tierSub = !passport.registered
    ? "tap to begin"
    : remaining > 0
      ? `${remaining} pt${remaining === 1 ? "" : "s"} to go`
      : "enter the draw";

  return (
    <DemoShell activeNav="home" transparentHeader>
      {/* Hero */}
      <section
        className="relative w-full overflow-hidden"
        style={{
          backgroundColor: "var(--event-hero-bg, var(--event-primary))",
          color: "var(--event-hero-fg, var(--event-primary-fg))",
          minHeight: 340,
        }}
      >
        {heroImageUrl ? (
          <img
            src={heroImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
          />
        ) : null}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.65) 100%)",
          }}
        />
        <div className="relative mx-auto flex min-h-[340px] max-w-md flex-col justify-end px-5 pb-16 pt-24 sm:min-h-[380px]">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.32em]"
            style={{ color: "var(--event-hero-accent, var(--event-accent))" }}
          >
            Welcome
          </p>
          <h1
            className="mt-1 text-2xl font-semibold leading-tight sm:text-3xl"
            style={{
              color: "var(--event-hero-fg, var(--event-primary-fg))",
              textShadow: "0 2px 12px rgba(0,0,0,0.45)",
            }}
          >
            {passport.registered && passport.firstName ? (
              <>Hi {passport.firstName}! <span aria-hidden>👋</span></>
            ) : (
              <>Let's explore {DEMO_EVENT.name}</>
            )}
          </h1>
          <p
            className="mt-1 whitespace-pre-line text-sm sm:text-base"
            style={{
              color: "var(--event-hero-fg, var(--event-primary-fg))",
              opacity: 0.95,
              textShadow: "0 1px 8px rgba(0,0,0,0.45)",
            }}
          >
            {DEMO_EVENT.welcome_copy}
          </p>
        </div>
      </section>

      <main
        className="mx-auto w-full max-w-md px-4 pb-24"
        style={{ fontFamily: "var(--event-font, inherit)" }}
      >
        {/* Demo banner */}
        <div
          className="mt-4 rounded-2xl border border-dashed px-3 py-2 text-center text-[11px] font-medium uppercase tracking-[0.2em]"
          style={{
            borderColor: "color-mix(in srgb, var(--event-accent,#B5572A) 40%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--event-accent,#B5572A) 8%, transparent)",
            color: "var(--event-accent,#B5572A)",
          }}
        >
          Demo mode · nothing is saved to the real event
        </div>

        {/* Summary card */}
        <section
          className="relative z-10 mt-4 rounded-3xl border shadow-lg"
          style={{
            borderColor: "var(--event-card-border)",
            backgroundColor: "var(--event-card-bg)",
          }}
        >
          <div className="grid grid-cols-2 items-stretch">
            <div
              className="flex flex-col items-center justify-center gap-2 px-3 py-5"
              style={{ borderRight: "1px solid var(--event-card-border)" }}
            >
              <div className="relative" style={{ width: ringSize, height: ringSize }}>
                <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} aria-hidden>
                  <circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={ringRadius}
                    fill="none"
                    stroke="var(--event-card-border)"
                    strokeWidth={ringStroke}
                  />
                  <circle
                    cx={ringSize / 2}
                    cy={ringSize / 2}
                    r={ringRadius}
                    fill="none"
                    stroke="var(--event-button-primary-bg)"
                    strokeWidth={ringStroke}
                    strokeLinecap="round"
                    strokeDasharray={`${ringDash} ${ringCirc}`}
                    transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span
                    className="text-2xl font-semibold leading-none"
                    style={{ color: "var(--event-card-heading)" }}
                  >
                    {visited}
                    <span className="text-base font-medium" style={{ color: "var(--event-card-muted)" }}>
                      /{total}
                    </span>
                  </span>
                </div>
              </div>
              <div
                className="text-center text-[11px] font-medium uppercase tracking-[0.18em]"
                style={{ color: "var(--event-card-muted)" }}
              >
                Wineries visited
              </div>
            </div>

            <div className="flex flex-col">
              <div
                className="flex flex-1 flex-col items-center justify-center px-3 py-3 text-center"
                style={{ borderBottom: "1px solid var(--event-card-border)" }}
              >
                <div className="text-2xl font-semibold leading-none" style={{ color: "var(--event-card-heading)" }}>
                  {points}
                </div>
                <div
                  className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em]"
                  style={{ color: "var(--event-card-muted)" }}
                >
                  Points earned
                </div>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-1 px-3 py-3 text-center">
                <div className="flex items-center gap-1.5">
                  <span aria-hidden className="text-base leading-none">🎁</span>
                  <span
                    className="text-sm font-semibold leading-tight"
                    style={{ color: "var(--event-card-heading)" }}
                  >
                    {tierTitle}
                  </span>
                </div>
                <div
                  className="text-[10px] font-medium uppercase tracking-[0.18em]"
                  style={{ color: "var(--event-card-muted)" }}
                >
                  {tierSub}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Primary CTA */}
        <div className="mt-5">
          <Link
            to={passport.registered ? "/demo/passport" : "/demo/join"}
            className="grid h-12 w-full place-items-center rounded-full text-sm font-semibold tracking-wide shadow"
            style={{
              backgroundColor: "var(--event-button-primary-bg)",
              color: "var(--event-button-primary-fg)",
            }}
          >
            {passport.registered ? "View my passport" : "Start passport"}
          </Link>
        </div>

        {/* Quick links */}
        <section className="mt-6 grid grid-cols-2 gap-3">
          <QuickTile to="/demo/wineries" icon={<MapPin className="h-5 w-5" />} label="Wineries" />
          <QuickTile to="/demo/offers" icon={<Tag className="h-5 w-5" />} label="Offers" />
          <QuickTile to="/demo/trail-map" icon={<Stamp className="h-5 w-5" />} label="Trail Map" />
          <QuickTile to="/demo/rewards" icon={<Trophy className="h-5 w-5" />} label="Prizes" />
        </section>

        <div className="mt-8 flex justify-center">
          <PoweredByGetStampd variant="trail" />
        </div>
      </main>
    </DemoShell>
  );
}

function QuickTile({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl border p-4 shadow-sm transition hover:shadow-md"
      style={{
        borderColor: "var(--event-card-border)",
        backgroundColor: "var(--event-card-bg)",
        color: "var(--event-card-heading)",
      }}
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{
          backgroundColor: "color-mix(in srgb, var(--event-primary) 12%, transparent)",
          color: "var(--event-primary)",
        }}
      >
        {icon}
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  );
}
