# Security Model — Event Passport SaaS

## Trust Boundary

- The frontend is public and must not be trusted.
- All security-critical validation must happen server-side.

## Key Principles

1. **No service role keys in frontend code**
   - Service role keys bypass all RLS and must never be exposed to the browser.

2. **Role-based admin access**
   - Admin access must be role-based, not a simple boolean flag.
   - Agency users must never access another agency's data.

3. **Visitor data isolation**
   - Public visitors must never access admin data.
   - Visitor passport access must be tokenised or authenticated.

4. **QR check-in security**
   - QR check-ins must be processed server-side.
   - QR codes must use random non-guessable tokens, not simple venue IDs.

5. **Export safety**
   - CSV exports must be scoped to one event.
   - CSV exports must be audit logged.

6. **Defence in depth**
   - All sensitive operations must be protected by Supabase RLS, secure RPCs, or server functions.
   - Never rely on client-side checks alone for access control.

## Threats We Protect Against

- Cross-tenant data leakage (agency A seeing agency B's events/visitors)
- Visitor spoofing (faking check-ins or passport progress)
- Admin privilege escalation
- Data exfiltration via unscoped exports
- Guessable QR tokens allowing unauthorised check-ins
