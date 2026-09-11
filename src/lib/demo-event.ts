// Demo snapshot for the "Orange Wine Quest" event.
//
// This is a static, hardcoded snapshot used ONLY by /demo/* routes. It never
// hits Supabase. No demo action ever touches the real event's data.
//
// Real event public_slug: evt-bg1beh2o0w. If the real event changes, this
// snapshot goes stale — that's intentional (isolation over freshness).

import { useSyncExternalStore } from "react";

export const DEMO_EVENT = {
  event_id: "demo-orange-wine-quest",
  name: "Orange Wine Quest",
  public_slug: "evt-bg1beh2o0w",
  description: "Your Orange Wine Festival adventure starts here. Taste, collect stamps and discover the people, places and wines that make Orange one of Australia's leading cool-climate wine regions.",
  starts_at: "2026-10-15T13:00:00+00:00",
  ends_at: "2026-10-25T21:00:00+00:00",
  timezone: "Australia/Sydney",
  logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/logo/8481f6cb-589d-4335-a596-589dbb82e1cd.png",
  cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/cover/6d7f5560-05e5-4121-ad04-4bb07a695a2a.jpg",
  primary_color: "#C0825C",
  accent_color: "#41372E",
  font_family: "Inter",
  welcome_copy: "Your Orange Wine Festival adventure starts here. Taste, collect stamps and discover the people, places and wines that make Orange one of Australia's leading cool-climate wine regions.",
  terms_url: null as string | null,
  venue_label_singular: "Cellar Door",
  venue_label_plural: "Cellar Doors",
  page_background_color: "#FAF7EB",
  page_heading_color: "#41372E",
  hero_bg_color: "#41372E",
  hero_fg_color: "#E4D69C",
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
  logo_path: string | null;
  cover_path: string | null;
  website_url: string | null;
  phone: string | null;
};

