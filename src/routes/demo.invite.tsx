import { createFileRoute, Link } from "@tanstack/react-router";
import { TrailShell } from "@/components/trail-shell";
import { UserPlus, Share2, ArrowLeft, Sparkles } from "lucide-react";

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";

export const Route = createFileRoute("/demo/invite")({
  head: () => ({
    meta: [
      { title: "Invite friends — GetStampd Demo" },
      { name: "description", content: "Demo invite friends preview." },
    ],
  }),
  component: DemoInvite,
});

function DemoInvite() {
  return (
    <TrailShell
      eventName="Cargo Road Wine Trail"
      monogram="CR"
      primaryColor={PRIMARY}
      accentColor={ACCENT}
      showBottomNav
      activeNav="more"
    >
      <div className="mb-3 rounded-full border border-dashed border-[#C9A24A]/60 bg-[#FBF5E8] px-3 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-[#8A7E66]">
        Demo · sample invite screen
      </div>

      <section className="relative overflow-hidden rounded-3xl border border-[#1F3D2B]/40 bg-gradient-to-br from-[#162A1F] via-[#1F3D2B] to-[#264A35] p-7 text-[#F6EFE2] shadow-lg">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#C9A24A]/20" />
        <div className="absolute -bottom-12 -left-12 h-44 w-44 rounded-full bg-[#B5572A]/20" />
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, #C9A24A 1px, transparent 1.5px), radial-gradient(circle at 70% 80%, #F6EFE2 1px, transparent 1.5px)", backgroundSize: "32px 32px, 48px 48px" }} />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#F6D98A]">
            <Sparkles className="h-3 w-3" />
            Better together
          </div>
          <h1 className="font-trail-serif mt-3 text-3xl font-semibold leading-tight">
            Trail together,<br />earn together.
          </h1>
          <p className="mt-3 text-sm text-[#E8DFCB]">
            Bring a friend along the wine trail. When they collect their first stamp,
            you both get a bonus entry into the prize draw.
          </p>
        </div>
      </section>

      <section className="mt-5 space-y-3">
        <button
          className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold text-[#F6EFE2] shadow-sm transition hover:opacity-95"
          style={{ backgroundColor: PRIMARY }}
          onClick={() => {}}
        >
          <UserPlus className="h-4 w-4" />
          Invite friends
        </button>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 px-4 py-3.5 text-sm font-semibold transition hover:bg-[#FBF5E8]"
          style={{ borderColor: ACCENT, color: ACCENT }}
          onClick={() => {}}
        >
          <Share2 className="h-4 w-4" />
          Share your passport
        </button>
      </section>

      <section className="mt-5 rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-4">
        <h3 className="font-trail-serif text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: PRIMARY }}>
          How it works
        </h3>
        <ol className="mt-3 space-y-2.5 text-sm text-[#5C5547]">
          {[
            "Send your friends a personal trail invite.",
            "They join and grab their first stamp at any winery.",
            "You both earn a bonus prize-draw entry.",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-[#F6EFE2]"
                style={{ backgroundColor: ACCENT }}
              >
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-6 text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[#A8A091]">
          Demo only · no invites are sent
        </p>
        <Link
          to="/demo/more"
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#E6DCC7] bg-[#FBF5E8] px-4 py-2 text-sm font-medium text-[#2A2620] transition hover:bg-[#EFE6D2]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to menu
        </Link>
      </div>
    </TrailShell>
  );
}
