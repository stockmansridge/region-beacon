# Deployment notes — getstamped.com.au public test

Staging Supabase project is the backend. **No production database changes.**

## DNS records required

Point each host at the Lovable custom-domain target (use the exact values
shown in Lovable → Project → Custom Domain — do not guess A / CNAME values):

| Host                              | Purpose                          |
| --------------------------------- | -------------------------------- |
| `getstamped.com.au`               | Root → Coming Soon page          |
| `www.getstamped.com.au`           | Mirror of root → Coming Soon     |
| `app.getstamped.com.au`           | Admin portal (`/admin`)          |
| `demo.getstamped.com.au`          | Demo trail (`/demo`)             |
| `*.getstamped.com.au` (wildcard)  | Public event sites               |

All five hosts must serve the **same deployed app** — host-aware redirects
happen in `src/components/host-router.tsx` after the app boots.

## Reserved subdomains

`www`, `app`, `demo`, `admin`, `api`, `mail`, `static`, `assets`, `cdn`
are reserved and will NOT be treated as event subdomains.

## QR / mobile compatibility

Existing QR tokens encode `https://{public_subdomain}.getstamped.com.au/checkin/{token}`.
`/checkin/$qrToken` remains a top-level route, so QR scans work on any host
unchanged. Host-router never rewrites `/checkin/*`.

## Backend prerequisite

Apply `supabase/migrations-draft-customer-signup/01_create_customer_agency.sql`
to the **staging** Supabase project before exercising `/signup`. Without it
the form falls back to a "signup not yet enabled" message.

## Smoke test checklist

1. `https://getstamped.com.au/` → Coming Soon, "Admin login" CTA works.
2. `https://www.getstamped.com.au/` → Coming Soon.
3. `https://app.getstamped.com.au/` → redirects to `/admin` → login screen.
4. `https://demo.getstamped.com.au/` → redirects to `/demo`.
5. `https://cargordtrail.getstamped.com.au/` → renders `/live/cargordtrail`.
6. `https://cargordtrail.getstamped.com.au/join`, `/venues`, `/venues/{id}`,
   `/leaderboard`, `/terms`, `/privacy` all render.
7. `https://cargordtrail.getstamped.com.au/checkin/{token}` works on mobile.
8. `/live/cargordtrail` on Lovable preview still works (no host rewrite there).
9. `https://app.getstamped.com.au/signup` → form creates auth user + agency,
   then lands in `/admin`.
10. Platform admin → `/marketing-preview` shows the full marketing site.
    Non-platform-admin → restricted screen.
