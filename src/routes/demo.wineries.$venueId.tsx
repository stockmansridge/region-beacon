import { createFileRoute, Link } from "@tanstack/react-router";
import { TrailShell } from "@/components/trail-shell";
import { Check, MapPin, Phone, Globe, ArrowLeft, Clock } from "lucide-react";

const PRIMARY = "#1F3D2B";
const ACCENT = "#B5572A";
const CREAM = "#F6EFE2";

type VenueDetail = {
  id: string;
  name: string;
  description: string;
  address: string;
  phone: string;
  website: string;
  hours: string;
  visited: boolean;
  imageColor: string;
};

const DETAILS: Record<string, VenueDetail> = {
  stockmans: {
    id: "stockmans",
    name: "Stockman's Ridge Wines",
    description:
      "Award-winning cool-climate wines in a relaxed country setting. Taste their signature Shiraz and Chardonnay while enjoying panoramic vineyard views.",
    address: "235 Canobolas Road, Orange NSW 2800",
    phone: "(02) 6365 3279",
    website: "stockmansridge.com.au",
    hours: "Fri–Sun 10am–5pm",
    visited: true,
    imageColor: "#3d5c3f",
  },
  rowlee: {
    id: "rowlee",
    name: "Rowlee Wines",
    description:
      "A family-owned boutique winery producing elegant, hand-crafted wines. Their cellar door offers a intimate tasting experience with vineyard views.",
    address: "245 Nashdale Lane, Nashdale NSW 2800",
    phone: "(02) 6365 3344",
    website: "rowlee.com.au",
    hours: "Thu–Mon 11am–5pm",
    visited: true,
    imageColor: "#8b4513",
  },
  nashdale: {
    id: "nashdale",
    name: "Nashdale Lane",
    description:
      "A rustic cellar door surrounded by rolling hills and vines. Specialising in small-batch wines with a focus on sustainability and terroir.",
    address: "123 Nashdale Road, Nashdale NSW 2800",
    phone: "(02) 6365 1122",
    website: "nashdalelane.com.au",
    hours: "Fri–Sun 10am–4pm",
    visited: false,
    imageColor: "#6b4226",
  },
  ferment: {
    id: "ferment",
    name: "Ferment",
    description:
      "An urban cellar door in the heart of Orange. Natural wines, craft ferments, and a curated selection of local produce in a contemporary space.",
    address: "142 Summer Street, Orange NSW 2800",
    phone: "(02) 6360 8888",
    website: "fermentorange.com.au",
    hours: "Wed–Sun 12pm–8pm",
    visited: false,
    imageColor: "#7a4e3e",
  },
  heifer: {
    id: "heifer",
    name: "Heifer Station Wines",
    description:
      "A charming vineyard with a fun, approachable tasting experience. Known for their bold reds and friendly, knowledgeable staff.",
    address: "1032 The Escort Way, Borenore NSW 2800",
    phone: "(02) 6365 7788",
    website: "heiferstation.com.au",
    hours: "Fri–Sun 10am–5pm",
    visited: false,
    imageColor: "#4a5d23",
  },
  cargo: {
    id: "cargo",
    name: "Cargo Road Cellars",
    description:
      "Boutique family vineyard specialising in Chardonnay and Pinot Noir. A warm welcome awaits at their intimate cellar door.",
    address: "487 Cargo Road, Cargo NSW 2804",
    phone: "(02) 6365 4455",
    website: "cargoroadcellars.com.au",
    hours: "Sat–Sun 11am–4pm",
    visited: false,
    imageColor: "#5c4033",
  },
  smallacres: {
    id: "smallacres",
    name: "Small Acres Cyder",
    description:
      "Craft cider made from heritage apples grown in the Orange region. Their tasting room offers a refreshing alternative to traditional wine trails.",
    address: "155 Boree Lane, Borenore NSW 2800",
    phone: "(02) 6365 2233",
    website: "smallacrescyder.com.au",
    hours: "Fri–Sun 11am–5pm",
    visited: false,
    imageColor: "#8fbc8f",
  },
  agrestic: {
    id: "agrestic",
    name: "The Agrestic Grocer",
    description:
      "A gourmet grocer and providore celebrating local produce. Stop in for artisan cheeses, charcuterie, and curated wine selections.",
    address: "219 Summer Street, Orange NSW 2800",
    phone: "(02) 6360 3333",
    website: "theagrestic.com.au",
    hours: "Tue–Sun 9am–5pm",
    visited: false,
    imageColor: "#a0522d",
  },
};

