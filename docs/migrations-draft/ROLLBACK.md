# Rollback Notes — V1 Draft Migrations

Target: staging only (`region-beacon-staging`). Never run rollbacks against
production without a separate review.

## Principles

- Migrations are additive. Each migration creates objects; rollback drops
  them in reverse dependency order.
- Operational ledgers (`checkins`, `visitor_consents`, `event_terms_versions`,
  `export_logs`, `audit_logs`) are immutable. Do NOT roll back partial writes
  in those tables — restore from PITR if data damage occurred.
- `event_domains` rollback must be coordinated with DNS: disable hosts in
  Cloudflare first, then drop rows, then drop the table.

## Reverse order

```
34_rpcs_admin
33_rpcs_visitor
32_rpcs_public
31_seed_reserved_subdomains          (DELETE rows; table stays)
30_audit_triggers                    (DROP TRIGGER on each table)
29_policies_ledger                   (DROP POLICY)
28_policies_visitor
27_policies_venue
26_policies_event
25_policies_core
24_helpers                           (DROP FUNCTION)
23_export_logs
22_event_checkin_settings
21_leaderboard_settings
20_prize_rules
19_reward_rules
18_checkins
17_visitor_consents
16_passports
15_visitors
14_venue_offers
13_venue_qr_codes
12_venues
11_event_terms_versions
10_event_branding
09_event_domains
08_events
07_audit_logs
06_agency_members
05_user_roles
04_agencies
03_util                              (DROP FUNCTION updated_at)
02_enums                             (DROP TYPE app_role, agency_role)
01_extensions                        (do NOT drop; shared)
```

## Per-step notes

- **25–29 (Pass B policies):** rolling back these restores the Pass A
  `deny_all` deny-everything policy state — the tables remain locked.
  This is safe: nothing can read or write until policies are reinstalled.
- **24 (helpers):** drop with `CASCADE` only after confirming no policy
  still references them; Pass B rollback should already have removed all
  policy references.
- **18 (checkins) & 17 (visitor_consents):** preserve data before drop.
  Export to CSV via admin RPC first.
- **09 (event_domains):** delete reserved-subdomain seed rows from step 31
  is implicit when the table is dropped, but if only step 31 is rolled
  back, run `DELETE FROM event_domains WHERE domain_type = 'platform_reserved'`.
- **07 (audit_logs):** only drop after step 30 (triggers) is rolled back,
  otherwise INSERTs from triggers will fail.

## Forward re-apply

Re-applying after rollback is safe because every migration uses
`CREATE ... IF NOT EXISTS` where possible and policies are dropped before
re-created in Pass B.
