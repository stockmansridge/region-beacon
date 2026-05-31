# GetStampd Beta Launch Checklist

## 1. Current Beta-Ready Features

| Feature | Status | Notes |
|---------|--------|-------|
| Organisation signup and onboarding | Ready | Email confirmation + pending-org signup survives confirmation |
| Admin dashboard | Ready | Event list, organisation switcher, settings access |
| Event creation | Ready | Create, edit, archive, and delete events |
| Public address / subdomain | Ready | `w/<subdomain>.getstampd.com.au` routing |
| Venue creation and public venue pages | Ready | Add venues, public venue detail with CTAs |
| Apple Maps venue location picker | Ready | MapKit-based coordinate + address lookup in admin |
| Public Trail Map | Ready | Filterable map of all event venues |
| Passport creation | Ready | Visitor registration, passport per event |
| My Passport stamp grid | Ready | Stamp grid, progress, shareable link |
| QR generation | Ready | Per-venue QR token generation and rotation |
| QR scanning / check-in | Ready | Camera scan + manual fallback |
| Duplicate scan handling | Ready | "Already stamped" screen with passport link |
| Leaderboard | Ready | Top stamper rankings per event |
| Analytics | Ready | MVP-level event and check-in counts |
| Organisation settings | Ready | Update name, URL name (slug), and branding |
| Event archive / delete | Ready | Soft archive + hard delete with confirmation |
| Launch readiness checklist | Ready | Built into admin Event Detail |

---

## 2. Required Manual Pre-Beta Checks

These must be performed on a real phone and real email inbox before inviting beta testers.

- [ ] **Real phone QR scan** — Print a generated QR and scan it with the device camera (not just the in-app scanner). Confirm it opens the check-in page.
- [ ] **Gmail signup confirmation** — Sign up with a Gmail address. Confirm the confirmation email arrives and the link works.
- [ ] **iCloud / Apple Mail signup confirmation** — Sign up with an iCloud address. Confirm delivery and link work in Apple Mail.
- [ ] **Create event from a fresh organisation owner account** — Sign up as a new user, create an org, create the first event, and verify the admin dashboard loads.
- [ ] **Add venue and generate QR** — Add at least one venue to an event, save it, and generate a QR code.
- [ ] **Publish and open public pages** — Set the event public address, open the subdomain on a phone, and confirm the Trail Map, Venues, and Join pages load.
- [ ] **Check-in and verify passport / leaderboard / analytics** — Complete a full visitor flow: register, scan QR, confirm stamp appears in My Passport, leaderboard updates, and analytics reflect the check-in.

---

## 3. Known Limitations

| Limitation | Impact | ETA / Decision |
|------------|--------|----------------|
| Prize / rewards `entry_value` migration not live yet | Prize-draw feature is not functional | Out of beta scope; will ship post-beta |
| Some analytics are MVP-level | Event counts and check-in totals only; no funnels or retention | Accept for beta; enhance post-beta |
| `/debug/worker-health` is not restricted yet | Internal health endpoint is publicly reachable | Low risk; restrict before GA |
| Real payment / billing flow not active yet | No Stripe/Paddle billing integration | Accept for beta; billing is post-MVP |
| No full staging database by current decision | Beta runs on production DB with real data | Accept; monitor closely |
| MapKit requires Cloudflare Worker secrets to be set | If Worker secrets are missing, map location picker may fail | Verify secrets are set before beta |

---

## 4. Tester Instructions

Send these steps to each beta tester:

1. **Use a fresh email** you have access to (Gmail or iCloud preferred).
2. **Create an organisation** at `/signup` with your business name and a URL name.
3. **Create an event** from the admin dashboard.
4. **Add at least one venue** to the event and set its location.
5. **Generate a QR code** for the venue.
6. **Register as a visitor** by opening the public event link on your phone and tapping "Join Trail" or "Get My Passport".
7. **Scan the QR code** using the "Scan QR" button in your passport.
8. **Report bugs** with the following details:
   - URL where it happened
   - Device and browser (e.g. iPhone 15 / Safari)
   - Screenshot if possible
   - Any error message or copied support details shown on screen

---

## 5. Support Detail Locations

When something goes wrong, the app shows a support-detail card. Here is where those details come from and what they mean:

| Scenario | Where to look | What it means |
|----------|-------------|---------------|
| Passport creation errors | `/join` or `/passport/:token` error card | Usually `qr_invalid`, `no_passport_for_event`, or Supabase insert failure. Copy the support ID and timestamp. |
| Passport not found | `/passport/:token` not-found screen | The token in the URL does not match any passport. May be a stale link or wrong event. |
| Check-in errors | `/checkin/:qrToken` error card | Could be `qr_invalid`, `passport_not_found`, `already_stamped`, or an unhandled server error. |
| Trail Map errors | `/map` blank or error boundary | Usually a MapKit JS load failure or missing venue coordinates. Check console for MapKit errors. |
| QR generation errors | Admin Event Detail → Venues section | If "Generate QR" fails, check the network response for the `generateQrForVenue` server function. |

---

## 6. Go / No-Go Criteria

All of the following must pass for the beta to launch:

- [ ] **Signup works** — New user can sign up, confirm email, and land in admin.
- [ ] **Admin access works** — Organisation owner sees the correct event list and can navigate to settings.
- [ ] **Event publishes** — Event can be saved, public address set, and public pages load.
- [ ] **Public pages load** — Trail Map, Venues, Join, Passport, and Leaderboard all render on mobile.
- [ ] **QR check-in works** — Scanning a valid QR adds a stamp to the visitor's passport.
- [ ] **Passport updates** — My Passport reflects the new stamp and shows the correct progress.
- [ ] **Leaderboard updates** — The leaderboard reflects the new check-in.
- [ ] **Analytics updates** — Admin analytics show the new check-in count.

If any item fails, the beta is **no-go** until the blocker is resolved.

---

*Document version: Beta-1*  
*Last updated: 2026-05-31*
