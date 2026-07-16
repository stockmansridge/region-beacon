// Demo snapshot for the "Cargo Road Wine Quest" event.
//
// This is a static, hardcoded snapshot used ONLY by /demo/* routes. It never
// hits Supabase. No demo action ever touches the real event's data.
//
// Real event public_slug: evt-745pamk2vg. If the real event changes, this
// snapshot goes stale — that's intentional (isolation over freshness).

import { useSyncExternalStore } from "react";

export const DEMO_EVENT = {
  event_id: "demo-cargo-road",
  name: "Cargo Road Wine Quest",
  public_slug: "evt-745pamk2vg",
  description:
    "Discover, Sip & Win: Explore the trail, unlock exclusive offers and win prizes.",
  starts_at: "2026-07-06T00:06:00+00:00",
  ends_at: "2026-07-25T09:07:00+00:00",
  timezone: "Australia/Sydney",
  logo_path:
    "c509e63c-78d2-42b9-b132-cbd5a88857f3/a6583ee9-c482-47b2-83a8-35313a9b5d69/logo/07c5ecbc-7590-4068-a739-4a2490a649c1.png",
  cover_path:
    "c509e63c-78d2-42b9-b132-cbd5a88857f3/a6583ee9-c482-47b2-83a8-35313a9b5d69/cover/897f84d8-d15d-446c-b2fa-dbd04a663416.png",
  primary_color: "#1F3D2B",
  accent_color: "#B5572A",
  font_family: "Inter",
  welcome_copy:
    "Explore six unique wineries, unlock exclusive offers, earn points and go in the draw to win fantastic prizes. Check in at participating venues, collect bonus points with wine purchases, and discover your new favourite cellar doors along the way.\nSip. Scan. Win.",
  terms_url: null as string | null,
  venue_label_singular: "Winery",
  venue_label_plural: "Wineries",
} as const;

export type DemoVenue = {
  venue_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  order_index: number;
  description: string;
  offer_summary: string | null;
  points_value: number;
};

export const DEMO_VENUES: DemoVenue[] = [
  {
    venue_id: "demo-rowlee",
    name: "Rowlee Wines",
    address: "19 Lake Canobolas Rd, Nashdale NSW 2800, Australia",
    lat: -33.293933,
    lng: 149.027661,
    order_index: 1,
    description:
      "A family-owned vineyard on the slopes of Mount Canobolas known for elegant cool-climate whites and single-vineyard Nebbiolo.",
    offer_summary: "Complimentary tasting with any purchase",
    points_value: 10,
  },
  {
    venue_id: "demo-cargo-road",
    name: "Cargo Road Wines",
    address: "1064 Cargo Rd, Lidster NSW 2800, Australia",
    lat: -33.292467,
    lng: 148.974609,
    order_index: 2,
    description:
      "One of Orange's original cellar doors, famous for Zinfandel and a warm, unpretentious tasting room overlooking the vines.",
    offer_summary: "10% off any 6-pack",
    points_value: 10,
  },
  {
    venue_id: "demo-stockmans",
    name: "Stockman's Ridge Wines",
    address: "21 Boree La, Lidster NSW 2800, Australia",
    lat: -33.293966,
    lng: 148.953977,
    order_index: 3,
    description:
      "A rugged ridgetop cellar door with sweeping views. Try the estate Shiraz and the crisp Rider Riesling.",
    offer_summary: "Free platter add-on for two",
    points_value: 10,
  },
  {
    venue_id: "demo-canobolas",
    name: "Canobolas Wines",
    address: "76 Boree La, Lidster NSW 2800, Australia",
    lat: -33.292054,
    lng: 148.960307,
    order_index: 4,
    description:
      "Small-batch cool-climate wines from one of the highest vineyards in Orange. Book ahead for a hosted flight.",
    offer_summary: null,
    points_value: 10,
  },
  {
    venue_id: "demo-strawhouse",
    name: "Strawhouse Wines",
    address: "116 Boree La, Lidster NSW 2800, Australia",
    lat: -33.288518,
    lng: 148.961436,
    order_index: 5,
    description:
      "A boutique straw-bale cellar door pouring characterful Chardonnay, Pinot Noir and a rotating natural wine list.",
    offer_summary: "Bonus glass with any tasting flight",
    points_value: 10,
  },
  {
    venue_id: "demo-dindima",
    name: "Dindima Wines",
    address: "859 Cargo Rd, Nashdale NSW 2800, Australia",
    lat: -33.297398,
    lng: 148.998718,
    order_index: 6,
    description:
      "Family-run Italian-influenced winery. Sangiovese and Vermentino shine here — the pizza oven fires on weekends.",
    offer_summary: "Free pizza slice with tasting",
    points_value: 10,
  },
];

export type DemoOffer = {
  offer_id: string;
  venue_id: string;
  title: string;
  description: string;
  redemption_instructions: string;
};

