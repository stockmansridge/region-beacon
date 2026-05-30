# Event-local Terms & Privacy pages

Draft only. No SQL has been executed. Nothing in `src/` has been wired yet.

## Schema inspection result

**`public.event_terms_versions`** (defined in `migrations-draft/11_event_terms_versions.sql`)
- Has: `terms_version`, `terms_url` (NOT NULL), `privacy_version`,
  `privacy_url` (NOT NULL), `effective_at`, `published_by`.
- Immutable: `deny_all` RLS plus tenant-scoped composite FK to
  `events.current_terms_version_id`. Append-only by design — historical rows
  must remain intact because `visitor_consents.terms_version_id` references
  them.
- **No text-body fields today.** Local Terms/Privacy pages cannot be
  rendered without additive columns.

**`public.events.current_terms_version_id`** — composite FK
`(agency_id, id, current_terms_version_id)` → event_terms_versions.
Unchanged by this draft.

**`public.visitor_consents`** (migrations-draft/17) — records
`terms_version_id` per registration. **Unchanged.** Consent ledger keeps
pointing at whichever immutable version was current when the visitor
registered.

**`public.register_visitor`** (migrations-draft/33 + the publishing-gate
patch in migrations-draft-visitor-registration/01) — enforces
`_accepted_terms_version_id = events.current_terms_version_id`.
**Unchanged.** It does not care whether the version is external_url or
local_text; both are valid current versions.

**`public.get_public_event_by_domain`**
(migrations-draft-venue-labels-public-rpc/01) — already exposes
`terms_url` (from `event_branding`) and `current_terms_version_id`. **Does
NOT expose `privacy_url`, local titles, or local bodies.** A new RPC is
needed for the public legal pages.

**Admin UI** — `src/components/event-terms-dialog.tsx` only accepts
external HTTPS URLs and creates a new immutable `event_terms_versions` row,
then sets `events.current_terms_version_id`. No mode switch yet.

**Public join** — `src/routes/live.$subdomain.join.tsx` links the consent
checkbox to `event.terms_url` (single combined link). No separate privacy
link, no fallback for missing URL.

## Draft migration files

```
supabase/migrations-draft-event-local-legal-pages/
  01_event_terms_versions_local_text.sql
  02_get_public_event_legal_by_domain.sql
  03_verify.sql
  README.md
```

### Proposed fields

On `public.event_terms_versions` (all additive, all default-NULL):

| Column          | Type   | Notes                                                  |
|-----------------|--------|--------------------------------------------------------|
| `legal_source`  | text   | `'external_url'` (default) or `'local_text'`. Per-row. |
| `terms_title`   | text   | optional, max 120 chars                                |
| `terms_body`    | text   | required when `legal_source='local_text'`, max 20000   |
| `privacy_title` | text   | optional, max 120 chars                                |
| `privacy_body`  | text   | required when `legal_source='local_text'`, max 20000   |

URL columns relaxed to NULLable, gated by a row-level CHECK:
- `external_url` rows → both URLs required (matches legacy behaviour)
- `local_text` rows → both bodies required, URLs optional

On `public.events`:

| Column          | Type   | Notes                                            |
|-----------------|--------|--------------------------------------------------|
| `legal_source`  | text   | event-level switch, default `'external_url'`     |

Existing rows: untouched. They keep their `terms_url`/`privacy_url` and
`legal_source` defaults to `'external_url'`. No migration of data.

### Public RPC

`public.get_public_event_legal_by_domain(_hostname text)` —
`SECURITY DEFINER`, `search_path = public`, granted to `anon, authenticated`.
Returns only:
`event_id, event_name, legal_source, terms_title, terms_body, terms_url,
privacy_title, privacy_body, privacy_url, terms_version, privacy_version,
effective_at`.

No visitor, QR, billing, or admin fields. Resolves via existing
`resolve_event_by_host` so the publishing/billing gate is honoured. Zero
rows for unknown hosts / unpublishable events.

### RLS / grants

- `event_terms_versions` RLS unchanged (`deny_all` restrictive); writes
  continue through the existing admin-scoped policies in `migrations-draft/26`.
- Column additions inherit the existing table grants — no new `GRANT`
  statements needed for the table itself.
- New RPC needs the listed `GRANT EXECUTE` only.

## Public routes (planned, not yet implemented)

- `src/routes/live.$subdomain.terms.tsx`
- `src/routes/live.$subdomain.privacy.tsx`

