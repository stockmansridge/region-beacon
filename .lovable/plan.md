# Venue opening hours from Google

Automatically pull each venue's opening hours from Google on a schedule (weekly by default), store them, and show them on the public venue page. Visitors never trigger a Google request.

## What you'll get
- **Venue page**: an "Opening hours" block showing the week's hours with today highlighted and an "Open now / Closed" badge (calculated in the browser from the stored hours). Hidden when no hours are known.
- **Admin venue editor**: shows the matched Google place name, last updated time, and buttons to "Refresh from Google" or "Turn off Google hours" for that venue. An option to type hours manually that always wins over Google.
- **Scheduled refresh**: runs once a week overnight (Sydney time), processes a limited batch per run, and skips venues refreshed recently.

## How matching works
1. First time: search Google using the venue name near its GPS location, and save the matched Google place ID only if the result is within ~200 m.
2. After that: look up hours directly by the saved place ID (cheaper, more reliable).
3. No confident match: venue is marked "not found" and left alone until an admin retries.

## Cost and limits
Google Maps is billed per request. With weekly refreshes, cost is roughly one lookup per venue per week. Each run is capped (e.g. 100 venues) and stops if Google refuses requests, recording the reason for admins.

## Setup steps for you
- Connect Google Maps (a connect card will appear; Lovable-managed option needs no key).
- Run one SQL file in the database editor (adds the hours fields and the weekly schedule), as with previous changes.
- Publish so the scheduled task exists on the live site.

## Technical details
- Draft SQL (review-only, user applies): nullable columns on `venues` — `google_place_id`, `google_hours jsonb` (Places `regularOpeningHours` periods + weekday text), `manual_hours jsonb`, `hours_source`, `hours_synced_at`, `hours_sync_status`; a `venue_hours_sync_runs` table holding a lease row (single-flight lock) and last pause reason; pg_cron + pg_net weekly job calling the route below with a shared secret header.
- Extend public venue read RPCs to return effective hours (manual > Google), no place ID exposed needlessly.
- Server route `src/routes/api/public/venue-hours/sync.ts`: verifies a generated secret (`VENUE_HOURS_CRON_SECRET`), acquires lease, selects due venues (`hours_synced_at` older than 6 days, has lat/lng, not opted out), calls gateway `places/v1/places:searchText` (with `locationBias` circle, field mask `places.id,places.displayName,places.location`) then `places/v1/places/{id}` (mask `regularOpeningHours,utcOffsetMinutes`), writes per venue idempotently, halts on 403/repeated 429 with distinct key-restriction messages.
- Admin "Refresh from Google": authenticated server function with agency/event permission check, single venue.
- Pure helper `src/lib/opening-hours.ts` for formatting and open-now calculation (event timezone), with focused tests.
- Note: the self-deployed Cloudflare Worker for getstampd.com.au needs the gateway and cron secrets added as Worker secrets (like MapKit); the schedule should target the URL that has them.
- Record architecture rule in `AGENTS.md`.
