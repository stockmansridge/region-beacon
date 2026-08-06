import { buildEventHref, eventNavBaseFromPathname } from "@/components/public-nav-context";
const base = eventNavBaseFromPathname("/live/orange-wine-quest/venues");
console.log("base:", base);
for (const to of ["/", "/join", "/venues", "/offers", "/map", "/leaderboard", "/prizes", "/faq", "/terms-privacy", "/scan"]) {
  console.log(to, "->", buildEventHref({ to, base }), "| tenant:", buildEventHref({ to, base: "" }));
}
console.log("venue:", buildEventHref({ to: "/venues/$venueId", base, params: { venueId: "abc 1" } }));
