# Returning visitor sign-in + storage notice

## The problem
A visitor's passport is remembered only in their browser's storage. Private/incognito mode, strict privacy settings, or cleared site data wipe it, so the visitor lands on Join again. Today the only route back is re-registering with the same email, which issues a new passport key and quietly breaks the link on any other device.

## 1. "Already signed up? Log in" option
- On the Join page (both the old and new templates), add a clear "Already registered? Log in" button above the form.
- It opens a simple panel: enter email -> "Email me my passport link".
- We email that visitor their personal passport link for this event. Tapping it opens their existing passport (same stamps and points) and saves it on that browser again.
- We never log someone in from the email alone, because anyone could then type another person's email and take over their passport. The emailed link proves the person owns the address.
- The response always says "If you're registered, we've sent a link", so nobody can use it to check who is registered.
- Basic abuse limit: a few requests per email per hour.
- Also add the same "Log in" link to the passport/scan screens that currently send people to Join.

## 2. Cookies / storage notice
- We cannot force cookies or storage on. Browsers don't allow websites to override a visitor's privacy settings.
- Instead we detect when the browser blocks or won't keep storage (including private mode) and show a short, friendly notice on Join and on the passport page:
  "Your browser isn't saving your passport. Turn off private browsing or allow cookies for this site, or use 'Email me my passport link' to get back in any time."
- After registering, nudge the visitor to bookmark/keep the passport email as a backup.
- Add a line to the event privacy page explaining that the site stores a passport key on the device (essential, not tracking).

## Technical details
- New server function `requestPassportLoginLink({ eventId, email })`: looks up the visitor by (event_id, email) through a new SECURITY DEFINER RPC that returns only whether a passport exists; it must NOT rotate the token.
- Problem: only a hash of the passport key is stored, so the original link can't be re-sent. The RPC will issue a short-lived (e.g. 30 min) one-time login code row, emailed as `/passport/login/<code>`; redeeming it rotates nothing on the existing passport but returns a fresh device token added to a small `passport_device_tokens` style list — OR, simpler, rotates the passport key (logging out other devices). Needs your choice (see question below); default is the one-time code that keeps other devices working.
- This requires a small database migration (new table for login codes + two RPCs), provided as a SQL file to run once in the SQL editor, like previous fixes.
- Email sent through the existing passport email sender (Resend).
- Storage detection: try write/read/remove on localStorage at load; also flag when `navigator.storage.persisted` is unavailable in private mode. Never block registration because of it.
- Saved passport handling keeps existing rules (only cleared on a conclusive zero-row lookup).
- Focused tests: login request never reveals existence, code expiry/single use, event isolation, storage-blocked notice shows.

## Open decision
When a visitor logs in on a new device, should their other devices stay logged in (recommended, slightly more work) or be signed out?
