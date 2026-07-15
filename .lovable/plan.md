## What I checked

- **Resend connector**: connected, gateway working. A test send from `passports@getstampd.com.au` to `delivered@resend.dev` just returned HTTP 200 with a real message id — so the from-address is verified and the API key is authorised to send.
- **Server logs**: no `passport-email` logs in the last hour on either the published or preview deployment. That means the `sendPassportEmail` server function was **never actually called** for the signup you tested.
- **Wiring**: `src/routes/live.$subdomain.join.tsx` line 437 does call `sendPassportEmail(...)` after `register_visitor` succeeds, and the connector + code are correct.

## Most likely cause

The Share button + passport-email code has not been **published** yet. Server functions in TanStack Start are part of the app bundle — they only go live on `getstampd.com.au` and event subdomains after you click **Publish → Update**. If the signup you tested was on the live site (a `*.getstampd.com.au` subdomain), it hit the old bundle that has no `sendPassportEmail` call, which explains: no email + no server logs.

If you tested on the preview URL and still got nothing, that's a different problem — but there'd be a log line, and there isn't one.

## Plan

1. **Publish the app** (you click Update in the Publish dialog). That's the single action most likely to fix this.
2. After publishing, do one test signup on the live subdomain, then I'll pull the `passport-email` server logs to confirm the send happened and Resend accepted it.
3. If, after publishing, the logs show a failure (e.g. Resend 4xx, missing key, RPC lookup miss), I'll fix the specific error — most likely candidates are:
   - Email landed in the recipient's **spam/junk** (very common on first sends from a new domain — worth checking before anything else).
   - The `get_passport_by_token` RPC didn't return an `email` for the row (would need a small tweak to the lookup).
4. Add a tiny bit of extra observability so the next diagnosis is one step, not three:
   - Log the recipient domain (not the full address) and the Resend message id on success.
   - Log the exact Resend error body on failure (already logged, but include the `to` domain for context).

No user-facing changes in this plan — just publish + verify + minor log polish. If you'd rather I also surface a subtle "email sent to you@…" line on the success screen (using the actual address the user typed) so it's obvious when the send worked, say the word and I'll add it.

## Ask

Can you confirm:
- Did you test on the **published** site (a `*.getstampd.com.au` subdomain) or the **preview** URL?
- Have you checked the recipient's **spam folder**?