export const DEMO_VENUES: DemoVenue[] = [
  {
    venue_id: "demo-angullong-wines",
    name: "Angullong Wines",
    address: "The Old Bluestone Stables Cnr Park &, Victoria St, Millthorpe NSW 2798",
    lat: -33.445851,
    lng: 149.184925,
    order_index: 1,
    description: "Angullong is family owned and operated and is one of Orange's premium wineries, specialising in emerging and alternative Italian varieties. Visit our charming cellar door, set in the historic village of Millthorpe. Meet the family, soak up the Angullong story, learn about its rich pastoral history and taste our extensive range of wines.",
    offer_summary: "Join our wine club to receive a free bottle of wine",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/7deebf03-eb19-4f68-a9fb-0bb9f9b8adb8/logo/031652f6-f4df-4a39-96c5-6aaec6af09d3.jpg",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/7deebf03-eb19-4f68-a9fb-0bb9f9b8adb8/cover/0c053b84-89a5-4684-9334-b6c2f71383eb.png",
    website_url: "https://www.angullong.com.au",
    phone: "02 6366 3444",
  },
  {
    venue_id: "demo-brangayne-wines",
    name: "Brangayne Wines",
    address: "837 Pinnacle Rd, Canobolas NSW 2800",
    lat: -33.334399,
    lng: 149.058086,
    order_index: 2,
    description: "Brangayne of Orange is a family-owned and operated vineyard and cellar door, producing distinctive cool-climate wines from its two high elevation sites for more than 30 years. Enjoy a guided wine tasting in the unique cellar door featuring Sparkling, Riesling, and Pinot Noir, along with Brangayne's signature Tristan blend (Cabernet Sauvignon, Shiraz and Merlot) and Isolde Reserve Chardonnay.\n\nThe Hoskins family has farmed the property since the 1930s. Originally an orchard growing apples, pears, peaches and cherries, the farm was transformed into a vineyard in 1994 and continues today as a family-owned wine business.",
    offer_summary: "Receive 10% off a mixed case of wine (12 bottles)",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/fc0fae87-ee97-492b-bfe6-4af177bd2493/logo/3a102ba2-fb0f-4bcc-b9b3-e06c1fdc1732.jpg",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/fc0fae87-ee97-492b-bfe6-4af177bd2493/cover/54a38002-5041-4429-a9e1-17d5e4c3ac8f.jpg",
    website_url: "https://www.brangayne.com.au",
    phone: "02 6365 3229",
  },
  {
    venue_id: "demo-byrne-farm",
    name: "Byrne Farm",
    address: "841 Cargo Rd, Nashdale NSW 2800",
    lat: -33.297556,
    lng: 149.000271,
    order_index: 3,
    description: "Set high on the northern slopes of Mount Canobolas in Nashdale, Byrne Farm is a family-owned vineyard producing small-batch cool-climate wines from an exceptional 40-acre site at 900 metres elevation. Planted on rich volcanic soils, the vineyard has a particular focus on Pinot Noir and Chardonnay, alongside a carefully crafted range of wines that showcase the character of Orange’s high-altitude wine country.",
    offer_summary: "Receive 10% off mixed cases of wine (12 bottles)",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/06887421-c262-40d1-9edf-c0c568026cb2/logo/a14c4934-4e4d-4282-8b15-6e3f5dc37a48.jpg",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/06887421-c262-40d1-9edf-c0c568026cb2/cover/1e07b231-cb86-403c-b916-d23e0bb0df4b.jpg",
    website_url: "https://www.byrnefarm.com.au",
    phone: "0413 018 511",
  },
  {
    venue_id: "demo-canobolas-wines",
    name: "Canobolas Wines",
    address: "76 Boree Lane, Lidster, NSW, 2800",
    lat: -33.29275,
    lng: 148.960934,
    order_index: 4,
    description: "Established in 1985, Canobolas Wines is one of Orange’s oldest and most celebrated vineyards. Set high on the slopes of Mount Canobolas, the historic vineyard is rooted in deep volcanic soils and today is farmed with a focus on regenerative principles and minimal-intervention winemaking. Discover elegant, expressive cool-climate wines from a site renowned for Chardonnay, Cabernet Franc and Cabernet Sauvignon.",
    offer_summary: "Free Tasting when you purchase 4 or more bottles of wine!",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/9c9d1772-7b33-41af-827a-5cb713bcf29c/logo/1c22b752-d510-4335-a1f0-dfa6c30195e5.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/9c9d1772-7b33-41af-827a-5cb713bcf29c/cover/33515fd6-72bf-4172-b224-5d6d2c77e2b1.jpg",
    website_url: "https://www.canobolaswines.com.au",
    phone: "0403581312",
  },
  {
    venue_id: "demo-cargo-road-wines",
    name: "Cargo Road Wines",
    address: "1064 Cargo Rd LIDSTER, Orange NSW 2800",
    lat: -33.292354,
    lng: 148.974592,
    order_index: 5,
    description: "Established in 1983, Cargo Road Wines is one of the oldest vineyards in the Orange region. High on the northern slopes of Mount Canobolas in Orange NSW, the vines grow slowly and naturally in deep red basalt soils shaped by altitude, seasons and care rather than chemicals. This cool climate environment allows fruit to ripen with balance and clarity, guided by place rather than intervention.\n\nCargo Road Wines is the life’s work of winemaker and farmer James, whose approach has always been shaped by listening to the land first. From the earliest plantings, James was drawn to this site for its elevation, soils and sense of quiet potential. Rather than imposing a formula, his focus has been on observation, patience and allowing the vineyard to find its own balance over time.",
    offer_summary: null,
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/184eccc2-23e1-41e0-8a17-331f97d52cdb/logo/d7420126-fc97-470e-a090-0eb467795232.jpg",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/184eccc2-23e1-41e0-8a17-331f97d52cdb/cover/c764e22d-5c2b-4be5-abcb-cd865d894465.jpg",
    website_url: "https://www.cargoroadwines.com",
    phone: "02 6365 6100",
  },
  {
    venue_id: "demo-chalou-wines",
    name: "Chalou Wines",
    address: "569 Emu Swamp Rd EMU SWAMP",
    lat: -33.320697,
    lng: 149.194596,
    order_index: 6,
    description: "ChaLou is a family-run winery in Orange, NSW, owned by winemakers Nadja Wallington and Steve Mobbs. From bud to bottle, every wine is grown and made on our high-altitude estate, with a hands-on approach that follows the seasons and celebrates the place we call home.\n\nSince launching ChaLou, Nadja and Steve have built a reputation for thoughtful, expressive cool-climate wines, with a focus on quality over quantity. ChaLou was named 2025 Halliday Dark Horse Winery and holds 5-star winery status, while Nadja was named Young Winemaker of the Year in 2022, and is a 2026 Rising Star finalist.",
    offer_summary: "Tasting for $20 per person",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/8496cbc1-9e99-49cd-a01e-418b2a4183b8/logo/1843669c-39d9-4ec4-ba59-47b0f796f445.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/8496cbc1-9e99-49cd-a01e-418b2a4183b8/cover/29b9afa2-1b5b-42ce-8b4b-0fe6bc97367a.png",
    website_url: "https://www.chalouwines.com.au",
    phone: "0459 689 696",
  },
  {
    venue_id: "demo-colmar-estate",
    name: "Colmar Estate",
    address: "790 Pinnacle Road Orange, NSW 2800",
    lat: -33.329237,
    lng: 149.058052,
    order_index: 7,
    description: "Colmar Estate is a family-owned winery focused on making premium, cool climate wines from hand-picked fruit.\nLocated just 10 minutes from Orange, the cellar door welcomes you to enjoy an intimate wine tasting experience, with panoramic views of the surrounding vineyard.\nPerched at 980 meters above sea level, Colmar Estate is one of the highest vineyards in the Orange Wine Region. The cool conditions, combined with ancient volcanic soils, create wines of exceptional purity, elegance, and flavour.\nThe estate’s unique terroir supports the growth of Riesling, Pinot Gris, Gewürztraminer, Chardonnay, Syrah and Pinot Noir grapes, which are carefully nurtured into outstanding wines.\nColmar Estate is open every day of the week. While bookings are recommended, walk-ins are always welcome when space permits.",
    offer_summary: "Buy 6 bottles at the cellar door and enjoy a 7th bottle on us",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/3a650f6e-a703-45b7-b11f-e89fc1298711/logo/c69c3a09-24c8-4a3f-96ae-de2222b4281e.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/3a650f6e-a703-45b7-b11f-e89fc1298711/cover/3d84966c-c77c-46df-b364-4f7cdb27739e.jpg",
    website_url: "https://www.colmarestate.com.au",
    phone: "0419 977 270",
  },
  {
    venue_id: "demo-dindima-wines",
    name: "Dindima Wines",
    address: "859 Cargo Rd ORANGE, NSW 2800",
    lat: -33.297211,
    lng: 148.99861,
    order_index: 8,
    description: "Dindima Wines: A Taste of Orange, Savoured Slowly\nVisit Dindima Wines and soak up the relaxed atmosphere of our rustic family-owned cellar door. Meet the winemakers, explore our estate grown cool climate wines and discover distinctive Semillon, Rosé, Shiraz, Muscat and more. Take your time with a tasting, enjoy local produce, the company of others, and experience the warmth of a genuine country cellar door. A memorable stop on your Orange Wine Festival journey.",
    offer_summary: "Buy a 6 pack, (single or mixed varietals) and receive FREE 2 Riedel Overture Magnum Glasses",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/c17241d6-3808-4f5b-ac5a-cdecff2a030e/logo/be7cb41b-5e80-4437-b7d1-cb646dcaad25.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/c17241d6-3808-4f5b-ac5a-cdecff2a030e/cover/e9554d5c-edae-4819-8c69-0c4b4354bb99.jpg",
    website_url: "https://www.dindima.com.au",
    phone: "0408 449 664",
  },
  {
    venue_id: "demo-heifer-station-wines",
    name: "Heifer Station Wines",
    address: "1034 The Escort Way, Orange NSW 2800",
    lat: -33.258962,
    lng: 149.004184,
    order_index: 9,
    description: "Heifer Station is a family-owned, single-vineyard and cellar door nestled on the slopes of Mount Canobolas in Orange, NSW. Sitting around 900 metres above sea level, our 65-acre vineyard produces cool-climate wines packed with character, all grown right here on the property.\n\nBut we’re about more than just good wine. Our historic cellar door, resident farm animals and relaxed country setting make Heifer Station a place to settle in, explore and stay awhile. Whether you’re here for a tasting, a glass in the sunshine or simply to meet the locals (some of whom have four legs), expect great wine, genuine hospitality and plenty of personality.\n\nFrom our vineyard, to your glass - welcome to Heifer Station.",
    offer_summary: "Complimentary Wine Tasting",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/a43d20c9-d252-4879-9630-2a1f2020f950/logo/07b8f66f-67f7-46fa-bcfa-e4bb110b6896.jpg",
    cover_path: null,
    website_url: "https://www.heiferstation.com.au",
    phone: "02 6365 2275",
  },
  {
    venue_id: "demo-highland-heritage",
    name: "Highland Heritage",
    address: "4968 Mitchell Hwy, Orange NSW 2800",
    lat: -33.315986,
    lng: 149.145092,
    order_index: 10,
    description: "Discover a piece of Orange wine history at Highland Heritage, home to one of the region’s pioneering winemaking families and one of its oldest vineyards. Set at 900 metres on rich basalt soils, Highland Heritage produces an extensive range of award-winning cool-climate wines, including distinctive dessert and fortified styles. Visit their welcoming cellar door and experience generations of local winemaking, warm hospitality and plenty to discover in the glass.",
    offer_summary: "Take home a 6-pack of Sauvignon Blanc for just $105 – usually $150. Save $45.",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/bd06350a-7852-465d-b025-b9e55da19a25/logo/06389822-a0b7-4a45-83fe-8b228e3183df.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/bd06350a-7852-465d-b025-b9e55da19a25/cover/794e4df2-4915-42ad-970b-07af683faa13.png",
    website_url: "https://www.highlandheritage.com.au",
    phone: "02 6363 5602",
  },
  {
    venue_id: "demo-macquariedale-organic-wines",
    name: "Macquariedale Organic Wines",
    address: "1335 Pinnacle Rd CANOBOLAS",
    lat: -33.345424,
    lng: 149.017252,
    order_index: 11,
    description: "Macquariedale Organic Wines crafts premium organic, low‑preservative, vegan‑friendly wines with a deep commitment to natural farming and environmental care. Based in the cool‑climate region of Orange, NSW, our family‑run vineyard sits high on the slopes of Mount Canobolas, overlooking the beautiful Towac Valley.\n\nLed by Ross, Derice, and their son Tom, we focus on sustainable viticulture, hands‑on winemaking, and creating a welcoming destination where people can connect, unwind, and enjoy wines that honour the land.\n\nFrom soil to sip, our mission is simple: to nurture the earth, our community, and every bottle we share.",
    offer_summary: "Purchase at the cellar door for your chance to win a Wine Tasting & Grazing Platter experience for four.",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/dc8d81be-c4a4-4c62-a4a4-253f242c7b2b/logo/f9f1fda1-ca9e-44d7-b46a-fe2ac820eaa7.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/dc8d81be-c4a4-4c62-a4a4-253f242c7b2b/cover/1b852e86-8eb0-4038-a1a4-5b1e969ca9a6.jpg",
    website_url: "https://www.macquariedale.com.au",
    phone: "0429 892 812",
  },
  {
    venue_id: "demo-mayfield-vineyard",
    name: "Mayfield Vineyard",
    address: "954 Icely Rd EMU SWAMP, NSW 2800",
    lat: -33.314124,
    lng: 149.195837,
    order_index: 12,
    description: "Located on the eastern slopes of Mount Canobolas, Mayfield Vineyard cellar door is set in a charming historic school house a 10-minute drive from the centre of stunning Orange. Mayfield offers guests the opportunity to taste award winning wines with spectacular views across the vineyards and lakes. Experience an unforgettable stay in the 1910 heritage listed Mayfield Vineyard Homestead, Garden Flat, or one of three cosy cottages.",
    offer_summary: "Join our Wine Club and receive a complimentary bottle from our Estate range",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/2fc921ba-dff7-4210-9822-bd6c48e2761e/logo/45915eeb-a5a3-4a3e-8c8d-cf2a52d531b6.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/2fc921ba-dff7-4210-9822-bd6c48e2761e/cover/8dbbc43b-1f39-4585-b9bd-345424a92c6e.png",
    website_url: "https://www.mayfieldvineyard.com.au",
    phone: "0458 695 260",
  },
  {
    venue_id: "demo-mortimers-wines",
    name: "Mortimers Wines",
    address: "780 Burrendong Way ORANGE,",
    lat: -33.223505,
    lng: 149.090596,
    order_index: 13,
    description: "Mortimers Wines, owned and run by the Mortimer family since 1995. You will likely find them pouring their award winning range at Mortimers heritage listed Schoolhouse Cellar Door (est 1866). The former public school and surrounding gardens have been beautifully restored and makes the perfect place to enjoy some of Orange's finest wines. Named one of Good Food's 15 best Cellar Doors in NSW.",
    offer_summary: null,
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/faa99b18-58f6-4799-99c5-65faefbb1baa/logo/b6916e49-5d87-40de-8d6c-3f49d1e476e6.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/faa99b18-58f6-4799-99c5-65faefbb1baa/cover/49dea0c6-0626-46e1-bb32-f75422c33d07.jpg",
    website_url: "https://www.mortimerswines.com.au/",
    phone: "0447 148 520",
  },
  {
    venue_id: "demo-nashdale-lane-wines",
    name: "Nashdale Lane Wines",
    address: "125 Nashdale Lane NASHDALE",
    lat: -33.283412,
    lng: 149.014759,
    order_index: 14,
    description: "Nashdale Lane Wines’  charming cellar door pairs sweeping vineyard & mountain views making thoughtful, handcrafted wines focussing on Riesling, Chardonnay, Pinot Gris, Pinot Noir as well as alternative varietals.\nGuests enjoy informed wine tastings in a welcoming atmosphere with a newly refreshed palate cleanser (light snack) menu available to enhance the experience. As one of Orange’s star performers in The Real Review Top Wineries Australia, this is a must-visit cellar door for wine lovers.",
    offer_summary: "Buy 6+ bottles and enjoy free shipping, or save 10% when you purchase a mixed case.",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/96a45426-810d-4910-b751-b094b271813f/logo/f5cba7e5-2e1a-4a68-9497-1684f2cd927a.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/96a45426-810d-4910-b751-b094b271813f/cover/bb309fe1-3637-4ee9-be95-9b48ba271dac.jpg",
    website_url: "https://www.nashdalelane.com",
    phone: "0419 012 412",
  },
  {
    venue_id: "demo-orange-mountain-estate",
    name: "Orange Mountain Estate",
    address: "10 Radnedge Lane, Orange NSW 2800",
    lat: -33.251166,
    lng: 148.987295,
    order_index: 15,
    description: "Orange Mountain Estate is a family owned and managed vineyard and winery experience. Terry and Julie are excited to welcome you for tours, tastings and sales.\nPlease join us in our working winery where we will take you on an immersive tour through our sustainable vineyard and traditional winery. Afterward, relax amongst the wine barrels and savour our exquisite hand-crafted wines.\n\nBookings are not essential but highly recommended to ensure you receive the best small group experience. By booking you can sit back and relax with a maximum of 12 people in the winery, ensuring personalized attention in a more intimate setting.",
    offer_summary: "6+ bottles: Free delivery across NSW & ACT.\n12+ bottles: 15% off + free delivery.",
    points_value: 10,
    logo_path: null,
    cover_path: null,
    website_url: "https://www.orangemountain.com.au/visit",
    phone: "02 6365 2626",
  },
  {
    venue_id: "demo-philip-shaw-wines",
    name: "Philip Shaw Wines",
    address: "100 Shiralee Rd, Orange NSW 2800",
    lat: -33.31083,
    lng: 149.078426,
    order_index: 16,
    description: "Discover distinctive cool-climate wines from Koomooloo Vineyard, one of Australia’s highest and coolest vineyards. Planted in 1989, this exceptional Orange site produces handcrafted wines celebrated for their elegance, intensity and varietal character, with an innovative approach that has long set Philip Shaw Wines apart.",
    offer_summary: "Buy any 6 bottles and receive 10% off",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/174f99e6-02bd-4391-95d7-47d8b82d0252/logo/71fc7ef9-2c9b-4cec-b0d6-0780618717c4.jpg",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/174f99e6-02bd-4391-95d7-47d8b82d0252/cover/5e2814e3-8c20-44f9-ac16-c8906b3d7a72.jpg",
    website_url: "https://www.philipshaw.com.au",
    phone: "02 6362 0710",
  },
  {
    venue_id: "demo-printhie-wines",
    name: "Printhie Wines",
    address: "208 Nancarrow Lane, Nashdale, NSW, 2800",
    lat: -33.312992,
    lng: 149.008906,
    order_index: 17,
    description: "Printhie Wines Cellar Door and Restaurant 'Printhie Dining' is owned by the Swift family and is a 5 star Halliday rated winery located in the cool climate region of Orange, NSW. Printhie Wines has forged a reputation for world class wines and is considered one of Australia’s best sparkling producers with the Swift 2011 Blanc de Blancs awarded one of only 16 global Platinum Medals at the 2026 Decanter World Wine Awards. Printhie Wines was also awarded Best Tourism Winery in NSW for 2025 and offers tastings, picnics, sparkling masterclasses, fly fishing and a wine bar (Wed to Sun) including oysters shucked to order from their custom built innovative oyster tank. \nOnline Bookings essential.",
    offer_summary: "Complimentary tasting for 2 valued at $30",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/f763bbbe-8e3a-47b1-89ef-ca53295ac677/logo/a20bead6-6b83-4f92-b87c-e10571a390f2.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/f763bbbe-8e3a-47b1-89ef-ca53295ac677/cover/2c0ac2ee-fff7-4605-8533-44362b261d08.jpg",
    website_url: "https://printhiewines.com.au/",
    phone: "0409 645 075",
  },
  {
    venue_id: "demo-rikard-wines",
    name: "RIKARD Wines",
    address: "279 Old Canobolas Rd NASHDALE,",
    lat: -33.318159,
    lng: 148.982659,
    order_index: 18,
    description: "RIKARD Wines produce small batches of ultra-premium, complex wines, hand crafted using traditional methods with minimal intervention.\nWe love Pinot Noir, Chardonnay and Riesling, making iconic wines that reflect the unique terroir   of the Orange region.\nWine tastings are hosted by the team that make the wines, in the place we make them - at our winery, one of the highest altitude sites in the Orange region, reflecting our sense of place and purpose.",
    offer_summary: null,
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/f135846b-a516-4654-b327-11c8e21019de/logo/0bbc5dee-20b7-4853-9c3a-5c6ed487b327.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/f135846b-a516-4654-b327-11c8e21019de/cover/435c2e90-9d76-4c4c-b2b5-a46dc36b3944.jpg",
    website_url: "https://www.rikardwines.com.au",
    phone: "0481 871 683",
  },
  {
    venue_id: "demo-ross-hill-wines",
    name: "Ross Hill Wines",
    address: "134 Wallace Ln, Orange NSW 2800",
    lat: -33.332937,
    lng: 149.043637,
    order_index: 19,
    description: "Family owned and operated, Ross Hill Wines is known for award-winning cool-climate wines, genuine hospitality and a longstanding commitment to sustainability. As Australia’s first winery certified carbon neutral across its full production process, care for the land is at the heart of what they do. Visit the cellar door for guided wine tastings, limited-release wines and daily behind-the-scenes winery tours, all delivered with the relaxed, welcoming spirit Ross Hill is known for.",
    offer_summary: "10% discount on tasting fees if you call and book direct 02 6365 3223",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/94837d7c-8f49-4a8a-82da-ee67c26cfb0e/logo/17ff62ca-3f3e-4a8e-9e23-25f9993c61f4.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/94837d7c-8f49-4a8a-82da-ee67c26cfb0e/cover/e6ba6d93-6336-419d-ac46-cae0bdcb475d.jpg",
    website_url: "https://www.rosshillwines.com.au",
    phone: "02 6365 3223",
  },
  {
    venue_id: "demo-see-saw-wine",
    name: "See Saw Wine",
    address: "42 Lake Canobolas Rd, Nashdale NSW 2800",
    lat: -33.299077,
    lng: 149.019011,
    order_index: 20,
    description: "See Saw Wine is a family-owned business that has been producing cool-climate wines from our three vineyards for the past three decades. We're certified organic, home to the best Prosecco in NSW, and sustainability sits at the heart of everything we do - alongside having a lot of fun along the way. \nSee Saw is the ultimate expression of finding joy and balance in all parts of life. Open 7 days for wine tastings and sales, we're pet-friendly, and wine by the glass is available to enjoy on our lawn.",
    offer_summary: "Book online for a tasting and receive a free SAMM Spritz",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/d5eee2c3-ba1f-4643-be90-a220bbc22ebb/logo/0ad049ac-c497-4813-9b89-47e1cf84658b.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/d5eee2c3-ba1f-4643-be90-a220bbc22ebb/cover/bb24ff54-2463-47e2-8fe6-edef1f743ab1.jpg",
    website_url: "https://www.seesawwine.com/",
    phone: "0475 774 296",
  },
  {
    venue_id: "demo-slow-wine-co",
    name: "Slow Wine Co",
    address: "24 Victoria St, Millthorpe NSW 2798",
    lat: -33.44651,
    lng: 149.183473,
    order_index: 21,
    description: "We are a small family owned winery established in 1990. Sitting at 960m, we specialise in cool climate varieties with a focus on Chardonnay, Pinot Noir and crisp aromatics. Our philosophies of small batch selection and hand management in vineyard and winery; use of native yeasts and enzymes; and slow maturation and natural cold stabilisation in the second winter combine to extract every last bit of goodness that our ancient soils can provide.\nOur cellar door is located in the idyllic, historic village of Millthorpe – 15 minutes from Orange. \nTastings are available until 5pm and then we turn into a wine bar on Friday and Saturday nights, serving a tapas style menu.",
    offer_summary: "Take home 6 bottles and save 20%",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/e8e42077-4d91-44cd-9b12-10f259197009/logo/3f095068-66f4-4203-96ce-b23e3eebc4f3.jpg",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/e8e42077-4d91-44cd-9b12-10f259197009/cover/6eea06da-37ed-4ca9-8348-89dfb451cfa4.jpg",
    website_url: "https://www.slowwineco.com.au",
    phone: "0437 409 811",
  },
  {
    venue_id: "demo-stockmans-ridge-wines",
    name: "Stockmans Ridge Wines",
    address: "21 Boree Ln, Lidster NSW 2800",
    lat: -33.293856,
    lng: 148.953907,
    order_index: 22,
    description: "At Stockman’s Ridge, we’re serious about what goes into the bottle, but decidedly relaxed about how you enjoy it. Set among six hectares of vines and established gardens, our cellar door is a place to settle in, explore something different and enjoy wine without the fuss. From Grüner Veltliner and Pinot Noir to Cabernet Franc, Zinfandel and our much-loved dessert Grüner, our wines are grown and made with flavour at the forefront. Come for a tasting, stay for a glass in the gardens, and experience the easy-going side of Orange.",
    offer_summary: "Free vineyard walk, every Saturday at 11:15am.",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/baf06f6e-7de8-4110-b6ea-c6c90091d09b/logo/1564d5a2-5bf5-49b6-b791-f26c21c805a1.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/baf06f6e-7de8-4110-b6ea-c6c90091d09b/cover/f31dce40-22ce-435c-9139-4bcbc3984c4a.png",
    website_url: "https://www.stockmansridge.com.au",
    phone: "02 6365 6212",
  },
  {
    venue_id: "demo-strawhouse-wines",
    name: "Strawhouse Wines",
    address: "116 Boree Lane Orange",
    lat: -33.288811,
    lng: 148.96142,
    order_index: 23,
    description: "Strawhouse is one of the smallest fine wine operators in the Orange Wine Region. The 2hectare dryland vineyard, planted in 1997, is at 800m on the famed basalt soils of the north-facing slopes of Mt. Canobolas on Boree Lane, a pocket of established vineyards.\n\nThe first commercial release was the 2002 Strawhouse Shiraz and over the years Strawhouse has developed a reputation for making small amounts of fine, handcrafted wine from estate grown and locally sourced fruit.",
    offer_summary: "Buy a dozen and enjoy a bonus bottle on us.",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/406f2b2d-9cb1-4ca4-b5b3-6904b2b60a7e/logo/118d60b9-a5ac-4513-9e89-3ede35d8f7a5.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/406f2b2d-9cb1-4ca4-b5b3-6904b2b60a7e/cover/ca9fc6c1-2e8c-4155-98fb-3309cf1c9333.png",
    website_url: "https://www.strawhousewines.com.au",
    phone: "0402 498 419",
  },
  {
    venue_id: "demo-swinging-bridge",
    name: "Swinging Bridge",
    address: "701 The Escort Way, Orange NSW 2800",
    lat: -33.275571,
    lng: 149.032585,
    order_index: 24,
    description: "Chardonnay and Pinot Noir are at the heart of Swinging Bridge. Overlooking Gaanha Bula–Mount Canobolas, our cellar door offers relaxed, hosted wine experiences that take you beyond a simple tasting and deeper into the wines, vineyards and people behind them. Discover our signature Savour experience, pairing our wines with a series of chef prepared canapés, or explore further with our premium Indulge experience. However you choose to taste, expect elegant wines shaped by the elevation, climate and volcanic soils of Orange.",
    offer_summary: null,
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/a18fbe76-75bf-4577-b58a-151a8f810893/logo/8eb40154-42be-4081-8457-d42091842f6c.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/a18fbe76-75bf-4577-b58a-151a8f810893/cover/c55ae873-9724-4395-bd84-b4a703e19a41.jpg",
    website_url: "https://www.swingingbridge.com.au",
    phone: "0447 416 295",
  },
  {
    venue_id: "demo-tamburlaine-organic-wines",
    name: "Tamburlaine Organic Wines",
    address: "9a Pym Street, Millthorpe, NSW, 2798",
    lat: -33.446974,
    lng: 149.184193,
    order_index: 25,
    description: "Tamburlaine was established in 1966. In 1985 the Hunter winery was purchased by a small group of friends and relatives led by Managing Director, Head of Grape and Wine Production, Mark Davidson. Mark has built his long-term winemaking philosophy around Contemporary Organic practices in the vineyard and the winery. Through years of research and development, we have become one of Australia’s largest producers of organic wines with vineyards in the Hunter Valley and Orange region. \n\nNamed after Christopher Marlowe's famous play and character ‘Tamburlaine the Great’, we work to lead the way with our Contemporary Organics vision, successfully producing award-winning organic, vegan-friendly, low sulphur and no added sulphur wines.",
    offer_summary: "Buy one dozen for $20 per bottle or two dozen or more for $18 per bottle from our Wine Lovers range.",
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/66931ef0-b8a0-4657-82d4-a787d97747f7/logo/51aa487b-b20c-41e4-b18f-e0238b6bfd92.jpg",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/66931ef0-b8a0-4657-82d4-a787d97747f7/cover/cfac77fe-33a2-4fbc-b59a-760041dee50c.jpg",
    website_url: "https://www.tamburlaine.com.au",
    phone: "0437 201 577",
  },
  {
    venue_id: "demo-summer-st-wine-room",
    name: "Summer St Wine Room",
    address: "120-122 Summer St, Orange, NSW, Australia",
    lat: -33.283293,
    lng: 149.096151,
    order_index: 26,
    description: "Summer St Wine Room is a wine bar, restaurant, and bottle shop. Offering delicious share plates, an award-winning wine list and memorable hospitality.",
    offer_summary: null,
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/bac74341-1b73-41d4-bb82-18cac26358b0/logo/4b3e26cc-d78d-4e36-97fb-356bdc073205.png",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/bac74341-1b73-41d4-bb82-18cac26358b0/cover/b2dfb354-f761-4c1f-a84d-7825c974bf65.png",
    website_url: "https://www.summerstwineroom.com.au",
    phone: "02 5339 5033",
  },
  {
    venue_id: "demo-the-oriana-orange",
    name: "The Oriana Orange",
    address: "178–184 Woodward Street, Orange, NSW, Australia",
    lat: -33.278467,
    lng: 149.088132,
    order_index: 27,
    description: "Enjoy Orange’s much loved Award Winning Hospitality at The Oriana Orange, a 50-room Summer Retro Resort, including a Pool Club, “La Dolce Vita” Alfresco Summer Restaurant, including Summer Cocktails and a large selection of local Orange wines. \nIndoors there is more great hospitality, in The Peacock Room which offers refined European Italian Dining and the 'uber chic' Bela Vista Bar.",
    offer_summary: null,
    points_value: 10,
    logo_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/0f1cc3a4-5559-4fca-9128-19f20394eb85/logo/c7f839ec-5813-4a29-bbbf-912f39baa88b.jpg",
    cover_path: "c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/venues/0f1cc3a4-5559-4fca-9128-19f20394eb85/cover/bb43f7eb-1067-4590-b063-c0a4adb77116.png",
    website_url: null,
    phone: null,
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
    description: `Exclusive to Orange Wine Quest passport holders at ${v.name}.`,
    redemption_instructions:
      "Show your passport screen and check-in stamp at the cellar door to redeem.",
  }),
);