export const Route = createFileRoute("/demo/wineries/$venueId")({
  head: () => ({
    meta: [
      { title: "Venue — GetStampd Demo" },
      { name: "description", content: "Demo venue detail preview." },
    ],
  }),
  component: DemoVenueDetail,
});

function DemoVenueDetail() {
  const { venueId } = Route.useParams();
  const venue = DETAILS[venueId] ?? DETAILS["stockmans"];

  return (
    <TrailShell
      eventName="Orange Wine Trail"
      monogram="OW"
      primaryColor={PRIMARY}
      accentColor={ACCENT}
      showBottomNav
      activeNav="wineries"
      venueLabelPlural="Wineries"
      topLeft={
        <Link
          to="/demo/wineries"
          className="flex items-center gap-1 text-sm font-medium"
          style={{ color: PRIMARY }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      }
    >
      {/* Hero image placeholder */}
      <div
        className="relative -mx-4 -mt-5 h-56 w-[calc(100%+2rem)] overflow-hidden"
        style={{ backgroundColor: venue.imageColor }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <WineIcon className="h-16 w-16 text-white/20" />
        </div>
        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 60%)",
          }}
        />
        {/* Visited badge */}
        {venue.visited && (
          <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold backdrop-blur-sm"
            style={{ color: PRIMARY }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            Visited
          </div>
        )}
        {/* Name overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h1 className="font-trail-serif text-2xl font-semibold text-white">
            {venue.name}
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="mt-5 space-y-5">
        {/* Description */}
        <p className="text-sm leading-relaxed text-[#5A5348]">
          {venue.description}
        </p>

        {/* Info cards */}
        <div className="space-y-2.5">
          <InfoRow icon={<MapPin className="h-4 w-4" />}>
            {venue.address}
          </InfoRow>
          <InfoRow icon={<Phone className="h-4 w-4" />}>
            {venue.phone}
          </InfoRow>
          <InfoRow icon={<Globe className="h-4 w-4" />}>
            {venue.website}
          </InfoRow>
          <InfoRow icon={<Clock className="h-4 w-4" />}>
            {venue.hours}
          </InfoRow>
        </div>

        {/* Visit state card */}
        <div
          className="flex items-center gap-3 rounded-2xl border p-4"
          style={{
            borderColor: venue.visited ? `${PRIMARY}20` : "#E6DCC7",
            backgroundColor: venue.visited ? `${PRIMARY}08` : "#FBF5E8",
          }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{
              backgroundColor: venue.visited ? PRIMARY : "transparent",
              color: venue.visited ? CREAM : ACCENT,
              border: venue.visited ? undefined : `2px solid ${ACCENT}`,
            }}
          >
            {venue.visited ? (
              <Check className="h-4 w-4" strokeWidth={3} />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
          </div>
          <div>
            <div
              className="text-sm font-semibold"
              style={{ color: venue.visited ? PRIMARY : ACCENT }}
            >
              {venue.visited ? "You've visited here" : "Not yet visited"}
            </div>
            <div className="text-[11px] text-[#7A6F5C]">
              {venue.visited
                ? "Stamp collected on your passport"
                : "Visit and check in to collect your stamp"}
            </div>
          </div>
        </div>

        {/* Back link */}
        <Link
          to="/demo/wineries"
          className="flex items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-semibold transition active:scale-[0.98]"
          style={{
            borderColor: PRIMARY,
            color: PRIMARY,
            backgroundColor: CREAM,
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to wineries
        </Link>
      </div>
    </TrailShell>
  );
}

function InfoRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-sm text-[#2A2620]">
      <span className="mt-0.5 text-[#7A6F5C]">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function WineIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M8 22h8" />
      <path d="M7 10h10" />
      <path d="M9.5 10L9 3.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5L15 10" />
      <path d="M12 10v12" />
    </svg>
  );
}
