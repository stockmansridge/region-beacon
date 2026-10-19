import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations-passport-device-tokens/apply.sql", "utf8");

const REDEFINED = [
  "get_passport_by_token",
  "update_marketing_consent",
  "redeem_checkin",
  "claim_bonus_code",
  "claim_venue_tasting_qr",
  "get_passport_stamps_by_token",
  "get_passport_rewards_by_token",
  "get_public_passport_progress",
  "toggle_passport_bookmark",
  "get_passport_bookmarks",
  "update_sms_consent",
  "get_public_event_bonus_challenges",
  "lookup_passport_by_email",
];

describe("multi-device passport migration SQL", () => {
  it("creates a hash-only device token table with RLS and no anon access", () => {
    expect(sql).toContain("create table if not exists public.passport_device_tokens");
    expect(sql).toContain("token_hash bytea not null");
    expect(sql).toContain("alter table public.passport_device_tokens enable row level security");
    expect(sql).toContain("revoke all on public.passport_device_tokens from anon, authenticated");
    expect(sql).not.toMatch(/grant (select|insert|update|delete) on public\.passport_device_tokens to (anon|authenticated)/i);
  });

  it("provides a central resolver accepting the original key or a device token", () => {
    expect(sql).toContain("create or replace function public.resolve_passport_id_by_token(_raw text)");
    expect(sql).toContain("where p.access_token_hash = extensions.digest(_raw, 'sha256')");
    expect(sql).toContain("where d.token_hash = extensions.digest(_raw, 'sha256')");
  });

  it("email login mints a device token and never rotates the original passport key", () => {
    expect(sql).toContain("insert into public.passport_device_tokens (passport_id, event_id, token_hash)");
    expect(sql).not.toMatch(/update public\.passports\s+set access_token_hash/i);
    // Same signature and rate limit preserved.
    expect(sql).toContain("public.lookup_passport_by_email(_event_id uuid, _email citext)");
    expect(sql).toContain("interval '1 hour') >= 10");
    // Aliases bounded.
    expect(sql).toMatch(/order by created_at desc\s+limit 10/);
  });

  it.each(REDEFINED)("redefines %s with the central resolver", (fn) => {
    expect(sql).toMatch(new RegExp(`create or replace function public\\.${fn}\\(`));
  });

  it("no redefined function compares access_token_hash directly anymore", () => {
    // The only allowed direct access_token_hash comparison is inside the resolver.
    const matches = sql.match(/access_token_hash = extensions\.digest/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("keeps event scoping in the event-scoped lookups", () => {
    expect(sql).toContain("where p.event_id = p_event_id\n    and p.id = public.resolve_passport_id_by_token(p_passport_token)");
    expect(sql).toContain("where pp.event_id = r.event_id\n      and pp.id = public.resolve_passport_id_by_token(_passport_token)");
  });

  it("is additive: drops no tables, data, or existing objects", () => {
    expect(sql).not.toMatch(/drop table /i);
    expect(sql).not.toMatch(/drop function /i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/delete from public\.passports\b/i);
  });
});