export type DemoAward = {
  award_id: string;
  title: string;
  description: string;
  points_required: number;
  image_url: string | null;
  draw_date: string | null;
};

export const DEMO_AWARDS: DemoAward[] = [
  {
    award_id: "demo-award-1",
    title: "2x Mixed Cases of Orange Region Wine",
    description: "Take home a 12-bottle mixed case showcasing wines from across the Orange Wine Region, with two lucky winners each receiving a case valued at approximately $480. A brilliant collection of cool-climate wines to discover, share and enjoy.",
    points_required: 120,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/c162139f-0fa4-41db-a813-627d666c0690.png",
    draw_date: "2026-10-27",
  },
  {
    award_id: "demo-award-2",
    title: "Two-Night Vineyard Escape at Stockman's Ridge",
    description: "Enjoy a two-night stay among the vines at the Swagman Homestead at Stockman's Ridge Wines with a bottle of wine waiting on arrival.",
    points_required: 115,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/00aae465-3639-464a-8350-e098a2408c72.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-3",
    title: "Private Winemaker Experience for Up to 10",
    description: "Go behind the scenes at Orange Mountain Estate with owner and winemaker Terry Dolle for a private winery experience for up to 10 people. Explore traditional winemaking firsthand, taste wines straight from French oak barrels and discover the journey from vineyard to bottle, finishing with Orange Mountain Estate wines as the sun sets over the vineyard. Valued at $500.",
    points_required: 110,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/37b0d73b-74ad-4c4b-b925-ccff756c03f0.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-4",
    title: "Angullong Mixed Wine Case + Tasting for Four",
    description: "Take home a mixed dozen of Angullong wines valued at $360, plus enjoy a complimentary wine tasting for four at their cellar door in historic Millthorpe.",
    points_required: 100,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/a013cb53-9aff-4f3b-a469-f7b1d1561471.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-5",
    title: "Dozen of Cargo Road 2017 Zinfandel",
    description: "Take home a full dozen bottles of Cargo Road Wines’ 2017 Zinfandel - a beautifully aged cool-climate red from one of Orange’s oldest vineyards. Twelve bottles to cellar, share or enjoy over many good dinners.",
    points_required: 95,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/7ffbfc40-10d7-45b2-849a-a8eb531f7033.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-6",
    title: "$200 Dining Experience at The Oriana Orange",
    description: "Enjoy a $200 dining voucher at The Oriana Orange and settle in for an indulgent dining experience. With beautifully prepared food and an elegant setting, it’s the perfect excuse for a long lunch, dinner for two or a special night out in Orange.",
    points_required: 90,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/fd596abe-8bd3-422d-b950-001b4428515b.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-6",
    title: "Printhie Sparkling & Oyster Experience for Two",
    description: "Indulge in one of Orange’s most delicious pairings with a Sparkling Wine & Oyster Experience for two at Printhie Wines. Enjoy premium Printhie sparkling alongside freshly shucked oysters in a beautiful cool-climate setting.\n\nValued at $160.",
    points_required: 90,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/2cc57de2-a513-4ab2-a674-4aa31b719134.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-6",
    title: "Tapas Dinner for Two at Slow Wine Co",
    description: "Settle in for an evening in historic Millthorpe with a tapas dinner for two at Slow Wine Co. Enjoy delicious share-style food and the relaxed atmosphere of their cellar door and wine bar.",
    points_required: 90,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/ac70a46b-82ad-4177-95b7-c43671428355.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-7",
    title: "Summer St Wine Room - Experience for Two",
    description: "Settle in at Summer St Wine Room and let the team do the choosing with their popular ‘Let Us Feed You’ set menu for two. A relaxed dining experience showcasing a selection of dishes designed to be enjoyed together. Valued at $150.",
    points_required: 90,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/ef991f6a-1235-4228-bc53-ab42ab1aa119.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-8",
    title: "6 Bottles of Colmar Estate 2022 Pinot Shiraz",
    description: "Take home six bottles of Colmar Estate’s 2022 Pinot Shiraz, a cool-climate blend from one of Orange’s highest vineyards. A generous prize for the cellar - or to share with friends.",
    points_required: 85,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/299c0d11-f111-44a9-810e-107ab65cb5de.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-8",
    title: "Private Dindima Wine Experience for Six",
    description: "Gather your favourite people for a private Dindima wine experience for six. Explore the vineyard and winery on a guided tour, then settle in for a private wine tasting accompanied by a charcuterie board to share.",
    points_required: 80,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/cc296a7c-7d2e-436c-aca9-9c5ec032d587.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-9",
    title: "Macquariedale Wine Tasting & Grazing Board for Four",
    description: "Gather three friends and enjoy a relaxed tasting for four at Macquariedale Organic Wines, accompanied by their stunning grazing platter.",
    points_required: 75,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/36b3ce8a-d5e0-4781-bb10-c717a653aa00.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-10",
    title: "2 Tickets to Mortimers Wine School",
    description: "Go beyond the tasting with two tickets to Mortimers’ signature Wine School. Enjoy a guided, educational wine experience designed to deepen your knowledge and appreciation of wine, held during Orange F.O.O.D Week and Wine Festival.",
    points_required: 70,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/e71c16df-0c58-4e59-ae66-9c1e3c4206d4.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-11",
    title: "3L Jeroboam of Highland Heritage Shiraz Cabernet",
    description: "Enjoy a 3L Jeraboam of Highland Heritage Shiraz | Cabernet Sauvignon Blend",
    points_required: 65,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/e7a637a0-67b3-4c19-9bd2-79dc0112803b.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-12",
    title: "Heifer Station Premium Paddocks Collection",
    description: "Take home a three-bottle collection from Heifer Station’s premium Paddocks range, showcasing three distinctive cool-climate wines grown on the slopes of Mount Canobolas. Valued at $160.",
    points_required: 55,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/1a9d3319-a4b1-4815-b321-8a634f3f06c0.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-13",
    title: "Magnum of Nashdale Lane Legacy Rosé",
    description: "Take home a magnificent magnum of Nashdale Lane’s Legacy Rosé - a special large-format bottle made for sharing, celebrating or saving for the perfect occasion.",
    points_required: 50,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/12b845dd-a610-4424-84a6-ece60c0e7335.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-14",
    title: "Magnum of RIKARD Riesling",
    description: "Take home a magnificent magnum of RIKARD Riesling — a special large-format release from one of Orange’s leading small-batch producers, made for sharing, cellaring or celebrating.",
    points_required: 50,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/90f5ec70-4e15-41e1-8846-8cee47d52032.png",
    draw_date: "2026-10-26",
  },
  {
    award_id: "demo-award-20",
    title: "See Saw Seasonal Tasting for Two + Caps",
    description: "Enjoy a seasonal wine tasting for two at See Saw Wines, exploring their certified organic cool-climate wines, and take home two See Saw caps as a little something to remember your visit.",
    points_required: 45,
    image_url: "https://kyjwifumacnrpgyextzz.supabase.co/storage/v1/object/public/event-assets/c509e63c-78d2-42b9-b132-cbd5a88857f3/129b094c-df0e-4774-8a4c-283680871941/awards/468ffe63-6d55-498e-870a-b8d065ecc09c.png",
    draw_date: "2026-10-26",
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
    bonus_id: "demo-early-bird-bonus",
    name: "Early Bird Bonus",
    points: 10,
    description: "Scan the Code and set up your passport early for bonus starting points!",
  },
];

