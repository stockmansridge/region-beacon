# GetStampd Stabilisation Sprint

I'll work through the 8 issues in priority order, investigating root causes before patching. Below is the plan and approach for each.

## 1. Public passport/QR links fail on mobile
**Investigate:**
- `src/routes/passport.$token.tsx` and `src/routes/live.$subdomain.*` loading.
- `HostRouter` rewrite logic for `/passport/:token` on tenant subdomains.
- `get_passport_by_token` RPC: confirm `anon` GRANT/RLS allows lookup without a logged-in session.
- QR poster URL generation (`qr-poster.ts`) — confirm it builds a fully-qualified tenant URL.
- Any `localStorage`/`window` access at module scope that breaks SSR/first paint on mobile.

**Likely fix:** add a `/passport/:token` host-rewrite/passthrough so subdomains resolve, ensure the route's data fetch is anon-safe, and remove any SSR-unsafe top-level browser globals.

## 2. Events dashboard "Public Website Status = NOT LIVE" while published
**Investigate:** `admin.events.index.tsx` and the helper computing status. Should be `published === true AND exists(event_domains where is_primary AND status='active')`. Fix the join/RPC selection so the chip reflects the real live state.

## 3. Awards page "[object Object]" error
**Investigate:** `live.$subdomain.awards.tsx` → `listPublicAwards()` in `src/lib/event-awards.ts`. The catch block stringifies via `String(e)` which yields `[object Object]` for Supabase error objects. Fix by extracting `error.message ?? error.details ?? JSON.stringify(error)`. Also verify the RPC GRANT/RLS allows anon reads of configured awards and that an empty/anonymous passport doesn't surface as a hard error.

## 4. Rewards showing default tiers + Major prize draw
**Investigate:** Public rewards source (likely `passport-rewards.ts` / rewards section component). Remove the hardcoded Bronze/Silver/Gold/Major-prize fallback when an event has configured rewards. Only render configured rows. Hide Major prize draw entirely unless it's a real configured entity.

## 5. Venue detail hero image stretched/cropped
**Fix:** wrap hero in `<AspectRatio ratio={16/9}>` (or 4/3) with `object-cover object-center` so it scales predictably on all viewports.

## 6. Public venue card wasted space
**Fix:** reduce image height on mobile, increase description clamp to ~3 lines, tighten padding. Mobile-first.

## 7. Hardcoded `bg-white`/`text-slate-*`/`text-gray-*` on public passport surfaces
**Fix:** sweep public components (`public-event-nav`, `trail-landing`, `passport.*`, `live.$subdomain.*`, `venue-public-profile-dialog`, etc.) replacing hardcoded colours with `--event-*` tokens (`bg-[var(--event-card-bg)]`, `text-[var(--event-body)]`, `text-[var(--event-muted)]`, `border-[var(--event-border)]`). Verify dark themes are readable.

## 8. Venue QR "Could not save entry value" opaque error
**Investigate:** `venue-tasting-qr-section.tsx` / `event-bonus-codes-section.tsx`. Surface `error.message` + `error.details` in the toast, clear error on success, and verify `entry_value` column update permissions for `authenticated`.

## Deliverables
- Code changes per item.
- Draft SQL migration(s) if RLS/GRANT changes are needed (Awards anon read, entry_value update policy).
- Root-cause + test-steps report at the end (desktop + mobile manual steps).

## Notes
- I'll batch reads aggressively to keep this efficient.
- I won't change admin styling.
- Any SQL needed will be in a `supabase/migrations-draft-*` folder for you to apply.

Shall I proceed?