Both call `get_public_event_legal_by_domain`. Render:
- If `legal_source = 'local_text'` and body exists → render local title/body
  (newline paragraphs + `## ` subheadings, no raw HTML).
- Else if matching URL exists → render a clear notice with a link out
  ("Opens the organiser's external page").
- Else → "Legal pages not yet configured for this event."
- Each page renders only when `resolve_event_by_host` returns a publishable
  event (same gate as the rest of `/live/$subdomain`).

## Admin UI (planned, not yet implemented)

Extend `src/components/event-terms-dialog.tsx` (or replace with a tabbed
panel) to add a "Source" radio:

1. **Use GetStampd local pages** (`local_text`)
   - Title + body for Terms
   - Title + body for Privacy
   - "Load default templates" button populates the four fields from
     `src/lib/legal-defaults.ts` with `{{EVENT_NAME}}` substituted
   - Disclaimer banner: *"Default wording is a starting point only. Review
     with your legal adviser before publishing."*
2. **Use external URLs** (`external_url`) — existing flow.

On save (either mode):
- INSERT a new `event_terms_versions` row with the chosen `legal_source`
  and populated columns.
- UPDATE `events.current_terms_version_id` to the new row.
- UPDATE `events.legal_source` to match (so resolvers / future callers
  don't have to look inside the version row to know the mode).

Role gates: visible+editable for `platform_admin`, `agency_owner`,
`agency_admin`. Read-only for `agency_staff`. (Already enforced by the
existing RLS policies on `event_terms_versions` writes.)

Past versions remain immutable — saving never updates an existing row.

## Join form (planned, not yet implemented)

`src/routes/live.$subdomain.join.tsx` consent checkbox:

- If local legal pages exist → split into two links, "terms" → `/terms`
  and "privacy policy" → `/privacy` (same-origin public routes).
- Else if external URLs exist → keep current single-link behaviour using
  the external URL(s).
- Else → registration remains blocked (matches today's
  `terms_version_invalid` gate from `register_visitor`).

## Default text approach

`src/lib/legal-defaults.ts` (already created) exports:
- `DEFAULT_TERMS_TITLE` / `DEFAULT_TERMS_BODY`
- `DEFAULT_PRIVACY_TITLE` / `DEFAULT_PRIVACY_BODY`
- `LEGAL_DEFAULT_DISCLAIMER`
- `LEGAL_LIMITS = { titleMax: 120, bodyMax: 20000 }`
- `applyLegalDefaultTokens(text, eventName)` — substitutes
  `{{EVENT_NAME}}`.

Body uses `##` subheadings + double-newline paragraphs. The intended
renderer is plain text + simple heading detection — no Markdown/HTML
parser, no `dangerouslySetInnerHTML`.

Covered topics:
- Terms: event participation, passport/QR use, event-specific
  rewards/prize-draw rules, venue hours variability, no prize guarantee
  without meeting rules, organiser responsibility, GetStampd as platform.
- Privacy: visitor name/email/mobile/postcode (when collected), purposes
  (passport, participation, rewards, optional marketing), marketing opt-in
  is optional, sharing with organiser admins only, no sale of data, support
  contact, retention placeholder, rights.

## Privacy / legal caveats

- Defaults are **not** legal advice and the admin UI surfaces this
  explicitly. Organisers are responsible for review before publishing.
- Body text accepts plain text only — no HTML rendering — so admins
  cannot inject scripts into the public legal pages.
- Public RPC exposes only the safe display columns; no visitor, billing,
  admin, or QR-token fields.
- Existing immutability guarantees are preserved: every save creates a
  new `event_terms_versions` row; old rows referenced by `visitor_consents`
  are never mutated.
- `register_visitor` continues to require the visitor to accept the
  current version, so changes to legal text always require fresh consent.

## Confirmation

- No SQL was executed (drafts only, under `migrations-draft-event-local-legal-pages/`).
- No production changes.
- No service role usage.
- No QR/check-in/storage/RLS behavioural change.
- No edits yet to `event-terms-dialog.tsx`, `live.$subdomain.join.tsx`, or
  any other runtime file.
- Only one runtime file added so far: `src/lib/legal-defaults.ts`
  (pure constants + a tiny token-substitution helper; not imported anywhere
  yet).

Awaiting approval before applying the SQL on staging and implementing
Parts C (admin UI), D (public `/terms` + `/privacy` routes), and E (join
form link rewiring).