export const DEMO_OFFERS: DemoOffer[] = DEMO_VENUES.filter((v) => v.offer_summary).map(
  (v) => ({
    offer_id: `demo-offer-${v.venue_id}`,
    venue_id: v.venue_id,
    title: v.offer_summary!,
    description: `Exclusive to Cargo Road Wine Quest passport holders at ${v.name}.`,
    redemption_instructions:
      "Show your passport screen and check-in stamp at the cellar door to redeem.",
  }),
);

export type DemoAward = {
  award_id: string;
  title: string;
  description: string;
  points_required: number;
};

export const DEMO_AWARDS: DemoAward[] = [
  {
    award_id: "demo-award-1",
    title: "Wine Quest Tote",
    description: "Collect stamps at any 3 venues to unlock an exclusive canvas tote.",
    points_required: 30,
  },
  {
    award_id: "demo-award-2",
    title: "Mystery Mixed Six",
    description: "Reach 5 stamps to go in the draw for a mixed six-pack from trail wineries.",
    points_required: 50,
  },
  {
    award_id: "demo-award-3",
    title: "Grand Prize: Weekend Escape",
    description:
      "Complete the full trail (all 6 venues + 20 bonus points) to enter the grand prize draw.",
    points_required: 80,
  },
];

export type DemoBonusChallenge = {
  bonus_id: string;
  name: string;
  points: number;
  description: string;
};

export const DEMO_BONUS_CHALLENGES: DemoBonusChallenge[] = [
  {
    bonus_id: "demo-bonus-purchase",
    name: "Wine purchase bonus",
    points: 20,
    description: "Purchase any bottle at the cellar door and scan the bonus QR at checkout.",
  },
];

export const DEMO_ANNOUNCEMENTS: { title: string; body: string }[] = [
  {
    title: "Weekend food trucks",
    body: "Rowlee and Dindima are hosting food trucks every Saturday of the quest.",
  },
];

export const DEMO_FAQ: { question: string; answer: string }[] = [
  {
    question: "How does the passport work?",
    answer:
      "Sign up once, then check in at each cellar door by scanning their QR code. Every stamp earns points toward prize draws.",
  },
  {
    question: "Do I need to visit every venue?",
    answer:
      "No — but the more stamps you collect, the more rewards you unlock and the better your prize-draw odds.",
  },
  {
    question: "How long does the quest run?",
    answer: "From 6 July to 25 July 2026. Prizes are drawn on 28 July.",
  },
];

// ---------- fake in-memory passport (localStorage-backed) ------------------

const STORAGE_KEY = "demo-cargo-road-passport-v1";

type DemoPassportState = {
  registered: boolean;
  firstName: string | null;
  stampedVenueIds: string[];
  bonusClaimedIds: string[];
};

const emptyState: DemoPassportState = {
  registered: false,
  firstName: null,
  stampedVenueIds: [],
  bonusClaimedIds: [],
};

const listeners = new Set<() => void>();
let cachedState: DemoPassportState = emptyState;
let hydrated = false;

function load(): DemoPassportState {
  if (typeof window === "undefined") return emptyState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState;
    const parsed = JSON.parse(raw);
    return {
      registered: Boolean(parsed?.registered),
      firstName: typeof parsed?.firstName === "string" ? parsed.firstName : null,
      stampedVenueIds: Array.isArray(parsed?.stampedVenueIds) ? parsed.stampedVenueIds : [],
      bonusClaimedIds: Array.isArray(parsed?.bonusClaimedIds) ? parsed.bonusClaimedIds : [],
    };
  } catch {
    return emptyState;
  }
}

function save(next: DemoPassportState) {
  cachedState = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  if (!hydrated) {
    hydrated = true;
    cachedState = load();
  }
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): DemoPassportState {
  if (!hydrated && typeof window !== "undefined") {
    hydrated = true;
    cachedState = load();
  }
  return cachedState;
}

function getServerSnapshot(): DemoPassportState {
  return emptyState;
}

export function useDemoPassport() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const visited = state.stampedVenueIds.length;
  const total = DEMO_VENUES.length;
  const stampPoints = visited * 10;
  const bonusPoints = state.bonusClaimedIds.reduce((sum, id) => {
    const b = DEMO_BONUS_CHALLENGES.find((c) => c.bonus_id === id);
    return sum + (b?.points ?? 0);
  }, 0);
  const points = stampPoints + bonusPoints;

  return {
    ...state,
    visited,
    total,
    points,
    hasStamp: (venueId: string) => state.stampedVenueIds.includes(venueId),
    hasBonus: (bonusId: string) => state.bonusClaimedIds.includes(bonusId),
    register: (firstName: string) => {
      save({ ...cachedState, registered: true, firstName: firstName.trim() || "Guest" });
    },
    addStamp: (venueId: string) => {
      if (cachedState.stampedVenueIds.includes(venueId)) return;
      save({
        ...cachedState,
        registered: true,
        stampedVenueIds: [...cachedState.stampedVenueIds, venueId],
      });
    },
    claimBonus: (bonusId: string) => {
      if (cachedState.bonusClaimedIds.includes(bonusId)) return;
      save({
        ...cachedState,
        registered: true,
        bonusClaimedIds: [...cachedState.bonusClaimedIds, bonusId],
      });
    },
    reset: () => save(emptyState),
  };
}
