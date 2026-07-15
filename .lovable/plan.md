## 1. Share button on the public event page

**File:** `src/routes/live.$subdomain.index.tsx`

Add a **Share** button in the hero/CTA area (next to the existing "Join" / "View prizes" buttons — same visual weight as an outline button).

Behaviour (client-side only, no backend):

```ts
async function shareEvent() {
  const url = `https://${subdomain}.getstampd.com.au`;
  const subject = `Come join me at ${event.name}`;
  const text = `Come join me at ${event.name} on GetStampd — ${url}`;
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: subject, text, url });
      return;
    } catch (err) {
      // AbortError = user dismissed the share sheet; fall through only on real failure
      if ((err as DOMException)?.name === "AbortError") return;
    }
  }
  // Fallback: open the device's email composer
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text}`)}`;
  window.location.href = mailto;
}
```

Notes:
- Button copy: **Share**, with a small share icon (unicode arrow or an inline SVG — no new deps).
- Rendered only when event is live (same condition already used to render the join CTA).
- No analytics, no backend call.

## 2. Passport-link email on signup (via Resend)

**Setup (one-time, before build):**
1. Add the **Resend** connector (App connector, gateway-backed). This exposes `RESEND_API_KEY` and `LOVABLE_API_KEY` to server functions automatically.
2. User verifies `getstampd.com.au` (or a subdomain like `mail.getstampd.com.au`) in the Resend dashboard so the "from" address can be `passports@getstampd.com.au`.

**New server function:** `src/lib/passport-email.functions.ts`

Signature (unauthenticated — visitors are anonymous):
```ts
sendPassportEmail({ token: string })
```

Handler flow:
1. Load `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` inside the handler (admin client via `await import("@/integrations/supabase/client.server")`).
2. Call the existing `get_passport_by_token(_access_token: token)` RPC to resolve:
   - visitor `email`, `first_name`
   - event `id`, `name`, `public_slug`, `subdomain`
3. If not found → return `{ sent: false }` silently (don't leak whether token exists).
4. Build the passport URL: `https://<subdomain>.getstampd.com.au/passport/<token>` (fall back to `https://getstampd.com.au/passport/<token>` if no subdomain).
5. POST to `https://connector-gateway.lovable.dev/resend/emails` with headers `Authorization: Bearer ${LOVABLE_API_KEY}` + `X-Connection-Api-Key: ${RESEND_API_KEY}`, body:
   ```json
   {
     "from": "GetStampd <passports@getstampd.com.au>",
     "to": ["<visitor email>"],
     "subject": "Your passport for <Event Name>",
     "html": "<simple branded template with a big 'Open my passport' button linking to the passport URL, plus the raw URL as fallback text>"
   }
   ```
6. Check `response.ok`; on non-OK, log status + body server-side and return `{ sent: false, error: "…" }` (do NOT throw — the passport was already created successfully, email is best-effort).

Email HTML: plain inline-styled template — GetStampd wordmark at top, "Hi <first_name>," greeting, one paragraph ("Here's the link to your passport for <Event Name>. Bookmark this email so you can always find your way back."), a prominent CTA button, the raw link below it, and a short footer. No external assets required.

**Call site:** `src/routes/live.$subdomain.join.tsx`

After the `register_visitor` RPC succeeds (line ~440, right before `setSuccess(...)`), fire-and-forget:

```ts
import { useServerFn } from "@tanstack/react-start";
import { sendPassportEmail } from "@/lib/passport-email.functions";
// ...
const sendPassportEmailFn = useServerFn(sendPassportEmail);
// after row is resolved:
void sendPassportEmailFn({ data: { token: row.access_token } }).catch((e) => {
  // silent — success screen still shows the link
  console.warn("passport email failed", e);
});
```

The user still sees the same success screen with the passport link — email is a convenience, not a blocker. If email fails they lose nothing.

**Auth emails stay as-is.** This does not touch Supabase Auth's email flow; it's a one-off transactional send.

## Verification

- Share button appears on the public home when the event is live. On iOS/Android Safari & Chrome it opens the native share sheet; on desktop Chrome/Firefox/Safari it opens the default mail client with subject `Come join me at <Event Name>` and the URL in the body.
- After completing the join form with a real email, the inbox receives an email titled "Your passport for <Event Name>" containing a working link to `/passport/<token>` on the event subdomain.
- Deleting/blocking the Resend key does not break signup — the success screen still shows and the console logs a warning.
- Typecheck passes.