export const DEMO_ANNOUNCEMENTS: { title: string; body: string }[] = [
  {
    title: "Festival weekend is on",
    body: "Extra cellar doors are open late across the Orange region this Saturday and Sunday.",
  },
];

export const DEMO_FAQ: { question: string; answer: string }[] = [
  {
    question: "How does the passport work?",
    answer:
      "Sign up once, then check in at each cellar door by scanning their QR code. Every stamp earns points toward the prize draws.",
  },
  {
    question: "Do I need to visit every cellar door?",
    answer:
      "No — but the more stamps you collect, the more prizes you unlock and the better your draw odds.",
  },
  {
    question: "How long does the quest run?",
    answer: "From 16 to 26 October 2026. Prizes are drawn from 26 October.",
  },
  {
    question: "Is this the real event?",
    answer:
      "This is a guided demo of the Orange Wine Quest passport. Nothing you do here affects the live event.",
  },
];

// ---------- sample activity (static, for demo realism) ---------------------

export type DemoActivityItem = {
  first_name: string;
  venue_name: string;
  minutes_ago: number;
};

export const DEMO_ACTIVITY: DemoActivityItem[] = [
  { first_name: "Sarah M.", venue_name: "Printhie Wines", minutes_ago: 4 },
  { first_name: "James T.", venue_name: "Ross Hill Wines", minutes_ago: 12 },
  { first_name: "Priya K.", venue_name: "Colmar Estate", minutes_ago: 26 },
  { first_name: "Dan & Ellie", venue_name: "Nashdale Lane Wines", minutes_ago: 48 },
  { first_name: "Marcus L.", venue_name: "Philip Shaw Wines", minutes_ago: 95 },
];

