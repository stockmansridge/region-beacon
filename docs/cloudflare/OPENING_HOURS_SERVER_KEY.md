# Opening-hours server transport (no deployment performed)

The independent `region-beacon` build already sets `VITE_DEPLOY_TARGET=cloudflare` in CI. Opening-hours refresh uses direct Google Places API (New) on that build, never Lovable credentials. Other builds retain the existing Lovable Google connector gateway. The weekly cron target remains unchanged on Lovable.

## Required Worker secret

After separate approval, open **Cloudflare → Workers & Pages → region-beacon → Settings → Variables and Secrets → Add**. Choose **Secret**, name it **GOOGLE_PLACES_API_KEY**, and enter the dedicated Google server key securely. Do not put it into code, a `VITE_*` variable, a plain-text variable, or chat. Lovable secrets do not populate this independent Worker.

In Google Cloud Console, restrict this key's allowed API to **Places API (New)** only. HTTP referrer restrictions do not work for server requests. Use application restriction **None**, or IP restrictions only if stable outbound IPs have actually been established (do not assume a normal Cloudflare Worker has a fixed egress IP). No Maps JavaScript API or browser key is needed; Apple MapKit is unchanged.

## Verification and release gates

- Existing Worker entry calls `setServerEnvBindings(env)` before handling requests; `readServerEnv` checks these bindings first. Mocked tests verify resolution even without a `process.env` key.
- After approved deployment, GET `https://app.getstampd.com.au/debug/worker-health` and check only `deployTarget: "cloudflare"` and `hasRuntimeGooglePlacesKey: true`. This flag never returns any credential value. Missing/false means the Worker cannot resolve the secret. Absence on old code does not establish whether a secret exists.
- A true presence flag does not validate Google's permissions, billing or the key itself. Do not automatically call Google as a health check.
- After separate approval, manually refresh **only** Orange Wine Quest venue **baf06f6e-7de8-4110-b6ea-c6c90091d09b**. Confirm correct listing, successful stored hours, timestamp and public display. Do not choose by name alone or run the bulk scheduler.
- No SQL, cron target/schedule changes, deployment, DNS changes or paid requests are part of this source correction.