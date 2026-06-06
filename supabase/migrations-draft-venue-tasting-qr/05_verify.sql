-- Verify tasting QR draft.
select
  exists (select 1 from information_schema.tables
          where table_schema='public' and table_name='venue_tasting_qr_codes')
    as has_codes_table,
  exists (select 1 from information_schema.tables
          where table_schema='public' and table_name='venue_tasting_qr_claims')
    as has_claims_table,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.proname='claim_venue_tasting_qr')
    as has_claim_rpc,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.proname='save_venue_tasting_qr_code')
    as has_save_rpc,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname='public' and p.proname='get_venue_tasting_qr_codes')
    as has_read_rpc;