export const DEMO_EXPLORERS_TODAY = 38;

export type DemoLeaderboardRow = {
  rank: number;
  display_name: string;
  points: number;
  stamps: number;
};

export const DEMO_LEADERBOARD: DemoLeaderboardRow[] = [
  { rank: 1, display_name: "Sarah M.", points: 130, stamps: 12 },
  { rank: 2, display_name: "James T.", points: 120, stamps: 11 },
  { rank: 3, display_name: "Priya K.", points: 100, stamps: 9 },
  { rank: 4, display_name: "Marcus L.", points: 90, stamps: 8 },
  { rank: 5, display_name: "Dan & Ellie", points: 80, stamps: 8 },
  { rank: 6, display_name: "Amelia R.", points: 70, stamps: 7 },
  { rank: 7, display_name: "Tom H.", points: 60, stamps: 6 },
  { rank: 8, display_name: "Grace W.", points: 50, stamps: 5 },
];

// ---------- fake in-memory passport (localStorage-backed) ------------------

const STORAGE_KEY = "demo-orange-wine-quest-passport-v1";

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
  const stampPoints = state.stampedVenueIds.reduce((sum, id) => {
    const v = DEMO_VENUES.find((x) => x.venue_id === id);
    return sum + (v?.points_value ?? 10);
  }, 0);
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
