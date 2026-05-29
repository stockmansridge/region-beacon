import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { TrailShell } from "@/components/trail-shell";
import { Tag, Clock, Check } from "lucide-react";

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";

type Offer = {
  id: string;
  title: string;
  venue: string;
  description: string;
  validUntil: string;
  status: "available" | "redeemed";
  badge?: "New" | "Hot";
};

const OFFERS: Offer[] = [
  {
    id: "rowlee-10",
    title: "10% Off Tastings",
    venue: "Rowlee Wines",
    description: "Show this offer at the cellar door for 10% off your tasting flight.",
    validUntil: "30 June 2026",
    status: "available",
    badge: "New",
  },
  {
    id: "nashdale-cheese",
    title: "Free Cheese Plate",
    venue: "Nashdale Lane",
    description: "Complimentary cheese plate with any two-glass tasting purchase.",
    validUntil: "15 July 2026",
    status: "available",
    badge: "Hot",
  },
  {
    id: "ferment-10",
    title: "$10 Off Purchases",
    venue: "Ferment",
    description: "$10 off any in-store purchase over $50. Limit one per visitor.",
    validUntil: "Redeemed 12 May",
    status: "redeemed",
  },
];

type Filter = "all" | "available" | "redeemed";

export const Route = createFileRoute("/demo/offers")({
  head: () => ({
    meta: [
      { title: "Special Offers — GetStampd Demo" },
      { name: "description", content: "Demo offers preview." },
    ],
  }),
  component: DemoOffers,
});

function DemoOffers() {
  const [filter, setFilter] = useState<Filter>("all");
  const offers = OFFERS.filter((o) =>
    filter === "all" ? true : o.status === filter,
  );

  return (
    <TrailShell
      eventName="Cargo Road Wine Trail"
      monogram="CR"
      primaryColor={PRIMARY}
      accentColor={ACCENT}
      showBottomNav
      activeNav="rewards"
    >
      <div className="mb-3 rounded-full border border-dashed border-[#C9A24A]/60 bg-[#FBF5E8] px-3 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-[#8A7E66]">
        Demo · sample offers
      </div>

      <section className="rounded-3xl border border-[#E6DCC7] bg-[#FBF5E8] p-6 text-center shadow-sm">
        <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#C9A24A]">
          Member perks
        </div>
        <h1 className="font-trail-serif mt-1 text-2xl font-semibold" style={{ color: PRIMARY }}>
          Special Offers
        </h1>
        <p className="mt-2 text-sm text-[#7A6F5C]">
          Show these at participating venues to redeem.
        </p>
      </section>

      <div className="mt-5 flex gap-2">
        {(["all", "available", "redeemed"] as Filter[]).map((f) => {
          const isActive = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="flex-1 rounded-full border px-3 py-2 text-[12px] font-semibold capitalize transition"
              style={{
                backgroundColor: isActive ? PRIMARY : "#FBF5E8",
                color: isActive ? "#F6EFE2" : "#7A6F5C",
                borderColor: isActive ? PRIMARY : "#E6DCC7",
              }}
            >
              {f}
            </button>
          );
        })}
      </div>

      <section className="mt-4 space-y-3">
        {offers.map((o) => (
          <OfferCard key={o.id} offer={o} />
        ))}
        {offers.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#E6DCC7] bg-[#FBF5E8] p-6 text-center text-sm text-[#7A6F5C]">
            No offers in this view.
          </div>
        )}
      </section>
    </TrailShell>
  );
}

function OfferCard({ offer }: { offer: Offer }) {
  const redeemed = offer.status === "redeemed";
  return (
    <article
      className="relative overflow-hidden rounded-2xl border border-[#E6DCC7] bg-[#FBF5E8] p-4 shadow-sm"
      style={{ opacity: redeemed ? 0.78 : 1 }}
    >
      <div
        className="absolute left-0 top-0 h-full w-1.5"
        style={{ backgroundColor: redeemed ? "#9AA3A8" : ACCENT }}
      />
      <div className="flex items-start gap-3 pl-2">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{
            backgroundColor: redeemed ? "#ECEEF0" : `${ACCENT}1A`,
            color: redeemed ? "#7E8A92" : ACCENT,
          }}
        >
          {redeemed ? <Check className="h-5 w-5" /> : <Tag className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8A7E66]">
                {offer.venue}
              </div>
              <h3 className="font-trail-serif text-lg font-semibold leading-tight" style={{ color: PRIMARY }}>
                {offer.title}
              </h3>
            </div>
            {offer.badge && !redeemed && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#F6EFE2]"
                style={{ backgroundColor: offer.badge === "New" ? PRIMARY : ACCENT }}
              >
                {offer.badge}
              </span>
            )}
            {redeemed && (
              <span className="rounded-full bg-[#ECEEF0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#7E8A92]">
                Redeemed
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-[#5C5547]">{offer.description}</p>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-[11px] text-[#8A7E66]">
              <Clock className="h-3 w-3" />
              {redeemed ? offer.validUntil : `Valid until ${offer.validUntil}`}
            </span>
            {!redeemed && (
              <button
                className="rounded-full px-3 py-1 text-[11px] font-semibold text-[#F6EFE2]"
                style={{ backgroundColor: PRIMARY }}
              >
                Redeem
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
